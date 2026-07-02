# v3-sync-recon — Recon + Backup before syncing meridian-v3 → main latest code

**Date:** 2026-06-20 (recon run 02:16Z)
**Scope:** READ-ONLY recon + one full backup. **NO** code/config/data/wallet changed. **NO** bot started/stopped/restarted. **NO** `git fetch`/`checkout`/`pull` run on either repo.
**Verdict (TL;DR):** Sync is **SMALL and LOW-RISK** — only **3 code files** drift (`index.js`, `lessons.js`, `tools/dlmm.js` = "gap-fix lever A"). **Zero config-schema drift, zero config migration needed.** Working tree is **clean — no leftover/weird files right now.** The real landmines are *procedural* (stale tracking ref + branch tracks GitHub not local main) → see RED FLAGS. **STOP here, await review before executing sync.**

---

## PHASE 0 — BACKUP (done first, verified) ✅

- **Path:** `/home/ubuntu/backups/meridianzen2-20260620T021659Z.tar.gz`
- **Size:** ~9.4 MB (9,418,035 bytes) · **Entries:** 1054 · `node_modules` excluded (verified: 0 matches)
- **Critical contents verified present:** `.env`, `.env.bak.20260610-155356`, `.env.bak.dryrun.160748`, `.env.example`, `user-config.json`, `lessons.json`, `state.json`, `candidate-memory.json`, `signal-weights.json`, `presets/` (`mainzen_v3.json`, `Zensmiv1.json`, `_backup.json`).
- Command used: `tar czf .../meridianzen2-<ts>.tar.gz -C /home/ubuntu --exclude='meridianzen2/node_modules' meridianzen2` (exit 0).
- Note: `/home/ubuntu/backups/` did not exist before; created it for this snapshot. (Daily cron backups separately live in `~/meridianzen2-backups/`.)

**Safety net is in place — anything below can be fully restored from this tarball.**

---

## PHASE 1 — Git status of meridianzen2

| Item | Finding | Evidence |
|---|---|---|
| Git repo? | Yes | `git rev-parse --is-inside-work-tree` → `true` |
| `origin` | **= local `/home/ubuntu/meridianzen`** (NOT GitHub) | `git remote -v` |
| `github` remote | `https://github.com/zenzen-netizen/zenmerimerizen.git` | `git remote -v` |
| Current branch | `experimental` | `git rev-parse --abbrev-ref HEAD` |
| Current HEAD | `db4f908` "sync(v3): adopt main latest logic (routput-v2, sizing, config-schema, pnl/backtest tools)" — committed **2026-06-19 10:47** | `git log -1 db4f908` |
| Tracking | **tracks `github/v3`, ahead 1** (the unpushed `db4f908`) — NOT `origin/experimental` | `git branch -vv` |
| Working tree | **CLEAN** — "nothing to commit, working tree clean" | `git status` |
| Uncommitted / conflict markers? | **NONE** (grep for `<<<<<<<` / `>>>>>>>` in *.js/*.cjs/*.json → empty) | grep scan |
| Detached HEAD? | No (on `experimental`) | — |
| Stash? | **None** | `git stash list` empty |
| Merge-leftover files (`.orig/.rej/*BACKUP*/~`)? | **NONE** | `find` scan empty |
| Untracked/`!!`ignored entries | Only the **expected** gitignored data/secret files (see PHASE 2) | `git status --porcelain --ignored` |
| Branches | `experimental` (HEAD), `backup/pre-main-sync-20260619`, remotes `github/{experimental,v3}`, `origin/{experimental,main,backup/pre-pnl-merge}` | `git branch -a` |

**Is the "weirdness" (leftover from a failed sync) present now? → NO.** The repo is currently healthy and clean. Yesterday's sync (`db4f908`, 2026-06-19 10:47) committed cleanly and left a backup branch `backup/pre-main-sync-20260619` (its tip `d68f89b` = the pre-sync HEAD). **However, the conditions that *cause* sync weirdness are still live** — see RED FLAGS #1 and #2 (stale ref + GitHub-tracking branch). Those are almost certainly what bit the owner before.

---

## PHASE 2 — What must be preserved (gitignored?) ⭐

`.gitignore` is **identical** in both repos and covers every critical file. All confirmed actively ignored via `git status --ignored` (`!!` flag) in meridianzen2:

| File / dir | In `.gitignore`? | Confirmed ignored (`!!`)? | Notes |
|---|---|---|---|
| `.env` ⭐ (holds `WALLET_PRIVATE_KEY` + `OPENROUTER_API_KEY` + RPC + Telegram) | ✅ `.env`, `.env.*` (`!.env.example`) | ✅ | **wallet key + LLM key live here** |
| `.env.bak.*` | ✅ (`.env.*`) | ✅ | |
| `user-config.json` (active config) | ✅ | ✅ | |
| `gmgn-config.json` | ✅ | (not present) | |
| `presets/` (racikan snapshots — contain keys) | ✅ | ✅ | mainzen_v3.json, Zensmiv1.json, _backup.json |
| `state.json` (open positions) | ✅ | ✅ | |
| `lessons.json` (closed-trade learning) | ✅ | ✅ | |
| `candidate-memory.json` | ✅ | ✅ | |
| `signal-weights.json` | ✅ | ✅ | |
| `pool-memory.json` | ✅ | ✅ | |
| `decision-log.json` | ✅ | ✅ | |
| `sol-balance-history.json` | ✅ | ✅ | |
| `gas-log.json`, `llm-cost-log.json` | ✅ | ✅ | |
| `smart-wallets.json`, `token-blacklist.json`, `strategy-library.json`, `hivemind-cache.json` | ✅ | (not present / absent) | ignored if created |
| `logs/` | ✅ | ✅ | |

⭐ **`.env` (= wallet + OpenRouter key) IS gitignored → NOT a red flag.** Git operations (`fetch`/`checkout`/`pull`) **cannot touch** any file above. There is **no standalone wallet/keypair file** (`find` for `*keypair*`, `*wallet*.json`, `id.json` → none) — the wallet key is a line inside `.env` (`grep -c WALLET_PRIVATE_KEY .env` → 1). **Racikan (`presets/`) and history (`lessons.json`/`state.json`) are safe.**

---

## PHASE 3 — Source of the latest code

**Latest main logic is LOCAL-only on this VPS. GitHub is stale.**

- main (`~/meridianzen`) branch `experimental` HEAD = **`9facff5`** "feat(gap-fix): stamp concentration/age signals into signal_snapshot".
- main is **50 commits ahead of GitHub** `origin/experimental` (= `14e0707`). Evidence: `git branch -vv` → `experimental 9facff5 [origin/experimental: ahead 50]`.
- v3's own object DB does **not** contain `9facff5` yet (`git cat-file -t 9facff5` → *"Not a valid object"*) → v3 has not fetched main's newest commits.

➡️ **Sync method must be: fetch from the LOCAL origin** (`origin = /home/ubuntu/meridianzen`), **NOT from GitHub.** Pulling from GitHub would pull code that is 50 commits behind. This matches the established procedure in memory `meridian-v3-sync-procedure`.

---

## PHASE 4 — Config schema drift → **NONE. No migration needed.** ✅

The config layer is already fully in sync (yesterday's `db4f908` adopted "config-schema"):

- `config.js` is **byte-identical** between repos: md5 `c3b7fddddf967c290c2769b1c5c3175aa` (both).
- `config-schema.js` is **byte-identical**: md5 `40b3433e212517412387b8de5e199fa0` (both). Present in both.
- The pending sync delta (`15cb22d..9facff5`, 8 commits) **touches no config files** and introduces **no new `config.*` references** in any of the 3 changed files (`comm` of `config.X` refs main-vs-v3 for `index.js`, `dlmm.js`, `lessons.js` → all empty).

➡️ **v3's `user-config.json` needs NO new keys for this sync.** It already carries the full current schema (88 key-paths incl. all screening/risk/management/schedule/llm/darwin/chartIndicators/experiment keys; e.g. `minFeeActiveTvlRatio`, `maxPositions`, `positionSizePct`, `stopLossPct`, `takeProfitPct`, `trailingTakeProfit`, `strategyLock`, `promptNotes.*`, `chartIndicators.*`, `darwin*`). Any future-missing key is handled gracefully by `config.js` (`?? default`, per CLAUDE.md). **No CRASH-on-absent key in scope.**

---

## PHASE 5 — PM2 (meridian-v3)

| Field | Value | Evidence |
|---|---|---|
| pm2 id / name | **id 1 / `meridian-v3`** | `pm2 list` |
| Status | **`stopped`** (matches owner; do NOT auto-start) | `pm2 list`, `pm2 describe` |
| Restarts (↺) | 4 (unstable restarts 0) | `pm2 describe` |
| cwd / exec cwd | `/home/ubuntu/meridianzen2` | `pm2 describe` |
| Script | `/home/ubuntu/meridianzen2/index.js` (fork mode) | `pm2 describe` |
| Interpreter | `node` (v20.20.2) | `pm2 describe` |
| Logs | out `~/.pm2/logs/meridian-v3-out.log`, err `…-error.log` | `pm2 describe` |
| Start method | `npm run pm2:start` → `pm2 start ecosystem.config.cjs` (pins name+cwd) | `package.json` scripts |
| Separate env? | **Yes — own `.env`** (31 lines) with its **own** `WALLET_PRIVATE_KEY` (×1) and **own** `OPENROUTER_API_KEY` (×2 lines, separate from main's) | `grep -c` (values not read) |

Main runs as pm2 id 0 `meridian` (online), cwd `/home/ubuntu/meridianzen`. The two are fully independent processes with independent `.env` / wallet / OpenRouter keys.

---

## EXACT SYNC DELTA (what the sync actually brings)

Range `15cb22d..9facff5` (v3's last-synced base → main HEAD) = **8 commits**, the "gap-fix lever A" series:
```
9facff5 feat(gap-fix): stamp concentration/age signals into signal_snapshot
67479f5 docs(gap-fix): phase 4 — lever A verification + restart handoff
97ed560 test(gap-fix): phase 3 — lever A verification
1c21a50 feat(gap-fix): phase 2 — wire emergency direct close into PnL poller (lever A)
f32179a feat(gap-fix): phase 1 — emergencyCloseDirect helper (lever A)
08e7b1d docs(gap-fix): phase 1 — disable dead LPAgent relay on close (lever B)
3e0eba8 docs(audit): phase 2 — screening-rug analysis
05e9184 docs(audit): phase 1 — backtestability map
```
Diffstat (`git diff --stat 15cb22d 9facff5`):
```
 index.js                        |  97 ++++++++++++++++++-   (gap-fix: emergencyCloseDirect + wire into PnL poller + signal_snapshot stamping)
 lessons.js                      |   7 ++
 tools/dlmm.js                   |   8 +++
 notes/*.md (5 files)            | 489 ++++  (dev docs only — no bot behavior)
 8 files changed, 600 insertions(+), 1 deletion(-)
```
Cross-repo file diff confirms only **`index.js`, `lessons.js`, `tools/dlmm.js`** differ in actual code (plus identity files below + divergent `notes/`). **No `config.js`, no `package.json` logic, no new tools, no schema change.**

### Identity files to PRESERVE (must NOT take main's version):
- `ecosystem.config.cjs` — only diff is `name: "meridian"` → must stay **`"meridian-v3"`** (line 8).
- `package.json` — only diff is `pm2:restart`/`pm2:logs` targeting `meridian` → must stay **`meridian-v3`** (lines 15–16). (`name` field is identically `dlmm-agent` in both.)
- `fill-env.sh` — **v3-only**, absent in main; must survive (a `checkout origin/experimental -- .` will not delete it, but verify).

---

## ⭐ SAFE SYNC PLAN (proposed — DO NOT run until owner reviews)

Method: **local fetch + tree checkout + identity restore** (per memory `meridian-v3-sync-procedure`). Run inside `~/meridianzen2`.

0. ✅ Full backup already taken (PHASE 0). Optionally also `bash backup.sh` if present.
1. **Fresh backup branch at current HEAD:** `git branch -f backup/pre-main-sync-20260620 experimental`
   (yesterday's `backup/pre-main-sync-20260619` points at the older `d68f89b` — make a new one at `db4f908`.)
2. **Fetch from LOCAL main:** `git fetch origin` → then **verify** `git rev-parse origin/experimental` == `9facff5` (NOT the stale `15cb22d`). ⚠️ If it's still `15cb22d`, the fetch didn't update — STOP (see RED FLAG #1).
3. **Adopt main's tree:** `git checkout origin/experimental -- .` (gitignored data/secrets untouched).
4. **Restore v3 identity:** `git checkout experimental -- ecosystem.config.cjs package.json` and confirm `fill-env.sh` still present.
5. **Parity check (must be EMPTY):**
   `git diff origin/experimental -- . ':(exclude)ecosystem.config.cjs' ':(exclude)package.json' ':(exclude)fill-env.sh'`
6. **Verify nothing precious staged:** `git status` should show only `index.js`, `lessons.js`, `tools/dlmm.js` (+ optionally `notes/*.md`). Confirm **no** `.env`/`user-config.json`/`state.json`/`lessons.json`/`presets/` appear.
7. **Confirm identity intact:** `grep name ecosystem.config.cjs` → `meridian-v3`; `grep meridian package.json` → `meridian-v3`.
8. **Commit:** `git commit -m "sync(v3): adopt main gap-fix lever A (emergencyCloseDirect + signal_snapshot)"`
9. **Syntax test (no process start):** `npm run test:syntax` (node --check all *.js).
10. **Restart is the OWNER's call** — bot is intentionally stopped. When approved: `npm run pm2:start` (or `pm2 start meridian-v3`), then watch `pm2 logs meridian-v3` for a clean boot. Do **not** auto-start during sync.

**Config migration steps:** NONE (PHASE 4 — no new keys).
**Preserve-list:** everything in PHASE 2 (gitignored, untouched by git) + identity files in the section above.
**Rollback:** `git checkout backup/pre-main-sync-20260620 -- .` then restore identity, or extract the PHASE 0 tarball.

---

## 🚩 RED FLAGS / CAUTIONS

1. 🟡 **STALE tracking ref — the likely cause of past "weirdness".** v3's cached `origin/experimental` = `15cb22d` ("sizing phase 3"), but main is now at `9facff5`. **You MUST `git fetch origin` first**, then verify the ref moved to `9facff5`. Skipping the fetch makes `git checkout origin/experimental -- .` a no-op against old code — looks like "sync did nothing / brought wrong code."
2. 🟡 **`experimental` tracks `github/v3`, NOT local main.** A bare **`git pull` would pull from GitHub (50 commits behind)** and could create a confusing merge. ⚠️ **NEVER `git pull` to sync.** Use the explicit `git fetch origin` + `git checkout origin/experimental -- .` flow only. (This branch-tracking mismatch is the strongest candidate for the owner's remembered sync weirdness.)
3. 🔴 **pm2 identity collision.** Never let main's `ecosystem.config.cjs` (`name: "meridian"`) or `package.json` (`pm2:* → meridian`) overwrite v3's. Always re-`checkout experimental -- ecosystem.config.cjs package.json` after step 3, and verify. Overwriting would point v3's pm2 scripts at the **main** process.
4. 🟡 **`fill-env.sh` is v3-only** — verify it survives the checkout (it should; `checkout … -- .` doesn't delete files absent from the source tree).
5. 🟡 **`notes/` is NOT gitignored and diverges.** The checkout will add main's `notes/*.md` (incl. the 5 gap-fix docs) into v3; v3's own notes are tracked and won't be deleted. Harmless (docs only), but expect `notes/` churn in the commit. **This recon file (`notes/v3-sync-recon.md`) is untracked and will not be removed by the checkout.**
6. 🟢 **Not a red flag (confirmed safe):** `.env`/wallet/`presets/`/all data JSON are gitignored — no git op can touch them. Working tree is clean now (no conflict markers, no stash, no `.orig/.rej`). v3 is correctly `stopped`.

---

## STOP — recon complete. Awaiting owner review before any sync is executed.
Nothing was changed except: (a) `/home/ubuntu/backups/meridianzen2-20260620T021659Z.tar.gz`, (b) this file. No bot touched. No `fetch`/`checkout`/`pull`/`commit` run.
