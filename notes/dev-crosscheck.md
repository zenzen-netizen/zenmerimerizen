# DEV CROSS-CHECK — item MATI/MENCURIGAKAN vs kode DEV ASLI (upstream)

> Disusun: 2026-06-14 · Mode: **BACA-SAJA** (tak ada kode/config diubah; cuma file laporan ini ditulis).
> Tujuan: tiap item dari `notes/config-review.md`, tentukan apakah matinya **DIWARISI dari dev**
> (mungkin sengaja) atau **akibat ubahan zen** (regresi) — agar bisa diputuskan: biarkan+tandai / perbaiki / buang.
> Sumber dev: `git clone --depth 200 https://github.com/yunus-0x/meridian` → `/tmp/meridian-upstream`
> (upstream @ `600aac6`, sezaman dengan repo zen @ `9c626eb` — keduanya seri pnl-heartbeat).
> Label verdict: **DIWARISI-MATI** (mati di dev juga) · **REGRESI-ZEN** (hidup/bersih di dev, rusak/kotor di zen) ·
> **BARU-ZEN** (zen menambah permukaan/value yang tak ada di dev) · **SAMA-DENGAN-DEV** (perilaku identik).
> Istilah: *consumer* = kode yang membaca setelan · *advertise* = key disebut di `definitions.js` (dilihat LLM) ·
> *CONFIG_MAP* = daftar key yang boleh di-`/setcfg`.

---

## RINGKASAN EKSEKUTIF

| # | item | verdict | inti bukti dua-sisi | rekomendasi |
|---|---|---|---|---|
| 1 | `healthCheckIntervalMin` | **DIWARISI-MATI** | cron health **di-hardcode `0 * * * *`** di KEDUA repo (zen index.js:1087 = upstream index.js:717); key dibaca ke config tapi tak dipakai bikin cron, di dev juga | biarkan+tandai (atau wire kecil) |
| 2 | `minSolToOpen` | **DIWARISI-MATI** | **tak ada consumer gerbang** di KEDUA repo (config.js + CONFIG_MAP + setup saja); dev malah cuma menampilkannya di ringkasan setup | perbaiki = fitur BARU (dev pun tak pernah pasang), bukan restorasi |
| 3 | `darwinRecalcEvery` | **DIWARISI-MATI** | pemicu nyata konstanta `MIN_EVOLVE_POSITIONS=5` di KEDUA repo; `config.darwin.recalcEvery` **tak pernah dibaca** di mana pun (dev juga) | buang / biarkan+tandai |
| 4 | `maxBundlePct` | **REGRESI-ZEN** 🔴 | dev **AKTIF MENGHAPUS**-nya (`delete userConfig.maxBundlePct`, setup.js:730) & **tak meng-advertise**; zen kehilangan baris hapus itu + **masih advertise ke LLM** (definitions.js:400) & tampil di /config | **buang** (selaras dev) |
| 5 | `athFilterPct` (screening) | **REGRESI-ZEN** 🔴 | sama persis pola #4: dev `delete userConfig.athFilterPct` (setup.js:731) & advertise bersih; zen masih advertise + tampil. Sisi gmgn (`gmgnAthFilterPct`) sehat di kedua repo | **buang** sisi screening, simpan `gmgnAthFilterPct` |
| 6 | `screeningModel` | kode **SAMA-DENGAN-DEV**; value **BARU-ZEN** | default id **identik** kedua repo: `openrouter/hunter-alpha` (format sah = `provider/slug`). Value rusak `minimax_m2_5` cuma ada di **user-config.json zen** (file, bukan kode dev) | **perbaiki value** → `minimax/minimax-m2.5` |
| 7 | Darwin + `evolveThresholds` | **SAMA-DENGAN-DEV** | KEDUA repo: evolve **menulis-balik** `user-config.json` (`writeFileSync`) tiap **5 close** & Darwin `enabled` default **true**. Auto-overwrite = bawaan dev, bukan ubahan zen | biarkan (sadari saja saat tuning manual) |

**Kesimpulan besar:** dari 5 "MATI/MENCURIGAKAN" yang dicek — **3 diwarisi dari dev** (#1, #2, #3: dev pun tak
pernah menyambungkannya), **2 regresi zen** (#4, #5: dev sudah membersihkannya, zen malah masih mengiklankannya
ke LLM). Auto-tune yang menulis-balik config (#7) **memang desain dev**, bukan ulah zen. Model rusak (#6) murni
salah-ketik di **file config zen**, bukan kode.

---

## DETAIL PER ITEM

### 1. `healthCheckIntervalMin` — **DIWARISI-MATI**

**Niat key:** "tiap berapa menit jalankan health-check portofolio".
**Kenyataan:** cron health-check **di-hardcode** `"0 * * * *"` (tiap jam) — key-nya tak dipakai untuk membangun jadwal.

**Bukti ZEN:**
- dibaca ke config: `config.js:256` → `healthCheckIntervalMin: u.healthCheckIntervalMin ?? 60`
- cron hardcode: `index.js:1087` → `cron.schedule(\`0 * * * *\`, …)` (health task)
- ada di CONFIG_MAP: `executor.js:384` · tampil di /config: `index.js:1562` · advertise ke LLM: `definitions.js:404` · wizard: `setup.js:355`

**Bukti UPSTREAM (dev):**
- dibaca ke config: `config.js:145` (baris **identik**)
- cron hardcode: `index.js:717` → `cron.schedule(\`0 * * * *\`, …)` (**sama persis**)
- di CONFIG_MAP: `executor.js:405` · **TIDAK** di-advertise (definitions.js screening/schedule list dev jauh lebih pendek, tak menyebutnya)

**Analisa awam:** ini seperti tombol "atur jam alarm" yang dipajang di dasbor, padahal alarmnya dipatok jam bulat
oleh pabrik. Di kode dev pun tombol itu tak nyambung — jadi matinya **warisan**, bukan dirusak zen. Bedanya: zen
memajang tombolnya lebih banyak (di /config + diberitahukan ke AI), dev memajang lebih sedikit.

**Rekomendasi:** **biarkan + tandai** (warisan, tak berbahaya). Kalau mau rapi: wire kecil — ganti
`\`0 * * * *\`` jadi pakai `c.schedule.healthCheckIntervalMin` (mis. `\`*/${n} * * * *\``). Itu jadi perbaikan,
bukan koreksi regresi.

---

### 2. `minSolToOpen` — **DIWARISI-MATI** (owner ingin menghidupkan)

**Niat key:** "saldo SOL minimum sebelum boleh buka posisi baru".
**Kenyataan:** **tak ada satu pun consumer** yang memakainya sebagai gerbang — di KEDUA repo. Gerbang saldo nyata
saat deploy = `amount_y + gasReserve` (runSafetyChecks).

**Bukti ZEN:**
- dibaca ke config: `config.js:221` · CONFIG_MAP: `executor.js:370` · display: `index.js:1530` · wizard: `setup.js:239`
- consumer gerbang: **TIDAK ADA** (grep executor/dlmm/index = kosong selain CONFIG_MAP/display)

**Bukti UPSTREAM (dev):**
- dibaca ke config: `config.js:120` (identik) · CONFIG_MAP: `executor.js:394`
- dev malah **menghitung & menampilkannya** di wizard: `setup.js:292-294` (`deployAmountSol + 0.05`) dan ringkasan
  `setup.js:750` ("Min balance: … SOL to open new position")
- consumer gerbang: **TETAP TIDAK ADA** (grep index/executor/dlmm upstream = kosong)

**Analisa awam:** dev bahkan repot menghitung nilai default & menampilkannya ("min balance untuk buka posisi"),
tapi lupa/belum memasang gerbangnya — jadi ini "fitur yang dijanjikan tapi tak pernah dipasang", **diwarisi**.
Bukan zen yang melepasnya.

**Rekomendasi (penting buat owner):** kalau ingin **menghidupkan** ini, sadari itu = **fitur BARU**, bukan
memulihkan sesuatu yang pernah jalan (dev pun tak pernah pasang). Tempat wiring paling pas: di awal jalur deploy /
screening (cek `walletSol >= minSolToOpen` sebelum lanjut). Risiko rendah, tapi tetap kode baru → perlu uji.

---

### 3. `darwinRecalcEvery` — **DIWARISI-MATI**

**Niat key:** "hitung ulang bobot sinyal Darwin tiap N close".
**Kenyataan:** pemicu nyata = **konstanta** `MIN_EVOLVE_POSITIONS = 5`; `config.darwin.recalcEvery` di-set tapi
**tak pernah dibaca** — di KEDUA repo.

**Bukti ZEN:**
- di-set: `config.js:280` → `recalcEvery: u.darwinRecalcEvery ?? 5`
- pemicu nyata konstanta: `lessons.js:19` (`MIN_EVOLVE_POSITIONS = 5`) dipakai `lessons.js:253`
- pembacaan `.recalcEvery`: **NOL** (grep kosong selain set+display+wizard)

**Bukti UPSTREAM (dev):**
- di-set: `config.js:162` (baris **identik**)
- pemicu nyata konstanta: `lessons.js:17` dipakai `lessons.js:188`
- pembacaan `.recalcEvery`: **NOL** (grep `\.recalcEvery` upstream = kosong)

**Analisa awam:** angka "5"-nya dipatok mati di kode; setelan `darwinRecalcEvery` cuma hiasan — sama di dev.
**Warisan**, bukan regresi.

**Rekomendasi:** **buang** dari display/setup (atau wire: ganti konstanta jadi `config.darwin.recalcEvery ?? 5`).
Karena dev pun membiarkannya mati, "biarkan+tandai" juga sah.

---

### 4. `maxBundlePct` — **REGRESI-ZEN** 🔴 (kandidat buang prioritas)

**Niat key:** "ambang % bundler" (dulu diiklankan ke LLM sebagai gerbang anti-bundle).
**Kenyataan:** orphan — `config.js` screening **tak punya** field ini, jadi `c.screening.maxBundlePct` = `undefined`.
Gerbang bundler nyata = `maxBotHoldersPct` / `gmgnMaxBundlerRate`.

**Bukti DEV (upstream) — sudah DIBERSIHKAN:**
- `setup.js:730` → **`delete userConfig.maxBundlePct;`** (dev sengaja MENGHAPUS key ini dari config user saat setup)
- **TIDAK** di config.js, **TIDAK** di-advertise (definitions.js:388 list dev pendek & bersih, tanpa maxBundlePct)
- Commit penghapus: `78c0934` (2026-06-07) — *"feat: entry/exit learning, HiveMind market push, OKX removal, setup overhaul"*

**Bukti ZEN — masih MENGIKLANKAN orphan:**
- live di `user-config.json:41` (=30) — masih tersimpan (baris `delete` dev hilang)
- **advertise ke LLM**: `definitions.js:400` (masuk daftar Screening yang dibaca model) ⚠️
- tampil di /config: `index.js:1609` (membaca `undefined`) · dikelompokkan: `config-origin.js:104`
- `setup.js` zen: **tak ada** baris `delete userConfig` sama sekali

**Akar regresi:** commit dev `78c0934` itulah yang zen merge jadi `fdc0c45` (lihat memory *upstream-merge-2026-06-09*,
"5 konflik resolved"). Saat resolusi konflik, **4 baris `delete userConfig.*` ikut hilang** (lihat juga #5). Jadi
zen menelan "setup overhaul" tapi **kehilangan bagian bersih-bersihnya**, lalu tetap mengiklankan key mati ke LLM.

**Analisa awam:** dev sudah membuang "tombol palsu" ini ke tempat sampah; zen tak ikut membuang **dan** masih
menyebut-nyebutnya ke si AI seolah gerbang sungguhan — padahal tak ngapa-ngapain. Inilah yang paling layak
dibereskan karena **menyesatkan LLM**.

**Rekomendasi:** **buang** — hapus dari `definitions.js` (jangan iklankan ke LLM) + dari display /config; idealnya
pulihkan baris `delete userConfig.maxBundlePct` ala dev (atau strip dari user-config.json).

---

### 5. `athFilterPct` (sisi screening) — **REGRESI-ZEN** 🔴

**Niat key:** "filter jarak dari ATH" pada level screening top.
**Kenyataan:** orphan di level screening — `config.js` screening tak punya field ini. Yang **hidup & benar** adalah
sisi GMGN: `config.gmgn.athFilterPct` (baca key `gmgnAthFilterPct`), dipakai `gmgn.js:211`.

**Bukti DEV (upstream) — sudah DIBERSIHKAN:**
- `setup.js:731` → **`delete userConfig.athFilterPct;`** (dev menghapus key screening-top yang yatim)
- screening definitions.js dev (`:388`) **tak** menyebut athFilterPct
- sisi gmgn: sehat (config.js gmgn-only, sama seperti zen)

**Bukti ZEN — masih MENGIKLANKAN orphan:**
- tampil di /config sebagai screening: `index.js:1608` (membaca `undefined`)
- **advertise ke LLM**: `definitions.js:400` (di daftar Screening) ⚠️
- dikelompokkan: `config-origin.js:104`
- sisi gmgn zen sehat: `config.js:185`, `gmgn.js:211`, `gmgnAthFilterPct` di CONFIG_MAP `executor.js:438`

**Akar regresi:** sama dengan #4 — baris `delete userConfig.athFilterPct` dev hilang saat resolusi merge `fdc0c45`.

**Analisa awam:** ada DUA "athFilterPct": yang gmgn (asli, jalan) dan yang screening-top (yatim, dibuang dev). Zen
masih memajang yang yatim & memberitahukannya ke AI. Cukup buang yang yatim; yang gmgn **jangan disentuh**.

**Rekomendasi:** **buang** sisi screening (dari `definitions.js` advertise + display /config); **simpan**
`gmgnAthFilterPct`/`gmgn.athFilterPct`.

---

### 6. `screeningModel` — kode **SAMA-DENGAN-DEV**, value **BARU-ZEN**

**Pertanyaan:** format/nilai default id model di upstream seperti apa (acuan format sah)?

**Bukti DEV (upstream):** `config.js:154` →
`screeningModel: u.screeningModel ?? process.env.LLM_MODEL ?? "openrouter/hunter-alpha"`
**Bukti ZEN:** `config.js:272` → baris **identik** (`"openrouter/hunter-alpha"`).
(managementModel & generalModel juga identik: `"openrouter/healer-alpha"` di kedua repo.)

**Acuan format sah:** **`provider/slug`** — contoh dev: `openrouter/hunter-alpha`, `openrouter/healer-alpha`.
Format racikan yang benar untuk minimax: `minimax/minimax-m2.5` (cocok pola, & sama dengan `managementModel` zen).

**Value rusak:** `screeningModel = "minimax_m2_5"` (underscore, tanpa provider) **hanya ada di
`user-config.json` zen** — **bukan** di kode dev mana pun. Jadi ini salah-ketik/garble di **file config zen**
(kemungkinan via `update_config` LLM atau edit manual), bukan warisan kode.

> Catatan: memory & dossier mencatat ini **sudah di-fix** ke `minimax/minimax-m2.5` (live, tinggal pm2 restart).
> Cross-check ini cuma mengonfirmasi: **kode dev tidak bersalah**; format sah = `provider/slug`.

**Rekomendasi:** **perbaiki value** di user-config.json → `minimax/minimax-m2.5` (kalau belum ke-apply via restart).
Tak ada perubahan kode yang diperlukan.

---

### 7. Darwin (`darwinEnabled`) + `evolveThresholds` — **SAMA-DENGAN-DEV**

**Pertanyaan:** apakah upstream juga MENULIS-BALIK ke config & jalan tiap N close yang sama (mastiin auto-tune =
bawaan dev, bukan ubahan zen)?

**`evolveThresholds` menulis-balik user-config.json — KEDUA repo YA:**
- ZEN: `lessons.js:491` → `fs.writeFileSync(USER_CONFIG_PATH, …)`, evolve `minFeeActiveTvlRatio` + `minOrganic`,
  stempel `_lastEvolved` (`:488`)
- UPSTREAM: `lessons.js:422` → `fs.writeFileSync(USER_CONFIG_PATH, …)`, evolve dua key sama, stempel `_lastEvolved`
  (`:419`) — **mekanisme identik**

**Pemicu tiap N close — KEDUA repo = 5:**
- ZEN: `lessons.js:253` → `livePerf.length % MIN_EVOLVE_POSITIONS === 0` (MIN_EVOLVE_POSITIONS=5)
- UPSTREAM: `lessons.js:188` → `data.performance.length % MIN_EVOLVE_POSITIONS === 0` (=5)
- **Beda kecil (perbaikan zen, bukan regresi):** zen memfilter `livePerf` (buang record `paper:true`) supaya data
  simulasi tak mencemari evolve live; upstream pakai `data.performance` mentah (dev belum punya isolasi paper).
  Ini **pengaman tambahan zen**, perilaku live tetap sama.

**Darwin recalculateWeights — KEDUA repo:**
- dipicu di tempat sama (blok % 5), digerbang `config.darwin?.enabled` — ZEN `lessons.js:262`, UPSTREAM `lessons.js:198`
- default `darwinEnabled` = **true** di kedua: ZEN `config.js:278`, UPSTREAM `config.js:160`
- menulis ke `signal-weights.json` saja (bukan user-config.json) — aman di kedua repo

**Analisa awam:** "robot yang menyetel ulang setelannya sendiri tiap 5 trade" itu **memang rancangan dev** —
zen tidak menambah atau mengubah perilaku auto-overwrite ini. Yang zen tambah cuma sekat agar data latihan
(paper) tak ikut menggeser setelan asli. Jadi kalau owner mau "kunci" tuning manual, ini **PR lama dari dev**,
bukan sesuatu yang zen ciptakan.

**Rekomendasi:** **biarkan** (perilaku bawaan dev). Catatan untuk owner: kalau mau pin `minFeeActiveTvlRatio`/
`minOrganic` manual, sadari tiap 5 close-live bisa menaikkannya (lihat config-review §2.3); belum ada toggle
mematikan evolve selain menjaga data < 5.

---

## CATATAN PENUTUP

- **Pola jelas:** item yang **diwarisi-mati** (#1, #2, #3) = dev sendiri tak pernah menyambungkannya → aman
  dibiarkan+tandai atau dirapikan tanpa takut "merusak niat dev".
- **Dua regresi sejati (#4, #5)** berasal dari **satu sebab**: saat merge `fdc0c45` (commit dev `78c0934`),
  blok `delete userConfig.{emergencyPriceDropPct, takeProfitFeePct, maxBundlePct, athFilterPct}` (upstream
  setup.js:728-731) **hilang dari resolusi konflik**. Konsekuensi paling merugikan: `maxBundlePct` & `athFilterPct`
  screening **masih diiklankan ke LLM** padahal mati → menyesatkan model.
  - *Cek lanjut (opsional):* `emergencyPriceDropPct` & `takeProfitFeePct` juga dihapus dev (setup.js:728-729);
    di zen keduanya jadi alias/fallback legacy (config-review §1L/§3A #6) — jinak, tapi sumbernya sama (delete hilang).
- **#6** menegaskan kode dev bersih; bug murni di **file config zen**.
- **#7** menegaskan auto-overwrite config = **fitur dev**, jadi diskusi "v2.1 kunci tuning manual" adalah soal
  desain warisan, bukan menambal ulah zen.

> **Verdict satu kalimat:** dari 7 item — 3 mati warisan (biarkan/rapikan), 2 regresi-zen dari merge yang menelan
> cleanup dev (**buang** `maxBundlePct` + `athFilterPct`-screening, terutama dari iklan LLM), 1 salah-value di file
> config (**perbaiki** `screeningModel`), dan 1 auto-tune yang memang bawaan dev (**biarkan**, cuma disadari).
