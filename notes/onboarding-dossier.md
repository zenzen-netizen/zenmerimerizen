# MERIDIAN — Dossier Onboarding untuk Penasihat Eksternal
> Dibuat: 2026-06-12 · Mode: BACA-SAJA (tidak ada kode yang diubah)
> Pembaca: (1) penasihat AI tanpa akses kode, (2) pemilik repo non-programmer.
> Label bukti: **[CONFIRMED]** = terbaca langsung di kode · **[INFERRED]** = dugaan beralasan · **[NOT FOUND]** = dicari, tidak ada.

## RINGKASAN EKSEKUTIF (±10 baris)

1. Meridian adalah bot yang **menaruh modal SOL sebagai "penyedia likuiditas" (LP)** di kolam-trading Meteora (Solana), otomatis 24 jam: cari kolam ramai → taruh modal → pantau → tutup → belajar.
2. Otaknya hibrida: **aturan mekanis di JavaScript** (stop-loss, take-profit, dll — pasti jalan) + **LLM** (model AI) yang cuma dipanggil untuk memilih kolam dan mengeksekusi aksi yang sudah diputuskan aturan.
3. Konfigurasi aktif sekarang: racikan **mainzen_v2**, strategi terkunci `bid_ask`, modal per posisi ~0.2 SOL, stop-loss −12%, take-profit 4%, trailing 1.5/1.0, mode hitung SOL (`solMode: true`).
4. PnL posisi terbuka dihitung dari **data on-chain asli** (RPC + SDK Meteora) + riwayat setoran dari API Meteora + harga dari Jupiter — di-poll tiap 3 detik.
5. PnL posisi **tertutup** diambil dari API resmi Meteora (`status=closed`); ada jalur cadangan (cache) kalau API telat — jalur cadangan ini bisa menghasilkan angka 0/kurang akurat.
6. **Paper trading itu subsistem sungguhan** (`paper-trading.js` + cabang khusus di `tools/dlmm.js`), bukan sekadar `DRY_RUN`. Tapi saat ini **MATI di kedua instalasi** (repo ini live `DRY_RUN=false`; instance kembar juga live non-paper). 0 dari 114 record performa bertanda paper. *(Koreksi 2026-06-12 sore: instance kembar yang BERJALAN ternyata `/home/ubuntu/meridianzen2`, bukan folder `/home/ubuntu/meridian-v3` — dan dia sudah LIVE betulan dengan wallet terpisah. Detail di Bab K.2.)*
7. Vonis audit paper: **entry & timing-nya jujur (dibaca dari chain asli)**, tapi **fee & IL-nya ESTIMASI kasar** — ada bias optimis sistemik (fee proxy berpotensi kebesaran, slippage keluar tidak dimodel), jadi paper BISA mencatat untung padahal realitanya rugi. Detail di Bab F.
8. Catatan buka/tutup posisi cukup kaya (entry mcap/tvl/volume, peak/trough, racikan aktif), tapi **harga masuk & keluar eksplisit TIDAK disimpan** di record performa, dan IL tidak dipisah dari PnL.
9. Temuan utang teknis baru: `darwinRecalcEvery` tidak pernah dipakai; record bencana (−90%+) di-skip diam-diam; jam "in-range" bisa kelebihan hitung; paper close tidak menyetempel racikan.
10. Preset `mainzen_v3` **tidak ada di repo ini** — dokumen menyebutnya tapi filenya ada di instalasi kembar (`/home/ubuntu/meridianzen2/presets/mainzen_v3.json`, yang berjalan; salinan stale juga di `/home/ubuntu/meridian-v3`). Bab J (pertanyaan terbuka) **sudah dijawab empiris** di Bab K — termasuk konfirmasi fee sim paper memang salah satuan ~100×.

---

## BAB A — PETA TINGKAT TINGGI

**Bahasa awam:** Bot ini seperti pedagang kios di pasar malam kripto. Ia menyewa "lapak" (posisi LP) di kolam tukar-menukar token di Meteora. Selama harga token lewat di depan lapaknya (in-range), ia dapat komisi (fee) dari tiap transaksi orang lain. Kalau harga kabur jauh dari lapak (out-of-range/OOR), komisi berhenti dan modal bisa berubah jadi token yang nilainya turun (itu yang disebut IL — *impermanent loss*, rugi karena harga bergerak). Bot ini memilih lapak, menjaga lapak, menutup lapak, dan mencatat pelajarannya — semuanya otomatis, dengan laporan ke Telegram.

### File utama dan tugasnya (1 baris per file)

| File | Ngurus apa |
|---|---|
| `index.js` (3.344 baris) | Pusat komando: timer (cron), siklus screening & manajemen, perintah Telegram/REPL, aturan close deterministik |
| `agent.js` | Loop ReAct: kirim prompt ke LLM → LLM minta tool → jalankan → ulangi; filter tool per peran (baris 7–8) |
| `prompt.js` | Merakit "otak tertulis" (system prompt) per peran SCREENER/MANAGER/GENERAL |
| `config.js` | Memuat `user-config.json` + `.env` jadi objek `config` dengan default |
| `state.js` | Buku catatan posisi (`state.json`): kapan buka, range bin, OOR, peak/trough, exit-check |
| `lessons.js` | Mesin belajar: catat performa tiap close, turunkan "lessons", evolusi ambang screening |
| `reports.js` | Mesin statistik trade (profit factor, drawdown, breakdown by-X) untuk semua laporan |
| `briefing.js` | Briefing harian/mingguan/bulanan ke Telegram |
| `paper-trading.js` | Matematika murni simulasi posisi virtual (mode paper) |
| `pnl-tracker.js` | Tracker PnL terealisasi & net (dikurangi gas + biaya LLM) 1D/7D/30D |
| `signal-weights.js` | Bobot "Darwinian" sinyal screening: sinyal yang terbukti prediktif dinaikkan bobotnya |
| `pool-memory.js` | Ingatan per-kolam (riwayat deploy & hasil) |
| `preset-manager.js` / `preset.js` | Simpan/muat racikan config (`presets/*.json`) |
| `telegram.js` | Bot Telegram: polling, notifikasi deploy/close/swap/OOR |
| `tools/definitions.js` | Daftar tool (skema) yang dilihat LLM |
| `tools/executor.js` | Penjaga gerbang tool: safety check sebelum deploy/close, dispatch, auto-swap |
| `tools/dlmm.js` (2.554 baris) | Aksi Meteora: deploy, close, claim, daftar posisi, PnL — termasuk cabang DRY_RUN/paper |
| `tools/pnl.js` | Mesin PnL on-chain (RPC + SDK + Jupiter + deposit Meteora) |
| `tools/screening.js` | Penemuan kolam kandidat dari API Meteora |
| `tools/gmgn.js` | Jalur screening alternatif berbasis GMGN |
| `tools/chart-indicators.js`, `tools/smi.js` | Lapisan indikator teknikal (RSI/Supertrend/Bollinger/SMI) |
| `tools/wallet.js`, `tools/token.js`, `tools/study.js` | Saldo & swap (Jupiter), info token/holder, studi LPer top |
| `gas-tracker.js`, `llm-cost-tracker.js`, `openrouter-usage.js` | Pencatat biaya nyata: gas on-chain & biaya panggilan LLM |
| `decision-log.js`, `logger.js` | Jurnal keputusan & log harian |
| `hivemind.js`, `smart-wallets.js`, `token-blacklist.js`, `dev-blocklist.js` | Sinkron kolektif opsional, pelacak dompet pintar, daftar hitam |

| Temuan | Bukti | Status |
|---|---|---|
| Entry point + cron + Telegram di index.js | `index.js:1069` (`startCronJobs`), `index.js:339`, `index.js:555` | [CONFIRMED] |
| Role tool-set | `agent.js:7-8` (`MANAGER_TOOLS`, `SCREENER_TOOLS`) | [CONFIRMED] |
| Cabang paper di dlmm.js | `tools/dlmm.js:776`, `:1209`, `:1604`, `:1964` | [CONFIRMED] |

---

## BAB B — ALUR KERJA SATU SIKLUS

**Bahasa awam:** Bayangkan dua alarm. Alarm pertama (tiap 10 menit) menyuruh "satpam" mengecek semua lapak. Alarm kedua (tiap 30 menit) menyuruh "pencari lapak" berburu kolam baru. Di sela-selanya, ada "pencatat denyut" tiap 3 detik yang membaca harga on-chain supaya stop-loss/trailing tidak telat.

### 1) Timer nyala
- Cron manajemen tiap `managementIntervalMin` menit → `runManagementCycle()` — `index.js:1072-1075` (`cron.schedule(\`*/${...managementIntervalMin} * * * *\`)`).
- Cron screening tiap `screeningIntervalMin` menit → `runScreeningCycle()` — `index.js:1078-1083`.
- Poller PnL tiap `pnl.pollIntervalSec` (default 3) detik — `index.js:1126-1183` (`setInterval`). Kalau poller mendeteksi aturan close terpicu, ia langsung memanggil management cycle (`index.js:1156`, `:1169`).
- Briefing harian 01:00 UTC (`index.js:1105`), mingguan Senin 01:30 (`:1115`), bulanan tgl 1 02:00 (`:1120`).

### 2) Siklus MANAJEMEN (jaga lapak) — `index.js:339`
1. Ambil posisi nyata on-chain: `getMyPositions({force:true})` — `index.js:353`.
2. Kalau 0 posisi → langsung picu screening — `index.js:375-377`.
3. Untuk tiap posisi: update peak/trough & cek exit di `updatePnlAndCheckExits` (`state.js:473-589`) — stop-loss (`state.js:540`), trailing TP (`state.js:548`), OOR kelamaan (`state.js:563`), low yield (`state.js:574`).
4. Aturan close deterministik tambahan **tanpa LLM**: `getDeterministicCloseRule` — `index.js:1255-1298` (Rule 1 stop loss, 2 take profit, 3 "pumped far above range", 4 OOR, 5 low yield).
5. Exit indikator opsional (default OFF) — `index.js:1304-1317`.
6. **LLM (peran MANAGER) hanya dipanggil kalau ada aksi** (CLOSE/CLAIM/INSTRUCTION): `index.js:480-511`. Kalau semua STAY → "skipping LLM" (`index.js:515`).
7. LLM mengeksekusi `close_position`/`claim_fees` lewat `executeTool` (`tools/executor.js:730`).
8. Setelah siklus: kalau slot kosong → picu screening (`index.js:520-525`); cek milestone laporan belajar (`index.js:551`).

### 3) Siklus SCREENING (cari lapak) — `index.js:555`
1. Hard guard: max posisi (`index.js:569`), saldo SOL cukup (`index.js:583`), gerbang rezim pasar 🧪 jika ON (`index.js:602`).
2. Hitung modal deploy: `computeDeployAmount(saldo)` — `index.js:640`, rumus di `config.js:462`.
3. Ambil 10 kandidat: `getTopCandidates` (`index.js:653`, implementasi `tools/screening.js`).
4. Recon tiap kandidat: smart wallets + narasi + info token (`index.js:677-692`); filter keras launchpad & bot-holders (`index.js:697-718`).
5. Kandidat + sinyal disuntik ke prompt SCREENER → LLM memilih SATU kolam atau menolak semua.
6. `deploy_position` lewat **safety check mekanis** di `tools/executor.js:836-1038` (bin step, max posisi, duplikat, saldo, range minimal, dll).
7. Eksekusi on-chain `deployPosition` (`tools/dlmm.js:645`); posisi dicatat `trackPosition` (`state.js:140`); notifikasi Telegram `notifyDeploy` (`tools/executor.js:774`).

### 4) Tutup & belajar
- `close_position` (`tools/dlmm.js:1960`): klaim fee → cabut likuiditas → verifikasi benar-benar tertutup (`dlmm.js:2297-2323`) → tandai closed (`dlmm.js:2325`) → ambil PnL final dari API Meteora (`dlmm.js:2354-2388`) → `recordPerformance` (`dlmm.js:2430`) → jurnal keputusan (`dlmm.js:2465`).
- Setelah close, executor **auto-swap** token sisa ≥ $0.10 kembali ke SOL (`tools/executor.js:783-798`) dan kirim `notifyClose` (`tools/executor.js:776`).
- Belajar: tiap kelipatan 5 close live → `evolveThresholds` (geser ambang screening; `lessons.js:252-259`) + bobot Darwin `recalculateWeights` (`lessons.js:261-268` → `signal-weights.js:99`).

| Temuan | Bukti | Status |
|---|---|---|
| LLM tidak dipakai untuk memutuskan SL/TP/OOR (mekanis murni) | `index.js:412-445`, `index.js:506` ("Do NOT re-evaluate… Just execute") | [CONFIRMED] |
| Anti deploy ganda (race) | `index.js:556-561` (`_screeningBusy`, `_screeningLastTriggered`) | [CONFIRMED] |
| Poller PnL bisa memicu close lebih cepat dari cron | `index.js:1128-1179` | [CONFIRMED] |

---

## BAB C — OTAK & ATURAN (prompt.js)

**Bahasa awam:** prompt.js adalah "SOP tertulis" yang dibacakan ke model AI setiap kali ia bangun. Ada tiga SOP: SCREENER (pemburu), MANAGER (satpam), GENERAL (asisten chat). Penting: aturan paling berbahaya (stop-loss dll) TIDAK dititipkan ke AI — itu dikunci di kode (Bab B). SOP ini mengatur sisanya: selera memilih kolam, kesabaran, dan rumus lebar lapak.

### Kapan BUKA posisi (SCREENER, `prompt.js:124-158`)
- **HARD RULE** (`prompt.js:131-133`): `fees_sol < minTokenFeesSol` → SKIP, titik ("Low fees = bundled/scam. Smart wallets do NOT override this."). Bot-holders berlebih sudah disaring sebelum LLM melihat daftar.
- Sinyal risiko/pertimbangan (`prompt.js:135-139`): top10 terlalu terkonsentrasi; konflik simbol PVP; "no narrative + no smart wallets → skip"; kandidat tunggal → default jangan deploy.
- Kualitas narasi = penilaian utama si AI (`prompt.js:141-144`): narasi GOOD = ada asal-usul spesifik; BAD = hype generik.
- Anti-halusinasi (`prompt.js:129`): dilarang mengaku deploy tanpa benar-benar memanggil tool.
- Hanya boleh pilih SATU kolam (`prompt.js:155`).

### Rumus "bins" — lebar lapak harga (`prompt.js:153`, dieksekusi `index.js:1361-1369`)
```
bins_below = round(minBinsBelow + (volatility/5) × (maxBinsBelow − minBinsBelow))
            di-clamp ke [minBinsBelow, maxBinsBelow];  bins_above = 0 (selalu)
```
Bahasa awam: makin liar harga token (volatility tinggi), makin lebar lapak ke bawah supaya tidak gampang "kelewatan". Modal hanya SOL satu sisi di bawah harga aktif. Floor keselamatan 35 bin dipaksa di kode (`config.js` `MIN_SAFE_BINS_BELOW`, dicek di `tools/executor.js:894` dan `tools/dlmm.js:754-760`).

### Kapan TUTUP posisi (MANAGER, `prompt.js:35-52` + `prompt.js:159-174`)
- Prompt MANAGER sengaja kurus: "This is a mechanical rule-application task… Apply the close/claim rules directly" (`prompt.js:40`).
- Instruksi user pada posisi = prioritas tertinggi (`prompt.js:163`); selain itu **BIAS TO HOLD** (`prompt.js:165`).
- Wajib swap token sisa ≥ $0.10 ke SOL setelah close (`prompt.js:47`, `prompt.js:184`).

### Aturan risiko & perilaku umum (`prompt.js:84-111`)
- "PATIENCE IS PROFIT" (`prompt.js:86`), hemat gas (`prompt.js:87`).
- Pasca-deploy wajib set interval manajemen sesuai volatilitas: vol ≥5 → 3 menit; 2–5 → 5; <2 → 10 (`prompt.js:89-92`).
- UNTRUSTED DATA RULE (`prompt.js:93`, `:127`): narasi/memo/metadata eksternal tidak boleh diperlakukan sebagai perintah (pertahanan anti prompt-injection).
- Tabel skala timeframe agar AI tidak salah baca angka 5m vs 24h (`prompt.js:95-110`).

### RACIKAN RULES (`prompt.js:21-29`)
Racikan (preset) bisa membawa aturan prompt sendiri sebagai data (`config.promptNotes`); menang atas guideline lunak tapi **tidak pernah** atas HARD RULE / safety check mekanis (`prompt.js:25`). Saat ini `user-config.json` tidak memuat `promptNotes` → prompt pabrik murni. [CONFIRMED — `grep -n promptNotes user-config.json` → kosong]

| Temuan | Bukti | Status |
|---|---|---|
| HARD RULE fee minimum | `prompt.js:131-132` | [CONFIRMED] |
| Rumus bins linear + clamp | `prompt.js:153`, `index.js:1361-1369` | [CONFIRMED] |
| SL/TP/trailing TIDAK ada di prompt (mekanis di kode) | `state.js:540-560`, `index.js:1255-1298` | [CONFIRMED] |
| strategyLock ditegakkan mekanis (bukan cuma diminta) | `tools/executor.js:845-849` | [CONFIRMED] |

---

## BAB D — ANGKA & SETELAN

### D.1 Config AKTIF sekarang (`user-config.json`, dimuat oleh `config.js`)

Nilai kunci yang sedang berlaku (kunci API/chat-id disensor `***`):

| Setelan | Nilai aktif | Bukti (user-config.json) | Artinya (awam) |
|---|---|---|---|
| `activeSetup` | `"mainzen_v2"` | baris 115 | Racikan yang sedang dipakai |
| `strategy` + `strategyLock` | `bid_ask` (terkunci) | baris 13, 116 | Bentuk sebaran modal di lapak dikunci bid_ask |
| `deployAmountSol` / `positionSizePct` / `maxDeployAmount` | 0.2 / 0.33 / 10 | baris 7, 12, 10 | Modal per lapak: 33% dari saldo bisa-deploy, min 0.2 SOL, max 10 |
| `maxPositions` | 3 | baris 8 | Maksimal 3 lapak sekaligus |
| `stopLossPct` / `takeProfitPct` | −12 / 4 | baris 56–57 | Tutup paksa di −12%; ambil untung di +4% |
| `trailingTakeProfit` 1.5 / 1.0 | true | baris 60–62 | Setelah untung ≥1.5%, kalau turun 1% dari puncak → tutup |
| `minFeePerTvl24h` / `minAgeBeforeYieldCheck` | 6 / 90 | baris 58–59 | Lapak "sepi komisi" (<6%/hari) ditutup, tapi baru dicek setelah umur 90 menit |
| `outOfRangeWaitMinutes` / `outOfRangeBinsToClose` | 30 / 10 | baris 51–52 | OOR ke atas >30 menit → tutup; melejit >10 bin di atas range → tutup |
| `solMode` | true | baris 64 | PnL dihitung dalam SOL, bukan USD |
| Screening: `minTvl` 10k, `maxTvl` 1.5M, `minOrganic` 70, `minMcap` 150k, `maxMcap` 10M, `minBinStep` 80, `maxBinStep` 125, `minFeeActiveTvlRatio` 0.1, `minTokenFeesSol` 30, timeframe 30m, kategori trending+top+new | — | baris 17–36, 19–23 | Saringan kolam kandidat |
| Model LLM | management `minimax-m2.5`, screening `minimax-m2.7`, general `gemini-2.5-flash` | baris 72–74 | Otak berbeda per peran |
| Indikator | ON, entry `supertrend_break` 5m+15m requireAll, `rejectAlreadyAtBottom` true, `exitEnabled` false | baris 87–102 | Gerbang masuk teknikal; gerbang keluar indikator OFF |

Default pabrik tiap section ada di `config.js` (`screening:` baris 114, `management:` 204, `strategy:` 241, `schedule:` 253, `llm:` 266, `darwin:` 277, `experiments:` 363, `reports:` 444). Rumus compounding: `computeDeployAmount` `config.js:462` — `clamp(deployable × positionSizePct, deployAmountSol, maxDeployAmount)`.

### D.2 Preset / Racikan yang ada

Folder `presets/` repo ini berisi: `mainzen.json`, `mainzen_v2.json`, `bigcapagresif.json` (+ README & checklist). **`mainzen_v3.json` TIDAK ADA di repo ini** — [NOT FOUND di `presets/`; perintah: `ls presets/`]. Dokumen `NEXT-SESSION.md:4` & `MAINZEN-V3-WORKFLOW.md:3` menyebut "presets/mainzen_v3.json" — file itu nyatanya ada di **instalasi kembar** `/home/ubuntu/meridian-v3/presets/mainzen_v3.json` [CONFIRMED via `ls /home/ubuntu/meridian-v3/presets/`].

Beda antar preset (diff aktual, kunci identik tidak ditulis):

**mainzen → mainzen_v2** (v2 = yang LIVE sekarang):
- Modal: `deployAmountSol` 0.15→0.2, `positionSizePct` 0.4→0.33
- Saringan dilonggarkan demi breadth: `minOrganic` 75→70, `minMcap` 250k→150k, `maxBinStep` 100→125, `maxTokenAgeHours` 150→720, + multi-kategori `["trending","top","new"]`
- Exit dirapatkan: `minFeePerTvl24h` 10→6, trailing 2/1.5 → 1.5/1
- Indikator diperketat: interval 5m → 5m+15m dengan `requireAllIntervals:true`, + `rejectAlreadyAtBottom:true`

**mainzen → bigcapagresif** (eksperimen big-cap, `dryRun:true` di dalam filenya):
- Target pasar beda total: `minMcap` 30M, `maxMcap` 100B, `minTvl` 50k, `maxTvl` 50M, token umur ≥336 jam (2 minggu)
- Modal besar: `deployAmountSol` 1, `maxPositions` 2, strategi `spot` (lock), TP 25%, trailing OFF, `minFeePerTvl24h` 0.5
- Timeframe 1h, indikator 15m, + eksperimen `marketRegimeGate:true` (12%)

**mainzen_v2 → mainzen_v3** (draft "Trend Rider", di folder v3): per `MAINZEN-V3-WORKFLOW.md:48` & `NEXT-SESSION.md:4`: spot, TP 15, trailing 2.5/3.0, bins 60–100, stopLoss −12. [INFERRED dari dokumen — file aslinya di luar repo ini, tidak saya kutip baris]

### D.3 Parameter `darwin*` — apa itu?

**Bahasa awam:** "Darwin" = seleksi alam untuk *sinyal screening*. Setiap sinyal (skor organik, fee/TVL, ada-tidaknya smart wallet, dst) punya bobot. Sehabis sejumlah posisi ditutup, bot mengecek: sinyal mana yang beneran membedakan trade menang vs kalah ("lift")? Kuartil teratas dinaikkan bobotnya (dikali `darwinBoost` 1.05), kuartil terbawah diturunkan (kali `darwinDecay` 0.95), dibatasi lantai 0.3 dan plafon 2.5. Bobot ini dipakai untuk mengurutkan/menimbang kandidat di prompt SCREENER.

| Parameter | Default | Bukti | Arti |
|---|---|---|---|
| `darwinEnabled` | true | `config.js:278` | Saklar fitur |
| `darwinWindowDays` | 60 | `config.js:279`, dipakai `signal-weights.js:101,116-121` | Hanya melihat trade ≤60 hari terakhir |
| `darwinRecalcEvery` | 5 | `config.js:280` | ⚠️ **TIDAK PERNAH DIPAKAI** — pemicu nyatanya konstanta `MIN_EVOLVE_POSITIONS=5` di `lessons.js:19,253`. Kebetulan nilainya sama jadi tidak terasa. [CONFIRMED via `grep -rn recalcEvery *.js` → hanya definisi + tampilan /config `index.js:1589`] |
| `darwinBoost` / `darwinDecay` | 1.05 / 0.95 | `signal-weights.js:103-104,165-170` | Langkah naik/turun bobot per rekalkulasi |
| `darwinFloor` / `darwinCeiling` | 0.3 / 2.5 | `signal-weights.js:105-106` | Batas bawah/atas bobot |
| `darwinMinSamples` | 10 | `signal-weights.js:102,127-130` | Butuh ≥10 trade di window sebelum berani geser bobot |

Catatan penting: rekalkulasi Darwin **hanya pakai record live** (`lessons.js:252-268`, `livePerf = …filter(p => !p.paper)`), jadi data paper tidak bisa meracuni bobot. [CONFIRMED]

---

## BAB E — PENGUKURAN (di mana PnL, fee, menang/kalah dihitung)

**Bahasa awam:** Ada tiga "timbangan" berbeda: (1) timbangan posisi TERBUKA (dipakai poller 3 detik & satpam), (2) timbangan saat TUTUP (yang masuk buku rapor), (3) mesin statistik rapor (/report, briefing). Semua tuning nanti bersandar ke nomor 2 dan 3.

### E.1 PnL posisi terbuka — `tools/pnl.js` (jalur utama, `pnl.source="rpc"`)
- Saldo likuiditas + fee belum diklaim dibaca **on-chain langsung** via SDK Meteora di RPC publik (`tools/pnl.js:244-295`, komentar arsitektur `:11-17`).
- Riwayat setoran/penarikan/fee-terklaim dari API Meteora `/pnl` (`tools/pnl.js:62-83`), di-cache & di-invalidate per signature (`:106-146`).
- Harga USD dari Jupiter, **tidak dicache** (`tools/pnl.js:86-100`).
- Rumus inti (`tools/pnl.js:173-176`): `pnl = nilai_sekarang + penarikan + fee_klaim-able + fee_terklaim − total_setoran` (versi USD dan SOL).
- Pengaman: tick "suspicious" kalau harga gagal diambil atau setoran 0 (`tools/pnl.js:192-198`) → aturan PnL (SL/trailing) tidak dieksekusi pada tick itu (`state.js:540`, `index.js:1259`).

### E.2 PnL saat TUTUP (yang dicatat ke buku) — `tools/dlmm.js`
- Sumber otoritatif: API Meteora `status=closed` — `pnlUsd`, `allTimeWithdrawals`, `allTimeDeposits`, `allTimeFees` (`tools/dlmm.js:2354-2378`), dicoba 6× dengan jeda 5 detik.
- Penolak angka aneh: PnL ≤ −90% tanpa kata "stop loss" dianggap data belum settle → ditolak dan dicoba lagi (`tools/dlmm.js:2337-2344`).
- **Fallback** kalau API tidak kunjung settle: pakai snapshot cache pra-close (`tools/dlmm.js:2390-2407`). Kalau cache pun tidak ada → nilai default 0 ikut tercatat (`:2347-2352`) — lihat Bab H.
- Fee yang dicatat = `allTimeFees.total.usd` dari Meteora (REAL), fallback `total_fees_claimed_usd` dari state (`tools/dlmm.js:2352,2366`).

### E.3 Pencatatan & definisi menang — `lessons.js`
- `recordPerformance` (`lessons.js:147-282`): `pnl_usd = (final_value_usd + fees_earned_usd) − initial_value_usd`; `pnl_pct = pnl_usd / initial_value_usd × 100` (`lessons.js:166-169`); `range_efficiency = minutes_in_range / minutes_held` (`:170-172`).
- **Menang = `pnl_usd > 0`** di semua statistik (`reports.js:35`, `lessons.js:853`, `signal-weights.js:131`). Tidak ada definisi lain.
- Dua penjaga yang MEN-SKIP record (tidak dicatat sama sekali): campuran satuan SOL/USD mencurigakan (`lessons.js:152-164`) dan PnL tertutup absurd ≤−90% non-stop-loss (`lessons.js:174-184`).

### E.4 Mesin statistik /report & briefing — `reports.js`
- `computeTradeStats` (`reports.js:30-155`): net, ROI, win-rate, **profit factor** (`:114`), payoff ratio (`:115`), expectancy (`:134-135`), max drawdown kurva ekuitas (`:57-59`), worst streak (`:62-66`), give-back puncak→exit (`:70-85`), ekskursi harga mentah utk tuning SL (`:93-108`).
- **"Shrunk expectancy"** — ranking adil breakdown by-X (`reports.js:209-231`): skor bucket = `(net_bucket + K × rata2_global) / (n_bucket + K)` dengan `SHRINK_K = 5`. Bahasa awam: bucket bersampel 1–2 trade "ditarik" ke rata-rata global seolah ditambah 5 trade fiktif rata-rata, supaya hoki sekali-tembus tidak menang ranking dari bucket 15-trade yang konsisten.
- Breakdown by-strategy / by-session (WIB) / by-narrative / by-racikan / by-close-rule (`reports.js:145-153`); khusus close-rule diurut dampak $ absolut (`:149-153`); pemetaan teks-bebas alasan close → rule kanonik di `classifyCloseRule` (`reports.js:163-174`).
- Rekomendasi sadar-profitabilitas: menolak saran gede-in size saat net negatif / PF < 1.2 (`reports.js:313-322`).
- **Net setelah biaya**: `pnl-tracker.js:40-66` — `net = PnL terealisasi − gas − biaya LLM`; gas pakai capture asli (`gas-tracker.js`) dan jatuh ke estimasi per-trade berflag `~` kalau tidak ada (`pnl-tracker.js:49-55`, `reports.js:442-447`).
- **Pemisahan mode**: semua rapor/briefing membaca `getModePerformance()` (`lessons.js:834-839`) — saat dry-run hanya record paper, saat live hanya record live. Dipakai di `index.js:211,239,2754,3173`. ⚠️ Pengecualian: `getPerformanceSummary` (`lessons.js:844-869`) dan `getPerformanceHistory` (`:786-820`) membaca SEMUA record tanpa filter paper — dipakai untuk blok "Performance" di prompt (`agent.js:206`) dan tool riwayat. Lihat Bab H.

| Temuan | Bukti | Status |
|---|---|---|
| PnL terbuka = on-chain + deposit Meteora + Jupiter | `tools/pnl.js:153-238` | [CONFIRMED] |
| PnL tutup = API Meteora closed, fallback cache | `tools/dlmm.js:2346-2408` | [CONFIRMED] |
| Menang = pnl_usd > 0 | `reports.js:35` | [CONFIRMED] |
| Shrunk expectancy K=5 | `reports.js:209,228` | [CONFIRMED] |
| Net = PnL − gas − LLM | `pnl-tracker.js:63-66` | [CONFIRMED] |

---

## BAB F — AUDIT PAPER TRADING (fokus khusus)

### F.1 Subsistem beneran atau cuma mode dryRun?

**Jawab: subsistem beneran, berlapis di atas DRY_RUN.** `DRY_RUN=true` sendirian hanya berarti "jangan kirim transaksi" — deploy mengembalikan `would_deploy` lalu hilang tanpa jejak (`tools/dlmm.js:834-848`). Paper trading adalah lapisan tambahan: `isPaperMode() = DRY_RUN===true && config.experiments.paperTrading===true` (`paper-trading.js:20-22`), yang membuat posisi VIRTUAL hidup penuh (dilacak, dipantau, ditutup, dicatat).

Hasil grep yang diminta (`grep -rni "papertrading|paper:true|ispapermode|\bpaper\b"` dan `grep -rni "dryrun|dry_run"`, exclude node_modules) — jumlah kecocokan per file:
- paper: `tools/dlmm.js` 32, `briefing.js` 32, `lessons.js` 23, `index.js` 10, `config.js` 7, `paper-trading.js` 5, `prompt.js` 1, `tools/executor.js` 1, `tools/definitions.js` 1.
- dryrun: `index.js` 12, `tools/dlmm.js` 10, `config.js` 4, `tools/executor.js` 3, sisanya 1–2 (preset, setup, cli, wallet, hivemind, briefing).

**Tempat tinggalnya:** matematika murni di `paper-trading.js` (143 baris, "PURE MATH — imports config only", `paper-trading.js:8-10`); semua cabang lifecycle di `tools/dlmm.js` (deploy `:776-833`, PnL `:1209-1228`, daftar posisi `:1604-1606`, close `:1964-1966`, blok khusus `:1420-1598`); isolasi data di `lessons.js` (tag `paper:true`, `:205-279`).

**Status sekarang:** repo ini LIVE — `.env` `DRY_RUN=false` dan `user-config.json` TIDAK memuat `paperTrading` → default `false` (`config.js:428`). `lessons.json`: 114 record performa, **0 bertanda paper** [CONFIRMED via node]. Jadi belum pernah ada data paper di buku instalasi ini.

**`meridian-v3` itu apa?** FOLDER TERPISAH `/home/ubuntu/meridian-v3` — instalasi kembar lengkap di luar repo ini (punya `agent.js`, `config.js`, dst sendiri + `presets/mainzen_v3.json`). Bukan branch dan bukan sub-folder repo ini [CONFIRMED via `ls -d /home/ubuntu/meridian*`]. Konfignya saat dibaca: `.env` `DRY_RUN=false`, `user-config.json` `paperTrading: false` — jadi **dia pun bukan instance paper** saat ini. Penasihat harap tahu: semua kutipan baris di dossier ini dari `meridianzen`, BUKAN dari v3 (kode v3 bisa saja sudah beda). **⚠️ KOREKSI (Bab K.2):** proses pm2 bernama `meridian-v3` ternyata berjalan dari folder LAIN lagi — `/home/ubuntu/meridianzen2` (git head sama dengan folder meridian-v3), LIVE `DRY_RUN=false`, wallet terpisah. Kesimpulan "tidak ada instance paper" tetap berlaku.

### F.2 Saat BUKA (mode paper): apa yang di-skip vs tetap jalan? Entry dikarang atau real?

Yang TETAP JALAN sebelum cabang dry-run (artinya pakai data chain sungguhan):
- Ambil pool on-chain + bin aktif + harga bin: `getPool`, `pool.getActiveBin()`, `getPriceOfBinByBinId` — `tools/dlmm.js:686-695`. Ini SEBELUM `if (process.env.DRY_RUN === "true")` di `:773`, jadi berlaku juga untuk paper.
- Validasi amount, bins, strategi (`:717-771`); safety check executor (bin step, max posisi, duplikat — `tools/executor.js:874-995`).

Yang DI-SKIP: transaksi on-chain (tidak ada `sendTx`), cek saldo SOL (`tools/executor.js:998` hanya saat `DRY_RUN !== "true"`), dan probe exit-liquidity (`tools/executor.js:1018` juga di-skip saat dry-run).

**Entry dicatat dari chain BENERAN, bukan dikarang** [CONFIRMED]: `tools/dlmm.js:778-781` menghitung `pMinBinId/pMaxBinId` dari `activeBin.binId` hasil baca chain, lalu `trackPosition({ bin_range: {min, max, active: activeBin.binId}, active_bin: activeBin.binId, bin_step: actualBinStep, … })` (`:790-809`). ID posisi sintetis `paper_<pool8>_<ts>` (`paper-trading.js:25-28`).

### F.3 Saat PANTAU: harga real atau simulasi? Fee & IL real atau estimasi?

- **Posisi & harga: REAL.** `computePaperMetrics` membaca ulang bin aktif on-chain tiap evaluasi (`tools/dlmm.js:1440-1453`: `pool.getActiveBin()`, harga via `getPriceOfBinByBinId`). Status in-range/OOR dan menit OOR akumulasi nyata (`:1458`, `getPaperPositions` `:1518-1519`).
- **Fee: ESTIMASI (proxy).** Rumus di `paper-trading.js:103-114`:
  `feesSol = clamp( deposit × feeTvlRatio × (menit_in_range / 1440), 0, deposit × 0.5 )`
  Bahasa awam: "anggap rasio fee/TVL pool berlaku sebagai laju ~24 jam, dan kita kebagian sebanding waktu in-range" — dengan plafon maksimal setengah deposit. Kontrak akurasi ditulis jujur di kode: "APPROXIMATE: fees … NOT a profit forecast" (`paper-trading.js:12-15`).
- **IL: ESTIMASI (model orde-pertama).** `paper-trading.js:85-101`: hitung fraksi SOL yang "terbeli jadi token" sebanding bin yang dilewati harga turun (`fillFrac = crossedBins/spanBins`), harga beli rata-rata ≈ titik tengah entry & batas bawah, lalu token di-mark ke harga sekarang. `pnl = IL + fees` (`:116`).
- Harga SOL→USD dari Jupiter via `getWalletBalances`, cache 5 menit (`tools/dlmm.js:1424-1437`).

⚠️ **Risiko satuan fee** [INFERRED — dua komentar kode saling bertentangan]: `prompt.js:108` menegaskan `fee_active_tvl_ratio` "ALREADY in percentage form. 0.29 = 0.29%", sedangkan sim memakainya sebagai PECAHAN (0.29 = 29%/hari; pembenaran di `paper-trading.js:104-107` menafsirkan 0.19 = ~$52K/hari di pool $277K = 19%). Kalau tafsiran prompt yang benar, **fee simulasi bisa kebesaran sampai ~100×** (untungnya dibatasi plafon 50% deposit). Mana yang benar hanya bisa dipastikan dengan membandingkan ke fee aktual pool — masuk Bab J.

### F.4 Saat TUTUP + recordPerformance: dari apa angka untung/rugi?

`closePaperPosition` (`tools/dlmm.js:1528-1598`):
- PnL = hasil `computePaperMetrics` saat itu — **mark-to-market di harga bin aktif on-chain saat close** (`:1533,1541-1542`). Entry dan exit memakai SUMBER YANG SAMA (harga bin on-chain) — konsisten, tidak ada yang dikarang.
- `recordPerformance` dipanggil dengan `fees_earned_usd = m.fees_usd` (estimasi), `final_value_usd = m.position_value_usd`, `initial_value_usd = m.initial_value_usd` (= deposit × harga SOL), `paper: true` (`:1565-1576`).

Pemeriksaan jalur "default ke menang":
- **Sim gagal (m = null)** → fees 0, final 0, initial 0 → `pnl_usd = (0+0)−0 = 0` → tercatat **break-even**, bukan menang (`tools/dlmm.js:1534,1541-1542,1565-1567` + rumus `lessons.js:166`). Bukan bias menang, tapi tetap baris 0 palsu yang mengencerkan statistik.
- **Feed harga SOL mati** → `solPrice=0` → semua field USD = 0 (`paper-trading.js:128-132`) → idem, baris break-even.
- **Exit diasumsikan di puncak?** TIDAK — exit di harga bin aktif saat perintah close, bukan peak [CONFIRMED `tools/dlmm.js:1444-1451`].
- **PnL/menang hardcoded?** [NOT FOUND] — grep `pnl_usd =` dan `pnl_pct =` di jalur paper semuanya hasil perhitungan; tidak ada konstanta menang. (`grep -n "pnl" tools/dlmm.js paper-trading.js`)
- **Slippage / biaya keluar / gas: DIABAIKAN** [CONFIRMED tidak ada di `simulatePaperMetrics` — tidak ada parameter slippage/gas sama sekali]. Close live nyata membayar gas + auto-swap dengan price-impact Jupiter (`tools/executor.js:783-798`); sim tidak.

### F.5 VONIS "halu menang terus"

**Mungkinkah paper mencatat MENANG padahal realitanya RUGI? — YA, MUNGKIN, dan arahnya sistemik optimis** (meski bukan "selalu menang"):

1. **Fee proxy bisa overestimate** — sumber bias terbesar. Selain risiko satuan ×100 (F.3), proxy mengkredit fee sekadar karena *in-range*, padahal di DLMM nyata fee hanya datang kalau volume benar-benar menyeberangi bin kita. Token yang diam (volume mati tapi harga di range) tetap "menghasilkan" fee di sim. Trade sideways yang realitanya rugi-tipis-kena-gas bisa tercatat untung. [CONFIRMED rumus `paper-trading.js:103-114`; dampak = INFERRED]
2. **Tidak ada slippage, price-impact, dan gas** di sim (F.4). Pada token ilikuid, keluar posisi nyata bisa makan beberapa persen; sim mencatat 0. Gerbang exit-liquidity bahkan sengaja di-skip saat dry-run (`tools/executor.js:1015-1019`). [CONFIRMED]
3. **Model IL orde-pertama menghaluskan kerugian bentuk-kurva**: harga beli rata-rata dianggap titik tengah (`paper-trading.js:97`), padahal strategi `bid_ask` menumpuk modal di tepi bawah — sim bahkan **tidak menerima parameter strategi** (spot/bid_ask/curve disimulasikan identik). [CONFIRMED — `simulatePaperMetrics` tidak punya argumen strategy, `paper-trading.js:60-73`]
4. Penyeimbang yang JUJUR: arah harga, timing, in-range/OOR dibaca dari chain asli — token yang dump akan tercatat **rugi besar** di sim juga (fillFrac→1, mark di harga jatuh). Jadi sim bisa kalah, dan kontrak akurasinya ditulis terang-terangan di kode (`paper-trading.js:12-15`).

**Kesimpulan untuk penasihat:** statistik paper layak dipakai untuk menilai *pemilihan pool & timing entry/exit* (itu real), tapi **JANGAN dipercaya untuk besaran PnL/fee** — fee & IL adalah estimasi dengan bias ke atas. Kode sendiri sudah mengisolasi data paper dari semua mekanisme live (tag `paper:true`; evolusi ambang, bobot Darwin, hive, pool-memory semuanya menyaring paper — `lessons.js:205-279`), jadi "halu"-nya tidak menular ke bot live.

| Temuan kunci F | Bukti | Status |
|---|---|---|
| Paper = subsistem nyata, flag AND DRY_RUN | `paper-trading.js:20-22` | [CONFIRMED] |
| Saat ini paper OFF di kedua instalasi | `.env` (`DRY_RUN=false`), `config.js:428`, v3 `user-config.json:116` | [CONFIRMED] |
| Entry bin/harga dari chain asli | `tools/dlmm.js:687-695,778-809` | [CONFIRMED] |
| Fee & IL = estimasi, bukan real | `paper-trading.js:103-114, 85-101` | [CONFIRMED] |
| Risiko satuan fee (s.d. ~100×) | `prompt.js:108` vs `paper-trading.js:104-107` | [INFERRED] |
| Tidak ada slippage/gas di sim | `paper-trading.js:60-136` (tidak ada param) | [CONFIRMED] |
| Data hilang → 0 (break-even), bukan menang | `tools/dlmm.js:1541-1542,1565-1567` | [CONFIRMED] |
| PnL hardcoded menang | — | [NOT FOUND] |

---

## BAB G — KELENGKAPAN CATATAN BUKA/TUTUP

### Saat BUKA — `makePositionRecord` (`state.js:60-135`), diisi oleh `trackPosition` (`state.js:140-157`)

Kolom yang dicatat: `position`, `pool`, `pool_name`, `strategy`, `bin_range` (min/max/active), `amount_sol`, `amount_x`, `active_bin_at_deploy`, `bin_step`, `volatility`, `fee_tvl_ratio` (+salinan `initial_fee_tvl_24h`), `organic_score`, `initial_value_usd`, `narrative_category`, **`active_setup` (racikan saat deploy)** + `profile` (di-stamp otomatis `state.js:151-152`), `shadow_signals`, `entry_mcap/tvl/volume/holders` (disuntik safety-check dari data pool segar — `tools/executor.js:185-193`), `signal_snapshot`, `deployed_at` (terlindung dari reset — `state.js:143-145`), lalu field pemantauan: `out_of_range_since`, `peak/trough_pnl_pct`, `price_peak/trough_pct`, `total_fees_claimed_usd`, `notes[]`.

### Saat TUTUP — `recordPerformance` (`lessons.js:147-201`), pemanggil live `tools/dlmm.js:2430-2463`

Semua field di atas yang relevan diteruskan + ditambah: `fees_earned_usd`, `final_value_usd`, `initial_value_usd`, `minutes_in_range`, `minutes_held`, `close_reason`, `exit_mcap/tvl/volume` (`tools/dlmm.js:2417-2428`), lalu dihitung: `pnl_usd`, `pnl_pct`, `range_efficiency`, `opened_at`, `closed_at`, `open_hour_wib`, `open_session`, `recorded_at` (`lessons.js:190-201`).

### Checklist rekonstruksi kebenaran

| Kolom | Ada? | Bukti / Catatan |
|---|---|---|
| Waktu masuk | ✅ `deployed_at`/`opened_at` | `state.js:109`, `lessons.js:196` |
| Waktu keluar | ✅ `closed_at`/`recorded_at` | `lessons.js:197,200` |
| Bins/rentang | ✅ `bin_range` + `bin_step` | `state.js:94-96`; sample nyata punya `{min,max,bins_below,bins_above}` |
| **Harga masuk (eksplisit)** | ❌ HILANG | Tidak ada field harga entry di record performa. Bisa DIREKONSTRUKSI dari `bin_range.active`+`bin_step` (harga = fungsi bin id), tapi `active` tidak selalu ikut ke perf (sample terbaru tidak memuatnya). [CONFIRMED dari sample Bab I] |
| **Harga keluar / bin saat close** | ❌ HILANG | Tidak dicatat sama sekali; hanya tersirat via `final_value_usd` & `price_peak/trough_pct` |
| Fee REAL vs ESTIMASI dipisah? | ⚠️ Satu kolom | `fees_earned_usd` saja; pembeda real-vs-sim hanya flag `paper:true` per record. Di live, fee dari API Meteora = real (`tools/dlmm.js:2366`) |
| IL terpisah | ❌ HILANG | Tidak ada kolom IL; hanya bisa didekati = `pnl_usd − fees_earned_usd` |
| Alasan tutup | ✅ `close_reason` | dinormalisasi belakangan oleh `classifyCloseRule` (`reports.js:163`) |
| Preset/config aktif | ✅ live (`active_setup`, `profile`) / ❌ **paper** | Live close meneruskannya (`tools/dlmm.js:2444-2445`); **paper close TIDAK** (`tools/dlmm.js:1546-1577` tidak memuat `active_setup`/`profile`) → breakdown "By racikan" kosong untuk data paper |
| Gas per trade di record | ❌ HILANG | Gas hanya agregat di `gas-log.json` (gas-tracker), tidak menempel per posisi |
| Peak/trough PnL & harga | ✅ | `peak/trough_pnl_pct`, `price_peak/trough_pct` (`tools/dlmm.js:2447-2450`) |

**Kesimpulan G:** cukup untuk analitik agregat dan tuning SL (berkat ekskursi harga), tapi **belum cukup untuk rekonstruksi penuh per-trade** — tambahkan harga/bin entry & exit eksplisit, IL terpisah, dan stamp racikan di jalur paper kalau nanti mau audit kebenaran sim per-trade.

---

## BAB H — TITIK LEMAH / UTANG TEKNIS

> Tidak ada yang diperbaiki di sesi ini (sesuai aturan tugas). Urut dari yang paling berdampak ke statistik.

1. **Record bencana di-skip diam-diam (LIVE).** `recordPerformance` menolak mencatat close dengan PnL ≤ −90% bila alasan close tidak memuat kata "stop loss" (`lessons.js:174-184`), plus menolak record "campuran satuan" (`lessons.js:152-164`). Niatnya menahan data API yang belum settle — tapi efek sampingnya: **rug pull sungguhan yang ditutup dengan alasan lain bisa hilang dari buku** → win-rate & net kelihatan lebih bagus dari kenyataan. Lapisan kedua di `tools/dlmm.js:2337-2344` juga menolak lalu retry. [CONFIRMED]
2. **Fallback close-PnL bisa mencatat 0 palsu.** Kalau API Meteora closed tidak settle DAN cache pra-close kosong, nilai default `pnlUsd=0, initial=0, final=0` ikut masuk buku (`tools/dlmm.js:2347-2352` → `:2430`) → baris break-even fiktif. [CONFIRMED jalurnya ada; frekuensi kejadian = INFERRED jarang]
3. **`minutes_in_range` kelebihan hitung.** Saat close, `minutesOOR` dihitung hanya dari `out_of_range_since` TERAKHIR (`tools/dlmm.js:2332-2335`); episode OOR sebelumnya yang sempat pulih (timestamp di-null-kan `state.js:531-535`) tidak dikurangkan → `range_efficiency` bias ke atas. [CONFIRMED]
4. **Klaim lama "evolveThresholds salah nama key" — SUDAH TIDAK BERLAKU.** Kode sekarang meng-evolve `minFeeActiveTvlRatio` & `minOrganic`, dua-duanya kunci flat yang sah di `user-config.json` (`lessons.js:415-477,487,495-496`); blok `maxVolatility` yang dulu mati sudah dihapus (dicatat di `CLAUDE.md` bagian Lessons System). [CONFIRMED — premis pertanyaan outdated]
5. **`darwinRecalcEvery` = config mati.** Didefinisikan (`config.js:280`), tampil di `/config` (`index.js:1589`), tapi pemicunya hard-coded `MIN_EVOLVE_POSITIONS=5` (`lessons.js:19,253`). Mengubahnya tidak berefek. [CONFIRMED]
6. **Dua pembaca performa tidak mode-scoped.** `getPerformanceSummary` (`lessons.js:844-869`) & `getPerformanceHistory` (`lessons.js:786-820`) membaca SEMUA record tanpa filter `paper` — `getPerformanceSummary` dipakai untuk blok Performance di prompt GENERAL (`agent.js:206`) dan `/status` (`index.js:2739,3225`). Hari ini aman (0 record paper), tapi begitu paper pernah dipakai lalu kembali live, ringkasan prompt & /status akan campur sim+live, padahal `/report`/briefing sudah bersih via `getModePerformance`. [CONFIRMED]
7. **Paper close tidak menyetempel `active_setup`/`profile`** (`tools/dlmm.js:1546-1577`, bandingkan jalur live `:2444-2445`) → eksperimen racikan via paper tidak bisa dibedah per-racikan. [CONFIRMED]
8. **Ambiguitas satuan `fee_active_tvl_ratio` di sim paper** (Bab F.3): `prompt.js:108` vs `paper-trading.js:104-107`. [INFERRED — perlu validasi empiris]
9. **`get_wallet_positions` hanya tersedia di peran GENERAL** — terdaftar di `tools/definitions.js:316` tapi tidak ada di `MANAGER_TOOLS`/`SCREENER_TOOLS` (`agent.js:7-8`). Sudah tercatat sebagai known issue di `CLAUDE.md`. [CONFIRMED]
10. **Doc–kode tidak sinkron soal mainzen_v3.** `NEXT-SESSION.md:4` & `:26` menyebut "presets/mainzen_v3.json" dan bahkan "Config ACTIVE = preset mainzen_v3" — di repo ini file itu tidak ada dan config aktif adalah `mainzen_v2` (`user-config.json:115`). File v3 ada di instalasi kembar. Pembaca dokumen bisa tersesat. [CONFIRMED]
11. **Minor:** `derivLesson` mendokumentasikan `bin_range` sebagai angka padahal kiriman aslinya objek (`lessons.js:134` vs `state.js:94`) — hanya memengaruhi teks lesson; `takeProfitFeePct` adalah alias diam-diam ke `takeProfitPct` (`tools/executor.js:364`). [CONFIRMED]

---

## BAB I — SAMPEL DATA NYATA

### 1 record posisi TERTUTUP (dari `lessons.json` `performance[]`, record live terbaru; alamat on-chain bersifat publik, tidak ada rahasia)

```json
{
  "position": "71iZNRrsee5GHaB3hqgitWyR5bHCf4A5WfSKFpaPtHgJ",
  "pool": "6Xm1ezt3Zc9rY58YPQAsZYBhFMApoARCAZGGaREtS4xk",
  "pool_name": "SPCX-SOL",
  "strategy": "bid_ask",
  "bin_range": { "min": -424, "max": -355, "bins_below": 69, "bins_above": 0 },
  "bin_step": 125,
  "volatility": 5.3671,
  "fee_tvl_ratio": 1.1266,
  "organic_score": 84,
  "amount_sol": 0.2,
  "deployed_at": "2026-06-12T13:31:01.446Z",
  "narrative_category": "meme",
  "active_setup": "mainzen_v2",
  "profile": "custom",
  "peak_pnl_pct": 0.06,  "trough_pnl_pct": -0.25,
  "price_peak_pct": 16.08, "price_trough_pct": -6.02,
  "fees_earned_usd": 0.0081,
  "final_value_usd": 13.3107,
  "initial_value_usd": 13.3044,
  "minutes_in_range": 10, "minutes_held": 10,
  "close_reason": "Rule 3: pumped far above range",
  "entry_mcap": 822530, "entry_tvl": 67760, "entry_volume": 16695, "entry_holders": 3031,
  "exit_mcap": 943247,  "exit_tvl": 70751,  "exit_volume": 13106,
  "pnl_usd": 0.01, "pnl_pct": 0.11, "range_efficiency": 100,
  "opened_at": "2026-06-12T13:31:01.446Z", "closed_at": "2026-06-12T13:41:54.709Z",
  "open_hour_wib": 20, "open_session": "malam"
}
```
*(field `signal_snapshot` & `shadow_signals` dipangkas demi ringkas; tidak ada field paper → record live. Perhatikan: tidak ada harga entry/exit eksplisit — sesuai temuan Bab G.)*

### 1 entry decision-log (`decision-log.json`, entri terakhir)

```json
{
  "id": "dec_1781223649885_r9oa19",
  "ts": "2026-06-12T00:20:49.885Z",
  "type": "deploy",
  "actor": "SCREENER",
  "pool": "J9qgZAYeycmj5Ct9KmC8RfQZZDVzGwf5VfRoN4KNjnME",
  "pool_name": "Magpie-SOL",
  "position": "HzK1PbB7uXJYrBYZDhsWdPUSQf2Gr82Pe9U4FkYhqNu6",
  "summary": "Deployed 0.2 SOL with bid_ask",
  "reason": "Chosen range -641→-572 around active bin -572",
  "risks": ["volatility 6.9526", "fee/TVL 0.5573%"],
  "metrics": { "amount_sol": 0.2, "strategy": "bid_ask", "active_bin": -572,
               "min_bin": -641, "max_bin": -572 },
  "rejected": []
}
```

Skala data saat ini: 114 record performa (0 paper), 100 entri decision-log, `state.json` ±251 KB, `pool-memory.json` ±373 KB.

---

## BAB J — PERTANYAAN TERBUKA (tidak bisa dipastikan dari kode saja)

> **Update 2026-06-12 sore: SEMUA pertanyaan di bab ini sudah dijawab empiris (runtime, log produksi, API live) — lihat Bab K.** Daftar asli dipertahankan sebagai konteks.

1. **Satuan sebenarnya `fee_active_tvl_ratio` dari feed Meteora** — komentar kode saling bertentangan (Bab F.3/H.8). → **TERJAWAB, Bab K.1**: bentuk persen; fee sim paper memang salah satuan ~100×.
2. **Apakah instance `/home/ubuntu/meridian-v3` sedang berjalan, dan dengan kode versi apa?** → **TERJAWAB, Bab K.2**: berjalan, tapi dari folder `/home/ubuntu/meridianzen2`, dan sudah LIVE.
3. **Seberapa akurat API closed-PnL Meteora** saat rug/settle lambat? → **TERJAWAB (window 10 hari), Bab K.3**: lapisan curiga hampir tak pernah kepakai — andal di praktik.
4. **Seberapa sering jalur fallback 0-palsu (H.2) benar-benar terpakai** → **TERJAWAB, Bab K.4**: 0 kali dalam window log.
5. **Relay LPAgent: seberapa sering close lewat relay vs lokal** → **TERJAWAB, Bab K.5**: relay zap-out gagal 114/114 — close 100% lokal.
6. **Cakupan gas-capture nyata** → **TERJAWAB, Bab K.6**: capture real jalan sejak 2026-06-07; sebelumnya estimasi `~`.
7. **Perilaku model LLM aktual (minimax) terhadap aturan prompt** → **TERJAWAB sebagian, Bab K.7**: text-dump tool call sering (114 event salvage / 10 hari), guard bekerja.

---

## BAB K — JAWABAN EMPIRIS PERTANYAAN TERBUKA (lanjutan, 2026-06-12 sore)

> Metode: bukan baca kode lagi — cek **runtime nyata** (pm2), **log produksi** (`logs/`, retensi 2026-06-03 s/d 2026-06-12, memuat 94 dari 114 close), **API Meteora live**, dan file data (`gas-log.json`, `lessons.json`). Tetap read-only: tidak ada kode/config yang diubah.

### K.1 Satuan `fee_active_tvl_ratio` = BENTUK PERSEN → fee sim paper kebesaran ~100× [CONFIRMED empiris]

Uji langsung ke feed yang sama yang dipakai bot (`pool-discovery-api.datapi.meteora.ag`, sumber di `tools/screening.js:11,211`): ambil 8 pool DLMM teratas, bandingkan `fee_active_tvl_ratio` feed vs hitungan sendiri `fee / active_tvl`:

| Pool | fee ($) | active_tvl ($) | ratio feed | fee/active_tvl × 100 |
|---|---|---|---|---|
| Fine-SOL | 2.770 | 11.429 | **24,2367** | **24,24** |
| GYM-SOL | 5.986 | 52.466 | **11,4092** | **11,41** |
| SPCX-SOL | 10.715 | 67.061 | **15,9861** | **15,98** |
| arc-USDC | 420 | 9.393 | **4,4725** | **4,47** |

Cocok persis di 8/8 pool: **feed = `fee/active_tvl × 100`, alias sudah dalam persen.** Jadi `prompt.js:108` ("0.29 = 0.29%") **BENAR**, dan tafsiran sim paper (`paper-trading.js:104-107`, memakai 0.19 sebagai pecahan 19%/hari) **SALAH ~100×**. Konsekuensi: fee simulasi paper akan hampir selalu menabrak plafon `deposit × 0.5` (rumus `paper-trading.js:103-114`) — pool ber-ratio 1,13 ("1,13%/hari") disimulasikan menghasilkan 113%/hari. **Vonis F.5 naik status: bias optimis fee bukan lagi risiko [INFERRED], tapi bug satuan [CONFIRMED]. Statistik PnL paper (kalau nanti dipakai) tidak bisa dipercaya sebelum ini dibetulkan.** Catatan tambahan: ratio feed juga per-`timeframe` window (bot screening pakai 30m), sedangkan sim menafsirkannya laju 24 jam — distorsi kedua yang lebih kecil.

### K.2 Instance kembar: pm2 `meridian-v3` BERJALAN — dari `/home/ubuntu/meridianzen2`, dan SUDAH LIVE [CONFIRMED]

- `pm2 jlist`: dua proses online — `meridian` (cwd `/home/ubuntu/meridianzen`, up sejak 2026-06-12T14:46Z) dan **`meridian-v3` (cwd `/home/ubuntu/meridianzen2`, up sejak 2026-06-12T05:46Z, restart 0)**.
- Folder `/home/ubuntu/meridian-v3` yang disebut Bab F.1/D.2 ternyata **salinan stale** (git head sama dengan meridianzen2: `d68f89b`) — yang dieksekusi adalah `meridianzen2`.
- Status `meridianzen2`: `.env` **`DRY_RUN=false`** (LIVE, bukan dry-run!), `WALLET_PRIVATE_KEY` **berbeda** dari instance utama (dibandingkan via hash, tidak dibaca nilainya), `activeSetup`/`preset` = **`mainzen_v3`** (spot, SL −12, TP 15, trailing—lihat preset, `deployAmountSol` 0.2, `maxPositions` 2).
- Versi kode: commit `d68f89b` ("racikan-borne promptNotes") **tidak ada di history repo ini** — lineage git-nya beda/belum di-sync dengan `meridianzen` (cocok dengan memori proyek "meridian-v3 belum di-sync", termasuk belum dapat merge PnL-RPC `fc63a43`).
- ⚠️ Dokumen `NEXT-SESSION.md:25` ("`DRY_RUN=true`") **sudah usang** — v3 kini trading sungguhan dengan dana wallet terpisah.

### K.3 Akurasi API closed-PnL Meteora: lapisan curiga hampir tak pernah kepakai [CONFIRMED, window 10 hari]

Di seluruh log retensi (94 close): `"Rejected unsettled closed PnL"` (lapisan reject −90%, `tools/dlmm.js:2369`) terpicu **1×**; `"may still be settling"` (posisi belum muncul di `status=closed`, retry 5 detik) **5×** — semuanya settle pada retry berikutnya. Praktiknya API closed Meteora **andal**; mekanisme retry 6× cukup. (Catatan: ini window normal tanpa rug ekstrem — perilaku saat rug masif tetap belum teruji.)

### K.4 Fallback 0-palsu (H.2): TIDAK PERNAH terpakai di window log [CONFIRMED]

`grep "Using cached pnl fallback" logs/` → **0 kejadian** dalam 10 hari / 94 close. Risiko H.2 nyata secara kode tapi **dorman** di praktik — prioritas perbaikannya boleh turun di bawah H.1 (skip rug) dan K.1 (satuan fee sim).

### K.5 Relay LPAgent: close TIDAK PERNAH sukses lewat relay — 114/114 gagal pre-submit, 100% close jalur lokal [CONFIRMED]

- `"Relay zap-out failed before submit; falling back to local close + Jupiter autoswap"` = **114 kejadian, sukses 0**. Alasan SELALU sama: *"Relay transaction contains direct SOL transfer from owner to <addr>"* — guard keamanan lokal (validasi tx relay di `tools/dlmm.js`) menolak setiap transaksi buatan relay karena menyisipkan transfer SOL langsung dari wallet (kemungkinan fee/tip platform).
- Jalur fetch posisi via relay juga rapuh: 265 abort → fallback LPAgent direct, plus 73 circuit-open dan 221 baris circuit-breaker.
- **Implikasi untuk penasihat:** `lpAgentRelayEnabled: true` saat ini hanya menghasilkan noise + latensi (coba-gagal-fallback di tiap close); eksekusi nyata 100% lokal — angka PnL TIDAK terpengaruh. Kandidat tindakan: matikan flag, atau selidiki kenapa tx relay selalu membawa transfer SOL (by design platform = berarti relay memang tak kompatibel dengan guard).

### K.6 Cakupan gas-capture: real sejak 2026-06-07 [CONFIRMED]

`gas-log.json` = 307 entri (2026-06-07 → 2026-06-12): deploy 93 / close 174 / swap 40; total tercatat 0,00982 SOL (didominasi swap 0,00807 — deploy/close hanya fee signature, rent posisi refundable tidak dihitung sebagai gas). Artinya: window 1D/7D di `pnl-tracker` kini pakai **gas real**; angka 30D/all-time masih campur estimasi `~` untuk trade sebelum 2026-06-07.

### K.7 Kepatuhan LLM (minimax): text-dump tool call SERING, tapi jaring pengaman bekerja [CONFIRMED jejak log]

Dalam 10 hari log: **114 event "Salvaged text-dumped tool call(s)"** (total **273 tool call** diselamatkan dari teks JSON yang di-dump minimax — mayoritas read-only seperti `get_top_candidates`, `get_pool_memory`), dan **8× guard `"Screener returned non-report content — overriding to NO DEPLOY"`** (output non-laporan dipaksa jadi keputusan aman). Baris `⛔ NO DEPLOY` lain (≈10/hari) adalah keputusan skrining normal, bukan guard. Kesimpulan: ketidakpatuhan format minimax itu **kronis tapi tertangani** oleh mekanisme salvage (memori proyek: fix `agent.js` commit `51dd020`); kepatuhan substansial terhadap aturan trading tetap hanya teraudit via `decision-log.json` per kasus.

### Tabel status H setelah Bab K

| Temuan H | Status baru |
|---|---|
| H.8 ambiguitas satuan fee sim | ⬆️ **[CONFIRMED] bug ~100×** (K.1) — temuan terpenting bab ini |
| H.2 fallback 0-palsu | ⬇️ dorman, 0 kejadian (K.4) |
| H.10 doc–kode mainzen_v3 | diperluas: instance jalan = `meridianzen2`, LIVE; NEXT-SESSION usang (K.2) |
| H.1 skip rug, H.3 minutes_in_range, H.5 darwinRecalcEvery, H.6 pembaca non-mode-scoped, H.7 paper stamp | tidak berubah (masih murni temuan kode) |

---
*Bab A–J: hasil baca kode per 2026-06-12 (pagi). Bab K: verifikasi empiris runtime/log/API per 2026-06-12 (sore). Tidak ada satu pun file kode/config yang diubah.*
