import "./envcrypt.js";
import cron from "node-cron";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import { agentLoop } from "./agent.js";
import { log } from "./logger.js";
import { getMyPositions, closePosition, getActiveBin } from "./tools/dlmm.js";
import { getWalletBalances, getSolMarketRegime } from "./tools/wallet.js";
import { getTopCandidates, formatYieldToMe } from "./tools/screening.js";
import { confirmIndicatorPreset } from "./tools/chart-indicators.js";
import { formatGmgnCandidateForPrompt } from "./tools/gmgn.js";
import { config, reloadScreeningThresholds, computeDeployAmount, persistConfigChange } from "./config.js";
import { getGasStats } from "./gas-tracker.js";
import { evolveThresholds, getPerformanceSummary, getModePerformance, listLessons, classifySession, currentWibSession } from "./lessons.js";
import { buildTradeReport } from "./reports.js";
import { executeTool, registerCronRestarter } from "./tools/executor.js";
import {
  startPolling,
  stopPolling,
  sendMessage,
  sendMessageWithButtons,
  sendHTML,
  editMessage,
  editMessageWithButtons,
  answerCallbackQuery,
  notifyOutOfRange,
  isEnabled as telegramEnabled,
  createLiveMessage,
  pinMessage,
  unpinMessage,
} from "./telegram.js";
import { generateBriefing, generatePeriodicBriefing } from "./briefing.js";
import { renderGuide } from "./guide.js";
import { getLastBriefingDate, setLastBriefingDate, getLastBriefingPinId, setLastBriefingPinId, getLastReportedMilestone, setLastReportedMilestone, getLastPeriodicBriefing, setLastPeriodicBriefing, getTrackedPosition, getTrackedPositions, setPositionInstruction, updatePnlAndCheckExits, queuePeakConfirmation, resolvePendingPeak, queueTrailingDropConfirmation, resolvePendingTrailingDrop } from "./state.js";
import { getActiveStrategy } from "./strategy-library.js";
import { listPresets, savePreset, applyPreset, getPresetDiff, deletePreset, validName, presetExists, getActiveSetupStatus, formatIdentity } from "./preset-manager.js";
import { recordPositionSnapshot, recallForPool, addPoolNote } from "./pool-memory.js";
import { isPaperMode } from "./paper-trading.js";
import { recordCandidateSnapshots, getCandidateMomentum, formatCandidateMomentum, recordSmartWalletCounts, getSmartWalletMomentum, formatSmartWalletMomentum } from "./candidate-memory.js";
import { checkSmartWalletsOnPool } from "./smart-wallets.js";
import { getTokenNarrative, getTokenInfo } from "./tools/token.js";
import { stageSignals } from "./signal-tracker.js";
import { getWeightsSummary } from "./signal-weights.js";
import { bootstrapHiveMind, ensureAgentId, getHiveMindPullMode, isHiveMindEnabled, pullHiveMindLessons, pullHiveMindPresets, registerHiveMindAgent, startHiveMindBackgroundSync } from "./hivemind.js";
import { appendDecision } from "./decision-log.js";
import { formatSolTracker } from "./sol-tracker.js";
import { formatPnlTracker } from "./pnl-tracker.js";
import { getOpenRouterBalance, getOpenRouterCredits } from "./openrouter-usage.js";

import { REPO_ROOT, repoPath } from "./repo-root.js";

const entrypointPath = process.env.pm_exec_path || process.argv[1];
const indexPath = fileURLToPath(import.meta.url);
const isMain = process.env.pm_id != null
  || (entrypointPath ? path.resolve(entrypointPath) === indexPath : false);

if (isMain) {
  log("startup", "DLMM LP Agent starting...");
  log("startup", `Repo: ${REPO_ROOT} | cwd: ${process.cwd()}${process.env.pm_id ? ` | PM2 id: ${process.env.pm_id}` : ""}`);
  if (path.resolve(process.cwd()) !== path.resolve(REPO_ROOT)) {
    log("startup_warn", `process.cwd() differs from repo root — use "npm run pm2:start" (not "pm2 start index.js" from another directory)`);
  }
  log("startup", `Mode: ${process.env.DRY_RUN === "true" ? "DRY RUN" : "LIVE"}`);
  log("startup", `Model: ${process.env.LLM_MODEL || "hermes-3-405b"}`);
  ensureAgentId();
  bootstrapHiveMind().catch((error) => log("hivemind_warn", `Bootstrap failed: ${error.message}`));
  startHiveMindBackgroundSync();
}

const TP_PCT = config.management.takeProfitPct;
const DEPLOY = config.management.deployAmountSol;

// ═══════════════════════════════════════════
//  CYCLE TIMERS
// ═══════════════════════════════════════════
const timers = {
  managementLastRun: null,
  screeningLastRun: null,
};

function nextRunIn(lastRun, intervalMin) {
  if (!lastRun) return intervalMin * 60;
  const elapsed = (Date.now() - lastRun) / 1000;
  return Math.max(0, intervalMin * 60 - elapsed);
}

function formatCountdown(seconds) {
  if (seconds <= 0) return "now";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function buildPrompt() {
  const mgmt = formatCountdown(nextRunIn(timers.managementLastRun, config.schedule.managementIntervalMin));
  const scrn = formatCountdown(nextRunIn(timers.screeningLastRun, config.schedule.screeningIntervalMin));
  return `[manage: ${mgmt} | screen: ${scrn}]\n> `;
}

// ═══════════════════════════════════════════
//  CRON DEFINITIONS
// ═══════════════════════════════════════════
let _cronTasks = [];
let _managementBusy = false; // prevents overlapping management cycles
let _screeningBusy = false;  // prevents overlapping screening cycles
let _screeningLastTriggered = 0; // epoch ms — prevents management from spamming screening
let _pollTriggeredAt = 0; // epoch ms — cooldown for poller-triggered management
const _peakConfirmTimers = new Map();
const _trailingDropConfirmTimers = new Map();
const TRAILING_PEAK_CONFIRM_DELAY_MS = 15_000;
const TRAILING_PEAK_CONFIRM_TOLERANCE = 0.85;
const TRAILING_DROP_CONFIRM_DELAY_MS = 15_000;
const TRAILING_DROP_CONFIRM_TOLERANCE_PCT = 1.0;

/** Strip <think>...</think> reasoning blocks that some models leak into output */
function stripThink(text) {
  if (!text) return text;
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function sanitizeUntrustedPromptText(text, maxLen = 500) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[<>`]/g, "")
    .trim()
    .slice(0, maxLen);
  return cleaned ? JSON.stringify(cleaned) : null;
}

function shouldUsePnlRecheck() {
  return !config.api.lpAgentRelayEnabled;
}

function schedulePeakConfirmation(positionAddress) {
  if (!positionAddress || _peakConfirmTimers.has(positionAddress)) return;

  const timer = setTimeout(async () => {
    _peakConfirmTimers.delete(positionAddress);
    try {
      const result = await getMyPositions({ force: true, silent: true }).catch(() => null);
      const position = result?.positions?.find((p) => p.position === positionAddress);
      resolvePendingPeak(positionAddress, position?.pnl_pct ?? null, TRAILING_PEAK_CONFIRM_TOLERANCE);
    } catch (error) {
      log("state_warn", `Peak confirmation failed for ${positionAddress}: ${error.message}`);
    }
  }, TRAILING_PEAK_CONFIRM_DELAY_MS);

  _peakConfirmTimers.set(positionAddress, timer);
}

function scheduleTrailingDropConfirmation(positionAddress) {
  if (!positionAddress || _trailingDropConfirmTimers.has(positionAddress)) return;

  const timer = setTimeout(async () => {
    _trailingDropConfirmTimers.delete(positionAddress);
    try {
      const result = await getMyPositions({ force: true, silent: true }).catch(() => null);
      const position = result?.positions?.find((p) => p.position === positionAddress);
      const resolved = resolvePendingTrailingDrop(
        positionAddress,
        position?.pnl_pct ?? null,
        config.management.trailingDropPct,
        TRAILING_DROP_CONFIRM_TOLERANCE_PCT,
      );
      if (resolved?.confirmed) {
        log("state", `[Trailing recheck] Confirmed trailing exit for ${positionAddress} — triggering management`);
        runManagementCycle({ silent: true }).catch((e) => log("cron_error", `Trailing recheck management failed: ${e.message}`));
      }
    } catch (error) {
      log("state_warn", `Trailing drop confirmation failed for ${positionAddress}: ${error.message}`);
    }
  }, TRAILING_DROP_CONFIRM_DELAY_MS);

  _trailingDropConfirmTimers.set(positionAddress, timer);
}

/**
 * Send a briefing and keep only the latest one pinned: pin the new message (the
 * first chunk = top of the report), unpin the previous briefing pin, and remember
 * the new id. Pinning is best-effort — any failure (Telegram off, missing pin
 * rights) is logged and never breaks the briefing send.
 */
async function sendAndPinBriefing(briefing) {
  const sent = await sendHTML(briefing);
  const msgId = sent?.firstMessageId ?? sent?.result?.message_id ?? null;
  if (!msgId) return sent;
  try {
    const prev = getLastBriefingPinId();
    await pinMessage(msgId);
    if (prev && prev !== msgId) await unpinMessage(prev);
    setLastBriefingPinId(msgId);
  } catch (error) {
    log("cron_error", `Briefing pin failed (continuing): ${error.message}`);
  }
  return sent;
}

/**
 * Milestone learning report: every `learningReportEvery` closed positions (10,
 * 20, 30…), fire a deep trade review once. Idempotent via a persisted milestone
 * counter so it never double-sends across restarts/cycles. Fail-open — never
 * blocks the management flow. learningReportEvery=0 disables it (/report still works).
 */
async function maybeFireLearningReport() {
  try {
    const every = config.reports?.learningReportEvery ?? 0;
    if (!every || every < 1) return;
    const perf = getModePerformance();  // mode-scoped: paper closes milestone in dry-run, live in live
    const milestone = Math.floor(perf.length / every) * every;
    if (milestone < every) return;                       // first milestone not reached
    if (milestone <= getLastReportedMilestone()) return; // already reported this milestone
    const report = buildTradeReport(perf, {
      title: `🎓 Learning Report — ${milestone} closed positions`,
      statsLabel: "All-time",
      trendN: config.reports?.learningReportTrendN ?? 10,
      identity: formatIdentity(),
    });
    if (telegramEnabled() && report) await sendHTML(report);
    setLastReportedMilestone(milestone);
    log("cron", `Learning report fired at milestone ${milestone} closes`);
  } catch (error) {
    log("cron_error", `Learning report failed (fail-open): ${error.message}`);
  }
}

/**
 * On-demand /report. No arg = all-time learning report; `week`/`month`/`day` (and
 * ID synonyms) produce the richer windowed periodic digest (activity + cost too).
 * Async because the windowed digest fetches cost/wallet data.
 */
async function buildReportForArg(arg = "") {
  const a = String(arg).trim().toLowerCase();
  if (["week", "weekly", "7d", "minggu", "mingguan"].includes(a)) return generatePeriodicBriefing("week");
  if (["month", "monthly", "30d", "bulan", "bulanan"].includes(a)) return generatePeriodicBriefing("month");
  if (["day", "today", "24h", "hari", "harian"].includes(a)) return generatePeriodicBriefing("day");
  const modePerf = getModePerformance();
  const rep = buildTradeReport(modePerf, { title: "🎓 Trade Report (all-time)", statsLabel: "All-time", trendN: config.reports?.learningReportTrendN ?? 10, identity: formatIdentity() });
  const tracker = formatPnlTracker(modePerf);
  return tracker ? `${rep}\n\n${tracker}` : rep;
}

/**
 * Scheduled weekly/monthly digest. Deduped by period key (the week's Monday date
 * or "YYYY-MM") so a restart near the cron tick won't re-send. Pinned like the
 * daily briefing (latest digest stays pinned). Fail-open.
 */
async function runPeriodicBriefing(period) {
  try {
    const now = new Date();
    let key;
    if (period === "month") {
      key = now.toISOString().slice(0, 7); // YYYY-MM
    } else {
      const d = new Date(now); const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
      d.setUTCDate(d.getUTCDate() - dow);
      key = d.toISOString().slice(0, 10); // this week's Monday (UTC)
    }
    if (getLastPeriodicBriefing(period) === key) return; // already sent this period
    log("cron", `Starting ${period} briefing (${key})`);
    const html = await generatePeriodicBriefing(period);
    if (telegramEnabled()) await sendAndPinBriefing(html);
    setLastPeriodicBriefing(period, key);
  } catch (error) {
    log("cron_error", `${period} briefing failed: ${error.message}`);
  }
}

/**
 * gasReserve auto-tune (default OFF). When on, right-sizes gasReserve from REAL
 * measured gas burn: keep `gasReserveBufferDays` of runway, never below
 * `gasReserveFloorSol`. Only adjusts on a meaningful change (>20% and >0.005 SOL)
 * to avoid churn. Needs ≥8 real gas records. Fail-open. OFF = gasReserve untouched.
 */
async function maybeAutoTuneGasReserve() {
  try {
    if (!config.management?.gasReserveAutoTune) return;
    const sinceMs = Date.now() - 7 * 86400000;
    const stats = getGasStats(sinceMs);
    if (!stats.hasData || stats.count < 8) return;
    const firstMs = Math.max(sinceMs, new Date(stats.firstTs).getTime());
    const spanDays = Math.min(7, Math.max(1, (Date.now() - firstMs) / 86400000));
    const dailyBurn = stats.sol / spanDays;
    if (dailyBurn <= 0) return;
    const buffer = config.management.gasReserveBufferDays ?? 14;
    const floor = config.management.gasReserveFloorSol ?? 0.03;
    const target = parseFloat(Math.max(floor, dailyBurn * buffer).toFixed(3));
    const current = config.management.gasReserve;
    if (Math.abs(target - current) / Math.max(current, 0.001) < 0.2 || Math.abs(target - current) < 0.005) return;
    persistConfigChange("management", "gasReserve", "gasReserve", target);
    log("cron", `gasReserve auto-tuned ${current} → ${target} SOL (burn ${dailyBurn.toFixed(5)}/d × ${buffer}d, floor ${floor})`);
    if (telegramEnabled()) sendMessage(`🪫 gasReserve auto-tuned: ${current} → ${target} SOL (≈${buffer}d runway @ ${dailyBurn.toFixed(5)} SOL/hari, dari gas nyata)`).catch(() => {});
  } catch (error) {
    log("cron_error", `gasReserve auto-tune failed (fail-open): ${error.message}`);
  }
}

async function runBriefing() {
  log("cron", "Starting morning briefing");
  await maybeAutoTuneGasReserve(); // daily, before composing the briefing
  try {
    const briefing = await generateBriefing();
    if (telegramEnabled()) {
      await sendAndPinBriefing(briefing);
    }
    setLastBriefingDate();
  } catch (error) {
    log("cron_error", `Morning briefing failed: ${error.message}`);
  }
}

/**
 * If the agent restarted after the 1:00 AM UTC cron window,
 * fire the briefing immediately on startup so it's never skipped.
 */
async function maybeRunMissedBriefing() {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const lastSent = getLastBriefingDate();

  if (lastSent === todayUtc) return; // already sent today

  // Only fire if it's past the scheduled time (1:00 AM UTC)
  const nowUtc = new Date();
  const briefingHourUtc = 1;
  if (nowUtc.getUTCHours() < briefingHourUtc) return; // too early, cron will handle it

  log("cron", `Missed briefing detected (last sent: ${lastSent || "never"}) — sending now`);
  await runBriefing();
}

function stopCronJobs() {
  for (const task of _cronTasks) task.stop();
  if (_cronTasks._pnlPollInterval) clearInterval(_cronTasks._pnlPollInterval);
  _cronTasks = [];
}

export async function runManagementCycle({ silent = false } = {}) {
  if (_managementBusy) return null;
  _managementBusy = true;
  timers.managementLastRun = Date.now();
  log("cron", "Starting management cycle");
  let mgmtReport = null;
  let positions = [];
  let liveMessage = null;
  const screeningCooldownMs = 5 * 60 * 1000;

  try {
    if (!silent && telegramEnabled()) {
      liveMessage = await createLiveMessage("🔄 Management Cycle", "Evaluating positions...");
    }
    const livePositions = await getMyPositions({ force: true }).catch(() => null);
    positions = livePositions?.positions || [];

    if (positions.length === 0) {
      // 🧪 Idle-screening cooldown (experiment, default OFF = factory: always trigger).
      // When ON, throttle the idle (0-position) screening trigger so we don't fire a
      // screening LLM call on EVERY management tick during a long dry spell. Shares
      // _screeningLastTriggered with scheduled/freed-slot screening, so the scheduled
      // cron still runs underneath. Fail-open: any error → fall through to triggering.
      let idleOnCooldown = false;
      try {
        if (config.experiments?.idleScreeningCooldown) {
          const cooldownMs = Math.max(0, Number(config.experiments.idleScreeningCooldownMin ?? 20)) * 60 * 1000;
          if (cooldownMs > 0 && Date.now() - _screeningLastTriggered < cooldownMs) idleOnCooldown = true;
        }
      } catch { idleOnCooldown = false; }
      if (idleOnCooldown) {
        const waitedMin = Math.round((Date.now() - _screeningLastTriggered) / 60000);
        log("cron", `No open positions — idle screening on cooldown (${waitedMin}m < ${config.experiments.idleScreeningCooldownMin}m), skipping`);
        mgmtReport = "No open positions. Idle screening on cooldown.";
        return mgmtReport;
      }
      log("cron", "No open positions — triggering screening cycle");
      mgmtReport = "No open positions. Triggering screening cycle.";
      runScreeningCycle().catch((e) => log("cron_error", `Triggered screening failed: ${e.message}`));
      return mgmtReport;
    }

    // Snapshot + load pool memory. Sim (paper) positions never WRITE to
    // pool-memory.json (would bias live screening if this box is flipped live);
    // reads (recallForPool) stay — they just return whatever live history exists.
    const positionData = positions.map((p) => {
      if (!isPaperMode()) recordPositionSnapshot(p.pool, p);
      return { ...p, recall: recallForPool(p.pool) };
    });

    // JS trailing TP check
    const exitMap = new Map();
    for (const p of positionData) {
      if (
        !p.pnl_pct_suspicious &&
        queuePeakConfirmation(p.position, p.pnl_pct, { immediate: !shouldUsePnlRecheck() }) &&
        shouldUsePnlRecheck()
      ) {
        schedulePeakConfirmation(p.position);
      }
      const exit = updatePnlAndCheckExits(p.position, p, config.management);
      if (exit) {
        if (exit.action === "TRAILING_TP" && exit.needs_confirmation && shouldUsePnlRecheck()) {
          if (queueTrailingDropConfirmation(p.position, exit.peak_pnl_pct, exit.current_pnl_pct, config.management.trailingDropPct)) {
            scheduleTrailingDropConfirmation(p.position);
          }
          continue;
        }
        exitMap.set(p.position, exit.reason);
        log("state", `Exit alert for ${p.pair}: ${exit.reason}`);
      }
    }

    // ── Deterministic rule checks (no LLM) ──────────────────────────
    // action: CLOSE | CLAIM | STAY | INSTRUCTION (needs LLM)
    const actionMap = new Map();
    for (const p of positionData) {
      // Hard exit — highest priority
      if (exitMap.has(p.position)) {
        actionMap.set(p.position, { action: "CLOSE", rule: "exit", reason: exitMap.get(p.position) });
        continue;
      }
      // Instruction-set — pass to LLM, can't parse in JS
      if (p.instruction) {
        actionMap.set(p.position, { action: "INSTRUCTION" });
        continue;
      }

      const closeRule = getDeterministicCloseRule(p, config.management);
      if (closeRule) {
        actionMap.set(p.position, closeRule);
        continue;
      }
      // Indicator-driven exit (opt-in, default OFF) — checked after the hard
      // deterministic rules so safety exits always win; only upgrades a STAY/CLAIM.
      const indicatorExit = await getIndicatorExitSignal(p);
      if (indicatorExit) {
        actionMap.set(p.position, indicatorExit);
        continue;
      }
      // Claim rule
      if ((p.unclaimed_fees_usd ?? 0) >= config.management.minClaimAmount) {
        actionMap.set(p.position, { action: "CLAIM" });
        continue;
      }
      actionMap.set(p.position, { action: "STAY" });
    }

    // ── Build JS report ──────────────────────────────────────────────
    const totalValue = positionData.reduce((s, p) => s + (p.total_value_usd ?? 0), 0);
    const totalUnclaimed = positionData.reduce((s, p) => s + (p.unclaimed_fees_usd ?? 0), 0);

    const reportLines = positionData.map((p) => {
      const act = actionMap.get(p.position);
      const inRange = p.in_range ? "🟢 IN" : `🔴 OOR ${p.minutes_out_of_range ?? 0}m`;
      const val = config.management.solMode ? `◎${p.total_value_usd ?? "?"}` : `$${p.total_value_usd ?? "?"}`;
      const unclaimed = config.management.solMode ? `◎${p.unclaimed_fees_usd ?? "?"}` : `$${p.unclaimed_fees_usd ?? "?"}`;
      const statusLabel = act.action === "INSTRUCTION" ? "HOLD (instruction)" : act.action;
      let line = `**${p.pair}** | Age: ${p.age_minutes ?? "?"}m | Val: ${val} | Unclaimed: ${unclaimed} | PnL: ${p.pnl_pct ?? "?"}% | Yield: ${p.fee_per_tvl_24h ?? "?"}% | ${inRange} | ${statusLabel}`;
      if (p.instruction) line += `\nNote: "${p.instruction}"`;
      if (act.action === "CLOSE" && act.rule === "exit") line += `\n⚡ Trailing TP: ${act.reason}`;
      if (act.action === "CLOSE" && act.rule && act.rule !== "exit") line += `\nRule ${act.rule}: ${act.reason}`;
      if (act.action === "CLAIM") line += `\n→ Claiming fees`;
      return line;
    });

    const needsAction = [...actionMap.values()].filter(a => a.action !== "STAY");
    const actionSummary = needsAction.length > 0
      ? needsAction.map(a => a.action === "INSTRUCTION" ? "EVAL instruction" : `${a.action}${a.reason ? ` (${a.reason})` : ""}`).join(", ")
      : "no action";

    const cur = config.management.solMode ? "◎" : "$";
    mgmtReport = reportLines.join("\n\n") +
      `\n\nSummary: 💼 ${positions.length} positions | ${cur}${totalValue.toFixed(4)} | fees: ${cur}${totalUnclaimed.toFixed(4)} | ${actionSummary}`;

    // ── Call LLM only if action needed ──────────────────────────────
    const actionPositions = positionData.filter(p => {
      const a = actionMap.get(p.position);
      return a.action !== "STAY";
    });

    if (actionPositions.length > 0) {
      log("cron", `Management: ${actionPositions.length} action(s) needed — invoking LLM [model: ${config.llm.managementModel}]`);

      const actionBlocks = actionPositions.map((p) => {
        const act = actionMap.get(p.position);
        return [
          `POSITION: ${p.pair} (${p.position})`,
          `  pool: ${p.pool}`,
          `  action: ${act.action}${act.rule && act.rule !== "exit" ? ` — Rule ${act.rule}: ${act.reason}` : ""}${act.rule === "exit" ? ` — ⚡ Trailing TP: ${act.reason}` : ""}`,
          `  pnl_pct: ${p.pnl_pct}% | unclaimed_fees: ${cur}${p.unclaimed_fees_usd} | value: ${cur}${p.total_value_usd} | fee_per_tvl_24h: ${p.fee_per_tvl_24h ?? "?"}%`,
          `  bins: lower=${p.lower_bin} upper=${p.upper_bin} active=${p.active_bin} | oor_minutes: ${p.minutes_out_of_range ?? 0}`,
          p.instruction ? `  instruction: "${p.instruction}"` : null,
        ].filter(Boolean).join("\n");
      }).join("\n\n");

      const { content } = await agentLoop(`
MANAGEMENT ACTION REQUIRED — ${actionPositions.length} position(s)

${actionBlocks}

RULES:
- CLOSE: call close_position only — it handles fee claiming internally, do NOT call claim_fees first
- CLAIM: call claim_fees with position address
- INSTRUCTION: evaluate the instruction condition. If met → close_position. If not → HOLD, do nothing.
- ⚡ exit alerts: close immediately, no exceptions

Execute the required actions. Do NOT re-evaluate CLOSE/CLAIM — rules already applied. Just execute.
After executing, write a brief one-line result per position.
      `, config.llm.maxSteps, [], "MANAGER", config.llm.managementModel, 2048, {
        onToolStart: async ({ name }) => { await liveMessage?.toolStart(name); },
        onToolFinish: async ({ name, result, success }) => { await liveMessage?.toolFinish(name, result, success); },
      });

      mgmtReport += `\n\n${content}`;
    } else {
      log("cron", "Management: all positions STAY — skipping LLM");
      await liveMessage?.note("No tool actions needed.");
    }

    // Trigger screening after management
    const afterPositions = await getMyPositions({ force: true }).catch(() => null);
    const afterCount = afterPositions?.positions?.length ?? 0;
    if (afterCount < config.risk.maxPositions && Date.now() - _screeningLastTriggered > screeningCooldownMs) {
      log("cron", `Post-management: ${afterCount}/${config.risk.maxPositions} positions — triggering screening`);
      runScreeningCycle().catch((e) => log("cron_error", `Triggered screening failed: ${e.message}`));
    }
  } catch (error) {
    log("cron_error", `Management cycle failed: ${error.message}`);
    mgmtReport = `Management cycle failed: ${error.message}`;
  } finally {
    _managementBusy = false;
    if (!silent && telegramEnabled()) {
      if (mgmtReport) {
        if (liveMessage) await liveMessage.finalize(stripThink(mgmtReport)).catch(() => {});
        else sendMessage(`🔄 Management Cycle\n\n${stripThink(mgmtReport)}`).catch(() => { });
      } else if (liveMessage) {
        // Any return path that skipped setting a report must still close the live
        // message, or its typing-indicator timer leaks forever (4s sendChatAction
        // loop → Telegram 429 storm once a few leak).
        await liveMessage.finalize("(cycle ended without report)").catch(() => {});
      }
      for (const p of positions) {
        if (!p.in_range && p.minutes_out_of_range >= config.management.outOfRangeWaitMinutes) {
          notifyOutOfRange({ pair: p.pair, minutesOOR: p.minutes_out_of_range }).catch(() => { });
        }
      }
    }
    drainTelegramQueue().catch(() => {});
  }
  // After the cycle settles (closes may have happened) check the close-count
  // milestone and fire the learning report if a new one was crossed.
  await maybeFireLearningReport();
  return mgmtReport;
}

export async function runScreeningCycle({ silent = false } = {}) {
  if (_screeningBusy) {
    log("cron", "Screening skipped — previous cycle still running");
    return null;
  }
  _screeningBusy = true; // set immediately — prevents TOCTOU race with concurrent callers
  _screeningLastTriggered = Date.now();

  // Hard guards — don't even run the agent if preconditions aren't met
  let prePositions, preBalance;
  let liveMessage = null;
  let screenReport = null;
  try {
    [prePositions, preBalance] = await Promise.all([getMyPositions({ force: true }), getWalletBalances()]);
    if (prePositions.total_positions >= config.risk.maxPositions) {
      log("cron", `Screening skipped — max positions reached (${prePositions.total_positions}/${config.risk.maxPositions})`);
      screenReport = `Screening skipped — max positions reached (${prePositions.total_positions}/${config.risk.maxPositions}).`;
      appendDecision({
        type: "skip",
        actor: "SCREENER",
        summary: "Screening skipped",
        reason: `Max positions reached (${prePositions.total_positions}/${config.risk.maxPositions})`,
      });
      _screeningBusy = false;
      return screenReport;
    }
    const minRequired = config.management.deployAmountSol + config.management.gasReserve;
    const isDryRun = process.env.DRY_RUN === "true";
    if (!isDryRun && preBalance.sol < minRequired) {
      log("cron", `Screening skipped — insufficient SOL (${preBalance.sol.toFixed(3)} < ${minRequired} needed for deploy + gas)`);
      screenReport = `Screening skipped — insufficient SOL (${preBalance.sol.toFixed(3)} < ${minRequired} needed for deploy + gas).`;
      appendDecision({
        type: "skip",
        actor: "SCREENER",
        summary: "Screening skipped",
        reason: `Insufficient SOL (${preBalance.sol.toFixed(3)} < ${minRequired})`,
      });
      _screeningBusy = false;
      return screenReport;
    }

    // ─── 🧪 Experiment #4: market regime gate ─────────────────
    // OFF by default → skipped entirely (factory behavior). When ON, read SOL's
    // 24h price change (Jupiter price, read-only). If SOL is down more than the
    // limit, the market is risk-off — skip the whole screening cycle (no LLM
    // call, no new deploy). Catches scheduled + freed-slot screening. Fail-open:
    // a price hiccup must never block screening, so wrap and swallow errors here.
    if (config.experiments?.marketRegimeGate) {
      try {
        const maxDrop = Number(config.experiments.marketRegimeMaxDrop24hPct ?? 8);
        const regime = await getSolMarketRegime();
        if (regime && Number.isFinite(regime.change24hPct) && regime.change24hPct < -maxDrop) {
          const msg = `risk-off: SOL ${regime.change24hPct.toFixed(1)}% (24h) < -${maxDrop}% limit`;
          log("experiment", `marketRegimeGate: skipping screening — ${msg}`);
          screenReport = `🧪 Screening skipped — market ${msg} (experimental gate).`;
          appendDecision({
            type: "skip",
            actor: "SCREENER",
            summary: "Screening skipped",
            reason: `🧪 market ${msg}`,
          });
          _screeningBusy = false;
          return screenReport;
        }
        if (regime) {
          log("experiment", `marketRegimeGate: SOL ${regime.change24hPct.toFixed(1)}% (24h) — risk-on (limit -${maxDrop}%)`);
        }
      } catch (e) {
        log("experiment", `marketRegimeGate failed — allowing screening (fail-open): ${e.message}`);
      }
    }
  } catch (e) {
    log("cron_error", `Screening pre-check failed: ${e.message}`);
    screenReport = `Screening pre-check failed: ${e.message}`;
    _screeningBusy = false;
    return screenReport;
  }
  if (!silent && telegramEnabled()) {
    liveMessage = await createLiveMessage("🔍 Screening Cycle", "Scanning candidates...");
  }
  timers.screeningLastRun = Date.now();
  log("cron", `Starting screening cycle [model: ${config.llm.screeningModel}]`);
  try {
    // Reuse pre-fetched balance — no extra RPC call needed
    const currentBalance = preBalance;
    const deployAmount = computeDeployAmount(currentBalance.sol);
    log("cron", `Computed deploy amount: ${deployAmount} SOL (wallet: ${currentBalance.sol} SOL)`);

    // Load active strategy
    const activeStrategy = getActiveStrategy();
    const deployStrategy = config.strategy.strategy;
    const strategyBlock = `DEPLOY STRATEGY: ${deployStrategy} (from config) | bins_above: 0 (FIXED — never change) | deposit: SOL only (amount_y, amount_x=0)`
      + (activeStrategy ? `\nSTRATEGY CONTEXT: ${activeStrategy.name} — entry: ${activeStrategy.entry?.condition || "n/a"} | exit: ${activeStrategy.exit?.notes || "n/a"} | best for: ${activeStrategy.best_for}` : "");

    // Fetch top candidates, then recon each sequentially with a small delay to avoid 429s
    const topCandidates = await getTopCandidates({ limit: 10 }).catch((e) => ({ _error: e.message }));
    if (topCandidates?._error) {
      screenReport = `Screening failed: ${topCandidates._error}`;
      return screenReport;
    }
    const candidates = (topCandidates?.candidates || topCandidates?.pools || []).slice(0, 10);

    // 🔬 Shadow-logging data layer: ALWAYS record candidate snapshots (cheap, 24h
    // ephemeral) so momentum / sw-momentum / counterfactual have data to read AND
    // so we can freeze a pool's signal values onto a position at deploy — even when
    // the experiments are OFF (recording ≠ influencing; deploys stay neutral).
    // The experiment flags now only gate whether the signal is shown to the LLM.
    // Fail-open: a snapshot hiccup must never derail screening.
    try {
      recordCandidateSnapshots(candidates);
    } catch (e) {
      log("experiment", `candidate snapshot failed — continuing (fail-open): ${e.message}`);
    }

    const earlyFilteredExamples = topCandidates?.filtered_examples || [];
    const gmgnStageCounts = topCandidates?.stage_counts ?? null;
    const gmgnAllFiltered = topCandidates?.all_filtered ?? [];

    const allCandidates = [];
    for (const pool of candidates) {
      const mint = pool.base?.mint;
      const [smartWallets, narrative, tokenInfo] = await Promise.allSettled([
        checkSmartWalletsOnPool({ pool_address: pool.pool }),
        mint ? getTokenNarrative({ mint }) : Promise.resolve(null),
        mint ? getTokenInfo({ query: mint }) : Promise.resolve(null),
      ]);
      allCandidates.push({
        pool,
        sw: smartWallets.status === "fulfilled" ? smartWallets.value : null,
        n: narrative.status === "fulfilled" ? narrative.value : null,
        ti: tokenInfo.status === "fulfilled" ? tokenInfo.value?.results?.[0] : null,
        mem: recallForPool(pool.pool),
      });
      await new Promise(r => setTimeout(r, 150)); // avoid 429s
    }

    // Hard filters after token recon — block launchpads and excessive Jupiter bot holders
    // Skipped for GMGN: platforms already filtered upstream; bundler/bot data from GMGN pipeline
    const filteredOut = [];
    const passing = allCandidates.filter(({ pool, ti }) => {
      if (pool.gmgn) return true;
      const launchpad = ti?.launchpad ?? null;
      if (launchpad && config.screening.allowedLaunchpads?.length > 0 && !config.screening.allowedLaunchpads.includes(launchpad)) {
        log("screening", `Skipping ${pool.name} — launchpad ${launchpad} not in allow-list`);
        filteredOut.push({ name: pool.name, reason: `launchpad ${launchpad} not in allow-list` });
        return false;
      }
      if (launchpad && config.screening.blockedLaunchpads.includes(launchpad)) {
        log("screening", `Skipping ${pool.name} — blocked launchpad (${launchpad})`);
        filteredOut.push({ name: pool.name, reason: `blocked launchpad (${launchpad})` });
        return false;
      }
      const botPct = ti?.audit?.bot_holders_pct;
      const maxBotHoldersPct = config.screening.maxBotHoldersPct;
      if (botPct != null && maxBotHoldersPct != null && botPct > maxBotHoldersPct) {
        log("screening", `Bot-holder filter: dropped ${pool.name} — bots ${botPct}% > ${maxBotHoldersPct}%`);
        filteredOut.push({ name: pool.name, reason: `bot holders ${botPct}% > ${maxBotHoldersPct}%` });
        return false;
      }
      return true;
    });

    if (passing.length === 0) {
      const combined = filteredOut.length > 0 ? filteredOut : earlyFilteredExamples;
      const combinedExamples = combined.slice(0, 5)
        .map((entry) => `- ${entry.name}: ${entry.reason}`)
        .join("\n");
      const funnelBlock = buildGmgnFunnelReport(gmgnStageCounts, gmgnAllFiltered, { fromStage: 2 });
      const thresholds = `Thresholds: tvl>$${config.screening.minTvl} | vol>$${config.screening.minVolume} | organic>${config.screening.minOrganic}% | holders>${config.screening.minHolders} | fee/tvl>${config.screening.minFeeActiveTvlRatio}%`;
      screenReport = funnelBlock
        ? `No candidates available.\n\n${funnelBlock}`
        : combinedExamples
          ? `No candidates available.\nFiltered examples:\n${combinedExamples}`
          : `No candidates available (all filtered).\n${thresholds}`;
      appendDecision({
        type: "no_deploy",
        actor: "SCREENER",
        summary: "No candidates available",
        reason: funnelBlock || combinedExamples || "All candidates filtered before deploy",
        rejected: combined.slice(0, 5).map((entry) => `${entry.name}: ${entry.reason}`),
      });
      return screenReport;
    }

    if (passing.length <= 1 && gmgnStageCounts) {
      const funnelBlock = buildGmgnFunnelReport(gmgnStageCounts, gmgnAllFiltered, { fromStage: 2 });
      if (funnelBlock) log("screening", `GMGN funnel (sparse):\n${funnelBlock}`);
    }

    if (passing.length === 1) {
      const skipReason = getLoneCandidateSkipReason(passing[0]);
      if (skipReason) {
        const candidateName = passing[0].pool?.name || "unknown";
        const funnelBlock = buildGmgnFunnelReport(gmgnStageCounts, gmgnAllFiltered, { fromStage: 2 });
        screenReport = [
          "⛔ NO DEPLOY",
          "",
          "Cycle finished with no valid entry.",
          "",
          "BEST LOOKING CANDIDATE",
          candidateName,
          "",
          "WHY SKIPPED",
          `Only one candidate survived filtering, but it was not worth deploying: ${skipReason}.`,
          "",
          "REJECTED",
          `- ${candidateName}: ${skipReason}`,
          funnelBlock ? `\n─────────────\n${funnelBlock}` : null,
        ].filter(Boolean).join("\n");
        appendDecision({
          type: "no_deploy",
          actor: "SCREENER",
          summary: "Single candidate skipped",
          reason: skipReason,
          pool: passing[0].pool?.pool,
          pool_name: candidateName,
        });
        return screenReport;
      }
    }

    // 🔬 Shadow-logging: ALWAYS record this cycle's smart-wallet count per passing
    // candidate (sw is known here) so sw-momentum has data even when the experiment
    // is off. Recording ≠ influencing. Fail-open.
    try {
      recordSmartWalletCounts(passing.map(({ pool, sw }) => ({
        addr: pool.pool,
        name: pool.name,
        sw_count: sw?.in_pool?.length ?? 0,
      })));
    } catch (e) {
      log("experiment", `smartWalletMomentum record failed — continuing (fail-open): ${e.message}`);
    }

    // Pre-fetch active_bin for all passing candidates in parallel
    const activeBinResults = await Promise.allSettled(
      passing.map(({ pool }) => getActiveBin({ pool_address: pool.pool }))
    );

    // Build compact candidate blocks
    const candidateBlocks = passing.map(({ pool, sw, n, ti, mem }, i) => {
      const botPct = ti?.audit?.bot_holders_pct ?? "?";
      const top10Pct = ti?.audit?.top_holders_pct ?? "?";
      const feesSol = ti?.global_fees_sol ?? "?";
      const launchpad = ti?.launchpad ?? null;
      const priceChange = ti?.stats_1h?.price_change;
      const netBuyers = ti?.stats_1h?.net_buyers;
      const activeBin = activeBinResults[i]?.status === "fulfilled" ? activeBinResults[i].value?.binId : null;

      // 🧪 Experiment #1: candidate momentum — soft, trusted line (our own metric
      // deltas, not external text). OFF by default → momentumLine stays null and
      // drops out of the block. Fail-open.
      let momentumLine = null;
      if (config.experiments?.candidateMomentum) {
        try {
          const txt = formatCandidateMomentum(getCandidateMomentum(pool.pool));
          if (txt) momentumLine = `  momentum: ${txt}`;
        } catch { /* fail-open — omit the line */ }
      }

      // 🧪 Experiment #2: expected yield-to-me (proxy) — soft, trusted line (our
      // own footprint + fee-capture estimate, not external text). OFF by default →
      // yieldLine stays null and drops out of the block. Fail-open.
      let yieldLine = null;
      if (config.experiments?.expectedYieldSignal) {
        try {
          const txt = formatYieldToMe({
            deployAmountSol: deployAmount,
            solPriceUsd: currentBalance.sol_price,
            tvlUsd: pool.tvl ?? pool.active_tvl,
            feeActiveTvlRatio: pool.fee_active_tvl_ratio,
          });
          if (txt) yieldLine = `  yield_to_me: ${txt}`;
        } catch { /* fail-open — omit the line */ }
      }

      // 🧪 Smart-wallet momentum: soft, trusted line — smart money entering/leaving
      // this pool across cycles. OFF by default → stays null and drops out. Fail-open.
      let swMomentumLine = null;
      if (config.experiments?.smartWalletMomentum) {
        try {
          const txt = formatSmartWalletMomentum(getSmartWalletMomentum(pool.pool));
          if (txt) swMomentumLine = `  sw_momentum: ${txt}`;
        } catch { /* fail-open — omit the line */ }
      }

      const pvpLine = pool.is_pvp
        ? `  pvp: HIGH — rival ${pool.pvp_rival_name || pool.pvp_symbol} (${pool.pvp_rival_mint?.slice(0, 8)}...) has pool ${pool.pvp_rival_pool?.slice(0, 8)}..., tvl=$${pool.pvp_rival_tvl}, holders=${pool.pvp_rival_holders}, fees=${pool.pvp_rival_fees}SOL`
        : null;
      let block;
      if (pool.gmgn) {
        block = [
          `POOL: ${pool.name} (${pool.pool})`,
          formatGmgnCandidateForPrompt(pool),
          pvpLine,
          `  smart_wallets: ${sw?.in_pool?.length ?? 0} present${sw?.in_pool?.length ? ` → CONFIDENCE BOOST (${sw.in_pool.map(w => w.name).join(", ")})` : ""}`,
          activeBin != null ? `  active_bin: ${activeBin}` : null,
          momentumLine,
          yieldLine,
          swMomentumLine,
          n?.narrative ? `  narrative_untrusted: ${sanitizeUntrustedPromptText(n.narrative, 500)}` : `  narrative_untrusted: none`,
          mem ? `  memory_untrusted: ${sanitizeUntrustedPromptText(mem, 500)}` : null,
        ].filter(Boolean).join("\n");
      } else {
        const gmgnPriceLine = pool.gmgn_price_action
          ? `  gmgn_price: rsi2=${pool.gmgn_price_action.rsi2 ?? "?"}, supertrend=${pool.gmgn_price_action.supertrend?.direction || "?"}, price_vs_ath=${pool.gmgn_price_action.priceVsAthPct ?? "?"}%, 1h_change=${pool.gmgn_price_action.priceChangePct ?? "?"}%, max_vol_candle=${pool.gmgn_price_action.maxVolumeShare ?? "?"}%`
          : null;
        block = [
          `POOL: ${pool.name} (${pool.pool})`,
          `  metrics: bin_step=${pool.bin_step}, fee_pct=${pool.fee_pct}%, fee_tvl=${pool.fee_active_tvl_ratio}, vol=$${pool.volume_window}, tvl=$${pool.tvl ?? pool.active_tvl}, volatility_${pool.volatility_timeframe || "30m"}=${pool.volatility}, mcap=$${pool.mcap}, organic=${pool.organic_score}${pool.token_age_hours != null ? `, age=${pool.token_age_hours}h` : ""}`,
          `  audit: top10=${top10Pct}%, bots=${botPct}%, fees=${feesSol}SOL${launchpad ? `, launchpad=${launchpad}` : ""}`,
          gmgnPriceLine,
          pvpLine,
          `  smart_wallets: ${sw?.in_pool?.length ?? 0} present${sw?.in_pool?.length ? ` → CONFIDENCE BOOST (${sw.in_pool.map(w => w.name).join(", ")})` : ""}`,
          activeBin != null ? `  active_bin: ${activeBin}` : null,
          priceChange != null ? `  1h: price${priceChange >= 0 ? "+" : ""}${priceChange}%, net_buyers=${netBuyers ?? "?"}` : null,
          momentumLine,
          yieldLine,
          swMomentumLine,
          n?.narrative ? `  narrative_untrusted: ${sanitizeUntrustedPromptText(n.narrative, 500)}` : `  narrative_untrusted: none`,
          mem ? `  memory_untrusted: ${sanitizeUntrustedPromptText(mem, 500)}` : null,
        ].filter(Boolean).join("\n");
      }

      // Stage signals for Darwinian weighting — captured before LLM decides
      if (config.darwin?.enabled) {
        const baseMint = pool.base?.mint || pool.base_mint || ti?.mint || null;
        stageSignals(pool.pool, {
          base_mint:             baseMint,
          organic_score:         pool.organic_score         ?? null,
          fee_tvl_ratio:         pool.fee_active_tvl_ratio  ?? null,
          volume:                pool.volume_window         ?? null,
          mcap:                  pool.mcap                  ?? null,
          holder_count:          ti?.holders                ?? null,
          smart_wallets_present: (sw?.in_pool?.length ?? 0) > 0,
          narrative_quality:     n?.narrative ? "present" : "absent",
          volatility:            pool.volatility            ?? null,
        });
      }

      return block;
    });

    const weightsSummary = config.darwin?.enabled ? getWeightsSummary() : null;

    let deployAttempted = false;
    let deploySucceeded = false;
    const { content } = await agentLoop(`
SCREENING CYCLE
${strategyBlock}
Positions: ${prePositions.total_positions}/${config.risk.maxPositions} | SOL: ${currentBalance.sol.toFixed(3)} | Deploy: ${deployAmount} SOL

PRE-LOADED CANDIDATES (${passing.length} pools):
${candidateBlocks.join("\n\n")}

STEPS:
1. Decide whether any candidate is worth deploying. A single remaining candidate is not automatically good enough.
2. Pick the best candidate only if it has real conviction from narrative quality, smart wallets, and pool metrics. If the list has only one pool and it lacks narrative or smart-wallet confirmation, skip the cycle.
3. If a pool qualifies, call deploy_position (active_bin is pre-fetched above — no need to call get_active_bin).
   strategy = ${config.strategy.strategy} (always use this, never change it).
   bins_below = round(${config.strategy.minBinsBelow} + (candidate volatility/5)*${config.strategy.maxBinsBelow - config.strategy.minBinsBelow}) clamped to [${config.strategy.minBinsBelow},${config.strategy.maxBinsBelow}].
   pass deploy_position.volatility = the candidate volatility value.
   bins_above = 0. Single-side SOL only: set amount_y, keep amount_x = 0.
4. Report in this exact format (no tables, no extra sections):
   🚀 DEPLOYED

   <pool name>
   <pool address>

   ◎ <deploy amount> SOL | <strategy> | bin <active_bin>
   Range: <minPrice> → <maxPrice>
   Range cover: <downside %> downside | <upside %> upside | <total width %> total

   IMPORTANT:
   - Do NOT calculate the range percentages yourself.
   - Use the actual deploy_position tool result:
     range_coverage.downside_pct
     range_coverage.upside_pct
     range_coverage.width_pct

   MARKET
   Fee/TVL: <x>%
   Volume: $<x>
   TVL: $<x>
   Volatility: <x>
   Organic: <x>
   Mcap: $<x>
   Age: <x>h

   AUDIT
   Top10: <x>%
   Bots: <x>%
   Fees paid: <x> SOL
   Smart wallets: <names or none>

   WHY THIS WON
   <2-4 concise sentences on why this pool won, key risks, and why it still beat the alternatives>
5. If no pool qualifies, report in this exact format instead:
   ⛔ NO DEPLOY

   Cycle finished with no valid entry.

   BEST LOOKING CANDIDATE
   <name or none>

   WHY SKIPPED
   <2-4 concise sentences explaining why nothing was good enough>

   REJECTED
   <short flat list of top candidate names and why they were skipped>
IMPORTANT:
- Keep the whole report compact and highly scannable for Telegram.
      `, config.llm.maxSteps, [], "SCREENER", config.llm.screeningModel, 2048, {
        // Skipping ("⛔ NO DEPLOY") is a valid outcome with no tool call — don't let the
        // tool-required guard turn a legit skip into the canned "no tool call" message.
        // A claimed-but-fake deploy is caught by the deploySucceeded guard below.
        allowNoToolFinal: true,
        onToolStart: async ({ name }) => {
          if (name === "deploy_position") deployAttempted = true;
          await liveMessage?.toolStart(name);
        },
        onToolFinish: async ({ name, result, success }) => {
          if (name === "deploy_position") {
            deployAttempted = true;
            deploySucceeded = Boolean(success && result?.success !== false && !result?.error && !result?.blocked);
          }
          await liveMessage?.toolFinish(name, result, success);
        },
      });
    // Anti-hallucination guard (pairs with allowNoToolFinal above): if the model drafted
    // a 🚀 DEPLOYED report but no deploy_position actually succeeded, replace it with an
    // honest skip before it reaches Telegram — never post a fake deploy.
    let reportContent = content;
    if (!deploySucceeded && /🚀\s*DEPLOYED/i.test(content)) {
      log("cron", "Screener drafted DEPLOYED but no deploy executed — overriding report to NO DEPLOY");
      reportContent = "⛔ NO DEPLOY\n\nCycle finished with no valid entry.\n(Model drafted a deploy report but no position was actually opened.)";
    }
    // Defense-in-depth (pairs with agent.js tool-dump guard): if the model still returned
    // non-report content (e.g. raw JSON / a tool-call dump) rather than a 🚀 DEPLOYED or
    // ⛔ NO DEPLOY report, never post it to Telegram — convert to an honest skip.
    if (!deploySucceeded && !/⛔\s*NO DEPLOY/i.test(reportContent) && /^\s*[[{]/.test(stripThink(reportContent || ""))) {
      log("cron", "Screener returned non-report content (likely tool-dump) — overriding to NO DEPLOY");
      reportContent = "⛔ NO DEPLOY\n\nCycle finished with no valid entry.\n(Screening model returned malformed output instead of a report.)";
    }
    const funnelAppend = buildGmgnFunnelReport(gmgnStageCounts, gmgnAllFiltered, { fromStage: 2 });
    screenReport = funnelAppend ? `${reportContent}\n\n─────────────\n${funnelAppend}` : reportContent;
    if (/⛔\s*NO DEPLOY/i.test(reportContent)) {
      appendDecision({
        type: "no_deploy",
        actor: "SCREENER",
        summary: "LLM chose no deploy",
        reason: stripThink(reportContent).slice(0, 500),
      });
    } else if (!deploySucceeded) {
      appendDecision({
        type: "no_deploy",
        actor: "SCREENER",
        summary: deployAttempted ? "Deploy attempt did not succeed" : "No successful deploy in screening cycle",
        reason: stripThink(reportContent).slice(0, 500),
      });
    }
  } catch (error) {
    log("cron_error", `Screening cycle failed: ${error.message}`);
    screenReport = `Screening cycle failed: ${error.message}`;
  } finally {
    _screeningBusy = false;
    if (!silent && telegramEnabled()) {
      if (screenReport) {
        if (liveMessage) await liveMessage.finalize(stripThink(screenReport)).catch(() => {});
        else sendMessage(`🔍 Screening Cycle\n\n${stripThink(screenReport)}`).catch(() => { });
      } else if (liveMessage) {
        // Same typing-indicator leak guard as the management cycle.
        await liveMessage.finalize("(cycle ended without report)").catch(() => {});
      }
    }
    drainTelegramQueue().catch(() => {});
  }
  return screenReport;
}

/**
 * Effective screening interval (minutes) for right now.
 * Manual mode → the configured interval, fixed.
 * Auto mode   → floor=screeningIntervalMin, ceiling=maxScreeningIntervalMin;
 *               stretched to the ceiling only during historically WEAK WIB
 *               sessions. Insufficient data or "ok" sessions stay at the floor.
 * Management & PnL-poll cadence are never affected — screening only.
 */
function effectiveScreeningIntervalMin() {
  const base = Math.max(1, config.schedule.screeningIntervalMin);
  if (!config.schedule.adaptiveScreening) return base;
  const ceil = Math.max(base, config.schedule.maxScreeningIntervalMin ?? base);
  return classifySession(currentWibSession().key) === "weak" ? ceil : base;
}

/**
 * Gate for the *scheduled* screening tick (event-driven triggers from the
 * management cycle bypass this — a freed slot should be looked at now).
 * The cron fires every base interval; in auto mode we skip ticks until the
 * effective (possibly stretched) interval has elapsed since the last run.
 */
function shouldRunScheduledScreening() {
  if (!config.schedule.adaptiveScreening) return true;
  const eff = effectiveScreeningIntervalMin();
  const base = Math.max(1, config.schedule.screeningIntervalMin);
  if (eff <= base) return true;
  if (!timers.screeningLastRun) return true;
  const elapsedMin = (Date.now() - timers.screeningLastRun) / 60000;
  return elapsedMin >= eff - 0.5;
}

export function startCronJobs() {
  stopCronJobs(); // stop any running tasks before (re)starting

  const mgmtTask = cron.schedule(`*/${Math.max(1, config.schedule.managementIntervalMin)} * * * *`, async () => {
    if (_managementBusy) return;
    timers.managementLastRun = Date.now();
    await runManagementCycle();
  });

  const screenTask = cron.schedule(`*/${Math.max(1, config.schedule.screeningIntervalMin)} * * * *`, async () => {
    if (!shouldRunScheduledScreening()) {
      log("cron", `Screening tick skipped — adaptive throttle (session ${currentWibSession().label}, effective ${effectiveScreeningIntervalMin()}m)`);
      return;
    }
    await runScreeningCycle();
  });

  const healthTask = cron.schedule(`0 * * * *`, async () => {
    if (_managementBusy) return;
    _managementBusy = true;
    log("cron", "Starting health check");
    try {
      await agentLoop(`
HEALTH CHECK

Summarize the current portfolio health, total fees earned, and performance of all open positions. Recommend any high-level adjustments if needed.
      `, config.llm.maxSteps, [], "MANAGER");
    } catch (error) {
      log("cron_error", `Health check failed: ${error.message}`);
    } finally {
      _managementBusy = false;
      drainTelegramQueue().catch(() => {});
    }
  });

  // Morning Briefing at 8:00 AM UTC+7 (1:00 AM UTC)
  const briefingTask = cron.schedule(`0 1 * * *`, async () => {
    await runBriefing();
  }, { timezone: 'UTC' });

  // Every 6h — catch up if briefing was missed (agent restart, crash, etc.)
  const briefingWatchdog = cron.schedule(`0 */6 * * *`, async () => {
    await maybeRunMissedBriefing();
  }, { timezone: 'UTC' });

  // Weekly digest — Monday 01:30 UTC (staggered after the daily briefing).
  const weeklyTask = cron.schedule(`30 1 * * 1`, async () => {
    await runPeriodicBriefing("week");
  }, { timezone: 'UTC' });

  // Monthly digest — 1st of month 02:00 UTC.
  const monthlyTask = cron.schedule(`0 2 1 * *`, async () => {
    await runPeriodicBriefing("month");
  }, { timezone: 'UTC' });

  // Lightweight 30s PnL poller — updates trailing TP state between management cycles, no LLM
  let _pnlPollBusy = false;
  const pnlPollInterval = setInterval(async () => {
    if (_managementBusy || _screeningBusy || _pnlPollBusy) return;
    if (getTrackedPositions(true).length === 0) return;
    _pnlPollBusy = true;
    try {
      const result = await getMyPositions({ force: true, silent: true }).catch(() => null);
      if (!result?.positions?.length) return;
      for (const p of result.positions) {
        if (
          !p.pnl_pct_suspicious &&
          queuePeakConfirmation(p.position, p.pnl_pct, { immediate: !shouldUsePnlRecheck() }) &&
          shouldUsePnlRecheck()
        ) {
          schedulePeakConfirmation(p.position);
        }
        const exit = updatePnlAndCheckExits(p.position, p, config.management);
        if (exit) {
          if (exit.action === "TRAILING_TP" && exit.needs_confirmation && shouldUsePnlRecheck()) {
            if (queueTrailingDropConfirmation(p.position, exit.peak_pnl_pct, exit.current_pnl_pct, config.management.trailingDropPct)) {
              scheduleTrailingDropConfirmation(p.position);
            }
            continue;
          }
          const cooldownMs = config.schedule.managementIntervalMin * 60 * 1000;
          const sinceLastTrigger = Date.now() - _pollTriggeredAt;
          if (sinceLastTrigger >= cooldownMs) {
            _pollTriggeredAt = Date.now();
            log("state", `[PnL poll] Exit alert: ${p.pair} — ${exit.reason} — triggering management`);
            runManagementCycle({ silent: true }).catch((e) => log("cron_error", `Poll-triggered management failed: ${e.message}`));
          } else {
            log("state", `[PnL poll] Exit alert: ${p.pair} — ${exit.reason} — cooldown (${Math.round((cooldownMs - sinceLastTrigger) / 1000)}s left)`);
          }
          break;
        }
        const closeRule = getDeterministicCloseRule(p, config.management);
        if (closeRule) {
          const cooldownMs = config.schedule.managementIntervalMin * 60 * 1000;
          const sinceLastTrigger = Date.now() - _pollTriggeredAt;
          if (sinceLastTrigger >= cooldownMs) {
            _pollTriggeredAt = Date.now();
            log("state", `[PnL poll] Deterministic close rule: ${p.pair} — Rule ${closeRule.rule}: ${closeRule.reason} — triggering management`);
            runManagementCycle({ silent: true }).catch((e) => log("cron_error", `Poll-triggered management failed: ${e.message}`));
          } else {
            log("state", `[PnL poll] Deterministic close rule: ${p.pair} — Rule ${closeRule.rule}: ${closeRule.reason} — cooldown (${Math.round((cooldownMs - sinceLastTrigger) / 1000)}s left)`);
          }
          break;
        }
      }
    } finally {
      _pnlPollBusy = false;
    }
  }, 30_000);

  _cronTasks = [mgmtTask, screenTask, healthTask, briefingTask, briefingWatchdog, weeklyTask, monthlyTask];
  // Store interval ref so stopCronJobs can clear it
  _cronTasks._pnlPollInterval = pnlPollInterval;
  log("cron", `Cycles started — management every ${config.schedule.managementIntervalMin}m, screening every ${config.schedule.screeningIntervalMin}m`);
}

// ═══════════════════════════════════════════
//  GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════
let _shuttingDown = false;

function withTimeout(promise, ms) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function shutdown(signal) {
  if (_shuttingDown) {
    log("shutdown", `Received ${signal} while shutdown is already in progress.`);
    return;
  }
  _shuttingDown = true;

  log("shutdown", `Received ${signal}. Shutting down...`);
  stopPolling();
  stopCronJobs();

  const positions = await withTimeout(
    getMyPositions({ force: true, silent: true }).catch((error) => {
      log("shutdown", `Position snapshot failed during shutdown: ${error.message}`);
      return null;
    }),
    5000
  );
  if (positions) {
    log("shutdown", `Open positions at shutdown: ${positions.total_positions}`);
  } else {
    log("shutdown", "Open position snapshot skipped during shutdown timeout");
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ═══════════════════════════════════════════
//  FORMAT CANDIDATES TABLE
// ═══════════════════════════════════════════
function formatCandidates(candidates) {
  if (!candidates.length) return "  No eligible pools found right now.";

  const lines = candidates.map((p, i) => {
    const name = (p.name || "unknown").padEnd(20);
    const ftvl = `${p.fee_active_tvl_ratio ?? p.fee_tvl_ratio}%`.padStart(8);
    const vol = `$${((p.volume_window || 0) / 1000).toFixed(1)}k`.padStart(8);
    const active = `${p.active_pct}%`.padStart(6);
    const org = String(p.organic_score).padStart(4);
    return `  [${i + 1}]  ${name}  fee/aTVL:${ftvl}  vol:${vol}  in-range:${active}  organic:${org}`;
  });

  return [
    "  #   pool                  fee/aTVL     vol    in-range  organic",
    "  " + "─".repeat(68),
    ...lines,
  ].join("\n");
}

function getDeterministicCloseRule(position, managementConfig) {
  const tracked = getTrackedPosition(position.position);
  const pnlSuspect = (() => {
    if (position.pnl_pct == null) return false;
    if (position.pnl_pct > -90) return false;
    if (tracked?.amount_sol && (position.total_value_usd ?? 0) > 0.01) {
      log("cron_warn", `Suspect PnL for ${position.pair}: ${position.pnl_pct}% but position still has value — skipping PnL rules`);
      return true;
    }
    return false;
  })();

  if (!pnlSuspect && position.pnl_pct != null && position.pnl_pct <= managementConfig.stopLossPct) {
    return { action: "CLOSE", rule: 1, reason: "stop loss" };
  }
  if (!pnlSuspect && position.pnl_pct != null && position.pnl_pct >= managementConfig.takeProfitPct) {
    return { action: "CLOSE", rule: 2, reason: "take profit" };
  }
  if (
    position.active_bin != null &&
    position.upper_bin != null &&
    position.active_bin > position.upper_bin + managementConfig.outOfRangeBinsToClose
  ) {
    return { action: "CLOSE", rule: 3, reason: "pumped far above range" };
  }
  if (
    position.active_bin != null &&
    position.upper_bin != null &&
    position.active_bin > position.upper_bin &&
    (position.minutes_out_of_range ?? 0) >= managementConfig.outOfRangeWaitMinutes
  ) {
    return { action: "CLOSE", rule: 4, reason: "OOR" };
  }
  if (
    position.fee_per_tvl_24h != null &&
    position.fee_per_tvl_24h < managementConfig.minFeePerTvl24h &&
    (position.age_minutes ?? 0) >= 60
  ) {
    return { action: "CLOSE", rule: 5, reason: "low yield" };
  }
  return null;
}

// Indicator-driven exit (opt-in). Default OFF — when indicators.exitEnabled is
// false this returns null and exits are governed only by the deterministic rules
// above (factory behavior). When on, a CONFIRMED exitPreset signal upgrades a
// would-be STAY/CLAIM into a CLOSE. Fail-safe: API error or "skipped" → no close.
async function getIndicatorExitSignal(position) {
  if (!config.indicators.enabled || !config.indicators.exitEnabled) return null;
  const mint = position.base_mint;
  if (!mint) return null;
  try {
    const confirmation = await confirmIndicatorPreset({ mint, side: "exit" });
    if (confirmation?.enabled && confirmation.confirmed && !confirmation.skipped) {
      return { action: "CLOSE", rule: "indicator", reason: confirmation.reason || "exit preset confirmed" };
    }
  } catch (error) {
    log("indicators_warn", `Exit indicator check failed for ${position.pair}: ${error.message}`);
  }
  return null;
}

function buildGmgnFunnelReport(stageCounts, allFiltered = [], { fromStage = 1 } = {}) {
  if (!stageCounts) return null;
  const sc = stageCounts;
  const funnel = `GMGN funnel: ranked=${sc.ranked ?? "?"} → S1=${sc.s1 ?? "?"} → S2=${sc.s2 ?? "?"} → S3=${sc.s3 ?? "?"} → S4=${sc.s4 ?? "?"} → final=${sc.s5 ?? "?"}`;
  const byStage = {};
  for (const f of allFiltered) {
    if (f.stage < fromStage) continue;
    const key = `s${f.stage}`;
    if (!byStage[key]) byStage[key] = [];
    byStage[key].push(`${f.name}: ${f.reason}`);
  }
  const stageLabels = { s2: "S2 info", s3: "S3 pool", s4: "S4 indicators", s5: "S5 pick" };
  const details = Object.entries(byStage)
    .map(([key, items]) => `${stageLabels[key] || key}:\n${items.map(r => `  • ${r}`).join("\n")}`)
    .join("\n");
  return details ? `${funnel}\n\n${details}` : funnel;
}

function getLoneCandidateSkipReason({ pool, sw, n, ti } = {}) {
  if (!pool) return "missing candidate data";
  const smartWalletCount = Math.max(sw?.in_pool?.length ?? 0, Number(pool.gmgn_smart_wallets ?? 0) || 0);
  const tokenInfo = ti || {};
  const hasNarrative = !!n?.narrative;
  const globalFeesSol = Number(tokenInfo.global_fees_sol ?? pool.gmgn_total_fee_sol);
  const top10Pct = Number(tokenInfo.audit?.top_holders_pct ?? pool.gmgn_token_info_top10_pct ?? pool.gmgn_top10_holder_pct);
  const botPct = Number(tokenInfo.audit?.bot_holders_pct ?? pool.gmgn_bot_degen_pct);
  if (pool.is_wash) return "wash trading was flagged";
  if (pool.is_rugpull && smartWalletCount === 0) return "rugpull risk was flagged and no smart wallets offset it";
  if (pool.is_pvp && smartWalletCount === 0) return "PVP symbol conflict and no smart-wallet confirmation";
  if (Number.isFinite(globalFeesSol) && globalFeesSol < config.screening.minTokenFeesSol) {
    return `token fees ${globalFeesSol} SOL below minimum ${config.screening.minTokenFeesSol} SOL`;
  }
  if (Number.isFinite(top10Pct) && top10Pct > config.screening.maxTop10Pct) {
    return `top10 concentration ${top10Pct}% above maximum ${config.screening.maxTop10Pct}%`;
  }
  if (Number.isFinite(botPct) && botPct > config.screening.maxBotHoldersPct) {
    return `bot holders ${botPct}% above maximum ${config.screening.maxBotHoldersPct}%`;
  }
  if (!hasNarrative && smartWalletCount === 0) return "only candidate has no narrative and no smart-wallet confirmation";
  return null;
}

function computeBinsBelow(volatility) {
  const parsedVolatility = Number(volatility);
  if (!Number.isFinite(parsedVolatility) || parsedVolatility <= 0) {
    throw new Error(`Invalid volatility ${volatility ?? "unknown"} — refusing volatility-scaled deploy.`);
  }
  const lo = config.strategy.minBinsBelow;
  const hi = config.strategy.maxBinsBelow;
  return Math.max(lo, Math.min(hi, Math.round(lo + (parsedVolatility / 5) * (hi - lo))));
}

// ═══════════════════════════════════════════
//  INTERACTIVE REPL
// ═══════════════════════════════════════════
const isTTY = process.stdin.isTTY;
let cronStarted = false;
let busy = false;
const _telegramQueue = []; // queued messages received while agent was busy
const sessionHistory = []; // persists conversation across REPL turns
const MAX_HISTORY = 20;    // keep last 20 messages (10 exchanges)
let _ttyInterface = null;
let _latestCandidates = [];
let _latestCandidatesAt = null;
let _pendingInput = null; // { key, page, menuMsgId }
let _pendingConfirmation = null; // { promise, resolve, timer, messageId, signature }

function setLatestCandidates(candidates = []) {
  _latestCandidates = Array.isArray(candidates) ? candidates : [];
  _latestCandidatesAt = new Date().toISOString();
}

function getLatestCandidatesMeta() {
  return {
    candidates: _latestCandidates,
    count: _latestCandidates.length,
    updatedAt: _latestCandidatesAt,
  };
}

function describeLatestCandidates(limit = 5) {
  if (!_latestCandidates.length) return "No cached candidates yet. Run /screen first.";
  const lines = _latestCandidates.slice(0, limit).map((pool, i) => {
    const feeTvl = pool.fee_active_tvl_ratio ?? pool.fee_tvl_ratio ?? "?";
    const vol = pool.volume_window ?? pool.volume_24h ?? "?";
    const active = pool.active_pct ?? "?";
    const organic = pool.organic_score ?? "?";
    return `${i + 1}. ${pool.name} | fee/aTVL ${feeTvl}% | vol $${vol} | in-range ${active}% | organic ${organic}`;
  });
  const age = _latestCandidatesAt ? new Date(_latestCandidatesAt).toLocaleString("en-US", { hour12: false }) : "unknown";
  return `Latest candidates (${_latestCandidates.length}) — updated ${age}\n\n${lines.join("\n")}`;
}

function formatWalletStatus(wallet, positions) {
  const deployAmount = computeDeployAmount(wallet.sol);
  const hive = isHiveMindEnabled() ? "on" : "off";
  return [
    `Wallet: ${wallet.sol} SOL ($${wallet.sol_usd})`,
    `SOL price: $${wallet.sol_price}`,
    `Open positions: ${positions.total_positions}/${config.risk.maxPositions}`,
    `Next deploy amount: ${deployAmount} SOL`,
    `Dry run: ${process.env.DRY_RUN === "true" ? "yes" : "no"}`,
    `HiveMind: ${hive}`,
  ].join("\n");
}

// Condense a learning rule into a short, COMPLETE one-liner for /status.
// Keeps the subject + headline metric, drops the verbose advisory tail, and
// never cuts mid-word (the old raw slice(0,120) chopped at "PnL +").
function condenseRule(rule) {
  let s = String(rule || "").replace(/\s+/g, " ").trim();
  if (!s) return s;
  // Round noisy volatility floats: volatility=2.4598 → vol=2.5
  s = s.replace(/volatility=(\d+\.\d+)/g, (_, n) => `vol=${(+n).toFixed(1)}`);
  // Split "<subject> — <explanation>" (or "→") and keep only the first
  // sentence of the explanation, dropping advisory boilerplate.
  const m = s.match(/^(.*?)\s([—→])\s(.*)$/);
  if (m) {
    const tail = m[3].split(/\.\s/)[0].replace(/\.$/, "").trim();
    s = `${m[1].trim()} ${m[2]} ${tail}`;
  } else {
    s = s.split(/\.\s/)[0].replace(/\.$/, "").trim();
  }
  // Safety net: hard cap on a word boundary with an ellipsis.
  if (s.length > 140) s = s.slice(0, 140).replace(/\s+\S*$/, "") + "…";
  return s;
}

function formatConfigSnapshot() {
  return [
    "Config snapshot",
    "",
    `Screening source: ${config.screening.source}`,
    `Strategy: ${config.strategy.strategy} | bins: [${config.strategy.minBinsBelow}–${config.strategy.maxBinsBelow}] (volatility-scaled)`,
    `Deploy: ${config.management.deployAmountSol} SOL | gasReserve: ${config.management.gasReserve} | maxPositions: ${config.risk.maxPositions}`,
    `Stop loss: ${config.management.stopLossPct}% | take profit: ${config.management.takeProfitPct}%`,
    `Trailing: ${config.management.trailingTakeProfit ? "on" : "off"} | trigger ${config.management.trailingTriggerPct}% | drop ${config.management.trailingDropPct}%`,
    `OOR: ${config.management.outOfRangeWaitMinutes}m | cooldown ${config.management.oorCooldownTriggerCount}x / ${config.management.oorCooldownHours}h`,
    `Repeat deploy cooldown: ${config.management.repeatDeployCooldownEnabled ? "on" : "off"} | ${config.management.repeatDeployCooldownTriggerCount}x / ${config.management.repeatDeployCooldownHours}h | min fee earned ${config.management.repeatDeployCooldownMinFeeEarnedPct}% | ${config.management.repeatDeployCooldownScope}`,
    `Yield floor: ${config.management.minFeePerTvl24h}% | min age ${config.management.minAgeBeforeYieldCheck}m`,
    `Screening: ${config.screening.category} / ${config.screening.timeframe} | TVL ${config.screening.minTvl}-${config.screening.maxTvl}`,
    `GMGN interval: ${config.gmgn.interval} | OrderBy: ${config.gmgn.orderBy} | Dir: ${config.gmgn.direction}`,
    `Intervals: manage ${config.schedule.managementIntervalMin}m | screen ${config.schedule.screeningIntervalMin}m`,
    `HiveMind: ${isHiveMindEnabled() ? "enabled" : "disabled"}${config.hiveMind.agentId ? ` | ${config.hiveMind.agentId}` : ""}`,
  ].join("\n");
}

// Full runtime config, grouped to match SETTINGS-GUIDE.md (GRUP 1–15) + GMGN.
// /config shows the complete surface; long output is auto-split by sendMessage.
// 🧬 Profil + 🗂️ Racikan identity — canonical formatter lives in preset-manager
// (formatIdentity); thin wrapper here keeps the existing call sites fail-safe.
function formatIdentityLines() {
  try { return formatIdentity(); } catch { return "🧬 Profil: —\n🗂️ Racikan: —"; }
}

export function formatFullConfig() {
  const c = config;
  const fmt = (v) => {
    if (v === null || v === undefined) return "off";
    if (typeof v === "boolean") return v ? "on" : "off";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
    return String(v);
  };
  const secret = (v) => (v && String(v).length ? "(set)" : "(unset)");
  const group = (title, rows) => [title, ...rows.map(([k, v]) => `  ${k}: ${v}`)].join("\n");
  const ir = c.gmgn.indicatorRules || {};
  const gmgnActive = String(c.screening.source).toLowerCase() === "gmgn";

  const blocks = [
    group("━ GRUP 1 — Risiko & Modal", [
      ["dryRun", fmt(String(process.env.DRY_RUN || "").toLowerCase() === "true")],
      ["maxPositions", fmt(c.risk.maxPositions)],
      ["maxDeployAmount", fmt(c.risk.maxDeployAmount)],
      ["deployAmountSol", fmt(c.management.deployAmountSol)],
      ["positionSizePct", fmt(c.management.positionSizePct)],
      ["minSolToOpen", fmt(c.management.minSolToOpen)],
      ["gasReserve", `${fmt(c.management.gasReserve)}${c.management.gasReserveAutoTune ? " (auto-tune ON)" : " (manual)"}`],
      ["gasReserveAutoTune", fmt(c.management.gasReserveAutoTune)],
      ["gasReserveBufferDays", fmt(c.management.gasReserveBufferDays)],
      ["gasReserveFloorSol", fmt(c.management.gasReserveFloorSol)],
    ]),
    group("━ GRUP 2 — Exit Rules", [
      ["stopLossPct", fmt(c.management.stopLossPct)],
      ["takeProfitPct", fmt(c.management.takeProfitPct)],
      ["trailingTakeProfit", fmt(c.management.trailingTakeProfit)],
      ["trailingTriggerPct", fmt(c.management.trailingTriggerPct)],
      ["trailingDropPct", fmt(c.management.trailingDropPct)],
      ["pnlSanityMaxDiffPct", fmt(c.management.pnlSanityMaxDiffPct)],
    ]),
    group("━ GRUP 3 — Out Of Range (OOR)", [
      ["outOfRangeBinsToClose", fmt(c.management.outOfRangeBinsToClose)],
      ["outOfRangeWaitMinutes", fmt(c.management.outOfRangeWaitMinutes)],
      ["oorCooldownTriggerCount", fmt(c.management.oorCooldownTriggerCount)],
      ["oorCooldownHours", fmt(c.management.oorCooldownHours)],
    ]),
    group("━ GRUP 4 — Yield Check", [
      ["minFeePerTvl24h", fmt(c.management.minFeePerTvl24h)],
      ["minAgeBeforeYieldCheck", fmt(c.management.minAgeBeforeYieldCheck)],
      ["minVolumeToRebalance", fmt(c.management.minVolumeToRebalance)],
    ]),
    group("━ GRUP 5 — Claim & Cooldown Deploy Ulang", [
      ["minClaimAmount", fmt(c.management.minClaimAmount)],
      ["autoSwapAfterClaim", fmt(c.management.autoSwapAfterClaim)],
      ["repeatDeployCooldownEnabled", fmt(c.management.repeatDeployCooldownEnabled)],
      ["repeatDeployCooldownTriggerCount", fmt(c.management.repeatDeployCooldownTriggerCount)],
      ["repeatDeployCooldownHours", fmt(c.management.repeatDeployCooldownHours)],
      ["repeatDeployCooldownScope", fmt(c.management.repeatDeployCooldownScope)],
      ["repeatDeployCooldownMinFeeEarnedPct", fmt(c.management.repeatDeployCooldownMinFeeEarnedPct)],
    ]),
    group("━ GRUP 6 — Screening (Filter Pool)", [
      ["screeningSource", fmt(c.screening.source)],
      ["timeframe", fmt(c.screening.timeframe)],
      ["category", fmt(c.screening.category)],
      ["screeningCategories", fmt(c.screening.categories)],
      ["minTvl", fmt(c.screening.minTvl)],
      ["maxTvl", fmt(c.screening.maxTvl)],
      ["minVolume", fmt(c.screening.minVolume)],
      ["minFeeActiveTvlRatio", fmt(c.screening.minFeeActiveTvlRatio)],
      ["minTokenFeesSol", fmt(c.screening.minTokenFeesSol)],
      ["minOrganic", fmt(c.screening.minOrganic)],
      ["minQuoteOrganic", fmt(c.screening.minQuoteOrganic)],
      ["minMcap", fmt(c.screening.minMcap)],
      ["maxMcap", fmt(c.screening.maxMcap)],
      ["minHolders", fmt(c.screening.minHolders)],
      ["minTokenAgeHours", fmt(c.screening.minTokenAgeHours)],
      ["maxTokenAgeHours", fmt(c.screening.maxTokenAgeHours)],
      ["athFilterPct", fmt(c.screening.athFilterPct)],
      ["minBinStep", fmt(c.screening.minBinStep)],
      ["maxBinStep", fmt(c.screening.maxBinStep)],
      ["excludeHighSupplyConcentration", fmt(c.screening.excludeHighSupplyConcentration)],
    ]),
    group("━ GRUP 7 — Keamanan Token", [
      ["maxBundlePct", fmt(c.screening.maxBundlePct)],
      ["maxBotHoldersPct", fmt(c.screening.maxBotHoldersPct)],
      ["maxTop10Pct", fmt(c.screening.maxTop10Pct)],
      ["avoidPvpSymbols", fmt(c.screening.avoidPvpSymbols)],
      ["blockPvpSymbols", fmt(c.screening.blockPvpSymbols)],
      ["allowedLaunchpads", fmt(c.screening.allowedLaunchpads)],
      ["blockedLaunchpads", fmt(c.screening.blockedLaunchpads)],
    ]),
    group("━ GRUP 8 — Sinyal Tambahan", [
      ["useDiscordSignals", fmt(c.screening.useDiscordSignals)],
      ["discordSignalMode", fmt(c.screening.discordSignalMode)],
    ]),
    group("━ GRUP 9 — Strategi Range (Bins)", [
      ["strategy", fmt(c.strategy.strategy)],
      ["minBinsBelow", fmt(c.strategy.minBinsBelow)],
      ["maxBinsBelow", fmt(c.strategy.maxBinsBelow)],
      ["defaultBinsBelow", fmt(c.strategy.defaultBinsBelow)],
    ]),
    group("━ GRUP 10 — Jadwal Bot", [
      ["managementIntervalMin", fmt(c.schedule.managementIntervalMin)],
      ["screeningIntervalMin", fmt(c.schedule.screeningIntervalMin)],
      ["adaptiveScreening", fmt(c.schedule.adaptiveScreening)],
      ["maxScreeningIntervalMin", fmt(c.schedule.maxScreeningIntervalMin)],
      ["healthCheckIntervalMin", fmt(c.schedule.healthCheckIntervalMin)],
    ]),
    group("━ GRUP 11 — Model AI (LLM)", [
      ["managementModel", fmt(c.llm.managementModel)],
      ["screeningModel", fmt(c.llm.screeningModel)],
      ["generalModel", fmt(c.llm.generalModel)],
      ["temperature", fmt(c.llm.temperature)],
      ["maxTokens", fmt(c.llm.maxTokens)],
      ["generalMaxTokens", fmt(c.llm.generalMaxTokens)],
      ["maxSteps", fmt(c.llm.maxSteps)],
    ]),
    group("━ GRUP 12 — Darwin (Bobot Sinyal)", [
      ["darwinEnabled", fmt(c.darwin.enabled)],
      ["darwinWindowDays", fmt(c.darwin.windowDays)],
      ["darwinRecalcEvery", fmt(c.darwin.recalcEvery)],
      ["darwinBoost", fmt(c.darwin.boostFactor)],
      ["darwinDecay", fmt(c.darwin.decayFactor)],
      ["darwinFloor", fmt(c.darwin.weightFloor)],
      ["darwinCeiling", fmt(c.darwin.weightCeiling)],
      ["darwinMinSamples", fmt(c.darwin.minSamples)],
    ]),
    group("━ GRUP 13 — Chart Indicators", [
      ["enabled", fmt(c.indicators.enabled)],
      ["entryPreset", fmt(c.indicators.entryPreset)],
      ["exitPreset", fmt(c.indicators.exitPreset)],
      ["exitEnabled", fmt(c.indicators.exitEnabled)],
      ["rejectAlreadyAtBottom", fmt(c.indicators.rejectAlreadyAtBottom)],
      ["rsiLength", fmt(c.indicators.rsiLength)],
      ["intervals", fmt(c.indicators.intervals)],
      ["candles", fmt(c.indicators.candles)],
      ["rsiOversold", fmt(c.indicators.rsiOversold)],
      ["rsiOverbought", fmt(c.indicators.rsiOverbought)],
      ["requireAllIntervals", fmt(c.indicators.requireAllIntervals)],
      ["smiPdLookback", fmt(c.indicators.smiPdLookback)],
      ["smiPaLookback", fmt(c.indicators.smiPaLookback)],
      ["smiCrossWindow", fmt(c.indicators.smiCrossWindow)],
    ]),
    group("━ GRUP 14 — Koneksi & Relay", [
      ["lpAgentRelayEnabled", fmt(c.api.lpAgentRelayEnabled)],
      ["solMode", fmt(c.management.solMode)],
      ["agentId", fmt(c.hiveMind.agentId)],
      ["publicApiKey", secret(c.api.publicApiKey)],
    ]),
    group("━ GRUP 15 — HiveMind", [
      ["status", isHiveMindEnabled() ? "enabled" : "disabled"],
      ["hiveMindPullMode", fmt(c.hiveMind.pullMode)],
      ["hiveMindUrl", fmt(c.hiveMind.url)],
    ]),
    group("━ 🧪 GRUP 16 — Eksperimen (default OFF = pabrik)", [
      ["exitLiquidityCheck", fmt(c.experiments?.exitLiquidityCheck)],
      ["exitLiquidityMaxSlippagePct", fmt(c.experiments?.exitLiquidityMaxSlippagePct)],
      ["marketRegimeGate", fmt(c.experiments?.marketRegimeGate)],
      ["marketRegimeMaxDrop24hPct", fmt(c.experiments?.marketRegimeMaxDrop24hPct)],
      ["candidateMomentum", fmt(c.experiments?.candidateMomentum)],
      ["narrativeProfileSignal", fmt(c.experiments?.narrativeProfileSignal)],
      ["expectedYieldSignal", fmt(c.experiments?.expectedYieldSignal)],
      ["convictionSizing", fmt(c.experiments?.convictionSizing)],
      ["convictionSizingMaxAdjustPct", fmt(c.experiments?.convictionSizingMaxAdjustPct)],
      ["counterfactualReview", fmt(c.experiments?.counterfactualReview)],
      ["counterfactualMinMcapGainPct", fmt(c.experiments?.counterfactualMinMcapGainPct)],
      ["smartWalletMomentum", fmt(c.experiments?.smartWalletMomentum)],
      ["idleScreeningCooldown", fmt(c.experiments?.idleScreeningCooldown)],
      ["idleScreeningCooldownMin", fmt(c.experiments?.idleScreeningCooldownMin)],
      ["paperTrading", `${fmt(c.experiments?.paperTrading)}${c.experiments?.paperTrading ? " (DRY-RUN sim)" : ""}`],
      ["usePaperHistoryWhenLive", `${fmt(c.experiments?.usePaperHistoryWhenLive)}${c.experiments?.usePaperHistoryWhenLive ? " (live: paper=soft ref)" : ""}`],
    ]),
    group("━ GRUP 17 — Laporan", [
      ["learningReportEvery", `${fmt(c.reports?.learningReportEvery)}${c.reports?.learningReportEvery > 0 ? " (ON)" : " (OFF)"}`],
      ["learningReportTrendN", fmt(c.reports?.learningReportTrendN)],
    ]),
    group(`━ GMGN — ${gmgnActive ? "AKTIF (source=gmgn)" : `tidak aktif (source=${c.screening.source}, blok ini diabaikan)`}`, [
      ["interval", fmt(c.gmgn.interval)],
      ["orderBy", fmt(c.gmgn.orderBy)],
      ["direction", fmt(c.gmgn.direction)],
      ["platforms", fmt(c.gmgn.platforms)],
      ["filters", fmt(c.gmgn.filters)],
      ["minMcap", fmt(c.gmgn.minMcap)],
      ["maxMcap", fmt(c.gmgn.maxMcap)],
      ["minTvl", fmt(c.gmgn.minTvl)],
      ["minVolume", fmt(c.gmgn.minVolume)],
      ["minHolders", fmt(c.gmgn.minHolders)],
      ["minTokenAgeHours", fmt(c.gmgn.minTokenAgeHours)],
      ["maxTokenAgeHours", fmt(c.gmgn.maxTokenAgeHours)],
      ["athFilterPct", fmt(c.gmgn.athFilterPct)],
      ["minTotalFeeSol", fmt(c.gmgn.minTotalFeeSol)],
      ["requireKol", fmt(c.gmgn.requireKol)],
      ["minKolCount", fmt(c.gmgn.minKolCount)],
      ["minSmartDegenCount", fmt(c.gmgn.minSmartDegenCount)],
      ["maxRugRatio", fmt(c.gmgn.maxRugRatio)],
      ["maxBundlerRate", fmt(c.gmgn.maxBundlerRate)],
      ["maxRatTraderRate", fmt(c.gmgn.maxRatTraderRate)],
      ["maxFreshWalletRate", fmt(c.gmgn.maxFreshWalletRate)],
      ["maxDevTeamHoldRate", fmt(c.gmgn.maxDevTeamHoldRate)],
      ["maxBotDegenRate", fmt(c.gmgn.maxBotDegenRate)],
      ["maxSniperCount", fmt(c.gmgn.maxSniperCount)],
      ["maxSniperHoldRate", fmt(c.gmgn.maxSniperHoldRate)],
      ["preferredKolNames", fmt(c.gmgn.preferredKolNames)],
      ["preferredKolMinHoldPct", fmt(c.gmgn.preferredKolMinHoldPct)],
      ["dumpKolNames", fmt(c.gmgn.dumpKolNames)],
      ["dumpKolMinHoldPct", fmt(c.gmgn.dumpKolMinHoldPct)],
      ["indicatorFilter", fmt(c.gmgn.indicatorFilter)],
      ["indicatorInterval", fmt(c.gmgn.indicatorInterval)],
      ["rules.requireBullishSupertrend", fmt(ir.requireBullishSupertrend)],
      ["rules.rejectAlreadyAtBottom", fmt(ir.rejectAlreadyAtBottom)],
      ["rules.requireAboveSupertrend", fmt(ir.requireAboveSupertrend)],
      ["rules.minRsi", fmt(ir.minRsi)],
      ["rules.maxRsi", fmt(ir.maxRsi)],
      ["rules.requireBbPosition", fmt(ir.requireBbPosition)],
    ]),
  ];

  return `⚙️ Config lengkap (semua grup)\n\n${formatIdentityLines()}\n\n${blocks.join("\n\n")}\n\nUbah lewat /settings (menu tombol) atau chat biasa. Detail tiap setting: SETTINGS-GUIDE.md`;
}

function parseConfigValue(raw) {
  const value = String(raw ?? "").trim();
  if (!value.length) return "";
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^null$/i.test(value)) return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    return JSON.parse(value);
  }
  return value;
}

function settingValue(key) {
  const values = {
    solMode: config.management.solMode,
    lpAgentRelayEnabled: config.api.lpAgentRelayEnabled,
    chartIndicatorsEnabled: config.indicators.enabled,
    trailingTakeProfit: config.management.trailingTakeProfit,
    useDiscordSignals: config.screening.useDiscordSignals,
    blockPvpSymbols: config.screening.blockPvpSymbols,
    screeningSource: config.screening.source,
    screeningCategories: config.screening.categories,
    gmgnRequireKol: config.gmgn.requireKol,
    gmgnInterval: config.gmgn.interval,
    gmgnIndicatorFilter: config.gmgn.indicatorFilter,
    gmgnMinVolume: config.gmgn.minVolume,
    gmgnMinTokenAgeHours: config.gmgn.minTokenAgeHours,
    gmgnMaxTokenAgeHours: config.gmgn.maxTokenAgeHours,
    gmgnMaxBundlerRate: config.gmgn.maxBundlerRate,
    gmgnPreferredKolNames: config.gmgn.preferredKolNames,
    gmgnPreferredKolMinHoldPct: config.gmgn.preferredKolMinHoldPct,
    gmgnDumpKolNames: config.gmgn.dumpKolNames,
    gmgnDumpKolMinHoldPct: config.gmgn.dumpKolMinHoldPct,
    gmgnIndicatorInterval: config.gmgn.indicatorInterval,
    gmgnRequireBullishSt: config.gmgn.indicatorRules?.requireBullishSupertrend,
    gmgnRejectAtBottom: config.gmgn.indicatorRules?.rejectAlreadyAtBottom,
    gmgnRequireAboveSt: config.gmgn.indicatorRules?.requireAboveSupertrend,
    gmgnMinRsi: config.gmgn.indicatorRules?.minRsi,
    gmgnMaxRsi: config.gmgn.indicatorRules?.maxRsi,
    gmgnMinKolCount: config.gmgn.minKolCount,
    gmgnMinTotalFeeSol: config.gmgn.minTotalFeeSol,
    gmgnMinHolders: config.gmgn.minHolders,
    strategy: config.strategy.strategy,
    minBinsBelow: config.strategy.minBinsBelow,
    maxBinsBelow: config.strategy.maxBinsBelow,
    deployAmountSol: config.management.deployAmountSol,
    gasReserve: config.management.gasReserve,
    maxPositions: config.risk.maxPositions,
    maxDeployAmount: config.risk.maxDeployAmount,
    takeProfitPct: config.management.takeProfitPct,
    stopLossPct: config.management.stopLossPct,
    trailingTriggerPct: config.management.trailingTriggerPct,
    trailingDropPct: config.management.trailingDropPct,
    repeatDeployCooldownEnabled: config.management.repeatDeployCooldownEnabled,
    repeatDeployCooldownTriggerCount: config.management.repeatDeployCooldownTriggerCount,
    repeatDeployCooldownHours: config.management.repeatDeployCooldownHours,
    repeatDeployCooldownMinFeeEarnedPct: config.management.repeatDeployCooldownMinFeeEarnedPct,
    managementIntervalMin: config.schedule.managementIntervalMin,
    screeningIntervalMin: config.schedule.screeningIntervalMin,
    adaptiveScreening: config.schedule.adaptiveScreening,
    maxScreeningIntervalMin: config.schedule.maxScreeningIntervalMin,
    indicatorEntryPreset: config.indicators.entryPreset,
    indicatorExitPreset: config.indicators.exitPreset,
    indicatorExitEnabled: config.indicators.exitEnabled,
    indicatorRejectAtBottom: config.indicators.rejectAlreadyAtBottom,
    rsiLength: config.indicators.rsiLength,
    indicatorIntervals: config.indicators.intervals,
    requireAllIntervals: config.indicators.requireAllIntervals,
    smiPdLookback: config.indicators.smiPdLookback,
    smiPaLookback: config.indicators.smiPaLookback,
    smiCrossWindow: config.indicators.smiCrossWindow,
    // 🧪 GRUP 16 — Experiments
    candidateMomentum: config.experiments.candidateMomentum,
    smartWalletMomentum: config.experiments.smartWalletMomentum,
    expectedYieldSignal: config.experiments.expectedYieldSignal,
    narrativeProfileSignal: config.experiments.narrativeProfileSignal,
    counterfactualReview: config.experiments.counterfactualReview,
    counterfactualMinMcapGainPct: config.experiments.counterfactualMinMcapGainPct,
    exitLiquidityCheck: config.experiments.exitLiquidityCheck,
    exitLiquidityMaxSlippagePct: config.experiments.exitLiquidityMaxSlippagePct,
    marketRegimeGate: config.experiments.marketRegimeGate,
    marketRegimeMaxDrop24hPct: config.experiments.marketRegimeMaxDrop24hPct,
    convictionSizing: config.experiments.convictionSizing,
    convictionSizingMaxAdjustPct: config.experiments.convictionSizingMaxAdjustPct,
    idleScreeningCooldown: config.experiments.idleScreeningCooldown,
    idleScreeningCooldownMin: config.experiments.idleScreeningCooldownMin,
    paperTrading: config.experiments.paperTrading,
    usePaperHistoryWhenLive: config.experiments.usePaperHistoryWhenLive,
    // 📊 GRUP 17 — Reports & Gas
    learningReportEvery: config.reports.learningReportEvery,
    learningReportTrendN: config.reports.learningReportTrendN,
    gasReserveAutoTune: config.management.gasReserveAutoTune,
    gasReserveBufferDays: config.management.gasReserveBufferDays,
    gasReserveFloorSol: config.management.gasReserveFloorSol,
  };
  return values[key];
}

function getConfigValue(key) {
  const known = settingValue(key);
  if (known !== undefined) return known;
  for (const section of Object.values(config)) {
    if (section && typeof section === "object" && key in section) return section[key];
  }
  return undefined;
}

async function requestConfirmation(toolName, args) {
  // Recover EVERY arg shape the executor's update_config accepts, so the
  // confirmation gate never lets one slip through unprompted. Weak models invent:
  //   { changes: {...} } | { key, value } | { path: "a.b", value }
  //   { management: { solMode: true } } (section-nested) | { solMode: true } (bare)
  // BUG this fixes: requestConfirmation only parsed changes/key+value, so the
  // section-nested + bare shapes (which the executor DOES apply) skipped the
  // prompt entirely — observed on boolean toggles like "sol mode on". Mirrors
  // tools/executor.js update_config recovery; keep the two in sync.
  const coerce = (v) => {
    if (typeof v !== "string") return v;
    const lc = v.trim().toLowerCase();
    if (lc === "true") return true;
    if (lc === "false") return false;
    if (lc === "off" || lc === "null") return null;
    if (v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return v;
  };
  const RESERVED = new Set(["changes", "key", "value", "path", "reason"]);
  const KNOWN_SECTIONS = new Set(["screening", "management", "risk", "schedule", "llm", "strategy", "hiveMind", "api", "gmgn", "indicators", "chartIndicators", "experiments", "reports", "tokens", "darwin"]);
  const raw = {};
  if (args.changes && typeof args.changes === "object") Object.assign(raw, args.changes);
  if (typeof args.key === "string" && args.key.trim()) raw[args.key.trim()] = args.value;
  if (typeof args.path === "string" && args.path.trim()) raw[args.path.trim().split(".").pop()] = args.value;
  for (const [k, v] of Object.entries(args)) {
    if (RESERVED.has(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && KNOWN_SECTIONS.has(k)) {
      for (const [sk, sv] of Object.entries(v)) raw[sk] = sv;               // section-nested
    } else if (!(k in raw) && getConfigValue(k) !== undefined) {
      raw[k] = v;                                                          // bare flat (real key only)
    }
  }
  const changes = {};
  for (const [k, v] of Object.entries(raw)) changes[k] = coerce(v);

  // Drop no-op entries (requested value already matches live config) so we never
  // prompt for a change that does nothing. If nothing actually changes, skip the
  // prompt entirely and let the tool run — it reports a clean no-op.
  const effective = {};
  for (const [key, val] of Object.entries(changes)) {
    const current = getConfigValue(key);
    if (current !== undefined && String(current) === String(val)) continue;
    effective[key] = val;
  }
  if (Object.keys(effective).length === 0) return true;

  const signature = `${toolName}:${JSON.stringify(effective)}`;

  // Single-flight guard, claimed SYNCHRONOUSLY before any await. Weak models often
  // emit the same update_config tool call several times in one turn; agent.js runs
  // them in parallel (Promise.all), so without this each call would send its own
  // yes/no message (spam) and clobber the shared slot — leaving only one button live.
  // Identical duplicates collapse onto one prompt; a different change while one is
  // already pending is denied rather than stacked.
  if (_pendingConfirmation) {
    return _pendingConfirmation.signature === signature ? _pendingConfirmation.promise : false;
  }

  let resolveFn;
  const promise = new Promise((resolve) => { resolveFn = resolve; });
  const pending = { promise, resolve: resolveFn, timer: null, messageId: null, signature };
  _pendingConfirmation = pending; // claim the slot before awaiting the Telegram send

  pending.timer = setTimeout(async () => {
    if (_pendingConfirmation === pending) _pendingConfirmation = null;
    if (pending.messageId) await editMessage("⏰ Expired — no changes made.", pending.messageId).catch(() => {});
    resolveFn(false);
  }, 30_000);

  const lines = Object.entries(effective).map(([key, val]) => {
    const current = getConfigValue(key);
    return `  ${key}: ${current ?? "unset"} → ${val}`;
  });
  const sent = await sendMessageWithButtons(`⚠️ Update config?\n${lines.join("\n")}`, [
    [
      { text: "✅ Ya", callback_data: "confirm:yes" },
      { text: "❌ Batal", callback_data: "confirm:no" },
    ],
  ]);
  pending.messageId = sent?.result?.message_id ?? null;

  return promise;
}

function fmtSettingValue(value) {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "boolean") return value ? "on" : "off";
  return String(value);
}

function settingButton(label, data) {
  return { text: label, callback_data: data };
}

function toggleButton(key, label) {
  return settingButton(`${label}: ${fmtSettingValue(settingValue(key))}`, `cfg:toggle:${key}`);
}

// Multi-category merge toggle. categories is an array (merge) or null (factory single
// `category`). A category is ON only when explicitly listed; null/[] = all OFF (factory).
function categoryButton(cat) {
  const cats = config.screening.categories;
  const on = Array.isArray(cats) && cats.includes(cat);
  return settingButton(`${cat} ${on ? "✅" : "⬜"}`, `cfg:cat:${cat}`);
}

function stepButtons(key, label, step, { digits = 2 } = {}) {
  const value = Number(settingValue(key));
  const shown = Number.isFinite(value) ? value.toFixed(digits).replace(/\.?0+$/, "") : "?";
  return [
    settingButton(`- ${label}`, `cfg:step:${key}:${-step}`),
    settingButton(`${label}: ${shown}`, `cfg:noop`),
    settingButton(`+ ${label}`, `cfg:step:${key}:${step}`),
  ];
}

function inputButton(key, label, { digits = 0 } = {}) {
  const value = settingValue(key);
  const shown = value == null ? "off" : Number.isFinite(Number(value)) ? String(parseFloat(Number(value).toFixed(digits))) : String(value);
  return [settingButton(`${label}: ${shown} ✏`, `cfg:input:${key}`)];
}

// Which settings page a given key lives on — used to return to the right page after
// a toggle/step/set/input. Single source of truth (was duplicated in two callbacks).
function pageForKey(key) {
  if (["gmgnPreferredKolNames", "gmgnPreferredKolMinHoldPct", "gmgnDumpKolNames", "gmgnDumpKolMinHoldPct"].includes(key)) return "kol";
  if (["gmgnMinVolume", "gmgnMaxBundlerRate", "gmgnMinTokenAgeHours", "gmgnMaxTokenAgeHours"].includes(key)) return "screen";
  if (key.startsWith("gmgn") && key !== "gmgnRequireKol") return "gmgn";
  if (key.startsWith("indicator") || key.startsWith("smi") || key === "chartIndicatorsEnabled" || key === "rsiLength" || key === "requireAllIntervals") return "indicators";
  if (["minBinsBelow", "maxBinsBelow"].includes(key)) return "strategy";
  if (["useDiscordSignals", "blockPvpSymbols", "managementIntervalMin", "screeningIntervalMin", "maxScreeningIntervalMin", "adaptiveScreening", "screeningSource", "screeningCategories", "gmgnRequireKol"].includes(key)) return "screen";
  if (["candidateMomentum", "smartWalletMomentum", "expectedYieldSignal", "narrativeProfileSignal", "counterfactualReview", "counterfactualMinMcapGainPct", "exitLiquidityCheck", "exitLiquidityMaxSlippagePct", "marketRegimeGate", "marketRegimeMaxDrop24hPct", "convictionSizing", "convictionSizingMaxAdjustPct", "idleScreeningCooldown", "idleScreeningCooldownMin", "paperTrading", "usePaperHistoryWhenLive"].includes(key)) return "experiments";
  if (["learningReportEvery", "learningReportTrendN", "gasReserveAutoTune", "gasReserveBufferDays", "gasReserveFloorSol"].includes(key)) return "reports";
  return "risk";
}

function renderSettingsMenu(page = "main") {
  const title = page === "main" ? "Settings menu" : `Settings: ${page}`;
  const identityLine = (() => { try { return formatIdentity({ compact: true }); } catch { return "🧬 Profil: — · 🗂️ Racikan: —"; } })();
  const summary = [
    title,
    "",
    identityLine,
    `Mode: ${config.management.solMode ? "SOL" : "USD"} | Relay: ${config.api.lpAgentRelayEnabled ? "on" : "off"}`,
    `Screening: ${config.screening.source} | cats ${Array.isArray(config.screening.categories) && config.screening.categories.length ? config.screening.categories.join(",") : `single (${config.screening.category})`} | GMGN KOL ${config.gmgn.requireKol ? "required" : "preferred"}`,
    `Strategy: ${config.strategy.strategy} | deploy ${config.management.deployAmountSol} SOL | max pos ${config.risk.maxPositions}`,
    `TP/SL: ${config.management.takeProfitPct}% / ${config.management.stopLossPct}% | trailing ${config.management.trailingTakeProfit ? "on" : "off"}`,
    `Indicators: ${config.indicators.enabled ? "on" : "off"} | entry ${config.indicators.entryPreset} | ${fmtSettingValue(config.indicators.intervals)}`,
    `🧪 Experiments ON: ${Object.entries(config.experiments).filter(([, v]) => v === true).map(([k]) => k).join(", ") || "none"}`,
  ].join("\n");
  let bodyText = summary;

  const nav = [
    [
      settingButton("Main", "cfg:page:main"),
      settingButton("Risk", "cfg:page:risk"),
      settingButton("Strategy", "cfg:page:strategy"),
    ],
    [
      settingButton("Screen", "cfg:page:screen"),
      settingButton("Indicators", "cfg:page:indicators"),
      settingButton("GMGN", "cfg:page:gmgn"),
      settingButton("KOL", "cfg:page:kol"),
    ],
    [
      settingButton("🧪 Experiments", "cfg:page:experiments"),
      settingButton("📊 Reports", "cfg:page:reports"),
      settingButton("🗂️ Racikan", "cfg:page:presets"),
    ],
  ];

  const footer = [
    [
      settingButton("Refresh", `cfg:page:${page}`),
      settingButton("Close", "cfg:close"),
    ],
  ];

  let rows;
  if (page === "risk") {
    rows = [
      inputButton("deployAmountSol", "Deploy SOL", { digits: 2 }),
      inputButton("gasReserve", "Gas reserve", { digits: 2 }),
      inputButton("maxPositions", "Max positions"),
      inputButton("maxDeployAmount", "Max SOL"),
      inputButton("takeProfitPct", "TP %"),
      inputButton("stopLossPct", "SL %"),
      [toggleButton("trailingTakeProfit", "Trailing TP")],
      inputButton("trailingTriggerPct", "Trail trigger", { digits: 1 }),
      inputButton("trailingDropPct", "Trail drop", { digits: 1 }),
      [toggleButton("repeatDeployCooldownEnabled", "Repeat cooldown")],
      inputButton("repeatDeployCooldownTriggerCount", "Repeat count"),
      inputButton("repeatDeployCooldownHours", "Repeat hrs"),
      inputButton("repeatDeployCooldownMinFeeEarnedPct", "Min fee earned %", { digits: 1 }),
    ];
  } else if (page === "screen") {
    rows = [
      [
        settingButton("Source: Meteora", "cfg:set:screeningSource:meteora"),
        settingButton("Source: GMGN", "cfg:set:screeningSource:gmgn"),
      ],
      [
        categoryButton("trending"),
        categoryButton("top"),
        categoryButton("new"),
      ],
      [toggleButton("gmgnRequireKol", "GMGN require KOL")],
      [toggleButton("useDiscordSignals", "Discord signals"), toggleButton("blockPvpSymbols", "PVP hard block")],
      [
        settingButton("5m", "cfg:set:gmgnInterval:5m"),
        settingButton("1h", "cfg:set:gmgnInterval:1h"),
        settingButton("6h", "cfg:set:gmgnInterval:6h"),
        settingButton("24h", "cfg:set:gmgnInterval:24h"),
      ],
      [
        inputButton("gmgnMinVolume", "Min volume")[0],
        inputButton("gmgnMinTokenAgeHours", "Min token age (h)")[0],
      ],
      [
        inputButton("gmgnMaxTokenAgeHours", "Max token age (h)")[0],
        inputButton("gmgnMaxBundlerRate", "Max bundler %")[0],
      ],
      [settingButton("KOL settings", "cfg:page:kol")],
      inputButton("managementIntervalMin", "Manage interval (min)"),
      inputButton("screeningIntervalMin", "Screen interval — min/floor (min)"),
      [toggleButton("adaptiveScreening", "Adaptive screening")],
      inputButton("maxScreeningIntervalMin", "Screen interval — max/ceil (min)"),
    ];
  } else if (page === "strategy") {
    rows = [
      [
        settingButton("spot", "cfg:set:strategy:spot"),
        settingButton("bid_ask", "cfg:set:strategy:bid_ask"),
      ],
      inputButton("minBinsBelow", "Min bins"),
      inputButton("maxBinsBelow", "Max bins"),
    ];
  } else if (page === "gmgn") {
    rows = [
      [toggleButton("gmgnIndicatorFilter", "Indicator filter"), toggleButton("gmgnRequireKol", "Require KOL")],
      [
        settingButton("TF: 5m", "cfg:set:gmgnIndicatorInterval:5_MINUTE"),
        settingButton("TF: 15m", "cfg:set:gmgnIndicatorInterval:15_MINUTE"),
        settingButton("TF: 1h", "cfg:set:gmgnIndicatorInterval:1h"),
      ],
      [toggleButton("gmgnRequireBullishSt", "Bullish ST"), toggleButton("gmgnRejectAtBottom", "Reject at bottom"), toggleButton("gmgnRequireAboveSt", "Above ST")],
      inputButton("gmgnMinRsi", "Min RSI"),
      inputButton("gmgnMaxRsi", "Max RSI"),
      inputButton("gmgnMinKolCount", "Min KOL"),
      inputButton("gmgnMinTotalFeeSol", "Min fee SOL"),
      inputButton("gmgnMinHolders", "Min holders"),
      [settingButton("KOL settings", "cfg:page:kol")],
    ];
  } else if (page === "kol") {
    rows = [
      inputButton("gmgnPreferredKolNames", "Preferred KOL (comma-sep)"),
      inputButton("gmgnPreferredKolMinHoldPct", "Preferred KOL min hold %"),
      inputButton("gmgnDumpKolNames", "Dump KOL (comma-sep)"),
      inputButton("gmgnDumpKolMinHoldPct", "Dump KOL min hold %"),
    ];
  } else if (page === "indicators") {
    rows = [
      [toggleButton("chartIndicatorsEnabled", "Chart indicators"), toggleButton("requireAllIntervals", "Require all TF")],
      [
        settingButton("TF: 5m", "cfg:set:indicatorIntervals:5_MINUTE"),
        settingButton("TF: 15m", "cfg:set:indicatorIntervals:15_MINUTE"),
        settingButton("TF: both", "cfg:set:indicatorIntervals:both"),
      ],
      [toggleButton("indicatorExitEnabled", "Exit triggers close"), toggleButton("indicatorRejectAtBottom", "Reject @ bottom")],
      [
        settingButton("Entry: ST", "cfg:set:indicatorEntryPreset:supertrend_break"),
        settingButton("Entry: RSI", "cfg:set:indicatorEntryPreset:rsi_reversal"),
        settingButton("Entry: ST/RSI", "cfg:set:indicatorEntryPreset:supertrend_or_rsi"),
      ],
      [settingButton("Entry: ST+SMI", "cfg:set:indicatorEntryPreset:supertrend_plus_smi")],
      [
        settingButton("Exit: ST", "cfg:set:indicatorExitPreset:supertrend_break"),
        settingButton("Exit: RSI", "cfg:set:indicatorExitPreset:rsi_reversal"),
        settingButton("Exit: BB+RSI", "cfg:set:indicatorExitPreset:bb_plus_rsi"),
      ],
      inputButton("rsiLength", "RSI length"),
      inputButton("smiPdLookback", "SMI PD lookback"),
      inputButton("smiPaLookback", "SMI PA lookback"),
      inputButton("smiCrossWindow", "SMI cross window"),
    ];
  } else if (page === "experiments") {
    // 🧪 GRUP 16 — semua default OFF = perilaku pabrik. Soft signals dulu, lalu gate, lalu sizing.
    rows = [
      [toggleButton("candidateMomentum", "Candidate momentum"), toggleButton("smartWalletMomentum", "Smart-wallet mom.")],
      [toggleButton("expectedYieldSignal", "Expected yield"), toggleButton("narrativeProfileSignal", "Narrative profile")],
      [toggleButton("counterfactualReview", "Counterfactual review")],
      inputButton("counterfactualMinMcapGainPct", "Counterfactual min mcap gain %"),
      [toggleButton("exitLiquidityCheck", "Exit-liquidity GATE")],
      inputButton("exitLiquidityMaxSlippagePct", "Exit max slippage %", { digits: 1 }),
      [toggleButton("marketRegimeGate", "Market-regime GATE")],
      inputButton("marketRegimeMaxDrop24hPct", "Regime max SOL drop 24h %", { digits: 1 }),
      [toggleButton("convictionSizing", "Conviction sizing (moves capital)")],
      inputButton("convictionSizingMaxAdjustPct", "Conviction max adjust %"),
      [toggleButton("idleScreeningCooldown", "Idle screening cooldown")],
      inputButton("idleScreeningCooldownMin", "Idle cooldown minutes"),
      [toggleButton("paperTrading", "Paper trading (DRY-RUN sim)")],
      [toggleButton("usePaperHistoryWhenLive", "Use paper history when live (soft ref)")],
    ];
  } else if (page === "reports") {
    // 📊 GRUP 17 — laporan & gas reserve auto-tune
    rows = [
      inputButton("learningReportEvery", "Learning report every N closes (0=off)"),
      inputButton("learningReportTrendN", "Trend window N"),
      [toggleButton("gasReserveAutoTune", "Gas reserve auto-tune")],
      inputButton("gasReserveBufferDays", "Gas buffer days"),
      inputButton("gasReserveFloorSol", "Gas reserve floor SOL", { digits: 2 }),
    ];
  } else if (page === "presets") {
    // 🗂️ Config presets — per row: ▶ load · 🔍 diff · 🗑️ delete. Plus 💾 save current.
    const presets = listPresets();
    const lines = presets.length
      ? presets.map((p) => p.error
          ? `⚠ ${p.name}`
          : `${p.isCurrent ? "●" : "○"} ${p.name} — ${p.dryRun ? "🧪 dry-run" : "live"} · ${p.keys} keys${p.isCurrent ? " (current)" : ""}`)
      : ["(belum ada preset)"];
    const setupStatus = (() => {
      try { const s = getActiveSetupStatus(); return s.name ? `${s.name}${s.edited ? " ✎ (ada edit manual)" : ""}` : "— (belum load)"; } catch { return "—"; }
    })();
    bodyText = ["🗂️ Racikan (setup tersimpan)", "",
      `Aktif: ${setupStatus}`,
      "(Racikan = snapshot config penuh. Beda dari 🧬 Profil = arketipe wizard.)", "",
      ...lines, "",
      "● = sama dgn config live · 🧪 = isi file dryRun (bukan berarti jalan)",
      "Per baris: ▶ load · 🔍 lihat beda · 🗑️ hapus.",
      "💾 = simpan config sekarang jadi racikan baru.",
    ].join("\n");
    rows = presets.map((p) => p.error
      ? [settingButton(`⚠ ${p.name}`, "cfg:noop")]
      : [
          settingButton(`${p.isCurrent ? "●" : "▶"} ${p.name}${p.dryRun ? " 🧪" : ""}`, `cfg:preset:ask:${p.name}`),
          settingButton("🔍", `cfg:preset:diff:${p.name}`),
          settingButton("🗑️", `cfg:preset:rmask:${p.name}`),
        ]);
    rows.push([settingButton("💾 Simpan config sekarang", "cfg:preset:save")]);
  } else {
    rows = [
      [
        settingButton("Source: Meteora", "cfg:set:screeningSource:meteora"),
        settingButton("Source: GMGN", "cfg:set:screeningSource:gmgn"),
      ],
      [toggleButton("solMode", "SOL mode"), toggleButton("lpAgentRelayEnabled", "LPAgent relay")],
      [toggleButton("chartIndicatorsEnabled", "Chart indicators"), toggleButton("trailingTakeProfit", "Trailing TP")],
      [
        settingButton("Risk / deploy", "cfg:page:risk"),
        settingButton("Screening", "cfg:page:screen"),
      ],
      [
        settingButton("Indicators", "cfg:page:indicators"),
        settingButton("Show config", "cfg:show"),
      ],
    ];
  }

  return { text: bodyText, keyboard: [...nav, ...rows, ...footer] };
}

async function showSettingsMenu({ messageId = null, page = "main" } = {}) {
  const menu = renderSettingsMenu(page);
  if (messageId) {
    await editMessageWithButtons(menu.text, messageId, menu.keyboard);
  } else {
    await sendMessageWithButtons(menu.text, menu.keyboard);
  }
}

function normalizeMenuValue(key, raw) {
  if (key === "indicatorIntervals") {
    if (raw === "both") return ["5_MINUTE", "15_MINUTE"];
    return [raw];
  }
  if (key === "gmgnPreferredKolNames" || key === "gmgnDumpKolNames") {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return parseConfigValue(raw);
}

async function applySettingsMenuCallback(msg) {
  const data = msg.callbackData || msg.text || "";
  const parts = data.split(":");
  const action = parts[1];
  let page = "main";

  if (action === "noop") {
    await answerCallbackQuery(msg.callbackQueryId);
    return;
  }
  if (action === "input") {
    const inputKey = parts[2];
    const currentVal = settingValue(inputKey);
    const inputPage = pageForKey(inputKey);
    _pendingInput = { key: inputKey, page: inputPage, menuMsgId: msg.messageId };
    await answerCallbackQuery(msg.callbackQueryId);
    await sendMessage(`Enter new value for ${inputKey} (current: ${currentVal ?? "off"}):\nSend a number, or "off" to clear.`);
    return;
  }
  if (action === "close") {
    await answerCallbackQuery(msg.callbackQueryId, "Closed");
    await editMessage("Settings menu closed.", msg.messageId);
    return;
  }
  if (action === "show") {
    await answerCallbackQuery(msg.callbackQueryId);
    await editMessageWithButtons(formatConfigSnapshot(), msg.messageId, [[settingButton("Back", "cfg:page:main")]]);
    return;
  }
  if (action === "page") {
    page = parts[2] || "main";
    await answerCallbackQuery(msg.callbackQueryId);
    await showSettingsMenu({ messageId: msg.messageId, page });
    return;
  }
  if (action === "preset") {
    const sub = parts[2];
    const name = parts.slice(3).join(":");
    if (sub === "save") {
      // Needs a typed name — buttons can't, so prompt for text input.
      _pendingInput = { action: "presetSave", menuMsgId: msg.messageId };
      await answerCallbackQuery(msg.callbackQueryId);
      await sendMessage("💾 Ketik nama preset untuk menyimpan config sekarang (huruf/angka/_/-, maks 40):");
      return;
    }
    // The rest operate on an existing preset.
    if (!presetExists(name)) {
      await answerCallbackQuery(msg.callbackQueryId, "Preset tidak ada");
      await showSettingsMenu({ messageId: msg.messageId, page: "presets" });
      return;
    }
    if (sub === "diff") {
      const diffs = getPresetDiff(name);
      await answerCallbackQuery(msg.callbackQueryId);
      const shown = diffs.length
        ? diffs.slice(0, 30).map((d) => `${d.key}: ${d.from} → ${d.to}`)
        : ["(identik dengan config sekarang)"];
      const more = diffs.length > 30 ? `\n…+${diffs.length - 30} lagi` : "";
      await editMessageWithButtons(
        `🔍 "${name}" vs config sekarang (${diffs.length} beda):\n${shown.join("\n")}${more}`,
        msg.messageId,
        [[settingButton(`✅ Load "${name}"`, `cfg:preset:ask:${name}`)], [settingButton("Back", "cfg:page:presets")]],
      );
      return;
    }
    if (sub === "rmask") {
      await answerCallbackQuery(msg.callbackQueryId);
      await editMessageWithButtons(
        `🗑️ Hapus preset "${name}"? Permanen (file dihapus, config live tidak terpengaruh).`,
        msg.messageId,
        [[settingButton(`🗑️ Ya, hapus "${name}"`, `cfg:preset:rmgo:${name}`)], [settingButton("Batal", "cfg:page:presets")]],
      );
      return;
    }
    if (sub === "rmgo") {
      deletePreset(name);
      await answerCallbackQuery(msg.callbackQueryId, `Dihapus: ${name}`);
      await showSettingsMenu({ messageId: msg.messageId, page: "presets" });
      return;
    }
    if (sub === "ask") {
      const diffs = getPresetDiff(name);
      await answerCallbackQuery(msg.callbackQueryId);
      const body = [
        `⚠️ Load preset "${name}"?`,
        diffs.length ? `${diffs.length} setting berubah vs config sekarang.` : "Config sudah sama — tidak ada yang berubah.",
        "Config sekarang di-backup (rollback via _backup), lalu bot RESTART untuk apply penuh.",
      ].join("\n");
      await editMessageWithButtons(body, msg.messageId, [
        [settingButton(`✅ Load "${name}" & restart`, `cfg:preset:go:${name}`)],
        [settingButton("Batal", "cfg:page:presets")],
      ]);
      return;
    }
    if (sub === "go") {
      const diffs = getPresetDiff(name);
      const r = applyPreset(name);
      await answerCallbackQuery(msg.callbackQueryId, `Loaded ${name}`);
      await editMessage(`✅ Preset "${name}" di-load (${diffs.length} setting berubah). Rollback: /preset use ${r.backup}`, msg.messageId);
      await finishPresetApply({ viaTelegram: true });
      return;
    }
    await answerCallbackQuery(msg.callbackQueryId, "Aksi preset tidak dikenal");
    return;
  }

  if (action === "cat") {
    // Toggle one screening category in the merge list. Removing the last one clears the
    // list to null → factory single-category behavior (uses config.screening.category).
    const cat = parts[2];
    const cur = Array.isArray(config.screening.categories) ? config.screening.categories.slice() : [];
    const idx = cur.indexOf(cat);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(cat);
    const value = cur.length ? cur : null;
    const result = await executeTool("update_config", {
      changes: { screeningCategories: value },
      reason: "Telegram settings menu",
    });
    if (!result?.success) {
      await answerCallbackQuery(msg.callbackQueryId, "Config update failed");
      return;
    }
    await answerCallbackQuery(msg.callbackQueryId, `categories: ${value ? value.join(",") : "off (factory)"}`);
    await showSettingsMenu({ messageId: msg.messageId, page: "screen" });
    return;
  }

  const key = parts[2];
  let value;
  if (action === "toggle") {
    value = !Boolean(settingValue(key));
  } else if (action === "step") {
    const current = Number(settingValue(key));
    const delta = Number(parts[3]);
    if (!Number.isFinite(current) || !Number.isFinite(delta)) {
      await answerCallbackQuery(msg.callbackQueryId, "Invalid setting");
      return;
    }
    value = Number((current + delta).toFixed(4));
    if (key === "maxPositions") value = Math.max(1, Math.round(value));
    if (key === "rsiLength") value = Math.max(2, Math.round(value));
    if (key === "repeatDeployCooldownTriggerCount") value = Math.max(1, Math.round(value));
    if (key === "repeatDeployCooldownHours") value = Math.max(0, Math.round(value));
    if (key === "repeatDeployCooldownMinFeeEarnedPct") value = Math.max(0, value);
    if (["deployAmountSol", "gasReserve", "maxDeployAmount"].includes(key)) value = Math.max(0, value);
  } else if (action === "set") {
    value = normalizeMenuValue(key, parts.slice(3).join(":"));
  } else {
    await answerCallbackQuery(msg.callbackQueryId, "Unknown action");
    return;
  }

  const result = await executeTool("update_config", {
    changes: { [key]: value },
    reason: "Telegram settings menu",
  });
  if (!result?.success) {
    await answerCallbackQuery(msg.callbackQueryId, "Config update failed");
    return;
  }
  page = pageForKey(key);
  await answerCallbackQuery(msg.callbackQueryId, `Updated ${key}`);
  await showSettingsMenu({ messageId: msg.messageId, page });
}

function formatHelpText() {
  return [
    "🤖 Meridian — Commands",
    "",
    "📊 LAPORAN & STATUS",
    "/status — wallet + positions snapshot",
    "/wallet — wallet, deploy amount, HiveMind + SOL growth tracker (1d/7d/30d)",
    "/positions — list open positions",
    "/pool <n> — detailed info for one position",
    "/briefing — morning briefing (auto-pinned)",
    "/report [week|month|day] — trade learning report",
    "",
    "🛠️ POSISI & DEPLOY",
    "/close <n> — close one position by index",
    "/closeall — close all open positions",
    "/set <n> <note> — set note/instruction on position",
    "/screen — refresh deterministic candidate list",
    "/candidates — show latest cached candidates",
    "/deploy <n> — deploy candidate by cached index",
    "",
    "⚙️ KONFIGURASI",
    "/config — show full runtime config (grouped)",
    "/settings — button menu for common config",
    "/setcfg <key> <value> — update persisted config",
    "/preset [list|save|use|show <nama>] — simpan/ganti profil config",
    "/guide [no|katakunci|all] — panduan setting",
    "",
    "🔧 SISTEM",
    "/hive — HiveMind sync status",
    "/hive pull — manual HiveMind pull now",
    "/pause — stop cron cycles",
    "/resume — start cron cycles again",
    "/stop — shut down agent",
    "/help — show this list",
  ].join("\n");
}

// ─── Config presets (/preset) ───────────────────────────────────
function presetUsageText() {
  return [
    "🗂️ /preset — config presets (snapshot user-config.json)",
    "/preset list — daftar preset",
    "/preset save <nama> — simpan config saat ini jadi preset",
    "/preset use <nama> — load preset (auto-backup + restart)",
    "/preset show <nama> — lihat apa yg berubah vs config sekarang",
    "/preset rm <nama> — hapus preset",
  ].join("\n");
}

// Returns { text, applied?, name? }. Pure (file ops only) — no restart here.
function runPresetCommand(argStr) {
  const parts = String(argStr || "").trim().split(/\s+/).filter(Boolean);
  const sub = (parts[0] || "list").toLowerCase();
  const name = parts[1];
  try {
    if (sub === "list" || sub === "ls") {
      const presets = listPresets();
      if (!presets.length) return { text: "Belum ada racikan. Simpan dengan: /preset save <nama>" };
      const lines = presets.map((p) => {
        if (p.error) return `! ${p.name} — tidak terbaca`;
        const mark = p.isCurrent ? "●" : "○";
        const mode = p.dryRun ? "🧪 dry-run" : "live";
        return `${mark} ${p.name} — ${mode} · ${p.keys} keys${p.isCurrent ? "  (current)" : ""}`;
      });
      const st = getActiveSetupStatus();
      const active = st.name ? `${st.name}${st.edited ? " ✎ (ada edit manual)" : ""}` : "— (belum load)";
      return { text: `🗂️ Racikan (setup tersimpan)\nAktif: ${active}\n\n${lines.join("\n")}\n\n${presetUsageText()}` };
    }
    if (sub === "save") {
      if (!name) return { text: "Format: /preset save <nama>" };
      if (!validName(name)) return { text: `Nama tidak valid "${name}". Pakai huruf/angka/_/- (maks 40).` };
      const r = savePreset(name);
      return { text: `✅ Config saat ini disimpan → preset "${name}"${r.overwritten ? " (menimpa yang lama)" : ""}.` };
    }
    if (sub === "show" || sub === "diff") {
      if (!name) return { text: "Format: /preset show <nama>" };
      if (!presetExists(name)) return { text: `Preset "${name}" tidak ada. Coba /preset list.` };
      const diffs = getPresetDiff(name);
      if (!diffs.length) return { text: `Preset "${name}" identik dengan config saat ini — tidak ada yang berubah.` };
      const shown = diffs.slice(0, 30).map((d) => `  ${d.key}: ${d.from} → ${d.to}`);
      const more = diffs.length > 30 ? `\n  …+${diffs.length - 30} lagi` : "";
      return { text: `🔍 Kalau load "${name}", ${diffs.length} setting berubah:\n${shown.join("\n")}${more}` };
    }
    if (sub === "use" || sub === "load") {
      if (!name) return { text: "Format: /preset use <nama>" };
      if (!presetExists(name)) return { text: `Preset "${name}" tidak ada. Coba /preset list.` };
      const diffs = getPresetDiff(name);
      const r = applyPreset(name);
      const sample = diffs.slice(0, 4).map((d) => `${d.key} ${d.from}→${d.to}`).join(", ");
      const cnt = diffs.length
        ? `   ${diffs.length} setting berubah (a.l. ${sample}${diffs.length > 4 ? ", …" : ""})`
        : "   (config sudah sama — tidak ada yang berubah)";
      const back = r.backup ? `\n   Rollback: /preset use ${r.backup}` : "";
      return { text: `✅ Preset "${name}" di-load → user-config.json\n${cnt}${back}`, applied: true, name };
    }
    if (sub === "rm" || sub === "delete" || sub === "del") {
      if (!name) return { text: "Format: /preset rm <nama>" };
      if (!presetExists(name)) return { text: `Preset "${name}" tidak ada.` };
      deletePreset(name);
      return { text: `🗑️ Preset "${name}" dihapus.` };
    }
    return { text: presetUsageText() };
  } catch (e) {
    return { text: `Preset error: ${e.message}` };
  }
}

function underPm2() {
  return process.env.pm_id !== undefined || !!process.env.PM2_HOME || !!process.env.PM2_USAGE;
}

// Called after a successful `/preset use`. A full restart is what truly applies a
// preset (DRY_RUN/wallet/RPC/model are read once at startup) — auto-restart only
// when running under pm2 (which brings the process back); otherwise instruct.
async function finishPresetApply({ viaTelegram }) {
  const note = underPm2()
    ? "♻️ Auto-restart via pm2 dalam 2 detik untuk apply penuh (DRY_RUN/wallet/model dibaca saat start)…"
    : "♻️ Restart proses untuk apply penuh (mis. `pm2 restart meridian`). Restart cron saja tidak cukup — DRY_RUN/wallet/RPC/model dibaca saat start.";
  if (viaTelegram) await sendMessage(note).catch(() => {});
  else console.log(note);
  if (underPm2()) setTimeout(() => process.exit(0), 2000);
}

async function runDeterministicScreen(limit = 5) {
  const top = await getTopCandidates({ limit });
  const candidates = (top?.candidates || top?.pools || []).slice(0, limit);
  setLatestCandidates(candidates);
  if (candidates.length > 0) {
    const lines = candidates.map((pool, i) => {
      const feeTvl = pool.fee_active_tvl_ratio ?? pool.fee_tvl_ratio ?? "?";
      const vol = pool.volume_window ?? pool.volume_24h ?? "?";
      const source = pool.gmgn ? ` | GMGN smart ${pool.gmgn_smart_wallets ?? "?"}, KOL ${pool.gmgn_kol_wallets ?? "?"}, total fee ${pool.gmgn_total_fee_sol ?? "?"} SOL` : ` | organic ${pool.organic_score ?? "?"}`;
      return `${i + 1}. ${pool.name} | ${pool.pool}\n   fee/aTVL ${feeTvl}% | vol $${vol}${source}`;
    });
    return `Top candidates (${candidates.length})\n\n${lines.join("\n")}`;
  }
  const examples = (top?.filtered_examples || []).slice(0, 3)
    .map((entry) => `- ${entry.name}: ${entry.reason}`)
    .join("\n");
  return examples
    ? `No candidates available.\nFiltered examples:\n${examples}`
    : "No candidates available right now.";
}

async function deployLatestCandidate(index) {
  const candidate = _latestCandidates[index];
  if (!candidate) {
    throw new Error("Invalid candidate index. Run /screen first.");
  }
  if (_latestCandidates.length === 1) {
    const mint = candidate.base?.mint || candidate.base_mint || null;
    const [smartWallets, narrative, tokenInfo] = await Promise.allSettled([
      checkSmartWalletsOnPool({ pool_address: candidate.pool }),
      mint ? getTokenNarrative({ mint }) : Promise.resolve(null),
      mint ? getTokenInfo({ query: mint }) : Promise.resolve(null),
    ]);
    const context = {
      pool: candidate,
      sw: smartWallets.status === "fulfilled" ? smartWallets.value : null,
      n: narrative.status === "fulfilled" ? narrative.value : null,
      ti: tokenInfo.status === "fulfilled" ? tokenInfo.value?.results?.[0] : null,
    };
    const skipReason = getLoneCandidateSkipReason(context);
    if (skipReason) {
      appendDecision({
        type: "no_deploy",
        actor: "SCREENER",
        summary: "Single cached candidate skipped",
        reason: skipReason,
        pool: candidate.pool,
        pool_name: candidate.name,
      });
      throw new Error(`NO DEPLOY: only cached candidate ${candidate.name} is not worth deploying — ${skipReason}`);
    }
  }
  const deployAmount = computeDeployAmount((await getWalletBalances()).sol);
  const binsBelow = computeBinsBelow(candidate.volatility);
  const result = await executeTool("deploy_position", {
    pool_address: candidate.pool,
    amount_y: deployAmount,
    strategy: config.strategy.strategy,
    bins_below: binsBelow,
    bins_above: 0,
    pool_name: candidate.name,
    base_mint: candidate.base?.mint || candidate.base_mint || null,
    bin_step: candidate.bin_step,
    base_fee: candidate.base_fee,
    volatility: candidate.volatility,
    fee_tvl_ratio: candidate.fee_active_tvl_ratio ?? candidate.fee_tvl_ratio,
    organic_score: candidate.organic_score,
    initial_value_usd: candidate.tvl ?? candidate.active_tvl ?? null,
  });
  if (result?.success === false || result?.error) {
    throw new Error(result.error || "Deploy failed");
  }
  return { result, candidate, deployAmount, binsBelow };
}

function appendHistory(userMsg, assistantMsg) {
  sessionHistory.push({ role: "user", content: userMsg });
  sessionHistory.push({ role: "assistant", content: assistantMsg });
  // Trim to last MAX_HISTORY messages
  if (sessionHistory.length > MAX_HISTORY) {
    sessionHistory.splice(0, sessionHistory.length - MAX_HISTORY);
  }
}

function refreshPrompt() {
  if (!_ttyInterface) return;
  _ttyInterface.setPrompt(buildPrompt());
  _ttyInterface.prompt(true);
}

async function drainTelegramQueue() {
  while (_telegramQueue.length > 0 && !_managementBusy && !_screeningBusy && !busy) {
    const queued = _telegramQueue.shift();
    await telegramHandler(queued);
  }
}

async function telegramHandler(msg) {
  const text = msg?.text?.trim();
  if (!text) return;

  if (msg?.isCallback && text.startsWith("confirm:")) {
    const action = text.split(":")[1];
    if (_pendingConfirmation) {
      clearTimeout(_pendingConfirmation.timer);
      const confirmed = action === "yes";
      const msgId = _pendingConfirmation.messageId;
      const resolve = _pendingConfirmation.resolve;
      _pendingConfirmation = null;
      await answerCallbackQuery(msg.callbackQueryId, confirmed ? "Confirmed" : "Cancelled");
      if (msgId) await editMessage(confirmed ? "✅ Confirmed — updating..." : "❌ Cancelled — no changes made.", msgId).catch(() => {});
      resolve(confirmed);
    } else {
      await answerCallbackQuery(msg.callbackQueryId, "Expired");
    }
    return;
  }

  if (_pendingInput && !msg.isCallback && !text.startsWith("/")) {
    const pending = _pendingInput;
    _pendingInput = null;
    if (pending.action === "presetSave") {
      const name = text.trim();
      if (!validName(name)) {
        await sendMessage(`Nama tidak valid "${name}". Pakai huruf/angka/_/- (maks 40).`);
      } else {
        try {
          const r = savePreset(name);
          await sendMessage(`💾 Disimpan → preset "${name}"${r.overwritten ? " (nimpa yang lama)" : " (baru)"}.`);
        } catch (e) {
          await sendMessage(`Gagal simpan: ${e.message}`);
        }
      }
      await showSettingsMenu({ messageId: pending.menuMsgId, page: "presets" });
      return;
    }
    const { key, page, menuMsgId } = pending;
    let value;
    if (text.toLowerCase() === "off" || text.toLowerCase() === "null") {
      value = null;
    } else {
      value = Number(text);
      if (!Number.isFinite(value)) {
        await sendMessage(`Invalid value "${text}" — must be a number or "off".`);
        return;
      }
    }
    const result = await executeTool("update_config", { changes: { [key]: value }, reason: "Telegram input field" });
    if (!result?.success) {
      await sendMessage(`Failed to update ${key}.`);
      return;
    }
    await showSettingsMenu({ messageId: menuMsgId, page });
    return;
  }
  if (msg?.isCallback && text.startsWith("cfg:")) {
    try {
      await applySettingsMenuCallback(msg);
    } catch (e) {
      await answerCallbackQuery(msg.callbackQueryId, e.message).catch(() => {});
    }
    return;
  }
  if (text === "/settings" || text === "/menu" || text === "/configmenu") {
    await showSettingsMenu().catch((e) => sendMessage(`Settings error: ${e.message}`).catch(() => {}));
    return;
  }
  if (text === "/guide" || text.startsWith("/guide ")) {
    // Pure file read — answer instantly even while the agent is busy.
    await sendMessage(renderGuide(text.slice(6))).catch(() => {});
    return;
  }
  if (_managementBusy || _screeningBusy || busy) {
    if (_telegramQueue.length < 5) {
      _telegramQueue.push(msg);
      sendMessage(`⏳ Queued (${_telegramQueue.length} in queue): "${text.slice(0, 60)}"`).catch(() => {});
    } else {
      sendMessage("Queue is full (5 messages). Wait for the agent to finish.").catch(() => {});
    }
    return;
  }

  if (text === "/briefing") {
    try {
      const briefing = await generateBriefing();
      await sendAndPinBriefing(briefing);
    } catch (e) {
      await sendMessage(`Error: ${e.message}`).catch(() => {});
    }
    return;
  }

  if (text === "/report" || text.startsWith("/report ")) {
    try {
      await sendHTML(await buildReportForArg(text.slice("/report".length)));
    } catch (e) {
      await sendMessage(`Error: ${e.message}`).catch(() => {});
    }
    return;
  }

  if (text === "/help") {
    await sendMessage(formatHelpText()).catch(() => {});
    return;
  }

  if (text === "/wallet" || text === "/status") {
    try {
      const [wallet, positions, orBalance, orCredits] = await Promise.all([
        getWalletBalances(),
        getMyPositions({ force: true }),
        getOpenRouterBalance(),
        getOpenRouterCredits(),
      ]);
      let msg = formatWalletStatus(wallet, positions);
      if (orCredits?.balance != null) {
        // Actual purchased-credit balance — the number to watch for top-ups.
        msg += `\n💳 OpenRouter saldo: $${orCredits.balance.toFixed(2)}`;
        if (orBalance?.usageDaily != null) msg += ` | hari ini $${orBalance.usageDaily.toFixed(4)}`;
        else if (orBalance?.usageMonthly != null) msg += ` | bln ini $${orBalance.usageMonthly.toFixed(2)}`;
        if (orCredits.balance < 5) msg += `\n⚠️ Saldo OpenRouter menipis — pertimbangkan top up`;
      } else if (orBalance) {
        if (orBalance.remaining != null) {
          msg += `\n💳 OpenRouter: $${orBalance.remaining.toFixed(2)} remaining`;
          if (orBalance.usageMonthly != null) msg += ` | $${orBalance.usageMonthly.toFixed(2)} this month`;
          else if (orBalance.usage != null) msg += ` | $${orBalance.usage.toFixed(4)} total spent`;
        } else if (orBalance.usageDaily != null) {
          msg += `\n💳 OpenRouter: $${orBalance.usageDaily.toFixed(4)} today | $${(orBalance.usageMonthly ?? 0).toFixed(2)} this month`;
        } else if (orBalance.usage != null) {
          msg += `\n💳 OpenRouter: $${orBalance.usage.toFixed(4)} total spent`;
        }
      }
      if (text === "/wallet") {
        // SOL balance growth tracker (calendar 1d/7d/30d) — /wallet only.
        msg += `\n\n${formatSolTracker(wallet.sol)}`;
      }
      if (text === "/status") {
        if (positions.total_positions) msg += `\n\nUse /positions for the numbered list.`;
        const perf = getPerformanceSummary();
        const { lessons } = listLessons({ limit: 10, full: true });
        if (perf) {
          const cur = config.management.solMode ? "◎" : "$";
          const sign = perf.total_pnl_usd >= 0 ? "+" : "-";
          const roiStr = perf.roi_pct != null ? ` (${perf.roi_pct >= 0 ? "+" : ""}${perf.roi_pct}%)` : "";
          msg += `\n\n💰 All-time PnL: ${sign}${cur}${Math.abs(perf.total_pnl_usd)}${roiStr} over ${perf.total_positions_closed} closed`;
          msg += `\n🧠 Learning: ${perf.win_rate_pct}% win | avg PnL ${perf.avg_pnl_pct >= 0 ? "+" : ""}${perf.avg_pnl_pct}%`;
        }
        const lastBad = lessons.filter(l => l.outcome === "bad" || l.outcome === "poor").slice(-1)[0];
        const lastGood = lessons.filter(l => l.outcome === "good").slice(-1)[0];
        if (lastBad) msg += `\n⚠️ ${condenseRule(lastBad.rule)}`;
        if (lastGood) msg += `\n✅ ${condenseRule(lastGood.rule)}`;
      }
      // Realized-PnL & net-of-cost tracker (1d/7d/30d) — both /wallet and /status.
      const pnlBlock = formatPnlTracker(getModePerformance(), { solPriceUsd: wallet?.sol_price ?? null });
      if (pnlBlock) msg += `\n\n${pnlBlock}`;
      await sendMessage(msg).catch(() => {});
    } catch (e) {
      await sendMessage(`Error: ${e.message}`).catch(() => {});
    }
    return;
  }

  if (text === "/config") {
    await sendMessage(formatFullConfig()).catch(() => {});
    return;
  }

  if (text === "/preset" || text.startsWith("/preset ")) {
    const res = runPresetCommand(text.slice("/preset".length));
    await sendMessage(res.text).catch(() => {});
    if (res.applied) await finishPresetApply({ viaTelegram: true });
    return;
  }

  if (text === "/positions") {
    try {
      const { positions, total_positions } = await getMyPositions({ force: true });
      if (total_positions === 0) { await sendMessage("No open positions."); return; }
      const cur = config.management.solMode ? "◎" : "$";
      const lines = positions.map((p, i) => {
        const pnl = p.pnl_usd >= 0 ? `+${cur}${p.pnl_usd}` : `-${cur}${Math.abs(p.pnl_usd)}`;
        const age = p.age_minutes != null ? `${p.age_minutes}m` : "?";
        const oor = !p.in_range ? " ⚠️OOR" : "";
        return `${i + 1}. ${p.pair} | ${cur}${p.total_value_usd} | PnL: ${pnl} | fees: ${cur}${p.unclaimed_fees_usd} | ${age}${oor}`;
      });
      await sendMessage(`📊 Open Positions (${total_positions}):\n\n${lines.join("\n")}\n\n/close <n> to close | /set <n> <note> to set instruction`);
    } catch (e) { await sendMessage(`Error: ${e.message}`).catch(() => {}); }
    return;
  }

  const poolMatch = text.match(/^\/pool\s+(\d+)$/i);
  if (poolMatch) {
    try {
      const idx = parseInt(poolMatch[1]) - 1;
      const { positions } = await getMyPositions({ force: true });
      if (idx < 0 || idx >= positions.length) { await sendMessage("Invalid number. Use /positions first."); return; }
      const pos = positions[idx];
      await sendMessage([
        `${idx + 1}. ${pos.pair}`,
        `Pool: ${pos.pool}`,
        `Position: ${pos.position}`,
        `Range: ${pos.lower_bin} → ${pos.upper_bin} | active ${pos.active_bin}`,
        `PnL: ${pos.pnl_pct ?? "?"}% | fees: ${config.management.solMode ? "◎" : "$"}${pos.unclaimed_fees_usd ?? "?"}`,
        `Value: ${config.management.solMode ? "◎" : "$"}${pos.total_value_usd ?? "?"}`,
        `Age: ${pos.age_minutes ?? "?"}m | ${pos.in_range ? "IN RANGE" : `OOR ${pos.minutes_out_of_range ?? 0}m`}`,
        pos.instruction ? `Note: ${pos.instruction}` : null,
      ].filter(Boolean).join("\n"));
    } catch (e) {
      await sendMessage(`Error: ${e.message}`).catch(() => {});
    }
    return;
  }

  const closeMatch = text.match(/^\/close\s+(\d+)$/i);
  if (closeMatch) {
    try {
      const idx = parseInt(closeMatch[1]) - 1;
      const { positions } = await getMyPositions({ force: true });
      if (idx < 0 || idx >= positions.length) { await sendMessage("Invalid number. Use /positions first."); return; }
      const pos = positions[idx];
      await sendMessage(`Closing ${pos.pair}...`);
      const result = await closePosition({ position_address: pos.position });
      if (result.success) {
        const closeTxs = result.close_txs?.length ? result.close_txs : result.txs;
        const claimNote = result.claim_txs?.length ? `\nClaim txs: ${result.claim_txs.join(", ")}` : "";
        await sendMessage(`✅ Closed ${pos.pair}\nPnL: ${config.management.solMode ? "◎" : "$"}${result.pnl_usd ?? "?"} | close txs: ${closeTxs?.join(", ") || "n/a"}${claimNote}`);
      } else {
        await sendMessage(`❌ Close failed: ${JSON.stringify(result)}`);
      }
    } catch (e) { await sendMessage(`Error: ${e.message}`).catch(() => {}); }
    return;
  }

  if (text === "/closeall") {
    try {
      const { positions } = await getMyPositions({ force: true });
      if (!positions.length) { await sendMessage("No open positions."); return; }
      await sendMessage(`Closing ${positions.length} position(s)...`);
      const results = [];
      for (const pos of positions) {
        try {
          const result = await closePosition({ position_address: pos.position });
          results.push(`${pos.pair}: ${result.success ? "closed" : `failed (${result.error || "unknown"})`}`);
        } catch (error) {
          results.push(`${pos.pair}: failed (${error.message})`);
        }
      }
      await sendMessage(`Close-all finished.\n\n${results.join("\n")}`).catch(() => {});
    } catch (e) {
      await sendMessage(`Error: ${e.message}`).catch(() => {});
    }
    return;
  }

  const setMatch = text.match(/^\/set\s+(\d+)\s+(.+)$/i);
  if (setMatch) {
    try {
      const idx = parseInt(setMatch[1]) - 1;
      const note = setMatch[2].trim();
      const { positions } = await getMyPositions({ force: true });
      if (idx < 0 || idx >= positions.length) { await sendMessage("Invalid number. Use /positions first."); return; }
      const pos = positions[idx];
      setPositionInstruction(pos.position, note);
      await sendMessage(`✅ Note set for ${pos.pair}:\n"${note}"`);
    } catch (e) { await sendMessage(`Error: ${e.message}`).catch(() => {}); }
    return;
  }

  const setCfgMatch = text.match(/^\/setcfg\s+([A-Za-z0-9_]+)\s+(.+)$/i);
  if (setCfgMatch) {
    try {
      const key = setCfgMatch[1];
      const value = parseConfigValue(setCfgMatch[2]);
      const result = await executeTool("update_config", {
        changes: { [key]: value },
        reason: "Telegram slash command /setcfg",
      });
      if (!result?.success) {
        await sendMessage(`Config update failed.\nUnknown: ${(result?.unknown || []).join(", ") || "none"}`).catch(() => {});
        return;
      }
      await sendMessage(`✅ Updated ${key} = ${JSON.stringify(value)}`).catch(() => {});
    } catch (e) {
      await sendMessage(`Error: ${e.message}`).catch(() => {});
    }
    return;
  }

  if (text === "/screen") {
    try {
      await sendMessage(await runDeterministicScreen(5)).catch(() => {});
    } catch (e) {
      await sendMessage(`Error: ${e.message}`).catch(() => {});
    }
    return;
  }

  if (text === "/candidates") {
    await sendMessage(describeLatestCandidates(5)).catch(() => {});
    return;
  }

  const deployMatch = text.match(/^\/deploy\s+(\d+)$/i);
  if (deployMatch) {
    try {
      const idx = parseInt(deployMatch[1]) - 1;
      const { candidate, result, deployAmount, binsBelow } = await deployLatestCandidate(idx);
      const coverage = result.range_coverage
        ? `Range: ${fmtPct(result.range_coverage.downside_pct)} downside | ${fmtPct(result.range_coverage.upside_pct)} upside`
        : `Strategy: ${config.strategy.strategy} | binsBelow: ${binsBelow}`;
      await sendMessage([
        `✅ Deployed ${candidate.name}`,
        `Pool: ${candidate.pool}`,
        `Amount: ${deployAmount} SOL`,
        coverage,
        `Position: ${result.position || "n/a"}`,
        result.txs?.length ? `Tx: ${result.txs[0]}` : null,
      ].filter(Boolean).join("\n")).catch(() => {});
    } catch (e) {
      await sendMessage(`Error: ${e.message}`).catch(() => {});
    }
    return;
  }

  if (text === "/pause") {
    stopCronJobs();
    cronStarted = false;
    await sendMessage("⏸ Paused autonomous cycles. Telegram control still works. Use /resume to start again.").catch(() => {});
    return;
  }

  if (text === "/resume") {
    if (!cronStarted) {
      cronStarted = true;
      timers.managementLastRun = Date.now();
      timers.screeningLastRun = Date.now();
      startCronJobs();
      await sendMessage("▶️ Autonomous cycles resumed.").catch(() => {});
    } else {
      await sendMessage("Autonomous cycles are already running.").catch(() => {});
    }
    return;
  }

  if (text === "/hive" || text === "/hive pull") {
    try {
      const enabled = isHiveMindEnabled();
      const agentId = ensureAgentId();
      if (!enabled) {
        await sendMessage(`HiveMind: disabled\nAgent ID: ${agentId}\nSet hiveMindApiKey to connect.`).catch(() => {});
        return;
      }
      const isManualPull = text === "/hive pull";
      const pullMode = getHiveMindPullMode();
      const [registerResult, lessons, presets] = await Promise.all([
        registerHiveMindAgent({ reason: isManualPull ? "telegram_pull" : "telegram_status" }),
        (pullMode === "auto" || isManualPull) ? pullHiveMindLessons(12) : Promise.resolve(null),
        (pullMode === "auto" || isManualPull) ? pullHiveMindPresets() : Promise.resolve(null),
      ]);
      await sendMessage([
        "HiveMind: enabled",
        `Agent ID: ${agentId}`,
        `URL: ${config.hiveMind.url}`,
        `Pull mode: ${pullMode}`,
        `Register: ${registerResult ? "ok" : "warn"}`,
        `Shared lessons: ${Array.isArray(lessons) ? lessons.length : (pullMode === "manual" ? "manual" : 0)}`,
        `Presets: ${Array.isArray(presets) ? presets.length : (pullMode === "manual" ? "manual" : 0)}`,
        isManualPull ? "Manual pull: completed" : null,
      ].join("\n")).catch(() => {});
    } catch (e) {
      await sendMessage(`HiveMind error: ${e.message}`).catch(() => {});
    }
    return;
  }

  busy = true;
  let liveMessage = null;
  try {
    log("telegram", `Incoming: ${text}`);
    const hasCloseIntent = /\bclose\b|\bsell\b|\bexit\b|\bwithdraw\b|\btutup\b|\bjual\b|\btarik\b|\bcabut\b/i.test(text);
    const isDeployRequest = !hasCloseIntent && /\bdeploy\b|\bopen position\b|\blp into\b|\badd liquidity\b|\bbuka posisi\b|\btambah likuiditas\b/i.test(text);
    const agentRole = isDeployRequest ? "SCREENER" : "GENERAL";
    const agentModel = agentRole === "SCREENER" ? config.llm.screeningModel : config.llm.generalModel;
    liveMessage = await createLiveMessage("🤖 Live Update", `Request: ${text.slice(0, 240)}`);
    const { content } = await agentLoop(text, config.llm.maxSteps, sessionHistory, agentRole, agentModel, null, {
      interactive: true,
      onToolStart: async ({ name }) => { await liveMessage?.toolStart(name); },
      onToolFinish: async ({ name, result, success }) => { await liveMessage?.toolFinish(name, result, success); },
      onConfirmRequired: requestConfirmation,
    });
    appendHistory(text, content);
    if (liveMessage) await liveMessage.finalize(stripThink(content));
    else await sendMessage(stripThink(content));
  } catch (e) {
    if (liveMessage) await liveMessage.fail(e.message).catch(() => {});
    else await sendMessage(`Error: ${e.message}`).catch(() => {});
  } finally {
    busy = false;
    refreshPrompt();
    drainTelegramQueue().catch(() => {});
  }
}

function fmtPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "?";
}


// Register restarter — when update_config changes intervals, running cron jobs get replaced
registerCronRestarter(() => { if (cronStarted) startCronJobs(); });

if (isMain && isTTY) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: buildPrompt(),
  });
  _ttyInterface = rl;

  // Update prompt countdown every 10 seconds
  setInterval(() => {
    if (!busy) {
      rl.setPrompt(buildPrompt());
      rl.prompt(true); // true = preserve current line
    }
  }, 10_000);

  function launchCron() {
    if (!cronStarted) {
      cronStarted = true;
      // Seed timers so countdown starts from now
      timers.managementLastRun = Date.now();
      timers.screeningLastRun = Date.now();
      startCronJobs();
      console.log("Autonomous cycles are now running.\n");
      rl.setPrompt(buildPrompt());
      rl.prompt(true);
    }
  }

  async function runBusy(fn) {
    if (busy) { console.log("Agent is busy, please wait..."); rl.prompt(); return; }
    busy = true; rl.pause();
    try { await fn(); }
    catch (e) { console.error(`Error: ${e.message}`); }
    finally { busy = false; rl.setPrompt(buildPrompt()); rl.resume(); rl.prompt(); }
  }

  // ── Startup: show wallet + top candidates ──
  console.log(`
╔═══════════════════════════════════════════╗
║         DLMM LP Agent — Ready             ║
╚═══════════════════════════════════════════╝
`);

  console.log("Fetching wallet and top pool candidates...\n");

  busy = true;
  try {
    const [wallet, positions, { candidates, total_eligible, total_screened }] = await Promise.all([
      getWalletBalances(),
      getMyPositions({ force: true }),
      getTopCandidates({ limit: 5 }),
    ]);

    setLatestCandidates(candidates);

    console.log(`Wallet:    ${wallet.sol} SOL  ($${wallet.sol_usd})  |  SOL price: $${wallet.sol_price}`);
    console.log(`Positions: ${positions.total_positions} open\n`);

    if (positions.total_positions > 0) {
      console.log("Open positions:");
      for (const p of positions.positions) {
        const status = p.in_range ? "in-range ✓" : "OUT OF RANGE ⚠";
        console.log(`  ${p.pair.padEnd(16)} ${status}  fees: $${p.unclaimed_fees_usd}`);
      }
      console.log();
    }

    console.log(`Top pools (${total_eligible} eligible from ${total_screened} screened):\n`);
    console.log(formatCandidates(candidates));

  } catch (e) {
    console.error(`Startup fetch failed: ${e.message}`);
  } finally {
    busy = false;
  }

  // Always start autonomous cycles on launch
  launchCron();
  maybeRunMissedBriefing().catch(() => { });

  startPolling(telegramHandler);

  console.log(`
Commands:
  1 / 2 / 3 ...  Deploy ${DEPLOY} SOL into that pool
  auto           Let the agent pick and deploy automatically
  /status        Refresh wallet + positions
  /candidates    Refresh top pool list
  /briefing      Show morning briefing (last 24h)
  /report        Trade learning report — /report [week|month|day]
  /guide         Panduan setting (TOC) — /guide <no|katakunci|all>
  /learn         Study top LPers from the best current pool and save lessons
  /learn <addr>  Study top LPers from a specific pool address
  /thresholds    Show current screening thresholds + performance stats
  /evolve        Manually trigger threshold evolution from performance data
  /stop          Shut down
`);

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // ── Number pick: deploy into pool N ─────
    const pick = parseInt(input);
    const latest = getLatestCandidatesMeta().candidates;
    if (!isNaN(pick) && pick >= 1 && pick <= latest.length) {
      await runBusy(async () => {
        const pool = latest[pick - 1];
        console.log(`\nDeploying ${DEPLOY} SOL into ${pool.name}...\n`);
        const { content: reply } = await agentLoop(
          `Deploy ${DEPLOY} SOL into pool ${pool.pool} (${pool.name}). Call get_active_bin first then deploy_position. Report result.`,
          config.llm.maxSteps,
          [],
          "SCREENER"
        );
        console.log(`\n${reply}\n`);
        launchCron();
      });
      return;
    }

    // ── auto: agent picks and deploys ───────
    if (input.toLowerCase() === "auto") {
      await runBusy(async () => {
        console.log("\nAgent is screening for a deploy-worthy candidate...\n");
        const { content: reply } = await agentLoop(
          `get_top_candidates, decide whether any candidate is worth deploying, and only call deploy_position with ${DEPLOY} SOL if conviction is strong. If only one candidate is returned and it lacks narrative or smart-wallet confirmation, skip and report NO DEPLOY. Execute now, don't ask.`,
          config.llm.maxSteps,
          [],
          "SCREENER"
        );
        console.log(`\n${reply}\n`);
        launchCron();
      });
      return;
    }

    // ── go: start cron without deploying ────
    if (input.toLowerCase() === "go") {
      launchCron();
      rl.prompt();
      return;
    }

    // ── Slash commands ───────────────────────
    if (input === "/stop") { await shutdown("user command"); return; }

    if (input === "/status") {
      await runBusy(async () => {
        const [wallet, positions] = await Promise.all([getWalletBalances(), getMyPositions({ force: true })]);
        console.log(`\nWallet: ${wallet.sol} SOL  ($${wallet.sol_usd})`);
        console.log(`Positions: ${positions.total_positions}`);
        for (const p of positions.positions) {
          const status = p.in_range ? "in-range ✓" : "OUT OF RANGE ⚠";
          console.log(`  ${p.pair.padEnd(16)} ${status}  fees: ${config.management.solMode ? "◎" : "$"}${p.unclaimed_fees_usd}`);
        }
        console.log();
        const pnlBlock = formatPnlTracker(getModePerformance(), { solPriceUsd: wallet?.sol_price ?? null });
        if (pnlBlock) console.log(`${pnlBlock}\n`);
      });
      return;
    }

    if (input === "/briefing") {
      await runBusy(async () => {
        const briefing = await generateBriefing();
        console.log(`\n${briefing.replace(/<[^>]*>/g, "")}\n`);
      });
      return;
    }

    if (input === "/report" || input.startsWith("/report ")) {
      await runBusy(async () => {
        const rep = await buildReportForArg(input.slice("/report".length));
        console.log(`\n${rep.replace(/<[^>]*>/g, "")}\n`);
      });
      return;
    }

    if (input === "/guide" || input.startsWith("/guide ")) {
      console.log(`\n${renderGuide(input.slice(6))}\n`);
      rl.prompt();
      return;
    }

    if (input === "/candidates") {
      await runBusy(async () => {
        const { candidates, total_eligible, total_screened } = await getTopCandidates({ limit: 5 });
        setLatestCandidates(candidates);
        console.log(`\nTop pools (${total_eligible} eligible from ${total_screened} screened):\n`);
        console.log(formatCandidates(candidates));
        console.log();
      });
      return;
    }

    if (input === "/thresholds") {
      const s = config.screening;
      console.log("\nCurrent screening thresholds:");
      console.log(`  minFeeActiveTvlRatio: ${s.minFeeActiveTvlRatio}`);
      console.log(`  minOrganic:           ${s.minOrganic}`);
      console.log(`  minHolders:           ${s.minHolders}`);
      console.log(`  minTvl:               ${s.minTvl}`);
      console.log(`  maxTvl:               ${s.maxTvl}`);
      console.log(`  minVolume:            ${s.minVolume}`);
      console.log(`  minTokenFeesSol:      ${s.minTokenFeesSol}`);
      console.log(`  maxBotHoldersPct:     ${s.maxBotHoldersPct}`);
      console.log(`  maxTop10Pct:          ${s.maxTop10Pct}`);
      console.log(`  timeframe:            ${s.timeframe}`);
      const perf = getPerformanceSummary();
      if (perf) {
        console.log(`\n  Based on ${perf.total_positions_closed} closed positions`);
        console.log(`  Win rate: ${perf.win_rate_pct}%  |  Avg PnL: ${perf.avg_pnl_pct}%`);
      } else {
        console.log("\n  No closed positions yet — thresholds are preset defaults.");
      }
      console.log();
      rl.prompt();
      return;
    }

    if (input.startsWith("/learn")) {
      await runBusy(async () => {
        const parts = input.split(" ");
        const poolArg = parts[1] || null;

        let poolsToStudy = [];

        if (poolArg) {
          poolsToStudy = [{ pool: poolArg, name: poolArg }];
        } else {
          // Fetch top 10 candidates across all eligible pools
          console.log("\nFetching top pool candidates to study...\n");
          const { candidates } = await getTopCandidates({ limit: 10 });
          if (!candidates.length) {
            console.log("No eligible pools found to study.\n");
            return;
          }
          poolsToStudy = candidates.map((c) => ({ pool: c.pool, name: c.name }));
        }

        console.log(`\nStudying top LPers across ${poolsToStudy.length} pools...\n`);
        for (const p of poolsToStudy) console.log(`  • ${p.name || p.pool}`);
        console.log();

        const poolList = poolsToStudy
          .map((p, i) => `${i + 1}. ${p.name} (${p.pool})`)
          .join("\n");

        const { content: reply } = await agentLoop(
          `Study top LPers across these ${poolsToStudy.length} pools by calling study_top_lpers for each:

${poolList}

For each pool, call study_top_lpers then move to the next. After studying all pools:
1. Identify patterns that appear across multiple pools (hold time, scalping vs holding, win rates).
2. Note pool-specific patterns where behaviour differs significantly.
3. Derive 4-8 concrete, actionable lessons using add_lesson. Prioritize cross-pool patterns — they're more reliable.
4. Summarize what you learned.

Focus on: hold duration, entry/exit timing, what win rates look like, whether scalpers or holders dominate.`,
          config.llm.maxSteps,
          [],
          "GENERAL"
        );
        console.log(`\n${reply}\n`);
      });
      return;
    }

    if (input === "/evolve") {
      await runBusy(async () => {
        const perf = getPerformanceSummary();
        if (!perf || perf.total_positions_closed < 5) {
          const needed = 5 - (perf?.total_positions_closed || 0);
          console.log(`\nNeed at least 5 closed positions to evolve. ${needed} more needed.\n`);
          return;
        }
        const fs = await import("fs");
        const lessonsData = JSON.parse(fs.default.readFileSync(repoPath("lessons.json"), "utf8"));
        const result = evolveThresholds(lessonsData.performance, config);
        if (!result || Object.keys(result.changes).length === 0) {
          console.log("\nNo threshold changes needed — current settings already match performance data.\n");
        } else {
          reloadScreeningThresholds();
          console.log("\nThresholds evolved:");
          for (const [key, val] of Object.entries(result.changes)) {
            console.log(`  ${key}: ${result.rationale[key]}`);
          }
          console.log("\nSaved to user-config.json. Applied immediately.\n");
        }
      });
      return;
    }

    if (input === "/preset" || input.startsWith("/preset ")) {
      await runBusy(async () => {
        const res = runPresetCommand(input.slice("/preset".length));
        console.log(`\n${res.text}\n`);
        if (res.applied) await finishPresetApply({ viaTelegram: false });
      });
      return;
    }

    // ── Free-form chat ───────────────────────
    await runBusy(async () => {
      log("user", input);
      const { content } = await agentLoop(input, config.llm.maxSteps, sessionHistory, "GENERAL", config.llm.generalModel, null, { interactive: true });
      appendHistory(input, content);
      console.log(`\n${content}\n`);
    });
  });

  rl.on("close", () => shutdown("stdin closed"));

} else if (isMain) {
  // Non-TTY: start immediately
  log("startup", "Non-TTY mode — starting cron cycles immediately.");
  startCronJobs();
  maybeRunMissedBriefing().catch(() => { });
  startPolling(telegramHandler);
  (async () => {
    try {
      await runScreeningCycle({ silent: false });
    } catch (e) {
      log("startup_error", e.message);
    }
  })();
}
