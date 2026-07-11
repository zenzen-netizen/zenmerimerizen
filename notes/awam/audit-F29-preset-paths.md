# Audit F29 — Preset (racikan) + envcrypt + addprofil (profil) + paths per-profil + config-schema invariant
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory — alasan: 7 module coordination (paths.js 32 baris 19-path resolve per-profil via `MERIDIAN_DATA_DIR`/`MERIDIAN_CONFIG_PATH` env override + repo-root.js anchor + preset-manager.js 190 baris `applyPreset` swap+backup-rollback + envcrypt.js 128 baris XOR-encrypt `.env` per-profil + addprofil.js 169 baris scaffolder profil baru (data-only, secret manual) + profil-export.js 118 baris disaster-recovery tar + racikan-export.js 113 baris racikan-only + config-schema.js 285 baris 165-key schema strict/light). **Racikan** = snapshot sekali-muat (file-swap via `applyPreset`, restart-required utk env-keys). **Profil** = data-dir isolated (multi-wallet, multi-bot). **Paritas kontrak**: tanpa `MERIDIAN_DATA_DIR` → paths = `REPO_ROOT` → path IDENTIK dengan lokasi lama (factory single-profil untouched). Live `activeSetup=mainzen_v2_1`, `preset=custom`, 4 preset tersimpan (`mainzen_v2`, `mainzen_v2_1`, `mainzen`, `bigcapagresif`) + `_backup` rollback. 1 profil live `meridianzenbot3` scaffolded. Addprofil strict bound — SECRET (wallet/token) + `pm2 start` MANUAL (modul cuma scaffold data). envrypt XOR-base64 + `# encrypted` marker block. config-schema 165-entry paritas dengan CONFIG_MAP (single source of truth utk validation + non-drift). `formatIdentity` 🧬 Profil/🗂️ Racikan block shared `/config`/`/settings`/`/report`/briefings.
> Cross-ref: F26 (config.js paths.userConfigPath/gmgnConfigPath source + singleton reload), F28 (CONFIG_MAP mutation pipeline persist path via `paths.userConfigPath` + `paths.gmgnConfigPath` + chartIndicators nested + validateConfigValue schema source), F23 (memory store 7-path via `paths.*` resolve — poolMemory/candidateMemory/decisionLog/smartWallets/tokenBlacklist/strategyLibrary/solBalanceHistory + dev-blocklist STRAGGLER via `repoPath` langsung), F25 (briefing.js STATE_FILE/LESSONS_FILE use `paths.statePath`/`paths.lessonsPath` + tracker paths + format identity), F30 (`/addprofil` + `/export profil` Telegram commands + racikan `applyPreset`/`savePreset`/`listPresets` + identity block display), F27 (experiments config-schema entries surface), F13 (dlmm.js paper path/llmCostLog via paths).

## Ringkasan eksekutif (5 baris)
1. **`paths.js` 32-baris, 19 path resolve per-profil via env override + paritas-repo-root anchor**. `paths.js:4-6` `dataDir = process.env.MERIDIAN_DATA_DIR ? path.resolve(REPO_ROOT, ...) : REPO_ROOT` (anchor paritas). `userConfigPath` opsi override `MERIDIAN_CONFIG_PATH` bisa terpisah (`:8-10`) utk split-config-data-arah. 19 export (`:12-32`): `dataDir` + `userConfigPath` + `presetsDir`/`gmgnConfigPath`/`statePath`/`lessonsPath`/`lessonsArchivePath`/`poolMemoryPath`/`decisionLogPath`/`hivemindCachePath`/`candidateMemoryPath`/`signalWeightsPath`/`smartWalletsPath`/`tokenBlacklistPath`/`strategyLibraryPath`/`solBalanceHistoryPath`/`llmCostLogPath`/`gasLogPath`/`logDir`. Semua sub-path `path.join(dataDir, ...)` konsisten ikut profil aktif. `repo-root.js:7` `REPO_ROOT = __dirname` (file-URL stable under PM2 + npm + CLI) + `repoPath(...segments)` helper. **Paritas**: tanpa `MERIDIAN_DATA_DIR` set → `dataDir === REPO_ROOT` → semua path identik dgn lokasi hardcoded lama (bot single-profil existing untouched). **Kontrak**: paritas tingkat-1 (no-env = no-change) + isolasi (env = per-profil data) + sub-path konsisten (`presetsDir` di profil-aktif = `dataDir/presets/`, bukan repo-root share). **Lint**: 1 straggler `dev-blocklist.js` pakai `repoPath("dev-blocklist.json")` langsung (F23-E.1, tak ikut `paths.*`) — tak bisa per-profil isolation.
2. **`preset-manager.js` 190-baris racikan = snapshot file-swap via `applyPreset(name)` + 5 helper + getActiveSetupStatus "edited" detector**. Kontrak racikan: `user-config.json` = live config; `presets/<name>.json` = shelf snapshot; `applyPreset` swaps file (auto-backup `_backup.json` rollback) — restart utk derive env-keys (DRY_RUN/wallet/RPC/model) yang read-once@startup. 5 export: `validName` (`:74` NAME_RE `[a-z0-9_-]+` max 40 char), `presetExists`, `listPresets` (`:83` baca semua `.json` utk display summary + isCurrent detect), `savePreset(name)` (`:111` STAMP `activeSetup=name` di current + persist BOTH live user-config + preset), `getPresetDiff(name)` (`:125` flatten + diff `current → preset` utk preview), `applyPreset(name, {backup=true})` (`:137` parse-FIRST validate + stamp name + backup `cp` + writeFileSync), `getActiveSetupStatus` (`:158` baca current + diff vs preset → `edited:bool`), `formatIdentity` (`:174` 🧬 Profil + 🗂️ Racikan block shared `/config`/`/report`/briefing), `deletePreset`. **META_KEYS** `:45` `{preset, activeSetup}` exclude dari diff (identity meta, bukan value). **Kontrak kernel**: hutan-backup `_backup` auto-written BEFORE write (`:147`) → `applyPreset("_backup")` rollback clean meski `_backup` overwrite di same call. Pre-persist validate (`:139` JSON.parse pertama) → bila parse-fail → throw before touching file (atomic tàu halt). **Bukan** restart trigger — caller decides (system `/preset use` menjalankan `applyPreset` + auto-restart under pm2 via `restartCronRestarter? NO, via ecosystem.config.cjs`). Live: `mainzen_v2_1.json` + `mainzen_v2.json` + `mainzen.json` + `bigcapagresif.json` + `_backup.json` 5 preset tersimpan.
3. **`envcrypt.js` 128-baris XOR-base64 + `# encrypted` marker block + per-profil via `paths.dataDir`**. `loadEnv()` `:75` top-level side-effect `:128` — decode `.env` dan decrypted-block langsung ke `process.env` dgn `override:true` (repo `.env` win atas PM2 stale env on restart). **Encrypt** `:59` XOR char-wise (`char.charCodeAt(0) ^ key.charCodeAt(index % key.length)`) → Buffer ascii → base64. **Decrypt** `:68` reverse: base64 → XOR-char. **Marker block** `:14` `# encrypted` line followed by `KEY=value` interpreted as encrypted entry to decrypt; subsequent non-marker line stops block (`:26` empty line + `:32` reset). **`shouldEncryptEnvKey`** `:53` regex `_KEY$` atau `ENVRIPT_` prefix atau `PRIVATE|SECRET|TOKEN|PASSPHRASE|PASSWORD|MNEMONIC` i-match — secret auto-encrypt. **`getEnvcryptKey`** `:40` priority `ENVRYPT_KEY` env > `ENVCRYPT_KEY` env > file `.envrypt` di `paths.dataDir/.envrypt` — per-profil isolation (key di data-dirprofil sendiri). **`encryptEnvRaw`** `:99` dari `.env.raw` → `.env` dgn encrypted-block — write setup tool. Per-profil: `DEFAULT_ENV_PATH` `:11` `path.join(paths.dataDir, '.env')` + `DEFAULT_KEY_PATH` `:12` `path.join(paths.dataDir, '.envrypt')` — ikut `MERIDIAN_DATA_DIR`. Paritas: tanpa env → `paths.dataDir === REPO_ROOT` → same path `.env` lama. **Kontrak security**: XOR-base64 NOT cryptographically-secure — obscurity layer utk casual-file-peek, BUKAN lawan-serius. Hardcoded key min 8 char (`:47`). `process.env.ENVRYPT_KEY` eksternal env utk CI ops.
4. **`addprofil.js` 169-baris scaffolder profil baru DATA-ONLY + 4-file output (user-config + presets/empty + .env.template + ECOSYSTEM-SNIPPET + RESTORE.txt)**. `scaffoldProfil(name)` `:125` validName (`:19` max 32 char) → mkdir `profiles/<name>/` + `profiles/<name>/presets/` → seed `user-config.json` dari `user-config.example.json` template + force `dryRun=true` (paper pagar) + seed 4 model default free-tier (`nvidia/nemotron-3-ultra-550b-a55b:free` utk screening/management/general + `deepseek-v4-flash-free` general) → write `.env.template` (`:36` 14-field template: WAJIB `WALLET_PRIVATE_KEY`+`TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID`+`TELEGRAM_ALLOWED_USER_IDS` + LLM UTAMA `OPENROUTER_API_KEY` + FALLBACK `LLM_FALLBACK_API_KEY`+`LLM_FALLBACK_BASE_URL`+`LLM_FALLBACK_MODEL` + RPC/infra `RPC_URL`+`HELIUS_API_KEY` + opsional `LPAGENT_API_KEY`+`LOG_LEVEL`+`ALLOW_SELF_UPDATE` + `DRY_RUN=true`) → write `ECOSYSTEM-SNIPPET.txt` (`:73` pm2 routing-only TANPA secret, dengan `MERIDIAN_DATA_DIR=profiles/<name>` + `MERIDIAN_PROFILE=<name>`) → write `RESTORE.txt` (`:100` 6 langkah MANUAL owner: bikin wallet Solana baru + bikin telegram bot baru + isi `.env.template` rename `.env` + tempel ECOSYSTEM-SNIPPET ke `ecosystem.config.cjs` + edit `user-config.json` + `pm2 start`). **Bound TEGAS** `:4-10` comment: data-only, SECRET + `pm2 start` = MANUAL (bot tak boleh bikin wallet/token/sendiri-sendiri — keamanan + kebertanggungjawaban). .env auto-baca per-profil (envrypt-per-profil aktif sejak `ce37fa5`). `validProfilName` + `profilExists` + `listProfil` helper. Live: 1 profil `meridianzenbot3` scaffolded.
5. **`config-schema.js` 285-baris 165-key paritas CONFIG_MAP + strict/light type rules + validateConfigValue single fn**. `CONFIG_SCHEMA` (`:44`) obj 165-entry `[key]: {type, strict?, min?, max?, label?, values?, integer?}`. **Descriptor builders** (`:35-41`): `model()` (provider/slug RE `:25` `^[a-z0-9-]+/[a-z0-9._-]+(:[a-z0-9-]+)?$`), `bool()` (nullable-allowed utk "off" disable idiom), `str()` (free text), `arr()` (accept array/string-comma), `enumOf(...values)` (closed set), `num(light)` (nullable), `numStrict({min,max,label,integer?})` (hard-range + non-null + integer-opcion). `INDICATOR_PRESETS` `:29` 9-entry (8 entry + smi) closed-set utk indicator entry/exit preset validation. **`validateConfigValue(key, value)` `:237`** single export: switch on `s.type` (model/boolean/enum/number/array/string/default) — return error string utk reject or null utk allow. **STRICT** cases verified live: `stopLossPct` `:87` min -100 max 0 (negative-lossy); `takeProfitPct`/`takeProfitFeePct` `:88-89` 0-500; `trailingTriggerPct/trailingDropPct` `:91-92` 0-500; `deployAmountSol/gasReserve` `:96-97` min 0; `maxPositions` integer min 1 (assume); `screeningModel`/`managementModel`/`generalModel` RE model format. **Fail-open** `:241` schema-absent key pass. **Principle** `:14` "when in doubt, ALLOW". **Coverage** comment `:6` "one entry per CONFIG_MAP key, same order/grouping" (+ parity test asserts). Live `validateConfigValue` called di F28 mutation pipeline step 5 (`executor.js:582`). Per F28 cross-verify E.4 — Boolean-default-true keys bila `/setcfg avoidPvpSymbols off` → null → singleton live null (eval falsy = OFF); restart-able bila reloadScreeningThresholds+`??true` reset pool tak triggered.

## Progress
- [x] Spec F29 baca PLAN line 126 (⬛⬛ mandatory — preset/envcrypt/addprofil/paths/schema multi-module coordination)
- [x] Cross-ref F26 (paths source for config + reloadScreeningThresholds 56-key includes promptNotes/activeSetup/sizingMode/rent promotion), F28 (CONFIG_MAP persist path via paths + validateConfigValue schema source), F23 (memory store 7-path via paths.* resolve — paritas path audit), F25 (briefing state/lessons/tracker path via paths), F30 (/addprofil + /export commands + racikan `applyPreset`/`savePreset`/`listPresets` Telegram handlers + formatIdentity shared), F27 (experiments config-schema entries surface), F13 (dlmm.js paper paths via paths), F33 (hivemind cache path + tracker paths)
- [x] Baca paths.js full 1-32 (19-path + paritas + dataDir anchor + 2 env override)
- [x] Baca repo-root.js full 10 baris (REPO_ROOT + repoPath helper)
- [x] Baca preset-manager.js full 1-190 (5 export + applyPreset swap+backup + getActiveSetupStatus edited-flag + formatIdentity + diffConfigs flatten + META_KEYS exclude)
- [x] Baca envcrypt.js full 1-128 (XOR-base64 + encrypted marker block + shouldEncryptEnvKey regex + per-profil paths + loadEnv override + encryptEnvRaw setup tool)
- [x] Baca addprofil.js full 1-169 (scaffoldProfil 5-step + RESTORE.txt template + ECOSYSTEM-SNIPPET routing-only + envTemplate 14-field + bound TEGAS data-only)
- [x] Baca config-schema.js 1-100 + 230-285 (CONFIG_SCHEMA 165-entry + descriptor builders + validateConfigValue switch + fail-open + principle)
- [x] Baca profil-export.js 1-40 (disaster-recovery tar full-profile, secret NOT stripped, 15-file DATA_FILES via paths.* + IDENTIFY_FILES repo-level)
- [x] Verifikasi live: paths `dataDir === REPO_ROOT` (no MERIDIAN_DATA_DIR set main-bot), `activeSetup=mainzen_v2_1`, `preset=custom`, `_lastAgentTune=2026-07-04T11:41:47.922Z`
- [x] Verifikasi presets/ live 5 file (`mainzen_v2/mainzen_v2_1/mainzen/bigcapagresif/_backup`) + profiles/ live 1 (`meridianzenbot3`) scaffolded
- [x] Verifikasi ecosystem.config.cjs contains `MERIDIAN_DATA_DIR=profiles/meridianzenbot3` env (multi-profil live)
- [x] Verifikasi callers rg: `index.js:41/42/43` racikan-export/profil-export/addprofil import; `:2810` exportProfil; `:2835` exportRacikan; `:2870` scaffoldProfil
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Rumah susun multi-profil + lemari resep per-profil + brankas kunci per-profil*: tiap profil = 1 unit apartemen terpisah dengan: (1) **lemari resep** (`user-config.json`), (2) **buku racikan** (`presets/<name>.json` — shelf snapshot utk swap), (3) **brankas kunci** (`.env` + `.envrypt` — secret per-profil), (4) **buku harian** (`state.json`+`lessons.json`+tracker 4-store — data belajar). **Tukang scaffolder** (`addprofil`) cuma bangun unit baru + isi perabot kosong + cetak surat panduan: "isi brankas wallet sendiri + bikin telegram bot sendiri + tempel block ke daftar apartemen + nyalakan meteran". **Tukang swap racikan** (`preset-manager`) hanya tukar isi lemari resep satu-persen-satu dgn backup auto (kalau user tak suka → `/preset use _backup` balik). Tukang tak nyala/mati unit. **Brankas kunci** tak bisa diakses tukang — manual owner isi krn keamanan.
- **Hidroponik multi-kolam + 19-pipa inlet per-kolam**: sistem punya 19 pipa inlet (user-config/gmgn-config/state/lessons/tracker dst) yang harus baca per-kolam aktif. **Patokan lubang inlet** (`paths.js`) menentukan lubang ke kolam mana — kalau `MERIDIAN_DATA_DIR=profiles/kolam-A` → semua 19 pipa nyambung ke kolam A; tanpa env → semua nyambung ke kolam utama (paritas). Saklar 1 ubah 19 pipa arah. **Tukang resolusi-pipa** menjamin tiap modul baca/tulis konsisten per-kolam. **Pipa straggler** `dev-blocklist.json` nyambung ke patokan global (tak ikut kolam) — outlier inkonsistensi. Konsep sama: `paths.js` = patokan lubang, 19 inlet ikut env.

**Di bot, ini = 7-module coordination utk multi-profil isolation + racikan snapshot file-swap + env crypt obscurity + schema validation strict-light** (1-2 kalimat)
`paths.js` 19-path resolve per-profil via `MERIDIAN_DATA_DIR`/`MERIDIAN_CONFIG_PATH`, paritas-repo-root anchor. `preset-manager.js` swap user-config.json + backup; env-keys restart-needed. `envcrypt.js` XOR-base64 + `# encrypted` marker per-profil. `addprofil.js` data-only scaffolder with SECRET+pm2 manual bound. `config-schema.js` 165-key single-source-of-truth validateConfigValue. `profil-export.js` disaster-recovery tar-bundel; `racikan-export.js` racikan-only tar. `formatIdentity` 🧬 Profil/🗂️ Racikan shared surface.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F26 (config singleton source + `paths.userConfigPath`/`gmgnConfigPath`), SETELAH F28 (CONFIG_MAP persist via paths + validateConfigValue schema source), PARALEL-F23 (memory stores 7-path resolve cross-verify paritas), SEBELUM F30 (`/addprofil`+`/export profil`+`/preset`+formatIdentity Telegram commands). F29 = **Lapisan 8 (Config) data-persistence layer**: paths coord + preset swap + envcrypt + profil scaffold + schema gate. Tanpa F29, bot single-profil hardcoded; tak bisa multi-wallet; racikan tak bisa swap; `.env` secret plaintext.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Startup path resolution**: `paths.js` top-level execution — `dataDir` resolve via `MERIDIAN_DATA_DIR` env (atau paritas `REPO_ROOT`) → 19 export sub-path bawah `dataDir`.
2. **Env load**: `envcrypt.js:128` `loadEnv()` top-level — baca `.env` di `paths.dataDir/.env` dgn dotenv + override:true → decrypt `# encrypted` block via `.envrypt` key → `process.env[encryptedKey] = decrypted`.
3. **Config load**: `config.js:8-22` `readJsonIfExists(paths.userConfigPath)` + `paths.gmgnConfigPath` → singleton 19-section.
4. **Racikan swap** (bila user `/preset use <name>`): `preset-manager.applyPreset(name)` parse-FIRST-validate + stamp `activeSetup=name` + `cp user-config → presets/_backup.json` + write user-config baru. Caller (Telegram `/preset use`) menjalankan auto-restart under pm2 via `/preset` page (env-level keys need fresh process; F30 detail). Comment `:7-9` explicit "process restart is what actually re-derives the live config, because env-level keys (DRY_RUN/wallet/RPC/model) are read once at startup."
5. **Racikan save** (`/preset save <name>`): `savePreset(name)` stamp `activeSetup=name` di current + persist BOTH live `user-config.json` AND `presets/<name>.json` (mirror) — so `/report` displays racikan attribution (F25 `formatIdentity`).
6. **Profil scaffold** (`/addprofil <name>`): `scaffoldProfil(name)` mkdir `profiles/<name>/` + `presets/` kosong + seed `user-config.json` (template + dryRun=true + model free) + `.env.template` (14-field kosong) + `ECOSYSTEM-SNIPPET.txt` (pm2 routing) + `RESTORE.txt` (6 langkah MANUAL). Output ke Telegram `steps` block.
7. **Profil start** (owner manual): isi `profiles/<name>/.env.template` → rename `.env`, tempel ECOSYSTEM-SNIPPET ke `ecosystem.config.cjs` apps[], `pm2 start ecosystem.config.cjs --only meridian-<name>`. Process start → envvars set → `paths.js` resolve `dataDir=profiles/<name>` → all 19 path switch profil.
8. **Profil export** (`/export profil`): `profil-export.exportProfil({archive:true})` cp 15 DATA_FILES + 2 IDENTITY_FILES + presets/ rekursif → `exports/profil_<label>_<stamp>/` dgn each file `chmod 600` (secret NOT stripped utk disaster-recovery offline-only).
9. **Schema validate** (per `/setcfg` / `/settings` mutation): F28 pipeline step 5 calls `validateConfigValue(key, value)` — STRICT utk model id RE + risk/sizing numerics + enums closed-set; LIGHT utk num/bool/arr/str; fail-open utk absent key.
10. **Output**: per-profil data birfukasi total (config + presets + secret + state + lessons + tracker); schema PASS = allow mutation, FAIL = reject w/ message; racikan swap atomic+backup+restart; profil scaffold data-only.

**Output 7-module coordination**: 19-path resolve per-profil; racikan swap atomic; env secret encrypt; profil scaffold; schema validation strict-light; profil/racikan export disaster-recovery. Side-effect: multi-bot single-repo possible, racikan drift detection via diff; config garbage schema-reject prevent LLM slugify. Trigger ke fase berikut: F30 Telegram bot multi-profil command (`/addprofil`/`/export`/`/preset`/`/guide`), F28 mutation path inviolate through schema gate, F23 memory path consistent, F26 reloadScreeningThresholds 56-key insight (E.1) experiments tak covered.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
`paths.userConfigPath` corrupt → `readJsonIfExists` F26 E.1 not wrapped (config.js:17) → boot crash. `presets/<name>.json` corrupt → `applyPreset:139` `JSON.parse` throw BEFORE touching live `user-config` (atomic-validate-first) → halt clean tidak mutate. `_backup` overwrite by same `applyPreset` call → rollback `applyPreset("_backup")` kembali. `profiles/<name>/.env` missing `ENVRYPT_KEY` → ekses `loadEnv()` throw bila `# encrypted` block ditemukan but no key (`:84`) → process exit. `config-schema.js` entry absence utk new CONFIG_MAP key → fail-open allow mutation (schema-parity test SHOULD caught this — comment `:7` "asserted by parity check below + tests"). `dev-blocklist.js` straggler `repoPath` tak per-profil (`F23-E.1`) — bila user make profil baru, `dev-blocklist.json` tetap global share → cross-profil leak potential. Skip F29 = tak paham multi-profil isolation + racikan atomic swap + envrypt + schema strict invariant.

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **`paths`** — 19-path resolve via `MERIDIAN_DATA_DIR`+`MERIDIAN_CONFIG_PATH` env + paritas REPO_ROOT anchor.
- **`REPO_ROOT`** — `repo-root.js:7` `__dirname` stable under PM2/npm/CLI.
- **`dataDir`** — `paths.dataDir` root dir profil aktif. Tanpa env = REPO_ROOT (paritas).
- **paritas kontrak** — no-env MERIDIAN_DATA_DIR → paths = REPO_ROOT = factory single-profil untouched.
- **racikan** — full user-config snapshot `presets/<name>.json`. Self-contained behavior-as-data.
- **`applyPreset(name,{backup})`** — atomic file-swap + auto-backup `_backup`. Restart-required utk env-keys.
- **`savePreset(name)`** — stamp `activeSetup=name` + persist BOTH live + snapshot mirror.
- **`getActiveSetupStatus`** — `{name, edited, exists}` utk "✎ (ada edit manual)" indicator.
- **`formatIdentity`** — 🧬 Profil + 🗂️ Racikan block shared `/config`/`/report`/briefing.
- **META_KEYS** — `{preset, activeSetup}` exclude dari diff (identity meta, bukan value).
- **envcrypt** — XOR-base64 + `# encrypted` marker block per-profil. NOT crypto-secure.
- **`shouldEncryptEnvKey`** regex — `_KEY$` atau `ENVRIPT_` atau `PRIVATE|SECRET|TOKEN|PASSWORD|MNEMONIC`.
- **`loadEnv({override:true})`** — repo `.env` win atas PM2 stale env on restart.
- **`encryptEnvRaw`** — `.env.raw` → `.env` dgn encrypted-block setup tool.
- **`addprofil.js`** — scaffolder DATA-ONLY, SECRET + `pm2 start` MANUAL bound.
- **`scaffoldProfil(name)`** — 5-file output (user-config + presets + .env.template + ECOSYSTEM-SNIPPET + RESTORE.txt).
- **bound TEGAS data-only** — modul tak boleh bikin wallet/token/sendiri-sendiri — keamanan+accountability.
- **`profiles/<name>/`** — folder per-profil dgn user-config + presets + .env + data learning + state.
- **`ECOSYSTEM-SNIPPET.txt`** — pm2 routing block TANPA secret utk tempel ke `ecosystem.config.cjs`.
- **`RESTORE.txt`** — 6 langkah MANUAL owner (wallet + telegram + .env + ecosystem + config + pm2 start).
- **`profil-export.js`** — disaster-recovery tar bundel. Secret NOT stripped. `chmod 600` each file.
- **`racikan-export.js`** — racikan-only tar bundel (strip identity + presets only).
- **`config-schema.js`** — 165-key schema single source-of-truth utk validation.
- **`validateConfigValue`** — single fn STRICT/LIGHT/fail-open switch on `s.type` (model/enum/number/bool/arr/str).
- **STRICT** — hard reject utk harmful (model id RE, risk/sizing range, enums closed set).
- **LIGHT** — type-check only (num/bool/arr/str type ping).
- **fail-open** — schema-absent key → null allowed.
- **`MODEL_ID_RE`** — `^[a-z0-9-]+/[a-z0-9._-]+(:[a-z0-9-]+)?$` utk kill "minimax_m2_5" slugify bug.
- **`numStrict`** — hard-range `{min,max,label,integer?}` utk numerics non-null.
- **`INDICATOR_PRESETS`** — 9-entry closed-set utk entry/exit preset enum.
- **PRINCIPLE** — "when in doubt, ALLOW" — catch obvious garbage only.
- **parity check** — CONFIG_SCHEMA ≡ CONFIG_MAP (asserted by tests). Drift = bug.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A — Peta file fase ini

| File | Peran | Baris kunci |
|------|-------|-------------|
| `paths.js` (32) | **19-path resolve per-profil**: anchor + 2 env override | 4-6 dataDir resolve; 8-10 userConfigPath override; 12-32 19 export |
| `repo-root.js` (10) | **REPO_ROOT + repoPath helper**: stable under PM2/npm/CLI | 7 REPO_ROOT=__dirname; 9 repoPath |
| `preset-manager.js` (190) | **Racikan snapshot file-swap + 5 helper + identity**: atomic+backup | 28 NAME_RE; 30 ensureDir; 45 META_KEYS; 47 flatten; 61 diffConfigs; 74-189 5 export + applyPreset + getActiveSetupStatus + formatIdentity + deletePreset |
| `envcrypt.js` (128) | **XOR-base64 + encrypted marker + per-profil**: secret encryption | 14 isEncryptedMarker; 18 parseEncryptedKeys; 40 getEnvcryptKey; 53 shouldEncryptEnvKey; 59 envryptEncrypt; 68 envryptDecrypt; 75 loadEnv; 99 encryptEnvRaw; 128 top-level side-effect |
| `addprofil.js` (169) | **Profil scaffolder DATA-ONLY**: 5-file output + bound TEGAS | 15 PROFILES_ROOT; 19 validProfilName; 28 listProfil; 36 envTemplate; 73 ecosystemSnippet; 100 restoreSteps; 125-169 scaffoldProfil |
| `config-schema.js` (285) | **165-key schema + validateConfigValue strict-light**: validation gate | 25 MODEL_ID_RE; 29 INDICATOR_PRESETS; 35-41 descriptor builders; 44-220 CONFIG_SCHEMA; 237 validateConfigValue; 285 SCHEMA_KEYS |
| `profil-export.js` (118) | **Disaster-recovery tar profil full**: 15 DATA + 2 IDENTITY + presets | 20 DATA_FILES via paths.*; 27 IDENTITY_FILES repoPath; 32 label; 40 exportProfil |
| `racikan-export.js` (113) | **Racikan-only tar**: strip identity+presets only bundel | — |
| `user-config.example.json` | **Schema template paritas**: blank-secret source utk addprofil seeding | 104-key baseline |
| `presets/_backup.json` | **Auto-rollback snapshot**: pre-apply backup | live |
| `profiles/<name>/` | **Per-profil data-dir**: user-config + presets + .env + state + lessons | path live `profiles/meridianzenbot3/` |

---

## §B — Alur data hulu→hilir (ASCII diagram)

```
                [Startup]
   process.env.MERIDIAN_DATA_DIR    process.env.MERIDIAN_CONFIG_PATH
            │                                  │
            ▼                                  ▼
   paths.js:4-6 dataDir = resolve(REPO_ROOT, MERIDIAN_DATA_DIR) OR REPO_ROOT (paritas)
            │
            ├─ paths.userConfigPath = MERIDIAN_CONFIG_PATH OR dataDir/user-config.json
            ├─ paths.gmgnConfigPath = dataDir/gmgn-config.json
            ├─ paths.presetsDir = dataDir/presets/
            └─ 16 other data-files + logDir (state/lessons/trackers/memory/cache)

                [Env load side-effect]
   envcrypt.js:128 loadEnv({override:true})
            │
            ├── dotenv parse paths.dataDir/.env → process.env (override PM2 stale)
            ├── parseEncryptedKeys → Set utk keys under "# encrypted" marker
            ├── getEnvcryptKey → ENVRYPT_KEY env > ENVCRYPT_KEY env > paths.dataDir/.envrypt file
            └── decrypt process.env[encryptedKey] via XOR-base64

                [Config singleton]
   config.js readJsonIfExists(paths.userConfigPath + paths.gmgnConfigPath) → 19-section singleton

                [Racikan swap path — F30 /preset use]
   user types "/preset use <name>"
            │
            ▼
   preset-manager.applyPreset(name, {backup:true})
            ├── JSON.parse(presets/<name>.json) validate-FIRST (atomic, throw before touch live)
            ├── stamp parsed.activeSetup = name (except _backup)
            ├── cp user-config.json → presets/_backup.json (auto-rollback)
            └── writeFileSync(user-config.json, JSON.stringify(parsed, null, 2))
            │
            ▼
   Telegram F30 caller auto-restart under pm2 (env-level keys need fresh process)
   (after restart: paths/config/envcrypt re-resolve via new user-config env-promotion, fresh config singleton)

                [Profil scaffold path — F30 /addprofil]
   user types "/addprofil <name>"
            │
            ▼
   addprofil.scaffoldProfil(name)
            ├── validProfilName (max 32 char)
            ├── mkdir profiles/<name>/ + presets/
            ├── seed user-config.json (template + dryRun=true + 4 model free)
            ├── write .env.template (14-field kosong)
            ├── write ECOSYSTEM-SNIPPET.txt (pm2 routing-only, MERIDIAN_DATA_DIR=profiles/<name>)
            └── write RESTORE.txt (6 langkah MANUAL owner)
            │
            ▼
   Telegram reply with `steps` block (manual owner instructions)
            │
            ▼
   OWNER manual:
     1. bikin wallet Solana baru
     2. bikin Telegram bot baru via @BotFather
     3. cp .env.template .env + isi WALLET_PRIVATE_KEY/TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID
     4. tempel ECOSYSTEM-SNIPPET ke ecosystem.config.cjs apps[]
     5. edit profiles/<name>/user-config.json
     6. pm2 start ecosystem.config.cjs --only meridian-<name>

                [Schema gate — F28 mutation pipeline step 5]
   validateConfigValue(key, value) ← config-schema.js:237
            │
            ├── switch on s.type (model/enum/number/bool/arr/str/default)
            ├── STRICT reject utk model id format + risk/sizing range + enum closed-set
            ├── LIGHT type-check utk num/bool/arr/str
            ├── fail-open utk schema-absent key (return null = allow)
            └── return error-string utk reject OR null utk allow

                [Profil export — F30 /export profil]
   profil-export.exportProfil({archive:true})
            ├── cp 15 DATA_FILES via paths.* (user-config/gmgn/state/lessons/trackers/memory/cache)
            ├── cp 2 IDENTITY_FILES via repoPath (ecosystem.config.cjs/package.json)
            ├── recursive-cp presets/ via paths.presetsDir
            ├── chmod 600 each file (secret NOT stripped — offline only)
            └── tar -czf profil_<label>_<stamp>.tar.gz (archive=true opt-in)
```

---

## §C — Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| config.js | paths.js paths.userConfigPath/gmgnConfigPath/presetsDir | startup config load | — | paritas REPO_ROOT fallback |
| F26 persistConfigChange | paths.userConfigPath persist | auto-tuner write | — | try-catch false-return |
| F28 update_config | paths.userConfigPath/gmgnConfigPath persist + chartIndicators nested-path | `/setcfg` / `/settings` / agent | — | — |
| envcrypt.js loadEnv | paths.dataDir/.env + paths.dataDir/.envrypt | startup top-level | — | `.env` missing=OK; encrypted block + no key → throw |
| preset-manager applyPreset/savePreset | paths.userConfigPath + paths.presetsDir | `/preset use/save` Telegram | `name` | parse-first atomic |
| addprofil scaffoldProfil | repoPath("profiles"/"user-config.example.json") | `/addprofil` Telegram | `name` | mkdir+validName |
| F30 `/addprofil` handler | addprofil.scaffoldProfil + `steps` block | Telegram slash | — | render error reply |
| F30 `/export profil` handler | profil-export.exportProfil({archive}) | `/export profil` Telegram | — | each file chmod 600 |
| F30 `/export racikan <name>` handler | racikan-export.exportRacikan | `/export racikan` | name | strip identity/presets only |
| F30 `/preset use/save/list/diff/rm` handler | preset-manager 5 fn | `/preset` button page + /preset slash | name | atomic rollback |
| F23 memory stores (7) | paths.poolMemoryPath/candidateMemoryPath/decisionLogPath/smartWalletsPath/tokenBlacklistPath/strategyLibraryPath/solBalanceHistoryPath | runtime | — | file-miss fallback `{}` |
| F25 briefings | paths.statePath/lessonsPath/gasLogPath/llmCostLogPath/solBalanceHistoryPath | cron | — | loadJson fail-open |
| F13 dlmm.js paper paths | paths.* runtime | deploy/close/pnl tracking | — | paritas |
| `repo-root.js` REPO_ROOT | imported across | `__dirname` stable | — | — |
| F28 validateConfigValue | config-schema.js:237 SCHEMA | per-mutation-key schema gate | `(key, value)` | fail-open absent |
| config.js + reloadScreeningThresholds:639 | `u.activeSetup` re-read for hot-edit | post-evolve F20 | — | — |

---

## §D — Logika kunci per fungsi

### paths.js — 32-baris
- **Apa**: 19-path resolve per-profil via env + paritas anchor.
- **Kapan dipicu**: startup module execution (top-level).
- **Output**: `paths` obj with 19 path fields.
- **Sinkron**: `process.env.MERIDIAN_DATA_DIR`/`MERIDIAN_CONFIG_PATH` switch; paritas jika unset = REPO_ROOT.
- **Fail-mode**: env malformed → `path.resolve` still returns string (no validate). Invalid path → file-ops downstream fail (caught).
- **Kontrak**: paritas no-env = no-change (factory untouched); 19 sub-path konsisten ikut `dataDir`; isolasi per-profil.
- **Bukti**: paths.js:1-32; live `dataDir=REPO_ROOT`.

### preset-manager applyPreset — 137-151
- **Apa**: Atomic file-swap preset → live user-config + auto-backup `_backup.json`.
- **Kapan dipicu**: Telegram `/preset use <name>` F30.
- **Output**: `{applied:true, name, backup:backupName}`.
- **Sinkron**: parse-FIRST validate (`:139`) — bila parse-fail → throw before touching live (atomic). Stamp `parsed.activeSetup = name` (except `_backup` rollback). `cp user-config → presets/_backup.json` (`:147`). Write `user-config.json`. Restart needed for env-keys.
- **Fail-mode**: parse throw atomic-pre-touch; write error → singleton same + file partial-write (handled by writeFileSync sync). Caller Telegram side restart-required.
- **Kontrak kernel**: backup always overwritten + `applyPreset("_backup")` rollback clean meski `_backup` overwrite di same call.
- **Live**: 5 preset `mainzen_v2`, `mainzen_v2_1`, `mainzen`, `bigcapagresif`, `_backup` tersimpan.
- **Bukti**: preset-manager.js:137-151.

### savePreset — 111-122
- **Apa**: Stamp `activeSetup=name` di current + persist BOTH live + snapshot mirror.
- **Kapan dipicu**: `/preset save <name>` Telegram.
- **Output**: `{name, overwritten:bool}`.
- **Sinkron**: kedua file (live + preset) dgn identik content supaya `/report` F25 `formatIdentity` show racikan name attribution.
- **Kontrak**: save = "I'm now running racikan <name>".

### getActiveSetupStatus edited-flag — 158-164
- **Apa**: Baca current `activeSetup`. Bila name set + preset exists + diff != 0 → `edited=true` (ada edit manual sejak load).
- **Kapan dipicu**: `formatIdentity` (`:177`) utk ✎ indicator / `/settings` button status.
- **Output**: `{name, edited:bool, exists:bool}`.
- **Sinkron**: `diffConfigs(current, readJson(presetPath(name)))` flatten + skip META_KEYS. Bila diff.length > 0 → edited.
- **Kontrak**: "edited racikan" = user has hand-edited since loaded, tak byte-identical dgn snapshot anymore.
- **Bukti**: preset-manager.js:158-164.

### formatIdentity — 174-184
- **Apa**: 🧬 Profil + 🗂️ Racikan identity block. Compact (1-line) or full (2-line).
- **Kapan dipicu**: `/config`, `/settings`, `/report`, briefings (`briefing.js:370` + `index.js:485`).
- **Output**: string `🧬 Profil: <emoji label> · 🗂️ Racikan: <name><✎?>`.
- **Sinkron**: PROFILE_LABELS `{degen:🔥 Degen, moderate:⚖️ Moderate, safe:🛡️ Safe, custom:✏️ Custom}` (`:166`). `getActiveSetupStatus` utk racikan label.
- **Kontrak**: shared source utk semua surface. Emoji-safe utk Telegram HTML. Bila `activeSetup` set but preset file missing → "🗂️ Racikan: <name> (file hilang)" indicator.

### envcrypt loadEnv — 75-97 + 128 top-level
- **Apa**: Baca `.env` per-profil + decrypt encrypted block via XOR-base64.
- **Kapan dipicu**: startup side-effect `:128`.
- **Output**: `process.env[encryptedKey] = decrypted` + return `{encryptedKeys: [...]}`.
- **Sinkron**: `dotenv.config({override:true})` — repo `.env` wins atas PM2 stale env on restart. `parseEncryptedKeys` find entries under `# encrypted` marker. `getEnvcryptKey` priority env > file.
- **Fail-mode**: encrypted block found + no key → throw (process exit). `.env` missing → dotenv silent.
- **Kontrak security**: XOR-base64 NOT crypto-secure (obscurity only). Key min 8 char. **NOT recommended utk lawan-serius** — comment `:1-10` implicit.
- **Bukti**: envcrypt.js:75-128.

### addprofil scaffoldProfil — 125-168
- **Apa**: Profil scaffolder data-only. 5-file output + restore steps.
- **Kapan dipicu**: Telegram `/addprofil <name>` F30.
- **Output**: `{name, dataDir, created[], steps}`.
- **Sinkron**: Pre-check `validName` + `dataDir exists` (refuse overwrite) + EXAMPLE_CONFIG exists. Seed user-config from template dgn `dryRun=true` + 4 model free default (`nvidia/nemotron-3-ultra-550b-a55b:free`/`deepseek-v4-flash-free`). `.env.template` 14-field kosong dgn caveat. `ECOSYSTEM-SNIPPET.txt` pm2 routing-only (TGK secret di git). `RESTORE.txt` 6-langkah MANUAL.
- **Fail-mode**: invalidName → throw; dataDir exists → refuse; EXAMPLE missing → throw; file write error → propagate.
- **Kontrak TEGAS**: data-only — SECRET (wallet/token/telegram) + `pm2 start` = MANUAL. Modul tak boleh bikin wallet/token (security + accountability + privacy).
- **Live**: `profiles/meridianzenbot3/` 1 profil scaffolded + `ecosystem.config.cjs` has `MERIDIAN_DATA_DIR=profiles/meridianzenbot3` env.
- **Bukti**: addprofil.js:125-168; ecosystem.config.cjs:41-42.

### config-schema validateConfigValue — 237-285
- **Apa**: Single fn switch on schema descriptor type. STRICT utk harmful, LIGHT type-check else, fail-open absent.
- **Kapan dipicu**: F28 mutation pipeline step 5 (`tools/executor.js:582`) per-key.
- **Output**: error string utk reject, null utk allow.
- **Sinkron**: read `CONFIG_SCHEMA[key]` descriptor → switch `s.type` (model/boolean/enum/number/array/string/default). MODEL_ID_RE check utk model type. Closed-set `s.values` utk enum. Hard-range `{min,max}` utk strict num. Integer check bila set.
- **Fail-mode**: schema-absent → null (fail-open). Null value utk STRICT numbers → reject (can't clear deployAmountSol to "off").
- **Kontrak**: RAGU = IZINKAN. Catch obvious garbage only (e.g. `minimax_m2_5` slugify bug — motivating case comment `:23`). PRINCIPLE `:14`.
- **Coverage invariant**: comment `:6` "one entry per CONFIG_MAP key, same order/grouping" - parity test asserts.
- **Bukti**: config-schema.js:237-285.

### profil-export exportProfil — 40-end
- **Apa**: Disaster-recovery tar bundel satu profil penuh (config + presets + 15 DATA + 2 IDENTITY).
- **Kapan dipicu**: Telegram `/export profil` F30.
- **Output**: `{label, outDir, copiedCount, copied, skipped, archived}`.
- **Sinkron**: 15 DATA_FILES via `paths.*`. 2 IDENTITY_FILES via `repoPath`. presets/ recursive via `paths.presetsDir`. `chmod 600` each file (secret NOT stripped — offline-only). Archive opt-in → tar -czf.
- **Kontrak kernel**: secret NOT stripped utk disaster-recovery — jadi output WAJIB offline-only. Per `profil-export.js:5-8` comment.
- **Bukti**: profil-export.js:1-118.

---

## §E — Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — `dev-blocklist.js` STRAGGLER pakai `repoPath` langsung, tak ikut `paths.*` per-profil isolation
**Lokasi**: `dev-blocklist.js:13` (per F23-E.1 cross-verify).
**Temuan**: `dev-blocklist.json` pakai `repoPath("dev-blocklist.json")` langsung, BUKAN `paths.tokenBlacklistPath`/`paths.devBlocklistPath`. Konsekuensi: bila user buat profil baru via `addprofil`, file `dev-blocklist.json` tetap di repo-root share lintas-all-profil — cross-profil leak potential. Profil A blockDev "ScamTokenX" → Profil B juga kena hard-filter `isDevBlocked` dari repo-root shared file.
**Mitigation existing**: documented F23-E.1. Worth-fix add `paths.devBlocklistPath = dataDir + "dev-blocklist.json"` + reroute `dev-blocklist.js`.
**Cross-F23 priority** — profil isolation consistency.

### E.2 — `loadJson` di `briefing.js:549` tidak wrap defensif sama dgn `readJsonIfExists` di `config.js`
**Lokasi**: `briefing.js:549-556`.
**Temuan**: `function loadJson(file) { if (!fs.existsSync(file)) return null; try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (err) { ... return null; } }` — wrapped try-catch OK utk briefing. **Beda** dengan `config.js:15 readJsonIfExists` yang NOT wrapped (F26 E.1 — boot-crash on corrupt user-config.json). Live ekses known-path: `state.json` bila corrupt → briefing `loadJson` return null → fallback `{ positions: {}, recentEvents: [] }` (fail-open OK). TAPI `config.js:17 readJsonIfExists` corrupt → boot-crash.
**Asymetri robustness**: config-load path fragile, briefing-load path robust. Worth-fix F26 E.1 — wrap `readJsonIfExists` try-catch.

### E.3 — `applyPreset` return BEFORE restart — Telegram caller handles restart via pm2
**Lokasi**: preset-manager.js:149-150 + F30 Telegram caller.
**Temuan**: `applyPreset` writeFileSync user-config baru + return `{applied:true}` BUKAN restart trigger. Comment explicit `:7-9` "Does NOT restart the process; the caller decides how to apply (env-level keys need a fresh process)." Telegram side `/preset use` handler F30 menjalankan `pm2 restart` via the cmd (or auto-restart via `registerCronRestarter`?).
**Kontrak**: env-keys (`DRY_RUN/wallet/RPC/model/apiKey/etc` — promoted `:55-66` di config.js) read-once@startup via `process.env.X ??= u.x`. Bila racikan baru set `DRY_RUN=true` → tanpa restart, `process.env.DRY_RUN` tetap OLD value → env-vars stale.
**Worth-F30 verify** auto-restart behavior. CLAUDE.md F29 explicit "auto-restarts under pm2". Bila user save racikan via CLI `preset.js`, MANUAL restart needed (no auto path).
**Documented** — comment. Worth-F30 surface verify.

### E.4 — `coerceConfigValue` → `null` sentinel Asimetri vs `reloadScreeningThresholds` (`?? true`) reset for boolean-default-true keys
**Lokasi**: F28 E.8 cross-verify + config.js:606-666 reloadScreeningThresholds.
**Temuan**: `/setcfg avoidPvpSymbols off` → null via coerceConfigValue. Live singleton `config.screening.avoidPvpSymbols = null`. Eval `if (config.screening.avoidPvpSymbols && ...)` null = falsy = OFF (intended user "off" disable). Bila `reloadScreeningThresholds` trigger post-evolve (`:625 knows avoidPvpSymbols !== undefined → fresh.avoidPvpSymbols ?? null OR fresh.avoidPvpSymbols` if fresh has null → set null OR set false? readJson → null OR false). User-config writes `null` value (not false). Reload baca `fresh.avoidPvpSymbols` masih null → set `config.screening.avoidPvpSymbols = null`. Sama.
**Bila restart**: `config.js:149 u.avoidPvpSymbols ?? true` → `u.avoidPvpSymbols = null` (nullish-coalesce picks true) → `config.avoidPvpSymbols = true` factory re-enable.
**Ekses**: User `/setcfg avoidPvpSymbols off` → live null-OFF → restart → `?? true` re-enables → confused "why it came back?". Worth SETTINGS-GUIDE clarifikasi: "OFF = unset (factory default re-enables on restart), bukan persistent-disable."
**Cosmetic-doc-clarification**.

### E.5 — `MODEL_ID_RE` STRICT-REJECT feel — LLM loop retry policy
**Lokasi**: config-schema.js:25.
**Temuan**: Bila LLM `/setcfg screeningModel minimax_m2_5` (slugify garble) → STRICT reject `return "model id harus format provider/slug..."`. LLM receives error → retry? F4 agent.js error-rejection surface. Bila LLM keeps sending same wrong format → infinite loop potential. Worth agent.js loop guard + error-message clear.
**Kontrak**: motivating bug per comment `:23`. Working as intended. LLM should learn from error.
**Worth-F4** retry-policy audit.

### E.6 — `paths.js` tak validation `MERIDIAN_DATA_DIR` path — malformed → silent corruption path all 19-module
**Lokasi**: paths.js:4-6.
**Temuan**: `dataDir = process.env.MERIDIAN_DATA_DIR ? path.resolve(REPO_ROOT, process.env.MERIDIAN_DATA_DIR) : REPO_ROOT`. Tak validate path exists. Bila env malformed (e.g. `MERIDIAN_DATA_DIR="/foo/nonexistent"` → resolve OK) → 19 modules baca path yang tak ada → files not-found fallback empty `{}` everywhere → bot bare-baseline.
**Mitigation**: file-ops downstream fail-open individually (defaults). But user confused "kenapa config hilang semua?" Worth validate at startup + log warning "dataDir doesn't exist".
**Cosmetic-robustness** — add startup check.

### E.7 — `envcrypt` XOR-base64 NOT cryptographically-secure — documented obscurity layer
**Lokasi**: envcrypt.js XOR char-wise `:60-72`.
**Temuan**: XOR with key min 8 char amat weak — not real encryption. Comment `1-10` implicit. Anyone with `.env` + `.envrypt` plus basic scripting reverse dalam minutes. Worth doc explicit "NOT crypto-secure — obscurity layer vs casual peek; guna real secret-manager utk production-grade".
**Documented partially** — `:1-5` comment tidak biasanya say NOT-secure. Worth-doc SECURITY tag.
**Security-warning** — should be in code comment + SETTINGS-GUIDE.

### E.8 — `formatIdentity` reads `user-config.json` direct — tak via config.js singleton — race dengan mutation pipeline
**Lokasi**: preset-manager.js:174 + formatIdentity `readCurrent()`.
**Temuan**: `formatIdentity` baca file tiap call (data source-of-truth), BUKAN singleton `config` obj dari config.js. If `update_config` F28 singleton belum persist (writeFileSync pending or singleton-file divergence E.1), file masih OLD value → `formatIdentity` baca OLD value → user `/config` tampilkan OLD racikan attribution.
**Edge case**: raceSingleton-vs-File bila user saat same cycle `/setcfg activeSetup foo` → singleton already new, file write-pending → `formatIdentity` baca OLD file → display OLD. After persist → next call correct. **Cosmetic-race** — miliseconds window. Worth-doc singleton-vs-file read strategy.

### E.9 — `_lastAgentTune` timestamp stamped by both auto-tuner (F25 persistConfigChange) AND update_config tool (F28 pipeline) — user-driven vs LLM-driven both Ada timestamp same-key
**Lokasi**: config.js:5 persistConfigChange write `u[flatKey] = value` only utk auto-tune — `_lastAgentTune` NOT stamped in `persistConfigChange` path. Vs F28 update_config `executor.js:701` sets `_lastAgentTune = tunedAt` utk user + LLM. Asymetri.
**Ekses**: auto-tune gas reserve (`maybeAutoTuneGasReserve` F25) persist ke `user-config.json` but NOT stamp `_lastAgentTune` → user baca file thinking "wow _lastAgentTune lama, padahal auto-tune just happened". Worth-F25 verify stamp invariant.
**Worth-F25 fix** — auto-tune should also stamp `_lastAgentTune`.

### E.10 — `update_config` `executor.js:712-716` cron-restart gate includes `pnlPollIntervalSec` — TAPI `reloadScreeningThresholds` 56-key whitelist doesn't cover `pnl.pollIntervalSec` reload-able
**Lokasi**: config.js:353 `pnl.pollIntervalSec = Number(u.pnlPollIntervalSec ?? 3)` di startup. Reload whitelist `:608-647` tak mention `pnlPollIntervalSec`. Bila user hand-edit `pnlPollIntervalSec` in user-config tanpa restart → singleton OLD. Cron-restart trigger bila via `/setcfg` (direct-mutate, then restart via `_cronRestarter`) — works. But hand-edit needs full restart.
**Asymetri**: 3 interval keys trigger cron-restart via update_config, but only `managementIntervalMin`/`screeningIntervalMin` covered by reloadScreeningThresholds (pnl poll's underlying state — PRD says reloadable). Wait — actually none of the 3 are in reload whitelist (verify: config.js:626 has `adaptiveScreening` + `maxScreeningIntervalMin` but `screeningIntervalMin` only as `schedule.screeningIntervalMin` check. Let me re-verify: `:622 if (fresh.minTvl) ...`... actually comment `:608-647` mentions screening fields explicitly. **Could be missing some**.
**Worth-F26/F28 cross-check**. Live cross-verify E.7-F28: "experiments+indicators+schedule.*+llm.* tak covered" — same scope of issue.

---

## §F — Glosarium istilah fase

- **`paths`** — 19-path resolve per-profil via env + paritas.
- **`REPO_ROOT`** — `repo-root.js:7` `__dirname`.
- **`dataDir`** — root profil aktif. Tanpa env = REPO_ROOT (paritas).
- **paritas kontrak** — no-env = factory untouched.
- **racikan** — full user-config snapshot. File-swap via applyPreset.
- **`applyPreset(name,{backup})`** — atomic file-swap + auto-backup.
- **`savePreset(name)`** — stamp activeSetup=name + persist mirror.
- **`getActiveSetupStatus`** — `{name, edited, exists}` utk ✎ indicator.
- **`formatIdentity`** — 🧬 Profil + 🗂️ Racikan shared block.
- **META_KEYS** — `{preset, activeSetup}` exclude dari diff.
- **envcrypt** — XOR-base64 + `# encrypted` marker.
- **`shouldEncryptEnvKey`** regex — secret auto-encrypt detection.
- **`loadEnv({override:true})`** — repo `.env` win atas PM2 stale.
- **`encryptEnvRaw`** — `.env.raw` → `.env` setup tool.
- **`addprofil.js`** — scaffolder DATA-ONLY.
- **bound TEGAS** — SECRET + `pm2 start` MANUAL.
- **`scaffoldProfil(name)`** — 5-file output + 6 RESTORE steps.
- **`profiles/<name>/`** — folder per-profil.
- **`ECOSYSTEM-SNIPPET.txt`** — pm2 routing block.
- **`RESTORE.txt`** — 6 langkah MANUAL owner.
- **`profil-export.js`** — disaster-recovery tar. Secret NOT stripped. chmod 600.
- **`racikan-export.js`** — racikan-only tar.
- **`config-schema.js`** — 165-key schema.
- **`validateConfigValue`** — STRICT/LIGHT/fail-open gate.
- **STRICT** — hard reject utk harmful.
- **LIGHT** — type-check only.
- **`MODEL_ID_RE`** — provider/slug format killer.
- **`numStrict`** — hard-range numerics.
- **`INDICATOR_PRESETS`** — 9-entry closed-set.
- **PRINCIPLE** — "when in doubt, ALLOW".
- **parity check** — CONFIG_SCHEMA ≡ CONFIG_MAP.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §G — Link fase lain (cross-ref)

- **F26** (config.js singleton + reloadScreeningThresholds source): paths source utk `userConfigPath`/`gmgnConfigPath` + E.4 boolean-default-true `??true` reset interaction + E.2 readJsonIfExists not wrapped vs briefing.js loadJson wrapped.
- **F28** (CONFIG_MAP + update_config mutation pipeline + schema gate consumer): CONFIG_SCHEMA validateConfigValue source utk F28 step 5 + persist path via `paths.*` + E.10 reload whitelist asymmetry + E.5 LLM retry policy.
- **F23** (memory store 7-path via paths.* resolve cross-verify paritas): E.1 `dev-blocklist.js` STRAGGLER `repoPath` langsung tak per-profil isolation.
- **F25** (briefing paths state/lessons/tracker + formatIdentity display): E.9 `_lastAgentTune` timestamp asymetri — auto-tune persistConfigChange vs update_config.
- **F30** (/addprofil + /export profil + /preset + /config + /report + /briefing all Telegram commands consumers): racikan applyPreset/auto-restart, formatIdentity shared, profil-export bundel.
- **F27** (experiments + indicators CONFIG_SCHEMA entries surface ukr validasi strict-light): CONFIG_SCHEMA model `screeningModel`/`managementModel`/`generalModel` + enum `screeningSource`/`sizingMode`/`strategyLock`/`repeatDeployCooldownScope` + indicator preset INDICATOR_PRESETS + rsiOversold/rsiOverbought ranges.
- **F13** (dlmm.js paper paths via paths.*): isolated DRY_RUN path consistency.
- **F29-E.1** cross-F23 dev-blocklist straggler paritas path audit.

---

## §H — Open-Q (bawa ke fase F30, F33, F26)

1. **E.1 dev-blocklist straggler**: cross-F23 fix add `paths.devBlocklistPath`. Profil isolation leak fix.
2. **E.2 readJsonIfExists not wrapped**: F26 E.1 cross-verify — wrap try-catch utk corrupt user-config boot safety.
3. **E.3 applyPreset restart behavior**: F30 `/preset use` auto-restart under pm2 verify via `pm2 restart meridian-<profile>` or `registerCronRestarter` after apply. CLI `preset.js` manual restart path.
4. **E.4 sentinel `null` reset**: SETTINGS-GUIDE doc clarification utk boolean-default-true "OFF = unsetrestart re-enable" cukup.
5. **E.5 LLM retry policy**: F4 agent.js error-rejection surface **loop guard** khi LLM keeps wrong model id format.
6. **E.6 paths validation MERIDIAN_DATA_DIR**: startup check + log warning bila dir tak exist.
7. **E.7 envcrypt security-tag**: SECURITY-TAG ikut comment + SETTINGS-GUIDE "NOT crypto-secure, obscurity only".
8. **E.8 formatIdentity vs singleton-vs-file race**: cosmetic-ms; doc singleton-vs-file read strategy invariant.
9. **E.9 `_lastAgentTune` asymetri**: F25 auto-tune should also stamp timestamp — fix shared invariant.
10. **E.10 reload whitelist asymetri**: F26/F28 cross-verify reload whitelist covers `schedule.screeningIntervalMin`? Check `:625` comment + bug-extract full list. `pnl.pollIntervalSec` needs restart per hand-edit (not reloadable).
11. **Scaffold `screeningModel/managementModel={`${nvidia/nemotron-3-ultra-550b-a55b:free}`}` passes MODEL_ID_RE**: regex `^[a-z0-9-]+/[a-z0-9._-]+(:[a-z0-9-]+)?$` → `nvidia` + `/` + `nemotron-3-ultra-550b-a55b` (with - chars) + `:free` tag → PACGRESS. OK. **Worth** verify if `free` tag is lowercase alphanumeric-only — YES.
12. **`profiles/<name>/presets/` empty utk profil baru**: presets kosong means racikan listPresets() empty utk profil baru → user must `/preset save <name>` utk populate. Worth addprofil seed default racikan "factory" snapshot via save-first? Or document first user-action.lopen-block.