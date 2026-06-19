# LEVER A — BUILD PROGRESS (close darurat poller → langsung, LLM-free)

> Lanjutan `notes/leverA-recon.md`. Branch `experimental`. MONEY-LOGIC (jalur close uang asli) —
> per-fase, commit tiap fase, revertible via git. Bukti = `file:line`. Ragu = UNKNOWN.
> Sesi baru → BACA file ini dulu.

## Scope (baked-in, sudah di-review)
- Rute LANGSUNG cuma DARURAT: `STOP_LOSS` (`state.js:540`) + `getDeterministicCloseRule` rule 1
  (`index.js:1376`). TP/trailing/OOR/low-yield TETAP jalur lama (cooldown→runManagementCycle).
- D1 autoswap base→SOL: YA, FAIL-OPEN (replikasi `executor.js:805-817`).
- D2 notifyClose: YA (import telegram.js).
- D3 fallback kalau direct-close GAGAL: jatuh ke jalur lama, SETELAH lock lepas, TANPA cooldown.
- TIDAK menyentuh: exit-criteria/ambang SL/suspect-guard, screening, sizing, recordPerformance, paper.

---

## ✅ FASE 1 — HELPER `emergencyCloseDirect(p, reason)`
Commit: (lihat git log) `feat(gap-fix): phase-1 emergencyCloseDirect helper (lever A)`

- Import ditambah di `index.js`: `swapToken` dari `./tools/wallet.js` (line 9), `notifyClose` dari
  `./telegram.js` (block import).
- Helper baru di `index.js` tepat sebelum `startCronJobs()` (~line 1176).
- Logika:
  - check-and-set SINKRON: `if (_managementBusy) return {success:false, skipped:true, needFallback:false}`
    lalu `_managementBusy = true` (tanpa await di antara) → cegah dua tick lolos guard barengan.
  - `try`: `closePosition({position_address:p.position, reason})`.
    - sukses → D1 autoswap (inner try/catch, fail-open) + D2 notifyClose (`.catch`), keduanya
      TIDAK mengubah `success` (fail-open).
  - `finally`: `_managementBusy = false` (selalu lepas, walau D1/D2 error).
  - return `{success, skipped:false, needFallback:!success}` → needFallback true HANYA kalau
    close DICOBA & gagal (skipped path early-return, needFallback=false).
- Guard double-close: `_managementBusy` ketahan sepanjang in-flight; mgmt cron (`index.js:431`)
  & poller top-guard (`index.js:1236`) sama-sama hormati lock.
- `node --check index.js` ✅ PASS.

## ⬜ FASE 2 — WIRING poller
## ⬜ FASE 3 — TEST (DRY_RUN + code-review idempotensi + /close regress)
## ⬜ FASE 4 — VERIFIKASI & restart pm2 id0 (--update-env) + pantau SL natural berikut

---

## CATATAN
Lever A PERCEPAT close (buang LLM round-trip + cooldown 10m), TIDAK menghilangkan gap konfirmasi
on-chain utk rug super-cepat. suspect-pnl rug (≤−90) tetap di luar scope (perilaku skrg).
