# v3-sync-progress — execution log for adopting main gap-fix Lever A

**Started:** 2026-06-20
**Target:** sync meridian-v3 (/home/ubuntu/meridianzen2, branch `experimental`) to main latest
(`origin/experimental` HEAD = `9facff5`). Scope = 3 code files (index.js, lessons.js, tools/dlmm.js)
+ notes/*.md. ⚠️ LIVE-MONEY wallet — per-phase, commit, revertible. Bot stays STOPPED.

Plan: notes/v3-sync-recon.md. Guards: all git in meridianzen2; never `git pull`; fetch LOCAL `origin`;
preserve ecosystem.config.cjs + package.json (meridian-v3) + fill-env.sh; never start/restart bot.

REVERT: `git checkout backup/pre-main-sync-20260620 -- .` + restore identity,
OR extract /home/ubuntu/backups/meridianzen2-20260620T021659Z.tar.gz

---

## Phase log — ✅ COMPLETE (2026-06-20). Bot left STOPPED for owner.

- ✅ FASE 0 — tarball confirmed (9,418,035 B, Jun 20 02:17); backup branch
  `backup/pre-main-sync-20260620` created at `db4f908` (pre-sync HEAD).
- ✅ FASE 1 — `git fetch origin` updated `15cb22d..9facff5`; HARD VERIFY:
  `origin/experimental` == `9facff5a38a16775ee29d69307c9ba6e5dd32078` ✅ (== 9facff5).
- ✅ FASE 2 — `git checkout origin/experimental -- .` (exit 0). Changed: index.js, lessons.js,
  tools/dlmm.js, 5 notes docs, + identity files (restored next). No data/secret files touched.
- ✅ FASE 3 — `git checkout experimental -- ecosystem.config.cjs package.json` (identity restored).
  fill-env.sh present; backup.sh present.
- ✅ FASE 4 — parity (excl ecosystem/package/fill-env + v3-only backup.sh) = EMPTY; precious files
  (.env/user-config/state/lessons/presets) NOT staged; identity = meridian-v3 in both files.
- ✅ FASE 5 — commit `e8fbdc3` "sync(v3): adopt main gap-fix lever A + signal_snapshot logging"
  = 8 files, 600 insertions(+), 1 deletion(-) (matches recon diffstat 15cb22d..9facff5).
- ✅ FASE 6 — `npm run test:syntax` exit 0 (silent = clean); explicit node --check on the 3
  changed files all OK. NO process started.
- ✅ FASE 7 — reported. Bot intentionally STILL STOPPED — owner starts later and watches
  `pm2 logs meridian-v3` for a clean boot.

## Notes / evidence
- ⚠️ DEVIATION (benign): recon said FASE-4 parity "MUST BE EMPTY" but it surfaced ONE v3-only
  file — `backup.sh` (tracked in v3, absent in main). The recon exclude-list simply omitted it
  (like fill-env.sh). `git checkout origin/experimental -- .` does NOT delete files absent from
  the source tree, so backup.sh was preserved untouched. Parity with backup.sh ALSO excluded = EMPTY.
  No action needed; not a sync failure.
- Pre-sync HEAD: db4f908. Post-sync HEAD: e8fbdc3. origin (LOCAL) = /home/ubuntu/meridianzen.
- Sync delta = gap-fix Lever A series (emergencyCloseDirect + wire into PnL poller +
  signal_snapshot concentration/age stamping). 3 code files only; zero config-schema drift.
- Committer warning at FASE 5 (Ubuntu <ubuntu@localhost.localdomain> auto-config) is benign;
  commit succeeded with Co-Authored-By trailer.

## REVERT (if needed)
`git checkout backup/pre-main-sync-20260620 -- .` then restore identity
(`git checkout backup/pre-main-sync-20260620 -- ecosystem.config.cjs package.json` — already v3),
OR extract /home/ubuntu/backups/meridianzen2-20260620T021659Z.tar.gz.
