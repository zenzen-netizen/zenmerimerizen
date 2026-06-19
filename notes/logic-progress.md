# logic-progress — Satpam validasi `update_config` (skema menyeluruh)

> Checklist anti-limit. **Sesi baru: BACA file ini dulu**, lanjut dari ⬜ berikutnya.
> Lingkup: HANYA jalur TULIS-CONFIG (`update_config`). JANGAN sentuh eksekusi
> trade/screening, evolve/gasReserve auto-writer, prompt screener. Branch: `experimental`.
> Acuan: notes/update-config-paths.md §5 · notes/dev-crosscheck.md §4/§5 · notes/config-review.md.

## Status awal (temuan sesi 2026-06-15, sebelum kerja)
Sesi sebelumnya sudah landing sebagian (commit `bd1d0cc`, `afc5b44`):
- `bd1d0cc` — validasi inline `CONFIG_VALIDATORS` di executor.js, TAPI hanya ~10 key sensitif
  (model id + SL/TP/sizing/risk). BUKAN cakupan menyeluruh, tak ada file skema terpisah,
  tak ada enum `strategy`/`screeningSource`/dst, tak ada cek-tipe untuk ~155 key sisanya.
- `afc5b44` — Phase 2 (rambu model-id ke LLM di definitions.js) ✅ + buang `maxBundlePct`/
  `athFilterPct` dari **definitions.js** ✅. TAPI baris `delete userConfig.*` + strip dari
  **user-config.json** BELUM (kedua key masih live di user-config.json baris 41 & 48).
- `screeningModel` di user-config.json sudah benar (`minimax/minimax-m2.5`).
- CONFIG_MAP = **165 key** (terukur).

## FASE 1a — Skema per-key (config-schema.js)  ✅
- [x] Buat `config-schema.js`: entry untuk SETIAP 165 key CONFIG_MAP, per-tipe
      (model/enum/number[strict|light]/boolean/array/string), + `validateConfigValue(key,val)`.
- [x] Coverage check: jumlah key skema == 165 (== CONFIG_MAP). COMMIT.

## FASE 1b — Wiring validasi menyeluruh  ✅
- [x] executor.js `update_config`: ganti inline `CONFIG_VALIDATORS`/`modelIdError`/`numError`
      → `validateConfigValue(match[0], normalizedVal)` (import dari config-schema.js).
- [x] STRICT (hard reject): model id, numerik risk/sizing di luar batas, enum di luar daftar.
      LIGHT (cek-tipe): sisanya. nullable/"off" → izinkan. RAGU = IZINKAN. COMMIT.

## FASE 2 — Rambu format ke LLM (definitions.js)  ✅ (sudah di `afc5b44`)
- [x] Deskripsi Models sudah memuat `"provider/slug"` + contoh + "jangan slugify".

## FASE 3 — Strip key mati selaras dev  ✅
- [x] definitions.js: `maxBundlePct`/`athFilterPct` sudah dibuang (di `afc5b44`).
- [x] config.js: pulihkan `delete userConfig.maxBundlePct` + `delete userConfig.athFilterPct`
      (ala upstream setup.js:730-731), JANGAN sentuh `gmgnAthFilterPct`.
- [x] user-config.json: hapus 2 key orphan itu. COMMIT.

## FASE 4 — CLI REPL konfirmasi (opsional)  ✅
- [x] index.js:3366 — sadar-terima: REPL = operator lokal tepercaya; validasi skema tetap
      jalan (lewat executor yang sama). Tambah komentar; tidak wiring onConfirmRequired.

## Verifikasi akhir  ✅
- [x] screeningModel `minimax_m2_5`→DITOLAK; `minimax/minimax-m2.5`→diterima
- [x] positionSizePct 5→ditolak; 0.3→diterima
- [x] stopLossPct -15→DITERIMA (negatif sah)
- [x] gmgnMinRsi off→DITERIMA (nullable)
- [x] strategy ngawur→ditolak; bid_ask→diterima
- [x] jumlah key skema == 165 == CONFIG_MAP
- [x] maxBundlePct/athFilterPct hilang dari user-config.json+definitions.js; gmgnAthFilterPct aman
- [x] log start bersih (config.js load OK)
