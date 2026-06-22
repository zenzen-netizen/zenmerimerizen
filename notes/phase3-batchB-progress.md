# PHASE 3 BATCH B — PROGRESS

Workstream 🅴 — Batch B (notif live). Bot MAIN (`pm2 id 0` = meridian, branch `experimental`).
Display-only, restart owner-only. Render notif → `views/notifs.js`; `telegram.js` jadi wrapper tipis.

- [x] 0  tuntasin 2dp fmtCur ($ branch) + literal Saldo wallet.js + re-verify msg ter-migrasi ✅
- [ ] 1  recon EXACT notifyDeploy/OOR/Swap/Close (telegram.js) — semua field + baseline
- [ ] 2  notifyDeploy → views/notifs.js renderDeploy (tree, SEMUA field)
- [ ] 3  notifyOutOfRange + notifySwap → renderOOR + renderSwap (tree)
- [ ] 4  notifyClose → renderClose (tree + fmtBoth $+◎, SEMUA field)

## Temuan kritis (pra-eksekusi, ngaruh ke FASE 4)
- **solMode MAIN = undefined → USD mode** ($).
- **notifyClose cuma terima SATU nilai uang mode-correct, BUKAN dua.** Caller executor.js:802 kirim
  `pnlUsd = result.recorded_pnl_usd ?? result.pnl_usd ?? 0` + `feesUsd = result.fees_earned_usd`. Di
  dlmm.js:2354-2369: `recorded_pnl_usd` = USD saat solMode off, `null` saat on (lalu fallback ke
  `pnl_usd` yg SOL). Jadi nilainya mode-correct (1 unit), **tak ada `sol_price`** di payload notif.
- ⇒ `fmtBoth($,◎)` butuh DUA nilai; cuma 1 tersedia. Nurunin unit kedua butuh `sol_price` → harus
  ubah executor.js:802 (DILARANG governing #3). Sesuai brief: "kalau cuma $ … tampilkan apa adanya +
  catat (jangan ngarang konversi)". → FASE 4: fix HARD-$ (mode-correct) PASTI; true 2-unit = perlu
  keputusan owner (lihat catatan FASE 4 nanti).

## FASE 0 — hasil
- `views/format.js` `fmtCur` cabang `$` → `.toFixed(2)` (◎ branch tetap round). `views/wallet.js`
  literal Saldo (dua occurrence: primary off + secondary on) `$` → `.toFixed(2)`.
- Re-verify: USD mode Saldo `$185.10` · per-slot `$75.00` · bebas `$155.10` (semua 2dp via fmtCur);
  solMode ON ◎-branch tak berubah (◎1.234/◎0.5/◎1.034), secondary $ ikut 2dp. node --check OK.
- Catatan: baris `SOL @ $<price>` (round) di luar enumerasi brief FASE 0 → dibiarkan (harga referensi).

## Catatan/limit-recovery
(kosong)
