# Baseline mainzen_v2 BERSIH — Progress

> UBAH KODE+DATA (lapisan Mesin). Tak menyentuh eksekusi trade/exit. Branch experimental. Jangan restart.
> Owner restart PROMPTLY setelah selesai. Reversible (FASE 0 backup). Commit tiap fase.

## Checklist
- ✅ FASE 0 — BACKUP 4 file → notes/backups/20260615T061757Z/ (lessons, user-config, signal-weights, pool-memory) — semua valid JSON. COMMIT
- ✅ FASE 1 — ARSIP 84 record null → lessons-archive-pre-mainzen_v2.json; aktif=61 (61+84=145 terjaga). COMMIT
     · cutoff bersih: arsip recorded_at 2026-06-03T17:17→2026-06-10T13:02 | aktif 2026-06-10T14:26→2026-06-15T02:52 (no overlap)
     · lessons[] (95) sengaja TAK disentuh (di luar lingkup FASE 1)
- ⬜ FASE 2 — ISOLASI LOOP: livePerf + getter stats filter active_setup===config.activeSetup (lessons.js) + COMMIT
- ⬜ FASE 3 — RESET OTAK: signal-weights reset/recompute; threshold → mainzen_v2.json (surgical); clear stamp + COMMIT
- ⬜ FASE 4 — VERIFIKASI: aktif=61, loop racikan-aktif, weights reset, threshold baseline, 4 backup; node --check

## Catatan temuan
- Config FLAT (bukan nested screening). minFeeActiveTvlRatio & minOrganic = top-level key.
- LIVE: minFeeActiveTvlRatio=0.1, minOrganic=70 | mainzen_v2.json: 0.1, 70 → kemungkinan TAK ADA DRIFT.
- `_lastEvolved` tidak ada di user-config.json (ada `_lastAgentTune`). Cek stamp evolve sebenarnya di lessons.js.
- mainzen_v2.json masih punya maxBundlePct+athFilterPct (dead, di luar lingkup — JANGAN sentuh).
