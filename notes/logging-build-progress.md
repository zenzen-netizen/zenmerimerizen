# LOGGING-UPGRADE — BUILD PROGRESS (stamp konsentrasi/umur ke signal_snapshot)

> Lanjutan `notes/logging-recon.md`. Branch `experimental`. ADDITIVE-only (nol call baru, nol ubah
> recordPerformance/screening/filter/sizing). Bukti = `file:line`. Sesi baru → BACA dulu.
> Tujuan: NGUMPULIN data buat rug-bedah berikut — BELUM ngubah screening/threshold (keputusan terpisah).

## Field di-stamp (recon Q4)
- **WAJIB:** `entry_top10_pct` (`ti.audit.top_holders_pct`), `entry_bot_pct` (`ti.audit.bot_holders_pct`),
  `entry_age_hours` (`pool.token_age_hours`).
- **BONUS** (lolos cek: TIDAK hard-filtered konstan — cuma `excludeHighSupplyConcentration` yg pakai
  field pool LAIN, bukan audit; jadi audit booleans bervariasi + rug-relevan):
  `entry_mint_disabled`, `entry_freeze_disabled`, `entry_dev_migrations` (`ti.audit.*`).
- **SKIP:** bundler% (perlu getTokenHolders berat), momentum/label.

---

## ✅ FASE 1 — STAMP (3 titik, nama konsisten)
Commit: `feat(gap-fix): phase-1 stamp concentration/age signals into snapshot`

1. **`index.js` stageSignals object** (dalam `if (config.darwin?.enabled)`, setelah `volatility`):
   tambah 6 key, semua `?? null` (aman kalau `ti`/`audit` undefined). Data SUDAH di scope di
   call-site (`ti` dari getTokenInfo `index.js:790`, `pool.token_age_hours` dari screening). Nol call baru.
2. **`tools/dlmm.js` `PERFORMANCE_SIGNAL_FIELDS`**: tambah 6 nama.
3. **`lessons.js` `PERFORMANCE_SIGNAL_FIELDS`**: tambah 6 nama.

Catatan alur: jalur UTAMA = staged object di-spread langsung ke snapshot di
`resolvePerformanceSignalSnapshot` (`dlmm.js` `{ ...(staged||{}), ... }`) + `buildSignalSnapshot`
(`lessons.js`). Jadi staging SAJA sudah cukup bawa field. Penambahan ke `PERFORMANCE_SIGNAL_FIELDS`
= fallback belt-and-suspenders (no-op buat field staged; aktif kalau kelak ada jalur top-level prop).

## ✅ FASE 2 — VERIFIKASI
- `node --check` index.js / dlmm.js / lessons.js → **✅ semua PASS**.
- Konsistensi nama: tiap field muncul **tepat 3×** (staged + 2 array). ✅
- Diff scope: **+24 insertions / 0 deletions, 3 file saja** → murni additive; `recordPerformance`
  TAK tersentuh (cuma spread snapshot). ✅
- Trace runtime: `stageSignals(...)` → `getAndClearStagedSignals(...)` retrieve 6 field utuh →
  spread `{...staged}` masuk snapshot. ✅ (test ad-hoc, fields kebawa).
- git branch = `experimental`; pm2 id0 cwd = `/home/ubuntu/meridianzen` (dicek FASE sebelumnya).

⏳ **PENDING (owner): `pm2 restart 0 --update-env`** biar kode aktif.
⭐ **TES NYATA = deploy autonomous BERIKUTNYA** → cek record di `lessons.json` punya
   `entry_top10_pct`/`entry_bot_pct`/`entry_age_hours` ber-NILAI (bukan null) di `signal_snapshot`.

## CAVEAT (dicatat, bukan bug)
- Staging cuma cover jalur **SCREENER→deploy** (key per-pool, TTL 10m, `signal-tracker.js`) dan
  hanya jalan saat **`darwin.enabled`** (skrg ON). Deploy manual via chat / darwin off → tak ter-stamp.
  OK — fokus trade autonomous. Opsi robust (kalau perlu nanti): keluarin staging dari gate darwin
  (pola shadow-log `index.js:887`).
- `entry_mint_disabled`/`freeze_disabled` mungkin near-konstan (mostly true) di praktik — tetap di-stamp
  (free + rug-relevan); kalau ternyata konstan, analisis nanti yg buang.
- Field string (`top_holders_pct`/`bot_holders_pct` = `.toFixed(2)` string dari token.js) — analisis
  nanti parseFloat. Bukan blocker.

## STATUS: FASE 1-2 selesai (kode + verifikasi + commit). Tinggal restart pm2 (owner) + cek deploy berikut.

---

## ✅ RE-VERIFIKASI sesi 2026-06-20 (bukti file:line)
Kode SUDAH landed di commit `9facff5` (index.js +9 / lessons.js +7 / tools/dlmm.js +8 / notes +54;
`recordPerformance` TAK tersentuh — diff cuma array di lessons.js).
- `node --check` index.js / dlmm.js / lessons.js → semua PASS.
- Konsistensi nama: tiap dari 6 field muncul **tepat 3×** (1 per file). ✅
- Trace utuh dikonfirmasi: `stageSignals(...)` (index.js, dalam `if config.darwin?.enabled`, darwin ON)
  → `getAndClearStagedSignals(pool_address, baseMint)` **saat DEPLOY** (`tools/dlmm.js:973-974`)
  → diteruskan sbg `signal_snapshot` ke `trackPosition()` → tersimpan di tracked record (state.json)
  → saat CLOSE: `resolvePerformanceSignalSnapshot` (`tools/dlmm.js:1352`) `{...staged, ...tracked.signal_snapshot}`
  → `recordPerformance` spread apa-adanya ke lessons.json. Field baru kebawa. ✅

### ⚠️ TEMUAN PENTING: proses pm2 yang JALAN masih kode LAMA (restart blm dilakukan)
- pm2 id0 `meridian` ONLINE, cwd `/home/ubuntu/meridianzen` ✅, tapi **start 2026-06-19 16:48:03 +0800**
  (08:48:03 UTC), sedangkan **commit 2026-06-19 17:21:37 +0800** → proses start **33 menit SEBELUM**
  kode landed. pm2 = run kode yg ke-load saat start (bukan hot-reload) → **proses jalan kode lama tanpa stamp.**
- Bukti empiris: 3 record terakhir lessons.json (n=113) — termasuk yg deployed `2026-06-19T17:10:26Z`
  (= 01:10 +0800, SUDAH lewat commit) — snapshot-nya **NOL** dari 6 field baru (cuma 12 key lama).
  Persis gejala stale-code. → kode benar, tapi INERT sampai restart.

⏳ **MASIH PENDING (owner): `pm2 restart 0 --update-env`** — wajib biar stamp aktif.
⭐ Setelah restart: deploy autonomous BERIKUTNYA → cek record baru di lessons.json punya
   `entry_top10_pct`/`entry_bot_pct`/`entry_age_hours` ber-NILAI (bukan null). Belum bisa dites
   sebelum restart (proses lama gak akan pernah nge-stamp).
