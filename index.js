import "./envcrypt.js";
import cron from "node-cron";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import { agentLoop } from "./agent.js";
import { log } from "./logger.js";
import { getMyPositions, closePosition, getActiveBin, getPositionsRentSol } from "./tools/dlmm.js";
import { getWalletBalances, getSolMarketRegime } from "./tools/wallet.js";
import { getTopCandidates, formatYieldToMe } from "./tools/screening.js";
import { confirmIndicatorPreset } from "./tools/chart-indicators.js";
import { formatGmgnCandidateForPrompt } from "./tools/gmgn.js";
import { config, reloadScreeningThresholds, computeDeployAmount, persistConfigChange } from "./config.js";
import { getGasStats } from "./gas-tracker.js";
import { evolveThresholds, getPerformanceSummary, getModePerformance, listLessons, classifySession, currentWibSession, getLifetimePerformance, getPerformanceForRacikan, listRacikanInPerformance } from "./lessons.js";
import { buildTradeReport, computeCostDragPct } from "./reports.js";
import { getLlmCostStats } from "./llm-cost-tracker.js";
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
  escapeHtml as escapeHtmlSafe,
} from "./telegram.js";
import { generateBriefing, generatePeriodicBriefing } from "./briefing.js";
import { renderGuide } from "./guide.js";
import { getLastBriefingDate, setLastBriefingDate, getLastBriefingPinId, setLastBriefingPinId, getLastReportedMilestone, setLastReportedMilestone, getLastPeriodicBriefing, setLastPeriodicBriefing, getTrackedPosition, getTrackedPositions, setPositionInstruction, updatePnlAndCheckExits, queuePeakConfirmation, resolvePendingPeak, queueTrailingDropConfirmation, resolvePendingTrailingDrop } from "./state.js";
import { getActiveStrategy } from "./strategy-library.js";
import { listPresets, savePreset, applyPreset, getPresetDiff, deletePreset, validName, presetExists, getActiveSetupStatus, formatIdentity } from "./preset-manager.js";
import { ORIGIN_SECTIONS, ORIGIN_NOTES, SUB_CLUSTER_META, KEY_SUBCLUSTER, L4_CHILDREN, CORE_GROUPS } from "./config-origin.js";
import { recordPositionSnapshot, recallForPool, addPoolNote } from "./pool-memory.js";
import { isPaperMode } from "./paper-trading.js";
import { recordCandidateSnapshots, getCandidateMomentum, formatCandidateMomentum, recordSmartWalletCounts, getSmartWalletMomentum, formatSmartWalletMomentum } from "./candidate-memory.js";
import { checkSmartWalletsOnPool } from "./smart-wallets.js";
import { getTokenNarrative, getTokenInfo } from "./tools/token.js";
import { stageSignals } from "./signal-tracker.js";
import { getWeightsSummary } from "./signal-weights.js";
import { bootstrapHiveMind, ensureAgentId, getHiveMindPullMode, isHiveMindEnabled, pullHiveMindLessons, pullHiveMindPresets, registerHiveMindAgent, startHiveMindBackgroundSync } from "./hivemind.js";
import { appendDecision } from "./decision-log.js";
import { formatSolTracker, setTrackStart, getTrackStart } from "./sol-tracker.js";
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
 * Annualized cost-drag % for the quant block: recent (gas+LLM) burn scaled to a
 * year, over the liquid wallet capital. Uses the 30d window (falls back to the
 * gas estimate when no real data). Returns null on any gap. Display only.
 */
async function computeReportCostDrag() {
  try {
    const since = Date.now() - 30 * 86400000;
    const wallet = await getWalletBalances().catch(() => null);
    const modalUsd = wallet?.total_usd || wallet?.sol_usd || null;
    if (!modalUsd) return null;
    const solPrice = wallet?.sol_price || 0;
    const gasStats = getGasStats(since);
    const gasSol = gasStats.hasData ? gasStats.sol : 0;
    const gasUsd = gasSol && solPrice ? gasSol * solPrice : 0;
    const llm = getLlmCostStats(since);
    const llmUsd = llm.hasData ? llm.totalCost : 0;
    const costUsd = gasUsd + llmUsd;
    if (costUsd <= 0) return null;
    return computeCostDragPct({ costUsd, windowDays: 30, modalUsd });
  } catch { return null; }
}

/**
 * On-demand /report — tiered:
 *   /report                → ACTIVE racikan (getModePerformance, racikan-isolated)
 *   /report all|lifetime   → LIFETIME (every live record + pre-baseline archive)
 *   /report setups         → list racikan present in the log
 *   /report <racikan-name> → that specific racikan
 *   /report week|month|day → windowed periodic digest (activity + cost)
 * Async: fetches cost/wallet for the windowed digest + the cost-drag quant line.
 */
async function buildReportForArg(arg = "") {
  const a = String(arg).trim().toLowerCase();
  if (["week", "weekly", "7d", "minggu", "mingguan"].includes(a)) return generatePeriodicBriefing("week");
  if (["month", "monthly", "30d", "bulan", "bulanan"].includes(a)) return generatePeriodicBriefing("month");
  if (["day", "today", "24h", "hari", "harian"].includes(a)) return generatePeriodicBriefing("day");
  const trendN = config.reports?.learningReportTrendN ?? 10;
  const costDragPct = await computeReportCostDrag();
  const quant = costDragPct != null ? { costDragPct } : {};

  // List racikan present in the log.
  if (["setups", "setup", "racikan", "racikans", "list"].includes(a)) {
    const rows = listRacikanInPerformance();
    if (!rows.length) return "🗂️ Belum ada racikan ber-nama di log performa (semua trade null / pra-baseline).";
    const lines = rows.map((r, i) => `${i + 1}. <b>${escapeHtmlSafe(r.name)}</b> — ${r.count} trade${r.name === config.activeSetup ? " ✅ aktif" : ""}`);
    return `🗂️ <b>Racikan di log performa</b>\nPakai <code>/report &lt;nama&gt;</code> buat blok stats penuh per racikan.\n────────────────\n${lines.join("\n")}`;
  }

  // LIFETIME tier — every live record + pre-baseline archive (mixed settings).
  if (["all", "lifetime", "semua", "seumur", "everything"].includes(a)) {
    const lifePerf = getLifetimePerformance();
    const rep = buildTradeReport(lifePerf, {
      title: "🎓 Trade Report — LIFETIME",
      subtitle: "⚠️ lifetime — termasuk pra-baseline (arsip), setting CAMPUR; bukan satu racikan",
      statsLabel: "Lifetime",
      trendN,
      identity: formatIdentity(),
      quant,
    });
    const tracker = formatPnlTracker(lifePerf);
    return tracker ? `${rep}\n\n${tracker}` : rep;
  }

  // Specific racikan tier.
  if (a) {
    const recsPerf = getPerformanceForRacikan(a);
    if (!recsPerf.length) {
      const known = listRacikanInPerformance().map((r) => r.name);
      const hint = known.length ? ` Tersedia: ${known.join(", ")}.` : "";
      return `🗂️ Racikan "<b>${escapeHtmlSafe(a)}</b>" tak punya trade tercatat.${hint}\nCoba <code>/report setups</code>, <code>/report all</code>, atau <code>/report</code> (racikan aktif).`;
    }
    const rep = buildTradeReport(recsPerf, {
      title: `🎓 Trade Report — racikan ${a}`,
      subtitle: a === (config.activeSetup || "").toLowerCase() ? "racikan AKTIF" : "racikan spesifik (non-aktif)",
      statsLabel: `Racikan ${a}`,
      trendN,
      identity: formatIdentity(),
      quant,
    });
    const tracker = formatPnlTracker(recsPerf);
    return tracker ? `${rep}\n\n${tracker}` : rep;
  }

  // Default tier — ACTIVE racikan (already racikan-isolated by getModePerformance).
  const modePerf = getModePerformance();
  const rep = buildTradeReport(modePerf, {
    title: "🎓 Trade Report — racikan aktif",
    subtitle: config.activeSetup ? `racikan: ${config.activeSetup} · pakai /report all buat lifetime` : "pakai /report all buat lifetime (incl. arsip)",
    statsLabel: "Racikan aktif",
    trendN,
    identity: formatIdentity(),
    quant,
  });
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
    // strategyLock != default → the lock value IS the strategy (enforced in executor);
    // default → flexible, config.strategy.strategy is the fallback default.
    const stratLock = config.strategy.strategyLock ?? "default";
    const deployStrategy = stratLock !== "default" ? stratLock : config.strategy.strategy;
    const strategyBlock = `DEPLOY STRATEGY: ${deployStrategy} ${stratLock !== "default" ? "(LOCKED by strategyLock — enforced, do not deviate)" : "(default from config — may deviate per pool if clearly justified)"} | bins_above: 0 (FIXED — never change) | deposit: SOL only (amount_y, amount_x=0)`
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

  // Lightweight PnL poller — updates trailing TP state between management cycles, no LLM.
  // Runs on public infra (RPC + Jupiter + Meteora deposits) so it can poll aggressively.
  const pnlPollMs = Math.max(1, Number(config.pnl.pollIntervalSec ?? 3)) * 1000;
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
  }, pnlPollMs);

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
    // Couldn't-price-this-tick flag (e.g. Jupiter outage) — never act on PnL rules.
    if (position.pnl_pct_suspicious) return true;
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
let _settingsView = "main"; // last-rendered /settings page token (e.g. "main" | "dev" | "zen-gmgn~2"), so edits re-render the SAME state

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

// Compact age label from minutes: <60 → "Xm", else "Y.yh".
function fmtAgeMin(m) {
  if (m == null || !Number.isFinite(m)) return "?";
  return m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`;
}

/**
 * RENDER-ONLY range-efficiency lines for /pool, derived from live position data
 * (lower/upper/active bin, in_range, age, current OOR spell) + the tracked record
 * (bin_step). Shows the bin range + width, where active sits within it (a bar +
 * distance to each edge), the live in/OOR state, and a live in-range estimate.
 * NOTE: minutes_out_of_range is the CURRENT OOR spell only (state resets it on
 * re-entry), so the live in-range % is labelled an approximation (see
 * notes/routput-progress.md RECON range-tracking).
 */
function buildRangeEfficiencyLines(pos, tracked) {
  const out = [];
  const lo = pos.lower_bin, hi = pos.upper_bin, act = pos.active_bin;
  const binStep = tracked?.bin_step ?? null;
  if (Number.isFinite(lo) && Number.isFinite(hi)) {
    const width = hi - lo + 1;
    const stepStr = binStep != null ? ` · bin_step ${binStep}` : "";
    out.push(`Range bins: ${lo} → ${hi} (${width} bins${stepStr})`);
    if (Number.isFinite(act)) {
      // Position of active bin within the range (0% = lower edge, 100% = upper).
      const span = hi - lo;
      const posPct = span > 0 ? Math.max(0, Math.min(100, ((act - lo) / span) * 100)) : (act >= hi ? 100 : 0);
      const filled = Math.round((posPct / 100) * 20);
      const bar = "█".repeat(Math.max(0, Math.min(20, filled))) + "░".repeat(Math.max(0, 20 - filled));
      out.push(`Active bin ${act}: [${bar}] ${posPct.toFixed(0)}% (${act - lo} dari bawah / ${hi - act} ke atas)`);
    }
  } else {
    out.push(`Range bins: ${lo ?? "?"} → ${hi ?? "?"} | active ${act ?? "?"}`);
  }
  // Live state (exact) + a live in-range estimate from age & current OOR spell.
  const state = pos.in_range ? "✅ IN RANGE" : `⚠️ OOR ${pos.minutes_out_of_range ?? 0}m`;
  out.push(`State: ${state}`);
  const age = pos.age_minutes, oor = pos.minutes_out_of_range ?? 0;
  if (Number.isFinite(age) && age > 0) {
    const inRangePct = Math.max(0, Math.min(100, ((age - oor) / age) * 100));
    out.push(`In-range (approx): ~${inRangePct.toFixed(0)}% · in ~${fmtAgeMin(Math.max(0, age - oor))} / OOR-spell ${fmtAgeMin(oor)}`);
  }
  return out;
}

function formatWalletStatus(wallet, positions, rent = null) {
  const deployAmount = computeDeployAmount(wallet.sol);
  const hive = isHiveMindEnabled() ? "on" : "off";
  const gasReserve = config.management?.gasReserve ?? 0;
  const lines = [
    `Wallet: ${wallet.sol} SOL ($${wallet.sol_usd})`,
    `SOL price: $${wallet.sol_price}`,
    `Open positions: ${positions.total_positions}/${config.risk.maxPositions}`,
    `Next deploy amount: ${deployAmount} SOL`,
  ];
  // Held rent (refundable on close) + the SOL that's actually free to deploy.
  const held = rent?.totalRentSol ?? 0;
  if (held > 0) {
    lines.push(`🔒 Tertahan (rent ${positions.total_positions} posisi): ~${held.toFixed(3)} SOL${rent?.estimated ? " (sebagian est)" : ""} — refund saat close`);
  }
  const free = wallet.sol - held - gasReserve;
  lines.push(`🟢 SOL bebas efektif: ~${free.toFixed(3)} SOL  (wallet − ${held > 0 ? "tertahan − " : ""}gasReserve ${gasReserve})`);
  lines.push(
    `Dry run: ${process.env.DRY_RUN === "true" ? "yes" : "no"}`,
    `HiveMind: ${hive}`,
  );
  return lines.join("\n");
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

// Full runtime config, grouped to match SETTINGS-GUIDE.md (GRUP 1–15) + GMGN.
// /config shows the complete surface; long output is auto-split by sendMessage.
// 🧬 Profil + 🗂️ Racikan identity — canonical formatter lives in preset-manager
// (formatIdentity); thin wrapper here keeps the existing call sites fail-safe.
function formatIdentityLines() {
  try { return formatIdentity(); } catch { return "🧬 Profil: —\n🗂️ Racikan: —"; }
}

// RENDER-ONLY. Grouped by ORIGIN ("⚙️ Origin Dev" vs "🧩 Add by zen") per
// config-origin.js (derived from notes/divergence-map.md). This function still
// owns every live value + its formatting; config-origin.js owns only WHERE each
// row lands. rowMap keys must match the keys listed in ORIGIN_SECTIONS — any
// computed row not placed by the layout falls into a visible "review" bucket, so
// no key is ever silently dropped (old key count == new key count).
// Builds the rowMap (unique key → [displayLabel, valueString]) shared by the
// full /config and /config core views. RENDER-ONLY: owns every live value + its
// formatting; config-origin.js owns WHERE each row lands. Boolean settings
// render as 🟢 on / ⚪ off (number settings stay plain).
function buildConfigRowMap() {
  const c = config;
  const fmt = (v) => {
    if (v === null || v === undefined) return "off";
    if (typeof v === "boolean") return v ? "🟢 on" : "⚪ off";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
    return String(v);
  };
  const secret = (v) => (v && String(v).length ? "(set)" : "(unset)");
  const ir = c.gmgn.indicatorRules || {};

  // rowMap: unique key → [displayLabel, valueString]. GMGN screening rows are
  // namespaced "gmgn." so they don't collide with their screening twins; their
  // visible label stays the short form (interval, minTvl, …) as before.
  const rowMap = {
    // ── Screening (dev) ──
    timeframe: ["timeframe", fmt(c.screening.timeframe)],
    category: ["category", fmt(c.screening.category)],
    minTvl: ["minTvl", fmt(c.screening.minTvl)],
    maxTvl: ["maxTvl", fmt(c.screening.maxTvl)],
    minVolume: ["minVolume", fmt(c.screening.minVolume)],
    minFeeActiveTvlRatio: ["minFeeActiveTvlRatio", fmt(c.screening.minFeeActiveTvlRatio)],
    minTokenFeesSol: ["minTokenFeesSol", fmt(c.screening.minTokenFeesSol)],
    minOrganic: ["minOrganic", fmt(c.screening.minOrganic)],
    minQuoteOrganic: ["minQuoteOrganic", fmt(c.screening.minQuoteOrganic)],
    minMcap: ["minMcap", fmt(c.screening.minMcap)],
    maxMcap: ["maxMcap", fmt(c.screening.maxMcap)],
    minHolders: ["minHolders", fmt(c.screening.minHolders)],
    minTokenAgeHours: ["minTokenAgeHours", fmt(c.screening.minTokenAgeHours)],
    maxTokenAgeHours: ["maxTokenAgeHours", fmt(c.screening.maxTokenAgeHours)],
    minBinStep: ["minBinStep", fmt(c.screening.minBinStep)],
    maxBinStep: ["maxBinStep", fmt(c.screening.maxBinStep)],
    excludeHighSupplyConcentration: ["excludeHighSupplyConcentration", fmt(c.screening.excludeHighSupplyConcentration)],
    maxBotHoldersPct: ["maxBotHoldersPct", fmt(c.screening.maxBotHoldersPct)],
    maxTop10Pct: ["maxTop10Pct", fmt(c.screening.maxTop10Pct)],
    avoidPvpSymbols: ["avoidPvpSymbols", fmt(c.screening.avoidPvpSymbols)],
    blockPvpSymbols: ["blockPvpSymbols", fmt(c.screening.blockPvpSymbols)],
    allowedLaunchpads: ["allowedLaunchpads", fmt(c.screening.allowedLaunchpads)],
    blockedLaunchpads: ["blockedLaunchpads", fmt(c.screening.blockedLaunchpads)],
    useDiscordSignals: ["useDiscordSignals", fmt(c.screening.useDiscordSignals)],
    discordSignalMode: ["discordSignalMode", fmt(c.screening.discordSignalMode)],

    // ── Management & Risk (dev) ──
    dryRun: ["dryRun", fmt(String(process.env.DRY_RUN || "").toLowerCase() === "true")],
    maxPositions: ["maxPositions", fmt(c.risk.maxPositions)],
    maxDeployAmount: ["maxDeployAmount", fmt(c.risk.maxDeployAmount)],
    deployAmountSol: ["deployAmountSol", fmt(c.management.deployAmountSol)],
    positionSizePct: ["positionSizePct", fmt(c.management.positionSizePct)],
    minSolToOpen: ["minSolToOpen", fmt(c.management.minSolToOpen)],
    gasReserve: ["gasReserve", `${fmt(c.management.gasReserve)}${c.management.gasReserveAutoTune ? " (auto-tune ON)" : " (manual)"}`],
    stopLossPct: ["stopLossPct", fmt(c.management.stopLossPct)],
    takeProfitPct: ["takeProfitPct", fmt(c.management.takeProfitPct)],
    trailingTakeProfit: ["trailingTakeProfit", fmt(c.management.trailingTakeProfit)],
    trailingTriggerPct: ["trailingTriggerPct", fmt(c.management.trailingTriggerPct)],
    trailingDropPct: ["trailingDropPct", fmt(c.management.trailingDropPct)],
    outOfRangeBinsToClose: ["outOfRangeBinsToClose", fmt(c.management.outOfRangeBinsToClose)],
    outOfRangeWaitMinutes: ["outOfRangeWaitMinutes", fmt(c.management.outOfRangeWaitMinutes)],
    oorCooldownTriggerCount: ["oorCooldownTriggerCount", fmt(c.management.oorCooldownTriggerCount)],
    oorCooldownHours: ["oorCooldownHours", fmt(c.management.oorCooldownHours)],
    minFeePerTvl24h: ["minFeePerTvl24h", fmt(c.management.minFeePerTvl24h)],
    minAgeBeforeYieldCheck: ["minAgeBeforeYieldCheck", fmt(c.management.minAgeBeforeYieldCheck)],
    minVolumeToRebalance: ["minVolumeToRebalance", fmt(c.management.minVolumeToRebalance)],
    minClaimAmount: ["minClaimAmount", fmt(c.management.minClaimAmount)],
    autoSwapAfterClaim: ["autoSwapAfterClaim", fmt(c.management.autoSwapAfterClaim)],
    repeatDeployCooldownEnabled: ["repeatDeployCooldownEnabled", fmt(c.management.repeatDeployCooldownEnabled)],
    repeatDeployCooldownTriggerCount: ["repeatDeployCooldownTriggerCount", fmt(c.management.repeatDeployCooldownTriggerCount)],
    repeatDeployCooldownHours: ["repeatDeployCooldownHours", fmt(c.management.repeatDeployCooldownHours)],
    repeatDeployCooldownScope: ["repeatDeployCooldownScope", fmt(c.management.repeatDeployCooldownScope)],
    repeatDeployCooldownMinFeeEarnedPct: ["repeatDeployCooldownMinFeeEarnedPct", fmt(c.management.repeatDeployCooldownMinFeeEarnedPct)],
    solMode: ["solMode", fmt(c.management.solMode)],

    // ── Strategy & Bins (dev) ──
    strategy: ["strategy", fmt(c.strategy.strategy)],
    minBinsBelow: ["minBinsBelow", fmt(c.strategy.minBinsBelow)],
    maxBinsBelow: ["maxBinsBelow", fmt(c.strategy.maxBinsBelow)],
    defaultBinsBelow: ["defaultBinsBelow", fmt(c.strategy.defaultBinsBelow)],

    // ── Schedule (dev) ──
    managementIntervalMin: ["managementIntervalMin", fmt(c.schedule.managementIntervalMin)],
    screeningIntervalMin: ["screeningIntervalMin", fmt(c.schedule.screeningIntervalMin)],
    healthCheckIntervalMin: ["healthCheckIntervalMin", fmt(c.schedule.healthCheckIntervalMin)],

    // ── LLM (dev) ──
    managementModel: ["managementModel", fmt(c.llm.managementModel)],
    screeningModel: ["screeningModel", fmt(c.llm.screeningModel)],
    generalModel: ["generalModel", fmt(c.llm.generalModel)],
    temperature: ["temperature", fmt(c.llm.temperature)],
    maxTokens: ["maxTokens", fmt(c.llm.maxTokens)],
    maxSteps: ["maxSteps", fmt(c.llm.maxSteps)],

    // ── Darwin (dev) ──
    darwinEnabled: ["darwinEnabled", fmt(c.darwin.enabled)],
    darwinWindowDays: ["darwinWindowDays", fmt(c.darwin.windowDays)],
    darwinRecalcEvery: ["darwinRecalcEvery", fmt(c.darwin.recalcEvery)],
    darwinBoost: ["darwinBoost", fmt(c.darwin.boostFactor)],
    darwinDecay: ["darwinDecay", fmt(c.darwin.decayFactor)],
    darwinFloor: ["darwinFloor", fmt(c.darwin.weightFloor)],
    darwinCeiling: ["darwinCeiling", fmt(c.darwin.weightCeiling)],
    darwinMinSamples: ["darwinMinSamples", fmt(c.darwin.minSamples)],

    // ── Indicators (dev) ──
    enabled: ["enabled", fmt(c.indicators.enabled)],
    entryPreset: ["entryPreset", fmt(c.indicators.entryPreset)],
    exitPreset: ["exitPreset", `${fmt(c.indicators.exitPreset)}${c.indicators.exitEnabled ? "" : " (gerbang exit ⚪ off — preset ini belum aktif)"}`],
    rsiLength: ["rsiLength", fmt(c.indicators.rsiLength)],
    intervals: ["intervals", fmt(c.indicators.intervals)],
    candles: ["candles", fmt(c.indicators.candles)],
    rsiOversold: ["rsiOversold", fmt(c.indicators.rsiOversold)],
    rsiOverbought: ["rsiOverbought", fmt(c.indicators.rsiOverbought)],
    requireAllIntervals: ["requireAllIntervals", fmt(c.indicators.requireAllIntervals)],

    // ── Infra/Meridian (dev) ──
    lpAgentRelayEnabled: ["lpAgentRelayEnabled", fmt(c.api.lpAgentRelayEnabled)],
    agentId: ["agentId", fmt(c.hiveMind.agentId)],
    publicApiKey: ["publicApiKey", secret(c.api.publicApiKey)],
    pnlSource: ["pnlSource", fmt(c.pnl.source)],
    pnlRpcUrl: ["pnlRpcUrl", fmt(c.pnl.rpcUrl)],
    pnlPollIntervalSec: ["pnlPollIntervalSec", fmt(c.pnl.pollIntervalSec)],
    pnlDepositCacheTtlSec: ["pnlDepositCacheTtlSec", fmt(c.pnl.depositCacheTtlSec)],
    pnlSanityMaxDiffPct: ["pnlSanityMaxDiffPct", fmt(c.management.pnlSanityMaxDiffPct)],
    gmgnFeeSource: ["gmgnFeeSource", fmt(c.gmgn.feeSource)],
    hiveMindStatus: ["status", isHiveMindEnabled() ? "enabled" : "disabled"],
    hiveMindPullMode: ["hiveMindPullMode", fmt(c.hiveMind.pullMode)],
    hiveMindUrl: ["hiveMindUrl", fmt(c.hiveMind.url)],

    // ── Screening+ (zen) ──
    screeningSource: ["screeningSource", fmt(c.screening.source)],
    screeningCategories: ["screeningCategories", fmt(c.screening.categories)],

    // ── Screening-GMGN (zen) ──
    "gmgn.interval": ["interval", fmt(c.gmgn.interval)],
    "gmgn.orderBy": ["orderBy", fmt(c.gmgn.orderBy)],
    "gmgn.direction": ["direction", fmt(c.gmgn.direction)],
    "gmgn.platforms": ["platforms", fmt(c.gmgn.platforms)],
    "gmgn.filters": ["filters", fmt(c.gmgn.filters)],
    "gmgn.minMcap": ["minMcap", fmt(c.gmgn.minMcap)],
    "gmgn.maxMcap": ["maxMcap", fmt(c.gmgn.maxMcap)],
    "gmgn.minTvl": ["minTvl", fmt(c.gmgn.minTvl)],
    "gmgn.minVolume": ["minVolume", fmt(c.gmgn.minVolume)],
    "gmgn.minHolders": ["minHolders", fmt(c.gmgn.minHolders)],
    "gmgn.minTokenAgeHours": ["minTokenAgeHours", fmt(c.gmgn.minTokenAgeHours)],
    "gmgn.maxTokenAgeHours": ["maxTokenAgeHours", fmt(c.gmgn.maxTokenAgeHours)],
    "gmgn.athFilterPct": ["athFilterPct", fmt(c.gmgn.athFilterPct)],
    "gmgn.minTotalFeeSol": ["minTotalFeeSol", fmt(c.gmgn.minTotalFeeSol)],
    "gmgn.requireKol": ["requireKol", fmt(c.gmgn.requireKol)],
    "gmgn.minKolCount": ["minKolCount", fmt(c.gmgn.minKolCount)],
    "gmgn.minSmartDegenCount": ["minSmartDegenCount", fmt(c.gmgn.minSmartDegenCount)],
    "gmgn.maxRugRatio": ["maxRugRatio", fmt(c.gmgn.maxRugRatio)],
    "gmgn.maxBundlerRate": ["maxBundlerRate", fmt(c.gmgn.maxBundlerRate)],
    "gmgn.maxRatTraderRate": ["maxRatTraderRate", fmt(c.gmgn.maxRatTraderRate)],
    "gmgn.maxFreshWalletRate": ["maxFreshWalletRate", fmt(c.gmgn.maxFreshWalletRate)],
    "gmgn.maxDevTeamHoldRate": ["maxDevTeamHoldRate", fmt(c.gmgn.maxDevTeamHoldRate)],
    "gmgn.maxBotDegenRate": ["maxBotDegenRate", fmt(c.gmgn.maxBotDegenRate)],
    "gmgn.maxSniperCount": ["maxSniperCount", fmt(c.gmgn.maxSniperCount)],
    "gmgn.maxSniperHoldRate": ["maxSniperHoldRate", fmt(c.gmgn.maxSniperHoldRate)],
    "gmgn.preferredKolNames": ["preferredKolNames", fmt(c.gmgn.preferredKolNames)],
    "gmgn.preferredKolMinHoldPct": ["preferredKolMinHoldPct", fmt(c.gmgn.preferredKolMinHoldPct)],
    "gmgn.dumpKolNames": ["dumpKolNames", fmt(c.gmgn.dumpKolNames)],
    "gmgn.dumpKolMinHoldPct": ["dumpKolMinHoldPct", fmt(c.gmgn.dumpKolMinHoldPct)],
    "gmgn.indicatorFilter": ["indicatorFilter", fmt(c.gmgn.indicatorFilter)],
    "gmgn.indicatorInterval": ["indicatorInterval", fmt(c.gmgn.indicatorInterval)],
    "gmgn.rules.requireBullishSupertrend": ["rules.requireBullishSupertrend", fmt(ir.requireBullishSupertrend)],
    "gmgn.rules.rejectAlreadyAtBottom": ["rules.rejectAlreadyAtBottom", fmt(ir.rejectAlreadyAtBottom)],
    "gmgn.rules.requireAboveSupertrend": ["rules.requireAboveSupertrend", fmt(ir.requireAboveSupertrend)],
    "gmgn.rules.minRsi": ["rules.minRsi", fmt(ir.minRsi)],
    "gmgn.rules.maxRsi": ["rules.maxRsi", fmt(ir.maxRsi)],
    "gmgn.rules.requireBbPosition": ["rules.requireBbPosition", fmt(ir.requireBbPosition)],

    // ── Management+ (zen) ──
    gasReserveAutoTune: ["gasReserveAutoTune", fmt(c.management.gasReserveAutoTune)],
    gasReserveBufferDays: ["gasReserveBufferDays", fmt(c.management.gasReserveBufferDays)],
    gasReserveFloorSol: ["gasReserveFloorSol", fmt(c.management.gasReserveFloorSol)],

    // ── Strategy+ (zen) ──
    strategyLock: ["strategyLock", fmt(c.strategy.strategyLock ?? "default")],

    // ── Schedule+ (zen) ──
    adaptiveScreening: ["adaptiveScreening", fmt(c.schedule.adaptiveScreening)],
    maxScreeningIntervalMin: ["maxScreeningIntervalMin", fmt(c.schedule.maxScreeningIntervalMin)],

    // ── LLM+ (zen) ──
    generalMaxTokens: ["generalMaxTokens", fmt(c.llm.generalMaxTokens)],

    // ── Indicators+ (zen) ──
    exitEnabled: ["exitEnabled", fmt(c.indicators.exitEnabled)],
    rejectAlreadyAtBottom: ["rejectAlreadyAtBottom", fmt(c.indicators.rejectAlreadyAtBottom)],
    smiPdLookback: ["smiPdLookback", fmt(c.indicators.smiPdLookback)],
    smiPaLookback: ["smiPaLookback", fmt(c.indicators.smiPaLookback)],
    smiCrossWindow: ["smiCrossWindow", fmt(c.indicators.smiCrossWindow)],

    // ── Reports (zen) ──
    learningReportEvery: ["learningReportEvery", `${fmt(c.reports?.learningReportEvery)}${c.reports?.learningReportEvery > 0 ? " 🟢 (ON)" : " ⚪ (OFF)"}`],
    learningReportTrendN: ["learningReportTrendN", fmt(c.reports?.learningReportTrendN)],

    // ── Learning/Evolve (zen) ──
    evolveEnabled: ["evolveEnabled", `${fmt(c.learning?.evolveEnabled)}${c.learning?.evolveEnabled === false ? " (auto-evolve BEKU — threshold manual)" : " (auto-evolve aktif)"}`],

    // ── 🧪 Experiments (zen) ──
    exitLiquidityCheck: ["exitLiquidityCheck", fmt(c.experiments?.exitLiquidityCheck)],
    exitLiquidityMaxSlippagePct: ["exitLiquidityMaxSlippagePct", fmt(c.experiments?.exitLiquidityMaxSlippagePct)],
    marketRegimeGate: ["marketRegimeGate", fmt(c.experiments?.marketRegimeGate)],
    marketRegimeMaxDrop24hPct: ["marketRegimeMaxDrop24hPct", fmt(c.experiments?.marketRegimeMaxDrop24hPct)],
    candidateMomentum: ["candidateMomentum", fmt(c.experiments?.candidateMomentum)],
    narrativeProfileSignal: ["narrativeProfileSignal", fmt(c.experiments?.narrativeProfileSignal)],
    expectedYieldSignal: ["expectedYieldSignal", fmt(c.experiments?.expectedYieldSignal)],
    convictionSizing: ["convictionSizing", fmt(c.experiments?.convictionSizing)],
    convictionSizingMaxAdjustPct: ["convictionSizingMaxAdjustPct", fmt(c.experiments?.convictionSizingMaxAdjustPct)],
    counterfactualReview: ["counterfactualReview", fmt(c.experiments?.counterfactualReview)],
    counterfactualMinMcapGainPct: ["counterfactualMinMcapGainPct", fmt(c.experiments?.counterfactualMinMcapGainPct)],
    smartWalletMomentum: ["smartWalletMomentum", fmt(c.experiments?.smartWalletMomentum)],
    idleScreeningCooldown: ["idleScreeningCooldown", fmt(c.experiments?.idleScreeningCooldown)],
    idleScreeningCooldownMin: ["idleScreeningCooldownMin", fmt(c.experiments?.idleScreeningCooldownMin)],
    paperTrading: ["paperTrading", `${fmt(c.experiments?.paperTrading)}${c.experiments?.paperTrading ? " (DRY-RUN sim)" : ""}`],
    usePaperHistoryWhenLive: ["usePaperHistoryWhenLive", `${fmt(c.experiments?.usePaperHistoryWhenLive)}${c.experiments?.usePaperHistoryWhenLive ? " (live: paper=soft ref)" : ""}`],
  };

  return rowMap;
}

// Render one subgroup's rows: bucket keys by sub-cluster (first-seen order), emit
// an L3 header per cluster when the subgroup spans >1, and indent the L4 children
// (beranak anak) under their induk. SHARED by /config (formatFullConfig) and the
// /settings group pages so both group identical keys the same way — single source
// of truth for the sub-cluster layout. Returns the text + the keys it placed (the
// caller uses `placed` for /config's orphan safety net).
function renderSubclusterRows(keys, rowMap) {
  const note = (k) => (ORIGIN_NOTES[k] ? ` ${ORIGIN_NOTES[k]}` : "");
  const dash = "┈┈┈┈┈┈┈┈┈┈";
  const order = [];
  const members = {};
  for (const k of keys) {
    if (!rowMap[k]) continue;
    const cl = KEY_SUBCLUSTER[k] || "_misc";
    if (!members[cl]) { members[cl] = []; order.push(cl); }
    members[cl].push(k);
  }
  const showL3 = order.length > 1;
  const out = [];
  const placed = [];
  for (const cl of order) {
    const meta = SUB_CLUSTER_META[cl];
    if (showL3 && meta) {
      out.push(`  ${meta.emoji} ${meta.label}`);
      out.push(`  ${dash}`);
    }
    for (const k of members[cl]) {
      placed.push(k);
      const [label, value] = rowMap[k];
      const indent = L4_CHILDREN.has(k) ? "      ↳ " : "    ";
      out.push(`${indent}${label}: ${value}${note(k)}`);
    }
  }
  return { text: out.join("\n"), placed };
}

// Dynamic per-subgroup description (GMGN block flips with screeningSource).
function subgroupDesc(sg) {
  if (sg.id !== "zen-gmgn") return sg.desc;
  return String(config.screening.source).toLowerCase() === "gmgn"
    ? "Pipeline screening GMGN AKTIF (source=gmgn)."
    : `Pipeline screening GMGN tidak aktif (source=${config.screening.source}, blok ini diabaikan).`;
}

// RENDER-ONLY 4-layer /config: L1 origin section (⚙️ Origin Dev / 🧩 Add by zen)
// → L2 grup (▸) → L3 sub-cluster (emoji + ┈ line, shown when a grup has >1
// cluster) → L4 mini-grup (the four beranak families indent their anak under the
// induk via ↳). Layout/placement lives in config-origin.js; this owns no values.
export function formatFullConfig() {
  const rowMap = buildConfigRowMap();
  const placed = new Set();

  const sectionBlocks = ORIGIN_SECTIONS.map((sec) => {
    const subBlocks = sec.subgroups.map((sg) => {
      // Racikan/Identitas sub-group renders the identity banner, not key rows.
      if (sg.identity) {
        const body = formatIdentityLines().split("\n").map((l) => `    ${l}`).join("\n");
        return `▸ ${sg.title} · ${sg.desc}\n${body}`;
      }
      const { text, placed: pl } = renderSubclusterRows(sg.keys, rowMap);
      pl.forEach((k) => placed.add(k));
      return `▸ ${sg.title} · ${subgroupDesc(sg)}\n${text}`;
    });
    const bar = "━━━━━━━━━━━━━━━━━━━━━━";
    return `${bar}\n${sec.title} — ${sec.blurb}\n${bar}\n\n${subBlocks.join("\n\n")}`;
  });

  // Safety net: any computed row the layout did not place is surfaced (never
  // dropped) so old key count == new key count even if a key is mis-listed.
  const orphans = Object.keys(rowMap).filter((k) => !placed.has(k));
  if (orphans.length) {
    const rows = orphans.map((k) => { const [label, value] = rowMap[k]; return `    ${label}: ${value}`; });
    sectionBlocks.push(`▸ ❓ Belum terpetakan (auto — cek config-origin.js)\n${rows.join("\n")}`);
  }

  const intro = "⚙️ Config lengkap — per ASAL (⚙️ Origin Dev vs 🧩 Add by zen)\nLegenda: 🟢 on · ⚪ off · ↳ anak setelan · ringkas → /config core";
  const outro = "Ubah lewat /settings (menu tombol) atau chat biasa. Detail tiap setting: ketik /guide";
  return `${intro}\n\n${sectionBlocks.join("\n\n\n")}\n\n${outro}`;
}

// /config core — compact view: only the core-tagged keys (full key names), 2 per
// line joined with " · ", grouped, plus the active racikan banner. Registered as
// an explicit sub-command so it never falls through to the casual-chat LLM.
export function formatCoreConfig() {
  const rowMap = buildConfigRowMap();
  const blocks = CORE_GROUPS.map((g) => {
    const items = g.keys.filter(([k]) => rowMap[k]).map(([k, name]) => `${name}: ${rowMap[k][1]}`);
    const lines = [];
    for (let i = 0; i < items.length; i += 2) lines.push("  " + items.slice(i, i + 2).join("  ·  "));
    return `${g.emoji} ${g.title}\n${lines.join("\n")}`;
  });
  let racikan;
  try { racikan = formatIdentityLines(); } catch { racikan = "🧬 Profil: —\n🗂️ Racikan: —"; }
  const head = "⚙️ Config inti (core) · 🟢 on · ⚪ off";
  const tail = "(ketik /config buat lihat semua)";
  return `${head}\n\n${racikan}\n\n${blocks.join("\n\n")}\n\n${tail}`;
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
    gmgnFeeSource: config.gmgn.feeSource,
    pnlSource: config.pnl.source,
    pnlRpcUrl: config.pnl.rpcUrl,
    pnlPollIntervalSec: config.pnl.pollIntervalSec,
    pnlDepositCacheTtlSec: config.pnl.depositCacheTtlSec,
    strategy: config.strategy.strategy,
    strategyLock: config.strategy.strategyLock,
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
    // 🧬 Learning / Auto-Evolve freeze
    evolveEnabled: config.learning.evolveEnabled,
    // 📊 GRUP 17 — Reports & Gas
    learningReportEvery: config.reports.learningReportEvery,
    learningReportTrendN: config.reports.learningReportTrendN,
    gasReserveAutoTune: config.management.gasReserveAutoTune,
    gasReserveBufferDays: config.management.gasReserveBufferDays,
    gasReserveFloorSol: config.management.gasReserveFloorSol,
    // ── menu-editable additions (cascade /settings: cover remaining CONFIG_MAP keys) ──
    // screening
    minTvl: config.screening.minTvl,
    maxTvl: config.screening.maxTvl,
    minVolume: config.screening.minVolume,
    minFeeActiveTvlRatio: config.screening.minFeeActiveTvlRatio,
    minTokenFeesSol: config.screening.minTokenFeesSol,
    minOrganic: config.screening.minOrganic,
    minQuoteOrganic: config.screening.minQuoteOrganic,
    minMcap: config.screening.minMcap,
    maxMcap: config.screening.maxMcap,
    minHolders: config.screening.minHolders,
    minTokenAgeHours: config.screening.minTokenAgeHours,
    maxTokenAgeHours: config.screening.maxTokenAgeHours,
    minBinStep: config.screening.minBinStep,
    maxBinStep: config.screening.maxBinStep,
    maxBotHoldersPct: config.screening.maxBotHoldersPct,
    maxTop10Pct: config.screening.maxTop10Pct,
    excludeHighSupplyConcentration: config.screening.excludeHighSupplyConcentration,
    avoidPvpSymbols: config.screening.avoidPvpSymbols,
    timeframe: config.screening.timeframe,
    category: config.screening.category,
    discordSignalMode: config.screening.discordSignalMode,
    // management
    minSolToOpen: config.management.minSolToOpen,
    positionSizePct: config.management.positionSizePct,
    outOfRangeBinsToClose: config.management.outOfRangeBinsToClose,
    outOfRangeWaitMinutes: config.management.outOfRangeWaitMinutes,
    oorCooldownTriggerCount: config.management.oorCooldownTriggerCount,
    oorCooldownHours: config.management.oorCooldownHours,
    minFeePerTvl24h: config.management.minFeePerTvl24h,
    minAgeBeforeYieldCheck: config.management.minAgeBeforeYieldCheck,
    minVolumeToRebalance: config.management.minVolumeToRebalance,
    minClaimAmount: config.management.minClaimAmount,
    autoSwapAfterClaim: config.management.autoSwapAfterClaim,
    repeatDeployCooldownScope: config.management.repeatDeployCooldownScope,
    pnlSanityMaxDiffPct: config.management.pnlSanityMaxDiffPct,
    // strategy / schedule
    defaultBinsBelow: config.strategy.defaultBinsBelow,
    healthCheckIntervalMin: config.schedule.healthCheckIntervalMin,
    // llm
    temperature: config.llm.temperature,
    maxTokens: config.llm.maxTokens,
    maxSteps: config.llm.maxSteps,
    generalMaxTokens: config.llm.generalMaxTokens,
    // indicators
    indicatorCandles: config.indicators.candles,
    rsiOversold: config.indicators.rsiOversold,
    rsiOverbought: config.indicators.rsiOverbought,
    // infra
    hiveMindPullMode: config.hiveMind.pullMode,
    // gmgn
    gmgnMinMcap: config.gmgn.minMcap,
    gmgnMaxMcap: config.gmgn.maxMcap,
    gmgnAthFilterPct: config.gmgn.athFilterPct,
    gmgnMinSmartDegenCount: config.gmgn.minSmartDegenCount,
    gmgnMaxRatTraderRate: config.gmgn.maxRatTraderRate,
    gmgnMaxFreshWalletRate: config.gmgn.maxFreshWalletRate,
    gmgnMaxDevTeamHoldRate: config.gmgn.maxDevTeamHoldRate,
    gmgnMaxBotDegenRate: config.gmgn.maxBotDegenRate,
    gmgnMaxSniperCount: config.gmgn.maxSniperCount,
    gmgnMaxSniperHoldRate: config.gmgn.maxSniperHoldRate,
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

// One-line human summary of a trade action for the confirmation prompt. Pure/defensive:
// any odd arg shape still produces a readable line (never throws).
function summarizeTradeAction(toolName, args = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const shortAddr = (a) => (typeof a === "string" && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : (a ?? "?"));
  if (toolName === "deploy_position") {
    const amt = num(args.amount_y) ?? num(args.amount_sol) ?? num(args.amount_x);
    const strat = args.strategy ? ` | ${args.strategy}` : "";
    return `🚀 BUKA POSISI (deploy)\n  pool: ${shortAddr(args.pool_address)}\n  ◎ ${amt ?? "?"} SOL${strat}`;
  }
  if (toolName === "close_position") {
    return `🔻 TUTUP POSISI (close)\n  position: ${shortAddr(args.position_address)}${args.reason ? `\n  reason: ${args.reason}` : ""}`;
  }
  if (toolName === "claim_fees") {
    return `💰 CLAIM FEES\n  position: ${shortAddr(args.position_address)}`;
  }
  if (toolName === "swap_token") {
    return `🔁 SWAP TOKEN\n  ${num(args.amount) ?? "?"} ${shortAddr(args.input_mint)} → ${shortAddr(args.output_mint)}`;
  }
  return `${toolName}\n  ${JSON.stringify(args).slice(0, 200)}`;
}

// Confirm a real-capital / live-position action (deploy/close/claim/swap) in the interactive
// path. Unlike update_config there is no diff to compute and no "no-op" to skip — the action
// itself is what needs the operator's yes/no, so we ALWAYS prompt. Shares the single-flight
// slot, 30s timeout, and confirm:yes/no callback with the config-confirmation path.
async function requestActionConfirmation(toolName, args) {
  const summary = summarizeTradeAction(toolName, args);
  const signature = `${toolName}:${JSON.stringify(args ?? {})}`;

  // Single-flight: collapse identical duplicate calls onto the same pending prompt; deny a
  // different action while one is already pending (mirrors the config path).
  if (_pendingConfirmation) {
    return _pendingConfirmation.signature === signature ? _pendingConfirmation.promise : false;
  }

  let resolveFn;
  const promise = new Promise((resolve) => { resolveFn = resolve; });
  const pending = { promise, resolve: resolveFn, timer: null, messageId: null, signature };
  _pendingConfirmation = pending; // claim the slot before awaiting the Telegram send

  pending.timer = setTimeout(async () => {
    if (_pendingConfirmation === pending) _pendingConfirmation = null;
    if (pending.messageId) await editMessage("⏰ Expired — no action taken.", pending.messageId).catch(() => {});
    resolveFn(false);
  }, 30_000);

  const sent = await sendMessageWithButtons(`⚠️ Konfirmasi aksi ini?\n${summary}`, [
    [
      { text: "✅ Ya", callback_data: "confirm:yes" },
      { text: "❌ Batal", callback_data: "confirm:no" },
    ],
  ]);
  pending.messageId = sent?.result?.message_id ?? null;

  return promise;
}

async function requestConfirmation(toolName, args) {
  // Trade-action tools (move real capital / live positions) take a plain action prompt — the
  // config-diff machinery below only applies to update_config (where there's a before→after
  // value to show and a no-op to skip).
  if (toolName !== "update_config") return requestActionConfirmation(toolName, args);

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
  const KNOWN_SECTIONS = new Set(["screening", "management", "risk", "schedule", "llm", "strategy", "hiveMind", "api", "gmgn", "indicators", "chartIndicators", "experiments", "reports", "tokens", "darwin", "learning"]);
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
  if (typeof value === "boolean") return value ? "🟢 on" : "⚪ off";
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

// ── Cascade /settings (breadcrumb) display data ──────────────────────────────
// Short T1 section labels + T2 group names so all three levels (header → group →
// settings) fit on screen at once. RENDER-ONLY metadata; the canonical grouping
// stays in config-origin.js. Falls back to the full title when a short is missing.
const MENU_SECTION_LABEL = { dev: "⚙️ Origin Dev", zen: "🧩 Add by Zen" };
const MENU_GROUP_SHORT = {
  "dev-screening": "Screen", "dev-management": "Risk", "dev-strategy": "Strat",
  "dev-schedule": "Jadwal", "dev-llm": "LLM", "dev-darwin": "Darwin",
  "dev-indicators": "Indik", "dev-infra": "Infra",
  "zen-screening": "Screen+", "zen-gmgn": "GMGN", "zen-management": "Mgmt+",
  "zen-strategy": "Strat+", "zen-schedule": "Jadwal+", "zen-llm": "LLM+",
  "zen-indicators": "Indik+", "zen-reports": "Report", "zen-learning": "🧬Learn",
  "zen-experiments": "🧪Exp", "zen-racikan": "Racikan",
};
// Max editable T3 rows per page; groups with more paginate (T1+T2 stay visible).
const MAX_T3_ROWS = 8;
const chunkRows = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// Build a MENU_CONTROLS "cycle" entry for a small, KNOWN enum: a noop showing the
// current value + one `cfg:set` button per option (reuses the existing set
// mechanic + callback_data — no new edit mechanic). `opts` are the literal valid
// config values; perRow controls wrapping.
function cycleControl(settingKey, label, opts, perRow = 3) {
  return {
    pageKeys: [settingKey],
    build: () => {
      const cur = fmtSettingValue(settingValue(settingKey));
      const rows = [[settingButton(`${label}: ${cur}`, "cfg:noop")]];
      for (let i = 0; i < opts.length; i += perRow) {
        rows.push(opts.slice(i, i + perRow).map((o) => settingButton(String(o), `cfg:set:${settingKey}:${o}`)));
      }
      return rows;
    },
  };
}

// Which settings page a given key lives on — used to return to the right page after
// a toggle/step/set/input. Single source of truth (was duplicated in two callbacks).
// ── /settings editable controls (config-origin key → existing menu control) ──
// RENDER-ONLY placement registry. Maps each config-origin row key to the control
// the /settings menu ALREADY exposes for it (same settingValue key + same
// callback_data → identical edit mechanics/confirmation). config-origin keys
// absent here are read-only in the menu (shown in the group body, no button) —
// exactly as today. Editability is NOT changed; only WHERE a control renders.
//   toggle: [settingKey, label]
//   input:  [settingKey, label, opts?]
//   build:  () => rows[]      (multi-option set / category — preserves the exact
//                              callback_data the menu used before)
//   pageKeys: settingValue keys whose callback should return to this group page
//             (defaults to the toggle/input key; set/build list them explicitly)
const MENU_CONTROLS = {
  // ⚙️ dev-screening
  timeframe: cycleControl("timeframe", "Timeframe", ["5m", "30m", "1h", "2h", "4h", "12h", "24h"], 4),
  category: cycleControl("category", "Category", ["trending", "top", "new"]),
  minTvl: { input: ["minTvl", "Min TVL"] },
  maxTvl: { input: ["maxTvl", "Max TVL"] },
  minVolume: { input: ["minVolume", "Min volume"] },
  minMcap: { input: ["minMcap", "Min mcap"] },
  maxMcap: { input: ["maxMcap", "Max mcap"] },
  minHolders: { input: ["minHolders", "Min holders"] },
  minFeeActiveTvlRatio: { input: ["minFeeActiveTvlRatio", "Min fee/aTVL", { digits: 3 }] },
  minTokenFeesSol: { input: ["minTokenFeesSol", "Min token fees SOL"] },
  minOrganic: { input: ["minOrganic", "Min organic"] },
  minQuoteOrganic: { input: ["minQuoteOrganic", "Min quote organic"] },
  minTokenAgeHours: { input: ["minTokenAgeHours", "Min age (h)"] },
  maxTokenAgeHours: { input: ["maxTokenAgeHours", "Max age (h)"] },
  minBinStep: { input: ["minBinStep", "Min bin-step"] },
  maxBinStep: { input: ["maxBinStep", "Max bin-step"] },
  excludeHighSupplyConcentration: { toggle: ["excludeHighSupplyConcentration", "Excl. high supply conc."] },
  maxBotHoldersPct: { input: ["maxBotHoldersPct", "Max bot holders %"] },
  maxTop10Pct: { input: ["maxTop10Pct", "Max top10 %"] },
  avoidPvpSymbols: { toggle: ["avoidPvpSymbols", "Avoid PVP symbols"] },
  blockPvpSymbols: { toggle: ["blockPvpSymbols", "PVP hard block"] },
  useDiscordSignals: { toggle: ["useDiscordSignals", "Discord signals"] },
  discordSignalMode: cycleControl("discordSignalMode", "Discord mode", ["merge", "only"]),
  // ⚙️ dev-management
  solMode: { toggle: ["solMode", "SOL mode"] },
  maxPositions: { input: ["maxPositions", "Max positions"] },
  maxDeployAmount: { input: ["maxDeployAmount", "Max SOL"] },
  deployAmountSol: { input: ["deployAmountSol", "Deploy SOL", { digits: 2 }] },
  positionSizePct: { input: ["positionSizePct", "Position size %", { digits: 2 }] },
  minSolToOpen: { input: ["minSolToOpen", "Min SOL to open", { digits: 2 }] },
  gasReserve: { input: ["gasReserve", "Gas reserve", { digits: 2 }] },
  stopLossPct: { input: ["stopLossPct", "SL %"] },
  takeProfitPct: { input: ["takeProfitPct", "TP %"] },
  trailingTakeProfit: { toggle: ["trailingTakeProfit", "Trailing TP"] },
  trailingTriggerPct: { input: ["trailingTriggerPct", "Trail trigger", { digits: 1 }] },
  trailingDropPct: { input: ["trailingDropPct", "Trail drop", { digits: 1 }] },
  outOfRangeBinsToClose: { input: ["outOfRangeBinsToClose", "OOR bins to close"] },
  outOfRangeWaitMinutes: { input: ["outOfRangeWaitMinutes", "OOR wait (min)"] },
  oorCooldownTriggerCount: { input: ["oorCooldownTriggerCount", "OOR cooldown count"] },
  oorCooldownHours: { input: ["oorCooldownHours", "OOR cooldown hrs"] },
  repeatDeployCooldownEnabled: { toggle: ["repeatDeployCooldownEnabled", "Repeat cooldown"] },
  repeatDeployCooldownTriggerCount: { input: ["repeatDeployCooldownTriggerCount", "Repeat count"] },
  repeatDeployCooldownHours: { input: ["repeatDeployCooldownHours", "Repeat hrs"] },
  repeatDeployCooldownScope: cycleControl("repeatDeployCooldownScope", "Repeat scope", ["pool", "token", "both"]),
  repeatDeployCooldownMinFeeEarnedPct: { input: ["repeatDeployCooldownMinFeeEarnedPct", "Min fee earned %", { digits: 1 }] },
  minFeePerTvl24h: { input: ["minFeePerTvl24h", "Min fee/TVL 24h"] },
  minAgeBeforeYieldCheck: { input: ["minAgeBeforeYieldCheck", "Min age before yield (min)"] },
  minVolumeToRebalance: { input: ["minVolumeToRebalance", "Min vol to rebalance"] },
  minClaimAmount: { input: ["minClaimAmount", "Min claim amount"] },
  autoSwapAfterClaim: { toggle: ["autoSwapAfterClaim", "Auto-swap after claim"] },
  // ⚙️ dev-strategy
  strategy: {
    pageKeys: ["strategy"],
    build: () => [[
      settingButton("spot", "cfg:set:strategy:spot"),
      settingButton("bid_ask", "cfg:set:strategy:bid_ask"),
    ]],
  },
  minBinsBelow: { input: ["minBinsBelow", "Min bins"] },
  maxBinsBelow: { input: ["maxBinsBelow", "Max bins"] },
  defaultBinsBelow: { input: ["defaultBinsBelow", "Default bins"] },
  // ⚙️ dev-schedule
  managementIntervalMin: { input: ["managementIntervalMin", "Manage interval (min)"] },
  screeningIntervalMin: { input: ["screeningIntervalMin", "Screen interval — floor (min)"] },
  healthCheckIntervalMin: { input: ["healthCheckIntervalMin", "Health-check (min)"] },
  // ⚙️ dev-llm — models are free-form strings (provider/slug); the menu's input
  // field is numeric-only, so models stay 👁 (edit via /setcfg). Numeric params here.
  temperature: { input: ["temperature", "Temperature", { digits: 3 }] },
  maxTokens: { input: ["maxTokens", "Max tokens"] },
  maxSteps: { input: ["maxSteps", "Max steps"] },
  // ⚙️ dev-indicators
  enabled: { toggle: ["chartIndicatorsEnabled", "Chart indicators"] },
  entryPreset: {
    pageKeys: ["indicatorEntryPreset"],
    build: () => [
      [
        settingButton("Entry: ST", "cfg:set:indicatorEntryPreset:supertrend_break"),
        settingButton("Entry: RSI", "cfg:set:indicatorEntryPreset:rsi_reversal"),
        settingButton("Entry: ST/RSI", "cfg:set:indicatorEntryPreset:supertrend_or_rsi"),
      ],
      [settingButton("Entry: ST+SMI", "cfg:set:indicatorEntryPreset:supertrend_plus_smi")],
    ],
  },
  exitPreset: {
    pageKeys: ["indicatorExitPreset"],
    build: () => [[
      settingButton("Exit: ST", "cfg:set:indicatorExitPreset:supertrend_break"),
      settingButton("Exit: RSI", "cfg:set:indicatorExitPreset:rsi_reversal"),
      settingButton("Exit: BB+RSI", "cfg:set:indicatorExitPreset:bb_plus_rsi"),
    ]],
  },
  rsiLength: { input: ["rsiLength", "RSI length"] },
  rsiOversold: { input: ["rsiOversold", "RSI oversold"] },
  rsiOverbought: { input: ["rsiOverbought", "RSI overbought"] },
  candles: { input: ["indicatorCandles", "Candles"] },
  intervals: {
    pageKeys: ["indicatorIntervals"],
    build: () => [[
      settingButton("TF: 5m", "cfg:set:indicatorIntervals:5_MINUTE"),
      settingButton("TF: 15m", "cfg:set:indicatorIntervals:15_MINUTE"),
      settingButton("TF: both", "cfg:set:indicatorIntervals:both"),
    ]],
  },
  requireAllIntervals: { toggle: ["requireAllIntervals", "Require all TF"] },
  // ⚙️ dev-infra
  lpAgentRelayEnabled: { toggle: ["lpAgentRelayEnabled", "LPAgent relay"] },
  hiveMindPullMode: cycleControl("hiveMindPullMode", "Hive pull mode", ["auto", "manual"]),
  pnlDepositCacheTtlSec: { input: ["pnlDepositCacheTtlSec", "PnL deposit cache (s)"] },
  pnlSanityMaxDiffPct: { input: ["pnlSanityMaxDiffPct", "PnL sanity max diff %"] },
  pnlSource: {
    pageKeys: ["pnlSource"],
    build: () => [[
      settingButton(`PnL src: ${fmtSettingValue(settingValue("pnlSource"))}`, "cfg:noop"),
      settingButton("rpc", "cfg:set:pnlSource:rpc"),
      settingButton("meteora", "cfg:set:pnlSource:meteora"),
    ]],
  },
  pnlPollIntervalSec: { input: ["pnlPollIntervalSec", "PnL poll (sec)"] },
  gmgnFeeSource: {
    pageKeys: ["gmgnFeeSource"],
    build: () => [[
      settingButton(`Fee src: ${fmtSettingValue(settingValue("gmgnFeeSource"))}`, "cfg:noop"),
      settingButton("gmgn", "cfg:set:gmgnFeeSource:gmgn"),
      settingButton("jupiter", "cfg:set:gmgnFeeSource:jupiter"),
    ]],
  },
  // 🧩 zen-screening
  screeningSource: {
    pageKeys: ["screeningSource"],
    build: () => [[
      settingButton("Source: Meteora", "cfg:set:screeningSource:meteora"),
      settingButton("Source: GMGN", "cfg:set:screeningSource:gmgn"),
    ]],
  },
  screeningCategories: {
    pageKeys: ["screeningCategories"],
    build: () => [[categoryButton("trending"), categoryButton("top"), categoryButton("new")]],
  },
  // 🧩 zen-gmgn
  "gmgn.interval": {
    pageKeys: ["gmgnInterval"],
    build: () => [[
      settingButton("5m", "cfg:set:gmgnInterval:5m"),
      settingButton("1h", "cfg:set:gmgnInterval:1h"),
      settingButton("6h", "cfg:set:gmgnInterval:6h"),
      settingButton("24h", "cfg:set:gmgnInterval:24h"),
    ]],
  },
  "gmgn.minMcap": { input: ["gmgnMinMcap", "Min mcap"] },
  "gmgn.maxMcap": { input: ["gmgnMaxMcap", "Max mcap"] },
  "gmgn.minVolume": { input: ["gmgnMinVolume", "Min volume"] },
  "gmgn.minHolders": { input: ["gmgnMinHolders", "Min holders"] },
  "gmgn.minTokenAgeHours": { input: ["gmgnMinTokenAgeHours", "Min token age (h)"] },
  "gmgn.maxTokenAgeHours": { input: ["gmgnMaxTokenAgeHours", "Max token age (h)"] },
  "gmgn.athFilterPct": { input: ["gmgnAthFilterPct", "ATH filter %"] },
  "gmgn.minTotalFeeSol": { input: ["gmgnMinTotalFeeSol", "Min fee SOL"] },
  "gmgn.requireKol": { toggle: ["gmgnRequireKol", "Require KOL"] },
  "gmgn.minKolCount": { input: ["gmgnMinKolCount", "Min KOL"] },
  "gmgn.minSmartDegenCount": { input: ["gmgnMinSmartDegenCount", "Min smart degen"] },
  "gmgn.maxBundlerRate": { input: ["gmgnMaxBundlerRate", "Max bundler %", { digits: 2 }] },
  "gmgn.maxRatTraderRate": { input: ["gmgnMaxRatTraderRate", "Max rat trader", { digits: 2 }] },
  "gmgn.maxFreshWalletRate": { input: ["gmgnMaxFreshWalletRate", "Max fresh wallet", { digits: 2 }] },
  "gmgn.maxDevTeamHoldRate": { input: ["gmgnMaxDevTeamHoldRate", "Max dev hold", { digits: 2 }] },
  "gmgn.maxBotDegenRate": { input: ["gmgnMaxBotDegenRate", "Max bot degen", { digits: 2 }] },
  "gmgn.maxSniperCount": { input: ["gmgnMaxSniperCount", "Max sniper count"] },
  "gmgn.maxSniperHoldRate": { input: ["gmgnMaxSniperHoldRate", "Max sniper hold", { digits: 2 }] },
  "gmgn.preferredKolNames": { input: ["gmgnPreferredKolNames", "Preferred KOL (comma-sep)"] },
  "gmgn.preferredKolMinHoldPct": { input: ["gmgnPreferredKolMinHoldPct", "Preferred KOL min hold %"] },
  "gmgn.dumpKolNames": { input: ["gmgnDumpKolNames", "Dump KOL (comma-sep)"] },
  "gmgn.dumpKolMinHoldPct": { input: ["gmgnDumpKolMinHoldPct", "Dump KOL min hold %"] },
  "gmgn.indicatorFilter": { toggle: ["gmgnIndicatorFilter", "Indicator filter"] },
  "gmgn.indicatorInterval": {
    pageKeys: ["gmgnIndicatorInterval"],
    build: () => [[
      settingButton("TF: 5m", "cfg:set:gmgnIndicatorInterval:5_MINUTE"),
      settingButton("TF: 15m", "cfg:set:gmgnIndicatorInterval:15_MINUTE"),
      settingButton("TF: 1h", "cfg:set:gmgnIndicatorInterval:1h"),
    ]],
  },
  "gmgn.rules.requireBullishSupertrend": { toggle: ["gmgnRequireBullishSt", "Bullish ST"] },
  "gmgn.rules.rejectAlreadyAtBottom": { toggle: ["gmgnRejectAtBottom", "Reject at bottom"] },
  "gmgn.rules.requireAboveSupertrend": { toggle: ["gmgnRequireAboveSt", "Above ST"] },
  "gmgn.rules.minRsi": { input: ["gmgnMinRsi", "Min RSI"] },
  "gmgn.rules.maxRsi": { input: ["gmgnMaxRsi", "Max RSI"] },
  // 🧩 zen-management
  gasReserveAutoTune: { toggle: ["gasReserveAutoTune", "Gas reserve auto-tune"] },
  gasReserveBufferDays: { input: ["gasReserveBufferDays", "Gas buffer days"] },
  gasReserveFloorSol: { input: ["gasReserveFloorSol", "Gas reserve floor SOL", { digits: 2 }] },
  // 🧩 zen-strategy
  strategyLock: {
    pageKeys: ["strategyLock"],
    build: () => [
      [settingButton(`🔒 lock: ${fmtSettingValue(settingValue("strategyLock") ?? "default")}`, "cfg:noop")],
      [
        settingButton("default", "cfg:set:strategyLock:default"),
        settingButton("lock spot", "cfg:set:strategyLock:spot"),
        settingButton("lock bid_ask", "cfg:set:strategyLock:bid_ask"),
      ],
    ],
  },
  // 🧩 zen-schedule
  adaptiveScreening: { toggle: ["adaptiveScreening", "Adaptive screening"] },
  maxScreeningIntervalMin: { input: ["maxScreeningIntervalMin", "Screen interval — ceil (min)"] },
  // 🧩 zen-llm
  generalMaxTokens: { input: ["generalMaxTokens", "General max tokens"] },
  // 🧩 zen-indicators
  exitEnabled: { toggle: ["indicatorExitEnabled", "Exit triggers close"] },
  rejectAlreadyAtBottom: { toggle: ["indicatorRejectAtBottom", "Reject @ bottom"] },
  smiPdLookback: { input: ["smiPdLookback", "SMI PD lookback"] },
  smiPaLookback: { input: ["smiPaLookback", "SMI PA lookback"] },
  smiCrossWindow: { input: ["smiCrossWindow", "SMI cross window"] },
  // 🧩 zen-reports
  learningReportEvery: { input: ["learningReportEvery", "Learning report every N (0=off)"] },
  learningReportTrendN: { input: ["learningReportTrendN", "Trend window N"] },
  // 🧬 zen-learning
  evolveEnabled: { toggle: ["evolveEnabled", "Auto-evolve threshold (off=FREEZE)"] },
  // 🧪 zen-experiments
  candidateMomentum: { toggle: ["candidateMomentum", "Candidate momentum"] },
  smartWalletMomentum: { toggle: ["smartWalletMomentum", "Smart-wallet mom."] },
  expectedYieldSignal: { toggle: ["expectedYieldSignal", "Expected yield"] },
  narrativeProfileSignal: { toggle: ["narrativeProfileSignal", "Narrative profile"] },
  counterfactualReview: { toggle: ["counterfactualReview", "Counterfactual review"] },
  counterfactualMinMcapGainPct: { input: ["counterfactualMinMcapGainPct", "Counterfactual min mcap gain %"] },
  exitLiquidityCheck: { toggle: ["exitLiquidityCheck", "Exit-liquidity GATE"] },
  exitLiquidityMaxSlippagePct: { input: ["exitLiquidityMaxSlippagePct", "Exit max slippage %", { digits: 1 }] },
  marketRegimeGate: { toggle: ["marketRegimeGate", "Market-regime GATE"] },
  marketRegimeMaxDrop24hPct: { input: ["marketRegimeMaxDrop24hPct", "Regime max SOL drop 24h %", { digits: 1 }] },
  convictionSizing: { toggle: ["convictionSizing", "Conviction sizing (moves capital)"] },
  convictionSizingMaxAdjustPct: { input: ["convictionSizingMaxAdjustPct", "Conviction max adjust %"] },
  idleScreeningCooldown: { toggle: ["idleScreeningCooldown", "Idle screening cooldown"] },
  idleScreeningCooldownMin: { input: ["idleScreeningCooldownMin", "Idle cooldown minutes"] },
  paperTrading: { toggle: ["paperTrading", "Paper trading (DRY-RUN sim)"] },
  usePaperHistoryWhenLive: { toggle: ["usePaperHistoryWhenLive", "Use paper history when live"] },
};

// settingValue key (the callback's parts[2]) → group page id, so a toggle/step/
// set/input returns to the group it lives on. Derived from MENU_CONTROLS +
// config-origin so it can never drift from the layout.
const MENU_KEY_TO_PAGE = (() => {
  const m = {};
  for (const sec of ORIGIN_SECTIONS) {
    for (const sg of sec.subgroups) {
      for (const k of sg.keys) {
        const ctrl = MENU_CONTROLS[k];
        if (!ctrl) continue;
        const keys = ctrl.pageKeys || (ctrl.toggle ? [ctrl.toggle[0]] : ctrl.input ? [ctrl.input[0]] : []);
        for (const sk of keys) m[sk] = sg.id;
      }
    }
  }
  return m;
})();

// Which group page a given settingValue key belongs to (return-to-page after an
// edit, and the page stored for a pending text input). Falls back to the
// management group for any unmapped key.
function pageForKey(key) {
  return MENU_KEY_TO_PAGE[key] || "dev-management";
}

// Page token to re-render after editing `key`: the key's group, preserving the
// current T3 page suffix when we're already viewing that group (so an edit on
// GMGN page 2 re-renders page 2, not page 1).
function returnTokenForKey(key) {
  const gid = pageForKey(key);
  const [curBase, curPage] = String(_settingsView).split("~");
  return curBase === gid && curPage ? `${gid}~${curPage}` : gid;
}

// ── /settings navigation (selaras /config: ASAL seksi → grup → sub-cluster) ──
// L1 main = two ASAL section buttons; L2 = relevance groups (same names as
// /config); L3 group page = read-only /config body + the editable controls for
// that group, bucketed under the same sub-clusters. RENDER-ONLY: every control
// is the SAME one MENU_CONTROLS already wired (unchanged callback_data/mechanics).

function findSubgroup(groupId) {
  for (const sec of ORIGIN_SECTIONS) {
    const sg = sec.subgroups.find((g) => g.id === groupId);
    if (sg) return { sec, sg };
  }
  return null;
}

// How many keys in a subgroup are editable from the menu (section-list hint).
function editableCountFor(sg) {
  return sg.keys.filter((k) => MENU_CONTROLS[k]).length;
}

// TINGKAT 1 — header rows, ALWAYS shown. The two ASAL sections + Racikan + Config
// penuh + Refresh/Close. The active section (and Racikan on the presets page) is
// marked with ▸. `token` is the current page token so Refresh re-renders it.
function settingsHeaderRows(activeSection, token) {
  const secRow = ORIGIN_SECTIONS.map((sec) => {
    const lbl = MENU_SECTION_LABEL[sec.id] || sec.title;
    return settingButton(`${sec.id === activeSection ? "▸ " : ""}${lbl}`, `cfg:page:${sec.id}`);
  });
  const racikanActive = String(token).split("~")[0] === "presets";
  return [
    secRow,
    [
      settingButton(`${racikanActive ? "▸ " : ""}🗂️ Racikan`, "cfg:page:presets"),
      settingButton("📋 Config penuh", "cfg:show"),
    ],
    [settingButton("🔄 Refresh", `cfg:page:${token}`), settingButton("❌ Close", "cfg:close")],
  ];
}

// TINGKAT 2 — group rows for one ASAL section, shown whenever a section is active
// and STAY visible when a group is open. Short names, 2/row, each tagged ✏N
// (editable count) or 👁 (view-only). The active group is marked with ▸.
function settingsGroupRows(sec, activeGroupId) {
  const btns = sec.subgroups.map((sg) => {
    const short = MENU_GROUP_SHORT[sg.id] || sg.title;
    const mark = sg.id === activeGroupId ? "▸ " : "";
    if (sg.identity) return settingButton(`${mark}${short} 🗂️`, "cfg:page:presets");
    const n = editableCountFor(sg);
    return settingButton(`${mark}${short} ${n > 0 ? `✏${n}` : "👁"}`, `cfg:page:${sg.id}`);
  });
  return chunkRows(btns, 2);
}

// TINGKAT 3 — flat list of editable control rows for one group, bucketed by
// sub-cluster (a noop header per cluster when the group spans >1). Single-button
// controls pair two-per-row. Returns rows (incl. cluster headers) for pagination.
function settingsControlRows(sg) {
  const order = [];
  const members = {};
  for (const k of sg.keys) {
    if (!MENU_CONTROLS[k]) continue;
    const cl = KEY_SUBCLUSTER[k] || "_misc";
    if (!members[cl]) { members[cl] = []; order.push(cl); }
    members[cl].push(k);
  }
  const rows = [];
  const showHdr = order.length > 1;
  for (const cl of order) {
    const meta = SUB_CLUSTER_META[cl];
    if (showHdr && meta) rows.push([settingButton(`· ${meta.emoji} ${meta.label} ·`, "cfg:noop")]);
    let buffered = null; // hold one single-button control to pair with the next
    const flush = () => { if (buffered) { rows.push(buffered); buffered = null; } };
    for (const k of members[cl]) {
      const ctrl = MENU_CONTROLS[k];
      if (ctrl.build) { flush(); rows.push(...ctrl.build()); continue; }
      const row = ctrl.toggle
        ? [toggleButton(ctrl.toggle[0], ctrl.toggle[1])]
        : inputButton(ctrl.input[0], ctrl.input[1], ctrl.input[2] || {});
      if (row.length === 1) {
        if (buffered) { rows.push([buffered[0], row[0]]); buffered = null; }
        else buffered = row;
      } else { flush(); rows.push(row); }
    }
    flush();
  }
  return rows;
}

// Compact "config inti" summary for the /settings landing. Values come from the
// SAME source as /config + /config core (buildConfigRowMap → already 🟢/⚪-tagged),
// so the landing can never drift from /config. The keys shown are the core set
// (mirrors config-origin CORE_GROUPS); they're just regrouped one line/kategori.
function formatSettingsLandingSummary() {
  const rowMap = buildConfigRowMap();
  const v = (k) => (rowMap[k] ? rowMap[k][1] : "—");
  const setup = (() => {
    try { const s = getActiveSetupStatus(); return s.name ? `${s.name}${s.edited ? " ✎" : ""}` : "—"; }
    catch { return "—"; }
  })();
  const lock = (config.strategy.strategyLock ?? "default") !== "default" ? ` 🔒${v("strategyLock")}` : "";
  const expOn = Object.entries(config.experiments).filter(([, x]) => x === true).map(([k]) => k).join(", ") || "none";
  return [
    `⚙️ SETTINGS · racikan ${setup}`,
    `💰 pos ${v("maxPositions")} · deploy ${v("deployAmountSol")} · SL ${v("stopLossPct")} · TP ${v("takeProfitPct")} · trail ${v("trailingTakeProfit")}`,
    `🔎 mcap ${v("minMcap")}–${v("maxMcap")} · TVL ${v("minTvl")}–${v("maxTvl")} · vol ${v("minVolume")} · holders ${v("minHolders")} · organic ${v("minOrganic")}`,
    `🎯 ${v("strategy")}${lock} · bins ${v("minBinsBelow")}–${v("maxBinsBelow")}`,
    `🧠 ${v("managementModel")} · ⏱ manage ${v("managementIntervalMin")}m / screen ${v("screeningIntervalMin")}m`,
    `📊 indikator ${v("enabled")} (${v("entryPreset")}) · exit ${v("exitEnabled")}`,
    `🧪 experiments ON: ${expOn}`,
  ].join("\n");
}

// LANDING — no section chosen: message = config-inti summary, buttons = TINGKAT 1.
function renderSettingsMain() {
  const bodyText = [
    formatSettingsLandingSummary(),
    "",
    "Pilih seksi ⤵️  ( ⚙️ dev · 🧩 zen )",
  ].join("\n");
  return { text: bodyText, keyboard: settingsHeaderRows(null, "main") };
}

// SECTION — a section is active: TINGKAT 1 (active ▸) + TINGKAT 2 groups (none ▸).
function renderSettingsSection(sectionId) {
  const sec = ORIGIN_SECTIONS.find((s) => s.id === sectionId);
  if (!sec) return renderSettingsMain();
  const bodyText = [
    `${MENU_SECTION_LABEL[sec.id] || sec.title} — ${sec.blurb}`,
    "",
    "Pilih grup ⤵️  ( ✏N = N setelan editable · 👁 = lihat-saja )",
  ].join("\n");
  const keyboard = [
    ...settingsHeaderRows(sec.id, sec.id),
    ...settingsGroupRows(sec, null),
  ];
  return { text: bodyText, keyboard };
}

// GROUP — a group is open: TINGKAT 1 (active section ▸) + TINGKAT 2 (active group
// ▸, STAYS visible) + TINGKAT 3 editable controls (paginated when many). Body text
// = the same read-only /config rows (sub-clusters, 🟢/⚪, legacy notes). `token`
// may carry a T3 page suffix ("dev-management~2"); switching group/section swaps
// the lower levels without any "back" button.
function renderSettingsGroup(token) {
  const [groupId, pageStr] = String(token).split("~");
  const found = findSubgroup(groupId);
  if (!found) return renderSettingsMain();
  const { sec, sg } = found;
  if (sg.identity) return renderSettingsPresets();

  const rowMap = buildConfigRowMap();
  const { text: body } = renderSubclusterRows(sg.keys, rowMap);

  let controlRows = settingsControlRows(sg);
  if (controlRows.length === 0) controlRows = [[settingButton("👁 Lihat-saja — ubah via /setcfg atau file", "cfg:noop")]];

  // T3 pagination: chunk control rows; T1 + T2 stay visible across pages.
  const totalPages = Math.max(1, Math.ceil(controlRows.length / MAX_T3_ROWS));
  const page = Math.min(Math.max(1, parseInt(pageStr, 10) || 1), totalPages);
  const controlsThisPage = totalPages > 1
    ? controlRows.slice((page - 1) * MAX_T3_ROWS, page * MAX_T3_ROWS)
    : controlRows;
  const pagerRows = totalPages > 1
    ? [[
        settingButton("‹", `cfg:page:${groupId}~${page > 1 ? page - 1 : totalPages}`),
        settingButton(`Hal ${page}/${totalPages}`, "cfg:noop"),
        settingButton("›", `cfg:page:${groupId}~${page < totalPages ? page + 1 : 1}`),
      ]]
    : [];
  const currentToken = totalPages > 1 ? `${groupId}~${page}` : groupId;

  const bodyText = [
    `${MENU_SECTION_LABEL[sec.id] || sec.title} › ${sg.title}`,
    `📝 ${subgroupDesc(sg)}`,
    "",
    body || "  (tak ada setelan)",
    "",
    totalPages > 1
      ? `Tombol edit (hal ${page}/${totalPages}). Sisanya lihat-saja (via /setcfg / file).`
      : "Tombol = bisa diubah. Sisanya lihat-saja (via /setcfg / file).",
  ].join("\n");

  const keyboard = [
    ...settingsHeaderRows(sec.id, currentToken),
    ...settingsGroupRows(sec, groupId),
    ...pagerRows,
    ...controlsThisPage,
  ];
  return { text: bodyText, keyboard };
}

// 🗂️ Racikan/Identitas — kept as the dedicated presets page (load/diff/del/save).
function renderSettingsPresets() {
  const presets = listPresets();
  const lines = presets.length
    ? presets.map((p) => p.error
        ? `⚠ ${p.name}`
        : `${p.isCurrent ? "●" : "○"} ${p.name} — ${p.dryRun ? "🧪 dry-run" : "live"} · ${p.keys} keys${p.isCurrent ? " (current)" : ""}`)
    : ["(belum ada preset)"];
  const setupStatus = (() => {
    try { const s = getActiveSetupStatus(); return s.name ? `${s.name}${s.edited ? " ✎ (ada edit manual)" : ""}` : "— (belum load)"; } catch { return "—"; }
  })();
  const bodyText = ["🧩 ADD BY ZEN › 🗂️ Racikan/Identitas", "",
    `Aktif: ${setupStatus}`,
    "(Racikan = snapshot config penuh. Beda dari 🧬 Profil = arketipe wizard.)", "",
    ...lines, "",
    "● = sama dgn config live · 🧪 = isi file dryRun (bukan berarti jalan)",
    "Per baris: ▶ load · 🔍 lihat beda · 🗑️ hapus.",
    "💾 = simpan config sekarang jadi racikan baru.",
  ].join("\n");
  const rows = presets.map((p) => p.error
    ? [settingButton(`⚠ ${p.name}`, "cfg:noop")]
    : [
        settingButton(`${p.isCurrent ? "●" : "▶"} ${p.name}${p.dryRun ? " 🧪" : ""}`, `cfg:preset:ask:${p.name}`),
        settingButton("🔍", `cfg:preset:diff:${p.name}`),
        settingButton("🗑️", `cfg:preset:rmask:${p.name}`),
      ]);
  rows.push([settingButton("💾 Simpan config sekarang", "cfg:preset:save")]);
  // Keep TINGKAT 1 + the Zen TINGKAT 2 groups visible (Racikan marked ▸) so the
  // user can jump straight to another section/group without a back button.
  const zenSec = ORIGIN_SECTIONS.find((s) => s.id === "zen");
  const keyboard = [
    ...settingsHeaderRows("zen", "presets"),
    ...settingsGroupRows(zenSec, "zen-racikan"),
    ...rows,
  ];
  return { text: bodyText, keyboard };
}

function renderSettingsMenu(page = "main") {
  const base = String(page).split("~")[0];
  if (base === "main") return renderSettingsMain();
  if (base === "dev" || base === "zen") return renderSettingsSection(base);
  if (base === "presets") return renderSettingsPresets();
  return renderSettingsGroup(page); // group token (e.g. "dev-management" / "zen-gmgn~2"); unknown → main
}

async function showSettingsMenu({ messageId = null, page = "main" } = {}) {
  _settingsView = page; // remember the live view so post-edit re-renders stay put
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
    const inputPage = returnTokenForKey(inputKey);
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
    // "📋 Config penuh" → the full /config (same as the /config command, auto-split).
    // sendMessage drops it below the menu so the keyboard stays usable.
    await answerCallbackQuery(msg.callbackQueryId);
    await sendMessage(formatFullConfig());
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
    await showSettingsMenu({ messageId: msg.messageId, page: "zen-screening" });
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
  page = returnTokenForKey(key);
  await answerCallbackQuery(msg.callbackQueryId, `Updated ${key}`);
  await showSettingsMenu({ messageId: msg.messageId, page });
}

function formatHelpText() {
  return [
    "🤖 Meridian — Commands",
    "",
    "📊 LAPORAN & STATUS",
    "/status — wallet + positions snapshot",
    "/wallet — wallet, rent tertahan + SOL bebas efektif + SOL tracker (1d/7d/30d)",
    "/wallet trackstart <YYYY-MM-DD|off> — anchor tracker SOL ke tanggal",
    "/positions — list open positions (+ rent tertahan)",
    "/pool <n> — detail 1 posisi (+ range-efficiency + rent)",
    "/briefing — morning briefing (auto-pinned)",
    "/report — racikan aktif · /report all = lifetime · /report setups · /report <racikan>",
    "/report [week|month|day] — digest periodik",
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
    "/config core — ringkasan key inti saja",
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

  // SOL tracker anchor: "/wallet trackstart YYYY-MM-DD" (or off|clear to remove).
  const trackStartMatch = text.match(/^\/wallet\s+trackstart\b\s*(.*)$/i);
  if (trackStartMatch) {
    const arg = trackStartMatch[1].trim().toLowerCase();
    if (!arg) {
      const cur = getTrackStart();
      await sendMessage(cur
        ? `📊 SOL tracker anchor: ${cur}\nGanti: /wallet trackstart YYYY-MM-DD · Hapus: /wallet trackstart off`
        : `📊 SOL tracker anchor: belum diset.\nSet: /wallet trackstart YYYY-MM-DD (mis. ${new Date().toISOString().slice(0, 10)})`).catch(() => {});
      return;
    }
    if (["off", "clear", "hapus", "reset"].includes(arg)) {
      setTrackStart(null);
      await sendMessage("📊 SOL tracker anchor dihapus. /wallet pakai window 1D/7D/30D saja.").catch(() => {});
      return;
    }
    const res = setTrackStart(arg);
    await sendMessage(res.ok
      ? `✅ SOL tracker anchor diset ke ${res.dateKey}. /wallet sekarang nampilin baris "SINCE ${res.dateKey}".`
      : `❌ ${res.error}`).catch(() => {});
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
      // Held rent across open positions → total tertahan + SOL bebas efektif.
      let rentInfo = null;
      if (positions.total_positions > 0) {
        const rentMap = await getPositionsRentSol(positions.positions.map((p) => p.position)).catch(() => ({}));
        const vals = Object.values(rentMap);
        rentInfo = {
          totalRentSol: vals.reduce((s, r) => s + (r?.sol ?? 0), 0),
          estimated: vals.some((r) => r?.estimated),
        };
      }
      let msg = formatWalletStatus(wallet, positions, rentInfo);
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

  if (text === "/config" || text === "/config core") {
    await sendMessage(text === "/config core" ? formatCoreConfig() : formatFullConfig()).catch(() => {});
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
      const rentMap = await getPositionsRentSol(positions.map((p) => p.position)).catch(() => ({}));
      const lines = [];
      let totalRent = 0, anyRentEst = false;
      positions.forEach((p, i) => {
        const pnlVal = p.pnl_usd ?? 0;
        const pnl = `${pnlVal >= 0 ? "+" : "-"}${cur}${Math.abs(pnlVal)}${p.pnl_pct != null ? ` (${p.pnl_pct >= 0 ? "+" : ""}${p.pnl_pct}%)` : ""}`;
        const age = fmtAgeMin(p.age_minutes);
        const state = p.in_range ? "✅ in-range" : `⚠️ OOR ${p.minutes_out_of_range ?? 0}m`;
        const width = (Number.isFinite(p.lower_bin) && Number.isFinite(p.upper_bin)) ? `${p.upper_bin - p.lower_bin + 1} bins` : "? bins";
        const rent = rentMap[p.position];
        if (rent) { totalRent += rent.sol; if (rent.estimated) anyRentEst = true; }
        const rentStr = rent ? ` · 🔒 ${rent.sol.toFixed(3)}◎${rent.estimated ? " (est)" : ""}` : "";
        lines.push(
          `${i + 1}. ${p.pair}  ${state}`,
          `   value ${cur}${p.total_value_usd ?? "?"} · PnL ${pnl} · fees ${cur}${p.unclaimed_fees_usd ?? "?"}`,
          `   age ${age} · range ${width}${rentStr}`,
        );
      });
      const footer = [
        "━━━━━━━━━━━━━━━━━",
        `🔒 Total tertahan ~${totalRent.toFixed(3)} SOL${anyRentEst ? " (sebagian est)" : ""} — refund saat close`,
        "/close <n> · /pool <n> · /set <n> <note>",
      ].join("\n");
      await sendMessage(`📊 Open Positions (${total_positions})\n━━━━━━━━━━━━━━━━━\n${lines.join("\n")}\n${footer}`);
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
      const cur = config.management.solMode ? "◎" : "$";
      const tracked = (() => { try { return getTrackedPosition(pos.position); } catch { return null; } })();
      const rent = (await getPositionsRentSol([pos.position]).catch(() => ({})))[pos.position];

      const lines = [
        `${idx + 1}. ${pos.pair}`,
        `Pool: ${pos.pool}`,
        `Position: ${pos.position}`,
        "── Range efficiency ──",
        ...buildRangeEfficiencyLines(pos, tracked),
        "── Value ──",
        `PnL: ${pos.pnl_pct ?? "?"}% | fees: ${cur}${pos.unclaimed_fees_usd ?? "?"} | value ${cur}${pos.total_value_usd ?? "?"}`,
        `Age: ${fmtAgeMin(pos.age_minutes)}`,
      ];
      if (rent) lines.push(`🔒 Tertahan (rent): ${rent.sol.toFixed(4)} SOL${rent.estimated ? " (estimasi)" : ""} — refund saat close`);
      if (pos.instruction) lines.push(`Note: ${pos.instruction}`);
      await sendMessage(lines.join("\n"));
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
    // A settings-change phrase ("ubah/ganti/naikin/turunin/set/atur deploy …") must NOT be
    // treated as a deploy request: it belongs in GENERAL (which has update_config), not
    // SCREENER (which can only deploy). The word "deploy"/"amount" here names the SETTING.
    const isSettingEdit = /\b(ubah|ganti|atur|setel|set|naik(?:in|kan)|turun(?:in|kan)|tingkatkan|kurangi|perbesar|perkecil|change|update|increase|decrease|lower|raise|bump|adjust)\b/i.test(text);
    const isDeployRequest = !hasCloseIntent && !isSettingEdit && /\bdeploy\b|\bopen position\b|\blp into\b|\badd liquidity\b|\bbuka posisi\b|\btambah likuiditas\b/i.test(text);
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
  /report        Trade report — /report [all|setups|<racikan>|week|month|day]
  /guide         Panduan setting (TOC) — /guide <no|katakunci|all>
  /learn         Study top LPers from the best current pool and save lessons
  /learn <addr>  Study top LPers from a specific pool address
  /thresholds    Show current screening thresholds + performance stats
  /evolve        Manually trigger threshold evolution from performance data
  /evolve force  Run evolve once even when frozen (evolveEnabled=false) — manual override
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

    if (input === "/evolve" || input === "/evolve force") {
      await runBusy(async () => {
        // FREEZE gate: when evolveEnabled=false the AUTO loop is frozen. The manual
        // /evolve stays available to the operator, but plain `/evolve` refuses and
        // explains — running it anyway requires the explicit `/evolve force` override,
        // which writes thresholds despite the freeze (operator's deliberate choice).
        const frozen = config.learning?.evolveEnabled === false;
        const forced = input === "/evolve force";
        if (frozen && !forced) {
          console.log("\n🧊 Auto-evolve DIBEKUKAN (evolveEnabled=false) — threshold tidak akan diubah.");
          console.log("   minFeeActiveTvlRatio & minOrganic tetap manual.");
          console.log("   Untuk override manual SEKALI JALAN: ketik  /evolve force\n");
          return;
        }
        if (frozen && forced) {
          console.log("\n⚠️  OVERRIDE MANUAL — evolve dibekukan (evolveEnabled=false) tapi dipaksa jalan.");
          console.log("   Ini akan MENULIS threshold sekali ini. Toggle tetap false setelahnya.\n");
        }
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
      // No onConfirmRequired here (unlike the Telegram path, which wires
      // requestConfirmation): the CLI REPL is the local operator's own console —
      // whoever types here is already the trusted operator, so a confirm prompt
      // would be redundant. Value safety is not skipped: update_config still runs
      // through the same executor, so config-schema.js validation applies on this
      // path too (a garbled model id / out-of-range value is rejected regardless).
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
