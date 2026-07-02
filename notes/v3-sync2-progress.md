# v3-sync2-progress — execution log for SYNC v2 (render-consistency + LLM-eff + F1 data)

**Started:** 2026-06-20
**Target:** sync meridian-v3 (`/home/ubuntu/meridianzen2`, branch `experimental`) to main latest.
⚠️ LIVE-MONEY wallet. Per-phase, commit, revertible. Bot stays STOPPED (owner restarts when v3 flat).

## Baseline (recon, read-only)
- v3 HEAD (pre-sync): `e8fbdc3` (= sync v1 result; adopted main `9facff5`).
- v3 cached `origin/experimental` (STALE): `9facff5` → needs `git fetch origin` to advance.
- main (`/home/ubuntu/meridianzen`) `experimental` HEAD: **`99cab84`** "docs(perf): LLM-efficiency build progress (FASE 1-3)".
- origin = LOCAL `/home/ubuntu/meridianzen` (NOT GitHub). github remote tracks stale v3 — NEVER `git pull`.

## Sync delta `9facff5..99cab84` (11 commits, 13 files: 9 code + 4 notes)
Code: agent.js, briefing.js, index.js, lessons.js, reports.js, state.js, tools/dlmm.js,
tools/executor.js, tools/pnl.js. Notes (docs): leverG-recon, llm-efficiency-progress,
render-consistency-progress, sl-rebacktest. (= 518 insertions, 23 deletions.)
Maps to audit findings: F3 (reports label Net→PnL), F5a (lessons disclose held-out), F5b (state.js
stamp active_setup/profile on backfill), F6/F7 (dlmm separator → hyphen), F9-light (dlmm notif uses
recorded PnL), LLM-eff #4/#5 (agent.js trim 6 recon tools + nudge to use pre-loaded recon).

## GUARD checklist
- Git ops in meridianzen2 only. ❌ never `git pull`. Fetch LOCAL `origin`.
- Preserve identity: ecosystem.config.cjs (name `meridian-v3`), package.json (pm2:*→`meridian-v3`),
  fill-env.sh + backup.sh (v3-only). Restore via FASE 3.
- ❌ never start/restart bot. Owner restarts when v3 FLAT.

## F1 data fix (FASE 5) — confirmed scope (line-2 `preset` only; line-117 `activeSetup` LEFT alone)
- user-config.json: preset=mainzen_v3 → custom  (activeSetup=mainzen_v3, keep)
- presets/mainzen_v3.json: preset=mainzen_v3 → custom  (activeSetup=mainzen_v3, keep)
- presets/Zensmiv1.json: preset=mainzen_v3 → custom  (activeSetup=Zensmiv1, keep)
- presets/_backup.json: preset=mainzen_v3 → custom  (activeSetup=Zensmiv1, keep)

---

## Phase log — ✅ COMPLETE (2026-06-20)

- ✅ FASE 0 — tarball `/home/ubuntu/backups/meridianzen2-20260620T054126Z.tar.gz` (9,784,380 B);
  critical contents (.env/user-config/state/lessons/presets×3) verified. Backup branch
  `backup/pre-sync2-20260620` @ `e8fbdc3` (pre-sync HEAD).
- ✅ FASE 1 — `git fetch origin` updated `9facff5..99cab84`; HARD VERIFY: origin/experimental ==
  main experimental == `99cab84` ✅.
- ✅ FASE 2 — `git checkout origin/experimental -- .` (exit 0). Staged 9 code + 4 notes + 2 identity
  files (restored next). No data/secret touched.
- ✅ FASE 3 — `git checkout experimental -- ecosystem.config.cjs package.json` → identity = meridian-v3;
  fill-env.sh + backup.sh present.
- ✅ FASE 4 — parity (excl identity + v3-only) = EMPTY; nothing precious staged; node --check on all 9
  changed files PASS.
- ✅ FASE 5 — F1: preset `mainzen_v3 → custom` in user-config.json + 3 presets; activeSetup untouched
  (mainzen_v3/mainzen_v3/Zensmiv1/Zensmiv1); all JSON valid; gitignored (NOT staged).
- ✅ FASE 6 — commit `4c7d9a7` "sync(v3): adopt main render-consistency + LLM-efficiency" = 13 files,
  518 insertions(+), 23 deletions(-) (== recon diffstat). `npm run test:syntax` exit 0.
- ✅ FASE 7 — reported. Bot NOT restarted by me.

## ⚠️ KEY FINDING — bot is ONLINE (task premise said stopped)
- `pm2 list`: id 1 `meridian-v3` = **online**, uptime ~11h, ↺ 4 (id 0 `meridian` main also online).
  I did NOT start/restart it — it was already running on entry.
- The git commit does NOT affect the running process: Node holds the OLD (pre-sync e8fbdc3) code in
  memory until a restart. New synced code applies only on the owner's next `pm2 restart meridian-v3`.
- F1 config edit is to gitignored user-config.json (live file). Per the report-audit, `config.profile`
  (from `preset`) is label-only — no behavioral gate — so editing it live is cosmetic (future records
  + identity block print "Custom"); no trading-behavior change even if the live bot reloads config.
- v3 appears FLAT now (state.json: 0 open positions of 97 total). Owner should still confirm via
  `/positions` before restarting to load the new code.

## Post-restart validation (owner, when v3 FLAT)
- Render: `/report` top label = "PnL" (not "Net"); 14-trade held-out disclosure line appears (≠ silent
  drop); identity `🧬 Profil: Custom` distinct from `🗂️ Racikan: mainzen_v3`.
- LLM-eff (v3 = first ground-validation): SCREENER still deploys normally, no garble, no searching for a
  trimmed recon tool. Degradation → REVERT (git).
- F5-retag of 14 historical null-tagged trades = SKIP (disclosure + future-stamp handle it; use
  `/report all` for the full historical picture).

## REVERT
`git checkout backup/pre-sync2-20260620 -- .` + restore identity
(`git checkout backup/pre-sync2-20260620 -- ecosystem.config.cjs package.json` — already v3),
OR extract `/home/ubuntu/backups/meridianzen2-20260620T054126Z.tar.gz`.
