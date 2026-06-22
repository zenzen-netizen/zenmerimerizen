# PRA-BATCH-B — PROGRESS

Workstream 🅴 — pra-Batch-B. Bot MAIN (`pm2 id 0` = meridian, branch `experimental`).
Display-only, restart owner-only.

- [x] 0  poles format.js (2dp money · ikon 👛/💼/📋 · + fmtBoth) + re-verify /positions·/status·/wallet ✅
- [x] 1  recon renderer tracker (formatSolTracker / formatPnlTracker) — output EXACT + batas compute|format ✅
- [x] 2  SOL Tracker → tree-style (◎ tetap), update embed /wallet ✅
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

## FASE 1 — recon renderer tracker (READ-ONLY)
### Batas compute | format
- **sol-tracker.js**: `getSolTracker(currentSol)` → array `{label,startKey,startBal,now,deltaSol,deltaPct,partial}`;
  `sinceStartRow(currentSol)` → `{anchor,startKey,startBal,now,deltaSol,deltaPct,partial}`. KEDUANYA objek
  terstruktur (compute murni). `formatSolTracker` CUMA merakit string + `labelFromKey()` (date→"Jun 22") +
  helper toFixed lokal (fmtSol/signedSol/signedPct/dot). → boundary BERSIH.
- **pnl-tracker.js**: `getPnlTracker(perf,opts)` → array `{label,realized,trades,gasUsd,llmUsd,costUsd,net,
  hasCost,gasIsEst}` (compute murni). `formatPnlTracker` merakit string + derive `gasIncluded`/`anyEst`. BERSIH.
- **RUTE X** (extract render → `views/trackers.js`): compute tetap di file tracker; `format*` panggil
  `renderSolTracker`/`renderPnlTracker`. Nilai-angka tetap pakai `.toFixed(3)`(SOL)/`.toFixed(2)`($) lokal
  di renderer (BUKAN fmtMoney/round) supaya padding trailing-zero byte-identik (round buang "0.050"→"0.05").

### Output EXACT baseline (real data, disimpan /tmp/baseline_{sol,pnl}.txt)
SOL (anchor Jun 10 ter-set → ada baris SINCE, TANPA 💡):
```
📊 SOL Tracker · Now 0.401 SOL
━━━━━━━━━━━━━━━━━                         (17 char — diseragamkan → 16)
1D  ⚪ +0.000 SOL (+0.00%) ← 0.401 @ Jun 22
7D  🟢 +0.029 SOL (+7.70%) ← 0.373 @ Jun 16
30D 🔴 -0.028 SOL (-6.61%) ← 0.430 @ Jun 10 *
SINCE Jun 10 🔴 -0.028 SOL (-6.61%) ← 0.430 *
* window/anchor blm punya baseline pas — pakai hari terlama tercatat
ℹ️ saldo SOL mentah (termasuk deposit/tarik & modal di posisi) — buat PnL murni pakai /report
```
PnL (gasIncluded, no est → tanpa ~):
```
📊 Realized PnL & Net
━━━━━━━━━━━━━━━━━                         (17 → 16)
1D  🟢 +$1.32 net  (PnL +$1.93 − biaya $0.61 · 11 tr)
7D  🟢 +$0.55 net  (PnL +$4.04 − biaya $3.49 · 84 tr)
30D 🔴 -$13.09 net  (PnL -$5.40 − biaya $7.69 · 145 tr)
ℹ️ Net = PnL − gas − LLM
```
### Diff yg DISENGAJA (visual, owner-approved mockup) — sisanya byte-identik
- Header: SOL `Now …SOL`→`now ◎…` ; PnL ikon `📊`→`💰` (wording sama).
- SEP 17→16 (seragam format.js). Baris data → tree `├/└`. Nilai SOL: suffix `␣SOL`→prefix `◎` (angka sama).
- SOL baris SINCE → `sejak` (label, jadi `└` terakhir). PnL `net␣␣(`→`net␣(` (double→single space).
- DIPERTAHANKAN: tiap window, Δ, %, anchorBal, tanggal, `*`, `ℹ️`, `💡`(saat tanpa anchor), `~`/est, `⚠️`
  disclosure (disclosure tetap embed terpisah di view, di LUAR blok tracker — apa adanya).

## FASE 2 & 3 — hasil (Rute X)
- `views/trackers.js` BARU: `renderSolTracker(d)` (◎ tetap) + `renderPnlTracker(rows)` ($ tetap),
  pakai `ICON`/`SEP`/`tree` dari format.js; angka pakai `.toFixed` lokal (byte-fidelity padding).
- `sol-tracker.js`: `formatSolTracker` kini COMPUTE + map display-data → panggil `renderSolTracker`
  (helper string lama fmtSol/signedSol/signedPct/dot dibuang; `labelFromKey` dipakai di mapping).
- `pnl-tracker.js`: `formatPnlTracker` kini panggil `renderPnlTracker` (helper dot/sd dibuang); fail-open tetap.
- Embed view (status.js/wallet.js `out.push vm.solTracker/vm.pnlBlock`) TIDAK diubah — string yg mengalir
  sudah tree-style karena format* panggil renderer baru (index.js tak disentuh, di luar scope).
- CROSS-CHECK byte-level (data real, /tmp/{baseline,new}_{sol,pnl}.txt): multiset angka (13 SOL/9 PnL),
  tanggal, jumlah-trade, dot, footnote, tanda minus U+2212 → IDENTIK OLD↔NEW. Edge-case OK: tanpa-anchor→💡,
  no-baseline, gas-est `~` + ℹ️ "(~ = gas estimasi)", branch no-cost, varian "gas blm dihitung".
- Import-graph bersih (briefing.js→pnl-tracker→views/trackers→format) nol circular-dep. End-to-end /wallet
  satu gaya tree SEP-16; disclosure ⚠️ tetap di luar blok.

## Catatan/limit-recovery
(kosong)
