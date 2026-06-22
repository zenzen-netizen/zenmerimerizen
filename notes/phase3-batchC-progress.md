# PHASE 3 BATCH C — PROGRESS

Bot MAIN (`pm2 id 0` = meridian, branch `experimental`, LOCAL = sumber kebenaran). Display-only,
restart owner-only.

> ⚠️ **Catatan keadaan:** Sesi ini HANYA menjalankan **FASE 5 (TAMBAHAN)** — notifyClose both-units
> ($+◎). Batch C FASE 0–4 **belum ada** di repo saat sesi ini jalan (tak ada `phase3-batchC-progress.md`
> sebelumnya, tak ada commit Batch C; HEAD = `1a0cd5e` = Batch B #9). FASE 5 **independen** dari Batch C
> 0–4 — ia nyambung ke Batch B (notifyClose→renderClose, sudah landed & commit). Restart owner-only →
> tak ada risiko double-restart dari sisi Claude. Owner: urutkan restart sesuai rencana.

---

## FASE 5.1 — Recon (READ-ONLY) — SELESAI

**Pertanyaan: ada harga SOL ter-cache/global yang kejangkau dari layer notif tanpa import money-logic/executor?**

- **TAK ADA cached/global SOL price.** Grep `lastSolPrice|_solPrice|cachedSolPrice|priceCache|...` → kosong.
  `/status` & `/wallet` ambil `solPrice` dari `getWalletBalances()` (tools/wallet.js, field `sol_price`) —
  fetch async tiap panggil (index.js:3574,3613; viewmodel `vm.solPrice`). Bukan cache.
- **Close `result` (caller executor.js:802) cuma bawa SATU unit mode-correct.** Field ada: `pnl_usd`,
  `recorded_pnl_usd`/`recorded_pnl_pct`, `fees_earned_usd`, `pnl_pct`, `peak_pnl_pct`, `pool_name`,
  `close_reason`, `derived_lesson` (dlmm.js:2356-2375 & 2660-2677). **TAK ADA** `sol_price`/`pnl_sol`/`fees_sol`/
  pasangan SOL↔USD. USD-mode: semua USD; SOL-mode: `pnl_usd`/`fees_earned_usd` bawa nilai SOL, `recorded_pnl_usd`=null.
  ⇒ engine **tak menghitung** unit-kedua di mana pun.
- **Sumber harga read-only & bebas side-effect:** `getSolMarketRegime()` (wallet.js:196) → `{ usdPrice, change24hPct,
  liquidity }`, pure Jupiter price fetch, **nol side-effect** (beda dari `getWalletBalances()` yang manggil
  `recordSolBalance()`). Ini sumber harga JALUR A.
- **Cycle-safe:** wallet.js import {bs58, logger, config, gas-tracker, sol-tracker} — tak ada yang import
  telegram.js; config.js tak import telegram.js. Jadi telegram.js boleh akses wallet.js tanpa cycle. Tetap
  pakai **dynamic import** di dalam `notifyClose` biar static-graph telegram.js tetap ringan (konvensi file:
  telegram.js sengaja baca user-config.json via fs, hindari import config.js).

**JALUR DIPILIH: A (display-only).**
- JALUR B (aditif executor.js) **DITOLAK**: precondition brief ("nilai SOL $-pasangan sudah dihitung &
  tinggal dilempar") GAGAL — engine tak hitung unit-kedua. Brief: "kalau belum ada → STOP, jangan hitung
  di engine". Maka executor.js TAK disentuh.
- JALUR A: harga SOL kejangkau bersih dari layer notif via `getSolMarketRegime()` (read-only, no side-effect,
  cycle-safe). executor.js/money-logic/trade-logic NOL ubah.

## FASE 5.2A — JALUR A (display-only) — SELESAI
- `views/format.js`: TAMBAH `fmtBothSigned(usd, sol, solMode)` — mirror `fmtMoneySigned` (sign-before-symbol)
  + `≈` di unit turunan (kedua mode). `fmtBoth` lama (unsigned) TAK disentuh (0 caller). Alasan: PnL bertanda;
  fmtBoth render `$-1.10` (salah), butuh `-$1.10`.
- `views/notifs.js` `renderClose`: terima `d.solPrice`. `m(v)`: kalau harga valid (>0 finite) → both-units via
  `fmtBothSigned` (mode off: ◎=$/px; mode on: $=◎×px); kalau tidak → **fall back** `fmtMoneySigned` (1-unit
  mode-correct, byte-identik Batch B — governing #3). Dipakai 3 baris uang: Net PnL, Fee panen, Efek-harga.
  **Gas TIDAK** (sudah ◎/SOL apa adanya).
- `telegram.js` `notifyClose`: dynamic-import `getSolMarketRegime` → `solPrice = regime?.usdPrice || null`,
  fail-open (catch → null), diteruskan ke `renderClose`. Guard/trigger/logic TAK diubah.
- `node --check` ketiga file: OK.
- Commit: `feat(views): notifyClose both-units via harga SOL read-only (≈, display-only)`.

## FASE 5.3 — Smoke-test 2 mode — SELESAI (LULUS)
Render-test `renderClose` (harga contoh SOL @ $150), angka dicek manual — semua benar, field-map tak ketuker:
- **USD mode (MAIN)** win: `📊 Net PnL: +$0.14 (≈◎0.0009) (+1.50%)` · `💎 Fee panen +$0.02 (≈◎0.0001) · 📈 Efek-harga +$0.12 (≈◎0.0008)`. (0.14/150=0.0009 ✓)
- **USD mode** loss: `-$1.10 (≈◎0.0073)` · efek `-$1.15 (≈◎0.0077)`. (1.10/150=0.00733 ✓) — sign-before-`$`, `≈` di ◎ turunan.
- **USD mode harga hilang (px=0)** → fallback `-$1.10` **byte-identik Batch B** (1-unit) ✓.
- **SOL mode** win: `+◎0.0042 (≈$0.63)` · fee `$0.12` · efek `$0.51`. (0.0042×150=0.63 ✓) — `≈` di `$` turunan.
- **SOL mode** loss: `-◎0.0073 (≈$1.09)` · efek `-◎0.0076 (≈$1.14)`.
- **SOL mode harga hilang (null)** → fallback `-◎0.0073` (1-unit) ✓.
- Gas baris TAK diubah (◎/SOL apa adanya). Win/loss 🟢/🔴 dipertahankan. `node --check` ketiga file OK.

## VERIFIKASI AKHIR
- branch `experimental`. Diff JALUR A: `views/format.js` (+fmtBothSigned, fmtBoth utuh) · `views/notifs.js`
  (renderClose pakai solPrice+fmtBothSigned, fallback) · `telegram.js` (wrapper fetch harga read-only) +
  `notes/`. **executor.js / money-logic / trade-logic NOL ubah.**
- **Restart owner-only** (Claude TIDAK restart). Konfirmasi end-to-end nyata = pas close beneran berikutnya
  (cek notifyClose nampilin $+◎). MAIN = USD mode → primary `$`, sekunder `≈◎`.
</content>
