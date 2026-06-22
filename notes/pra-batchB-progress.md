# PRA-BATCH-B — PROGRESS

Workstream 🅴 — pra-Batch-B. Bot MAIN (`pm2 id 0` = meridian, branch `experimental`).
Display-only, restart owner-only.

- [x] 0  poles format.js (2dp money · ikon 👛/💼/📋 · + fmtBoth) + re-verify /positions·/status·/wallet ✅
- [ ] 1  recon renderer tracker (formatSolTracker / formatPnlTracker) — output EXACT + batas compute|format
- [ ] 2  SOL Tracker → tree-style (◎ tetap), update embed /wallet
- [ ] 3  Realized PnL & Net → tree-style ($ tetap), update embed /status + /wallet

## Catatan recon awal (sebelum eksekusi)
- **Rute X dipilih** (extract render ke `views/trackers.js`). Alasan: boundary compute|format sudah bersih —
  `getSolTracker`/`sinceStartRow` (sol-tracker.js) & `getPnlTracker` (pnl-tracker.js) mengembalikan OBJEK
  terstruktur; `formatSolTracker`/`formatPnlTracker` cuma merakit string. Tinggal pindah rakitan string.
- **index.js TIDAK disentuh** (di luar scope; verifikasi brief: no engine). String tracker pre-built di
  index.js lewat `formatSolTracker`/`formatPnlTracker`; karena kedua fn itu kini memanggil renderer baru,
  embed di views/status.js & views/wallet.js otomatis tree-style tanpa ubah call-site. Embed view (`out.push
  vm.solTracker/vm.pnlBlock`) tetap apa adanya — sudah meneruskan string renderer baru.
- **Dampak menyebar (disengaja, uniformity):** `formatPnlTracker` juga dipakai /report (index.js:314/334/354)
  + milestone (4047) + briefing.js (363/503). Mengubah renderer = tree-style di SEMUA permukaan sekaligus.
  `formatSolTracker` cuma di /wallet (index.js:3620). Semua display-only, nol detail hilang → dalam governing.

## FASE 0 — hasil
- format.js: `fmtMoney`/`fmtMoneySigned` mode $ → `.toFixed(2)` (SELALU 2dp, "$22.90"/"+$5.80");
  mode ◎ tetap `round` (buang trailing zero). `fmtBoth(usd,sol,solMode)` ditambah (belum dipanggil).
  ICON: `wallet="👛"`, `position="💼"`(baru), `status="📋"`(baru).
- Pemakaian: status.js header→📋, sub-blok→👛 Wallet (💼-ganda hilang); positions.js header→💼;
  wallet.js baris Posisi→💼.
- Verifikasi: `node --check` 5 file OK; SEP=16; smoke-render /positions·/status·/wallet → ikon update,
  2dp kebawa (Value $22.90 / fees $0.40 / PnL +$5.80), nol detail hilang.
- ⚠️ SCOPE: baris Saldo/per-slot/bebas (fmtCur/round, mis. `$185.1`/`$75`) TIDAK 2dp — brief #1
  cuma sebut fmtMoney/fmtMoneySigned. Sengaja TIDAK diubah (governing "NOL ubah logika"). Kalau owner
  mau seragam penuh, follow-up: ubah cabang $ di `fmtCur` + literal Saldo di wallet.js → toFixed(2).

## Catatan/limit-recovery
(kosong)
