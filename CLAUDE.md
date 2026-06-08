# Meridian — CLAUDE.md

Autonomous DLMM liquidity provider agent for Meteora pools on Solana.

---

## Architecture Overview

```
index.js            Main entry: REPL + cron orchestration + Telegram bot polling
agent.js            ReAct loop (OpenRouter/OpenAI-compatible): LLM → tool call → repeat
config.js           Runtime config from user-config.json + .env; exposes config object
prompt.js           Builds system prompt per agent role (SCREENER / MANAGER / GENERAL)
state.js            Position registry (state.json): tracks bin ranges, OOR timestamps, notes
lessons.js          Learning engine: records closed-position perf, derives lessons, evolves thresholds
pool-memory.js      Per-pool deploy history + snapshots (pool-memory.json)
strategy-library.js Saved LP strategies (strategy-library.json)
preset-manager.js   Config presets: save/load full user-config.json snapshots (presets/<name>.json)
reports.js          Trade-analytics engine (profit factor, drawdown, breakdowns) + report composer
briefing.js         Daily/weekly/monthly Telegram briefings (HTML)
telegram.js         Telegram bot: polling, notifications (deploy/close/swap/OOR)
hive-mind.js        Optional collective intelligence server sync
smart-wallets.js    KOL/alpha wallet tracker (smart-wallets.json)
token-blacklist.js  Permanent token blacklist (token-blacklist.json)
logger.js           Daily-rotating log files + action audit trail

tools/
  definitions.js    Tool schemas in OpenAI format (what LLM sees)
  executor.js       Tool dispatch: name → fn, safety checks, pre/post hooks
  dlmm.js           Meteora DLMM SDK wrapper (deploy, close, claim, positions, PnL)
  screening.js      Pool discovery from Meteora API
  wallet.js         SOL/token balances (Helius) + Jupiter swap
  token.js          Token info/holders/narrative (Jupiter API)
  study.js          Top LPer study via LPAgent API
```

---

## Agent Roles & Tool Access

Three agent roles filter which tools the LLM can call:

| Role | Purpose | Key Tools |
|------|---------|-----------|
| `SCREENER` | Find and deploy new positions | deploy_position, get_top_candidates, get_token_holders, check_smart_wallets_on_pool, get_time_profile |
| `MANAGER` | Manage open positions | close_position, claim_fees, swap_token, get_position_pnl, set_position_note |
| `GENERAL` | Chat / manual commands | All tools |

Sets defined in `agent.js:6-7`. If you add a tool, also add it to the relevant set(s).

---

## Adding a New Tool

1. **`tools/definitions.js`** — Add OpenAI-format schema object to the `tools` array
2. **`tools/executor.js`** — Add `tool_name: functionImpl` to `toolMap`
3. **`agent.js`** — Add tool name to `MANAGER_TOOLS` and/or `SCREENER_TOOLS` if role-restricted
4. If the tool writes on-chain state, add it to `WRITE_TOOLS` in executor.js for safety checks

---

## Config System

`config.js` loads `user-config.json` at startup. Runtime mutations go through `update_config` tool (executor.js) which:
- Updates the live `config` object immediately
- Persists to `user-config.json`
- Restarts cron jobs if intervals changed

**Valid config keys and their sections:**

| Key | Section | Default |
|-----|---------|---------|
| minFeeActiveTvlRatio | screening | 0.05 |
| minTvl / maxTvl | screening | 10k / 150k |
| minVolume | screening | 500 |
| minOrganic | screening | 60 |
| minHolders | screening | 500 |
| minMcap / maxMcap | screening | 150k / 10M |
| minBinStep / maxBinStep | screening | 80 / 125 |
| timeframe | screening | "5m" |
| category | screening | "trending" |
| minTokenFeesSol | screening | 30 |
| maxBundlersPct | screening | 30 |
| maxTop10Pct | screening | 60 |
| blockedLaunchpads | screening | [] |
| deployAmountSol | management | 0.5 |
| maxDeployAmount | risk | 50 |
| maxPositions | risk | 3 |
| gasReserve | management | 0.2 |
| positionSizePct | management | 0.35 |
| minSolToOpen | management | 0.55 |
| outOfRangeWaitMinutes | management | 30 |
| managementIntervalMin | schedule | 10 |
| screeningIntervalMin | schedule | 30 |
| adaptiveScreening | schedule | false |
| maxScreeningIntervalMin | schedule | 90 |
| managementModel / screeningModel / generalModel | llm | openrouter/healer-alpha |

**`computeDeployAmount(walletSol)`** — scales position size with wallet balance (compounding). Formula: `clamp(deployable × positionSizePct, floor=deployAmountSol, ceil=maxDeployAmount)`.

### Experimental Features (🧪 GRUP 16)

Opt-in experiments live in `config.experiments` and surface as **GRUP 16 — Eksperimen** in `/config` (and in SETTINGS-GUIDE.md → `/guide`). Convention:
- **Every flag defaults to `false`** → OFF = factory behavior: the feature's code path is skipped entirely. Toggling OFF always returns the bot to its pre-feature behavior.
- Keys registered in `CONFIG_MAP` (executor.js) like any other, so `/setcfg` and `update_config` work.
- Code paths must **fail-open** (an error in an experiment never blocks the normal flow).
- Current experiments:
  - `exitLiquidityCheck` (+ `exitLiquidityMaxSlippagePct`): pre-deploy gate in `runSafetyChecks` (executor.js). Probes round-trip cost via `quoteSellPriceImpact()` (wallet.js, read-only Jupiter quotes) and rejects pools too illiquid to exit. Skipped under `DRY_RUN`.
  - `marketRegimeGate` (+ `marketRegimeMaxDrop24hPct`): pre-screening gate in `runScreeningCycle` hard-guards (index.js). Reads SOL's 24h change via `getSolMarketRegime()` (wallet.js, read-only Jupiter price v3 `priceChange24h`); when SOL is down more than the limit, skips the whole screening cycle (no LLM call, logs an `appendDecision` skip). Catches scheduled + freed-slot screening (both route through `runScreeningCycle`); manual chat deploys are not gated. Runs under `DRY_RUN` too (read-only). No price history is stored — the 24h delta comes straight from the API.
  - `candidateMomentum`: soft screening signal in `runScreeningCycle` (index.js). When ON, `recordCandidateSnapshots()` snapshots each fetched candidate's TVL/volume/mcap into `candidate-memory.json` every cycle; `getCandidateMomentum()` + `formatCandidateMomentum()` (candidate-memory.js) then add a `momentum:` line (delta over the retained window) to each candidate block the SCREENER sees. Trusted line (our own metric, not external text), never gates a deploy. Separate store from pool-memory.json (bounded: 8 snapshots/pool, 24h prune). Fail-open; momentum only appears once a pool is seen ≥2 cycles.
  - `convictionSizing` (+ `convictionSizingMaxAdjustPct`): the only experiment that moves real capital. `deploy_position` takes an optional `conviction` enum (low/medium/high); `applyConvictionSizing()` (config.js) nudges the deploy amount by ±`convictionSizingMaxAdjustPct`% (high up, low down) and **re-clamps to `[deployAmountSol, maxDeployAmount]`** so it can never breach min/max sizing. Applied at the top of the `deploy_position` case in `runSafetyChecks` (executor.js) by mutating `args.amount_y` — so every downstream check (single-side, exit-liquidity, SOL balance) validates the adjusted amount. Off / medium / missing conviction → amount unchanged (factory). A gated SCREENER prompt line (prompt.js) tells the model to supply conviction; the tool param is inert when off. Fail-safe.
  - `expectedYieldSignal`: soft SCREENER candidate-block line (proxy of #2 expected-yield-to-me). `formatYieldToMe()` (screening.js, pure) estimates our footprint per candidate from data already on hand — share of pool TVL (`deployAmount × sol_price / tvl`) + fees/window (`deployAmount × fee_active_tvl_ratio`) — and `runScreeningCycle` (index.js) injects a `yield_to_me:` line into both candidate blocks (gmgn + non-gmgn), beside `momentum:`. Trusted line (our own metric). Explicitly labelled a proxy: ignores per-bin liquidity concentration (the accurate version needs SDK bin reserves). Soft, never gates. Fail-open (omits the line on bad inputs); no extra API call (SOL price comes from the already-fetched wallet balance).
  - `smartWalletMomentum`: soft, trusted SCREENER candidate-block line. Tracks each candidate's smart-wallet count (`sw.in_pool.length`) across cycles in a `sw_snaps` buffer inside candidate-memory.json (recorded from `passing` after sw is fetched, via `recordSmartWalletCounts()`). `getSmartWalletMomentum()` / `formatSmartWalletMomentum()` (candidate-memory.js) emit a `sw_momentum:` line when the count moves (entering = bullish, leaving = bearish); flat/unknown → no line. Snapshots accrue only when on (shared candidate-snapshot guard now includes it); pruning is handled by `recordCandidateSnapshots`. Soft, never gates; fail-open.
  - `counterfactualReview` (+ `counterfactualMinMcapGainPct`): reflection signal, reuses candidate-memory (roadmap #8). When on, candidate snapshots are recorded even if `candidateMomentum` is off (shared guard in `runScreeningCycle`). `getSkipReview()` (candidate-memory.js) compares each snapshotted pool's mcap (oldest→newest snap) for pools NOT in `getDeployedPoolAddresses()` (pool-memory.js) — pools we looked at but never entered — and the daily briefing (`buildSkipReviewSection`, briefing.js) reports how many skips later popped (mcap gain ≥ threshold = "ones that got away") vs fell ("good skips"). Short horizon (candidate-memory's 24h retention). Never gates anything; fail-open.
  - `narrativeProfileSignal`: soft SCREENER-prompt hint. `deploy_position` takes an optional `narrative_category` enum (NARRATIVE_CATEGORIES in lessons.js; tagged by the SCREENER, stored via `trackPosition`→`makePositionRecord` and passed through both close paths into `recordPerformance`). `getNarrativeProfile()` / `classifyNarrative()` / `getNarrativeProfileForPrompt()` (lessons.js) mirror the time-of-day functions and bucket closed PnL by category. The flag gates ONLY the prompt line (prompt.js, SCREENER); tagging is collected passively even when off so data accrues. Tool `get_narrative_profile` (SCREENER+GENERAL). Needs ≥8 samples/category; inert until tagged data accrues. Soft, never overrides hard rules.

When adding an experiment: add the flag to `config.experiments` (default false), register in `CONFIG_MAP`, add a row to GRUP 16 in `formatFullConfig()` (index.js), surface it in the `/settings` button menu (the `experiments` page in `renderSettingsMenu()` + register the key in `settingValue()` and `pageForKey()`, all index.js), document a GRUP 16 entry in SETTINGS-GUIDE.md, and make the code path fail-open.

> **Full-sync rule:** any new feature/config that reaches the Telegram bot must be wired across ALL access surfaces, not just some — `CONFIG_MAP` (`/setcfg`, chat), the `update_config` tool description (definitions.js), `formatFullConfig()` (`/config`), the `/settings` button menu (`renderSettingsMenu` + `settingValue` + `pageForKey`), `BOT_COMMANDS`/`/help` (for new commands), and SETTINGS-GUIDE.md (`/guide`). The button menu is the surface most often missed.

---

## Position Lifecycle

1. **Deploy**: `deploy_position` → executor safety checks → `trackPosition()` in state.js → Telegram notify
2. **Monitor**: management cron → `getMyPositions()` → `getPositionPnl()` → OOR detection → pool-memory snapshots
3. **Close**: `close_position` → `recordPerformance()` in lessons.js → auto-swap base token to SOL → Telegram notify
4. **Learn**: `evolveThresholds()` runs on performance data → updates config.screening → persists to user-config.json

---

## Screener Safety Checks (executor.js)

Before `deploy_position` executes:
- `bin_step` must be within `[minBinStep, maxBinStep]`
- Position count must be below `maxPositions` (force-fresh scan, no cache)
- No duplicate pool allowed (same pool_address)
- No duplicate base token allowed (same base_mint in another pool)
- Deploy amount must include positive SOL (`amount_y` or `amount_sol`)
- Range width must be at least the configured safe bins floor (`minBinsBelow`, never below 35)
- Single-side SOL deploys must keep `bins_above=0`
- SOL balance must cover `amount_y + gasReserve`
- `blockedLaunchpads` enforced in `getTopCandidates()` before LLM sees candidates

---

## bins_below Calculation (SCREENER)

Linear formula based on pool volatility (set in screener prompt, `index.js`). The lower/upper bounds are configurable, with a hard safety floor of 35 bins:

```
bins_below = round(minBinsBelow + (volatility / 5) * (maxBinsBelow - minBinsBelow))
clamped to [minBinsBelow, maxBinsBelow]
```

- Volatility must be finite and > 0; zero/missing volatility is treated as an unusable feed
- Low valid volatility → minBinsBelow
- High volatility (5+) → maxBinsBelow
- Any value in between is valid (continuous, not tiered)

---

## Telegram Commands

Handled directly in `index.js` (bypass LLM):

| Command | Action |
|---------|--------|
| `/positions` | List open positions with progress bar |
| `/close <n>` | Close position by list index |
| `/set <n> <note>` | Set note on position by list index |
| `/preset [list\|save\|use\|show\|rm <name>]` | Config presets — save/load full `user-config.json` snapshots (`preset-manager.js`). `use` auto-backs up to `presets/_backup.json` then swaps the file; auto-restarts under pm2 (env-level keys need a fresh process). Same logic in CLI `preset.js` and the `/settings` → **🗂️ Presets** button page: per-preset ▶ load / 🔍 diff / 🗑️ delete (`cfg:preset:ask/go/diff/rmask/rmgo`) + 💾 save-current (`cfg:preset:save` → text-input name via `_pendingInput.action==="presetSave"`). |

Progress bar format: `[████████░░░░░░░░░░░░] 40%` (no bin numbers, no arrows)

---

## Race Condition: Double Deploy

`_screeningLastTriggered` in index.js prevents concurrent screener invocations. Management cycle sets this before triggering screener. Also, `deploy_position` safety check uses `force: true` on `getMyPositions()` for a fresh count.

---

## Bundler Detection (token.js)

Two signals used in `getTokenHolders()`:
- `common_funder` — multiple wallets funded by same source
- `funded_same_window` — multiple wallets funded in same time window

**Thresholds in config**: `maxBundlersPct` (default 30%), `maxTop10Pct` (default 60%)
Jupiter audit API: `botHoldersPercentage` (5–25% is normal for legitimate tokens)

---

## Base Fee Calculation (dlmm.js)

Read from pool object at deploy time:
```js
const baseFactor = pool.lbPair.parameters?.baseFactor ?? 0;
const actualBaseFee = baseFactor > 0
  ? parseFloat((baseFactor * actualBinStep / 1e6 * 100).toFixed(4))
  : null;
```

---

## Model Configuration

- Default model: `process.env.LLM_MODEL` or `openrouter/healer-alpha`
- Fallback on 502/503/529: `stepfun/step-3.5-flash:free` (2nd attempt), then retry
- Per-role models: `managementModel`, `screeningModel`, `generalModel` in user-config.json
- LM Studio: set `LLM_BASE_URL=http://localhost:1234/v1` and `LLM_API_KEY=lm-studio`
- `maxOutputTokens` minimum: 2048 (free models may have lower limits causing empty responses)

---

## Lessons System

`lessons.js` records closed position performance and auto-derives lessons. Key points:
- `getLessonsForPrompt({ agentType })` — injects relevant lessons into system prompt
- `evolveThresholds()` — adjusts screening thresholds based on winners vs losers
- Performance recorded via `recordPerformance()` called from executor.js after `close_position`
- `evolveThresholds()` evolves `minFeeActiveTvlRatio` and `minOrganic` (both real screening filters). The old `maxVolatility` evolution block was removed — the screener never had a max-volatility filter (only `isUsableVolatility()`: finite & > 0), so evolving it was dead code.

---

## Time-of-Day Profile & Adaptive Screening (lessons.js + index.js)

Closed-position performance is bucketed by the **open hour** (deploy time) in **WIB (UTC+7)** into 5 coarse sessions (`dini/pagi/siang/sore/malam`). Coarse buckets, not 24 hours — with sparse data wide buckets are stable.

- **Capture (lessons.js)**: `recordPerformance()` stores `opened_at`, `closed_at`, `open_hour_wib`, `open_session` per record. Requires `deployed_at` to be passed in from both `close_position` paths in `tools/dlmm.js`. Records without an open timestamp are excluded from the profile.
- **Analysis**: `getHourlyProfile()` → per-session win-rate / avg PnL / sample count (tool `get_time_profile`, SCREENER + GENERAL). `classifySession()` → `weak | ok | insufficient`. A session needs `MIN_SESSION_SAMPLES` (8) before it can steer anything; below that = neutral. "weak" = win-rate ≥15pp under overall AND negative avg PnL.
- **Soft brake (prompt.js)**: `getTimeProfileForPrompt()` injects one line into the SCREENER prompt about the current session. Good-to-have signal only — it NEVER overrides hard screening rules.
- **Adaptive interval (index.js)**: when `schedule.adaptiveScreening` is true, the **screening** cron tick is gated by `shouldRunScheduledScreening()`. Effective interval = floor `screeningIntervalMin` … ceiling `maxScreeningIntervalMin`; stretched to the ceiling only during historically weak sessions (saves LLM tokens). Manual mode (default) = fixed `screeningIntervalMin`. **Management & PnL-poll cadence are never throttled**; event-driven screening triggers (freed slot) bypass the gate. The gate reads config live, so toggling needs no cron restart.

---

## Trade Reports & Briefings (reports.js + briefing.js)

`reports.js` is the shared analytics engine — pure functions over the closed-position
`performance[]` array (from lessons.json via `getAllPerformance()`):
- `computeTradeStats(records)` — net/ROI, win rate, **profit factor**, avg win vs avg loss,
  **payoff ratio**, expectancy, **max drawdown**, worst loss streak, biggest win/loss, and
  per-strategy/session/narrative breakdowns.
- `buildRecommendations(perf, stats)` — **profitability-aware**: refuses to suggest bigger
  size while net-negative or profit factor weak; flags the leak (lopsided payoff, tail loss,
  worst strategy, weak session/narrative). Replaced the old win-rate-only logic in the briefing.
- `buildVerdict(stats)` — plain-language health read (catches "high win-rate but net-negative").
- `buildTradeReport(perf, opts)` — composes a full report (stats + verdict + trend + breakdown
  + recs). Shared by the milestone report, `/report`, and weekly/monthly digests.
- `buildRoleCostLines(costData)` — LLM cost **per agent role** by mapping each model back to
  screening/management/general (precise when models differ, labelled estimate when shared).
- `estimateGasSol(counts)` + `GAS_EST_SOL` — rough per-action gas estimate (deploy/close/claim/
  swap × per-action SOL). Precise gas would need per-tx `meta.fee` capture (not yet done).

Briefings (briefing.js):
- **Daily** (`generateBriefing`, cron 01:00 UTC + missed-watchdog): 24h activity/perf, all-time
  stats block + verdict, cleaned lessons (config-change audit excluded → counted), cost section
  (LLM per-role + gas est + net-vs-all-cost), learning/time-profile/skip-review, recommendations.
- **Weekly/Monthly** (`generatePeriodicBriefing`, cron Mon 01:30 / 1st 02:00 UTC): the windowed
  trade report + activity + window cost. Deduped by period key in state.json.
- **Milestone learning report** (`maybeFireLearningReport` in index.js, hooked at end of
  `runManagementCycle`): every `config.reports.learningReportEvery` closes (default 10; 0=off),
  fires once per milestone (`state._lastReportedMilestone` dedup), fail-open.
- **`/report [week|month|day]`** (Telegram + REPL): on-demand; no arg = all-time learning report.
- All briefings auto-pin via `sendAndPinBriefing` (latest pinned, previous unpinned).

Config: `config.reports.{learningReportEvery, learningReportTrendN}` (in CONFIG_MAP).

---

## Hive Mind (hive-mind.js)

Optional feature. Enabled by setting `HIVE_MIND_URL` and `HIVE_MIND_API_KEY` in `.env`.
Syncs lessons/deploys to a shared server, queries consensus patterns.
Not required for normal operation.

---

## Environment Variables

| Var | Required | Purpose |
|-----|----------|---------|
| `WALLET_PRIVATE_KEY` | Yes | Base58 or JSON array private key |
| `RPC_URL` | Yes | Solana RPC endpoint |
| `OPENROUTER_API_KEY` | Yes | LLM API key |
| `TELEGRAM_BOT_TOKEN` | No | Telegram notifications |
| `TELEGRAM_CHAT_ID` | No | Telegram chat target |
| `LLM_BASE_URL` | No | Override for local LLM (e.g. LM Studio) |
| `LLM_MODEL` | No | Override default model |
| `DRY_RUN` | No | Skip all on-chain transactions |
| `HIVE_MIND_URL` | No | Collective intelligence server |
| `HIVE_MIND_API_KEY` | No | Hive mind auth token |
| `HELIUS_API_KEY` | No | Enhanced wallet balance data |

---

## Known Issues / Tech Debt

- `get_wallet_positions` tool (dlmm.js) is in definitions.js but not in MANAGER_TOOLS or SCREENER_TOOLS — only available in GENERAL role.
