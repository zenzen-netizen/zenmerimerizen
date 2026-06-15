# Baseline mainzen_v2 BERSIH — Progress

> UBAH KODE+DATA (lapisan Mesin). Tak menyentuh eksekusi trade/exit. Branch experimental. Jangan restart.
> Owner restart PROMPTLY setelah selesai. Reversible (FASE 0 backup). Commit tiap fase.

## Checklist
- ✅ FASE 0 — BACKUP 4 file → notes/backups/20260615T061757Z/ (lessons, user-config, signal-weights, pool-memory) — semua valid JSON. COMMIT
- ✅ FASE 1 — ARSIP 84 record null → lessons-archive-pre-mainzen_v2.json; aktif=61 (61+84=145 terjaga). COMMIT
     · cutoff bersih: arsip recorded_at 2026-06-03T17:17→2026-06-10T13:02 | aktif 2026-06-10T14:26→2026-06-15T02:52 (no overlap)
     · lessons[] (95) sengaja TAK disentuh (di luar lingkup FASE 1)
- ✅ FASE 2 — ISOLASI LOOP (lessons.js): helper `keepActiveRacikan` (active_setup===config.activeSetup, no hardcode).
     Diterapkan: livePerf (loop evolve+Darwin), getModePerformance (stats/report/briefing), getPerformanceSummary
     (/status,/evolve), evolveThresholds chokepoint (auto+manual /evolve). Darwin ikut via livePerf.
     Uji: getModePerformance=61 all mainzen_v2; mix 4 aktif+20 asing → evolveThresholds=null ✅. COMMIT
- ✅ FASE 3 — RESET OTAK. COMMIT
     · Darwin: PAKAI "reset netral → 1 pass bersih via recalculateWeights" (standalone). recalc_count 28→1.
       BEFORE organic 2.5/volatility 1.625/entry_mcap 1.707 → NEUTRAL semua 1.0 → CLEAN seed (6 nudge):
       entry_volume/entry_tvl/mcap=1.05, organic_score/fee_tvl_ratio/volume=0.95, sisanya 1.0.
       CATATAN: algoritma incremental (±5%/pass) → ini SEED arah-pertama dari 61 record bersih, bukan
       konvergensi penuh; loop lanjut nyetel tiap 5 close racikan-aktif. signal-weights.json gitignored (disk).
     · Threshold: minFeeActiveTvlRatio 0.1==0.1, minOrganic 70==70 → TAK ADA DRIFT. _lastEvolved &
       _positionsAtEvolution ABSENT (evolve belum pernah fire). user-config.json TAK DISENTUH (surgical no-op).
     · pool-memory.json TIDAK direset (di luar lingkup, sudah ke-backup).
- ✅ FASE 4 — VERIFIKASI semua lolos:
     · node --check lessons.js OK · getModePerformance=61 (all mainzen_v2) · getAllPerformance=61 · summary=61
     · archive 84 + active 61 = 145 terjaga · signal-weights recalc_count 28→1 · threshold 0.1/70 baseline · _lastEvolved absent
     · 4 backup ada (lessons/pool-memory/signal-weights/user-config) · branch=experimental · 4 commit per-fase · diff lessons.js +30/-4
     · pm2: `meridian` (id0) cwd=/home/ubuntu/meridianzen ✓ COCOK | `meridian-v3` (id1) cwd=/home/ubuntu/meridianzen2 (repo lain, TAK terpengaruh)

## ⚠️ AKSI OWNER: restart pm2 `meridian` (id 0) PROMPTLY → aktifkan kode isolasi baru (lessons.js).
   Catatan: load()/loadWeights() baca disk fresh, jadi reset TIDAK akan ketimpa data lama; restart utamanya
   untuk muat KODE keepActiveRacikan. JANGAN restart meridian-v3 (repo beda). Eksekusi trade/exit TAK disentuh
   (TURTLE-SOL aman). Freeze evolve = roadmap #4 (belum dikerjakan di sini) — evolve lanjut dari baseline BERSIH.

## Rollback (kalau perlu): cp notes/backups/20260615T061757Z/{lessons,signal-weights,user-config,pool-memory}.json .
   lalu git revert a4cc7cc (isolasi kode). Arsip: lessons-archive-pre-mainzen_v2.json (84 record, recoverable).

## Catatan temuan
- Config FLAT (bukan nested screening). minFeeActiveTvlRatio & minOrganic = top-level key.
- LIVE: minFeeActiveTvlRatio=0.1, minOrganic=70 | mainzen_v2.json: 0.1, 70 → kemungkinan TAK ADA DRIFT.
- `_lastEvolved` tidak ada di user-config.json (ada `_lastAgentTune`). Cek stamp evolve sebenarnya di lessons.js.
- mainzen_v2.json masih punya maxBundlePct+athFilterPct (dead, di luar lingkup — JANGAN sentuh).
