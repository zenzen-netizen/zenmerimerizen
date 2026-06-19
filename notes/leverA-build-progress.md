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

## ✅ FASE 2 — WIRING poller
Commit: `feat(gap-fix): phase-2 wire emergency direct close into PnL poller (lever A)`

Dua cabang darurat disisipkan di poller (`index.js`, dalam `startCronJobs`):
- Cabang `exit.action === "STOP_LOSS"` (di atas blok cooldown lama, ~line 1318):
  `await emergencyCloseDirect(p, exit.reason)` → `success` break; `needFallback` (gagal) →
  set `_pollTriggeredAt` + `runManagementCycle` ASAP (no cooldown) + break; `skipped` → `continue`.
- Cabang `closeRule.rule === 1` (di atas blok cooldown lama, ~line 1345): idem dengan
  `closeRule.reason`.
- Non-darurat (TRAILING_TP/exit lain/rule 2-5): blok cooldown→runManagementCycle lama **TIDAK
  disentuh**.
- Fallback dipicu SETELAH helper return (lock sudah lepas di `finally`) → tidak self-block (D3).
- `node --check index.js` ✅ PASS.

## ✅ FASE 3 — TEST (berlapis)
Commit: `test(gap-fix): phase-3 lever A verification`

- **Test A — closePosition DRY_RUN (real code):** `closePosition({...})` dgn `process.env.DRY_RUN
  ="true"` (di-reassert SETELAH import; config.js:59 nge-set false dari `dryRun:false`) → return
  `{dry_run:true, would_close, message}`, **tanpa tx / tanpa success flag**. ✅
  ⚠️ Temuan: di DRY_RUN closePosition return TANPA `success` → helper anggap gagal → needFallback
  =true → picu management fallback. Artefak DRY_RUN saja (harmless; live close return success).
- **Test B — logic/concurrency (replica verbatim, 14/14 PASS, `/tmp/test-leverA-logic.mjs`):**
  success→{success,no-fallback}+lock lepas; busy→skipped+closePosition NOT called+lock tak diclobber;
  fail→needFallback+lock lepas; dry-run-return→needFallback; throw→finally lepas lock;
  **concurrency 2 panggilan 1 tick → closePosition fire TEPAT 1× (no double-fire), 1 skipped.**
- **Test C — idempotensi (code-review):** Lever A ubah **HANYA index.js** (`git diff --stat`:
  dlmm.js/lessons.js/state.js/executor.js/telegram.js NOL). `_managementBusy` ketahan sepanjang
  in-flight (set sinkron → `finally` lepas); mgmt cron guard `index.js:431` TAK diubah → tak ada
  jalur dobel `recordPerformance`.
- **Test D — /close regress:** handler `index.js:3675`/`3695` + closePosition TAK tersentuh → no regress.
- **Test E — recordPerformance + suspect:** `recordPerformance` tetap di dalam closePosition
  (`dlmm.js:2541`), suspect-pnl (`dlmm.js:2448`) tetap → kepicu identik utk poller-direct.

## ✅ FASE 4 — VERIFIKASI (restart = owner)
- git branch = `experimental` ✅
- `git diff --stat` (commit lever A): **HANYA `index.js`** (88 baris, kode — bukan gitignored) +
  notes. dlmm/lessons/state/executor/telegram NOL. ✅
- pm2 id=0 `meridian` online, cwd=`/home/ubuntu/meridianzen` ✅ (cocok working dir)
- Commits: f32179a (helper) → 1c21a50 (wiring) → 97ed560 (test). Revertible per-fase.
- 1 posisi OPEN saat ini (FLKR-SOL) — restart aman (state.json persist, bot rediscover bbrp detik).

⏳ **PENDING (owner): `pm2 restart 0 --update-env`** biar kode lever A aktif.
⭐ **TES SEBENARNYA = SL natural BERIKUTNYA.** Setelah restart, saat ada close darurat pertama,
   cek log: (a) baris `[PnL poll] EMERGENCY direct close: …` + `EMERGENCY close OK` (BUKAN
   "triggering management" + agentLoop MANAGER di jalur itu), (b) nol dobel-close/record,
   (c) notif Telegram masuk, (d) record kecatet di lessons.json (pnl + suspect handling).

---

## REVERT
Per fase via git: `git revert 1c21a50` (unwire poller) lalu `git revert f32179a` (hapus helper),
atau revert ketiganya. Helper additive + 2 cabang poller — non-darurat tak tersentuh.

## STATUS AKHIR: FASE 1-4 selesai (kode + test + commit). Tinggal restart pm2 (owner) + pantau SL.

---

## CATATAN
Lever A PERCEPAT close (buang LLM round-trip + cooldown 10m), TIDAK menghilangkan gap konfirmasi
on-chain utk rug super-cepat. suspect-pnl rug (≤−90) tetap di luar scope (perilaku skrg).
