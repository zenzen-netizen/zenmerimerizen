# Audit F26 — Config core (config.js singleton — 19-section + 165-key defaults + computeDeployAmount twin constitution)
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory — alasan: 666-baris singleton mengeksport `config` objek + 5 fn (`minDeployAmount`/`computeDeployAmount`/`applyConvictionSizing`/`persistConfigChange`/`reloadScreeningThresholds`) + `normalizePromptNotes`. 19 top-section (`risk/screening/gmgn/management/strategy/schedule/llm/learning/darwin/tokens/hiveMind/api/pnl/jupiter/indicators/experiments/reports/promptNotes/activeSetup/profile`) utk ~165 user-key dengan `??` default — bot central source of truth. **2 sizing contract**: (a) twin-floored dengan `minDeployAmount()` shared dgn `executor.js:1005` deploy safety-check (anti-stuck-retry bug), (b) computeDeployAmount 2-mode `fixed`/`maximize` ADAPTIVE-SLOTS iterate-N-down-to-1 utk cari per-slot yang jernih ≥ floor — rent-reservation per-slot. Singleton live-mutability via 3 path (`config[field]=val` direct di `persistConfigChange`, structured `section.field=field` dlm `reloadScreeningThresholds`, env-pollute `u.X`→`process.env` inlines `:55-66`). 4 path env-var promotion (rpcUrl/walletKey/llmModel/llmBaseUrl/llmApiKey/dryRun/publicApiKey/agentMeridianApiUrl/gmgnApiKey/telegramChatId). **`persistConfigChange` live-mutation + persist** (`:590`) — single write path dari briefing auto-tune F25. **`reloadScreeningThresholds`** 56-key re-read tanpa restart — termasuk `promptNotes`/`activeSetup`/`evolveEnabled`/`sizingMode`/`rentPerPositionSol`/`strategy.bins-Below` — F28 full-sync surface. Module live di seluruh codebase (170 import utk `config`). Kontrak kunci hard-floor `MIN_SAFE_BINS_BELOW=35` (`:35`) — tak bisa di-user-override ke bawah. `instanceStrategy_*` round + max-cascade `:47-52`.
> Cross-ref: F25 (persistConfigChange writeback path — `maybeAutoTuneGasReserve` F25 + `reloadScreeningThresholds` post-evolve), F27 (conviction/indicators/experiments GRUP 16 — config.js surface), F28 (update_config tool — CONFIG_MAP/structured mutation/persist + reload + normalizePromptNotes), F29 (paths.js — `paths.userConfigPath`/`gmgnConfigPath` resolve per-profil; addprofil multak user-config), F24 (config.screening/management read-path di `buildRecommendations`), F20 (evolveThresholds — `reloadScreeningThresholds()` trigger post-evolve `lessons.js:311`), F18 (`minBinsBelow`/`maxBinsBelow`/`defaultBinsBelow` strategy-bounds feeding SCREENER computation), F7 (deploy safety check — `minDeployAmount()` shared floor), F5 (prompt.js `racikanRules` baca `config.promptNotes` + `activeSetup`), F2 (computeDeployAmount deploy kontrak), F1 (env-var promotion `process.env` u.X), F3 (exit mekanis baca `config.management` stopLoss/trailing/yield/OOR), F30 (`/config` 15-grup display + `/setcfg` mutation + `/settings` button menu).

## Ringkasan eksekutif (5 baris)
1. **Singleton obj 19-section ~165-key default, env-promotion inlines, 3 mutation path, 4 export fn**. `config.js:107-489` obj literal 19-section: `profile` `activeSetup` `promptNotes` (top-level identity 3) + `risk` `screening` `gmgn` `management` `strategy` `schedule` `llm` `learning` `darwin` `tokens` `hiveMind` `api` `pnl` `jupiter` `indicators` `experiments` `reports` (16 nested). Top-level 4 identity (`profile` `:115` default "moderate", `activeSetup` `:116` default null, `promptNotes` `:118` lewat `normalizePromptNotes`). Setiap field pakai `??` chain — user-key atau default. **Env-promotion inlines** (`:55-66`): 10 keys (`rpcUrl/walletKey/llmModel/llmBaseUrl/llmApiKey/dryRun/publicApiKey/agentMeridianApiUrl/gmgnApiKey/telegramChatId`) → `process.env.X ??= u.x` sehingga `.env` fallback + user-config override. `dryRun !== undefined` SET EKSPLISIT (`:60`, tak `??=` krn harus-override bila defined). **3 mutation path**: (a) **direct** `config[field]=val` (utk section.key update, F28 `update_config` tool), (b) **persist+mutate** `persistConfigChange(section,field,flatKey,value)` (`:589`) — `config[section][field]=value` + write user-config.json `[flatKey]=value` (utk auto-tuner, **HANYA 1 caller live — `maybeAutoTuneGasReserve` F25:index.js:418**), (c) **structured reload** `reloadScreeningThresholds()` (`:606`) re-read 56 field screening/strategy/llm-management/experiments/sizingMode/rent/binsBelow/promptNotes/activeSetup/evolveEnabled — dipanggil evolve F20 (`lessons.js:311`) + `/setcfg` mutator `index.js:3840`. **4 export fn**: `minDeployAmount` (`:498`), `computeDeployAmount` (`:528`), `applyConvictionSizing` (`:572`, F27), `persistConfigChange` (`:589`), `reloadScreeningThresholds` (`:606`). `MIN_SAFE_BINS_BELOW=35` hard-floor (`:35`).
2. **computeDeployAmount 2-mode twin contract + minDeployAmount shared floor dengan executor.js:1005 deploy safety-check**. **`minDeployAmount()` `:498-500`**: `Math.max(0.03, config.management.deployAmountSol ?? 0.03)` — floor 0.03 SOL universal minimum (NOT Meteora protocol limit, sanity against dust), shared oleh `computeDeployAmount` (`:535` maximize) AND `executor.js:1005` deploy safety check (`const minDeploy = minDeployAmount()`). **Anti-stuck-retry contract**: bila sizing emit sub-min → safety reject → LLM retry → cycle burn. Twin-sharing mencegah divergence. **`computeDeployAmount(walletSol, {slotsRemaining})` `:528-558`**: 2 mode: (a) **"fixed"** (factory default): `clamp(deployable × positionSizePct, floor=deployAmountSol, ceil=maxDeployAmount)` dgn `deployable = max(0, walletSol - gasReserve)` — compounding formula, slot-blind. (b) **"maximize"**: ADAPTIVE-SLOTS — `for (n = maxSlots; n ≥ 1; n--) { perSlot = floor((deployable - rent×n) / n × 1000) / 1000; bila perSlot ≥ min return min(ceil, perSlot); }` — iterate-N-down, take first-clear (largest-N berarti max positions under min), `return 0` bila even N=1 tak clear floor (explicit "can't deploy"). **`重点工作 invariance`**: `Math.floor(... × 1000) / 1000` (`:546`) — never round UP (safe under-balance), `.toFixed(2)` final (`:557` fixed / `:581` conviction). Live: `sizingMode=maximize`, `maxPositions=2`, `maxDeployAmount=10`, `deployAmountSol=0.1`, `positionSizePct=0.33`, `gasReserve=0.03`, `rentPerPositionSol=0.057`, `minSolToOpen=0.15`. Rent-callers: `tools/dlmm.js:726` jika `force_fresh_balance_check || singleSide`.
3. **Strategy bins-bounds 3-field cascade MIN_SAFE_BINS_BELOW=35 hard-floor + round + clamping**. `:35` `MIN_SAFE_BINS_BELOW = 35`. User-config: `minBinsBelow` + `maxBinsBelow` + `defaultBinsBelow` + legacy `binsBelow` (deprecated alias). Compute pre-export (`:42-52`): `configuredMinBinsBelow = numericConfig(u.minBinsBelow) ?? 35`; max dari legacy atau default `69`; default cascade. **3-field final**: `strategyMinBinsBelow = Math.max(MIN_SAFE_BINS_BELOW, Math.round(configuredMinBinsBelow))` — **hard-floor 35, tak bisa di-user-override ke bawah**. `strategyMaxBinsBelow = Math.max(strategyMinBinsBelow, Math.round(configuredMaxBinsBelow))` — max tak bisa < min. `strategyDefaultBinsBelow = Math.max(strategyMinBinsBelow, Math.min(strategyMaxBinsBelow, Math.round(configuredDefaultBinsBelow)))` — default dalam `[min, max]`. Live `minBinsBelow=35`, `maxBinsBelow=52`, `defaultBinsBelow=52`, `binsBelow=undefined` (no legacy fallback). **`reloadScreeningThresholds`** re-compute cascade (`:648-656`) on hot-edit — re-apply MIN hard-floor. Live override ke ≤35 IMPOSSIBLE.
4. **Live mutation 2-path: `persistConfigChange` (write+persist) vs `reloadScreeningThresholds` (re-read)**. (a) **`persistConfigChange(section, field, flatKey, value)` `:589-599`**: `config[section][field] = value` inline mutate singleton, then `JSON.parse(readFileSync) → u[flatKey]=value → writeFileSync JSON.stringify null-2` persist user-config.json. Fail-open — try-catch return false on error. **Used auto-tuner**: `maybeAutoTuneGasReserve` F25 (`index.js:418`) — `persistConfigChange("management","gasReserve","gasReserve",target)` — **HANYA 1 caller live** (single write path di cabang briefing/management, tak ada di /setcfg / chat). (b) **`reloadScreeningThresholds()` `:606-666`**: re-read `user-config.json` utk hot-edit (tak restart). 56-key apply (screening 30 + strategy 3 bins-below + promptNotes `:638` + activeSetup `:639` + evolveEnabled `:641` + sizingMode `:643` + rentPerPositionSol `:644-647` + gmgn 30). **Dipanggil**: (1) `lessons.js:311` post-`evolveThresholds()` — auto-sync threshold evolution baru (F20), (2) `index.js:3840` `/setcfg` Telegram handler — utk hot-edit user. No-return, fail-open (`catch {}` ignore). **Kontrak**: 56-key whitelist — bila user tambah key baru di user-config.json di luar 56-key → tak di-pick-up lewat `reloadScreeningThresholds` (cumi F28 `update_config` tool path). TAPI key baru di user-config cumi state-baru di startup load (`u.X`). Hot-edit berbeda dari restart-load — bila hand-edit tanpa restart utk key baru → reboot required. **Kontrak-validation**: no schema-validation, tak reject bad value — `??` default on parse-error or nullish.
5. **applyConvictionSizing 🧪 experiment #6 — re-clamp ke [deployAmountSol, maxDeployAmount]**. `:572-582`: gate `config.experiments.convictionSizing` (`:575` kalau OFF → return amt unchanged = factory). adj = `convictionSizingMaxAdjustPct / 100` (`:576`, default 30 → ±30%). multiplier: high → `1+adj`, low → `1-adj`, medium/unknown → 1 (`:577`). Re-clamp `Math.min(ceil, Math.max(floor, amt × mult))` (`:581`) — **tak pernah breach `[deployAmountSol, maxDeployAmount]`** (kontrak CLAUDE.md F27). `parseFloat(.toFixed(2))` final. **Caller live**: `tools/executor.js:885` utk `args.amount_y` adjustment (mutation BEFORE safety-check validation — all downstream checks validate adjusted amount, F27 path kontrak). **Inert ketika**: OFF / medium / missing conviction → amt unchanged (byte-identical factory). experimental. Live: `convictionSizing=undefined` (NOT set) → flag OFF (default false). F27 deeper audit.

## Progress
- [x] Spec F26 baca PLAN line 123 (⬛⬛ mandatory — singleton + 5 fn + 19-section + 2 size twin + strategy cascade + 3 mutation path)
- [x] Cross-ref F25 (persistConfigChange + reloadScreeningThresholds + maybeAutoTune), F27 (conviction + indicators + experiments.config surface), F28 (update_config + CONFIG_MAP + structured mutation + reload consumer path), F29 (paths.userConfigPath/gmgnConfigPath), F24 (config.screening/management read-path buildRecommendations), F20 (evolveThresholds → reloadScreeningThresholds trigger), F18 (strategy.binsBounds feeding SCREENER), F7 (deploy safety check `minDeployAmount` shared floor), F5 (prompt.js racikanRules baca config.promptNotes), F2 (computeDeployAmount deploy contract), F1 (env promotion `process.env.X ??= u.x`), F3 (exit mekanis management), F30 (/config display + /setcfg)
- [x] Baca config.js full 1-666 (read env + 19-section singleton + 4 fn + 1 normalize + reloadScreeningThresholds 56-key)
- [x] Verifikasi live user-config keys=104 top-level (maximize sizing twin contract), experiments live ON: counterfactualReview + idleScreeningCooldown only, indicators.enabled=true, promptNotes=undefined (no racikan-prompt-notes), strategy bins bounds 35/52/52, no legacy `binsBelow`
- [x] Verifikasi twin-sinkron `minDeployAmount` shared between `computeDeployAmount:535` + `executor.js:1005` (anti-stuck-retry contract per CLAUDE.md)
- [x] Verifikasi consumers rg: `computeDeployAmount` panggil `index.js:702/766/2951/3167/3206/3687` (status + screening + chat deploy), `tools/dlmm.js:726` (force-fresh balance check), `scripts/smoke-sizing-v2.1.js` sanity. `persistConfigChange` HANYA 1 caller live `index.js:418` (F25 auto-tune — sole write back). `applyConvictionSizing` HANYA 1 caller `tools/executor.js:885` (safety check pre-deploy). `reloadScreeningThresholds` 2 caller: `lessons.js:311` (f20 post-evolve) + `index.js:3840` (`/setcfg`)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Resep dokter 19 lembar + 1 apoteker tunggal*: tiap rawat jalan, dokter keluarkan 1 resep dengan 19 lembar — tiap lembar 1 kategori obat (anti-nyamuk, anti-diare, vitamin, ekspektoran dkk — `risk`/`screening`/`management` dst). Resep disimpan apoteker utama (`config` singleton), tiap tapi pasien datang apoteker baca resep — tak boleh siram pasien dengan obat di luar 19 lembar. **Apoteker 1 (config)** = 1 obj utk semua. 2 mekanisme update resep: (a) **apoteker tulis tangan** (`persistConfigChange` — doctor tambah atas resep + tulis permanen, jalur `auto-tune` krn ia tahu pasar harian), (b) **apoteker baca ulang resep yang sudah ada** (`reloadScreeningThresholds` — bila dokter sunting manual ke file lembar kerja, apoteker scan ulang tanpa buka praktek baru). Vendor (`user-config.json`) adalah lembar tertulis permanen. Konsep sama: `config` singleton = 1 source; updated via 2 path (otomatis persist / hot-read); loaded @startup, mutated live; all 170 consumer baca same memory obj.
- *Tukang kayu yang ukur potongan lembing 3-variabel: minimum-absolut 35 + 2 slot-mode (fixed/maximize)*: tukang potong kayu utk lembing. Aturan matematika tak bisa dilanggar: (1) `MIN_SAFE_BINS_BELOW=35` = abs minimum, "lebih pendek dari 35 bahaya, gampang patah dipakai pasukan", (2) Formula `fixed` = potong proporsional kayu `<35%×kayu-gas>`, clamp `0.5-50`; (3) Formula `maximize` = bagi merata ke N slot tersisa, iterate N dari max turun, potong per-slot yang masih ≥ minimum, tak satu pun slot boleh ≤3cm. Bila tak ada N yang bisa bersih → bilang `0` ("tidak cukup kayu"). Aturan ini BUKAN proposal — kontrak anti-bug: ukur dari `minDeployAmount` (sama utk sizing + safety check supaya tak ada "coba potong ulang" stuck — kalo sizing bilang aman tapi safety bilang bahaya → potong bahaya → tukang stuck ulang abis ulang). Konsep sama: `computeDeployAmount` 2-mode plus `minDeployAmount` twin-sharing dengan `executor.js` deploy-safety-check — anti-stuck-retry contract lawan bug "sizing emit sub-min, safety reject, LLM retry, cycle burn".

**Di bot, ini = singleton config 19-section + 165 key default + 2 mutation path + 2 sizing twin-contract** (1-2 kalimat)
`config.js` export 1 `config` objek 19-section, semua field bawa `??` default factory. 4 fn (`computeDeployAmount` 2-mode compounding/maximize, `minDeployAmount` 0.03-floor shared dengan safety-check, `applyConvictionSizing` 🧪 re-clamp ke min/max, `persistConfigChange` auto-tuner write, `reloadScreeningThresholds` hot-edit re-read 56-key). Env-promotion 10-key. Strategy bins-bounds hard-floor 35. Live mutability via 3 path. Read by 170 import across codebase central source-of-truth.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F1 (env-vars promotion di startup), SETELAH F29 (`paths.userConfigPath`/`gmgnConfigPath` resolve per-profil), SEBELUM F27 (conviction/indicators/experiments — config surface), SEBELUM F28 (`update_config` tool mutation path + `reloadScreeningThresholds` consumer). PARALEL-F20 (`reloadScreeningThresholds` trigger post-evolve), PARALEL-F25 (`persistConfigChange` writeback path `maybeAutoTuneGasReserve`). F26 = **Lapisan 8 (Config) core engine**: tiap file di codebase import `config`, baca per section, pass-through ke downstream. Tanpa F26, bot run dengan defaults hardcoded — tak bisa tune strategy/SOL reserve/sizing/screening thresholds.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Startup load**: `import "./envcrypt.js"` decode env (F29), `paths.userConfigPath`/`gmgnConfigPath` resolve per-profil (F29), `readJsonIfExists` buka JSON (fail-open `{}` bila ENOENT).
2. **Strip orphans**: `delete u.maxBundlePct; delete u.athFilterPct` (`:32-33`) — defensif, key-dead di upstream setup.js.
3. **Env-promotion**: 10-key inline (`:55-66`) — `u.rpcUrl ?? process.env.RPC_URL` eksekusi pertama kali, propagate to env utk modul lain (telegram.js / agent.js / wallet.js) baca `process.env` konsisten.
4. **Strategy bins pre-compute**: `numericConfig` cast, `legacyBinsBelow` legacy alias, `configuredMin/Max/DefaultBinsBelow` pre-resolve, `strategyMin/Max/DefaultBinsBelow` hard-floor + round + clamp cascade.
5. **Singleton build** (`:107-489` obj literal export `config`): 19-section, setiap field `u.X ?? default` — `u` = loaded user-config.json. `promptNotes` lewat `normalizePromptNotes` (`:118`); `sun市值'active-null`. `indicators` sub-obj dari `u.chartIndicators`. `experiments` flat-flag dari user-config.
6. **Sizing twin-contract**: (a) `minDeployAmount()` `:498` = `Math.max(0.03, deployAmountSol ?? 0.03)` shared dengan `executor.js:1005` deploy safety check. (b) `computeDeployAmount` `:528` — bila `sizingMode==="maximize"` iterate-N-down-to-1 adaptive slots utk cari perSlot ≥ min (return 0 bila even N=1 tak clear), `Math.floor(...×1000)/1000` never-round-up. Else `fixed` formula `clamp(deployable × pct, floor, ceil)`.
7. **Conviction experiment 🧪**: `applyConvictionSizing` `:572` — gate `experiments.convictionSizing` flag; `multiplier high/low/medium`; re-clamp `[deployAmountSol, maxDeployAmount]`. Inert bila OFF.
8. **Auto-tuner mutation**: `persistConfigChange(section,field,flatKey,value)` `:589` — inline-mutate `config[section][field]` + persist user-config.json `[flatKey]=value`. **HANYA auto-tuner path** (F25 `maybeAutoTuneGasReserve`). Not user-facing.
9. **Hot-edit mutation**: `reloadScreeningThresholds()` `:606` — re-read user-config, apply 56-key whitelist (screening 30 + strategy 3 bins + promptNotes + activeSetup + evolveEnabled + sizingMode + rentPerPositionSol + gmgn 30). **Trigger**: post-`evolveThresholds` F20 (`lessons.js:311`) utk auto-sync threshold evolution, `/setcfg` F30 / chat (`index.js:3840`) utk user-hand-edit.
10. **Consumer read path**: 170 import baca `config.section.field` runtime. Tak ada caching variant — semua baca live obj; mutation lewat path 3 (direct/persist/reload) sinkron ke singleton seketika. **Sizing callers**: `index.js:702` (status display), `:766` (screening cycle deploy plan), `:2951` (manual chat deploy), `:3167/3206/3687` (/status /export). **Rent calltrer**: `tools/dlmm.js:726` force-fresh balance pre-deploy.
11. **Output**: 1 `config` singleton obj singleton singleton memory-state. Re-read user-config @reload. Persist + write user-config @ `persistConfigChange`. Live mutate-section.field saat hot-edit.

**Output singleton**: `config` obj 19-section singleton live-memory; 5 export fn (`minDeployAmount`/`computeDeployAmount`/`applyConvictionSizing`/`persistConfigChange`/`reloadScreeningThresholds`); re-export 4 dari `screening-scales.js` (`getScreeningDefaultsForTimeframe`/`normalizeTimeframe`/`scaleScreeningToTimeframe`/`TIMEFRAME_SCREENING_SCALES`). Side-effect: env vars di-promote seed @startup; user-config.json diperbarui via `persistConfigChange`. Trigger ke fase berikut: SCREENER prompt baca screening thresholds; deploy safety-check baca twin contract; exit mekanis baca management; briefing reads reports thresholds; evolve mutasi via reloadScreening.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
`user-config.json` ENOENT/corrupt → `readJsonIfExists` fallback `{}` → semua field pakai `??` default → bot run dengan factory baseline (safe but racikan tak loaded). Strategy bins-negative mendalam: `Math.max(MIN_SAFE_BINS_BELOW=35, ...)` menutup underflow, tak bisa user push bawah 35. `computeDeployAmount` maximize N=1 fail → return 0 → deploy safety check reject `amount_y > 0` → screening skip deploy → no-stuck-retry (anti-bug contract preserved). `persistConfigChange` throw → caught pada try-catch `:596` return false → auto-tune skip persist (live-mutate juga gagal — `config[section][field]=value:590` dilakukan sebelum persist, jadi singleton mutated even kalau persist gagal — means bot baca-new value tapi user-config tidak persist — **state-divergence singleton-vs-file** potential if persist gagal, restart akan reset after-restart). `reloadScreeningThresholds` throw → `catch {}` ignore → singleton tetap OLD — post-evolve threshold tak sync (sizing threshold drift between singleton dan what user reads). Skip F26 = tak paham cara kerja bot tune thresholds/SOL sizing/bins-bounds — semua racikan adjust go back-to-magic-number.

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **singleton `config`** — `config.js:107` export 19-section. **THE** source of truth. 170 import.
- **19-section** — profile/activeSetup/promptNotes (identity 3) + risk/screening/gmgn/management/strategy/schedule/llm/learning/darwin/tokens/hiveMind/api/pnl/jupiter/indicators/experiments/reports (16 nested). ~165 user-key.
- **165-key** — total user-config keys acknowledged at top-level. `user-config.example.json` paritas sumber key.
- **env-promotion** — `:55-66` inline 10-key `process.env.X ??= u.x` sehingga .env fallback + user-config override.
- **`??`**-chain —nullish-coalesce default tiap field — null/undefined pick default, `0`/`""`/false treated as value.
- **MIN_SAFE_BINS_BELOW** — `:35` konstanta 35. Hard-floor bins-below, tak bisa user override ke bawah.
- **strategy bins cascade** — min (hard-floor 35) + max (≥ min) + default dalam [min, max] + round. `:47-52`. Re-applied `reloadScreeningThresholds:648-656`.
- **legacyBinsBelow** — `:42` deprecated alias utk minBinsBelow/maxBinsBelow backward-compat.
- **minDeployAmount()** — `:498` `Math.max(0.03, deployAmountSol ?? 0.03)` universal floor 0.03. Shared dgn `executor.js:1005` safety-check — twin contract anti-stuck-retry bug.
- **computeDeployAmount(walletSol,{slotsRemaining})** — `:528`. 2-mode: `fixed` (factory compounding clamp) / `maximize` (adaptive-N down-iteration per-slot ≥ min, return 0 bila all fail).
- **sizingMode** — `management.sizingMode` `:249` "fixed" default / "maximize" adaptive-split.
- **maximize adaptive-N** — `:544-548` `for (n = maxSlots; n ≥ 1; n--) ...`. Largest-N yang per-slot clear floor.
- **Math.floor(...×1000)/1000** — `:546` not-round-up invariant utk safety-check balance.
- **toFixed(2)** — final 2-decimal rounding fixed/conviction.
- **deployable** — `walletSol - gasReserve` `:554` (fixed) atau `walletSol - gasReserve - rent×N` `:545` (maximize). Reserve deduction.
- **gasReserve / rentPerPositionSol** — `:236/253`. Reserve per cycle (gas) + per-slot (rent). maximize reserves rent×N; fixed ignores rent (slot-blind).
- **persistConfigChange(section,field,flatKey,value)** — `:589`. Inline-mutate `config[section][field]` + persist user-config.json `[flatKey]`. **HANYA auto-tuner path**. Single caller live F25 (`maybeAutoTuneGasReserve`).
- **reloadScreeningThresholds()** — `:606`. Re-read 56-key user-config tanpa restart — whitelist non-scope. Trigger F20 post-evolve + `/setcfg` F30.
- **56-key whitelist** — `:608-647`: screening 30 + strategy 3 bins + promptNotes + activeSetup + evolveEnabled + sizingMode + rentPerPositionSol + gmgn 30.
- **3 mutation path** — (a) direct `config[field]=val`, (b) persist+ mutate persistConfigChange, (c) reload reloadScreeningThresholds.
- **normalizePromptNotes** — `:77` plain array → SCREENER-only; object `{screener[],manager[],general[]}` per-role. Malformed → empty.
- **nonEmptyString** — `:88` fallback chain string-trim-or-null utk api keys.
- **gmgnValue/gmgnArray** — `:97/101` gmgn-hierarchy `gmgnUserConfig > u.legacy > fallback` 3-tier.
- **applyConvictionSizing** — `:572` F27. Conviction nudge multiplier high/low re-clamp `[deployAmountSol, maxDeployAmount]`. Gate `experiments.convictionSizing`.
- **indicatorsUserConfig** — `u.chartIndicators ?? {}` pre-resolved `:68`. Lulus ke `config.indicators` section.
- **darwin** — `:317-326` 7-key (enabled/windowDays/recalcEvery/boost/decay/floor/ceiling/minSamples). sub-section.
- **re-promotion `REPO_ROOT`/`repoPath`** — `:2` import + `:6` re-export — single source of truth.
- **factory** — default behavior bila flag OFF. byte-identical pre-feature.
- **legacy** — ambig alias utk backward-compat (e.g. `takeProfitFeePct → takeProfitPct`, `emergencyPriceDropPct → stopLossPct`, `binsBelow` bins-cascade).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A — Peta file fase ini

| File | Peran | Baris kunci |
|------|-------|-------------|
| `config.js` (666) | **Singleton + 5 fn + normalize + re-export**: 19-section obj ~165 key, env-promotion, sizing-twin, mutations | 1-6 imports + re-export; 8-9 paths; 15-19 readJsonIfExists; 21-22 u/gmgn-user; 32-33 orphan strip; 35 MIN_SAFE_BINS_BELOW; 37-40 numericConfig; 42-52 strategy bins cascade pre-compute; 55-66 env promotion 10-key; 68 indicatorsUserConfig; 77-86 normalizePromptNotes; 88-95 nonEmptyString; 97-105 gmgnValue/gmgnArray; 107-489 config obj literal; 498-500 minDeployAmount; 528-558 computeDeployAmount 2-mode; 572-582 applyConvictionSizing; 589-599 persistConfigChange; 606-666 reloadScreeningThresholds |
| `paths.js` F29 | **userConfigPath/gmgnConfigPath resolve**: per-profil paths source | paths.userConfigPath + gmgnConfigPath |
| `screening-scales.js` | **Re-export 4 fn**: timeframe scaling helper utk screening threshold | getScreeningDefaultsForTimeframe / normalizeTimeframe / scaleScreeningToTimeframe / TIMEFRAME_SCREENING_SCALES |
| `repo-root.js` | **REPO_ROOT/repoPath re-export**: single source utk repo path | 2 import |
| `tools/executor.js:1005` | **Twin contract consumer**: deploy safety check baca `minDeployAmount()` | 1005 `const minDeploy = minDeployAmount()` |
| `tools/executor.js:885` | **Conviction applicant**: `applyConvictionSizing` invoked pre-safety-check | 885 adjust `amount_y` (F27 path) |
| `index.js:702/766/2951/3167/3206/3687` | **computeDeployAmount callers**: status + screening + chat deploy | — |
| `tools/dlmm.js:726` | **Rent-aware re-check**: force-fresh balance pre-deploy bila configured | — |
| `index.js:418` | **persistConfigChange single caller**: F25 auto-tune gas reserve | — |
| `index.js:3840` | **reloadScreeningThresholds /setcfg caller**: post-user-edit | — |
| `lessons.js:311` | **reloadScreeningThresholds post-evolve caller**: sync evolution F20 | — |
| `agent.js` | **Hot-read prompt consumer**: baca `config.promptNotes` via `racikanRules(role)` | F5 |
| `prompt.js` | **racikanRules injection**: baca `config.promptNotes` per-role | F5 |
| `tools/dlmm.js:1603-1604` | **Gas estimate via computeDeployAmount? NE — import estimateGasSol F24**: DRY_RUN cost parity | — |
| `views/config.js` | **15-grup `/config` display**: baca config obj render Telegram | F30 |
| `user-config.json` (live, 104-key) | **Persisted state**: actual tunable keys dari user | live replika partial singleton |

---

## §B — Alur data hulu→hilir (ASCII diagram)

```
                        [Startup path]
   .env (envcrypt.js F29) ─paths.userConfigPath/gmgnConfigPath─> readJsonIfExists (config.js:15)
                │
                ▼
   u (user-config flat) + gmgnUserConfig (gmgn flat)
                │
                ├─ orphan strip (:32-33): delete u.maxBundlePct / u.athFilterPct
                ├─ numericConfig bins-below pre-compute (:42-52)
                │     │
                │     ├─ configuredMin/Max/DefaultBinsBelow (numeric ?? default)
                │     └─ strategyMin/Max/DefaultBinsBelow (round + Math.max(MIN_SAFE_BINS_BELOW=35, ...))
                │
                ├─ env-promotion (:55-66): process.env.X ??= u.x utk 10 keys (RPC/wallet/llm/etc)
                ├─ indicatorsUserConfig = u.chartIndicators ?? {}  (:68)
                ├─ normalizePromptNotes (u.promptNotes) → config.promptNotes (:118)
                │
                └─▶ config obj literal export singleton (:107-489)
                          │
                          ├─▶ 170 import across codebase — read `config.section.field` live
                          │
                          ├──  [Mutation path A — auto-tuner persist] persistConfigChange(section, field, flatKey, value) (:589)
                          │       ├── config[section][field] = value  (inline mutate singleton)
                          │       └── user-config.json [flatKey] = value  + JSON.stringify null-2 persist
                          │       │   (1 caller live F25 maybeAutoTuneGasReserve)
                          │       │
                          │       └─ State-divergence potential bila persist throw → singleton new, file old (restart reset)
                          │
                          ├──  [Mutation path B — hot-edit reload] reloadScreeningThresholds() (:606)
                          │       ├── re-read user-config.json fresh
                          │       ├── 56-key whitelist apply ke config obj (screening 30 + strategy 3 + identity 3 + learning 1 + sizing 2 + gmgn 30)
                          │       └── fail-open catch {} ignore
                          │       │   (2 callers: /setcfg F30 + evolveThresholds F20)
                          │
                          └──  [Mutation path C — direct] config[field]=val
                                   (F28 `update_config` tool — structured mutation)

         [Sizing twin contract]
   computeDeployAmount(walletSol,{slotsRemaining}) (:528)
                  │
                  ├─ sizingMode="maximize" → for n = maxSlots..1: floor((deployable - rent×n)/n ×1000)/1000 ≥ minDeployAmount ? return min(ceil, per) : continue
                  │       └─ all fail → return 0  (explicit "can't deploy" — anti-stuck-retry)
                  └─ sizingMode="fixed" → clamp(deployable × pct, floor=deployAmountSol, ceil=maxDeployAmount) toFixed(2)

   minDeployAmount() (:498) = Math.max(0.03, config.management.deployAmountSol ?? 0.03)
                  │
                  ▼ shared floor consumer
   tools/executor.js:1005  `const minDeploy = minDeployAmount()` — deploy safety-check amount_y ≥ minDeploy
                          (twin contract — sizing-emit sub-min here rejected; bug lawan vs divergence sinergy)

   applyConvictionSizing(amountSol, conviction) (:572)  🧪 experiment #6
                  │
                  ├─ gate config.experiments.convictionSizing OFF → return amt unchanged (factory byte-identical)
                  ├─ multiplier = high 1+adj / low 1-adj / medium-un 1  (adj = convictionSizingMaxAdjustPct / 100)
                  └─ re-clamp Math.min(ceil, Math.max(floor, amt × mult))  → parseFloat toFixed(2)
                  (caller tools/executor.js:885 pre-safety-check mutation args.amount_y)
```

---

## §C — Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| os-import config.js | config.js:107 `config` obj | startup load | — | readJsonIfExists file-miss → `{}` |
| index.js:702 status display | config.js:528 `computeDeployAmount(sol,{slotsRemaining})` | cron status / /status | walletSol + slot-count | 0 bila can't-deploy maximize |
| index.js:766 screening cycle | config.js:528 | pre-deploy | walletSol + slots | 0 skip deploy |
| index.js:2951 manual chat | config.js:528 | user-driven deploy | — | — |
| index.js:3167/3206/3687 `/status` `/wallet` `/positions` | config.js:528 | Telegram command | — | — |
| tools/dlmm.js:726 single-side force-fresh | config.js:528 | single-side-below deploy | pre-deploy rent-aware | — |
| tools/executor.js:1005 deploy safety-check | config.js:498 `minDeployAmount()` | per-deploy safety check | — | konstanta 0.03-floor |
| tools/executor.js:885 conviction pre-safety | config.js:572 `applyConvictionSizing(originalAmt, conviction)` | 🧪 experiment on + args.conviction | amount + conviction enum | gate OFF → amt unchanged |
| index.js:418 maybeAutoTuneGasReserve F25 | config.js:589 `persistConfigChange("management","gasReserve","gasReserve",target)` | cron 01:00 pre-brief daily | section + field + flatKey + value | try-catch sendHTML`false` |
| index.js:3840 `/setcfg` mutator F28 | config.js:606 `reloadScreeningThresholds()` | post-user-edit via telegram | — | catch{} ignore |
| lessons.js:311 post-evolve F20 | config.js:606 | tiap 5 close atau threshold mutation | — | catch{} ignore |
| agent.js (prompt build) F5 | `config.promptNotes` (read-only) | per-agent-loop | racikan rules | null - racikanRules → "" |
| prompt.js:racikanRules | `config.promptNotes` | per-agent render | per-role array | null-array → factory prompt |
| views/config.js `/config` F30 | `config.*` render | `/config` telegram | — | — |

---

## §D — Logika kunci per fungsi

### readJsonIfExists + env-promotion — config.js:15-66
- **Apa**: Load 2 file (user-config + gmgn-config) json fail-open. Promote 10 user-config key ke `process.env` utk consumer lain.
- **Kapan dipicu**: Startup (top-level execution).
- **Output**: `u` flat object, `gmgnUserConfig` flat, `process.env` populated.
- **Sinkron**: `??=` chain — user-config override `.env` baseline (`.env` default bila user-config tak set, user-config win bila both set). `dryRun` lain — `if (u.dryRun !== undefined) process.env.DRY_RUN = String(u.dryRun)` (`:60` eksplisit-override bila defined, tak `??=`).
- **Fail-mode**: file-missing → `{}`, no throw. JSON parse-error → caught? Actually `JSON.parse` not in try-catch di `readJsonIfExists` (`:17`) → throw propagate ke startup → boot crash. **Worth-fix**: wrap try-catch defensive. **Low-medium risk**.
- **Bukti**: config.js:15-66.

### Singleton obj literal — config.js:107-489
- **Apa**: 19-section `config` obj export. Setiap field `u.X ?? default` default-fallback.
- **Kapan dipicu**: top-level (once at module-load).
- **Output**: 1 const `config` obj singleton memory-state.
- **Sinkron**: 170 import read runtime. Mutation via 3 path sinkronize live (direct / persist / reload).
- **Fail-mode**: malformed user-config → throw on parse → boot crash unless `readJsonIfExists` wrapped (currently tidak).
- **Kontrak**: 19-section organization — top-level 4 (identity: profile/activeSetup/promptNotes + `activeSetup`). Section `risk`/`screening`/...16 nested. ~165-key user-config.
- **Bukti**: config.js:107-489.

### minDeployAmount() — config.js:498-500
- **Apa**: Universal floor utk position size — `Math.max(0.03, config.management.deployAmountSol ?? 0.03)`.
- **Kapan dipicu**: `computeDeployAmount` maximize (`:535`) + `executor.js:1005` deploy safety-check.
- **Output**: number SOL float.
- **Sinkron**: `config.management.deployAmountSol` live read (if mutated via reloadScreeningThresholds/persistConfigChange, propagate).
- **Fail-mode**: NaN/undefined → fallback 0.03 via `??` + `max(0.03,...)`.
- **Kontrak**: TWIN SHARED — `computeDeployAmount` maximizer iterate `perSlot ≥ min` (`:547`), `executor.js:1005` reject `amount_y < minDeploy` — bot statement anti-stuck-retry bug (`:497` comment).
- **Bukti**: config.js:498-500.

### computeDeployAmount(walletSol,{slotsRemaining}) — config.js:528-558
- **Apa**: 2-mode position-size calculator. fixed (compounding single-formula) atau maximize (adaptive-N slots).
- **Kapan dipicu**: 10 caller across codebase — index.js status/screening/chat + dlmm.js pre-deploy rent-check + smoke script.
- **Output**: SOL float untuk deploy amount; 0 bila can't-deploy maximize.
- **Sinkron**: baca `config.management.sizingMode` + `gasReserve` + `positionSizePct` + `deployAmountSol` + `maxDeployAmount` + `rentPerPositionSol` + `risk.maxPositions`. `minDeployAmount()` shared floor. `slotsRemaining` passed from caller (maks `risk.maxPositions`).
- **Fail-mode**: `sizingMode==="maximize"` iterate-all-fail → return 0 (explicit safe signal). Else fixed path → `min(ceil, max(floor, dynamic))` — never returns 0 except walletSol < reserve.
- **Kontrak FIXED vs MAXIMIZE**: (a) **fixed** slot-blind, tak reserve rent, formula `clamp(deployable × pct, floor, ceil)`. (b) **maximize** slot-aware, reserve `rent×N` per slot, iterate-N-down, return 0 bila all-fail.
- **Bukti**: config.js:528-558. Live: `sizingMode=maximize`, `maxPositions=2`, `deployAmountSol=0.1`, `maxDeployAmount=10`.

### applyConvictionSizing(amountSol, conviction) — config.js:572-582
- **Apa**: 🧪 Experiment #6 conviction nudge multiplier. Re-clamp ke `[deployAmountSol, maxDeployAmount]`.
- **Kapan dipicu**: `tools/executor.js:885` pre-deploy safety-check.
- **Output**: adjusted amount (≤ ceil, ≥ floor) atau unchanged (gate OFF / medium).
- **Sinkron**: gate `config.experiments.convictionSizing` (`:575`) + `convictionSizingMaxAdjustPct` default 30 → ±30%.
- **Fail-mode**: `!Number.isFinite(amt) || amt ≤ 0 → return amountSol` (`:574` pass-through unaltered). adj negative → `Math.max(0, ...)` (`:576`) clip.
- **Kontrak**: re-clamp `[floor, ceil]` — tak pernah breach min/max sizing. Two-rail guarantee (CLAUDE.md F27).
- **Bukti**: config.js:572-582.

### persistConfigChange(section, field, flatKey, value) — config.js:589-599
- **Apa**: Inline-mutate singleton + persist user-config.json. Auto-tuner-only write path.
- **Kapan dipicu**: live 1 caller — `maybeAutoTuneGasReserve` F25 (`index.js:418`).
- **Output**: `true` on success, `false` on persist error.
- **Sinkron**: `if (config[section]) config[section][field] = value` (`:590`) mutate singleton dulu, baru persist. **Single write path** off auto-tuner.
- **Fail-mode**: persist throw → catch return false — TAPI `config[section][field]` sudah dimutate (state-divergence singleton-vs-file potential).
- **Kontrak**: (a) Mutate live singleton seketika, (b) persist ke user-config flat-key. **Divbug**: kalau persist gagal, singleton baru, file lama → restart reset singleton dari file-lama. Live: F25 auto-tune — `maybeAutoTuneGasReserve` — bila persist throw (file lock), user-config stale, next-day benchconfig still OLD (churn-guard 20% tak trigger dari target-new krn singleton dising reset). **Worth-fix**: wrap `config[section][field] = value` dlm try or set after-persist-success.
- **Bukti**: config.js:589-599.

### reloadScreeningThresholds() — config.js:606-666
- **Apa**: Re-read user-config.json fresh, apply 56-key whitelist ke `config` obj.
- **Kapan dipicu**: post-`evolveThresholds` F20 (`lessons.js:311`) + `/setcfg` F30 (`index.js:3840`).
- **Output**: void — mutate `config` obj in-place.
- **Sinkron**: 56-key whitelist apply: screening 30 (`:610-636`), strategy 3 bins-below (`:648-656` re-compute cascade), promptNotes (`:638`) + activeSetup (`:639`) + evolveEnabled (`:641`) + sizingMode (`:643`) + rentPerPositionSol (`:644-647`) + gmgn 30 (`:659-664` skip apiKey jika sama).
- **Fail-mode**: try-catch `catch {}` ignore — singleton tetap OLD (post-evolve threshold tak sync).
- **Kontrak**: whitelist — bila user tambah key baru di user-config.json di luar 56-key → tak di-pick-up via reload. TAPI key baru diuser-config cumi state-baru di startup load (`u.X`). Hand-edit tanpa restart utk key baru → restart required. Re-apply MIN_SAFE_BINS_BELOW hard-floor untuk bins-below (`:651`).
- **Bukti**: config.js:606-666.

### normalizePromptNotes(raw) — config.js:77-86
- **Apa**: Normalize `promptNotes` from user-config into structured per-role.
- **Kapan dipicu**: startup load (`:118`) + `reloadScreeningThresholds` (`:638`) post hot-edit.
- **Output**: `{screener:[], manager:[], general:[]}` clean string arrays.
- **Sinkron**: Array → screener-only (manager/general empty). Object → per-role. Malformed (string/number) → all-empty.
- **Fail-mode**: malformed → default `{screener:[],manager:[],general:[]}`.
- **Kontrak**: Bisa di-edit user-config.json flat-key `promptNotes` (racikan-borne). Read by `racikanRules(role)` prompt.js F5 injection SFREENER/MANAGER/GENERAL.
- **Bukti**: config.js:77-86. Live: `promptNotes=undefined` (no racikan-prompt-notes set).

### strategy bins-bounds cascade — config.js:42-52
- **Apa**: Pre-compute 3 strategy bins-bounds (min/max/default) berdasarkan user-config + legacy alias + hard-floor.
- **Kapan dipicu**: startup level + re-applied `reloadScreeningThresholds:648-656`.
- **Output**: `strategyMinBinsBelow`, `strategyMaxBinsBelow`, `strategyDefaultBinsBelow` ke `config.strategy.*`.
- **Sinkron**: `numericConfig` cast ke number-or-null. `legacyBinsBelow` alias utk `binsBelow` deprecated. `configuredMin = numeric ?? MIN_SAFE_BINS_BELOW=35`. `configuredMax = numeric ?? (legacy ? max(legacy, configuredMin) : 69)`. `configuredDefault = numeric ?? legacy ?? configuredMax`. Final Math.round + Math.max cascade.
- **Fail-mode**: NaN/null → numericConfig return null → default pickup. Hard-floor 35 — even user-config `minBinsBelow: 10` → final 35 (Math.max).
- **Kontrak**: hard-floor 35 is **anti-pathological-range safeguard** — range terlalu sempit (sedikit bins-below) rugi immediate single-side-below deploy. Tak bisa di-user-override bawah.
- **Bukti**: config.js:42-52. Live: max=52, min=35, default=52 (kasus kompresi range sempit — user low risk).

---

## §E — Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — `readJsonIfExists` Tak try-catch JSON.parse — boot crash bila user-config.json korup
**Lokasi**: config.js:15-19.
**Temuan**: `function readJsonIfExists(filePath) { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : {}; }`. `fs.existsSync` false → `{}` OK. TAPI `fs.readFileSync` throw bila file-missing setelah existsSync (race), DAN `JSON.parse` throw bila korup. Tak ada try-catch. Boot crash → user stuck. **Anti-pattern**: nama fungsi implies "isExists" = fail-open, behavior sebenarnya "fail-throw-on-corrupt". Kontrak dokumentasi `?? if exists` misleading.
**Impact**: user-edit user-config.json typo koma → korup → boot crash → user bingung (no error message, stack trace tangkap krn top-level). Fix: wrap `JSON.parse` dlm try-catch → fallback `{}` + `log("config_error", err.message)`. **Medium-worth-fix** — user-safe boot.

### E.2 — `persistConfigChange` singleton-file state-divergence potential bila persist throw
**Lokasi**: config.js:589-599.
**Temuan**: `if (config[section]) config[section][field] = value` (`:590`) mutate singleton SEBELUM `try { ... writeFileSync ... }` persist. Bila persist gagal (file-lock / disk full / permission), catch return false — TAPI singleton NEW, file OLD. **Divergence live-memory vs persisted**: next-day singleton dari memory baca NEW, file persist OLD. Bila `reloadScreeningThresholds` trigger (`/setcfg` or evolve) → re-read file OLD → singleton overwrite kembali OLD (churn-guard failed).
**Mitigasi existing**: persist gagal terkenal walau singleton divergent — daily auto-tune retry next-day (singleton starts OLD after reloadScreening). Tapi bila reload tak pernah trigger, divergence persist sampai restart.
**Kontrak-documentasi**: comment `:587` "Used by auto-tuners outside the update_config tool path. Returns true on a successful write. Fail-open." — ambigu fail-open: `config[section][field] = value` mutated, persist fail return-false. Sebenarnya fail-partially-open. Fix ideal: `if (persist success) config[section][field] = value` (sequential, set-only-after-persist) — restore singleton bila persist gagal also OK. **Worth-fix** — single caller live F25, single-line fix. **Cross-verify E.2 F25**.

### E.3 — `reloadScreeningThresholds` 56-key whitelist non-encompassive — key baru di user-config tak hot-edit
**Lokasi**: config.js:606-666.
**Temuan**: 56-key whitelist re-apply — bila user hand-edit user-config.json utk key BARU (di luar 56 + di luar startup-loaded-scope), tak di-pick-up lewat reloadScreeningThresholds. Kontrak startup-load via `u.X ?? default` — semua top-level key ada di singleton. TAPI hot-reload via `reloadScreeningThresholds` cumi pick 56-key. **Gap**: kalau user add key baru (mis `minTokenFeesSolCurrency`) → startup-load OK (di `u`), saat reload — tak ada di 56-whitelist → tak propagate. Hand-edit tanpa restart → singleton tetap OLD.
**Kontrak**: sesuai CLAUDE.md F28 — `update_config` tool (executor.js) structured mutation section.key path, **TAPI persist lewat write user-config flat-key**. Jadi user-config.json bisa menampung key BARU via `update_config` tool → startup-load OK → reload unknown key tak apply. Asymetri load-vs-reload. Not-a-bug bila user not hand-edit. **Documentasi-point** — F28 `update_config` surface consistency. **Low-impact** live.
**Bukti**: config.js:606-666.

### E.4 — `applyConvictionSizing` parseFloat `.toFixed(2)²` bisa kehilangan presisi ke sub-cent horison
**Lokasi**: config.js:581.
**Temuan**: `return parseFloat(Math.min(ceil, Math.max(floor, amt * mult)).toFixed(2));`. Round to 2 decimals. Live `deployAmountSol=0.1` — bila conviction high + adj 30%: `0.1 × 1.3 = 0.13, ceil=10, floor=0.1` → `0.13`. OK. TAPI bila amt dynamic (maximize per-slot) = `0.0845 × 1.3 = 0.10985, floor 0.1, ceil 10` → `toFixed(2) = "0.11"` → parseFloat `0.11`. Round naik dari `0.10985`. Kontrak `.toFixed(2)` klarifikasi — anti-dust, TAPI round-up potensial. **ComputeDeployAmount maximize invariant `Math.floor(...×1000)/1000`** (`:546`) never-round-up — pasangan dengan conviction `.toFixed(2)` round-up potensi konflik.
**Impact**: conviction high + maximize sub-cent → safety-check `amount_y ≥ minDeploy` (0.1 floor) — kalau conviction round-up dari 0.0985 → 0.1, safety-check pass — OK. TAPI kalau `deployable × pct` original bawah min (e.g. 0.05) × adj 30% → 0.065 → 0.07 — safety-check reject krn < 0.1 (floor). Conviction-up bisa push ke floor. **Live**: conviction tidak diaktifkan — bug kosmetik. Bila future-flip-on + wallet kecil → potential edge. **Document** in F27.

### E.5 — `darwin` config `darwinEnabled` / `darwinWindowDays` / `darwinRecalcEvery` dst flat-key, no `darwin.*` nested section seperti style lain
**Lokasi**: config.js:317-326.
**Temuan**: `darwin: { enabled: u.darwinEnabled ?? true, windowDays: u.darwinWindowDays ?? 60, recalcEvery: u.darwinRecalcEvery ?? 5, ...}`. User-config keys pakai prefix `darwin*` (flat), bukan nested `darwin: {enabled: true}` style. Inkonsisten dgnIndicators/Indicators/jupiter/experiments nested di user-config.
**Konsekuensi**: user-config.json keys `darwinEnabled`/`darwinWindowDays`/dst flat (no nesting). Sama dengan 8 user-config lain flat-key (`maxPositions`, `gasReserve`, dst). Memang by-design — semua user-config flat at top, config.js nestes mereka at runtime. **TAPI** `chartIndicators` nested (`u.chartIndicators ?? {} :68`) — user-config bisa pakai nested style. Asimetri schema. **Not-a-bug** — historical design choice. Document.

### E.6 — `u.indicators` tak ada — pakai `u.chartIndicators` (legacy alias) — user-config key name `chartIndicators`, but config.js reads as `indicators`
**Lokasi**: config.js:68 + 368-397.
**Temuan**: `const indicatorUserConfig = u.chartIndicators ?? {}` (`:68`) — user-config key `chartIndicators`. Section di `config.indicators` (`:368`) — name `indicators`. Asimetri user-key vs config-section. CLAUDE.md acknowledges — `config.indicators` referenced but key `chartIndicators`. Kontrak inconsistent — user baca `/setcfg indicators.enabled` tapi user-config.json tertulis `chartIndicators.enabled`. Full-sync 6-surface CONFIG_MAP F28 include alias? **
**Kontrak-documentation**: explicitly aliased. Bila user hand-edit user-config tapi pakai `indicators.enabled` (key salah) → tak pickup. **Worth-F28 audit** — CONFIG_MAP documentation explicit alias.

### E.7 — `paperTrading` / `usePaperHistoryWhenLive` flag eksperimen ada di `config.experiments`, **TAPI boolean flag paperTrading juga tak ada key user-config alias** — `u.paperTrading` direct flat read
**Lokasi**: config.js:469 + 478.
**Temuan**: `paperTrading: u.paperTrading ?? false` (`:469`) + `usePaperHistoryWhenLive: u.usePaperHistoryWhenLive ?? false` (`:478`). User-config flat key `paperTrading`, tak nested chartIndicators/promptNotes style. Konsisten dengan darwin flat — TAPI kontrak experiments GRUP 16 di CLAUDE.md ada flag lain flat (`exitLiquidityCheck`/`marketRegimeGate` dst). Semua flat utk experiments. Konsisten. **Not-a-bug**. Document — experiments keys all-flat-root.

### E.8 — `learning.evolveEnabled` user-config flat-key `evolveEnabled`, tak nested `learning.*` — asimetri dengan darwin flat
Lokasi: config.js:312-314.
**Temuan**: `learning: { evolveEnabled: u.evolveEnabled ?? true }`. User-config flat-key `evolveEnabled`, config nested `learning.evolveEnabled`. Darwin flat read (`u.darwinEnabled`) — config nested `darwin.enabled`. Asimetri pattern dengan CLAUDE.md "deliberate"? `learning.evolveEnabled` di dokumentasi vs user-key `evolveEnabled`. Worth document — bikin konsisten utk user-discovery.

### E.9 — `activeSetup` mutation via `reloadScreeningThresholds:639` — bila user punya 2 tab Telegram open `/set activeSetup X` + reload race condition
**Lokasi**: config.js:639.
**Temuan**: `if (fresh.activeSetup !== undefined) config.activeSetup = fresh.activeSetup;` — bila `reloadScreeningThresholds` jalan bersamaan dengan `/preset use X` F29 (yang mutate `config.activeSetup` kemudian persist lewat `applyPreset` path) → race: reloadScreeningThresholds bisa overwrite `config.activeSetup` dengan value lama dari disk TEPAT sebelum `applyPreset` write new. **Node single-threaded** → tak parallel true race, TAPI async `async` chain seperti `applyPreset` bila reload sebelum persist-finish → race.
**Mitigasi existing**: `applyPreset` F29 persist before mutusi live? Worth F29 verify.
**Worth-document** — concurrency-mutation singleton concern.

### E.10 — `pnl.source` pakai `pnlSource` flat-key (legacy alias), tak `pnl.source` nested
Lokasi: config.js:352.
**Temuan**: `source: nonEmptyString(u.pnlSource, "rpc")`. User-config flat `pnlSource`, config.js `pnl.source`. Konsisten dgn darwin/learning flat style. Document.

---

## §F — Glosarium istilah fase

- **singleton `config`** — `config.js:107` export 19-section obj ~165 key. Central source of truth. 170 import.
- **19-section** — profile/activeSetup/promptNotes + risk/screening/gmgn/management/strategy/schedule/llm/learning/darwin/tokens/hiveMind/api/pnl/jupiter/indicators/experiments/reports.
- **165-key** — total user-config flat keys acknowledged.
- **env-promotion** — `process.env.X ??= u.x` 10-key propagate. `:55-66`.
- **MIN_SAFE_BINS_BELOW** — `:35` konstanta 35. Strategy bins hard-floor.
- **strategy bins cascade** — min/max/default round + clamp + hard-floor.
- **legacyBinsBelow** — `:42` deprecated alias utk bins-below backward-compat.
- **twin contract** — `minDeployAmount()` shared antara `computeDeployAmount` + `executor.js:1005` safety-check — anti-stuck-retry.
- **computeDeployAmount** — `:528` 2-mode `fixed`/`maximize`.
- **sizingMode** — `management.sizingMode` "fixed" default / "maximize" adaptive-split.
- **maximize adaptive-N** — iterate n down, take first per-slot ≥ min, return 0 bila all-fail.
- **Math.floor ×1000/1000** — `:546` never-round-up balance invariant.
- **deployable** — `walletSol - reserve` (fixed) atau `walletSol - reserve - rent×N` (maximize).
- **gasReserve** — `:236` reserve-cycle. Rent-per-position reserved only in maximize.
- **rentPerPositionSol** — `:253` SOL locked as DLMM rent per open position. Fixed=0 ignored; maximize reserves.
- **persistConfigChange** — `:589` auto-tuner-only write path. Inline-mutate singleton + persist flat-key. Single caller live F25.
- **reloadScreeningThresholds** — `:606` re-read 56-key whitelist utk hot-edit + post-evolve F20.
- **3 mutation path** — direct / persist+mutate / structured reload.
- **normalizePromptNotes** — `:77` plain array or object → per-role; malformed → empty.
- **applyConvictionSizing** — `:572` 🧪 experiment #6. Multiplier high/low re-clamp. Gate `experiments.convictionSizing`.
- **indicatorsUserConfig** — `u.chartIndicators ?? {}` pre-resolved. User-key `chartIndicators`, config-section `indicators` (alias asimetri).
- **factory** — default OFF behavior. byte-identical pre-feature.
- **legacy alias** — deprecated key utk backward-compat (`binsBelow`, `takeProfitFeePct`, `emergencyPriceDropPct`).
- **`??`**-chain — nullish-coalesce default tiap field.
- **numericConfig** — `:37` cast-string-to-number-or-null utk parse-hardening.

---

## §G — Link fase lain (cross-ref)

- **F25** (briefing auto-tune): `persistConfigChange` single caller live `maybeAutoTuneGasReserve` F25. Cross-verify E.2 state-divergence.
- **F27** (conviction + indicators + experiments): `applyConvictionSizing` + `config.experiments.*` + `config.indicators.*` surface dari config.js. F27 deeper-advance audit GRUP 16.
- **F28** (update_config): `update_config` tool structured mutation `config[field]=val` + persist + `reloadScreeningThresholds` consumer. 56-key whitelist coverage cross-verify E.3. `chartIndicators` key E.6 alias.
- **F29** (paths): `paths.userConfigPath`/`gmgnConfigPath` per-profil resolve. `addprofil` multi-startup config isolation.
- **F24** (reports): `config.screening`/`management` read-path di `buildRecommendations` + `buildRoleCostLines` F24 baca `config.llm.*Model`. Read-only.
- **F20** (evolveThresholds): `reloadScreeningThresholds` trigger post-evolve `lessons.js:311`. Ekses mutation between evolve → reload sync threshold baru.
- **F18** (exit mekanis state.js): `config.management.stopLossPct/trailingTriggerPct/trailingDropPct/minFeePerTvl24h/outOfRangeBinsToClose/outOfRangeWaitMinutes` + strategy.binsBounds feeding SCREENER exit computation.
- **F7** (deploy safety check): `minDeployAmount()` shared twin floor at `executor.js:1005`. Anti-stuck-retry contract.
- **F5** (prompt racikanRules): baca `config.promptNotes` per-role injection SCREENER/MANAGER/GENERAL.
- **F2** (runScreeningCycle/deploy plan): `computeDeployAmount` pre-deploy to hit slot budget.
- **F1** (env promotion startup): `:55-66` propagate user-config RPC/wallet/llm/dryRun/dst ke `process.env`.
- **F3** (exit mekanis): baca `config.management.stopLossPct` + trailing/yield/OOR utk poll trigger.
- **F30** (`/config`/`/setcfg`/`/settings` display): render 15-group `formatFullConfig` + mutate via `/setcfg` + reload.

---

## §H — Open-Q (bawa ke fase F27, F28, F29)

1. **E.1 readJsonIfExists try-catch-gap**: user-config korup → boot crash tanpa pesan. Wrap defensif. **Worth-fix** boot safety.
2. **E.2 persistConfigChange state-divergence**: bila persist throw, singleton new/file old → restart reset. Worth-fix sequetial mutate-after-persist-success OR restore-on-fail. Cross-verify F25 E.2.
3. **E.3 reload 56-key whitelist**: key baru di user-config via `update_config` F28 tool → startup-loaded but reload non-pickup. Cross-F28 `update_config` invariant check: tool harus per-key explicit alias utk reload?
4. **E.6 `chartIndicators` vs `indicators` alias**: user-key asimetri vs config-section. CONFIG_MAP F28 documentation explicit alias cross-verify.
5. **E.4 conviction `.toFixed(2)` round-up**: potensi konflik dengan maximize `Math.floor × 1000/1000` never-round-up. Bila wallet kecil + conviction high maximize per-slot — safety-check edge. Cross-F27 conviction edge audit.
6. **E.5 darwin flat-key vs `darwin.*` nested**: dokumentasi inconsistent schema utk user-discovery. Document clarifikasi.
7. **E.9 `activeSetup` race reload-vs-applyPreset**: bila async reload bermasalah utk activeSetup, race. Cross-F29 `applyPreset` mutate sequence verify (persist-first vs singleton-first).
8. **`computeDeployAmount` `.toFixed(2)` fixed-mode precision**: `0.98 × 1.3 = 1.274 → toFixed(2) = "1.27"` — round-down bila string, TAPI `parseFloat("1.27") = 1.27` OK. Fixed-mode consistency dengan maximize invariant? Fixed `parseFloat(result.toFixed(2))` (`:557`) — round-half-up via toFixed weirdness. Bila `0.005 ×` edge → 0.01, kebutuhan safety-check kecil? Document precision boundary.
9. **`pnl` section live flat-key**: `pnlSource` flat, `pnlPollIntervalSec` flat. Konsisten darwin-style. Document-style.
10. **GMGN section huge 30-key mappings via `gmgnValue`/`gmgnArray`**: GMGN config config kompleks — utk F13 cross-F29 (paths.gmgnConfigPath) isolasi per-profil GMGN also. Verify multi-profil mungkin kedepan/per-profil-GMGN.