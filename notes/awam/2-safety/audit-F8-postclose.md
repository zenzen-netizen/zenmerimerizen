# Audit F8 — Post-close + CONFIG_MAP + Full-sync 6-surface
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: `update_config` mutasi live config + persist user-config/gmgn-config (165 CONFIG_MAP); post-close auto-swap + recordPerformance trigger; **full-sync 6-surface rule** (CLAUDE.md:128) — bug di sini = config tak konsisten antar UI; 5 mutator kontrak-kunci cegah accidental ruin.
> Cross-ref: F7 (safety gate + executeTool post-success), F6 (definitions 165-key desc), F26 (config.js clamp), F28 (reloadScreeningThresholds), F19 (lessons addSadly + recordPerformance), F30/F31 (Telegram UI), F29 (preset snapshot).

## Ringkasan eksekutif (5 baris)
1. `update_config` impl (executor.js:300-736) 4 phase: **coerce → validate → apply-live → persist**. Coerce flat `key/value` jadi `changes` (315-318); robust arg recovery (`path`, section-nested, bare-flat) (534-548); per-key validate via `validateConfigValue` (config-schema.js) — STRICT utk model-id/risk/sizing/known-enum, LIGHT type-check rest; apply-live mutate `config.section.field[third]` (622-640); persist GMGN → `gmgn-config.json` dan lain → `user-config.json` (656-711); post-persist strategi clamp + cron-restart + add-lesson `[SELF-TUNED]` (720-735).
2. **Post-close flow** (executor.js:799-820): `close_position` success → `notifyClose` (recorded_pnl_usd ?? pnl_usd) → `addPoolNote` low-yield (bila `args.reason` lowercase "yield") → `swapBaseToSolWithRetry` (anti LLM swap ulang via `result.auto_swap_note`) bila `!args.skip_swap && result.base_mint`. Auto-swap fail-open `.catch` log executor_warn. Close call ke executor, **recordPerformance trigger di `closePosition` dlmm.js (F10, F19)**, BUKAN di executor — executor hanya post-wiring.
3. **CONFIG_MAP** (321-504) `flatKey → [section, field, third?]` array. 165 keys across 13 sections. Casse-insensitive lookup via `CONFIG_MAP_LOWER` (511-513). `STRATEGY_BIN_KEYS` clamp `MIN_SAFE_BINS_BELOW=35` (514). `ARRAY_KEYS` (520-522) split-string handling ("trending,new"). Nested field (`third` string) utk `gmgn.indicatorRules.*`, `indicators.chartIndicators.*` (dual-persist path via `Array.isArray(persistPath)` 660-667). `evolveEnabled` flag → `learning.evolveEnabled` (503, freeze toggle F20).
4. **Full-sync 6-surface rule** CLAUDE.md:128 — bug ditemukan: 3 key (`adaptiveScreening`, `maxScreeningIntervalMin`, `minFeePerTvl24h`) ada di CONFIG_MAP (389,390,350) + formatFullConfig (index.js:1912-1913 + GRUP `management` includes minFeePerTvl24h via F3 prompt) + renderSettingsMenu/pageForKey (2415-2416) + SETTINGS-GUIDE (833,844) — TAPI **TIDAK ada di `update_config` schema desc** (definitions.js:404 sebut hanya "Schedule: managementIntervalMin, screeningIntervalMin, healthCheckIntervalMin"; line 402 `Management:` tak sebut `minFeePerTvl24h`). Akibat: user LLM tak akan set 3 key ini via chat (model tak tahu key valid). Cross-F5/F6/F3 — bug kontrak-kunci partial-sync.
5. **Post-success wiring sinkron** (794-832): `swap_token` notifySwap (795) `deploy_position` notifyDeploy (797) `close_position` notifyClose + addPoolNote-conditional + swapBaseToSolWithRetry (810) `claim_fees` auto-swap gated `autoSwapAfterClaim` + USD≥0.10 (821-832). Semua notify/swap `.catch` fail-open — resultreturned ke LLM apapun hasil wiring. `logAction` decision-log persist dijalankan regardless success/fail (786-792 / 839-845).

## Progress
- [x] Baca executor.js 1-200 (helpers + validateDeployPoolThresholds)
- [x] Baca 200-540 (toolMap + CONFIG_MAP start)
- [x] Baca 540-720 (update_config apply/persist/lesson/cron restart)
- [x] Baca 720-1104 (WRITE_TOOLS + executeTool + runSafetyChecks)
- [x] Cross-cek full-sync 6-surface: CONFIG_MAP, definitions desc, formatFullConfig, renderSettingsMenu/pageForKey, BOT_COMMANDS (n/a utk key), SETTINGS-GUIDE
- [x] Detect 3 key gap: adaptiveScreening + maxScreeningIntervalMin + minFeePerTvl24h
- [x] Tulis §A-§H
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Petugas packing + gudang pasca penjualan*: barang dibeli (close) → petugas wrapping → customer di-notify (notifyClose) → sisa barang (base token) di-swap balik jadi mata uang dasar (auto-swap ke SOL) → catatan transaksi di-stempel (recordPerformance) → masuk arsip (lessons.json). Tiap step bisa gagal tapi transaksi tetap selesai → fail-open wrapping (supaya close tak gantung).
- *Payment gateway update config*: kayak Stripe dashboard: user ubah 1 setting via chat (`update_config`) → coerce format → validate value → update live config memory → persist ke file → restart cron kalau interval berubah. Tapi ada 6 etalase lain yang juga harus tau update (`/config` button menu, /settings guide, etc). Kalau cuma 1 etalase update = bug siluman. Kontrak CLAUDE.md `full-sync 6-surface`.

**Di bot, ini = `update_config` impl + post-close wiring + CONFIG_MAP 165-key + full-sync 6-surface check**: dari executor.js. Inti dua: (1) tutup posisi → kirim notify + auto-swap + record perf, (2) update config dari chat → mutate live + persist + 6 etalase harus sinkron.

**Posisi fase ini di alur bot**
F8 = petugas pasca. Datang SETELAH F7 (safety) sukses. Saat `close_position` berhasil → F8 wiring notifyClose ke Telegram, auto-swap base→SOL via `swapBaseToSolWithRetry`, lalu `recordPerformance` (di dlmm.js F10 → lessons.js F19). Saat `update_config` dipanggil (dari chat atau LLM) → F8 jalankan 4 phase: coerce → validate → apply-live → persist. Lapisan 3 + 4 (Mesin + Belajar). Tanpa F8, close sukses tapi modal gantung di base token (tak di-swap) + nggak tercatat di lessons (tak belajar).

**Langkah kerja F8 — post-close wiring (executor.js:799-832)**
1. `close_position` success detected.
2. `notifyClose` ke Telegram (pnl_usd / recorded pnl) → wrap `.catch` fail-open.
3. Bila `args.reason` lowercase "yield" → `addPoolNote` ke pool-memory (note "low-yield close") → `.catch` fail-open.
4. Bila `!args.skip_swap && result.base_mint` (posisi punya base token sisa) → `swapBaseToSolWithRetry` (anti LLM swap ulang via `result.auto_swap_note`). `.catch` fail-open → close tetap sukses walau swap gagal.
5. `recordPerformance` TRIGGER ada di dlmm.js `closePosition` (F10 → F19), bukan executor — executor hanya wiring.

**Langkah kerja F8 — `update_config` impl (executor.js:300-736)** 4 phase:
1. **Coerce** (315-318): bila panggilan lewat `key/value` flat → coerce jadi `changes` objek. Arg recovery robust (`path`, section-nested, bare-flat).
2. **Validate** (per-key via `validateConfigValue` dari config-schema.js — STRICT utk model-id/risk/sizing/known-enum, LIGHT type-check sisanya). Tolak angka negatif, enum tak valid, dll.
3. **Apply-live** (622-640): mutate langsung `config.section.field[third]` di singleton live. Konfigurasi berlaku EFEK segera untuk cron / cycles berikut.
4. **Persist** (656-711): GMGN → `gmgn-config.json`, lainnya → `user-config.json`. Penulisan ke disk pakai `JSON.stringify` + atomic.
5. **Post-persist** (720-735): strategi clamp `MIN_SAFE_BINS_BELOW=35` → `reloadScreeningThresholds` re-baca promptNotes + activeSetup → kalau `managementIntervalMin`/`screeningIntervalMin` berubah → cron restart via `registerCronRestarter` (F1) → add-lesson `[SELF-TUNED]` ke lessons.json (jejak config-change).

**`CONFIG_MAP` 165-key (321-504)** — flat-key → `[section, field, third?]` array. Case-insensitive lookup via `CONFIG_MAP_LOWER`. 13 sections: screening / management / risk / schedule / llm / experiments / gmgn / hive / api / pnl / indicators / reports / learning. Nested field (`third` string) utk `gmgn.indicatorRules.*`, `indicators.chartIndicators.*` (dual-persist path). `STRATEGY_BIN_KEYS` clamp 35 multi-layer. `ARRAY_KEYS` split-string ("trending,new"). `evolveEnabled` flag → `learning.evolveEnabled` (freeze toggle F20).

**Bug kontrak-kunci — full-sync 6-surface partial (F8 #4)**: 3 key (`adaptiveScreening`, `maxScreeningIntervalMin`, `minFeePerTvl24h`) ada di CONFIG_MAP + formatFullConfig + renderSettingsMenu + SETTINGS-GUIDE — TAPI **TIDAK ada di `update_config` schema desc** (definitions.js:404 cuma sebut Schedule: managementIntervalMin, screeningIntervalMin; line 402 tak sebut `minFeePerTvl24h`). User LLM tak tau key valid → tak bisa set via chat. Bug partial-sync. CLAUDE.md:128 diwaankan. Roadmap kontrak-kunci.

**Output F8**: 
- Post-close: Telegram notify, sisa token ke SOL, perf masuk lessons.json.
- Config update: live mutate + persist file + cron restart kalau perlu + lesson `[SELF-TUNED]` + 5 surface seharusnya sinkron (ada gap bug).

**Kalau F8 rusak / diskip**
- Post-close mati: close sukses tapi token sisa gantung (tak swap), bot anggur modal base di wallet.
- recordPerformance tak ke-trigger (kalau di executor) → lessons kosong → `evolveThresholds` tak punya data → no learning loop. Tapi recordPerformance di-trigger di dlmm.js (F10), jadi executor wiring cuma bonus — fail-open.
- update_config mati: user bisa atur via `/settings` button + file edit langsung, tapi tak via chat LLM. Atau sebaliknya: 6-surface check mati → user set via chat, tapi `/config` tak menampilkan → bingung "yang mana sync?".
- Cron restart mati: interval ubah tapi tak restart → bot pake interval lama diam-diam → timing wrong silently.

**Istilah yang muncul di fase ini**
- **post-close wiring** — hook `close_position` success → notifyClose + addPoolNote + swapBaseToSolWithRetry. Wrap `.catch` fail-open supaya close tak gantung di wiring.
- **`swapBaseToSolWithRetry`** — auto-swap sisa base token ke SOL via Jupiter. Cegah modal cangkang di base.
- **`recordPerformance`** — TRIGGER di `closePosition` dlmm.js (F10) → `lessons.js` (F19) → masuk performance[] arsip.
- **`update_config`** — tool master modify config. 4 phase: coerce → validate → apply-live → persist.
- **CONFIG_MAP** — map 165-key flat ke `[section, field, third?]`. Case-insensitive. 13 sections.
- **full-sync 6-surface** — config baru wajib muncul di: (1) CONFIG_MAP (`/setcfg`), (2) update_config desc (definitions), (3) formatFullConfig (`/config`), (4) renderSettingsMenu button menu, (5) BOT_COMMANDS/`/help`, (6) SETTINGS-GUIDE. Button menu = paling sering terlewat (CLAUDE.md).
- **STRATEGY_BIN_KEYS** — subset CONFIG_MAP yang clamp `MIN_SAFE_BINS_BELOW=35` multi-layer.
- **`reloadScreeningThresholds`** — re-baca `promptNotes` + `activeSetup` dari user-config sebelum prompt berikutnya. Tak perlu restart.
- **`registerCronRestarter`** — hook ke index.js:3510 → kalau interval berubah, panggil `startCronJobs` ulang.
- **add-lesson `[SELF-TUNED]`** — jejak config diubah via LLM → masuk lessons.json untuk audit trail.
- **evolveEnabled flag** — toggle freeze learning evolution (F20). `learning.evolveEnabled` di CONFIG_MAP.
- **fail-open wiring** — `.catch` log → close tetap sukses walau notify/swap gagal.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| executor.js:300-736 | `update_config` impl | 4 phase coerce/validate/apply/persist |
| executor.js:305-314 | `coerceConfigValue` | string → bool/null/number coercion |
| executor.js:315-318 | flat key/value fallback | weak-model recovery |
| executor.js:321-504 | `CONFIG_MAP` | 165-key flat map → `[section, field, third?]` |
| executor.js:48-63 | `SENSITIVE_CONFIG_KEYS` + redact | 3 apiKey redact |
| executor.js:510-513 | `CONFIG_MAP_LOWER` | case-insensitive resolve |
| executor.js:514 | `STRATEGY_BIN_KEYS` | Set 4 keys utk clamp MIN_SAFE_BINS_BELOW |
| executor.js:520-522 | `ARRAY_KEYS` | split string → array utk 4 list keys |
| executor.js:534 | `resolveKey` | case-insensitive lookup fn |
| executor.js:535 | `KNOWN_SECTIONS` | set 13 section-name utk section-nested recovery |
| executor.js:536-539 | `path` arg recovery | `{path:"management.x", value:y}` → key |
| executor.js:540-548 | bare-flat + section-nested recovery | robust utk weak model |
| executor.js:550-566 | per-change normalize loop | array split + strategy bin clamp + schema gate |
| executor.js:568-570 | `validateConfigValue` call | config-schema.js STRICT/LIGHT gate |
| executor.js:572-589 | no-op dedup vs live config | cegah 60+ identical writes (historical bug) |
| executor.js:591-603 | empty-applied path | invalid-only reject / unchanged no-op / unknown reject |
| executor.js:605-613 | read existing user-config.json | parse-error fail-SAFE |
| executor.js:615-624 | timeframe auto-scale | `scaleScreeningToTimeframe` bila user tak set fee/vol eksplisit |
| executor.js:622-640 | apply to live config | mutate `config.section.field[third]` dengan log before/after |
| executor.js:641-649 | strategyLock post-clamp | invalid → reset "default"; VALID_LOCKS list |
| executor.js:651-664 | strategy bins post-clamp | min/max/defaultBinsBelow re-clamp minimal + clamp range |
| executor.js:656-711 | persist ke user-config/gmgn-config | nested persistPath gmgn-config.json indicator+chartIndicators, else user-config.json |
| executor.js:713-718 | cron restart hook | bila interval changed → `_cronRestarter()` |
| executor.js:720-729 | self-tune lesson | filter ephemeral interval keys + addLesson `[SELF-TUNED]` |
| executor.js:731-735 | return result | `{success, applied(redacted), unknown, unchanged, invalid, reason}` |
| executor.js:740-745 | `WRITE_TOOLS` Set | 4 on-chain write |
| executor.js:746-749 | `PROTECTED_TOOLS` | WRITE_TOOLS + self_update |
| executor.js:754-853 | `executeTool` | dispatcher |
| executor.js:794-832 | post-success wiring per tool | notifyDeploy/notifyClose/notifySwap + auto-swap |
| executor.js:799-820 | `close_position` post | notifyClose + addPoolNote low-yield + swapBaseToSolWithRetry |
| executor.js:800-803 | notifyClose recorded_pnl priority | `recorded_pnl_usd ?? pnl_usd` (sinkron F9 recompute) |
| executor.js:805-808 | addPoolNote low-yield conditional | bila args.reason lowercase "yield" → pool memory "low-yield note" |
| executor.js:810-819 | swapBaseToSolWithRetry | auto-swap base→SOL post-close bila !skip_swap + base_mint |

## §B. Alur `update_config` hulu→hilir (ASCII)

```
ENTER update_config({changes, key, value, path, reason})                                  [:300]
  │
  ├─ coerceConfigValue(v) — string → bool/null/number                                       [:305]
  ├─ if changes empty AND key non-empty string → changes = {[key]: coerce(value)}             [:315-318]
  ├─ if changes non-object → changes = {}                                                       [:319]
  │
  ├─ CONFIG_MAP (321-504) declared inline (closure scope)                                       [:321]
  ├─ CONFIG_MAP_LOWER case-insensitive                                                          [:511]
  ├─ STRATEGY_BIN_KEYS / ARRAY_KEYS declared                                                     [:514,520]
  │
  ├─ resolveKey(k) = CONFIG_MAP[k] ?? CONFIG_MAP_LOWER[k.toLowerCase()]?.[0]                    [:534]
  ├─ KNOWN_SECTIONS = {screening,management,risk,schedule,llm,strategy,hiveMind,api,gmgn,indicators,chartIndicators,experiments,reports,tokens,darwin,learning}  [:535]
  │
  ├─ Recovery khusus weak-model:
  │   ├─ if changes empty AND path string non-empty → resolveKey(path.split(".").pop()) → changes[rk]=value  [:536-539]
  │   ├─ for (k,v) of args (skip changes/key/value/path/reason):
  │   │     if typeof v object && !Array && KNOWN_SECTIONS.has(k) → for (sk,sv) fold → changes[resolveKey(sk)] = sv   [:540-543]
  │   │     else → changes[resolveKey(k)] = v                                                                                [:544-547]
  │
  ├─ Per-change normalize loop (550-566):
  │   for (key, val) of changes:
  │     ├─ match = CONFIG_MAP[key] ?? CONFIG_MAP_LOWER[key.toLowerCase()]
  │     ├─ !match → unknown.push(key); continue
  │     ├─ normalizedVal = coerceConfigValue(val)
  │     ├─ ARRAY_KEYS.has(match[0]) AND string → split "," → trim → filter Boolean              [:553-555]
  │     ├─ STRATEGY_BIN_KEYS.has(match[0]) → numericVal finite check; Math.max(MIN_SAFE_BINS_BELOW, Math.round(numericVal))   [:557-562]
  │     ├─ verr = validateConfigValue(match[0], normalizedVal)                                  [:565]
  │     │     └─ if verr → invalid.push({key, value, error}); continue                           [:566]
  │     └─ applied[match[0]] = normalizedVal                                                    [:567]
  │
  ├─ No-op dedup vs live config (572-589):
  │   for key of Object.keys(applied):
  │     ├─ [section, field, third] = CONFIG_MAP[key]
  │     ├─ current = (typeof third string) ? config[section]?.[field]?.[third] : config[section]?.[field]
  │     ├─ if (next null OR typeof next !== object) AND current === next → delete applied[key]; unchanged.push(key)   [:585-588]
  │   (skalar-only; array/obj fall through)
  │
  ├─ if applied empty:
  │     ├─ invalid.length > 0 → log + return {success:false, invalid, unknown, reason}           [:593-597]
  │     ├─ unchanged.length > 0 → log "no-op" + return {success:true, applied:{}, unchanged, noop:true, reason}  [:598-602]
  │     └─ else → log unknown + return {success:false, unknown, reason}                          [:603-605]
  │
  ├─ read user-config.json (607-613):
  │   └─ parse error → return {success:false, error:"Invalid user-config.json"} (fail-SAFE)
  │
  ├─ Timeframe auto-scale (615-624):
  │   if applied.timeframe != null AND minFeeActiveTvlRatio == null AND minVolume == null:
  │     ├─ tf = normalizeTimeframe(applied.timeframe)
  │     ├─ scaled = scaleScreeningToTimeframe(tf)
  │     ├─ applied.minFeeActiveTvlRatio = scaled.minFeeActiveTvlRatio
  │     ├─ applied.minVolume = scaled.minVolume
  │     ├─ applied._timeframeScaled = true  (skip dari persist? lihat 636 `if (key.startsWith("_")) continue`)
  │     └─ log "auto-scaled"
  │
  ├─ Apply to live config (622-640):
  │   for (key, val) of Object.entries(applied):
  │     if key.startsWith("_") continue  ← skip internal flag
  │     ├─ [section, field, third] = CONFIG_MAP[key]
  │     ├─ isNestedField = typeof third === "string"
  │     ├─ if isNestedField:
  │     │     config[section][field] ||= {}
  │     │     before = config[section][field][third]
  │     │     config[section][field][third] = val
  │     │     log "update_config: config.section.field.third before → val (redacted)"
  │     └─ else:
  │           before = config[section][field]
  │           config[section][field] = val
  │           log "update_config: config.section.field before → val (verify: redacted)"
  │
  ├─ strategyLock post-clamp (641-649):
  │   if applied.strategyLock != null:
  │     VALID_LOCKS = ["default","spot","bid_ask","curve"]
  │     if !VALID_LOCKS.includes(config.strategy.strategyLock) → reset "default" + applied juga
  │
  ├─ Strategy bins post-clamp (651-664):
  │   if applied.binsBelow/minBinsBelow/maxBinsBelow/defaultBinsBelow:
  │     config.strategy.minBinsBelow = max(MIN_SAFE_BINS_BELOW, round(config.strategy.minBinsBelow ?? 35))
  │     config.strategy.maxBinsBelow = max(min, round(config.strategy.maxBinsBelow ?? min))
  │     config.strategy.defaultBinsBelow = max(min, min(max, round(config.strategy.defaultBinsBelow ?? max)))
  │
  ├─ Persist (656-711):
  │   gmgnConfig ||= parse gmgn-config.json (kalau ada)
  │   for (key, val) of Object.entries(applied):
  │     if key.startsWith("_") continue
  │     ├─ [section, field, third] = CONFIG_MAP[key]
  │     ├─ persistPath = Array.isArray(third) ? third : null  ← gunakan third-as-array utk dual-config
  │     ├─ nestedField = typeof third === "string"
  │     ├─ if section === "gmgn":
  │     │     if nestedField → gmgnConfig[field] ||= {}; gmgnConfig[field][nestedField] = val
  │     │     else → gmgnConfig[field] = val
  │     │     wroteGmgnConfig = true; continue
  │     ├─ if persistPath.length > 0:
  │     │     target = userConfig
  │     │     for part of persistPath.slice(0,-1) → target[part] ||= {}; target = target[part]
  │     │     target[last] = val
  │     └─ else → userConfig[key] = val
  │     wroteUserConfig = true
  │   if wroteUserConfig → userConfig._lastAgentTune = tunedAt; fs.writeFileSync(USER_CONFIG_PATH, prettified)
  │   if wroteGmgnConfig → gmgnConfig._lastAgentTune = tunedAt; fs.writeFileSync(GMGN_CONFIG_PATH, prettified)
  │
  ├─ Cron restart (713-718):
  │   if applied.{managementIntervalMin|screeningIntervalMin|pnlPollIntervalSec} != null AND _cronRestarter:
  │     _cronRestarter()
  │     log "Cron restarted"
  │
  ├─ Self-tune lesson (720-729):
  │   lessonsKeys = Object.keys(applied).filter(!startsWith("_") && !="managementIntervalMin" && !="screeningIntervalMin")
  │   if lessonsKeys.length > 0:
  │     summary = `${k}=${redactConfigValue(k, applied[k])}` joined
  │     addLesson(`[SELF-TUNED] Changed ${summary} — ${reason}`, ["self_tune","config_change"])
  │   (interval changes skip — ephemeral per-deploy noise historical)
  │
  └─ return {success:true, applied:redactAppliedConfig(applied), unknown, unchanged, invalid, reason}    [:735]
```

## §C. Post-close wiring sinkron tabel

| Trigger (file:line) | Action | Gate | Fail-mode |
|---|---|---|---|
| `executeTool` close_position success (799-820) | `notifyClose` (telegram.js) | `result.success !== false && !error` (784) | `.catch(()=>{})` silent |
| `executeTool` close_position + `args.reason.toLowerCase().includes("yield")` (805) | `addPoolNote` pool memory "low-yield" | `args.reason` non-null + `poolAddr` non-null | `?.()` optional-chaining catch |
| `executeTool` close_position + `!args.skip_swap && result.base_mint` (810) | `swapBaseToSolWithRetry` | head-of-success | `.catch` log executor_warn; `result.success` tetap true |
| `executeTool` claim_fees + `autoSwapAfterClaim` config + token USD≥0.10 (821-831) | `swapToken` (direct, no retry) | `balances.tokens.find(mint === base_mint).usd ≥ 0.10` | try/catch log executor_warn |
| `executeTool` deploy_position success (797) | `notifyDeploy` (pair/amountSol/position/tx/priceRange/binStep/baseFee) | `result.success` | `.catch(()=>{})` |
| `executeTool` swap_token + result.tx (795) | `notifySwap` | `result.tx` truthy | `.catch(()=>{})` |
| `executeTool` tiap exec (786-792, 839-845) | `logAction` ke decision-log.json | always (success/fail split) | decision-log persist |
| `update_config` post-apply (728) | `addLesson [SELF-TUNED] ... config_change` | `lessonsKeys.length > 0` | persist lesson |
| `update_config` interval change (715-718) | `_cronRestarter()` | `applied.{3 keys} != null && _cronRestarter` | restart cron F1 |
| `closePosition` (dlmm.js F10) | `recordPerformance` → lessons.json + briefings | inside dlmm.js | dipicu post-onchain-close; `paper:true` tag untuk paper |

## §D. Logika kunci per fungsi

### `update_config` (300-736)
- **Apa**: pulse config runtime + persist file + cron-restart + lesson capture.
- **Kapan**:
  - LLM GENERAL chat intent "config" (F4 INTENT_TOOLS.config, GENERAL-only, F4:50).
  - SCREENER/MANAGER gak bisa call (`SCREENER_TOOLS`/`MANAGER_TOOLS` tak include) — tapi SCREENER prompt F5 line 89-92 menyuruh `update_config` POST-DEPLOY-INTERVAL (INGIN — Open-Q F5 #8).
  - `/setcfg` Telegram command (F31) → call path sama via `applySettingsMenuCallback`.
- **Output**: result `{success, applied (redacted), unknown, unchanged, invalid, reason}`.
- **Sinkron multi-layer**:
  1. **coerce** (305-318): weak-model `{key,value}` jadi `{[key]: coerceValue}`.
  2. **robust recovery** (534-548): `{path, value}` / `{management: {x: y}}` / bare-flat — semua di-fold ke `changes`.
  3. **normalize-loop** (550-566): array-split, strategy-clamp, schema gate. Schema STRICT utk model-id/risk/sizing/known-enum, LIGHT type-check rest (config-schema.js F26).
  4. **no-op dedup** (572-589): skip identical-live-config change (historical bugfix 60+ identical writes).
  5. **apply-live** (622-640): mutate `config.section.field[third]` w/ log.
  6. **post-clamp** (641-664): strategyLock reset default bila invalid; strategy bins re-clamp floor & range.
  7. **persist** (656-711): GMGN → `gmgn-config.json`; nested chartIndicators path `["chartIndicators",field]` di user-config (arg `third` sebagai `Array<string>` persistPath); else `userConfig[key]`.
  8. **cron-restart** (713-718): 3 interval key trigger.
  9. **lesson capture** (720-729): skip ephemeral interval (anti-noise); addLesson `[SELF-TUNED]`.
- **Fail-mode**:
  - Invalid user-config.json parse → return fail-SAFE (605-613).
  - validateConfigValue reject → invalid array (565-567) "applied the rest".
  - `applied._timeframeScaled = true` di-skip persist (636 `if (key.startsWith("_")) continue`).
  - Duplicate keys dedup case-insensitive (CONFIG_MAP_LOWER).
- **Kontrak kunci ditegakkan**:
  - **`promptNotes` TIDAK ada di CONFIG_MAP** → tak bisa `update_config` (CLAUDE.md:200 file-only racikan invariant).
  - **`strategyLock` invalid reset "default"** (641-649) — defense vs user typo.
  - **STRATEGY_BIN_KEYS** clamp `MIN_SAFE_BINS_BELOW=35` (514, 557-562) — multi-layer dengan F7 gate + F26 config.js.
  - **redact `SENSITIVE_CONFIG_KEYS`** (48, 54-57) di log + applied return utk 3 apiKey.
  - **lesson filter ephemeral interval** (723-724) — `managementIntervalMin` / `screeningIntervalMin` diganti tiap deploy per-vol → skip dari lesson noise.
- **Bukti**: 300-736.

### `close_position` post-success auto-swap (799-820)
- **Apa**: setelah `closePosition` on-chain sukses, otomatis swap base→SOL bila user tak skip.
- **Kapan**: tiap close_position success.
- **Output**: mutasi `result.auto_swapped=true` + `result.auto_swap_note` + `result.sol_received` (inform LLM tak swap ulang).
- **Sinkron**: 
  - `swapBaseToSolWithRetry` (wallet.js F8) — retry wrapper Jupiter swap.
  - F4 `ONCE_PER_SESSION.has("swap_token")` (agent.js:245) — bila swap_token manual call setelah auto-swap, F4 block utk cegah double-swap. Defense dua-lapis dengan `result.auto_swap_note` di prompt context.
- **Fail-mode**: `.catch(e => log("executor_warn", ...))`; result tetap success (close sukses, swap gagal → token stuck, manual retry).
- **Kontrak `skip_swap`** (definitions.js:299-302): user `skip_swap=true` → hold base token, executor skip `swapBaseToSolWithRetry`.
- **Kontrak notifyClose recorded_pnl priority** (803): `recorded_pnl_usd ?? pnl_usd` utk headline Telegram match `/report` (F12 recompute). Comment 800-802 F9-light explainer.
- **Bukti**: 799-820, 803, 810-819.

### `addPoolNote` low-yield conditional (805-808)
- **Apa**: catat "low-yield" ke pool memory agar screener skip redeploy.
- **Kapan**: close_position success + `args.reason.toLowerCase().includes("yield")`.
- **Sinkron**: pool-memory.js `addPoolNote({pool_address, note})` — recall saat `getTopCandidates` (F14) dan SCREENER prompt "POOL MEMORY: Past losses or problems → strong skip signal" (F5:146).
- **Fail-mode**: `?.()` optional-chaining bila `addPoolNote` undefined — defensive import.
- **Note**: hanya cek `reason` lowercase "yield" — bila user pakai "lowyield"/"low-yield"/"fees too low" → tak trigger. String match sempit. Open-Q #4.
- **Bukti**: 805-808.

## §E. Temuan: full-sync 6-surface, gap, kontrak, defense

### E.1 — BUG: 3 key GAP di definitions.js update_config desc
- **`adaptiveScreening` + `maxScreeningIntervalMin`** (CONFIG_MAP executor.js:389-390) — present di 5 surface:
  - CONFIG_MAP ✓ (389,390)
  - formatFullConfig GRUP ✓ (index.js:1912-1913)
  - renderSettingsMenu + pageForKey ✓ (index.js:2415-2416)
  - SETTINGS-GUIDE ✓ (833,844)
  - **definitions.js update_config desc ✗** (line 404 sebut hanya "managementIntervalMin, screeningIntervalMin, healthCheckIntervalMin")
- **`minFeePerTvl24h`** (CONFIG_MAP:350) — present di:
  - CONFIG_MAP ✓
  - F3 prompt rule 5 (F3 §D) + F18 state.js `??60` floor (F3 Open-Q #4)
  - formatFullConfig GRUP management? — verify di F31. UNKNOWN (grep belum cek explicit).
  - SETTINGS-GUIDE — UNKNOWN verify.
  - **definitions.js update_config desc ✗** (line 402 `Management:` tak sebut)
- Akibat: user LLM chat `update_config({key:"adaptiveScreening", value:"true"})` — LLM lihat desc tak include, mungkin tolak call atau pilih arbitrary. Chat path `update_config` tetap terima (CONFIG_MAP valid) bila LLM coba; tapi LLM tidak tahu key ini valid utk dicoba.
- Mitigasi segera: tambah 3 key ke desc definitions.js line 404 + 402. Kontrak `full-sync 6-surface` CLAUDE.md:128 violated.
- Bukti: executor.js:389-390,350; definitions.js:404,402; index.js:1912-1913,2415-2416; SETTINGS-GUIDE:833,844.

### E.2 — Robust arg recovery (weak-model mitigation)
- 3 jalur fallback (534-548): `{path, value}`, section-nested `{management: {x: y}}`, bare-flat `{x: y}` di top-level args. Plus flat `key/value` (315-318). Total 4 jalan.
- Comment 529-533 eksplisit sebut weak model "invent shapes" — kebutuhan pragmatic recovery.
- Kontrak: `KNOWN_SECTIONS` (535) list 13 section; bila section-name unknown → bare-flat path (`resolveKey(k)`).
- Konsekuensi: arg non-config-key di args (misal metadata) di-fold ke changes bila kebetulan cocok CONFIG_MAP case-insensitive. Risk naming collision — `reason`/`path` di-skip explicit (541), tapi field lain bisa accidental match.
- Bukti: 529-548.

### E.3 — No-op dedup cegah lesson noise + cron restart spam
- Skalar `applied[key]` dibandingkan ke live `config[section][field[third]]` — bila sama → `unchanged` + delete `applied[key]` (572-589).
- Comment 568-571 historikal bug: 60+ identical writes dari parallel tool-calls (model re-send same change). Tiap write: cron restart + lesson add.
- Array/obj fall through (584-587 conditional `(next === null || typeof next !== "object")`).
- Konsekuensi: bila user set `minFeeActiveTvlRatio=0.05` saat live config 0.05 → return `{success, noop:true, unchanged}` tanpa persist/cron/lesson. Efisien.
- Bukti: 568-589, comment 568-571.

### E.4 — `_timeframeScaled` internal flag skip persist
- Timeframe auto-scale (615-624) set `applied._timeframeScaled = true` utk tracking —Tambahkan `if (key.startsWith("_")) continue` di apply (622) + persist (656). Konsekuensi: flag tak masuk `config` atau file. Internal tracking only.
- Bukti: 615-624, 622, 636, 656.

### E.5 — `cronRestart` trigger 3 key cron-restart
- `applied.managementIntervalMin != null || applied.screeningIntervalMin != null || applied.pnlPollIntervalSec != null` (714).
- `_cronRestarter()` dipanggil (715-716) — index.js register (F1) restart cron.
- Comment 720-722 skip lesson utk interval changes karena "ephemeral per-deploy" — SCREENER POST-DEPLOY prompt F5:89-92 menyuruh model update_config managementIntervalMin tiap deploy per volatility → 75+ lessons pure noise bila tidak skip.
- Kontrak kuat: ephemeral config tidak stack di lesson.
- Bukti: 713-729, F5:89-92.

### E.6 — `strategyLock` invalid reset "default"
- Post-apply clamp (641-649): bila `config.strategy.strategyLock` tak di `["default", "spot", "bid_ask", "curve"]` → reset "default".
- `applied.strategyLock = "default"` juga di-sync supaya persist tulis corrected value back.
- Defense vs invalid user input (`/setcfg strategyLock unknown` → validateConfigValue STRICT reject? config-schema.js verify F26). Doa-lapis: schema gate + post-clamp.
- Kontrak: prompt F5 line 150 "default flexible, else force-locked"; F7 gate-1 (executor.js:867-871) hard-override `args.strategy` bila locked.
- Bukti: 641-649, F7:867-871.

### E.7 — Strategy bins multi-clamp
- Post-apply (651-664): clamp `minBinsBelow` ≥ 35; `maxBinsBelow` ≥ min; `defaultBinsBelow` clamp [min, max].
- Defense vs user set `minBinsBelow=20` (below floor) atau `maxBinsBelow<min` inkonsisten.
- Multi-layer: (1) config.js clamp init/reload (F26), (2) executor CONFIG_MAP schema gate `STRATEGY_BIN_KEYS` (514, 557-562), (3) post-apply re-clamp (651-664), (4) F7 gate-6 (executor.js:916, 947). Empat lapis cegah bins-floor corrupt.
- Bukti: 514, 557-562, 651-664, F7:916,947.

### E.8 — Sensitive key redact
- `SENSITIVE_CONFIG_KEYS = {gmgnApiKey, hiveMindApiKey, publicApiKey}` (48-52).
- Log mutated field + return `applied` dipakai `redactAppliedConfig` (59-63) → `***redacted***` placeholder.
- Kontrak cegah secret leak ke Telegram/decision-log.
- Bukti: 48-63, 727, 734.

### E.9 — recordPerformance trigger di dlmm.js, BUKAN executor
- `close_position` post-success executor (799-820) tak call `recordPerformance` langsung.
- `closePosition` dlmm.js (F10) yang call `recordPerformance` (lessons.js F19) post-onchain. Executor hanya post-wiring (notify + auto-swap).
- Kontrak: PnL recorded via dlmm.js post-close → lessons.json + briefings stats; `paper:true` tag utk paper isolasi (CLAUDE.md:153).
- Bukti: F10 dlmm.js `closePosition` → `recordPerformance`; executor.js:799-820 wiring only.

### E.10 — `claim_fees` auto-swap direct call tak retry
- `claim_fees` success + `autoSwapAfterClaim` + token USD≥0.10 → `swapToken` (827) direct, TANPA `swapBaseToSolWithRetry` wrapper.
- Risk: Jupiter temp error → token stuck (retry tak ada). Beda dengan close yang pakai retry.
- Unknown: konsistensi ad-hoc? Open-Q #3.
- Bukti: 821-831 vs 810-819.

### E.11 — `addPoolNote` low-yield narrow string match
- `args.reason.toLowerCase().includes("yield")` (805). Match substring "yield" — berasal `getDeterministicCloseRule` F3 rule 5 `reason:"low yield"` (index.js:1506).
- Substring match: "low yield" ✓; "fee yield drop" ✓ (false positive); "yielding" ✓ (false positive). TAPI konsisten utk trigger F3 reason.
- Risk: prompt reason free-text dari LLM `close_position` — bila LLM pakai "fees too low", "LP yield weak" dst. — tak trigger addPoolNote. String match sempit.
- Mitigasi: rebuild `args.reason` request dari LLM konsisten dengan F3 canonical. Open-Q #4.
- Bukti: 805-808.

### E.12 — `adaptiveScreening` di CONFIG_MAP tapi SCREENER_TOOLS gak bisa call
- `update_config` tak masuk `SCREENER_TOOLS` (F4:15) → SCREENER cron tak bisa self-mutate `adaptiveScreening`.
- TAPI `adaptiveScreening` read di `shouldRunScheduledScreening` (index.js:1189) — gating cron tick.
- Jalur ON: GENERAL chat (`/setcfg adaptiveScreening true`) atau `update_config` via interactive (`/settings` button, F31).
- Konsisten: cron hanya baca, user/LLM manual tulis. Aman.
- Bukti: F4:15, executor.js:389, index.js:1189.

## §F. Glosarium fase

- **CONFIG_MAP**: table `flatKey → [section, field, third?]` di executor.js:321-504; 165 keys.
- **CONFIG_MAP_LOWER**: case-insensitive resolve via lowercase duplikat table.
- **STRATEGY_BIN_KEYS**: 4 keys yang di-clamp ke `MIN_SAFE_BINS_BELOW=35` saat normalize.
- **ARRAY_KEYS**: 4 list-keys yang string-split `,` jadi array.
- **KNOWN_SECTIONS**: set 13 section-name utk weak-model section-nested recovery.
- **coerceConfigValue**: string → bool/null/number coercion saat `update_config` flat path.
- **resolveKey**: helper case-insensitive lookup antara CONFIG_MAP dan CONFIG_MAP_LOWER.
- **no-op dedup**: skip change bila `applied[key]` sama dengan live config (skalar only) — cegah cron-restart/lesson spam.
- **timeframe auto-scale**: saat user set `timeframe` tanpa explicit fee/vol → `scaleScreeningToTimeframe` re-scale `minFeeActiveTvlRatio`+`minVolume` (CLAUDE.md:97).
- **_timeframeScaled flag**: internal flag skip persist + apply (key start `_`).
- **_lastAgentTune**: timestamp flag di user-config.json/gmgn-config.json setiap write.
- **cron-restart hook**: 3 interval key (management/screening/pnlPoll) trigger `_cronRestarter` (F1).
- **strategyLock clamp**: invalid reset "default"; VALID_LOCKS `["default","spot","bid_ask","curve"]`.
- **strategy bins re-clamp**: post-apply floor `MIN_SAFE_BINS_BELOW=35` + range consistency.
- **(SENSITIVE_CONFIG_KEYS)**: 3 apiKey redact di log + applied return.
- **swapBaseToSolWithRetry**: wallet.js retry wrapper Jupiter swap base→SOL post-close.
- **autoSwapAfterClaim**: opt-in config — auto-swap claimed base token bila USD≥0.10.
- **minClaimAmount**: claim threshold (config.management) — `claim_fees` description "fees > $5" — verify F6 vs config default.
- **notifyClose recorded_pnl_usd priority**: `recorded_pnl_usd ?? pnl_usd` utk Telegram match `/report`.
- **addPoolNote low-yield**: `args.reason` match substring "yield" → pool memory catat utk screener skip.
- **logAction**: every executor tool exec persist ke decision-log.json.
- **GIN_lesson `[SELF-TUNED]`**: every applied config change (skip ephemeral interval) jadi lesson tagged `["self_tune","config_change"]`.
- **full-sync 6-surface rule**: every config key yang reachable dari Telegram bot WAJIB hadir di 6 surface — CONFIG_MAP + definitions desc + formatFullConfig + renderSettingsMenu/settingValue/pageForKey + BOT_COMMANDS (utk command, n/a key) + SETTINGS-GUIDE.
- **paper/live isolation**: `recordPerformance paper:true` tag — live consumer mode-scoped (CLAUDE.md:153, F32).

## §G. Open-Q (bawa ke F20/F26/F28/F30/F31)

1. **[F31 verify]** 3 key gap `adaptiveScreening`/`maxScreeningIntervalMin`/`minFeePerTvl24h` — verify tampilkan di `formatFullConfig` index.js:1466-1693 GRUP schedule/management? Bila `minFeePerTvl24h` missing dari `formatFullConfig`, full-sync juga leaky (bukan cuma definitions desc). Cross-ref F31.
2. **[F3/F8]** `minFeePerTvl24h` ada CONFIG_MAP tapi tak di desc definitions. User bisa `/setcfg minFeePerTvl24h 12` via Telegram button? Verify `settingValue` + `pageForKey` handle. Bila pageForKey tidak auto-cover, full-sync leak di button menu juga. Cross-ref F31.
3. **[F26]** `validateConfigValue` schema gate `STRICT` vs `LIGHT`划分 — apakah `adaptiveScreening` di list STRICT enum — boolean only? Bila user set "true" string → coerceConfigValue sudah bool. Verify F26 config-schema.js.
4. **[F20]** `evolveEnabled` flag false → `evolveThresholds` skip. CONFIG_MAP key `evolveEnabled` (503) → `learning.evolveEnabled`. Verify F20 lessons baca path konsisten.
5. **[F10/F19]** `closePosition` dlmm.js `recordPerformance` dipicu dimana exact? Executor gak call — verify di dlmm.js post-relay/public path.
6. **[F8死角]** `claim_fees` auto-swap direct `swapToken` tanpa retry wrapper (827). Open-Q consistency close path.
7. **[F8死角]** `addPoolNote` low-yield narrow match `reason.toLowerCase().includes("yield")`. `classifyCloseRule` reports.js (F24) ada canonical mapping? Verify rule-name drift anti-skip.
8. **[F28]** `reloadScreeningThresholds` (config.js) di-call oleh `update_config` saat? Tak terlihat di apply/persist flow executor.js. Mungkin `_cronRestarter` wrapper utk konsistensi? Cross-ref F28.
9. **[F9/F26]** `rentPerPositionSol` default factory 0 — user set bila accent. Balance check di F7 gate-12 honor reserve. Write ke user-config path field "rentPerPositionSol"? verify CONFIG_MAP line 380 → `["management", "rentPerPositionSol"]`. Aman flat.
10. **[F31死角]** `promptNotes` config key (racikan) sengaja tak masuk CONFIG_MAP utk file-only isolation. Tapi user chat "ganti racikan" → LLM jawab "tak bisa via update_config". UX gap sadar-by-design. Kontrak konsisten.

## §H. Cross-ref fase lain

- **F4**: `update_config` di `CHAT_CONFIRM_TOOLS` (F4:21 — interactive wajib confirm); di `GENERAL_INTENT_ONLY_TOOLS` (F4:23 — GENERAL-only access via intent).
- **F7**: `executeTool` dispatcher + post-success wiring close/deploy/swap/claim; `runSafetyChecks` case deploy_position tak validate `update_config` apapun.
- **F6**: `update_config` schema desc 165-key list — 3 key gap ditemukan di sini.
- **F26**: `validateConfigValue` schema (config-schema.js) gate STRICT/LIGHT; `applyConvictionSizing` re-clamp; `minDeployAmount()` shared floor; `strategyLock` VALID_LOCKS enum.
- **F28**: `reloadScreeningThresholds` config.js re-read tanpa restart possibly-related tapi tak di-call dari executor (depend oncron restart?).
- **F29**: preset snapshot — full user-config.json copy bawa semua key racikan; tidak lewat CONFIG_MAP.
- **F30**: Telegram `requestConfirmation` utk interactive mutator; `/setcfg` direct button call `update_config` path via `applySettingsMenuCallback` (F31).
- **F31**: `formatFullConfig` + `renderSettingsMenu` + `settingValue` + `pageForKey` 6-surface verify; BOT_COMMANDS untuk command baru wajib register utk fitur.
- **F32**: paper/live isolation — `recordPerformance paper:true` tag dipicu dari `closePosition` dlmm.js; consumer (lessons evolve/briefings reports) mode-scoped via `getModePerformance` (F22).
- **F25**: briefings laporan cost-config-change + verdict report menggunakan `addLesson [SELF-TUNED]` history (perlu "config-change audit excluded → counted" filter, F25).
- **F1**: cron restart trigger dari `update_config` interval change.
- **F19/F22/F23**: `addLesson` di executor.js:728 — lesson persist di lessons.js + brain decisions.db; `[SELF-TUNED]` tag ikut laporan learning report.
- **F20**: `evolveEnabled` (CONFIG_MAP:503) → `learning.evolveEnabled` flag freeze/paksa — `evolveThresholds` tiap 5 close LIVE bila true.
- **F11**: `getMyPositions` di gate-8/9/10 F7; cron restart jg affect pnlPollIntervalSec