# Audit F7 — Pre-deploy Safety Checks (+ Dispatch + WRITE_TOOLS)
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: gate terakhir cegah bad deploy (single-side/bins-floor/max-pos/dup/SOL/exit-liquidity/conviction). Bug di sini = kehilangan SOL. Plus dispatch `executeTool` + hooks + post-success notify/swap wiring. Kontrak `WRITE_TOOLS`/`PROTECTED_TOOLS` rollovers dengan F4 anti-hallucination.
> Cross-ref: F4 (executeTool caller + ONCE_PER_SESSION + execCache dedup), F6 (deploy_position schema HARD RULES + update_config 165-key), F9 (deployPosition dlmm.js rent bug), F8 (close path + CONFIG_MAP apply), F26 (config clamp), F27 (convictionSizing/exitLiquidity experiments).

## Ringkasan eksekutif (5 baris)
1. `executeTool` (executor.js:754-853) entry: strip model-artifact suffix dari `name` (758), lookup `toolMap` (761), unknown → error result; PROTECTED_TOOLS (`WRITE_TOOLS ∪ self_update`, 740-749) → `runSafetyChecks` (770), blok → `{blocked:true, reason}` (773-777); exec `fn(args)` (782); `logAction` + per-tool post-success wiring (notify/close auto-swap/claim auto-swap); catch → `{error, tool}` (848-851) — **TIDAK throw**, kembali ke F4 tool-results push.
2. `runSafetyChecks` (858-1093) 3 cabang: `deploy_position` (860-1066, 13 gate berurut), `swap_token` (1068, no-op pass), `self_update` (1074-1088, `ALLOW_SELF_UPDATE=true` + TTY-only), default pass. Urutan gate deploy PENTING: strategy lock → fresh pool thresholds → convictionSizing mutate `args.amount_y` → bin_step lwll → single-side `amount_x=0` → bins integer/min floor/single-side bins_above=0 → max-pos → dup pool → dup base_mint → amount>0 → amount>=minDeploy → amount<=maxDeploy → SOL balance (DRY_RUN bypass) → exitLiquidityCheck (opt-in, fail-open).
3. **Kontrak mekanis ditegakkan** (anti LLM hallucinasi + prompt bypass): `strategyLock` overide `args.strategy` (867-871, termasuk `curve` lock walau prompt larang); `MIN_SAFE_BINS_BELOW=35` floor multi-layer (916, 947 + config.js + F26); `bins_above=0` hard-req single-side (954-963); `max-pos` + `dup-pool` + `dup-base_mint` pakai `getMyPositions({force:true})` (966); `amount_y` positif > `minDeployAmount()` ≤ `maxDeployAmount` (997-1017); SOL `amount_y + gasReserve + rentReserve` (1023-1035).
4. **Eksperimen gate di safety layer** (fail-open): `convictionSizing` (883-893) mutate `args.amount_y` SEBELU jumla downstream check (CLAUDE.md:138 re-clamp kontrak); `exitLiquidityCheck` (1042-1063) `quoteSellPriceImpact` round-trip cost; opt-in skip di DRY_RUN (1045); probe error → log + allow (fail-open 1060-1062). `marketRegimeGate` bukan di sini — pre-screening (F2:725); ini gate pre-DEPLOY bukan pre-screen.
5. **Post-exec wiring** (794-832): `swap_token` → `notifySwap` (795); `deploy_position` → `notifyDeploy` (797); `close_position` → `notifyClose` + addPoolNote (low-yield) + `swapBaseToSolWithRetry` (auto-swap base→SOL, 810-819) — INI F8 inti; `claim_fees` → auto-swap bila `autoSwapAfterClaim` + token USD≥0.10 (821-831). Semua notify/swap wrap `.catch()` fail-open (tak block return result).

## Progress
- [x] Baca executor.js 1-200 (helpers + validateDeployPoolThresholds)
- [x] Baca 200-540 (toolMap + CONFIG_MAP)
- [x] Baca 540-720 (update_config apply/persist)
- [x] Baca 720-1104 (WRITE_TOOLS + executeTool + runSafetyChecks + summarize)
- [x] Cross-ref F4 (PROTECTED_TOOLS, ONCE_PER_SESSION), F6 (deploy_position schema), F26 (config clamp), F27 (eksperimen)
- [x] Tulis §A-§H
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Satpam gerbang parkir 13 periksa*: sebelum mobil masuk parkir, satpam periksa 13 syarat — STNK valid, SIM sesuai, penumpang sesuai kursi, muatan tak berlebih, ban gak bocor, bensin cukup, remarked tujuan, parkir penuh belum, kendaraan kembar上周 masuk belum, plat sama sudah ada, supir punya saldo tol, kelayakan emission lulus, kalau malam cek lampu. Satu pun ada belom → mobil ditolak masuk. Di bot, ini = `runSafetyChecks` 13 gate berurut sebelum `deploy_position` jalan.
- *Customer service + gudang:* F4 menyuruh `executeTool` ambilkan "kopicemt" dari gudang. F7 = warehouse worker. Baca order → kalau barang protected → lakukan safety inspection dulu → kalau lolos → ambil + bungkus → notify kasir pelanggan. Kalau ada masalah → return "blocked reason" TANPA throw (kasir bisa balas ke pelanggan pakai teks alasan, app tak crash).

**Di bot, ini = `executeTool` dispatch + `runSafetyChecks` 13 gate deploy + post-success wiring notify/swap**: dari `tools/executor.js`. Pintu masuk tiap tool LLM panggil. Pertahan terakhir antara "halusinasi LLM" dan "SOL keluar on-chain".

**Posisi fase ini di alur bot**
F7 = gate eksekusi. F4 (otak LLM) → panggil tool → F7 lihat nama → cari di `toolMap` → kalau protected → safety check 13 gate (deploy) → kalau pass → eksekusi fungsi (F9 deploy / F10 close / F11 positions) → kirim ke chain via F6 bungkus hasilnya → kembalikan teks result ke F4. Lapisan 3 (Mesin). Tanpa F7, tiap halusinasi LLM langsung on-chain → modal bisa hilang dalam 1 menit.

**Langkah kerja F7 — `executeTool(name, args)` (executor.js:754-853)**
1. Strip suffix artifact model lemah (`<|channel|>commentary`) dari `name` → lookup di `toolMap` (203-737, 47 tool).
2. Unknown tool → return `{error: "Unknown tool: ${name}"}` (tak throw → LLM dapat teks error, bisa koreksi diri).
3. Bila tool di `PROTECTED_TOOLS` set (`WRITE_TOOLS` ∪ `self_update`) → jalankan `runSafetyChecks(name, args)`.
4. Bila safety fail → return `{blocked:true, reason}` (tak throw).
5. Eksekusi: `await fn(args)`.
6. Sukses → `logAction` ke decision-log (`F23`) + per-tool post-success wiring (notify/auto-swap, lihat di bawah).
7. Error → catch → return `{error, tool}` (tak throw).

**Langkah kerja `runSafetyChecks` (executor.js:858-1093) — 3 cabang**
- **Cabang `deploy_position` (860-1066) — 13 gate berurut**:
  1. **strategyLock** — kalau locked → hard-overwrite `args.strategy` ke nilai lock (default vs bid_ask/spot).
  2. **pool thresholds** — `validateDeployPoolThresholds` re-fetch pool dari Meteora API + cek ulang TVL/fee/vol/bin_step vs `config.screening` (LLM bisa lihat snapshot lama; kita cek snapshot FRESH).
  3. **convictionSizing** (opt-in) — bila `experiments.convictionSizing=ON` → mutate `args.amount_y` sesuai conviction (low turun, high naik) + re-clamp ke `[deployAmountSol, maxDeployAmount]`.
  4. **bin_step range** — cek `args.bin_step` dalam `[minBinStep, maxBinStep]` (default 80-125).
  5. **single-side** — `amount_x > 0` → reject (single-side SOL deploy harus amount_x=0).
  6. **bins integer + floor** — `bins_below` integer, ≥ `minBinsBelow` (hard floor 35 multi-layer).
  7. **single-side bins_above=0** — `bins_above` integer, harus 0.
  8. **max-pos** — `getMyPositions({force:true})` count ≥ maxPositions → reject.
  9. **dup-pool** — pool_address sama sudah ada di posisi → reject.
  10. **dup-base_mint** — base_mint sama (token sama di pool beda) sudah ada → reject (1 token 1 posisi).
  11. **amount valid** — `amount_y > 0`, ≥ `minDeployAmount()`, ≤ `maxDeployAmount`.
  12. **SOL balance** — `sol >= amount_y + gasReserve + rentReserve` (DRY_RUN bypass).
  13. **exitLiquidityCheck** (opt-in) — `quoteSellPriceImpact` round-trip cost. Bila round-trip loss > limit → reject. Probe error → fail-open allow.

- **Cabang `swap_token` (1068-1072)** — no-op pass (tx sendiri handle DRY_RUN).
- **Cabang `self_update` (1074-1088)** — gate `ALLOW_SELF_UPDATE=true` + `process.stdin.isTTY` (enkripsi deploy ke terminal manual).
- **Default** — pass (tool non-protected tak lewati safety).

**Post-success wiring (794-832)** — tiap tool punya hook:
- `swap_token` → `notifySwap` Telegram.
- `deploy_position` → `notifyDeploy` + priceRange/binStep/baseFee.
- `close_position` → `notifyClose` + `addPoolNote` (bila low-yield) + `swapBaseToSolWithRetry` (auto-swap base→SOL) + `recordPerformance` (F19).
- `claim_fees` → auto-swap ke SOL bila `autoSwapAfterClaim` + token USD ≥ 0.10.

**Output F7**: result object (success/error/blocked) per tool call. Sukses → side-effects on-chain + Telegram notify. Fail → teks alasan ke LLM. Blocked (safety) → teks blocked → LLM tak bisa retry pakai args sama.

**Kalau F7 rusak / diskip**
LLM bebas deploy apa saja: kolam beracun (bundler 90%), bin_step 200 (slippage ekstrem), 10 posisi sekali deploy (modal habis), pool yang sama dobel (modal发音 bocor), amount -1 SOL (negatif exploit). Atau: rent posisi tak cadang → makan `gasReserve` → max-pos bisa gagal (bug ditemukan audit F0, roadmap #5). F7 = dinding utama antara "AI mau apa" dan "yang boleh terjadi on-chain". Tiap gate ada karena pernah jadi vulnerability potensial.

**Istilah yang muncul di fase ini**
- **`executeTool`** — fungsi pintu masuk executor. Dispatch ke `toolMap[name]`. Tak pernah throw (always return result-object).
- **`toolMap`** — map 47 nama → fungsi impl (executor.js:203-737).
- **`WRITE_TOOLS`** — 4 on-chain write: deploy/claim/close/swap (executor.js:740). LLM tak boleh halusinasi panggil.
- **`PROTECTED_TOOLS`** — `WRITE_TOOLS` ∪ `self_update` (740-749). Bila di sini → wajib `runSafetyChecks` sebelum eksekusi.
- **`runSafetyChecks`** — 13 gate berurut untuk deploy, 1 gate untuk self_update. Fail → `{blocked, reason}` (tak throw).
- **single-side deploy** — modal cuman SOL (`amount_x=0`), `bins_above=0` hard-req. Cegah deposit 2 token.
- **`MIN_SAFE_BINS_BELOW=35`** — hard floor bins_below (range modal di bawah harga); enforced 4 lapisan (config.js + safety check).
- **convictionSizing** — eksperimen opt-in: adjust `amount_y` sesuai conviction (±N%, re-clamp ke `[deployAmountSol, maxDeployAmount]`). Fail bila ON, mutasi SEBELUM downstream check.
- **exitLiquidityCheck** — eksperimen opt-in: pre-deploy gate via `quoteSellPriceImpact` (Jupiter quote). Reject bila round-trip cost > limit. Skip DRY_RUN. Fail-open.
- **`validateDeployPoolThresholds`** — re-fetch pool dari Meteora API + cek ulang TVL/fee/vol/bin_step vs config.screening sebelum deploy (snapshot FRESH, bukan LLM cache).
- **strategyLock** — hard-overwrite `args.strategy` ke nilai lock (default/bid_ask/spot). LLM tak bisa bypass.
- **post-success wiring** — hook tiap sukses tool: notifyDeploy/notifyClose/notifySwap + auto-swap base→SOL + recordPerformance. Wrap `.catch()` → fail-open (tak block return result).
- **fail-block (vs fail-open)** — safety gate gagal → reject (protektif). Berkebalikan dengan fail-open eksperimen (yang gagal → lewat default).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| executor.js:48-63 | SENSITIVE_CONFIG_KEYS + redact | 3 apiKey redact di log/notification |
| executor.js:65-91 | numberOrNull + poolDetail* helpers | ekstrak field dari pool obj Meteora API |
| executor.js:93-101 | `fetchFreshPoolDetail` | re-fetch pool dari Meteora Pool Discovery API (safety pre-deploy) |
| executor.js:103-196 | `validateDeployPoolThresholds` | re-verifikasi pool tvl/fee/vol/bin_step vs config.screening sebelum deploy |
| executor.js:198-200 | `registerCronRestarter` | hook index.js utk restart cron saat interval change (F8) |
| executor.js:203-737 | `toolMap` | map 47 tool-name → fn impl (cross-cek F6 selesai) |
| executor.js:300-736 | `update_config` impl | detail F8 |
| executor.js:740-745 | `WRITE_TOOLS` | 4 on-chain write: deploy/claim/close/swap |
| executor.js:746-749 | `PROTECTED_TOOLS` | WRITE_TOOLS + `self_update` (safety gate wajib) |
| executor.js:754-853 | `executeTool` | entry point dipanggil F4:480 |
| executor.js:758 | name normalize | strip `<|channel|>commentary` artifact weak-model |
| executor.js:761-766 | toolMap lookup | unknown → `{error}` return (not throw) |
| executor.js:769-778 | safety gate | PROTECTED_TOOLS → `runSafetyChecks` → blok return |
| executor.js:782 | fn exec | `await fn(args)` |
| executor.js:784 | success detect | `result?.success !== false && !result?.error` |
| executor.js:786-792 | `logAction` | persist ke decision-log (F23) |
| executor.js:794-832 | post-success wiring | notify/auto-swap per tool |
| executor.js:795-796 | notifySwap | swap success notification Telegram |
| executor.js:797-798 | notifyDeploy | deploy success + priceRange/binStep/baseFee |
| executor.js:799-820 | close_position post | notifyClose + addPoolNote low-yield + swapBaseToSolWithRetry (skip bila `args.skip_swap`) |
| executor.js:821-832 | claim_fees post | auto-swap ke SOL bila `autoSwapAfterClaim` + USD≥0.10 |
| executor.js:836-852 | catch | error to LLM result (nont throw) |
| executor.js:858-1093 | `runSafetyChecks` | 4 case (+ default pass) |
| executor.js:860-1066 | `case deploy_position` | 13 gate berurut |
| executor.js:867-871 | gate 1 strategyLock | hard-overwrite args.strategy bila lock != default |
| executor.js:873-875 | gate 2 pool thresholds | `validateDeployPoolThresholds` + entryMarketData merge ke args |
| executor.js:883-894 | gate 3 convictionSizing | eksperimen — mutate args.amount_y/amount_sol |
| executor.js:896-904 | gate 4 bin_step | args.bin_step dalam `[minBinStep, maxBinStep]` |
| executor.js:906-913 | gate 5 single-side | `amount_x > 0` → reject |
| executor.js:914-953 | gate 6 bins integer + floor | bins_below integer ≥ minBinsBelow; downside_pct path bypass |
| executor.js:954-963 | gate 7 single-side bins_above=0 | integer, harus 0 |
| executor.js:919-925 | gate volatility | `args.volatility != null` → finite & > 0 OR refuse (fail-SAFE) |
| executor.js:966-972 | gate 8 max-pos | `getMyPositions({force:true})` count >= maxPos reject |
| executor.js:973-981 | gate 9 dup-pool | alreadyInPool reject |
| executor.js:984-994 | gate 10 dup-base_mint | one position per token reject |
| executor.js:997-1017 | gate 11 amount | y>0; ≥ `minDeployAmount()`; ≤ `maxDeployAmount` |
| executor.js:1019-1035 | gate 12 SOL balance | `sol >= amount_y + gasReserve + rentReserve` (DRY_RUN bypass, 1023) |
| executor.js:1042-1063 | gate 13 exitLiquidity | opt-in `experiments.exitLiquidityCheck`; roundTripLossPct > limit → reject; probe error → fail-open allow |
| executor.js:1068-1072 | case swap_token | no-op pass (tx sendiri handle DRY_RUN) |
| executor.js:1074-1088 | case self_update | `ALLOW_SELF_UPDATE=true` + `process.stdin.isTTY` |
| executor.js:1090-1092 | default | pass |

## §B. Alur `executeTool` hulu→hilir (ASCII)

```
ENTER executeTool(name, args)                                                                   [:754]
  │
  ├─ startTime = Date.now()
  ├─ name = name.replace(/<.*$/, "").trim()  ← strip weak-model artifact                          [:758]
  │
  ├─ fn = toolMap[name]                                                                            [:761]
  ├─ if !fn → log error + return {error:`Unknown tool: ${name}`}                                   [:762-766]
  │
  ├─ if PROTECTED_TOOLS.has(name) → runSafetyChecks(name, args)                                     [:769]
  │     if !pass → log safety_block + return {blocked:true, reason}                                  [:771-777]
  │
  ├─ try:                                                                                            [:781]
  │   ├─ result = await fn(args)                                                                      [:782]
  │   ├─ duration = Date.now() - startTime
  │   ├─ success = result?.success !== false && !result?.error                                        [:784]
  │   ├─ logAction({tool, args, result: summarizeResult(result), duration_ms, success})              [:786-792]
  │   │
  │   ├─ if success:                                                                                  [:794]
  │   │   ├─ name === "swap_token" + result.tx → notifySwap                                          [:795]
  │   │   ├─ name === "deploy_position" → notifyDeploy (pair/amountSol/position/tx/priceRange/binStep) [:797]
  │   │   ├─ name === "close_position":                                                                [:799]
  │   │   │   ├─ notifyClose (pnlUsd = recorded_pnl_usd ?? pnl_usd; recorded_pnl_pct ?? pnl_pct)         [:803]
  │   │   │   ├─ if args.reason lowercase "yield" → addPoolNote low-yield (805-808)                     [:805]
  │   │   │   └─ if !args.skip_swap && result.base_mint:                                                 [:810]
  │   │   │         swapBaseToSolWithRetry(base_mint)  → result.auto_swapped = true / sol_received         [:811-819]
  │   │   │         catch → log executor_warn, success:false
  │   │   └─ name === "claim_fees" + autoSwapAfterClaim + base_mint:                                    [:821]
  │   │         balances = getWalletBalances → token USD ≥ 0.10 → swapToken(base→SOL)                    [:823-828]
  │   │
  │   └─ return result                                                                                [:835]
  │
  └─ catch error:                                                                                     [:836]
        ├─ logAction({tool, args, error: error.message, duration_ms, success:false})                  [:839-845]
        └─ return {error: error.message, tool: name}                                                  [:848-851]
```

## §C. Alur `runSafetyChecks` case `deploy_position` (13 gate berurut)

```
case "deploy_position":                                                                              [:860]
  │
  ├─ GATE 1 strategyLock (867-871):
  │     stratLock = config.strategy.strategyLock ?? "default"
  │     if stratLock !== "default" AND args.strategy !== stratLock:
  │       log override + args.strategy = stratLock
  │     (curve lock MEKANIS ditegakkan walau prompt larang)
  │
  ├─ GATE 2 pool thresholds (873-875):
  │     poolThresholds = validateDeployPoolThresholds(args)
  │       ├─ fetchFreshPoolDetail(pool_address) (F6 Meteora API)
  │       ├─ cek TVL ∈ [minTvl, maxTvl]
  │       ├─ cek feeActiveTvlRatio ≥ minFeeActiveTvlRatio
  │       ├─ cek volatility (max(timeframe, 30m)) > 0 finite  ← fail-SAFE refuse vol unusable
  │       └─ cek bin_step pool actual ∈ [minBinStep, maxBinStep]
  │     if !pass → return {pass:false, reason}
  │     if entryMarketData → Object.assign(args, entryMarketData)  (mutate args utk trackPosition/lessons)
  │
  ├─ GATE 3 🧪 convictionSizing (883-894):
  │     if experiments.convictionSizing:
  │       originalAmt = args.amount_y ?? args.amount_sol ?? 0
  │       adjustedAmt = applyConvictionSizing(originalAmt, args.conviction)
  │       if finite AND !== original:
  │         mutate args.amount_sol (bila non-null) + args.amount_y
  │         log experiment
  │     (factory OFF → applyConvictionSizing returns unchanged)
  │
  ├─ GATE 4 bin_step args (897-904):
  │     if args.bin_step != null AND (args.bin_step < minStep OR > maxStep) → reject
  │     (gate-2 sudah cek via API; ini double utk args LLM-passed)
  │
  ├─ GATE 5 single-side (906-913):
  │     deployAmountY = args.amount_y ?? args.amount_sol
  │     deployAmountX = args.amount_x
  │     if deployAmountX > 0 → reject "single-side SOL only"
  │
  ├─ volatility validation (919-925):
  │     if args.volatility != null AND (!finite OR <= 0) → reject "volatility feed unusable"
  │
  ├─ GATE 6 bins integer + min floor (914, 926-953):
  │     requestedBinsBelow = args.bins_below ?? defaultBinsBelow ?? minBinsBelow
  │     requestedBinsAbove = args.bins_above ?? 0
  │     minBinsBelow = max(MIN_SAFE_BINS_BELOW=35, config.strategy.minBinsBelow)
  │     isSingleSidedSol = deployAmountY > 0 AND deployAmountX <= 0
  │     requestedTotalBins = requestedBinsBelow + requestedBinsAbove
  │     if downside_pct == null AND upside_pct == null:
  │       if NOT (finite + integer + ≥0 + total ≥ minBinsBelow) → reject "tiny range"
  │       if isSingleSidedSol AND downside_pct==null:
  │         if bins_below non-integer OR < minBinsBelow → reject "bins_below minimum"
  │     (downside_pct path bypass integer checks — SDK convert)
  │
  ├─ GATE 7 single-side bins_above=0 (954-963):
  │     if isSingleSidedSol AND upside_pct==null:
  │       if bins_above non-integer OR !== 0 → reject "must use bins_above=0"
  │
  ├─ GATE 8 max-pos (966-972):
  │     positions = await getMyPositions({force:true})
  │     if positions.total_positions >= config.risk.maxPositions → reject
  │
  ├─ GATE 9 dup-pool (973-981):
  │     if positions.positions.some(p.pool === args.pool_address) → reject "duplicate pool"
  │
  ├─ GATE 10 dup-base_mint (984-994):
  │     if args.base_mint AND positions.some(p.base_mint === args.base_mint) → reject "one position per token"
  │
  ├─ GATE 11 amount > 0 + min/max (997-1017):
  │     amountY = args.amount_y ?? args.amount_sol
  │     if amountY <= 0 → reject "positive SOL"
  │     if amountY < minDeployAmount() → reject "below minimum"
  │     if amountY > config.risk.maxDeployAmount → reject "exceeds maximum"
  │
  ├─ GATE 12 SOL balance (1019-1035):
  │     if process.env.DRY_RUN !== "true":
  │       balance = await getWalletBalances()
  │       gasReserve = config.management.gasReserve
  │       rentReserve = max(0, config.management.rentPerPositionSol ?? 0)
  │       minRequired = amountY + gasReserve + rentReserve
  │       if balance.sol < minRequired → reject "Insufficient SOL"
  │     (DRY_RUN bypass — sim tak butuh SOL)
  │
  ├─ GATE 13 🧪 exitLiquidityCheck (1042-1063):
  │     if experiments.exitLiquidityCheck AND args.base_mint AND DRY_RUN !== "true":
  │       maxPct = experiments.exitLiquidityMaxSlippagePct ?? 10
  │       try:
  │         probe = quoteSellPriceImpact({baseMint, solNotional: amountY})
  │         log experiment
  │         if probe.roundTripLossPct > maxPct → reject "too illiquid to exit cleanly"
  │       catch → log "fail-open — allowing deploy"  ← fail-OPEN cegah probe hiccup block deploy
  │     (DRY_RUN skip — read-only API call tetap skip utk konsistensi sim)
  │
  └─ return {pass: true}                                                                              [:1065]
```

## §D. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| F4 runToolCall (agent.js:480) | `executeTool` (executor.js:754) | tiap tool_call | (name, args) | error → {error,tool} return (tanpa throw) |
| F4 ONCE_PER_SESSION gate (agent.js:463) | (pre-executeTool) | tiap call | firedOnce Set | block result {blocked:true} |
| F4 interactive confirm (agent.js:470) | (pre-executeTool) | CHAT_CONFIRM_TOOLS | onConfirmRequired | cancel result |
| executeTool (769) | `runSafetyChecks` (858) | PROTECTED_TOOLS.has(name) | (name, args) | !pass → return {blocked,reason}; mutation args pass-through |
| runSafetyChecks (873) | `validateDeployPoolThresholds` (103) | gate-2 | args.pool_address | fail → reject + reason; entryMarketData merge ke args |
| validateDeployPoolThresholds (106,154) | `fetchFreshPoolDetail` (93) | tvl/fee/volat cek | (poolAddress, timeframe) | API down → reject (fail-SAFE) |
| runSafetyChecks (885) | `applyConvictionSizing` (config.js, F27) | gate-3 opt-in | (amount, conviction) | adjustment finite → mutate args; non-finite → skip |
| runSafetyChecks (966) | `getMyPositions({force:true})` (dlmm.js, F11) | gate-8/9/10 | force=true (no cache) | reject → null |
| runSafetyChecks (1024) | `getWalletBalances` (wallet.js) | gate-12 (DRY_RUN bypass) | none | reject → null |
| runSafetyChecks (1049) | `quoteSellPriceImpact` (wallet.js) | gate-13 opt-in | (baseMint, solNotional) | catch → allow (fail-open) |
| executeTool (797) | `notifyDeploy` (telegram.js, F30) | deploy success | {pair,amountSol,position,tx,priceRange,...} | `.catch(()=>{})` |
| executeTool (803) | `notifyClose` (telegram.js, F30) | close success | {pair,pnlUsd,pnlPct,peakPnlPct,reason,lesson,feesUsd} | `.catch(()=>{})` |
| executeTool (811) | `swapBaseToSolWithRetry` (wallet.js, F8) | close success + !skip_swap + result.base_mint | {base_mint} | `.catch` log executor_warn |
| executeTool (827) | `swapToken` (wallet.js, F8) | claim success + autoSwapAfterClaim + token USD≥0.10 | {input_mint, output_mint:"SOL", amount} | try/catch log |
| executeTool (786) | `logAction` (logger.js, F23) | tiap exec | {tool, args, result, duration_ms, success} | decision-log persist |
| update_config (CONFIG_MAP apply, 622+) | `reloadScreeningThresholds` (config.js, F28) | post-persist | none | re-read config live |
| update_config (715) | `_cronRestarter` (index.js) | interval change | none | restart cron F1 |
| update_config (728) | `addLesson` (lessons.js, F19) | post-apply | "[SELF-TUNED] ..." + tags `["self_tune","config_change"]` | capture lesson |

## §E. Logika kunci per fungsi

### `executeTool(name, args)` (754-853)
- **Apa**: dispatcher utk semua tool + safety + post-success wiring.
- **Kapan**: dipanggil F4 `runToolCall` (agent.js:480).
- **Output**: result object plain (success/error/blocked). Nont throw (tanggung jawab F4 utk push ke messages).
- **Sinkron**: toolMap name-lookup; PROTECTED_TOOLS pre-gate; logAction decision-log; success-detect `success !== false && !error` (contraposit — false/null = success).
- **Fail-mode**: 
  - Unknown tool → `{error:"Unknown tool"}` (765), to LLM.
  - Safety block → `{blocked:true, reason}` (774), to LLM. F4 ONCE_PER_SESSION add firedOnce (mencegah retry deploy berulang).
  - fn throw → `{error: error.message, tool}` (848). Tidak re-throw.
  - notify/swap catch → log warn, tetap return result.
- **Kontrak ditegakkan**: error tangguh jawab LLM putuskan (close retry bila success tak terkunci, deploy lock regardless F4:491). Post-close auto-swap fail-open: resultreturned, gas sudah spent di close; swap bisa retry manual.
- **Bukti**: 754-853.

### `runSafetyChecks` case `deploy_position` (860-1066)
- **Apa**: 13 gate mekanis pre-deploy —chk terakhir sebelum tx on-chain.
- **Kapan**: tiap `deploy_position` call (PROTECTED_TOOLS deploy).
- **Output**: `{pass:true}` atau `{pass:false, reason}`.
- **Sinkron berurut**:
  1. Strategy lock mekanis (867-871) — `curve` lock ditegakkan walau prompt melarang; prompt SOP + kode defense-in-depth.
  2. `validateDeployPoolThresholds` (873) — re-fetch Meteora API live (bukan args LLM) → tvl/fee/vol/binStep vs config.screening. Mutate `args` untuk `entryMarketData` (mcap/tvl/volume/holders — data learn session utk lessons).
  3. convictionSizing (883-893, opt-in `experiments.convictionSizing`) — mutate `args.amount_y/amount_sol` SEBELUM downstream check, sehingga re-clamp kontrak `[deployAmountSol, maxDeployAmount]` validated downstream (CLAUDE.md:138 + F27).
  4. bin_step args range (897-904) — double cek vs gate-2 (LLM bisa spawn value).
  5. single-side `amount_x=0` (906-913) — hard reject amount_x > 0.
  6. bins integer + floor (914, 926-953) — `downside_pct` path bypass integer checks (SDK convert handling); std path wajib integer ≥ MIN_SAFE_BINS_BELOW=35.
  7. single-side bins_above=0 (954-963) — hard reject bins_above !== 0 utk single-side.
  8. max-pos (966-972) — `force:true` no-cache (CLAUDE.md:88 defense-in-depth dengan F2 pre-check).
  9. dup-pool (973-981) — same `pool_address` reject.
  10. dup-base_mint (984-994) — same `base_mint` di pool lain reject (one position per token policy).
  11. amount > 0 + min/max (997-1017) — `minDeployAmount()` (config.js shared floor, F26) + `maxDeployAmount` hard clamp (conviction re-clamp validated sini juga).
  12. SOL balance (1019-1035) — `amount_y + gasReserve + rentReserve`; DRY_RUN bypass (sim tak butuh SOL).
  13. exitLiquidity (1042-1063, opt-in) — `quoteSellPriceImpact` round-trip cost; probe hiccup fail-open.
- **Fail-mode dominan**: fail-SAFE (reject bila ragu) untuk amount/balance/dup/pos-count; fail-OPEN untuk eksperimen probe (volatility unusable fail-SAFE — refuse bila corrupt; exitLiquidity probe error fail-OPEN — allow bila API hiccup).
- **Kontrak kunci ditegakkan**:
  - `strategyLock` hard-override termasuk `curve` (prompt line 137 "Never use curve" defense doubled kode 870).
  - `MIN_SAFE_BINS_BELOW=35` multi-layer (line 916, 947 + config.js clamp F26).
  - Single-side SOL (`amount_x=0` + `bins_above=0`) dual enforcement.
  - `getMyPositions({force:true})` defense anti-TOCTOU max-pos (F2:678 pre-check + sini).
  - Conviction mutate args pre-check sehingga re-clamp validated downstream.
  - Entry market data tracked via args mutation → masuk `trackPosition` F17 → lessons `entry_mcap/entry_tvl/...` F19.
- **Bukti**: 858-1093, 860-1066.

### `validateDeployPoolThresholds(args)` (103-196)
- **Apa**: re-verifikasi pool sudah lolos screening thresholds sebelum deploy.
- **Kapan**: tiap deploy gate-2.
- **Output**: `{pass:true, entryMarketData}` atau `{pass:false, reason}`.
- **Sinkron**: 
  - `fetchFreshPoolDetail` (93) dari Meteora Pool Discovery API utk konfig timeframe (default `config.screening.timeframe || "5m"`).
  - Bila screening timeframe < 30m (5m), re-fetch `volatilityDetail` dari 30m timeframe (150-161) — baca `volatility` dari `max(timeframe, 30m)` (CLAUDE.md:108, 150).
  - Cek TVL ∈ [minTvl, maxTvl] (115-135); fee/active_tvl_ratio ≥ minFeeActiveTvlRatio (137-148); volatility finite > 0 (163-169, fail-SAFE refuse unusable); bin_step ∈ [minBinStep, maxBinStep] (171-185).
  - `entryMarketData` (188-193) utk lessons: `entry_mcap, entry_tvl, entry_volume, entry_holders` (trackPosition F17/F19).
- **Fail-mode**: API down → reject (fail-SAFE utk no-deploy data uncertain).
- **Kontrak**: prompt SOP `minTokenFeesSol` di F5 line 132 ditegakkan di `getTopCandidates` pre-LLM (F14); di sini hanya feeTVL ratio + binStep + tvl + vol yang di-mekanis-cek. `minTokenFeesSol` tak di-re-verify sini (sudah filter di screening). Open-Q #1.
- **Bukti**: 103-196.

### `self_update` gate (1074-1088)
- **Apa**: cegah LLM/cron auto-self-update.
- **Sinkron**: `ALLOW_SELF_UPDATE=true` env + `process.stdin.isTTY=true` (lokal interactive only). Telegram/cron/bot run → isTTY false → reject.
- **Bukti**: 1074-1088, toolMap impl 231-256 (`execSync("git pull") + setTimeout exit 3s`).

## §F. Temuan: race, fail-safe/fail-open, kontrak ditegakkan, gap

### F.1 — Race max-pos TOCTOU defense-in-depth
- F2 `runScreeningCycle` pre-check `_screeningBusy` + posCount (679) ≤ maxPos.
- `agentLoop` berjalan — selama LLM reasoning, posisi bisa close (management bersamaan) → count berubah.
- `runSafetyChecks` gate-8 (966) `getMyPositions({force:true})` re-count fresh — TOCTOU di-mitigasi.
- TAPI: antara gate-8 dan eksekusi `deployPosition` on-chain, ada gap masih — defense-in-depth IS via `runSafetyChecks` + `_screeningBusy`, tapi tak ada txn-level lock (single-thread JS bawaan aman; cross-bot instance bisa race bila wallet shared — UNKNOWN, open-Q).
- Bukti: 966-972, F2:679.

### F.2 — `convictionSizing` mutation timing benar
- Mutate `args.amount_y` di gate-3 (883-893) SEBELUM gate-11 min/max cek (997-1017). Kontrak re-clamp validated downstream. Tepat. TAPI `applyConvictionSizing` sendiri sudah re-clamp ke `[deployAmountSol, maxDeployAmount]` (CLAUDE.md:138 + F27) — jadi `adjustedAmt` tak pernah breach. Defense dua-lapis: (a) config.js re-clamp, (b) gate-11 final validate. Aman.
- Bukti: 883-894, 997-1017, F27 applyConvictionSizing.

### F.3 — Volatility feed corruption fail-SAFE
- gate pre-bins (919-925): `args.volatility != null AND (!finite OR <= 0)` → reject "volatility feed unusable".
- `args.volatility == null` → tak validate (dianggap tak_PROVIDEd). Bila LLM pass null, gate skip. Risk: LLM pass 0 atau NaN → reject. `computeBinsBelow` di F3 juga throw bila vol invalid (1574-1576). Defense dua-lapis.
- TAPI bila LLM pass `volatility=0.0001` (valid finite > 0) walau feed-nya corrupt — tidak ada sanity checkMagnitude. UNKNOWN, open-Q #2.
- Bukti: 919-925, F3:1574-1576.

### F.4 — Rent reserve mekanis baru
- `rentReserve = max(0, config.management.rentPerPositionSol ?? 0)` (1026). Comment 1019-1022 sebut "audit fix" — posisi rent ~0.057 SOL refundable on close, tapi jika reserve tak di-cadangkan, dapat makan gasReserve; Nth position bisa fail mid-fill.
- Factory default `rentPerPositionSol=0` → legacy `amount_y + gasReserve`. User set >0 → reserve masuk calculation.
- Kontrak ditegakkan via eksperien config (CONFIG_MAP line 380). Adaptasi di F26 config.js.
- Bukti: 1019-1035, comment 1019-1022.

### F.5 — exitLiquidityCheck fail-open arah benar
- Probe error → allow (1060-1062). Komentar: "fail-open: a quote hiccup must never block a deploy" (1037-1041).
- TAPI fail-SAFE bila probe valid `roundTripLossPct > maxPct` → reject (1054-1058). Skenario: pool illiquid tapi quote berhasil → reject. Probe API down → skip gate (open). Tepat: API hiccup tak boleh block deploy (pragmatic); confirmed illiquid → tolak (defensive).
- Bukti: 1037-1063.

### F.6 — Single-side `bins_above=0` + `downside_pct` paritas
- gate-6 (926-953) hanya cek integer/floor bila `downside_pct == null AND upside_pct == null` — downside_pct path bypass integer checks.
- gate-7 (954-963) hanya cek `bins_above=0` bila single-side AND `upside_pct == null`.
- Konsekuensi: LLM pass `downside_pct=30` + `bins_above=5` (tanpa upside_pct) → gate-7 reject bins_above !== 0. TAPI bila `upside_pct=20` → gate-7 bypass (assumed dual-side), gate-5 `amount_x>0` reject bila single-side SOL saja. Konsisten triplet: `upside_pct` paths imply dual-side → mesti `amount_x>0` support.
- Bukti: 914, 926-953, 954-963.

### F.7 — `notifyClose` recorded_pnl priority
- `pnlUsd: result.recorded_pnl_usd ?? result.pnl_usd ?? 0` (803). Comment 800-802 F9-light: prefer recorded recompute (matches /report) bila ada; fallback authoritative.
- Sinkron dengan F9 Close/PnL computation (recorded_pnl_usd). Kalau perubahan PnL di recompute setelah close, notifikasi pakai nilai pertama, /report pakai recorded. Kontrak cegah Telegram misleading.
- Bukti: 800-803, F9/F12.

### F.8 — Auto-swap base→SOL post-close in-place
- `swapBaseToSolWithRetry` (810-819) dipanggil SETELAH `notifyClose`. Fail-open: bila swap gagal → log executor_warn, `result.success` tetap true, resultreturned ke LLM. Kontrak: close sukses; swap bisa manual ulang.
- `result.auto_swapped=true` + `result.auto_swap_note="Base token already auto-swapped back to SOL. Do NOT call swap_token again."` (816-818) — anti LLM swap ulang (F4 ONCE_PER_SESSION juga block `swap_token` firedOnce bila already swapped sekali di sesi).
- Bukti: 810-819, F4:245 ONCE_PER_SESSION.

### F.9 — `claim_fees` auto-swap konsistensi
- Auto-swap (821-831) gated `config.management.autoSwapAfterClaim`; baru swap bila `token.usd >= 0.10` — ambang sama dgn prompt "skip dust < $0.10" (F5:47).
- Calls `swapToken` direct (NOT `swapBaseToSolWithRetry`), tanpa retry wrapper. Risk: Jupiter failed → token stuck. Open-Q #3 lebih detail di F8.
- Bukti: 821-831, F5:47.

### F.10 — `self_update` defense ekstra
- `ALLOW_SELF_UPDATE=true` env gate + `process.stdin.isTTY` — Telegram chat / cron / background → reject. Komentar 1078: "disabled by default. Set ALLOW_SELF_UPDATE=true locally if you really want to enable it."
- `self_update` masuk `PROTECTED_TOOLS` (740-749) tapi TIDAK `WRITE_TOOLS` (di-chain write on-chain tx yang lain). `self_update` tak on-chain, tapi destructive kode-level → PROTECTED benar.
- Tool dispatch 231-256: `execSync("git pull") + setTimeout 3s + (PM2 detected OR spawn detached child + process.exit(0))`. Restart shell-aware.
- Bukti: 740-749, 1074-1088, 231-256.

### F.11 — `executeTool` error nont throw = LLM recover
- Catch (836-852) return `{error, tool}` to LLM. LLM dapat error message → adjust strategy atau report gagal.
- Asymetris dengan F4: F4 catch `error.status === 429` sleep 30s (rate-limit provider); executor catch return error result. Dua lapis catch berbeda.
- Bukti: 836-852, F4:514-526.

### F.12 — Weak-model name artifact strip
- `name.replace(/<.*$/, "").trim()` (758). Weak models kadang append `<|channel|>commentary` ke tool name — strip pattern. Defense vs tokenizing artifacts. Comment at 757.
- Bukti: 757-758.

## §G. Glosarium fase

- **WRITE_TOOLS**: Set 4 on-chain write (deploy/claim/close/swap) — wajib safety gate.
- **PROTECTED_TOOLS**: WRITE_TOOLS ∪ `self_update` — safety gate extended.
- **runSafetyChecks**: switch 4 case + default pass; deploy_position 13 gate; swap/self_update/: pass/double-gate.
- **validateDeployPoolThresholds**: re-fetch Meteora Pool Discovery API utk verifikasi pool sudah lolos screening thresholds.
- **strategyLock hard-override**: `config.strategy.strategyLock != "default"` mutasi `args.strategy`; `curve` lock ditegakkan walau prompt melarang.
- **MIN_SAFE_BINS_BELOW=35**: floor multi-layer (config + executor + reloadScreeningThresholds).
- **single-side SOL contract**: `amount_x=0` (gate-5) + `bins_above=0` (gate-7) + amount_y/amount_sol > 0 (gate-11).
- **convictionSizing mutation**: mutasi `args.amount_y` di gate-3 SEBELUM gate-11 min/max, re-clamp validated downstream.
- **exitLiquidityCheck**: opt-in round-trip probe; fail-OPEN bila hiccup, fail-SAFE bila confirmed illiquid.
- **fail-SAFE exit/refuse**: volatility/balance/dup/pos-count → reject (cegah kehilangan SOL).
- **fail-OPEN config experiment**: probe hiccup → allow (cegah API hiccup block flow normal).
- **swapBaseToSolWithRetry**: auto-swap base→SOL post-close, retry wrapper, fail-open log.
- **autoSwapAfterClaim**: opt-in auto-swap post-claim bila `autoSwapAfterClaim=true` + token USD≥0.10.
- **`minDeployAmount()`**: shared floor di config.js — `deployAmountSol` lower bound; gate-11 enforces.
- **rentReserve**: `rentPerPositionSol > 0` adds rent to SOL balance check; factory 0 = legacy.
- **entryMarketData**: pool snapshot fields (mcap/tvl/volume/holders) di-merge ke args di safety, masuk trackPosition→lessons.
- **`force:true` getMyPositions**: max-pos/dup/pool/mint gate pakai fresh count (TOCTOU defense).
- **`_cronRestarter`**: hook index.js restart cron saat `managementIntervalMin`/`screeningIntervalMin`/`pnlPollIntervalSec` berubah via `update_config` (714-718).
- **executeTool error nont-throw**: catch → `{error, tool}` ke LLM, bukan throw ke F4.

## §H. Open-Q (bawa ke F8/F9/F11/F26/F27/F30)

1. **[F14]** `minTokenFeesSol` (F5 prompt 132, F6 schema 339) TIDAK di-verify di `validateDeployPoolThresholds` (103-196). Sudah filter di `getTopCandidates` pre-LLM (F14). Risiko: manual deploy via general chat "deploy 0.5 ke pool X" lewat `deploy_position` — fee_sol tak di-verify sini. Cross-ref F14 screening.js cek fee_sol filter di mana.
2. **[F26]** `args.volatility` sanity magnitude tak cek. LLM pass `0.0001` (valid finite > 0) → lolos gate (919), tapi `computeBinsBelow` akan clamp ke `minBinsBelow` (vol/5 kecil → lo). TAPI `trackPosition` akan track vol 0.0001 → lessons record corrupt data. Cross-ref F26/F27.
3. **[F8]** `claim_fees` auto-swap pakai `swapToken` direct (827) bukan `swapBaseToSolWithRetry`. Bila Jupiter gagal → token stuck. Beda dengan close path yang pakai retry wrapper. Konsistensi?
4. **[F11]** `getMyPositions({force:true})` di gate-8/9/10 (966) — return shape digunakan `positions.positions` dan `positions.total_positions`. Apakah `getMyPositions` di dlmm.js F11 return field identik walau dipanggil dari executor? Cross-ref F11.
5. **[F27]** `convictionSizingMaxAdjustPct` — bila set 60 (>30 default), re-clamp kontrak tetap `[deployAmountSol, maxDeployAmount]`. Validate di F27 kontrak ga breach.
6. **[F9]** `swapBaseToSolWithRetry` retry strategy internal (wallet.js). Berapa retry? Backoff? Fail-open ulang risk. Cross-ref F8 wallet.js.
7. **[F8 死角]** `update_config` `key="maxBinStep"` persist — gate-4 (899) cek bila `args.bin_step` (dari args LLM) di luar range. TAPI cek cross-validate `minBinStep <= maxBinStep` di persist? Validate di config-schema.js / CONFIG_MAP apply (F8 verify). Bila user set `minBinStep=100, maxBinStep=80` → semua pool reject deploy (stuck). Open-Q bawa F8.
8. **[F9/F10 close path]** `close_position` post-success `swapBaseToSolWithRetry` (811) pakai `result.base_mint`. Verify result.base_mint returned oleh `closePosition` di dlmm.js (F10). Bila tak ada → skip swap → token stuck. Cross-ref F10.
9. **[F30]** `notifyDeploy` param `priceRange` dan `rangeCoverage` berasal dari `result.price_range`/`result.range_coverage`. Apakah `deployPosition` dlmm.js (F9) mengembalikan field ini utk Telegram message? Cross-ref F9.
10. **[F4死角]** `executeTool` success-detect `result?.success !== false && !result?.error` (784). Bila `result` undefined (tool fn return undefined) → `success=true` (pass ke post-wiring). Risk: tool tak return object → `notifyDeploy` pakai undefined prop → runtime error caught di `.catch(()=>{})`. Aman tapi noisy. Open-Q: standardisasi tool return shape.

## §I. Cross-ref fase lain

- **F4**: `executeTool` dipanggil `runToolCall` (agent.js:480); ONCE_PER_SESSION/NO_RETRY_TOOLS gate di F4; execCache dedup; interactive CHAT_CONFIRM_TOOLS di F4; salvage NO_SALVAGE_TOOLS deploy_position masuk.
- **F6**: schema 47 tool; deploy_position HARD RULES prompt sinkron dengan gate di sini; `update_config` 165-key list CONFIG_MAP sektor.
- **F8**: `update_config` impl (300-736) full + post-close auto-swap + recordPerformance trigger; CONFIG_MAP + persist path + cron restart.
- **F9**: `deployPosition` dlmm.js — rent posisi ~0.057 SOL refundable (CLAUDE.md); `entryMarketData` merge ke args sini dipakai `trackPosition` di F9/F17.
- **F10**: `closePosition` dlmm.js return `result.base_mint` utk auto-swap sambung + `result.recorded_pnl_usd` utk notify headline.
- **F11**: `getMyPositions({force:true})` shape, `total_positions`, `positions[].pool/base_mint`.
- **F14**: `getTopCandidates` `minTokenFeesSol` filter di screening.js (Open-Q #1 lintas F7).
- **F17**: `trackPosition` pakai args.entry_mcap/tvl/volume/holders mutation sini → state.json record.
- **F26**: `applyConvictionSizing` re-clamp `[deployAmountSol, maxDeployAmount]` + `MIN_SAFE_BINS_BELOW` di config.js clamp; `strategyLock` validator di persist.
- **F27**: `convictionSizing` + `exitLiquidityCheck` eksperimen flags + `convictionSizingMaxAdjustPct`/`exitLiquidityMaxSlippagePct`.
- **F30**: `notifyDeploy`/`notifyClose`/`notifySwap` payload fields dikirim ke telegram.js.
- **F23**: `logAction` persist ke decision-log.json; `addLesson` utk `[SELF-TUNED]` lesson (F19).

*F7 selesai 2026-07-06. Read-only. Kode/config tak diubah saat menyusun.*