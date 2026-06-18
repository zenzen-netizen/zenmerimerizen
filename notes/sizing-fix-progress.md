# Sizing-fix (money-logic) — Progress

> Branch `experimental`. BUG URGENT: sizing maximize bisa hasilin per-slot < minDeploy → bot STUCK
> (deploy ditolak, LLM retry, burn token tiap cycle). Mulai 2026-06-19. Sesi baru → BACA dulu.
> ⚠️ MONEY-LOGIC: reversible, butuh restart pm2 meridian (id 0). Jangan sentuh exit/kriteria-screening/recordPerformance.

## Status fase
- ✅ FASE 0 — RECON (temuan di bawah)
- ✅ FASE 1 — ADAPTIVE SLOTS (computeDeployAmount maximize)
- ⬜ FASE 2 — SKIP-SCREENING kalau broke (stop burn LLM)
- ⬜ FASE 3 — VERIFIKASI + restart

## FASE 0 — TEMUAN

### Config aktual (user-config.json, flat keys)
`sizingMode=maximize · rentPerPositionSol=0.057 · deployAmountSol=0.1 · gasReserve=0.03 ·
positionSizePct=0.33 · maxPositions=2 · maxDeployAmount=10 · minSolToOpen=0.15`

### Alur bug (terkonfirmasi)
1. `runScreeningCycle` (index.js:734): `deployAmount = computeDeployAmount(wallet.sol, {slotsRemaining})`.
   - maximize branch (config.js:508-516): `perSlot = floor((wallet − gas − rent×slots)/slots, 3dp)`,
     clamp [0, maxDeployAmount]. **Floor deployAmountSol SENGAJA dilewati** (komentar: "0.13/slot harus boleh").
   - wallet **0.334**, slots **2**: `(0.334 − 0.03 − 0.057×2)/2 = 0.19/2 = 0.095`. ✓ cocok laporan.
2. deployAmount 0.095 disuntik ke prompt SCREENER (index.js:1002 `Deploy: 0.095 SOL`) → LLM mahal
   (`agentLoop` SCREENER screeningModel, index.js:999/1064) dipanggil PENUH tiap cycle.
3. LLM panggil `deploy_position(amount_y≈0.095)` → safety check executor.js:1004-1011:
   `minDeploy = max(0.1, deployAmountSol=0.1) = 0.1` → `0.095 < 0.1` → **TOLAK** ("below minimum deploy").
4. Dalam agentLoop, model bisa retry deploy_position (sub-min lagi) → habisin maxSteps → cycle tutup
   tanpa deploy. **Cycle berikutnya ULANG** (wallet sama) → burn screeningModel tiap interval, selamanya.
   (Bukan infinite-loop satu cycle; tapi tiap cycle = 1 LLM run yg MUSTAHIL sukses = burn berkelanjutan.)

### minDeploy 0.1 = HARDCODE KITA (bukan protokol Meteora)
`executor.js:1004 const minDeploy = Math.max(0.1, config.management.deployAmountSol)`. 0.1 = lantai sanity
kita biar gak buka posisi debu; Meteora sendiri tak mewajibkan min 0.1 SOL. → aman dipakai sbg ambang adaptive.

### Tempat pre-skip LLM mahal
`runScreeningCycle`: deployAmount dihitung di **:734**, LLM dipanggil di **:999**. Antara itu ada
`getTopCandidates` (:747, API) + recon token (:773, API). **Skip paling hemat = tepat setelah :734-735,
sebelum :747** → nol API + nol LLM saat broke. Management cycle = fungsi terpisah (`runManagementCycle`),
TIDAK kena skip ini (posisi terbuka tetap dikelola).

### Call-site computeDeployAmount (semua kena fix FASE 1)
- index.js:734 (screening cron) — utama.
- index.js:1554 (formatWalletStatus, display "Real deploy/slot").
- index.js:3235 (deployLatestCandidate, /deploy manual) — kalau 0 → executor tolak `amountY<=0` (clean throw, bukan loop).

### Smoke target (FASE 1 harus cocok); min=0.1, gas=0.03, rent=0.057, slotsMax=2
- 0.334 → N=2 perSlot 0.095✗, N=1 0.247✓ → **1 pos 0.247**
- 0.4   → N=2 perSlot 0.128✓ → **2 pos 0.128**
- 0.15  → N=2 0.003✗, N=1 0.063✗ → **0 (skip bersih)**
- (perSlot MONOTON TURUN thd N → "N terbesar yg lolos" = iter N dari slots turun ke 1, ambil yg pertama lolos)

## FASE 1 — IMPLEMENTASI
- `config.js`: helper baru `minDeployAmount()` = `max(0.1, deployAmountSol)` (single source of truth).
  Cabang maximize ditulis ulang: loop N=maxSlots→1, `perSlot=floor((wallet−gas−rent×N)/N,3dp)`,
  return perSlot pertama yg `≥ min` (= N terbesar lolos); kalau tak ada → **return 0** (sinyal can't-deploy).
- `executor.js:1004`: `minDeploy` pakai `minDeployAmount()` (sinkron dgn config — gak bisa beda lagi).
- `index.js` deployLatestCandidate (manual /deploy): guard `deployAmount < minDeployAmount()` → throw
  "modal kurang" yang jelas (bukan error generic).
- SMOKE (fungsi ASLI config.js): 0.334→0.247(1pos) · 0.4→0.128(2pos) · 0.15→0(skip) · 0.087→0 · 1.0→0.428(2pos).
  Semua target cocok. npm test PASS. Commit FASE 1.
