# v3-sync3-progress — SYNC v3 (ke-3): briefing-fix + deploy-atomic-fix + F6 simbol

**Started:** 2026-06-21
**Target:** sync meridian-v3 (`/home/ubuntu/meridianzen2`, branch `experimental`) to main latest CODE.
⚠️ LIVE-MONEY wallet, posisi KEBUKA. CODE-ONLY (nol v3-data fix). Per-fase, commit, revertible.
Bot stays STOPPED-by-me (owner restarts when comfortable). New session → read this file.

## Baseline (recon, read-only)
- v3 HEAD (pre-sync): `4a297c0` "data(v3): reset pre-mainzen_v2 archive" (= sync2 `4c7d9a7` + v3 data reset).
- main (`/home/ubuntu/meridianzen`) `experimental` HEAD: **`eb81903`** "docs(f6): mark symbol-fix FASE 1-3 done".
- origin = LOCAL `/home/ubuntu/meridianzen` (NOT GitHub). v3 branch tracks `github/v3` (STALE) — NEVER `git pull`.
- v3 cached origin/experimental: stale → needs `git fetch origin` to advance to `eb81903`.

## Sync delta `99cab84..eb81903` (sync2 adopted 99cab84) = 5 commits, 4 files (3 code + 1 notes)
- `5a4efb2` briefing: racikan-scoped block + disclosure alongside All-time → **briefing.js**
- `380207c` fix(deploy): track orphan position when wide-range add-liquidity fails → **tools/dlmm.js**
- `0ebd07e` fix(display): F6 re-resolve "?" token symbols in PnL poller → **tools/pnl.js**
- `4b13584` fix(display): F6 heal "?" names in getMyPositions fallback + close notif → **tools/dlmm.js**
- `eb81903` docs(f6): mark symbol-fix FASE 1-3 done → **notes/f6-symbol-fix-progress.md** (docs)
- Diffstat: briefing.js (+33), tools/dlmm.js (+50), tools/pnl.js (+75), notes (+52) = 192 ins / 18 del.

## ⚠️⚠️ KEY LANDMINE — lessons-archive-pre-mainzen_v2.json is git-TRACKED (NOT gitignored)
- Task guard assumed "lessons-archive aman by gitignore" — WRONG. `git check-ignore` → NOT ignored; `git ls-files` → tracked.
- v3 HEAD has it EMPTIED (blob `b61b133`, the `4a297c0` data reset). main HEAD has it FULL (blob `babbc9d`, 4550 lines).
- ⇒ blanket `git checkout origin/experimental -- .` (FASE 2) WOULD resurrect main's full archive = UNDO the v3 reset.
- MITIGATION: in FASE 3, restore it from v3 experimental HEAD alongside identity files. Keeps this CODE-ONLY.
- This file is therefore a **v3-only divergence** for the FASE 4 parity check (v3 empty vs main full = expected).

## GUARD checklist
- Git ops in meridianzen2 ONLY. ❌ never `git pull`. Fetch LOCAL `origin`.
- 🔴 Preserve identity: ecosystem.config.cjs (name `meridian-v3`), package.json (pm2:*→`meridian-v3`),
  fill-env.sh + backup.sh (v3-only). Restore via FASE 3.
- 🔴 Restore lessons-archive-pre-mainzen_v2.json (emptied) via FASE 3 (see landmine above).
- 🔴 Precious gitignored (verify NOT staged): .env, user-config.json (sizingMode=maximize), presets/,
  state.json (POSISI KEBUKA), lessons.json. Untouched by checkout (gitignored) — but cek.
- ❌ never start/restart bot. Owner restarts when comfortable.

## FASE 4 import-resolve checklist (anti restart-crash)
- briefing.js → getModePerformance / getExcludedRacikanStats in lessons.js
- dlmm.js → setPositionInstruction in state.js + resolveDisplayPair / firstResolvedName in pnl.js
- pnl.js → export helper baru (resolveDisplayPair / firstResolvedName)

---

## Phase log

- ✅ FASE 0 — tarball `/home/ubuntu/backups/meridianzen2-20260621T011723Z.tar.gz` (10,319,274 B);
  critical contents verified (.env/user-config/state/lessons/lessons-archive/presets×3); node_modules excluded.
  Backup branch `backup/pre-sync3-20260621` @ `4a297c0` (pre-sync HEAD).
- ✅ FASE 1 — `git fetch origin` updated `99cab84..eb81903`; HARD VERIFY origin/experimental == main
  experimental == `eb81903` ✅ (not stale).
- ✅ FASE 2 — `git checkout origin/experimental -- .` (exit 0). Staged 4 wanted (briefing.js, tools/dlmm.js,
  tools/pnl.js, notes/f6) + 3 to-restore (ecosystem.config.cjs, package.json, lessons-archive). fill-env.sh +
  backup.sh PRESERVED (absent from origin → pathspec checkout never deletes). No gitignored data touched.
- ✅ FASE 3 — `git checkout experimental -- ecosystem.config.cjs package.json lessons-archive-pre-mainzen_v2.json`.
  Identity = `meridian-v3` (ecosystem name + package pm2 scripts). lessons-archive restored to emptied v3 blob
  `b61b133` (landmine averted — full archive NOT resurrected).
- ✅ FASE 4 — parity (excl identity + v3-only) = EMPTY; precious files (.env/user-config/state/lessons/presets/
  lessons-archive) NOT staged; staged = ONLY briefing.js + notes/f6 + tools/dlmm.js + tools/pnl.js; staged code
  byte-identical to main (empty diff vs origin); diffstat 192 ins / 18 del (== recon). node --check PASS ×3.
  Import-resolve PASS: briefing.js←lessons.js(getModePerformance@957, getExcludedRacikanStats@989);
  dlmm.js←state.js(setPositionInstruction@307), dlmm.js←pnl.js(resolveDisplayPair@95, firstResolvedName@87);
  pnl.js exports both. Delta = briefing-fix + deploy-orphan-fix + F6 symbol ✅.
- ✅ FASE 5 — commit `10ff38a` "sync(v3): adopt main briefing racikan-scope + deploy orphan-fix + F6 symbol"
  = 4 files, 192 ins / 18 del (== recon). `npm run test:syntax` exit 0 (all .js node --check pass).
  Only the 4 adopted files committed; v3-local progress notes left untracked (prior-sync convention).
- ✅ FASE 6 — reported. Bot NOT restarted by me.

## ⚠️ KEY FINDINGS
1. **lessons-archive landmine averted** — `lessons-archive-pre-mainzen_v2.json` is git-TRACKED (not gitignored
   as the task guard assumed). Blanket FASE-2 checkout staged main's full 4550-line archive; FASE-3 restored the
   emptied v3 blob `b61b133`. The `4a297c0` data reset is preserved. (Verify any future sync re-handles this.)
2. **Bot is ONLINE** (task premise said stopped). `pm2 list`: id 1 `meridian-v3` = online, uptime ~6h, ↺ 8
   (id 0 `meridian` main also online). I did NOT start/restart it — already running on entry. The running Node
   process holds the OLD (pre-sync `4a297c0`) code in memory; the new code (`10ff38a`) applies only on the
   owner's next `pm2 restart meridian-v3`.

## RESTART NOTE (owner)
New code = display (F6 symbol heal) + deploy jalur (orphan-track on failed add-liquidity) + briefing
(racikan-scope + disclosure). **NOL exit-logic change** → restart LOW-RISK even with a position open
(brief boot pause; in-range position stays healthy). After restart: `/positions` + management heal `?-SOL`
→ real symbol / mint-prefix; briefing shows All-time + Racikan block + disclosure.

## REVERT
`git checkout backup/pre-sync3-20260621 -- .` + restore identity, OR extract
`/home/ubuntu/backups/meridianzen2-20260621T011723Z.tar.gz`.
