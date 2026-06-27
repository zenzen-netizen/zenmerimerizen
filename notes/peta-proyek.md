# MERIDIAN — PETA PROYEK (6 Lapisan)

> Dibuat: 2026-06-13 · Mode: **BACA-SAJA** (tidak ada kode/config yang diubah).
> Pembaca: pemilik repo non-programmer + penasihat AI tanpa akses kode.
> Tujuan: peta navigasi — "lagi garap bagian apa / fitur X tinggalnya di mana".
> Bukan dokumentasi ulang. Untuk DETAIL cara kerja, rujuk `notes/onboarding-dossier.md` (disebut "dossier" + nomor Bab di bawah).

---

## RINGKASAN ATAS — 6 LAPISAN (1 baris per lapisan)

1. **TAMPILAN & LAPORAN** — yang user LIHAT di layar: notifikasi Telegram, briefing, `/report`, `/status`, `/wallet`, `/positions`, menu `/config` & `/settings`, `/guide`. → `telegram.js`, `briefing.js`, `guide.js`, + bagian "render" di `index.js` & `reports.js`.
2. **KONTROL & PERINTAH** — cara user MENGENDALIKAN bot: ketik perintah Telegram / REPL / CLI, lalu handler & polling memprosesnya. → polling di `telegram.js`, handler perintah + menu tombol di `index.js`, `cli.js`, `preset.js`, `setup.js`.
3. **MESIN TRADING** — yang bot KERJAKAN sendiri: timer (cron), cari kolam, otak AI (agent + prompt), buka/jaga/tutup lapak, aturan SL/TP/trailing/OOR, simulasi paper. → `index.js` (cron+siklus), `agent.js`, `prompt.js`, `tools/dlmm.js`, `tools/executor.js`, `tools/screening.js`, `tools/gmgn.js`, indikator, `paper-trading.js`.
4. **BELAJAR & PENGUKURAN** — bot MENGUKUR & BELAJAR: hitung PnL, performa, lessons, Darwin, pool-memory, jurnal keputusan, statistik laporan, biaya gas/LLM. → `tools/pnl.js`, `pnl-tracker.js`, `lessons.js`, `signal-weights.js`, `pool-memory.js`, `decision-log.js`, `reports.js` (bagian hitung), `gas-tracker.js`, `llm-cost-tracker.js`.
5. **DATA & SETELAN** — yang bot SIMPAN & SETEL internal: file konfigurasi & file memori di disk. → `config.js`, `user-config.json`, `state.js`/`state.json`, `lessons.json`, `presets/*.json` + `preset-manager.js`, `strategy-library.js`, daftar hitam.
6. **KONEKSI LUAR / API** — sambungan ke dunia luar: RPC Solana, API Meteora, Jupiter, GMGN, OpenRouter (LLM), HiveMind. → `tools/dlmm.js`/`tools/pnl.js` (RPC+SDK), `tools/screening.js` (Meteora), `tools/wallet.js`/`tools/token.js` (Jupiter), `tools/gmgn.js`, `hivemind.js`. (Discord listener = ADA kerangkanya, tapi **tidak terpasang/OFF** — lihat Bab Peta-Fitur.)

> Cara baca singkat: kalau tugas masa depan soal "ubah tampilan/teks" → Lapisan 1. "Tambah/ubah perintah" → Lapisan 2. "Ubah cara bot trading/memutuskan" → Lapisan 3. "Ubah cara bot menghitung/belajar" → Lapisan 4. "Ubah angka setelan / simpanan" → Lapisan 5. "Soal sambungan API luar" → Lapisan 6.

---

## BAB 1 — PETA FILE (tabel)

> "Lapisan utama" = tempat file itu paling banyak bekerja. "Lapisan lain" = bagian file yang nyebrang ke lapisan lain (lihat Bab 2 untuk pecahannya). Istilah: **screening** = berburu kolam; **deploy** = pasang modal; **OOR** (out-of-range) = harga kabur dari lapak; **PnL** = untung/rugi; **LLM** = model AI.

### File program inti (root)

| File | Lapisan utama | Lapisan lain | Ngurus apa (bahasa awam) |
|---|---|---|---|
| `index.js` (3.344 baris) | **3 Mesin** | 2 Kontrol, 1 Tampilan, 4 Belajar | Pusat komando: timer (cron), siklus jaga & cari kolam, handler semua perintah Telegram/REPL, render menu `/config`+`/settings`, aturan tutup-paksa (SL/TP/OOR), pemicu briefing. File lintas-lapisan terbesar (lihat Bab 2). |
| `agent.js` | **3 Mesin** | — | Otak: loop ReAct (kirim prompt → AI minta tool → jalankan → ulangi); menyaring tool mana boleh dipakai per peran SCREENER/MANAGER/GENERAL (baris 7–8). |
| `prompt.js` | **3 Mesin** | — | "SOP tertulis" yang dibacakan ke AI tiap bangun — selera pilih kolam, kesabaran, rumus lebar lapak. Aturan bahaya (SL/TP) TIDAK di sini (ada di kode). |
| `config.js` | **5 Data & Setelan** | — | Memuat `user-config.json` + `.env` jadi objek `config` dengan nilai default; rumus modal `computeDeployAmount`. |
| `state.js` | **5 Data & Setelan** | 3 Mesin | Buku catatan posisi (`state.json`) + **aturan exit** (`updatePnlAndCheckExits`: SL/trailing/OOR/low-yield) → bagian aturan = Mesin. |
| `lessons.js` | **4 Belajar** | 5 Data | Catat performa tiap close, turunkan "lessons", evolusi ambang screening; nulis ke `lessons.json`. |
| `reports.js` | **4 Belajar** | 1 Tampilan | Mesin statistik (profit factor, drawdown, breakdown by-X, ranking adil) + perakit teks laporan. |
| `briefing.js` | **1 Tampilan** | 4 Belajar | Briefing harian/mingguan/bulanan ke Telegram (baca stats dari reports/lessons). |
| `paper-trading.js` | **3 Mesin** | 4 Belajar | Matematika murni simulasi posisi virtual (mode paper). Saat ini OFF. |
| `pnl-tracker.js` | **4 Belajar** | 1 Tampilan | Tracker PnL terealisasi & **net** (dikurangi gas + biaya LLM) untuk 1D/7D/30D. |
| `signal-weights.js` | **4 Belajar** | 5 Data | Bobot "Darwin": sinyal screening yang terbukti prediktif dinaikkan bobotnya (`signal-weights.json`). |
| `pool-memory.js` | **4 Belajar** | 5 Data | Ingatan per-kolam (riwayat deploy & hasil) di `pool-memory.json`. |
| `candidate-memory.js` | **4 Belajar** | 5 Data | Snapshot momentum kandidat antar-siklus (`candidate-memory.json`) untuk eksperimen momentum & counterfactual. |
| `decision-log.js` | **4 Belajar** | 5 Data | Jurnal keputusan deploy/close beserta alasan & risiko (`decision-log.json`). |
| `gas-tracker.js` | **4 Belajar** | 5 Data | Pencatat gas on-chain nyata (`gas-log.json`). |
| `llm-cost-tracker.js` | **4 Belajar** | 6 Koneksi | Pencatat biaya tiap panggilan LLM (`llm-cost-log.json`). |
| `openrouter-usage.js` | **6 Koneksi** | 4 Belajar | Tanya saldo/pemakaian ke API OpenRouter. |
| `sol-tracker.js` | **4 Belajar** | 5 Data | Riwayat saldo SOL (`sol-balance-history.json`). |
| `signal-tracker.js` | **4 Belajar** | — | Shadow-logging sinyal screening (untuk evaluasi prediktif). |
| `preset-manager.js` | **5 Data & Setelan** | 2 Kontrol | Simpan/muat **racikan** (snapshot penuh `user-config.json` → `presets/*.json`). |
| `preset.js` | **2 Kontrol** | 5 Data | Versi CLI dari perintah preset. |
| `strategy-library.js` | **5 Data & Setelan** | — | Strategi LP tersimpan (`strategy-library.json`). |
| `token-blacklist.js` / `dev-blocklist.js` | **5 Data & Setelan** | 3 Mesin | Daftar hitam token/dev permanen; dipakai sebagai gerbang saat screening. |
| `smart-wallets.js` | **4 Belajar** | 6 Koneksi | Pelacak dompet "pintar" (KOL/alpha) di kolam. |
| `hivemind.js` | **6 Koneksi** | 4 Belajar | Sinkron kolektif opsional (kirim lessons/deploy ke server bersama). Opsional, OFF kecuali di-set di `.env`. |
| `telegram.js` | **1 Tampilan** | 2 Kontrol, 6 Koneksi | Bot Telegram: kirim notifikasi (deploy/close/swap/OOR) + **polling** terima pesan + ngomong ke API Telegram. |
| `guide.js` | **1 Tampilan** | — | Penyaji `/guide` (baca `SETTINGS-GUIDE.md` langsung). |
| `cli.js` | **2 Kontrol** | — | Pintu masuk command-line (REPL terminal). |
| `setup.js` | **2 Kontrol** | 5 Data | Wizard setelan awal (tanya-jawab isi `user-config.json`). |
| `logger.js` | **5 Data & Setelan** | — | Log harian + jejak audit aksi (infrastruktur). |
| `screening-scales.js` | **3 Mesin** | — | Skala timeframe (biar AI tak salah baca 5m vs 24h). |
| `repo-root.js` / `envcrypt.js` / `ecosystem.config.cjs` | **5 Data/infra** | — | Resolusi folder root; enkripsi `.env`; konfigurasi pm2 (proses). |

### File di `tools/`

| File | Lapisan utama | Lapisan lain | Ngurus apa (bahasa awam) |
|---|---|---|---|
| `tools/definitions.js` | **3 Mesin** | — | Daftar tool (skema) yang DILIHAT AI — "menu tombol" yang boleh ditekan si AI. |
| `tools/executor.js` | **3 Mesin** | 4 Belajar | Penjaga gerbang tool: **safety check** mekanis sebelum deploy/close, dispatch nama→fungsi, auto-swap token sisa ke SOL, panggil `recordPerformance`. |
| `tools/dlmm.js` (2.554 baris) | **3 Mesin** | 4 Belajar, 6 Koneksi | Aksi Meteora: deploy/close/claim/daftar-posisi/PnL-tutup — termasuk cabang DRY_RUN/paper. Lintas-lapisan (lihat Bab 2). |
| `tools/pnl.js` | **4 Belajar** | 6 Koneksi | Mesin PnL posisi TERBUKA (baca on-chain via RPC+SDK + deposit Meteora + harga Jupiter). |
| `tools/screening.js` | **3 Mesin** | 6 Koneksi | Penemuan kolam kandidat dari API Meteora (+ jalur sinyal Discord, OFF). |
| `tools/gmgn.js` | **3 Mesin** | 6 Koneksi | Jalur screening alternatif berbasis GMGN (rule-based, opt-in). |
| `tools/chart-indicators.js` | **3 Mesin** | 6 Koneksi | Lapisan indikator teknikal (RSI/Supertrend/Bollinger/Fibonacci) — math di server API, bot baca hasilnya. |
| `tools/smi.js` | **3 Mesin** | — | Indikator SMI client-side (dari `candles[]`); dipakai preset `supertrend_plus_smi`. |
| `tools/wallet.js` | **6 Koneksi** | 3 Mesin | Saldo SOL/token (Helius) + **swap** (Jupiter) + cek harga/price-impact. |
| `tools/token.js` | **6 Koneksi** | 3 Mesin | Info token/holder/narasi (Jupiter) + deteksi bundler/konsentrasi. |
| `tools/study.js` | **6 Koneksi** | — | Studi LPer top via API LPAgent. |

---

## BAB 2 — FILE LINTAS-LAPISAN (pecah per bagian)

> Empat file besar nyebrang banyak lapisan. Kalau tugas masa depan menyentuh salah satunya, ini peta supaya nyasar ke BAGIAN yang tepat (bukan seluruh file). Nomor baris = patokan, bisa geser sedikit setelah edit. Detail alur ada di dossier Bab B & E.

### `index.js` — 3.344 baris, nyebrang 4 lapisan

| Bagian (fungsi / rentang baris) | Lapisan | Ngurus apa |
|---|---|---|
| `startCronJobs` + jadwal cron + poller PnL (≈1046–1191) | **3 Mesin** | Timer: siklus manajemen, siklus screening, poller PnL 3 detik, gerbang screening adaptif (`shouldRunScheduledScreening` 1059). |
| `runManagementCycle` (mulai 339) | **3 Mesin** | Siklus jaga lapak: ambil posisi, cek exit, panggil MANAGER LLM hanya kalau ada aksi. |
| `runScreeningCycle` (mulai 555) | **3 Mesin** | Siklus cari lapak: hard-guard, ambil kandidat, recon, suntik ke prompt SCREENER. |
| `getDeterministicCloseRule` (1255–1298) | **3 Mesin** | Aturan tutup-paksa TANPA AI: SL / TP / pumped-far / OOR / low-yield. |
| `getIndicatorExitSignal` (1304–1317) | **3 Mesin** | Exit indikator opsional (default OFF). |
| `computeBinsBelow` (1361–1369) | **3 Mesin** | Rumus lebar lapak dari volatilitas. |
| `maybeAutoTuneGasReserve` (277) | **3 Mesin** | Auto-setel cadangan gas. |
| `telegramHandler` (2598–±3000) + handler tiap perintah (`/positions`, `/close`, `/wallet`, `/status`, `/config`, `/settings`, `/preset`, `/screen`, `/pause`, dll) | **2 Kontrol** | Terima & rute perintah Telegram (bypass LLM). |
| REPL handler (3094–3336), `runPresetCommand` (2428), `applySettingsMenuCallback` (2212), `runDeterministicScreen` (2501), `deployLatestCandidate` (2522), `requestConfirmation` (1807) | **2 Kontrol** | Perintah terminal + tombol menu + konfirmasi aksi. |
| `formatFullConfig` (1474–1693) | **1 Tampilan** | Render `/config` (15 grup setelan, termasuk GRUP 16 eksperimen). |
| `renderSettingsMenu` (1944–2191), `settingValue` (1706), `pageForKey` (1931), `toggleButton`/`stepButtons`/`inputButton` | **1 Tampilan** | Render menu tombol `/settings`. |
| `formatWalletStatus` (1412), `formatHelpText` (2378), `formatCandidates` (1236), `describeLatestCandidates` (1399), `buildGmgnFunnelReport` (1319), `formatConfigSnapshot` (1447) | **1 Tampilan** | Teks `/wallet`, `/help`, daftar kandidat, corong GMGN. |
| `maybeFireLearningReport` (207), `runBriefing` (300), `runPeriodicBriefing` (250), `maybeRunMissedBriefing` (318), `sendAndPinBriefing` (186), `buildReportForArg` (234) | **4 Belajar → 1 Tampilan** | Pemicu & perakit briefing/laporan milestone. |

### `tools/dlmm.js` — 2.554 baris, nyebrang 3 lapisan

| Bagian | Lapisan | Ngurus apa |
|---|---|---|
| `deployPosition` (≈645–833), `closePosition` (≈1960+), `claimFees`, `getMyPositions` | **3 Mesin** + **6 Koneksi** | Aksi on-chain via SDK Meteora di RPC — buka/tutup/klaim/daftar lapak. |
| PnL saat tutup + ambil dari API Meteora closed (2337–2408), `recordPerformance` dipanggil (2430) | **4 Belajar** | Angka untung/rugi final yang masuk buku rapor. |
| Cabang DRY_RUN/paper: deploy (776–833), PnL (1209–1228), daftar (1604), close (1964), blok paper (1420–1598) | **3 Mesin** (sim) | Jalur paper-trading (hanya aktif kalau paper ON). |

### `reports.js` — nyebrang 2 lapisan

| Bagian | Lapisan | Ngurus apa |
|---|---|---|
| `computeTradeStats` (30–155), shrunk-expectancy ranking (209–231), `classifyCloseRule` (163–174), `buildRecommendations`/`buildVerdict` | **4 Belajar** | Mesin HITUNG statistik (murni, dari `performance[]`). |
| `buildTradeReport`, `buildRoleCostLines`, `estimateGasSol` + perakitan teks | **1 Tampilan** | Susun laporan jadi teks yang dibaca user. |

### `state.js` — nyebrang 2 lapisan

| Bagian | Lapisan | Ngurus apa |
|---|---|---|
| `makePositionRecord` (60–135), `trackPosition` (140–157), baca/tulis `state.json`, peak/trough | **5 Data & Setelan** | Buku catatan posisi di disk. |
| `updatePnlAndCheckExits` (473–589): SL (540), trailing (548), OOR (563), low-yield (574) | **3 Mesin** | Aturan exit mekanis — dievaluasi tiap poll. |

### Lintas-lapisan kecil (catatan singkat)

- `telegram.js`: kirim notifikasi = **Tampilan**; `startPolling`/`getUpdates` (453–559) = **Kontrol**; ngomong ke API Telegram = **Koneksi**.
- `tools/executor.js`: safety check + dispatch = **Mesin**; panggil `recordPerformance` setelah close + auto-swap = nyentuh **Belajar**.
- `tools/wallet.js` & `tools/token.js`: ambil data (saldo/harga/holder) = **Koneksi**; swap & deteksi bundler dipakai mesin = **Mesin**.
- `lessons.js`: hitung & turunkan lessons = **Belajar**; baca/tulis `lessons.json` = **Data**.

---

## BAB 3 — PETA FITUR (fitur besar → lapisan)

> Satu fitur biasanya hidup di beberapa lapisan sekaligus (itu wajar — "full-sync rule" di CLAUDE.md memang menuntut tiap fitur menyentuh banyak permukaan). Kolom "tinggal di lapisan" = di mana saja kode fitur itu nyebar. "Pintu masuk" = file/fungsi paling relevan kalau mau menggarapnya.

| Fitur | Tinggal di lapisan | Pintu masuk utama | Catatan awam |
|---|---|---|---|
| **Menu `/config` & `/settings`** | 1 Tampilan (render) · 2 Kontrol (tombol/handler) · 5 Data (simpan) | `formatFullConfig`, `renderSettingsMenu`, `settingValue`, `pageForKey`, `applySettingsMenuCallback` (semua `index.js`); `CONFIG_MAP` (`tools/executor.js`) | Cara user lihat & ubah setelan. Menu tombol `/settings` = permukaan yang PALING SERING terlewat saat tambah fitur (memori proyek). |
| **Racikan / Preset** | 5 Data (file snapshot) · 2 Kontrol (perintah) · 3 Mesin (`promptNotes` masuk prompt) | `preset-manager.js`, `preset.js`, `presets/*.json`, halaman 🗂️ Presets di `renderSettingsMenu` | Simpan/muat seluruh `user-config.json` sebagai 1 file. Aktif sekarang: `mainzen_v2`. `mainzen_v3` ADA di instance kembar (`meridianzen2`), TIDAK di repo ini (dossier D.2/K.2). |
| **Paper-trading** | 3 Mesin (sim) · 4 Belajar (catat, terisolasi) · 5 Data (tag `paper:true`) | `paper-trading.js` (math murni) + cabang di `tools/dlmm.js` (776/1209/1420–1598/1604/1964) | Simulasi lapak virtual. **OFF di kedua instalasi**. Fee & IL = ESTIMASI kasar (ada bug satuan ~100×, dossier F & K.1) — jangan percaya besaran PnL paper. |
| **GMGN screening** | 3 Mesin (jalur cari kolam alt) · 6 Koneksi (API GMGN) | `tools/gmgn.js`, `screeningSource=gmgn`, `config.gmgn.indicatorRules` | Sumber kandidat alternatif berbasis aturan (bukan default). Default tetap jalur Meteora. |
| **strategyLock** | 3 Mesin (ditegakkan) · 5 Data (setelan) | `tools/executor.js:845-849`, `config.strategy` + `strategyLock` | Mengunci bentuk sebaran modal (sekarang `bid_ask`) secara MEKANIS — bukan cuma diminta ke AI. |
| **Darwin (bobot sinyal)** | 4 Belajar (rekalkulasi) · 5 Data (`signal-weights.json`) · 3 Mesin (bobot dipakai urut kandidat) | `signal-weights.js`, dipicu `lessons.js:261-268` (`recalculateWeights`) | "Seleksi alam" untuk sinyal screening. Catatan: `darwinRecalcEvery` adalah config MATI (pemicu nyata konstanta `MIN_EVOLVE_POSITIONS=5`, dossier D.3/H.5). |
| **Blok experiments (🧪 GRUP 16)** | 3 Mesin (jalur kode opt-in) · 1 Tampilan (GRUP 16 di `/config`+`/settings`) · 5 Data (`config.experiments`) | `config.experiments` (`config.js`), `runSafetyChecks`/`runScreeningCycle`, halaman experiments `/settings` | Belasan fitur coba-coba, SEMUA default OFF = perilaku pabrik. OFF selalu balik ke perilaku pra-fitur. |
| **Briefing** | 1 Tampilan (kirim+pin) · 4 Belajar (baca stats) | `briefing.js`, dipicu cron `index.js:1105/1115/1120` | Laporan harian/mingguan/bulanan auto ke Telegram, auto-pin. |
| **Indikator / SMI** | 3 Mesin (gerbang entry/exit) · 6 Koneksi (math di server API) | `tools/chart-indicators.js`, `tools/smi.js`, gerbang entry `screening.js:780`, exit `index.js` | Lapisan timing teknikal. Gerbang ENTRY aktif saat `enabled`; gerbang EXIT opt-in (default OFF). SMI = preset opt-in `supertrend_plus_smi`. |
| **HiveMind** | 6 Koneksi (server bersama) · 4 Belajar (sync lessons/deploy) | `hivemind.js`, env `HIVE_MIND_URL`/`HIVE_MIND_API_KEY` | Kecerdasan kolektif OPSIONAL. Tidak wajib; OFF kecuali env di-set. Data paper tak ikut tersinkron. |
| **Adaptive screening** | 3 Mesin (gerbang cron) · 5 Data (setelan) | `shouldRunScheduledScreening` + `effectiveScreeningIntervalMin` (`index.js:1046-1066`) | Saat ON, screening diregangkan ke interval maksimal di sesi historis "lemah" (hemat token). Manajemen & poll PnL TAK pernah diperlambat. |
| **Time-of-day profile** | 4 Belajar (bucket per sesi) · 3 Mesin (soft brake di prompt) | `getHourlyProfile`/`classifySession` (`lessons.js`), `getTimeProfileForPrompt` (`prompt.js`) | Performa dikelompokkan per sesi WIB; jadi sinyal lunak (tak pernah menimpa aturan keras). |
| **Cost tracking (gas + LLM)** | 4 Belajar (hitung) · 5 Data (log) · 1 Tampilan (laporan) | `gas-tracker.js`, `llm-cost-tracker.js`, `pnl-tracker.js`, `openrouter-usage.js` | "Net = PnL − gas − biaya LLM". Gas real sejak 2026-06-07 (dossier K.6). |
| **Discord listener** | 6 Koneksi (kerangka) · 3 Mesin (jika ON) · 5 Data (setelan) | `fetchDiscordSignalCandidates` (`tools/screening.js:186`), `useDiscordSignals` (default **false**) | ⚠️ **TIDAK TERPASANG / OFF.** Kerangka kode ada (sumber kandidat dari `{api.url}/signals/discord/candidates`), tapi `useDiscordSignals` default `false` → jalur tak aktif. Disebut di sini sesuai instruksi tugas. |

---

## BAB 4 — RINGKASAN PER LAPISAN

### Lapisan 1 — TAMPILAN & LAPORAN
**Isinya:** semua yang muncul di layar Telegram/terminal — pesan notifikasi (deploy/close/swap/OOR), briefing terjadwal, jawaban `/report`, `/status`, `/wallet`, `/positions`, tampilan menu `/config` & `/settings`, dan `/guide`. Lapisan ini hanya MENYUSUN & MENGIRIM teks; angka mentahnya datang dari Lapisan 4.
**File/fitur inti:** `telegram.js` (notifikasi), `briefing.js`, `guide.js`, `reports.js` (bagian rakit-teks), + di `index.js`: `formatFullConfig`, `renderSettingsMenu`, `formatWalletStatus`, `formatHelpText`, `sendAndPinBriefing`.

### Lapisan 2 — KONTROL & PERINTAH
**Isinya:** jalur user MENGENDALIKAN bot — mengetik perintah lalu sistem menerima & meneruskannya. Termasuk **polling** Telegram (ambil pesan masuk), router perintah (yang bypass LLM untuk perintah pasti seperti `/close`), tombol menu `/settings`, terminal REPL/CLI, dan wizard `setup.js`.
**File/fitur inti:** `startPolling`/`getUpdates` (`telegram.js`), `telegramHandler` + handler tiap perintah + `applySettingsMenuCallback` + REPL (`index.js`), `cli.js`, `preset.js`, `setup.js`.

### Lapisan 3 — MESIN TRADING
**Isinya:** yang bot kerjakan SENDIRI tanpa disuruh — timer (cron) yang menyalakan siklus, berburu kolam (screening), otak AI (loop agent + SOP prompt), eksekusi buka/jaga/tutup lapak on-chain, aturan tutup-paksa mekanis (SL/TP/trailing/OOR/low-yield), gerbang indikator, dan simulasi paper. Aturan paling berbahaya DIKUNCI di kode di sini, bukan dititipkan ke AI.
**File/fitur inti:** `index.js` (cron + `runManagementCycle` + `runScreeningCycle` + `getDeterministicCloseRule`), `agent.js`, `prompt.js`, `tools/dlmm.js` (aksi on-chain), `tools/executor.js` (safety check), `tools/screening.js`, `tools/gmgn.js`, `tools/chart-indicators.js`/`tools/smi.js`, `state.js` (`updatePnlAndCheckExits`), `paper-trading.js`.

### Lapisan 4 — BELAJAR & PENGUKURAN
**Isinya:** bot MENGUKUR hasil & BELAJAR darinya — hitung PnL (terbuka & saat tutup), catat performa tiap close, turunkan "lessons" & evolusi ambang, bobot Darwin, ingatan per-kolam, jurnal keputusan, mesin statistik laporan, dan biaya nyata (gas + LLM). Inilah sumber angka yang dipakai Lapisan 1 untuk laporan.
**File/fitur inti:** `tools/pnl.js` (PnL terbuka), `tools/dlmm.js` (PnL tutup → `recordPerformance`), `lessons.js`, `signal-weights.js` (Darwin), `pool-memory.js`, `candidate-memory.js`, `decision-log.js`, `reports.js` (bagian hitung), `pnl-tracker.js`, `gas-tracker.js`, `llm-cost-tracker.js`, `sol-tracker.js`, `signal-tracker.js`.

### Lapisan 5 — DATA & SETELAN
**Isinya:** apa yang bot SIMPAN di disk & SETEL secara internal — file konfigurasi (default + setelan user aktif), buku catatan posisi, riwayat performa, racikan, daftar strategi, daftar hitam, dan file memori. Tidak "berpikir", hanya menyimpan dan menyediakan nilai.
**File/fitur inti:** `config.js` + `user-config.json` (+ `.env`), `state.js`/`state.json`, `lessons.json`, `pool-memory.json`, `signal-weights.json`, `decision-log.json`, `candidate-memory.json`, `gas-log.json`, `llm-cost-log.json`, `presets/*.json` + `preset-manager.js`, `strategy-library.js`/`.json`, `token-blacklist.js`/`dev-blocklist.js`, `logger.js`.

### Lapisan 6 — KONEKSI LUAR / API
**Isinya:** semua sambungan ke dunia luar yang bukan disk lokal — RPC Solana & SDK Meteora (baca/tulis on-chain), API Meteora (kandidat + PnL tutup), Jupiter (harga/swap/info token), GMGN (kandidat alt), OpenRouter (otak LLM), HiveMind (server kolektif), dan Telegram (transport pesan). Discord listener punya kerangka di sini tapi OFF.
**File/fitur inti:** `tools/dlmm.js` & `tools/pnl.js` (RPC+SDK), `tools/screening.js` (Meteora API), `tools/wallet.js` & `tools/token.js` (Jupiter/Helius), `tools/gmgn.js`, `tools/study.js` (LPAgent), `hivemind.js`, `openrouter-usage.js`, `telegram.js` (API), `smart-wallets.js`.

---

*Catatan: peta ini menempatkan FILE & FITUR ke lapisan untuk navigasi. Untuk cara kerja detail, angka aktif, dan temuan empiris, lihat `notes/onboarding-dossier.md`. Tidak ada kode/config yang diubah saat membuat peta ini.*
