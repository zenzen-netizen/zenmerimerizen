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
briefing.js         Daily Telegram briefing (HTML)
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
  - `narrativeProfileSignal`: soft SCREENER-prompt hint. `deploy_position` takes an optional `narrative_category` enum (NARRATIVE_CATEGORIES in lessons.js; tagged by the SCREENER, stored via `trackPosition`→`makePositionRecord` and passed through both close paths into `recordPerformance`). `getNarrativeProfile()` / `classifyNarrative()` / `getNarrativeProfileForPrompt()` (lessons.js) mirror the time-of-day functions and bucket closed PnL by category. The flag gates ONLY the prompt line (prompt.js, SCREENER); tagging is collected passively even when off so data accrues. Tool `get_narrative_profile` (SCREENER+GENERAL). Needs ≥8 samples/category; inert until tagged data accrues. Soft, never overrides hard rules.

When adding an experiment: add the flag to `config.experiments` (default false), register in `CONFIG_MAP`, add a row to GRUP 16 in `formatFullConfig()` (index.js), document a GRUP 16 entry in SETTINGS-GUIDE.md, and make the code path fail-open.

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
