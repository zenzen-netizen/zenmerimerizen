# PHASE 3 BATCH E + /config — PROGRESS

Workstream 🅴 — Batch E (config + sistem/misc). Bot MAIN (`pm2 id 0` = meridian, branch `experimental`).
Display-only, restart owner-only. Render `/config` → `views/config.js`; sistem/misc → `views/system.js`;
guide/help di `guide.js`/views. index.js = 1-baris call per pesan + registrasi `/config origin`.

- [x] 0  recon EXACT: /config(+keys+origin) · guide · help · hive · pause/resume · queue · error — field+baseline ✅
- [x] 1  /config (default) → tree function-grouped + marker origin (🧩/⚙️) ✅
- [x] 2  /config origin → command BARU (aditif), grouped per-asal ✅
- [ ] 3  guide + help → tree (guide.js, aman)
- [ ] 4  hive + pause/resume + queue + error → tree (ekstrak inline index.js, minimal)

---

## FASE 0 — Recon EXACT (READ-ONLY) ✅

### /config — render aktual + mekanisme origin
- **Dispatch**: index.js:3626-3627 `/config` → `formatFullConfig()`, `/config core` → `formatCoreConfig()`.
  Dikirim via `sendMessage()` (plain text, **auto-split @4096**, telegram.js:149-169). Bukan sendHTML.
- **Render `/config` SEKARANG SUDAH origin-grouped (4-lapis)** — bukan function-grouped:
  - L1 = seksi ASAL (`⚙️ ORIGIN DEV` / `🧩 ADD BY ZEN`) — `formatFullConfig()` index.js:2018-2048.
  - L2 = grup (`▸ <title> · <desc>`) per subgroup di `ORIGIN_SECTIONS`.
  - L3 = sub-cluster (emoji + `┈┈` line, tampil bila grup >1 cluster) — `renderSubclusterRows` index.js:1976-2004.
  - L4 = "beranak" (14 anak `L4_CHILDREN`) di-indent `↳` di bawah induk.
  - + safety-net orphan (`▸ ❓ Belum terpetakan`) supaya nol key bisa hilang diam-diam.
  - + identity block (`formatIdentityLines()`→`formatIdentity()` preset-manager.js:170) di subgroup `zen-racikan`.
- **rowMap** (`buildConfigRowMap` index.js:1749-1968): unik-key → `[label, valueString]`. Owns SEMUA nilai+format
  (🟢 on/⚪ off untuk boolean, `off` untuk null, join `, ` untuk array, `(set)/(unset)` untuk secret).
  GMGN screening di-prefix `"gmgn."` biar tak tabrakan twin-nya (label tetap short).
- **Mekanisme origin (data SUDAH ADA — rule #3)**: `config-origin.js` `ORIGIN_SECTIONS` (id `"dev"`/`"zen"`).
  Tiap key terdaftar persis di satu subgroup di bawah satu seksi. Origin key = id seksi induknya. Diturunkan
  dari `notes/divergence-map.md` (Bab 3 & 5). **JANGAN bikin logic origin baru** — cukup baca ORIGIN_SECTIONS.
- **Inline notes**: `ORIGIN_NOTES` (config-origin.js:199-208) — 5 key bertanda warisan/off (mis. minSolToOpen
  "(warisan dev — …)"). HARUS dipertahankan di view fungsi.
- **Inventory EXACT (baseline `/tmp/bl_config_keys.txt`)**: **166 key** + 1 identity block.
  - Origin: **94 dev** (8 subgroup) · **72 zen** (11 subgroup, 1 = identity → 0 key).
  - Parity terkunci: rowMap 166 == origin-placed 166, **0 orphan / 0 dead-ref** (cross-check via node).
  - Per-subgroup: dev-screening 25 · dev-management 27 · dev-strategy 4 · dev-schedule 3 · dev-llm 6 ·
    dev-darwin 8 · dev-indicators 9 · dev-infra 12 ‖ zen-screening 2 · zen-gmgn 37 · zen-management 5 ·
    zen-strategy 1 · zen-schedule 2 · zen-llm 1 · zen-indicators 5 · zen-reports 2 · zen-learning 1 ·
    zen-experiments 16 · zen-racikan identity.
- **`/config core`** (`formatCoreConfig` index.js:2053-2066): view ringkas 37 core-key (CORE_GROUPS), 2/baris.
  **DI LUAR SCOPE** (tak disentuh).
- **Call-site lain `formatFullConfig`**: index.js:3044 = tombol `/settings` "📋 Config penuh". `/settings` di luar
  brief → rencana: `formatFullConfig` tetap eksis sebagai renderer ORIGIN bersama (call-site itu tak berubah
  perilaku; cuma ikut tree-style bila FASE 2 men-tree-style-kan origin view).

### Rencana FASE 1 (function-grouping yang DIUSULKAN — owner review)
12 grup fungsi, gabung twin dev+zen, **semua 166 key kebawa** (hitung di bawah):
| Grup fungsi | key | asal |
|---|---|---|
| 📊 Sizing & Posisi | 11 | maxPositions/maxDeployAmount/deployAmountSol/positionSizePct/minSolToOpen/gasReserve (dev) + sizingMode/rentPerPositionSol/gasReserveAutoTune/gasReserveBufferDays/gasReserveFloorSol (zen) |
| 🔍 Screening | 27 | dev-screening 25 + screeningSource/screeningCategories (zen) |
| 🔎 Screening-GMGN | 37 | zen-gmgn (blok kondisional, dipisah) |
| 🚪 Exit & Trailing | 19 | SL/TP/trailing/OOR/cooldown/yield/claim/redeploy (dev-management) |
| 📐 Strategy & Range | 5 | strategy/minBinsBelow/maxBinsBelow/defaultBinsBelow (dev) + strategyLock (zen) |
| 📊 Indikator | 14 | dev-indicators 9 + exitEnabled/rejectAlreadyAtBottom/smi* (zen 5) |
| ⏱ Jadwal | 5 | managementIntervalMin/screeningIntervalMin/healthCheckIntervalMin (dev) + adaptiveScreening/maxScreeningIntervalMin (zen) |
| 🧠 LLM | 7 | managementModel/screeningModel/generalModel/temperature/maxTokens/maxSteps (dev) + generalMaxTokens (zen) |
| 🧬 Darwin | 8 | dev-darwin |
| 📑 Reports & Learning | 3 | learningReportEvery/learningReportTrendN (zen-reports) + evolveEnabled (zen-learning) |
| 🧪 Eksperimen | 16 | zen-experiments |
| 🌐 Sistem/Infra | 14 | dev-infra 12 + dryRun + solMode (dipindah dari dev-management) |
| 🧬 Racikan/Identitas | identity | formatIdentityLines |
SUM = 11+27+37+19+5+14+5+7+8+3+16+14 = **166** ✅ (identity terpisah).
Catatan: `dryRun`+`solMode` dipindah ke Sistem (mode/display, bukan sizing). L3 sub-cluster & L4 ↳ **tidak**
dibawa ke view fungsi (sengaja flat/praktis) — struktur penuh L1–L4 tetap utuh di `/config origin` (FASE 2),
jadi nol detail hilang secara agregat. Inline `ORIGIN_NOTES` TETAP dibawa per-baris.

### guide / help
- **/guide** (Telegram index.js:3485-3488 + CLI index.js:4066-4070) → `renderGuide()` (guide.js). guide.js =
  live-read SETTINGS-GUIDE.md, plain-text (TOC + section + search). **File AMAN** (0 commit upstream). Edit
  guide.js otomatis kena DUA surface. Tak import format.js skrg.
- **/help** (Telegram-only, index.js:3519-3522) → `formatHelpText()` (index.js:3184-3222) — list statis 4 seksi.

### sistem/misc (Telegram-only; baseline `/tmp/bl_system.txt`)
- **/hive , /hive pull** index.js:3809-3838 (disabled/enabled/error tiga cabang, multi-line).
- **/pause** :3789-3793 · **/resume** :3796-3806 (start/already).
- **queue** :3490-3497 (queued `⏳ Queued (n in queue): "<text[0:60]>"` / full).
- **error-reply** generik `"Error: <e.message>"` (banyak call-site) + varian `Settings error:` / `HiveMind error:`.
- Konfirmasi: `/config`,`/help`,`/hive`,`/pause`,`/resume` **TIDAK ada di REPL/CLI** (Telegram-only). REPL cuma
  /briefing /candidates /guide /preset /report /status /thresholds.

## FASE 1 — hasil ✅
- `config-origin.js` +`FUNCTION_GROUPS` (12 grup fungsi) + `KEY_ORIGIN` (turunan dari ORIGIN_SECTIONS,
  rule #3 — nol logic origin baru). Parity node-check: 166 unik · 0 hilang · 0 dobel · 0 unknown ·
  marker 94⚙️+72🧩 lengkap (nol undefined).
- `views/config.js` BARU (`buildView`+`telegram`, dua mode "function"/"origin"). FASE 1 pakai `renderFunction`:
  header `🛠 Config · 🗂 <racikan>` + SEP + identity (Profil/Racikan ✎) + SEP + 12 grup (header+tree ├/└,
  tiap baris `<marker> label: value<note>`) + SEP + legenda + pointer. value-string verbatim dari rowMap;
  inline `ORIGIN_NOTES` dipertahankan; safety-net `❓ Belum terpetakan` (nol key bisa hilang diam-diam).
  GMGN dapat hint hidup aktif/nonaktif (`screeningSource`).
- `views/format.js` +ikon `tools:"🛠"`, `dev:"⚙️"`, `zen:"🧩"` (aditif, kamus ikon).
- `views/render.js` +register `config`.
- `index.js`: +import configView · +helper `formatFunctionConfig()` (build rowMap+identity, fail-open
  racikanName) · dispatch `/config` → function view (`/config core` tetap formatCoreConfig). **formatFullConfig
  TIDAK disentuh** (masih layani tombol /settings :3044; di-delegasi ke view di FASE 2).
- Render uji (mock rowMap 166 key): **166 baris key persis**, semua marker/notes/identity/GMGN-hint muncul.
  5028 char → 2 chunk auto-split (splitText motong di newline, tak putus baris). node --check semua OK.
- **Belum** ada command `/config origin` (FASE 2) — footer pointer ke situ aktif setelah FASE 2.

## FASE 2 — hasil ✅
- `views/config.js` `renderOrigin` di-upgrade: header `🛠 Config by origin · 🗂 <racikan>` (brief), **Zen di
  atas** (salinan lokal `[...ORIGIN_SECTIONS].sort` — array sumber TAK diubah → /settings aman), **count
  per-asal** (`· <n>` di header seksi), separator SEP (16) ganti bar lama (22). Struktur 4-lapis PENUH
  dipertahankan: L2 grup ▸ (19) · L3 sub-cluster ┈ (43) · L4 ↳ anak (14) · identity · subgroupDesc (GMGN
  flip via callback fn lama) · safety-net orphan. Render uji: 166 baris value, Zen(72)→Dev(94).
- `index.js` `formatFullConfig()` → **delegasi** ke view (mode origin), kirim rowMap+identity+racikanName+
  subgroupDesc. Body lama (37 baris) → 8 baris. `renderSubclusterRows` & `subgroupDesc` index.js TETAP
  (dipakai /settings :2909 + callback). +helper `activeRacikanName()` (dipakai function & origin).
- **SHARED**: `formatFullConfig` kini layani command `/config origin` DAN tombol /settings "📋 Config penuh"
  (:3044) — keduanya ikut tree-style + Zen-first baru. Ini perubahan **tampilan** (bukan mekanika) ke output
  tombol /settings; isi tetap config penuh. ⚠️ owner: kalau mau tombol itu mirror /config function view,
  ganti :3044 (di luar scope batch ini).
- Dispatch `/config origin` ditambah (exact-match, sebelum `/config`). Full-sync command surface:
  `/help` (+baris /config origin & revisi /config), `BOT_COMMANDS` config desc (telegram.js). `/config origin`
  = subcommand (Telegram setMyCommands tak bisa spasi) → registrasi = handler + desc, bukan entri terpisah.
- node --check index.js/config.js/telegram.js OK.

## Catatan/limit-recovery
(kosong)
