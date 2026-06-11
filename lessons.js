/**
 * Agent learning system.
 *
 * After each position closes, performance is analyzed and lessons are
 * derived. These lessons are injected into the system prompt so the
 * agent avoids repeating mistakes and doubles down on what works.
 */

import fs from "fs";
import { log } from "./logger.js";
import { getSharedLessonsForPrompt, pushHiveLesson, pushHivePerformanceEvent } from "./hivemind.js";
import { repoPath } from "./repo-root.js";
import { isPaperMode } from "./paper-trading.js";
import { config } from "./config.js";

const USER_CONFIG_PATH = repoPath("user-config.json");

const LESSONS_FILE = repoPath("lessons.json");
const MIN_EVOLVE_POSITIONS = 5;   // don't evolve until we have real data
const MAX_CHANGE_PER_STEP  = 0.20; // never shift a threshold more than 20% at once
const PERFORMANCE_SIGNAL_FIELDS = [
  "organic_score",
  "fee_tvl_ratio",
  "volume",
  "mcap",
  "holder_count",
  "smart_wallets_present",
  "narrative_quality",
  "study_win_rate",
  "hive_consensus",
  "volatility",
  "entry_mcap",
  "entry_tvl",
  "entry_volume",
];
const MAX_MANUAL_LESSON_LENGTH = 400;

// ─── Time-of-day (WIB / UTC+7) sessions ────────────────────────
// Position open-hour is bucketed into coarse sessions rather than 24
// individual hours — with sparse data, wide buckets are far more stable.
const WIB_OFFSET_HOURS = 7;
const SESSIONS = [
  { key: "dini",  label: "00–06 dini hari", start: 0,  end: 6  },
  { key: "pagi",  label: "06–11 pagi",      start: 6,  end: 11 },
  { key: "siang", label: "11–15 siang",     start: 11, end: 15 },
  { key: "sore",  label: "15–19 sore",      start: 15, end: 19 },
  { key: "malam", label: "19–24 malam",     start: 19, end: 24 },
];
// Minimum closed-position samples before a session's stats may steer any
// decision (prompt nudge or interval throttle). Below this = treat as neutral.
const MIN_SESSION_SAMPLES = 8;

// Controlled vocabulary for the 🧪 narrative-profile experiment (#7). The
// SCREENER tags each deploy with one of these so closed-position performance can
// be bucketed by narrative type. KEEP IN SYNC with the deploy_position
// narrative_category enum in tools/definitions.js.
export const NARRATIVE_CATEGORIES = ["animal", "ai", "political", "celebrity", "meme", "culture", "tech_utility", "other"];
// Min closed samples before a narrative bucket may steer the prompt. Same idea
// as MIN_SESSION_SAMPLES — below this, treat the bucket as neutral/insufficient.
const MIN_NARRATIVE_SAMPLES = 8;

/** Hour-of-day (0–23) in WIB for an ISO timestamp, or null if unparseable. */
function wibHour(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (new Date(t).getUTCHours() + WIB_OFFSET_HOURS) % 24;
}

/** Map a WIB hour to its session descriptor. */
function sessionForHour(hour) {
  if (hour == null) return null;
  return SESSIONS.find((s) => hour >= s.start && hour < s.end) || SESSIONS[0];
}

/** The session active right now (WIB). */
export function currentWibSession(date = new Date()) {
  return sessionForHour((date.getUTCHours() + WIB_OFFSET_HOURS) % 24);
}

/** Display label (with WIB hour range) for a session key, e.g. "siang" → "11–15 siang". */
export function sessionLabel(key) {
  return SESSIONS.find((s) => s.key === key)?.label || key;
}

function sanitizeLessonText(text, maxLen = MAX_MANUAL_LESSON_LENGTH) {
  if (text == null) return null;
  const cleaned = String(text)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[<>`]/g, "")
    .trim()
    .slice(0, maxLen);
  return cleaned || null;
}

function load() {
  if (!fs.existsSync(LESSONS_FILE)) {
    return { lessons: [], performance: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(LESSONS_FILE, "utf8"));
  } catch {
    return { lessons: [], performance: [] };
  }
}

function save(data) {
  fs.writeFileSync(LESSONS_FILE, JSON.stringify(data, null, 2));
}

function buildSignalSnapshot(perf) {
  const snapshot = { ...(perf.signal_snapshot || {}) };
  if (perf.base_mint && snapshot.base_mint == null) snapshot.base_mint = perf.base_mint;
  for (const field of PERFORMANCE_SIGNAL_FIELDS) {
    if (snapshot[field] == null && perf[field] != null) {
      snapshot[field] = perf[field];
    }
  }
  return Object.values(snapshot).some((value) => value != null) ? snapshot : null;
}

// ─── Record Position Performance ──────────────────────────────

/**
 * Call this when a position closes. Captures performance data and
 * derives a lesson if the outcome was notably good or bad.
 *
 * @param {Object} perf
 * @param {string} perf.position       - Position address
 * @param {string} perf.pool           - Pool address
 * @param {string} perf.pool_name      - Pool name (e.g. "Mustard-SOL")
 * @param {string} perf.strategy       - "spot" | "curve" | "bid_ask"
 * @param {number} perf.bin_range      - Bin range used
 * @param {number} perf.bin_step       - Pool bin step
 * @param {number} perf.volatility     - Pool volatility at deploy time
 * @param {number} perf.fee_tvl_ratio  - fee/TVL ratio at deploy time
 * @param {number} perf.organic_score  - Token organic score at deploy time
 * @param {number} perf.amount_sol     - Amount deployed
 * @param {number} perf.fees_earned_usd - Total fees earned
 * @param {number} perf.final_value_usd - Value when closed
 * @param {number} perf.initial_value_usd - Value when opened
 * @param {number} perf.minutes_in_range  - Total minutes position was in range
 * @param {number} perf.minutes_held      - Total minutes position was held
 * @param {string} perf.close_reason   - Why it was closed
 */
export async function recordPerformance(perf) {
  const data = load();

  // Guard against unit-mixed records where a SOL-sized final value is
  // accidentally written into a USD field (e.g. final_value_usd = 2 for a 2 SOL close).
  const suspiciousUnitMix =
    Number.isFinite(perf.initial_value_usd) &&
    Number.isFinite(perf.final_value_usd) &&
    Number.isFinite(perf.amount_sol) &&
    perf.initial_value_usd >= 20 &&
    perf.amount_sol >= 0.25 &&
    perf.final_value_usd > 0 &&
    perf.final_value_usd <= perf.amount_sol * 2;

  if (suspiciousUnitMix) {
    log("lessons_warn", `Skipped suspicious performance record for ${perf.pool_name || perf.pool}: initial=${perf.initial_value_usd}, final=${perf.final_value_usd}, amount_sol=${perf.amount_sol}`);
    return;
  }

  const pnl_usd = (perf.final_value_usd + perf.fees_earned_usd) - perf.initial_value_usd;
  const pnl_pct = perf.initial_value_usd > 0
    ? (pnl_usd / perf.initial_value_usd) * 100
    : 0;
  const range_efficiency = perf.minutes_held > 0
    ? (perf.minutes_in_range / perf.minutes_held) * 100
    : 0;

  const closeReasonText = String(perf.close_reason || "").toLowerCase();
  const suspiciousAbsurdClosedPnl =
    Number.isFinite(pnl_pct) &&
    perf.initial_value_usd >= 20 &&
    pnl_pct <= -90 &&
    !closeReasonText.includes("stop loss");

  if (suspiciousAbsurdClosedPnl) {
    log("lessons_warn", `Skipped absurd closed PnL record for ${perf.pool_name || perf.pool}: pnl_pct=${pnl_pct.toFixed(2)} reason=${perf.close_reason}`);
    return;
  }

  const signalSnapshot = buildSignalSnapshot(perf);
  const recordedAt = new Date().toISOString();
  const openedAt = perf.deployed_at || null;
  const openHourWib = wibHour(openedAt);
  const entry = {
    ...perf,
    signal_snapshot: signalSnapshot,
    pnl_usd: Math.round(pnl_usd * 100) / 100,
    pnl_pct: Math.round(pnl_pct * 100) / 100,
    range_efficiency: Math.round(range_efficiency * 10) / 10,
    opened_at: openedAt,
    closed_at: recordedAt,
    open_hour_wib: openHourWib,
    open_session: openHourWib != null ? sessionForHour(openHourWib).key : null,
    recorded_at: recordedAt,
  };

  data.performance.push(entry);

  // Derive and store a lesson. Paper (sim) lessons are TAGGED so live consumers
  // can exclude them (getLessonsForPrompt) — and a sim lesson is never pushed to
  // the shared hive.
  const lesson = derivLesson(entry);
  if (lesson) {
    if (entry.paper) lesson.paper = true;
    data.lessons.push(lesson);
    log("lessons", `New lesson${entry.paper ? " [paper]" : ""}: ${lesson.rule}`);
  }

  save(data);
  if (lesson && !entry.paper) {
    void pushHiveLesson(lesson);
  }

  // Update pool-level memory — LIVE closes only. Paper outcomes never touch
  // pool-memory.json so they can't bias live screening once you flip to live.
  // (return lesson so callers can include it in close notifications)
  if (perf.pool && !entry.paper) {
    const { recordPoolDeploy } = await import("./pool-memory.js");
    recordPoolDeploy(perf.pool, {
      pool_name: perf.pool_name,
      base_mint: perf.base_mint,
      deployed_at: perf.deployed_at,
      closed_at: entry.recorded_at,
      pnl_pct: entry.pnl_pct,
      pnl_usd: entry.pnl_usd,
      range_efficiency: entry.range_efficiency,
      minutes_held: perf.minutes_held,
      fees_earned_usd: perf.fees_earned_usd,
      fees_earned_sol: perf.fees_earned_sol,
      fee_earned_pct: perf.initial_value_usd > 0 ? ((perf.fees_earned_usd || 0) / perf.initial_value_usd) * 100 : null,
      close_reason: perf.close_reason,
      strategy: perf.strategy,
      volatility: perf.volatility,
      entry_mcap: perf.entry_mcap,
      entry_tvl: perf.entry_tvl,
      entry_volume: perf.entry_volume,
      exit_mcap: perf.exit_mcap,
      exit_tvl: perf.exit_tvl,
      exit_volume: perf.exit_volume,
    });
  }

  // Evolve thresholds every 5 closed positions — LIVE records only. Sim (paper)
  // closes never move real screening thresholds or Darwinian signal weights, even
  // if this box is later flipped to live with paper history still on file.
  const livePerf = data.performance.filter((p) => !p.paper);
  if (livePerf.length > 0 && livePerf.length % MIN_EVOLVE_POSITIONS === 0) {
    const { reloadScreeningThresholds } = await import("./config.js");
    const result = evolveThresholds(livePerf, config);
    if (result?.changes && Object.keys(result.changes).length > 0) {
      reloadScreeningThresholds();
      log("evolve", `Auto-evolved thresholds: ${JSON.stringify(result.changes)}`);
    }

    // Darwinian signal weight recalculation
    if (config.darwin?.enabled) {
      const { recalculateWeights } = await import("./signal-weights.js");
      const wResult = recalculateWeights(livePerf, config);
      if (wResult.changes.length > 0) {
        log("evolve", `Darwin: adjusted ${wResult.changes.length} signal weight(s)`);
      }
    }
  }

  // Sim closes are never broadcast to the shared hive (would contaminate other bots).
  if (!entry.paper) {
    void pushHivePerformanceEvent({
      ...entry,
      base_mint: perf.base_mint || null,
      fees_earned_sol: perf.fees_earned_sol || 0,
      eventId: `close:${perf.position}:${entry.recorded_at}`,
    });
  }

  return lesson || null;
}

/**
 * Derive a lesson from a closed position's performance.
 * Only generates a lesson if the outcome was clearly good or bad.
 */
function derivLesson(perf) {
  const tags = [];
  const feeYieldPct = perf.initial_value_usd > 0
    ? ((perf.fees_earned_usd || 0) / perf.initial_value_usd) * 100
    : 0;

  // Categorize outcome
  const outcome = perf.pnl_pct >= 5 ? "good"
    : (perf.pnl_pct >= 0 && feeYieldPct >= 2) ? "good"
    : perf.pnl_pct >= 0 ? "neutral"
    : perf.pnl_pct >= -5 ? "poor"
    : "bad";

  if (outcome === "neutral") return null; // nothing interesting to learn

  // Build context description with entry/exit market conditions
  const fmtNum = (n) => n == null ? "?" : n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(Math.round(n));
  const contextParts = [
    `${perf.pool_name}`,
    `strategy=${perf.strategy}`,
    `bin_step=${perf.bin_step}`,
    `volatility=${perf.volatility}`,
    `fee_tvl_ratio=${perf.fee_tvl_ratio}`,
    `organic=${perf.organic_score}`,
    `bin_range=${typeof perf.bin_range === 'object' ? JSON.stringify(perf.bin_range) : perf.bin_range}`,
  ];
  if (perf.entry_mcap != null || perf.entry_tvl != null || perf.entry_volume != null) {
    contextParts.push(`entry(mcap=${fmtNum(perf.entry_mcap)}, tvl=${fmtNum(perf.entry_tvl)}, vol=${fmtNum(perf.entry_volume)})`);
  }
  if (perf.exit_mcap != null || perf.exit_tvl != null || perf.exit_volume != null) {
    contextParts.push(`exit(mcap=${fmtNum(perf.exit_mcap)}, tvl=${fmtNum(perf.exit_tvl)}, vol=${fmtNum(perf.exit_volume)})`);
  }
  const context = contextParts.join(", ");

  let rule = "";

  if (outcome === "good" || outcome === "bad") {
    if (perf.range_efficiency < 30 && outcome === "bad") {
      rule = `AVOID: ${perf.pool_name}-type pools (volatility=${perf.volatility}, bin_step=${perf.bin_step}) with strategy="${perf.strategy}" — went OOR ${100 - perf.range_efficiency}% of the time. Consider wider bin_range or bid_ask strategy.`;
      tags.push("oor", perf.strategy, `volatility_${Math.round(perf.volatility)}`);
    } else if (perf.range_efficiency > 80 && outcome === "good") {
      const entryNote = perf.entry_mcap != null ? ` Entry: mcap=${fmtNum(perf.entry_mcap)}, tvl=${fmtNum(perf.entry_tvl)}, vol=${fmtNum(perf.entry_volume)}.` : "";
      rule = `PREFER: ${perf.pool_name}-type pools (volatility=${perf.volatility}, bin_step=${perf.bin_step}) with strategy="${perf.strategy}" — ${perf.range_efficiency}% in-range efficiency, PnL +${perf.pnl_pct}%.${entryNote}`;
      tags.push("efficient", perf.strategy);
    } else if (outcome === "bad" && perf.close_reason?.includes("volume")) {
      rule = `AVOID: Pools with fee_tvl_ratio=${perf.fee_tvl_ratio} that showed volume collapse — fees evaporated quickly. Minimum sustained volume check needed before deploying.`;
      tags.push("volume_collapse");
    } else if (outcome === "good") {
      rule = `WORKED: ${context} → PnL +${perf.pnl_pct}%, range efficiency ${perf.range_efficiency}%.`;
      tags.push("worked");
    } else {
      rule = `FAILED: ${context} → PnL ${perf.pnl_pct}%, range efficiency ${perf.range_efficiency}%. Reason: ${perf.close_reason}.`;
      tags.push("failed");
    }
  }

  if (!rule) return null;

  const closeReasonText = String(perf.close_reason || "").toLowerCase();
  const positiveEvidence =
    feeYieldPct >= 1 ||
    (perf.fees_earned_usd || 0) >= 3 ||
    perf.pnl_pct >= 3;
  const negativeEvidence =
    perf.pnl_pct <= -5 ||
    perf.range_efficiency <= 30 ||
    closeReasonText.includes("out of range") ||
    closeReasonText.includes("oor") ||
    closeReasonText.includes("low yield") ||
    closeReasonText.includes("volume");

  let confidence = 0.35;
  if (outcome === "good") {
    confidence = positiveEvidence ? 0.82 : 0.22;
  } else if (outcome === "bad") {
    confidence = negativeEvidence ? 0.88 : 0.45;
  } else if (outcome === "poor") {
    confidence = negativeEvidence ? 0.68 : 0.32;
  }

  return {
    id: Date.now(),
    rule,
    tags,
    outcome,
    sourceType: "performance",
    confidence: Math.round(confidence * 100) / 100,
    context,
    pnl_pct: perf.pnl_pct,
    fees_earned_usd: perf.fees_earned_usd,
    initial_value_usd: perf.initial_value_usd,
    range_efficiency: perf.range_efficiency,
    close_reason: perf.close_reason,
    pool: perf.pool,
    entry_mcap: perf.entry_mcap ?? null,
    entry_tvl: perf.entry_tvl ?? null,
    entry_volume: perf.entry_volume ?? null,
    exit_mcap: perf.exit_mcap ?? null,
    exit_tvl: perf.exit_tvl ?? null,
    exit_volume: perf.exit_volume ?? null,
    created_at: new Date().toISOString(),
  };
}

// ─── Adaptive Threshold Evolution ──────────────────────────────

/**
 * Analyze closed position performance and evolve screening thresholds.
 * Writes changes to user-config.json and returns a summary.
 *
 * @param {Array}  perfData - Array of performance records (from lessons.json)
 * @param {Object} config   - Live config object (mutated in place)
 * @returns {{ changes: Object, rationale: Object } | null}
 */
export function evolveThresholds(perfData, config) {
  if (!perfData || perfData.length < MIN_EVOLVE_POSITIONS) return null;

  const winners = perfData.filter((p) => p.pnl_pct > 0);
  const losers  = perfData.filter((p) => p.pnl_pct < -5);

  // Need at least some signal in both directions before adjusting
  const hasSignal = winners.length >= 2 || losers.length >= 2;
  if (!hasSignal) return null;

  const changes   = {};
  const rationale = {};

  // ── 1. minFeeActiveTvlRatio ───────────────────────────────────
  // Raise the floor if low-fee pools consistently underperform.
  {
    const winnerFees = winners.map((p) => p.fee_tvl_ratio).filter(isFiniteNum);
    const loserFees  = losers.map((p) => p.fee_tvl_ratio).filter(isFiniteNum);
    const current    = config.screening.minFeeActiveTvlRatio;

    if (winnerFees.length >= 2) {
      // Minimum fee/TVL among winners — we know pools below this don't work for us
      const minWinnerFee = Math.min(...winnerFees);
      if (minWinnerFee > current * 1.2) {
        const target  = minWinnerFee * 0.85; // stay slightly below min winner
        const newVal  = clamp(nudge(current, target, MAX_CHANGE_PER_STEP), 0.05, 10.0);
        const rounded = Number(newVal.toFixed(2));
        if (rounded > current) {
          changes.minFeeActiveTvlRatio = rounded;
          rationale.minFeeActiveTvlRatio = `Lowest winner fee_tvl=${minWinnerFee.toFixed(2)} — raised floor from ${current} → ${rounded}`;
        }
      }
    }

    if (loserFees.length >= 2) {
      // If losers all had high fee/TVL, that's noise (pumps then crash) — don't raise min
      // But if losers had low fee/TVL, raise min
      const maxLoserFee = Math.max(...loserFees);
      if (maxLoserFee < current * 1.5 && winnerFees.length > 0) {
        const minWinnerFee = Math.min(...winnerFees);
        if (minWinnerFee > maxLoserFee) {
          const target  = maxLoserFee * 1.2;
          const newVal  = clamp(nudge(current, target, MAX_CHANGE_PER_STEP), 0.05, 10.0);
          const rounded = Number(newVal.toFixed(2));
          if (rounded > current && !changes.minFeeActiveTvlRatio) {
            changes.minFeeActiveTvlRatio = rounded;
            rationale.minFeeActiveTvlRatio = `Losers had fee_tvl<=${maxLoserFee.toFixed(2)}, winners higher — raised floor from ${current} → ${rounded}`;
          }
        }
      }
    }
  }

  // ── 2. minOrganic ─────────────────────────────────────────────
  // Raise organic floor if low-organic tokens consistently failed.
  {
    const loserOrganics  = losers.map((p) => p.organic_score).filter(isFiniteNum);
    const winnerOrganics = winners.map((p) => p.organic_score).filter(isFiniteNum);
    const current        = config.screening.minOrganic;

    if (loserOrganics.length >= 2 && winnerOrganics.length >= 1) {
      const avgLoserOrganic  = avg(loserOrganics);
      const avgWinnerOrganic = avg(winnerOrganics);
      // Only raise if there's a clear gap (winners consistently more organic)
      if (avgWinnerOrganic - avgLoserOrganic >= 10) {
        // Set floor just below worst winner
        const minWinnerOrganic = Math.min(...winnerOrganics);
        const target = Math.max(minWinnerOrganic - 3, current);
        const newVal = clamp(Math.round(nudge(current, target, MAX_CHANGE_PER_STEP)), 60, 90);
        if (newVal > current) {
          changes.minOrganic = newVal;
          rationale.minOrganic = `Winner avg organic ${avgWinnerOrganic.toFixed(0)} vs loser avg ${avgLoserOrganic.toFixed(0)} — raised from ${current} → ${newVal}`;
        }
      }
    }
  }

  if (Object.keys(changes).length === 0) return { changes: {}, rationale: {} };

  // ── Persist changes to user-config.json ───────────────────────
  let userConfig = {};
  if (fs.existsSync(USER_CONFIG_PATH)) {
    try { userConfig = JSON.parse(fs.readFileSync(USER_CONFIG_PATH, "utf8")); } catch { /* ignore */ }
  }

  Object.assign(userConfig, changes);
  userConfig._lastEvolved = new Date().toISOString();
  userConfig._positionsAtEvolution = perfData.length;

  fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(userConfig, null, 2));

  // Apply to live config object immediately
  const s = config.screening;
  if (changes.minFeeActiveTvlRatio != null) s.minFeeActiveTvlRatio = changes.minFeeActiveTvlRatio;
  if (changes.minOrganic           != null) s.minOrganic           = changes.minOrganic;

  // Log a lesson summarizing the evolution
  const data = load();
  data.lessons.push({
    id: Date.now(),
    rule: `[AUTO-EVOLVED @ ${perfData.length} positions] ${Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(", ")} — ${Object.values(rationale).join("; ")}`,
    tags: ["evolution", "config_change"],
    outcome: "manual",
    created_at: new Date().toISOString(),
  });
  save(data);

  return { changes, rationale };
}

// ─── Helpers ───────────────────────────────────────────────────

function isFiniteNum(n) {
  return typeof n === "number" && isFinite(n);
}

function avg(arr) {
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** Move current toward target by at most maxChange fraction. */
function nudge(current, target, maxChange) {
  const delta = target - current;
  const maxDelta = current * maxChange;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

// ─── Manual Lessons ────────────────────────────────────────────

/**
 * Add a manual lesson (e.g. from operator observation).
 *
 * @param {string}   rule
 * @param {string[]} tags
 * @param {Object}   opts
 * @param {boolean}  opts.pinned - Always inject regardless of cap
 * @param {string}   opts.role   - "SCREENER" | "MANAGER" | "GENERAL" | null (all roles)
 */
export function addLesson(rule, tags = [], { pinned = false, role = null } = {}) {
  const safeRule = sanitizeLessonText(rule);
  if (!safeRule) return;
  const data = load();

  // Dedup: an identical rule already on file is pure noise. This guards against
  // the model firing update_config (or any addLesson source) repeatedly with the
  // same change — which historically stacked the same lesson 60+ times. Refresh
  // the existing lesson's recency instead so it still injects, then bail.
  const existing = data.lessons.find((l) => l.rule === safeRule);
  if (existing) {
    existing.created_at = new Date().toISOString();
    if (pinned) existing.pinned = true;
    save(data);
    log("lessons", `Duplicate lesson skipped (refreshed recency): ${safeRule.slice(0, 60)}`);
    return;
  }

  const lesson = {
    id: Date.now(),
    rule: safeRule,
    tags,
    outcome: "manual",
    sourceType: tags.includes("self_tune") || tags.includes("config_change") ? "config_change" : "manual",
    pinned: !!pinned,
    role: role || null,
    created_at: new Date().toISOString(),
  };
  data.lessons.push(lesson);
  save(data);
  log("lessons", `Manual lesson added${pinned ? " [PINNED]" : ""}${role ? ` [${role}]` : ""}: ${safeRule}`);
  void pushHiveLesson(lesson);
}

/**
 * Pin a lesson by ID — pinned lessons are always injected regardless of cap.
 */
export function pinLesson(id) {
  const data = load();
  const lesson = data.lessons.find((l) => l.id === id);
  if (!lesson) return { found: false };
  lesson.pinned = true;
  save(data);
  log("lessons", `Pinned lesson ${id}: ${lesson.rule.slice(0, 60)}`);
  return { found: true, pinned: true, id, rule: lesson.rule };
}

/**
 * Unpin a lesson by ID.
 */
export function unpinLesson(id) {
  const data = load();
  const lesson = data.lessons.find((l) => l.id === id);
  if (!lesson) return { found: false };
  lesson.pinned = false;
  save(data);
  return { found: true, pinned: false, id, rule: lesson.rule };
}

/**
 * List lessons with optional filters — for agent browsing via Telegram.
 */
export function listLessons({ role = null, pinned = null, tag = null, limit = 30, full = false } = {}) {
  const data = load();
  let lessons = [...data.lessons];

  if (pinned !== null) lessons = lessons.filter((l) => !!l.pinned === pinned);
  if (role)            lessons = lessons.filter((l) => !l.role || l.role === role);
  if (tag)             lessons = lessons.filter((l) => l.tags?.includes(tag));

  return {
    total: lessons.length,
    lessons: lessons.slice(-limit).map((l) => ({
      id: l.id,
      rule: full ? l.rule : l.rule.slice(0, 120),
      tags: l.tags,
      outcome: l.outcome,
      pinned: !!l.pinned,
      role: l.role || "all",
      created_at: l.created_at?.slice(0, 10),
    })),
  };
}

/**
 * Remove a lesson by ID.
 */
export function removeLesson(id) {
  const data = load();
  const before = data.lessons.length;
  data.lessons = data.lessons.filter((l) => l.id !== id);
  save(data);
  return before - data.lessons.length;
}

/**
 * Remove lessons matching a keyword in their rule text (case-insensitive).
 */
export function removeLessonsByKeyword(keyword) {
  const data = load();
  const before = data.lessons.length;
  const kw = keyword.toLowerCase();
  data.lessons = data.lessons.filter((l) => !l.rule.toLowerCase().includes(kw));
  save(data);
  return before - data.lessons.length;
}

/**
 * Clear ALL lessons (keeps performance data).
 */
export function clearAllLessons() {
  const data = load();
  const count = data.lessons.length;
  data.lessons = [];
  save(data);
  return count;
}

/**
 * Clear ALL performance records.
 */
export function clearPerformance() {
  const data = load();
  const count = data.performance.length;
  data.performance = [];
  save(data);
  return count;
}

// ─── Lesson Retrieval ──────────────────────────────────────────

// Tags that map to each agent role — used for role-aware lesson injection
const ROLE_TAGS = {
  SCREENER: ["screening", "narrative", "strategy", "deployment", "token", "volume", "entry", "bundler", "holders", "organic"],
  MANAGER:  ["management", "risk", "oor", "fees", "position", "hold", "close", "pnl", "rebalance", "claim"],
  GENERAL:  [], // all lessons
};

/**
 * Get lessons formatted for injection into the system prompt.
 * Structured injection with three tiers:
 *   1. Pinned        — always injected, up to PINNED_CAP
 *   2. Role-matched  — lessons tagged for this agentType, up to ROLE_CAP
 *   3. Recent        — fill remaining slots up to RECENT_CAP
 *
 * @param {Object} opts
 * @param {string} [opts.agentType]  - "SCREENER" | "MANAGER" | "GENERAL"
 * @param {number} [opts.maxLessons] - Override total cap (default 35)
 */
export function getLessonsForPrompt(opts = {}) {
  // Support legacy call signature: getLessonsForPrompt(20)
  if (typeof opts === "number") opts = { maxLessons: opts };

  const { agentType = "GENERAL", maxLessons } = opts;

  const data = load();
  // Sim (paper) lessons: shown while dry-running (it's the whole dataset), but
  // EXCLUDED from the live prompt unless opted in via usePaperHistoryWhenLive.
  // When the opt-in is on they're kept but flagged 🧪 in fmt() so the model treats
  // them as low-credibility soft reference — never as live, mechanical truth.
  if (!isPaperMode() && !config.experiments?.usePaperHistoryWhenLive) {
    data.lessons = data.lessons.filter((l) => !l.paper);
  }
  if (data.lessons.length === 0) return null;

  // Smaller caps for automated cycles — they don't need the full lesson history
  const isAutoCycle = agentType === "SCREENER" || agentType === "MANAGER";
  const PINNED_CAP  = isAutoCycle ? 5  : 10;
  const ROLE_CAP    = isAutoCycle ? 6  : 15;
  const RECENT_CAP  = maxLessons ?? (isAutoCycle ? 10 : 35);

  const outcomePriority = { bad: 0, poor: 1, failed: 1, good: 2, worked: 2, manual: 1, neutral: 3, evolution: 2 };
  const byPriority = (a, b) => (outcomePriority[a.outcome] ?? 3) - (outcomePriority[b.outcome] ?? 3);

  // ── Tier 1: Pinned ──────────────────────────────────────────────
  // Respect role even for pinned lessons — a pinned SCREENER lesson shouldn't pollute MANAGER
  const pinned = data.lessons
    .filter((l) => l.pinned && (!l.role || l.role === agentType || agentType === "GENERAL"))
    .sort(byPriority)
    .slice(0, PINNED_CAP);

  const usedIds = new Set(pinned.map((l) => l.id));

  // ── Tier 2: Role-matched ────────────────────────────────────────
  const roleTags = ROLE_TAGS[agentType] || [];
  const roleMatched = data.lessons
    .filter((l) => {
      if (usedIds.has(l.id)) return false;
      // Include if: lesson has no role restriction OR matches this role
      const roleOk = !l.role || l.role === agentType || agentType === "GENERAL";
      // Include if: lesson has role-relevant tags OR no tags (general)
      const tagOk  = roleTags.length === 0 || !l.tags?.length || l.tags.some((t) => roleTags.includes(t));
      return roleOk && tagOk;
    })
    .sort(byPriority)
    .slice(0, ROLE_CAP);

  roleMatched.forEach((l) => usedIds.add(l.id));

  // ── Tier 3: Recent fill ─────────────────────────────────────────
  const remainingBudget = RECENT_CAP - pinned.length - roleMatched.length;
  const recent = remainingBudget > 0
    ? data.lessons
        .filter((l) => !usedIds.has(l.id))
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .slice(0, remainingBudget)
    : [];

  const selected = [...pinned, ...roleMatched, ...recent];
  const shared = getSharedLessonsForPrompt({
    agentType,
    maxLessons: isAutoCycle ? 4 : 6,
  });
  if (selected.length === 0 && !shared) return null;

  const sections = [];
  if (pinned.length)      sections.push(`── PINNED (${pinned.length}) ──\n` + fmt(pinned));
  if (roleMatched.length) sections.push(`── ${agentType} (${roleMatched.length}) ──\n` + fmt(roleMatched));
  if (recent.length)      sections.push(`── RECENT (${recent.length}) ──\n` + fmt(recent));
  if (shared)             sections.push(`── HIVEMIND ──\n${shared}`);

  return sections.join("\n\n");
}

function fmt(lessons) {
  return lessons.map((l) => {
    const date = l.created_at ? l.created_at.slice(0, 16).replace("T", " ") : "unknown";
    const pin  = l.pinned ? "📌 " : "";
    const sim  = l.paper ? "🧪 " : "";  // sim/paper-derived → low-credibility soft reference
    return `${pin}${sim}[${l.outcome.toUpperCase()}] [${date}] ${l.rule}`;
  }).join("\n");
}

/**
 * Get individual performance records filtered by time window.
 * Tool handler: get_performance_history
 *
 * @param {Object} opts
 * @param {number} [opts.hours=24]   - How many hours back to look
 * @param {number} [opts.limit=50]   - Max records to return
 */
export function getPerformanceHistory({ hours = 24, limit = 50 } = {}) {
  const data = load();
  const p = data.performance;

  if (p.length === 0) return { positions: [], count: 0, hours };

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const filtered = p
    .filter((r) => r.recorded_at >= cutoff)
    .slice(-limit)
    .map((r) => ({
      pool_name: r.pool_name,
      pool: r.pool,
      strategy: r.strategy,
      pnl_usd: r.pnl_usd,
      pnl_pct: r.pnl_pct,
      fees_earned_usd: r.fees_earned_usd,
      range_efficiency: r.range_efficiency,
      minutes_held: r.minutes_held,
      close_reason: r.close_reason,
      closed_at: r.recorded_at,
    }));

  const totalPnl = filtered.reduce((s, r) => s + (r.pnl_usd ?? 0), 0);
  const wins = filtered.filter((r) => r.pnl_usd > 0).length;

  return {
    hours,
    count: filtered.length,
    total_pnl_usd: Math.round(totalPnl * 100) / 100,
    win_rate_pct: filtered.length > 0 ? Math.round((wins / filtered.length) * 100) : null,
    positions: filtered,
  };
}

/** Full closed-position performance array (for the reports engine). */
export function getAllPerformance() {
  return load().performance || [];
}

/**
 * Performance records scoped to the CURRENT run mode, so sim (paper) and live
 * records never mix in anything user-facing. Paper mode → only paper records
 * (that's the whole dataset while dry-running). Live → only real records, so a
 * paper history left on file can never contaminate live stats/reports/recs.
 * Use this everywhere a report/briefing/milestone reads closed-position perf.
 */
export function getModePerformance() {
  const all = load().performance || [];
  return isPaperMode()
    ? all.filter((p) => p.paper)
    : all.filter((p) => !p.paper);
}

/**
 * Get performance stats summary.
 */
export function getPerformanceSummary() {
  const data = load();
  const p = data.performance;

  if (p.length === 0) return null;

  const totalPnl = p.reduce((s, x) => s + x.pnl_usd, 0);
  const avgPnlPct = p.reduce((s, x) => s + x.pnl_pct, 0) / p.length;
  const avgRangeEfficiency = p.reduce((s, x) => s + x.range_efficiency, 0) / p.length;
  const wins = p.filter((x) => x.pnl_usd > 0).length;
  // All-time ROI as a single % = total PnL over total capital deployed (capital-weighted,
  // not the average of per-position %). Only counts records that carry initial capital.
  const totalInvested = p.reduce((s, x) => s + (x.initial_value_usd || 0), 0);
  const roiPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : null;

  return {
    total_positions_closed: p.length,
    total_pnl_usd: Math.round(totalPnl * 100) / 100,
    total_invested_usd: Math.round(totalInvested * 100) / 100,
    roi_pct: roiPct != null ? Math.round(roiPct * 100) / 100 : null,
    avg_pnl_pct: Math.round(avgPnlPct * 100) / 100,
    avg_range_efficiency_pct: Math.round(avgRangeEfficiency * 10) / 10,
    win_rate_pct: Math.round((wins / p.length) * 100),
    total_lessons: data.lessons.length,
  };
}

// ─── Time-of-day Profile (open-hour analysis) ──────────────────

/**
 * Bucket closed positions by their OPEN session (WIB) and report
 * win-rate / avg-PnL per session. Only records that carry an open
 * timestamp are counted, so this is empty until Phase-1 data accrues.
 *
 * Tool handler: get_time_profile
 */
export function getHourlyProfile() {
  const data = load();
  const perf = (data.performance || []).filter((p) => p.open_session && isFiniteNum(p.pnl_pct));

  const buckets = {};
  for (const s of SESSIONS) buckets[s.key] = { wins: 0, count: 0, pnlSum: 0, holdSum: 0, holdCount: 0 };
  for (const p of perf) {
    const b = buckets[p.open_session];
    if (!b) continue;
    b.count++;
    if (p.pnl_pct > 0) b.wins++;
    b.pnlSum += p.pnl_pct;
    // Holding time = how long the position stayed open (turnover speed). Soft signal
    // only; surfaced for the SCREENER prompt and get_time_profile, never gates the cron.
    if (isFiniteNum(p.minutes_held) && p.minutes_held > 0) { b.holdSum += p.minutes_held; b.holdCount++; }
  }

  const total = perf.length;
  const overallWins = perf.filter((p) => p.pnl_pct > 0).length;
  const overallWinRate = total > 0 ? Math.round((overallWins / total) * 100) : null;
  const held = perf.filter((p) => isFiniteNum(p.minutes_held) && p.minutes_held > 0);
  const overallAvgHoldMin = held.length > 0
    ? Math.round(held.reduce((s, p) => s + p.minutes_held, 0) / held.length)
    : null;

  const sessions = SESSIONS.map((s) => {
    const b = buckets[s.key];
    return {
      key: s.key,
      label: s.label,
      count: b.count,
      win_rate_pct: b.count > 0 ? Math.round((b.wins / b.count) * 100) : null,
      avg_pnl_pct: b.count > 0 ? Math.round((b.pnlSum / b.count) * 100) / 100 : null,
      avg_hold_min: b.holdCount > 0 ? Math.round(b.holdSum / b.holdCount) : null,
    };
  });

  return {
    timezone: "WIB (UTC+7)",
    min_samples: MIN_SESSION_SAMPLES,
    total_with_open_time: total,
    overall_win_rate_pct: overallWinRate,
    overall_avg_hold_min: overallAvgHoldMin,
    sessions,
  };
}

// Human-friendly minutes → "210m" / "3.5h" for soft-signal notes.
function fmtHoldMin(min) {
  if (min == null || !isFiniteNum(min)) return "?";
  return min >= 60 ? `${(min / 60).toFixed(1)}h` : `${min}m`;
}

/**
 * Classify a session's historical strength.
 * @returns {"weak" | "ok" | "insufficient"}
 *   "weak"        — enough samples AND clearly below baseline (win-rate
 *                   ≥15pp under overall AND negative avg PnL)
 *   "ok"          — enough samples, not weak
 *   "insufficient"— too few samples to judge (treat as neutral)
 */
export function classifySession(sessionKey) {
  const prof = getHourlyProfile();
  if (prof.overall_win_rate_pct == null) return "insufficient";
  const s = prof.sessions.find((x) => x.key === sessionKey);
  if (!s || s.count < MIN_SESSION_SAMPLES) return "insufficient";
  const weak = s.win_rate_pct < prof.overall_win_rate_pct - 15 && (s.avg_pnl_pct ?? 0) < 0;
  return weak ? "weak" : "ok";
}

/**
 * One-line time-of-day note for the SCREENER prompt. Returns null when
 * there isn't enough data overall, so we never nudge on noise. This is a
 * good-to-have signal only — it must never override hard screening rules.
 */
export function getTimeProfileForPrompt() {
  const prof = getHourlyProfile();
  if (prof.total_with_open_time < MIN_SESSION_SAMPLES) return null;

  const cur = currentWibSession();
  const s = prof.sessions.find((x) => x.key === cur.key);
  if (!s || s.count < MIN_SESSION_SAMPLES) {
    return `TIME-OF-DAY (WIB): current session ${cur.label} has only ${s?.count ?? 0} past deploys — no historical edge yet, judge on pool merits.`;
  }

  const verdict = classifySession(cur.key) === "weak"
    ? "historically WEAK — raise the bar, prefer skipping marginal candidates (good-to-have signal, NEVER overrides hard rules)."
    : "historically OK — deploy normally if a candidate qualifies.";
  // Holding time is a soft turnover hint (e.g. fast turnover = slots free up sooner).
  const holdNote = s.avg_hold_min != null
    ? ` Avg holding time ${fmtHoldMin(s.avg_hold_min)}.`
    : (prof.overall_avg_hold_min != null ? ` Avg holding time ${fmtHoldMin(prof.overall_avg_hold_min)} (overall).` : "");
  return `TIME-OF-DAY (WIB): current session ${cur.label} — win ${s.win_rate_pct}%, avg PnL ${s.avg_pnl_pct}% over ${s.count} deploys (overall ${prof.overall_win_rate_pct}%).${holdNote} ${verdict}`;
}

// ─── Narrative Profile (🧪 #7) ─────────────────────────────────

/**
 * Bucket closed positions by their narrative_category (tagged at deploy by the
 * SCREENER) and report win-rate / avg-PnL per category. Mirrors getHourlyProfile.
 * Only records that carry a known category are counted, so this is empty until
 * tagged data accrues.
 *
 * Tool handler: get_narrative_profile
 */
export function getNarrativeProfile() {
  const data = load();
  const perf = (data.performance || []).filter(
    (p) => NARRATIVE_CATEGORIES.includes(p.narrative_category) && isFiniteNum(p.pnl_pct)
  );

  const buckets = {};
  for (const c of NARRATIVE_CATEGORIES) buckets[c] = { wins: 0, count: 0, pnlSum: 0 };
  for (const p of perf) {
    const b = buckets[p.narrative_category];
    if (!b) continue;
    b.count++;
    if (p.pnl_pct > 0) b.wins++;
    b.pnlSum += p.pnl_pct;
  }

  const total = perf.length;
  const overallWins = perf.filter((p) => p.pnl_pct > 0).length;
  const overallWinRate = total > 0 ? Math.round((overallWins / total) * 100) : null;

  const categories = NARRATIVE_CATEGORIES
    .map((c) => {
      const b = buckets[c];
      return {
        category: c,
        count: b.count,
        win_rate_pct: b.count > 0 ? Math.round((b.wins / b.count) * 100) : null,
        avg_pnl_pct: b.count > 0 ? Math.round((b.pnlSum / b.count) * 100) / 100 : null,
      };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => (b.avg_pnl_pct ?? 0) - (a.avg_pnl_pct ?? 0));

  return {
    min_samples: MIN_NARRATIVE_SAMPLES,
    total_with_category: total,
    overall_win_rate_pct: overallWinRate,
    categories,
  };
}

/**
 * Classify a narrative category's historical strength. Same rule as
 * classifySession: "weak" = enough samples AND clearly below baseline
 * (win-rate ≥15pp under overall AND negative avg PnL).
 * @returns {"weak" | "ok" | "insufficient"}
 */
export function classifyNarrative(category) {
  const prof = getNarrativeProfile();
  if (prof.overall_win_rate_pct == null) return "insufficient";
  const c = prof.categories.find((x) => x.category === category);
  if (!c || c.count < MIN_NARRATIVE_SAMPLES) return "insufficient";
  const weak = c.win_rate_pct < prof.overall_win_rate_pct - 15 && (c.avg_pnl_pct ?? 0) < 0;
  return weak ? "weak" : "ok";
}

/**
 * One-line narrative note for the SCREENER prompt (gated by the experiment flag
 * at the call site). Lists the best and worst narrative buckets that have enough
 * samples. Returns null when there isn't enough tagged data, so we never nudge on
 * noise. Good-to-have signal only — must never override hard screening rules.
 */
export function getNarrativeProfileForPrompt() {
  const prof = getNarrativeProfile();
  if (prof.total_with_category < MIN_NARRATIVE_SAMPLES) return null;

  const ranked = prof.categories.filter((c) => c.count >= MIN_NARRATIVE_SAMPLES);
  if (ranked.length === 0) return null;

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const fmt = (c) => `${c.category} (win ${c.win_rate_pct}%, avg ${c.avg_pnl_pct}%, n=${c.count})`;
  const parts = [`NARRATIVE PROFILE: best ${fmt(best)}`];
  if (worst.category !== best.category) parts.push(`weakest ${fmt(worst)}`);
  parts.push(`overall ${prof.overall_win_rate_pct}%. Good-to-have signal — favor stronger narratives, NEVER overrides hard rules.`);
  return parts.join(" | ");
}
