# Audit F28 — `update_config` tool + CONFIG_MAP + reload + schema + 6-surface full-sync mutation path
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory — alasan: `update_config` tool (`executor.js:321-740`) = **central LLM-mutator untuk 165 CONFIG_MAP key** lintas 19-section + 4 path arg-recovery (flat `key=value` / `changes{}` / `path.value` / section-nested bare). Mutation pipeline 9-step: arg-recover → coerce → ARRAY_KEYS split → STRATEGY_BIN_KEYS hard-floor → schema-validate (`config-schema.js:237 validateConfigValue`) → no-op dedup against live-config (anti-parallel-tool-repeat-burn) → live `config[section][field][?]` mutate inline → persist user-config/gmgn-config nested-or-flat + `_lastAgentTune` ts → cron-restarter bila interval keys. **Kontrak 6-surface full-sync** (CLAUDE.md): CONFIG_MAP (`executor.js:321` 165-key) + `definitions.js:395` schema doc + `formatFullConfig` (`index.js`) 15-grup display + `renderSettingsMenu` (`index.js:2431-2447` /settings toggle map) + BOT_COMMANDS + SETTINGS-GUIDE. `reloadScreeningThresholds` (`config.js:606` F26) 56-key whitelist hot-edit re-read. 4 callers `executeTool("update_config",...)`: `/setcfg` Telegram (`index.js:3373`) + `/settings` button (`:2652/2692/3052`) + agent loop internal. Schema gate strict (model id/risk/sizing/enums) + light type-check else. Fail-open schema-absent.
> Cross-ref: F26 (config.js singleton + persistConfigChange + reloadScreeningThresholds source), F27 (experiments+indicators GRUP 16 surface yang referenced di CONFIG_MAP), F24 (buildRecommendations reads mutated config), F30 (/setcfg + /settings button + /config display Telegram surface), F29 (paths.userConfigPath/gmgnConfigPath target persist), F20 (evolveThresholds trigger `reloadScreeningThresholds` via CLI/lessons.js:311), F2 (cron restart post-interval-change `registerCronRestarter`), F19 (`addLesson` post-config-change tag "self_tune / config_change" di `lessons.js`).

## Ringkasan eksekutif (5 baris)
1. **CONFIG_MAP 165-entry mapping user-flat-key → `[section, field, third?]`**. `tools/executor.js:321-496` obj literally 165 entry. Format `[section, field]` flat (165 utk screening/risk/schedule/llm/management/hiveMind/api/pnl/reports/learning/experiments/darwin) + `[section, field, "nestedField"]` (utk `gmgn.indicatorRules.*` 6-key) + `[section, field, ["nestedPersistPath"]]` (utk `chartIndicators.*` 14-key — nested user-config persistence path). Sections covered: `screening` 30 / `management` 32 / `risk` 2 / `schedule` 5 / `llm` 7 / `strategy` 5 / `hiveMind` 4 / `api` 3 / `pnl` 4 / `gmgn` ~45 / `indicators` 14 / `experiments` 17 / `reports` 2 / `learning` 1. Kontrak: lookup case-insensitive via `CONFIG_MAP_LOWER` build (`:518`) utk weak-model typo tolerance. **Alias**: `binsBelow` → `[strategy, maxBinsBelow, [maxBinsBelow]]` (deprecated alias utk backward-compat, persist as maxBinsBelow) + `takeProfitFeePct` → `[management, takeProfitPct]` 2-alias ke same field. `STRATEGY_BIN_KEYS` Set (`:514`) utk hard-floor 35 handling.
2. **Arg-recovery 4-path utk weak-model / casual chat encapsulated**. `:528-545`: (a) **flat `key`/`value`** pair — `changes = { [key.trim()]: coerceConfigValue(value) }` (`:317`); (b) **`changes{}` obj** multi-key — iterate; (c) **`path` string + `value`** bare recovery — `resolveKey(path.trim().split(".").pop())` (`:534`) extract top-level key, set `changes[key] = value`; (d) **section-nested bare** `{ screening: { minHolders: 600 } }` — `KNOWN_SECTIONS.has(k)` (`:537`) iterate section.value.entries, `resolveKey(sk)` per sub-key. `coerceConfigValue` (`:305`) string → true/false/null off/`null`/`""` / number / string passthrough. **Robust arg recovery** lawan weak model invent shape. Comment: "weak models invent shapes instead of changes/key+value".
3. **9-step mutation pipeline: arg-recover → coerce → ARRAY-split → bins-hard-floor → schema-validate → no-op-dedup → live-mutate → persist → cron-restart**. (1) **arg-recover** (`:528-545`) — 4 path. (2) **coerce** array-string `ARRAY_KEYS` `:520` `Set(["screeningCategories","allowedLaunchpads","blockedLaunchpads","indicatorIntervals"])` — split comma to array, "off"/"null"/"" → null cleared factory (not bogus `[""]`). (3) **bins-below hard-floor** `STRATEGY_BIN_KEYS` (`:514`) `Math.max(MIN_SAFE_BINS_BELOW=35, Math.round(numeric))` — user push dibawah 35 → di-cap ke 35. (4) **schema-validate** `validateConfigValue(key, val)` (`config-schema.js:237`): STRICT utk model id/risk/sizing/enums (reject garbage), LIGHT type-check else; fail-open: keys absent dari schema pass. (5) **no-op dedup** (`:575-585`) utk anti-parallel-tool-repeat-burn: scalar compare against live `config[section][field][?]`; bila `current === next` → `delete applied[key]` + `unchanged.push(key)` (historically 60+ identical writes for repeats). (6) **live-mutate** (`:629-645`) — iterate `applied`, `config[section][field] = val` (flat) atau `config[section][field][third] = val` (nested indicator rules), log "update_config: config.X.Y before → val". (7) **strategy-bin-cascade re-run** (`:648-660`) bila bins keys in applied — re-apply MIN_SAFE + max≥min + default∈[min,max]. (8) **persist** dual-file: GMGN tuning ke `gmgn-config.json` (`:680-691`), semua lainnya ke `user-config.json` (`:692-700`). Nested persist path lewat `third` array (`Array.isArray(persistPath)` — utk `chartIndicators.*`). `_lastAgentTune = tunedAt.toISOString()` (`:701-706`) timestamp di file. (9) **cron-restarter** (`:712-716`) bila `managementIntervalMin`/`screeningIntervalMin`/`pnlPollIntervalSec` di applied — `_cronRestarter()` (registered via `registerCronRestarter` dari `index.js`) utk restart cron tiap 7 task + PnL-poll interval.
4. **`/setcfg` Telegram + `/settings` button + agent loop 3-caller terminal surface**. (a) **`/setcfg`** `index.js:3367` regex `/^\/setcfg\s+([A-Za-z0-9_]+)\s+(.+)$/i` — parse key + value via `parseConfigValue`, baca `getConfigValue(key)` sebelum mutasi utk diff, `executeTool("update_config", {changes:{[key]:value}, reason:"Telegram slash command /setcfg"})`, render `buildConfigDiff` styled. (b) **`/settings` button** `index.js:2652` (screeningCategories toggle), `:2692` (toggle generic), `:3052` (text input field "Telegram settings menu"). (c) **agent internal** — agentLoop bila LLM call tool via tool dispatch. 4 surface executeTool update_config direct, semuanya persists singleton+file via 9-step pipeline. **Kontrak**: `update_config` not session-locked — parallel tool-calls bypass once-per-session guard → mitigation via no-op dedup (E.5). **6-surface full-sync** (CLAUDE.md contract): CONFIG_MAP (`:321` + `:483-496` experiments+indicators 12 entry) + `definitions.js:395` description schema (VALID KEYS list generated dari CONFIG_MAP manually) + `formatFullConfig` F30 display + `renderSettingsMenu` `:2431-2447` /settings button-toggle map + BOT_COMMANDS + SETTINGS-GUIDE.
5. **`reloadScreeningThresholds` 56-key whitelist (F26) + post-`/setcfg` non-call**. `config.js:606` re-read user-config tanpa restart. Trigger: post-`evolveThresholds` F20 (`lessons.js:311`) + CLI `evolve` REPL command (`index.js:3840`). **TAPI**: `/setcfg` Telegram (`:3373`) + `/settings` button (`:2652/2692/3052`) TIDAK call `reloadScreeningThresholds` after executeTool — andalan pada `update_config` direct live-mutate singleton (`executor.js:629-645`) utk sync live. **Kontrak**: `update_config` direct-mutate singleton = singleton sync; persist file = file sync — both happen synchronously di pipeline. Reload tak perlu krn singleton already mutated inline. Kontrak fail-open: bila live-mutate throw → pipeline caught return `{success:false, error: ...}` utk caller. **Reload role**: post-evolve F20 auto-sync (evolve mutates file only, singleton tak sync tanpa reload) + CLI manual evolve. NOT redundant — 2 mass path utk variant use case. **Documented**: CLAUDE.md "Updates live config object immediately + persists." → direct-mutate path.

## Progress
- [x] Spec F28 baca PLAN line 125 (⬛⬛ mandatory — update_config + CONFIG_MAP 6-surface mutation pipeline + reload + normalizePromptNotes)
- [x] Cross-ref F26 (reloadScreeningThresholds 56-key whitelist + persistConfigChange), F27 (experiments+indicators CONFIG_MAP entries utk surface), F30 (/setcfg + /settings + /config display surface), F29 (paths.userConfigPath/gmgnConfigPath target persist), F20 (evolveThresholds → reloadScreeningThresholds trigger), F2 (cron restarter `registerCronRestarter`), F19 (addLesson post-config-change "self_tune / config_change" tag), F24 (buildRecommendations reads mutated config)
- [x] Baca tools/executor.js full 1-200 + 321-540 (CONFIG_MAP 165 entries) + 540-770 (mutation pipeline 9-step)
- [x] Baca tools/definitions.js 395-470 update_config schema (VALID KEYS list, parameter schema, 4 arg-recovery patterns documented)
- [x] Baca config.js:606-666 reloadScreeningThresholds (56-key whitelist)
- [x] Baca config-schema.js 237 validateConfigValue entry
- [x] Verifikasi caller rg: `index.js:13` import `reloadScreeningThresholds`; `:2652/2692/3052/3373` executeTool 4 site Telegram callers; `lessons.js:311` post-evolve reload; `index.js:3840` CLI evolve REPL reload
- [x] Verifikasi live experiment PATH CONFIG_MAP entries `:483-496` cover all 11 experiments + 2 idleScreeningCooldown sub-key + 12 indicators+indicatorRules keys (full-sync surface)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Pusat kontak 165 saklar dengan 4 pintu masuk berbeda + buku panduan 9-steo*: tamu datang dari 4 pintu: pintu depan Telegram `/setcfg` (kata kunci + nilai), pintu menu tombol `/settings` (klik toggle), pintu utama chat LLM (model bilang "ubah ini"), pintu CLI REPL terminal. Semua tamu bawa permintaan "ubah saklar X jadi nilai Y". Petugas pusat jalankan 9 langkah identik: (1) catat permintaan, (2) koreksi tipe data (string jadi angka/bool/null), (3) belah koma jadi array untuk saklar khusus, (4) cap batas aman (`minBinsBelow` tak bisa di bawah 35), (5) periksa skema "apa nilai masuk akal untuk saklar ini", (6) cek "apa nilainya sama dengan sekarang? skip buang-buang", (7) tekan saklar baru di panel live, (8) tulis permanen ke buku catatan (user-config.json), (9) bila saklar `interval`, restart mesin cron. Konsep sama: `update_config` tool = mesin 9-step pipeline, terima input dari 4 caller (Telegram + button + LLM + CLI), jalankan identik path.
- *Notaris dengan 165-entry direktori + validasi ketat untuk 12 saklar sensitif*: notaris tahu persis dimana tiap saklar di rumah (mapping `screening → [screening, minTvl]`). 12 saklar sensitif (model ID, maxPositions, sizing) di-check ketat — bila tamu salah format ("minimax_m2_5" tanpa provider/) → reject surat. Saklar lain light-check (cukup tipe cocok). Notaris punya 9 proses identik, log tiap perubahan "config.section.field OLD → NEW (verify: NEW)". Notaris buang permintaan identik-twice anti-bakar-buku (dedup no-op). Konsep sama: `update_config` + `validateConfigValue` STRICT utk sensitive keys (model id format "provider/slug", risk/sizing numerics, enums), LIGHT type-check utk rest, **no-op dasar** utk repeat.

**Di bot, ini = central LLM+user-facing mutator utk 165 CONFIG_MAP key lintas 19-section via 9-step pipeline + 4 caller surface + 6-surface full-sync contract** (1-2 kalimat)
`tools/executor.js:321-740`-tool `update_config` punya CONFIG_MAP 165-entry + 9-step pipeline (arg-recover → coerce → array-split → bins-floor → schema-validate → no-op-dedup → live-mutate → persist → cron-restart). 4 arg-shape path. `validateConfigValue` schema gate. Reload `reloadScreeningThresholds` 56-key whitelist post-evolve F20 + CLI. 6-surface full-sync invariant per CLAUDE.md: CONFIG_MAP + definitions + formatFullConfig + renderSettingsMenu + BOT_COMMANDS + SETTINGS-GUIDE.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F26 (config.js singleton source + reloadSurfaceScreeningThresholds 56-key + persistConfigChange auto-tuner path), SETELAH F27 (experiments + indicators GRUP 16 CONFIG_MAP entries), SEBELUM F30 (`/setcfg` Telegram + `/settings` button display + `/config` `formatFullConfig` 15-grup render). PARALEL-F20 (`reloadScreeningThresholds` post-evolve trigger), PARALEL-F2 (`registerCronRestarter` cron restart hook), PARALEL-F29 (`paths.userConfigPath`/`gmgnConfigPath` file target side). F28 = **Lapisan 8 (Config) mutator engine**: satu-satunya LLM-facing tool untuk mutate config (di luar auto-tuner `persistConfigChange` F25). Tanpa F28, LLM tak bisa tune config via tool-call; user tak bisa `/setcfg` Telegram; semua config hand-edit manual + restart.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Caller invoke** via 4 path: `/setcfg` Telegram (`index.js:3367`), `/settings` button (`:2652/2692/3052`), agent internal `executeTool("update_config", args)` (LLM tool dispatch), CLI REPL (`evolve` command — though that's reload only, not update_config).
2. **Arg-recover** `executor.js:528-545` fold 4 shape ke `changes{}`: flat `key/value` `:317`, `changes{}` multi `:540`, `path` string `:534`, section-nested bare `{screening: {...}}` `:541`.
3. **Coerce** `coerceConfigValue` `:305` — string "true"/"false"/"off"/"null" → bool/null, finite number → number, else passthrough.
4. **ARRAY_KEYS split** `:520` `"—".split(",")` utk screeningCategories/allowedLaunchpads/blockLaunchpads/indicatorIntervals, "off"/"null"/"" → null cleared.
5. **STRATEGY_BIN_KEYS hard-floor** `:514` `Math.max(MIN_SAFE_BINS_BELOW=35, Math.round(numeric))` utk binsBelow/minBinsBelow/maxBinsBelow/defaultBinsBelow.
6. **Schema validate** `validateConfigValue(match[0], normalizedVal)` (`config-schema.js:237`): STRICT reject utk model id (provider/slug format), risk/sizing numerics, known enums; LIGHT type-check untuk rest; fail-open absent.
7. **No-op dedup** `:575-585` scalar compare against live `config[section][field][?]`; bila `current === next` → `delete applied[key]` + `unchanged.push(key)` — anti-repeat-burn.
8. **Live-mutate inline** `:629-645` `config[section][field] = val` (flat) atau `config[section][field][third] = val` (nested `indicatorRules.*`); log redacted before→new.
9. **Strategy-bin-cascade re-run** `:648-660` bila bins keys in applied: re-apply MIN_SAFE + max≥min + default∈[min,max].
10. **Persist dual-file** `:680-706`: GMGN to `gmgn-config.json`, else to `user-config.json`. Nested via `third` array persistPath (`chartIndicators.*`). `_lastAgentTune = tunedAt.toISOString()` timestamp.
11. **Cron restart** `:712-716` bila `managementIntervalMin`/`screeningIntervalMin`/`pnlPollIntervalSec` in applied → `_cronRestarter()` (registered via `registerCronRestarter` from `index.js`).
12. **Add lesson** `:720-727` bila `applied` non-empty (excluding `_timeframeScaled` + `managementIntervalMin`+`screeningIntervalMin` ephemeral): `addLesson("[SELF-TUNED] Changed ...", ["self_tune", "config_change"])` di `lessons.js` F19. Tag distinguishes config-change audit dari trading lessons (F25 clean section "config changes (24h): N" excludes this tag).
13. **Return** `{success, applied (redacted), unknown, unchanged, invalid, reason}` utk caller.

**Output mutation pipeline**: live `config.*` obj singleton mutated, user-config.json/gmgn-config.json persisted, `_lastAgentTune` ts set, cron restarted bila interval, lesson added `[SELF-TUNED]`. Side-effect: F25 briefing "🔧 Config changes (24h): N" line reads this tag. Trigger ke fase berikut: live config realized to all 170 consumer read-path; Telegram UI re-render `/config` F30 bottom; evolve F20 next cycle use new threshold; cron task schedule fresh.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
`update_config` throw umum → caught? actually tdk visible top-level try-catch wrap around `executeTool`. Caller side try-catch (`/setcfg` `:3367` try-catch render error). User gets "Config update failed" reply dgn `unknown`/`invalid`. Config singleton tak mutated, no persist — atomic-ish fail. Bila persist `fs.writeFileSync` throw → singleton already mutated (live-mutate step first) → singleton-file divergence (live new, file old) — restart reset singleton dari file-lama. **Anti-pattern shared dgn `persistConfigChange` F26 E.2**. Schema strict-reject model ID format (`minimax/minimax-m2.5` valid, `minimax_m2_5` reject) — bila LLM request malformed → log "update_config rejected invalid values" + applied skipped tdk proceed. Live `screeningSource=gmgn` reject bila `gmgn.apiKey` empty (schema) — no silent fallback. Skip F28 = tak paham central mutation path — debugging "kok config berubah tiap LLM cycle tanpa saya edit" mistake (auto-skip krn no-op dedup).

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **`update_config`** — central LLM+Telegram-facing mutator tool, 165-key CONFIG_MAP, 9-step pipeline.
- **CONFIG_MAP** — `executor.js:321-496` 165-entry mapping user-flat-key → `[section, field, third?]`.
- **6-surface full-sync** — CLAUDE.md contract utk fitur config baru: CONFIG_MAP + definitions + formatFullConfig + renderSettingsMenu + BOT_COMMANDS + SETTINGS-GUIDE.
- **9-step pipeline** — arg-recover → coerce → array-split → bins-floor → schema-validate → no-op-dedup → live-mutate → persist → cron-restart.
- **4 arg-shape path** — flat key/value, changes{} multi, path string, section-nested bare.
- **`coerceConfigValue`** — `:305` string → true/false/null/number/string passthrough.
- **ARRAY_KEYS** — `:520` Set 4 key utk comma-split-to-array coercion.
- **STRATEGY_BIN_KEYS** — `:514` Set 4 key utk hard-floor `MIN_SAFE_BINS_BELOW=35`.
- **validateConfigValue** — `config-schema.js:237` schema gate. STRICT utk sensitive (model id / risk / sizing / enums), LIGHT type-check else, fail-open absent.
- **STRICT** — schema reject utk harmful keys (model id format, risk numerics, enums).
- **LIGHT** — type-check saja utk non-sensitive (num/bool/string/arr).
- **no-op dedup** — `:575-585` scalar compare live vs new, anti-repeat-burn utk parallel tool-call race.
- **unchanged/applied/unknown/invalid** — 4 status bucket utk caller feedback.
- **`redactConfigValue`/`SENSITIVE_CONFIG_KEYS`** — `gmgnApiKey/hiveMindApiKey/publicApiKey` mask `***redacted***` di log/output.
- **nestedField** — `third` array utk `indicatorRules.*` (gmgn section). Persist utk gmgn-config.json nested.
- **persistPath** — `third` array utk `chartIndicators.*` user-config persistence path.
- **`_lastAgentTune`** — timestamp di user-config.json/gmgn-config.json last-mutation.
- **cron-restart** — `registerCronRestarter` dari index.js utk restart 7 cron task + PnL-poll bila interval keys mutated.
- **reloadScreeningThresholds** — `config.js:606` 56-key whitelist hot-re-read. Trigger post-evolve F20 + CLI evolve.
- **`/setcfg`** — `index.js:3367` Telegram slash-command regex parse key+value, executeTool, buildConfigDiff render.
- **`/settings` button** — `index.js:2652/2692/3052` 3 site (categories toggle / generic toggle / input field).
- **addLesson** — `lessons.js` F19, tag `self_tune + config_change` utk mutation audit trail. Excluded dari briefing trading-lesson count (F25).
- **CONFIG_MAP_LOWER** — `:518` case-insensitive lookup dari CONFIG_MAP utk weak-model typo tolerance.
- **KNOWN_SECTIONS** — `:537` Set utk validate section-nested bare shape.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A — Peta file fase ini

| File | Peran | Baris kunci |
|------|-------|-------------|
| `tools/executor.js` (1104) | **CONFIG_MAP + update_config 9-step pipeline + safety hook**: central mutator | 321-496 CONFIG_MAP 165-entry; 483-496 experiments+indicators 12-entry (F27 surface); 498-518 arg setup + case-insensitive lookup; 514 STRATEGY_BIN_KEYS; 520 ARRAY_KEYS; 528-545 arg-recover 4-path; 553 NEGLIGENCE coerce; 554-569 normalize (array-split, bins-floor, schema-validate); 575-585 no-op dedup; 629-660 live-mutate + bins-cascade re-run; 680-706 persist dual-file + `_lastAgentTune`; 712-716 cron-restart; 720-727 addLesson; 728-740 return |
| `tools/definitions.js` (1173) | **update_config LLM schema doc**: VALID KEYS list, 4 parameter shape, persistent declaration | 395-470 update_config tool schema (VALID KEYS list, 4 parameter shape, persistent statement) |
| `config.js` F26 | **`reloadScreeningThresholds` 56-key whitelist source**: hot-re-read post-evolve | 606-666 reload |
| `config-schema.js` (285) | **`validateConfigValue` schema gate source**: STRICT+LIGHT validation | 237 validateConfigValue |
| `index.js` (3906) | **Caller surface + cron-restart register**: `/setcfg` + `/settings` + executeTool sites + registerCronRestarter | 13 import reloadScreeningThresholds; 200 registerCronRestarter export hook (executor.js); 2652/2692/3052/3373 4 executeTool site (categories toggle / generic toggle / input field / slash-command); 3840 CLI evolve REPL trigger reload |
| `lessons.js:311` F20 | **Post-evolve reload trigger**: sync threshold evolution baru | — |
| `user-config.json` (live) | **Persist target**: 104-key tunable flat JSON + `_lastAgentTune` ts | — |
| `gmgn-config.json` F29 | **Persist target utk gmgn.* keys**: nested JSON | — |
| `views/config.js` F30 | **formatFullConfig 15-grup display + /config render**: reads post-mutation | — |
| `views/settings.js` F30 | **renderSettingsMenu button-render + settingValue/pageForKey/accessors**: /settings UI | — |

---

## §B — Alur data hulu→hilir (ASCII diagram)

```
       [4 Caller surface]
   ┌───────────────────────────────────┬────────────────────────┬──────────────────┬───────────────┐
   │ /setcfg Telegram                  │ /settings button       │ agent internal   │ CLI evolve    │
   │ (index.js:3367 regex parse)       │ (index.js:2652/2692/3052)│ executeTool       │ (index.js:3840│
   │                                   │                        │ dispatch          │  reload only)│
   └───────────────────────────────────┴────────────────────────┴──────────────────┴───────────────┘
                              │
                              ▼ executeTool("update_config", {changes/key/value/path/reason})
       [executor.js 9-step pipeline :321-740]
       │
   1.  Arg-recover (4-path)            :528-545  → fold to `changes{}` flat dict
   2.  coerceConfigValue              :305       string → bool/null/num/str
   3.  ARRAY_KEYS split                :554       comma → array, "off"/"" → null
   4.  STRATEGY_BIN_KEYS hard-floor    :557       Math.max(35, round(numeric))
   5.  validateConfigValue             config-schema.js:237  STRICT/LIGHT/fail-open
       │   invalid[] → reject
   6.  No-op dedup                     :575-585   compare current === next → delete applied + unchanged[]
   7.  Live-mutate inline              :629-645  config[section][field][?] = val  (or nested third)
       + Strategy-bin cascade re-run   :648-660  re-apply min/max/default bounds
   8.  Persist dual-file               :680-706
       ├── GMGN tuning → gmgn-config.json (nested style)
       └── all else → user-config.json (flat or chartIndicators-nested via persistPath array)
       + _lastAgentTune = ISO ts
   9.  Cron-restart                    :712-716  interval keys → _cronRestarter() (register from index.js)
       + addLesson                     :720-727 [SELF-TUNED] tag "self_tune"/"config_change"  (excluded managementInterval/screeningInterval ephemeral)
       │
       ▼
   {success, applied (redacted), unknown, unchanged, invalid, reason}
       │
       ├── Caller feedback (Telegram buildConfigDiff / button ack / agent reply)
       │
       └── 170 consumer read-path baca live config seketika; briefing F25 read mutated values next cycle; evolve F20 next cycle use new threshold

       ────────────────────────────────────────────────────────────────────

   [Reload path — orthogonal to update_config]
   reloadScreeningThresholds()  config.js:606-666  (56-key whitelist)
       │
       ├── Trigger 1: post-evolveThresholds F20 (lessons.js:311) — auto-sync threshold evolution baru dari outside update_config
       ├── Trigger 2: CLI evolve REPL command (index.js:3840) — manual debug
       └── NOT Trigger utk /setcfg + /settings + agent loop internal
              (they direct-mutate singleton via update_config step 7, no need reload)
```

---

## §C — Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| index.js:3373 `/setcfg` | tools/executor.js:321 update_config | regex parse slash command | `{changes:{[key]:value}, reason:"Telegram slash command /setcfg"}` | try-catch render error |
| index.js:2652 `/settings` categories toggle | tools/executor.js:321 update_config | button callback | `{changes:{screeningCategories:value}, reason:"Telegram settings menu"}` | `result.success` false → answerCallbackQuery "failed" |
| index.js:2692 `/settings` generic toggle | tools/executor.js:321 | button callback | toggle key bool | — |
| index.js:3052 `/settings` input field | tools/executor.js:321 | text input | `{changes:{[key]:value}, reason:"Telegram input field"}` | — |
| agent.js agentLoop dispatch | tools/executor.js executeTool dispatch | LLM tool-call | `{key/value or changes or path/value, reason}` | `Unknown tool: update_config` logged, return error |
| tools/executor.js:582 validateConfigValue call | config-schema.js:237 validateConfigValue | per-key schema gate | `(key, value)` | reject → invalid[], skip-applied |
| config.js:606 reloadScreeningThresholds | (re-read user-config.json) | post-evolve F20 trigger (`lessons.js:311`) + CLI evolve | — | catch {} ignore |
| index.js registerCronRestarter | tools/executor.js:200 _cronRestarter assign | startup | fn ref | — |
| tools/executor.js:715 _cronRestarter() | index.js startCronJobs | interval-key applied | — | — |
| tools/executor.js:723 addLesson | `lessons.js` addLesson | post-mutation non-ephemeral-keys | tag `["self_tune","config_change"]` | F19 record persists ke lessons.json |
| tools/executor.js:728 return | caller surface | reply | `{success, applied (redacted via redactAppliedConfig), unknown, unchanged, invalid, reason}` | — |
| redactConfigValue | SENSITIVE_CONFIG_KEYS set masking | log + reply construction | `gmgnApiKey/hiveMindApiKey/publicApiKey` → `***redacted***` | — |

---

## §D — Logika kunci per fungsi

### update_config tool — tools/executor.js:321-740
- **Apa**: Central mutator utk 165 CONFIG_MAP key via 9-step pipeline. LLM+Telegram+button facing.
- **Kapan dipicu**: 4 caller surface (Telegram /setcfg + /settings buttons + agent internal executeTool + caller).
- **Output**: `{success, applied (redacted), unknown, unchanged, invalid, reason}`.
- **Sinkron**: baca `config[section][field]` utk dedup; mutate same; persist dual-file; restart cron bila interval keys; addLesson `[SELF-TUNED]`.
- **Fail-mode**: invalid schema → invalid[] + log reject; unknown key → unknown[]; persist error → singleton new, file old divergence; cron-restart bila `_cronRestarter` set.
- **Kontrak 6-surface full-sync**: CLAUDE.md eksplisit — fitur config baru WAJIB register di CONFIG_MAP + definitions.js description + `formatFullConfig` + `renderSettingsMenu` + BOT_COMMANDS + SETTINGS-GUIDE. Skipping any → LLM tak tahu tool, user tak tahu toggle.
- **Bukti**: tools/executor.js:321-740.

### CONFIG_MAP — tools/executor.js:321-496
- **Apa**: 165-entry obj mapping user-flat-key → `[section, field, third?]`. Live mutable.
- **Kapan dipicu**: lookup via `CONFIG_MAP[key]` or `CONFIG_MAP_LOWER[key.toLowerCase()]` (`:518` case-insensitive).
- **Output**: tuple `[section, field, third?]` — third bisa undefined (flat), string (nested indicatorRules), atau array (persistPath chartIndicators).
- **Sinkron**: aliases `binsBelow` → strategy.maxBinsBelow, `takeProfitFeePct` → management.takeProfitPct (deprecated alias).
- **Fail-mode**: salah key → unknown[] return, no mutation.
- **Kontrak**: 1 source-of-truth mapping utk user-flat-key→config-section-field. Bila new config section/field, MUST add to CONFIG_MAP (full-sync surface #1).
- **Bukti**: tools/executor.js:321-496; live 165 entry covering 14 section (screening/risk/schedule/llm/management/strategy/hiveMind/api/pnl/gmgn/indicators/experiments/reports/learning).

### coerceConfigValue — tools/executor.js:305-313
- **Apa**: String → typed value coercion. "true"/"false" → bool, "off"/"null"/"" → null, finite-number → number, else passthrough.
- **Kapan dipicu**: tiap arg-string di-recover via 4-path.
- **Output**: typed value.
- **Sinkron**: shared logic dgn `/settings` input field parser.
- **Fail-mode**: non-string passthrough (already typed).
- **Bukti**: tools/executor.js:305-313.

### ARRAY_KEYS + STRATEGY_BIN_KEYS — tools/executor.js:514/520
- **Apa**: 2 Set utk special-key coercion. ARRAY_KEYS (4 comma-split-to-array), STRATEGY_BIN_KEYS (4 hard-floor 35).
- **Kapan dipicu**: `:554` array-split utk ARRAY_KEYS; `:557-562` bins hard-floor utk STRATEGY_BIN_KEYS.
- **Output**: array (utk ARRAY_KEYS) atau Math.max(MIN_SAFE_BINS_BELOW=35, Math.round(numeric)) utk bins.
- **Kontrak**: ARRAY_KEYS "split supaya Array.isArray() checks downstream actually see array instead of silently falling back to factory behavior". STRATEGY_BIN_KEYS hard-floor invariant — user tak bisa push minBinsBelow bawah 35.
- **Bukti**: tools/executor.js:514-562.

### validateConfigValue — config-schema.js:237
- **Apa**: Schema gate STRICT utk sensitive keys (model id format, risk/sizing numerics, enums), LIGHT type-check else, fail-open utk absent keys.
- **Kapan dipicu**: `executor.js:582` per-key pass dalam mutation pipeline.
- **Output**: error string bila invalid (caller push to `invalid[]`), `null`/undefined bila pass.
- **Sinkron**: STRICT list covers `screeningModel`/`managementModel`/`generalModel` (provider/slug format), `sizingMode` (fixed|maximize enum), `strategyLock` (default|spot|bid_ask|curve), `stopLossPct`/`takeProfitPct` numerics, etc. LIGHT covers basic Number.isFinite + type-coerce-check.
- **Fail-mode**: Schema-absent keys → pass (fail-open). Schema-error → invalid[] reject.
- **Kontrak**: RAGU = IZINKAN (light type-check), rejects garbage harmful. Prevents model id "minimax_m2_5" masuk (REJECT, prompt harus "minimax/minimax-m2.5").
- **Bukti**: config-schema.js:237; config-schema.js 285 baris.

### No-op dedup — tools/executor.js:575-585
- **Apa**: Compare scalar `current === next` untuk no-op detection — anti-parallel-tool-call repeat-burn.
- **Kapan dipicu**: setelah schema-validate, sebelum live-mutate — iterate `applied` keys, bila current-equivat val → delete applied + push unchanged.
- **Output**: applied[] reduced, unchanged[] appended.
- **Sinkron**: scalar only — array/object fall through always apply. `config[section][field][?]` read utk compare.
- **Kontrak**: comment `:571` "historically 60+ identical writes". Anti-noise + anti-tool-burn invariant utk parallel LLM tool-call ang don't see each other's mutations.
- **Fail-mode**: bila `{applied: 0}` setelah dedup → return `{success:true, applied:{}, unchanged:[...], noop:true}` — atomic no-op.
- **Bukti**: tools/executor.js:575-585.

### live-mutate — tools/executor.js:629-660
- **Apa**: Apply `applied[key]` ke `config[section][field][?]`. Nested vs flat. Bins-cascade rerun.
- **Kapan dipicu**: setelah no-op dedup passthrough non-trivial applied.
- **Output**: config singleton mutated.
- **Sinkron**: bila `third` is nested-string (`gmgn.indicatorRules.requireBullishSupertrend`), `config.gmgn.indicatorRules[third] = val` (init object first bila empty). Bila `binsBelow`/`minBinsBelow` applied → re-run cascade `:648-660`: re-apply MIN_SAFE + max≥min + default∈[min,max].
- **Fail-mode**: bila `config[section][field]` not yet object tapi third-string → `config[section][field] = {}` init (`:633`).
- **Kontrak**: live mutation seketika — 170 consumer read-path baca new value next cycle.
- **Bukti**: tools/executor.js:629-660.

### persist dual-file — tools/executor.js:680-706
- **Apa**: Persist applied ke user-config.json (flat or chartIndicators-nested) + gmgn-config.json (nested). Stamp `_lastAgentTune` ts.
- **Kapan dipicu**: post live-mutate.
- **Output**: file persisted.
- **Sinkron**: GMGN keys ke gmgn-config.json; nestedField persis via `gmgnConfig[field][nestedField]`; all-else via `userConfig[key] = val` flat ATAU `target[part] = val` nested-path via `persistPath` array.
- **Fail-mode**: persist throw (file lock, disk full) → singleton sudah mutate (live-new, file-old divergence) — restart resets. Same ekses dgn `persistConfigChange` F26 E.2.
- **Kontrak**: dual-file separation utk GMGN isolation (F29 paths.gmgnConfigPath resolve per-profil).
- **Bukti**: tools/executor.js:680-706.

### Cron-restart — tools/executor.js:712-716
- **Apa**: Restart cron task bila `managementIntervalMin`/`screeningIntervalMin`/`pnlPollIntervalSec` in applied.
- **Kapan dipicu**: post persist.
- **Output**: 7 cron task + PnL-poll interval restarted via `_cronRestarter` (registered via `registerCronRestarter` index.js).
- **Sinkron**: interval change MUST restart cron (node-cron tidak dynamically reschedule).
- **Fail-mode**: bila `_cronRestarter` null (not registered yet) → silent skip.
- **Bukti**: tools/executor.js:712-716.

### addLesson post-mutation audit trail — tools/executor.js:720-727
- **Apa**: `addLesson("[SELF-TUNED] Changed ...", ["self_tune", "config_change"])` di lessons.json F19. Excludes `managementIntervalMin`/`screeningIntervalMin` (ephemeral per-deploy).
- **Kapan dipicu**: post persist bila `applied` non-ephemeral-keys.
- **Output**: lesson record di lessons.json dgn tag `self_tune + config_change`.
- **Sinkron**: F25 briefing "🔧 Config changes (24h): N" line reads tag utk count (excluded dari trading-lesson total).
- **Kontrak**: tag distinguishes config-change audit dari trading lessons (so briefing section tak paksa gabung config-noise dgn trade-noise).
- **Bukti**: tools/executor.js:720-727 + briefing.js:328 filter `sourceType !== "config_change"`.

---

## §E — Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — Persist throw → singleton/file divergence (live-new, file-old) — restart reset singleton
**Lokasi**: tools/executor.js:680-706.
**Temuan**: live-mutate (`:629-645`) dilakukan DULU, persist (`:680-706`) kemudian. Bila `fs.writeFileSync` throw (disk full, EACCES, file lock) → singleton already mutated-new, file still old. Restart reset singleton from file-old → user sadar config tak persist (kalau compare). Latent divergence window start dari mutation→restart.
**Mitigation**: same ekses F26 E.2 dgn `persistConfigChange` auto-tuner. Worth-fix sequetial: persist-first then live-mutate (so bila persist-gagal singleton tak divergent) — atomic invariant.
**Worth-F26 cross-verify**. **Low-likelihood live** (file write usually OK), but silent failure path.

### E.2 — No-op dedup scalars only — array/object keys (screeningCategories, blockedLaunchpads, indicatorIntervals, gmgnFilters, gmgnPlatforms, gmgnPreferredKolNames, gmgnDumpKolNames) tak dedup, siempre re-write + re-lesson
**Lokasi**: tools/executor.js:575-585.
**Temuan**: `if ((next === null || typeof next !== "object") && current === next)`. Array/object fall-through always apply. So bila user LLM `update_config({key:"screeningCategories", value:["trending"]})` 2× dgn same array, pipeline full-rewrite user-config + addLesson `[SELF-TUNED] Changed screeningCategories=trending` tag 2× — historically 60+ identical writes mitigation salah (CLAUDE.md comment `:568` references ini utk scalar keys, TAPI array keys exempt).
**Ekses**: same-array mutation twice = re-persist + re-lesson. LLM yang paralel tool-call dgn config-change dapat menumpuk lesson "self_tune" duplicate utk array keys. **Mitigasi potential**: enforce `JSON.stringify(current) === JSON.stringify(next)` untuk arrays.
**Documented**: comment writes "Scalars only; arrays/objects fall through and always apply" — OK utk arrays berubah additive, TAPI untuk no-op-detection tak cover array. **Worth-fix** dedup JSON-stringify compare utk array keys.

### E.3 — CONFIG_MAP aliases (`binsBelow` → maxBinsBelow + `takeProfitFeePct` → `stopLossPct`) NOT documented in user-config.example.json surface
**Lokasi**: tools/executor.js:348/365 alias entries.
**Temuan**: Aliases utk backward-compat — `binsBelow` deprecated alias utk `maxBinsBelow`, `takeProfitFeePct` utk `takeProfitPct`. CONFIG_MAP support keduanya. `user-config.example.json` documented potentially alias-key (`binsBelow`) TAPI /config display tak show "alias of" hint. User write `binsBelow: 50` → persist `maxBinsBelow: 50` via `[strategy, maxBinsBelow, [maxBinsBelow]]` third persistPath — singleton `strategy.maxBinsBelow = 50`. **Kontrak backward-compat**. Bila user baca `/config` → see `maxBinsBelow: 50` (current key), bila inspect user-config → see `binsBelow: 50` (orig user-typed alias). **Inconsistency display/source**.
**Documented**: alias entries. TAPI /config F30 tak render "alias of" label.
**Worth-F30** /config F30 display audit — surface alias label.

### E.4 — `validateConfigValue` strict-reject `screeningSource=gmgn` bila `gmgn.apiKey` empty — silent fallback issue
**Lokasi**: config-schema.js STRICT utk `screeningSource`.
**Temuan**: per checking CLAUDE.md `gmgnFeeSource` works in BOTH screening sources. TAPI `screeningSource=gmgn` has conditional reject bila `gmgn.apiKey` empty (cumi model id/risk/sizing note dari STRICT comment). User attempts `/setcfg screeningSource gmgn` bila no gmgnApiKey set → REJECT → unknown[] stuck. User sadar mungkin confused "kok tak bisa switch ke gmgn?" Bahwa krn resolve dependency.
**Kontrak**: documented di `definitions.js:395` VALID KEYS line "gmgn|jupiter — fee-gate data source for global_fees_sol; works in BOTH screening sources" — refers `gmgnFeeSource` not `screeningSource`. Mungkin `screeningSource` STRICT sebenarnya different key. **Cross-verify defining "screening-source" vs "fee-source"**. Edge-case scenario bukti strictness hot path.
**Unknown validation level** — worth-F29 verify schema strict-reject surface.

### E.5 — `update_config` not session-locked — parallel tool-call LLM dapat race + no-op dedup mitigasi hanya utk scalar
**Lokasi**: tools/executor.js + CLAUDE.md note `:571` "update_config is not session-locked, and parallel tool-calls bypass the once-per-session guard".
**Temuan**: pipeline mengakui race risk utk scalar (diatasi dgn no-op dedup `:575`). TAPI array/object keys (E.2) tak dedup → race corrupt user-config (LLM tool-call 1 set `screeningCategories: ["trending"]`, tool-call 2 set `["trending","top"]` paralel) → file last write-win, plugin tak atomic-merge. Latent race.
**Mitigation**: LLM langkah paralel jarang utk config (biasanya sequential). TAPI bila agent.js allows parallel tool-call dlm 1 response, config-mutation paralel race. Worth verify agent.js F4 parallel policy.

### E.6 — `definitions.js:395` VALID KEYS list manual (140-line block) — drift vs CONFIG_MAP 165 entries
**Lokasi**: tools/definitions.js:395-470.
**Temuan**: comment "VALID KEYS (use EXACTLY these key names, nothing else)" manual bullet list. Total entries ~140 TAPI CONFIG_MAP 165. Verifikasi: list includes Screening 26, GMGN 35, Management 22, Risk 2, Schedule 5, Models 7, Strategy 5, Hive/API 6, PnL 4, Indicators 13, Reports 2, Learning 1, Experiments 17. Total ~145. CONFIG_MAP 165.
**Missing**: aliases `binsBelow`, `takeProfitFeePct` tak documented. Several nested persistPath keys. **LLM guidance drift** — model rejects unusual valid keys (e.g. `binsBelow` alias) → subsumes `unknown[]` reject.
**Worth** auto-generate dari CONFIG_MAP. Tech-debt-doc.

### E.7 — `reloadScreeningThresholds` 56-key whitelist doesn't cover `experiments.*` / `indicators.*` / `schedule.*` / `llm.*` — hand-edit utk non-screening/strategy keys tak sync tanpa restart
**Lokasi**: config.js:606-666 + CLAUDE.md F26 E.3.
**Temuan**: reload whitelist covers screening 30 + strategy 3 bins-below + promptNotes + activeSetup + evolveEnabled + sizingMode + rentPerPositionSol + gmgn 30. Hanya 56 key. TAK cover `experiments.*` (11 flag), `indicators.*` (9 field, walaupun `screening.indicators` actually only "indicators" nested), `schedule.*` (3 lain selain screeningInterval), `llm.*` (7 lain).
**Konsekuensi**: bila user hand-edit user-config utk `experiments.convictionSizing=true` tanpa restart → singleton OFF (factory). Hanya via `update_config` tool direct-mutate singleton works. `/setcfg` works krn direct-mutate path. Hand-edit needs restart.
**Documented partially** — CLAUDE.md F26 E.3. Worth F30 `/setcfg` documentation utk tidak bisa hand-edit tanpa restart (or restart required advisory). Lint-point.

### E.8 — `coerceConfigValue` "off" → null sentinel bisa confuse untuk boolean keys
**Lokasi**: tools/executor.js:309.
**Temuan**: `if (lc === "off" || lc === "null") return null`. Utk boolean-default-true key (e.g. `avoidPvpSymbols`), user `/setcfg avoidPvpSymbols off` → coerce "off" → null → `config.screening.avoidPvpSymbols = null`. Factoy guard `??  true` (`config.js:149`) → bila user reads after restart/reload, nullish `?? true` → true. TAPI live-mutation path NOW sets `null`. Config singleton eval `config.screening.avoidPvpSymbols && ...` → falsy null = OFF (factory behavior intended). **Ambiguity**: `null` vs `false` — singleton reads null check `=== true` false, `if (X)` falsy OK. Live evaluation sama. TAPI user expect "off" → `false` literally (clear disable), bukan "off" → `null` unset → restart default `?? true` → re-enable. **Kontrak-documentasi** NOT bug — `null` dan `false` both falsy at eval-time, sama disabling. Worth-document.
**Cosmetic-but-edge** worth clarifikasi di SETTINGS-GUIDE: "/setcfg X off → unset ke null (= factory default), bukan false disable."

### E.9 — Cron-restart bila `pnlPollIntervalSec` changed → ONLY interval keys, NOT `defaultBinsBelow` ataupun `screeningSource` change
**Lokasi**: tools/executor.js:712.
**Temuan**: `intervalChanged = applied.managementIntervalMin || applied.screeningIntervalMin || applied.pnlPollIntervalSec`. Hanya 3 interval trigger cron-restart. Bila user changes `screeningSource` dari `meteora` ke `gmgn`, cron tak restart — TAPI screening cycles LLM next-time fetch GMGN path instead. Node-cron tidak dynamically reschedule OK (interval sama). TAPI GMGN path mungkin butuh different rate-limit flow — worth verify tidak ada cron job depending on source. Per check, cron management/screening generic, source-switch safe.
**Not-a-bug** — design.

### E.10 — `_lastAgentTune` timestamp di file shows "agent self-tune" TAPI `/setcfg` user-driven jg uses same ts — naming misleading
**Lokasi**: tools/executor.js:701-707.
**Temuan**: stamped `_lastAgentTune = tunedAt.toISOString()` di user-config.json/gmgn-config.json. TAPI `/setcfg` user-driven manusia jg triggers same path → `_lastAgentTune` set. User baca timestamp itu "agent-tune" thinking LLM did it, not human. **Naming-misleading** — `_lastConfigTune` lebih accurate. **Cosmetic-doc**. Worth-fix naming nitrite.

---

## §F — Glosarium istilah fase

- **`update_config`** — central LLM+Telegram+button+CLI-facing mutator tool, 165-key CONFIG_MAP, 9-step pipeline.
- **CONFIG_MAP** — 165-entry obj mapping user-flat-key → `[section, field, third?]`.
- **6-surface full-sync** — CLAUDE.md contract utk fitur config baru: CONFIG_MAP + definitions + formatFullConfig + renderSettingsMenu + BOT_COMMANDS + SETTINGS-GUIDE.
- **9-step pipeline** — arg-recover → coerce → array-split → bins-floor → schema-validate → no-op-dedup → live-mutate → persist → cron-restart.
- **4 arg-shape path** — flat, changes multi, path string, section-nested bare.
- **coerceConfigValue** — string → typed coercion (bool/null/num/str).
- **ARRAY_KEYS** — 4-key Set utk comma-split-to-array.
- **STRATEGY_BIN_KEYS** — 4-key Set utk hard-floor 35.
- **validateConfigValue** — schema gate STRICT/LIGHT/fail-open.
- **STRICT** — schema reject utk harmful keys (model id format, risk numerics, enums).
- **LIGHT** — type-check saja.
- **no-op dedup** — scalar compare anti-repeat-burn.
- **UNCHANGED/APPLIED/UNKNOWN/INVALID** — 4 status bucket utk caller feedback.
- **redactConfigValue** — `gmgnApiKey/hiveMindApiKey/publicApiKey` mask.
- **nestedField third** — string utk `indicatorRules.*` persist gmgn-config.json.
- **persistPath third** — array utk `chartIndicators.*` persist user-config.json nested.
- **`_lastAgentTune`** — ISO timestamp stamp utk mutation audit.
- **cron-restart** — `_cronRestarter()` (register dari index.js) restart 7 cron bila interval keys).
- **addLesson tag** — `["self_tune","config_change"]` utk audit trail lessons.json F19.
- **reloadScreeningThresholds** — 56-key whitelist hot-re-read post-evolve F20 + CLI evolve.
- **`/setcfg`** — Telegram slash-command regex parse.
- **`/settings` button** — 3 site callback utk toggle.
- **CONFIG_MAP_LOWER** — case-insensitive lookup utk weak-model typo tolerance.
- **KNOWN_SECTIONS** — Set utk validate section-nested bare shape.
- **SCALAR-FALL-THROUGH** — array/object circumvent no-op dedup.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §G — Link fase lain (cross-ref)

- **F26** (config.js singleton source): `reloadScreeningThresholds` 56-key source + `persistConfigChange` auto-tuner alternative path. Cross-verify E.1 singleton-file divergence (shared issue).
- **F27** (experiments + indicators CONFIG_MAP surface): 12 entries cover all 11 experiments + 2 idleScreening sub-key + 2 indicator opt-in keys (exitEnabled, rejectAtBottom) + 12 chart indicators. Full-sync surface from CONFIG_MAP.
- **F30** (/setcfg + /settings + /config display surface): Telegram slash-command + button-toggle + formatFullConfig 15-grup render. Read post-mutation each touch.
- **F29** (paths.userConfigPath/gmgnConfigPath + gmgn-config isolation): dual-file persist path. Wajib verify `chartIndicators` nested persist path correct per-profil.
- **F20** (evolveThresholds → reloadScreeningThresholds trigger): post-evolve sync. `reloadScreeningThresholds` at `lessons.js:311`.
- **F2** (cron-restart via `registerCronRestarter`): 7 cron task restart bila interval keys mutate.
- **F19** (addLesson post-config-change): `["self_tune","config_change"]` tag distinguishes config-audit dari trading lessons. Briefing F25 filter tag utk "🔧 Config changes (24h): N" line.
- **F24** (buildRecommendations reads mutated config): next-cycle sees new thresholds.
- **F18** (exit mekanis baca `config.management`): stopLoss/trailing/yield/OOR polluted by `/setcfg` lifespan.
- **F4** (agent.js LLM tool-dispatch): caller surface utk LLM-driven config tuning. Parallel tool-call race E.5.
- **F9** (deploy safety check): baca `config.risk.maxDeployAmount` + `config.management.deployAmountSol` post-mutation.

---

## §H — Open-Q (bawa ke fase F29, F30, F26)

1. **E.1 singleton/file divergence**: persist-first then live-mutate invariant — atomic config pipe. Worth-fix shared dgn F26 persistConfigChange.
2. **E.2 array no-op dedup**: `JSON.stringify(current) === JSON.stringify(next)` utk array keys anti-repeat lesson burn.
3. **E.3 alias display**: `binsBelow`/`takeProfitFeePct` alias user-facing label di /config F30.
4. **E.4 screeningSource gmgn strict-reject bila no gmgnApiKey**: silent fallback — worth F29 verify config schema strict-reject behavior.
5. **E.5 parallel LLM tool-call race**: agent.js F4 parallel tool policy. Worth-F4 audit parallel guard.
6. **E.6 definitions.js manual VALID KEYS list drift**: auto-generate dari CONFIG_MAP utk sync invariant.
7. **E.7 reloadScreeningThresholds 56-key doesn't cover experiments/indicators/schedule/llm/etc**: hand-edit utk non-screening keys needs restart. Worth `/setcfg` skip-restart doc advisory.
8. **E.8 "off" coerce-to-null sentinel ambiguity** for boolean-default-true keys: worth SETTINGS-GUIDE clarifikasi "off → unset (= factory default), bukan false-disable".
9. **E.10 `_lastAgentTune` naming misleading**: namai `_lastConfigTune` perbaikan kalritas human vs LLM source.
10. **cron-restart gate hanya 3 interval keys (`managementIntervalMin`/`screeningIntervalMin`/`pnlPollIntervalSec`)**: bila future-extension cron tied ke config key lain (e.g. `healthCheckIntervalMin` walaupun healthTask cron hardcoded `"0 * * * *"` hourly), restart trigger requires manual extension. Document next-key addition path.
11. **Schema strict-reject error feedback ke LLM**: invalid[] kembali ke caller (LLM) — bila LLM receives "invalid model id format", loop retry or clear. Worth agent.js F4 error-rejection surface audit.