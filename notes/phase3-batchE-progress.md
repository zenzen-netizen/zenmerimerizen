# PHASE 3 BATCH E + /config — PROGRESS

Workstream 🅴 — Batch E (config + sistem/misc). Bot MAIN (`pm2 id 0` = meridian, branch `experimental`).
Display-only, restart owner-only. Render `/config` → `views/config.js`; sistem/misc → `views/system.js`;
guide/help di `guide.js`/views. index.js = 1-baris call per pesan + registrasi `/config origin`.

- [x] 0  recon EXACT: /config(+keys+origin) · guide · help · hive · pause/resume · queue · error — field+baseline ✅
- [ ] 1  /config (default) → tree function-grouped + marker origin (🧩/⚙️)
- [ ] 2  /config origin → command BARU (aditif), grouped per-asal
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

## Catatan/limit-recovery
(kosong)
