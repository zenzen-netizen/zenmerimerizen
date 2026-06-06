import fs from "fs";
import { log } from "./logger.js";
import { getPerformanceSummary, getHourlyProfile } from "./lessons.js";
import { config } from "./config.js";
import { getOpenRouterBalance, getOpenRouter24hCost, getOpenRouterCredits } from "./openrouter-usage.js";
import { getSkipReview } from "./candidate-memory.js";
import { getDeployedPoolAddresses } from "./pool-memory.js";

// Escape data-derived text before embedding in HTML messages (lesson rules can
// contain <, >, & — e.g. "PnL -50% <= -50%" — which break Telegram's HTML parser).
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Surfaces only what the 24h sections above DON'T already show:
// older lessons (outside the 24h window), the last threshold adjustment,
// and avg in-range efficiency (the one all-time stat not printed elsewhere).
function buildLearningSection(lessonsData, since) {
  const allLessons = lessonsData.lessons || [];
  const allPerf = lessonsData.performance || [];

  // Recent lessons are already listed under "Lessons Learned (24h)" — keep only older ones.
  const older = allLessons.filter(l => !l.created_at || new Date(l.created_at) <= since);

  const warnings = older
    .filter(l => l.outcome === "bad" || l.outcome === "poor" || (l.rule || "").startsWith("FAILED"))
    .slice(-3);

  // Highest-confidence proven winners. Sort descending, take the FIRST 3.
  const winners = older
    .filter(l => l.outcome === "good" || (l.rule || "").startsWith("PREFER") || (l.rule || "").startsWith("WORKED"))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 3);

  // Latest auto-evolution change (not shown anywhere else in the briefing)
  const evolved = allLessons.filter(l => l.tags?.includes("evolution")).slice(-1)[0];

  // Avg in-range efficiency, all-time (PnL/win-rate are already shown above; this isn't)
  const effPerf = allPerf.filter(p => Number.isFinite(p.range_efficiency));
  const avgEff = effPerf.length
    ? effPerf.reduce((s, p) => s + p.range_efficiency, 0) / effPerf.length
    : null;

  if (warnings.length === 0 && winners.length === 0 && !evolved && avgEff == null) return null;

  const lines = ["<b>🧠 Learning Insights:</b>"];
  if (warnings.length > 0) {
    lines.push("⚠️ <b>Older warnings:</b>");
    for (const l of warnings) lines.push(`  • ${esc(String(l.rule).slice(0, 180))}`);
  }
  if (winners.length > 0) {
    lines.push("✅ <b>Proven patterns:</b>");
    for (const l of winners) lines.push(`  • ${esc(String(l.rule).slice(0, 180))}`);
  }
  if (evolved) {
    lines.push(`🔧 <b>Last threshold adjustment:</b> ${esc(String(evolved.rule).slice(0, 200))}`);
  }
  if (avgEff != null) {
    lines.push(`📊 <b>Avg in-range (all-time):</b> ${avgEff.toFixed(0)}%`);
  }

  return lines.join("\n");
}

const fin = (arr) => arr.filter((n) => Number.isFinite(n));
const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

// Turns closed-position performance into concrete, actionable config tweaks the
// operator can apply to push for more profit. Mirrors evolveThresholds' winner/loser
// logic, but covers dimensions the auto-evolver doesn't touch (bin_step, strategy,
// OOR wait, position sizing) and always references REAL config keys.
function buildRecommendations(allPerf) {
  const perf = (allPerf || []).filter((p) => Number.isFinite(p.pnl_pct));
  if (perf.length < 4) return null; // not enough closed positions to advise confidently

  const winners = perf.filter((p) => p.pnl_pct > 0);
  const losers = perf.filter((p) => p.pnl_pct < -5);
  if (winners.length < 2 && losers.length < 2) return null;

  const s = config.screening || {};
  const m = config.management || {};
  const recs = [];

  // 1. Fee/active-TVL floor — raise toward worst winner if there's clear headroom.
  const wFee = fin(winners.map((p) => p.fee_tvl_ratio));
  if (wFee.length >= 2) {
    const minWinFee = Math.min(...wFee);
    const cur = s.minFeeActiveTvlRatio ?? 0.05;
    if (minWinFee > cur * 1.3) {
      const target = Number((minWinFee * 0.85).toFixed(2));
      recs.push(`Raise <code>minFeeActiveTvlRatio</code> ${cur} → ~${target} (worst winner had fee/TVL ${minWinFee.toFixed(2)})`);
    }
  }

  // 2. Organic floor — winners consistently more organic than losers.
  const wOrg = fin(winners.map((p) => p.organic_score));
  const lOrg = fin(losers.map((p) => p.organic_score));
  if (wOrg.length >= 2 && lOrg.length >= 2) {
    const wAvg = mean(wOrg), lAvg = mean(lOrg);
    const cur = s.minOrganic ?? 60;
    const target = Math.round(Math.min(...wOrg) - 3);
    if (wAvg - lAvg >= 10 && target > cur) {
      recs.push(`Raise <code>minOrganic</code> ${cur} → ~${Math.min(target, 90)} (winners avg ${wAvg.toFixed(0)} vs losers ${lAvg.toFixed(0)})`);
    }
  }

  // 3. bin_step ceiling — if losers cluster at higher bin_step, tighten the cap.
  const wBin = fin(winners.map((p) => p.bin_step));
  const lBin = fin(losers.map((p) => p.bin_step));
  if (wBin.length >= 2 && lBin.length >= 2) {
    const wAvg = mean(wBin), lAvg = mean(lBin);
    if (lAvg - wAvg >= 10) {
      recs.push(`Lower <code>maxBinStep</code> toward ~${Math.round(wAvg + 10)} (losers avg bin_step ${lAvg.toFixed(0)} vs winners ${wAvg.toFixed(0)})`);
    }
  }

  // 4. Range efficiency — low in-range time means ranges too tight or OOR exits too fast.
  const allEff = fin(perf.map((p) => p.range_efficiency));
  if (allEff.length >= 3) {
    const effAvg = mean(allEff);
    if (effAvg < 50) {
      recs.push(`Avg in-range only ${effAvg.toFixed(0)}% — widen ranges (more bins_below) or extend <code>outOfRangeWaitMinutes</code> (now ${m.outOfRangeWaitMinutes ?? 30})`);
    }
  }

  // 5. Best-performing strategy — favor it when screening.
  const byStrat = {};
  for (const p of perf) {
    if (!p.strategy) continue;
    (byStrat[p.strategy] ??= []).push(p.pnl_pct);
  }
  const stratStats = Object.entries(byStrat)
    .filter(([, a]) => a.length >= 2)
    .map(([k, a]) => [k, mean(a)])
    .sort((a, b) => b[1] - a[1]);
  if (stratStats.length >= 2 && stratStats[0][1] > 0) {
    recs.push(`Best strategy: <b>${esc(stratStats[0][0])}</b> (avg PnL +${stratStats[0][1].toFixed(1)}%) — favor it in screening`);
  }

  // 6. Position sizing — scale risk with realized win rate.
  if (perf.length >= 6) {
    const winRate = winners.length / perf.length;
    const cur = m.positionSizePct ?? 0.35;
    if (winRate < 0.4 && cur > 0.2) {
      recs.push(`Win rate ${(winRate * 100).toFixed(0)}% — lower <code>positionSizePct</code> ${cur} → ${(cur * 0.8).toFixed(2)} until edge improves`);
    } else if (winRate > 0.65 && cur < 0.5) {
      recs.push(`Win rate ${(winRate * 100).toFixed(0)}% — room to raise <code>positionSizePct</code> ${cur} → ${Math.min(0.5, cur * 1.2).toFixed(2)} to compound faster`);
    }
  }

  if (recs.length === 0) return null;
  return ["💡 <b>Config Recommendations:</b>", ...recs.slice(0, 5).map((r) => `  • ${r}`)].join("\n");
}

const STATE_FILE = "./state.json";
const LESSONS_FILE = "./lessons.json";

function buildLlmCostSection(costData, balance, credits, netPnlUsd) {
  if (!costData && !balance && !credits) return null;
  const lines = ["<b>🤖 LLM Usage:</b>"];
  const cost24h = costData && costData.calls > 0 ? costData.totalCost : null;
  if (cost24h != null) {
    lines.push(`💸 24h cost: $${cost24h.toFixed(4)} (${costData.calls} calls, ${costData.totalTokens.toLocaleString()} tokens)`);
    const models = Object.entries(costData.byModel)
      .sort((a, b) => b[1].cost - a[1].cost);
    for (const [model, stats] of models) {
      const short = model.split("/").pop();
      lines.push(`  • ${esc(short)}: $${stats.cost.toFixed(4)} (${stats.calls} calls)`);
    }
  } else if (balance?.usageDaily != null) {
    lines.push(`💸 Today: $${balance.usageDaily.toFixed(4)}`);
    if (balance.usageWeekly != null) lines.push(`💸 This week: $${balance.usageWeekly.toFixed(4)}`);
    if (balance.usageMonthly != null) lines.push(`💸 This month: $${balance.usageMonthly.toFixed(2)}`);
  } else if (balance?.usage != null) {
    lines.push(`💸 Total spent: $${balance.usage.toFixed(4)}`);
  }
  // Bottom line: did today's trading cover the AI bill? Prefer the detailed
  // /activity cost; fall back to the account's usage_daily when /activity is empty.
  const todayCost = cost24h ?? (balance?.usageDaily ?? null);
  if (todayCost != null && Number.isFinite(netPnlUsd)) {
    const real = netPnlUsd - todayCost;
    const verdict = real >= 0 ? "✅ profit bersih" : "🔴 rugi setelah biaya AI";
    const money = (n) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
    lines.push(`📊 Net vs biaya LLM (24h): ${money(netPnlUsd)} − $${todayCost.toFixed(4)} = ${money(real)} ${verdict}`);
  }
  if (credits?.balance != null) {
    lines.push(`💳 Saldo OpenRouter: $${credits.balance.toFixed(2)}`);
    if (credits.balance < 5) lines.push(`⚠️ Saldo menipis — pertimbangkan top up`);
  } else if (balance?.remaining != null) {
    lines.push(`💳 Balance remaining: $${balance.remaining.toFixed(2)}`);
  }
  return lines.length > 1 ? lines.join("\n") : null;
}

function buildTimeProfileSection() {
  const prof = getHourlyProfile();
  if (!prof || prof.total_with_open_time < prof.min_samples) return null;

  const fmtHold = (m) => (m == null ? null : m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`);
  const overallHold = fmtHold(prof.overall_avg_hold_min);
  const header = `🕒 <b>Best Open Hours (WIB)</b> — overall win ${prof.overall_win_rate_pct}%${overallHold ? `, avg hold ${overallHold}` : ""}`;
  const lines = [header];
  const rated = prof.sessions.filter((s) => s.count > 0);
  if (rated.length === 0) return null;
  for (const s of rated) {
    const enough = s.count >= prof.min_samples;
    const tag = !enough ? " <i>(few samples)</i>" : "";
    const hold = fmtHold(s.avg_hold_min);
    lines.push(`  • ${esc(s.label)}: ${s.win_rate_pct}% win, avg ${s.avg_pnl_pct >= 0 ? "+" : ""}${s.avg_pnl_pct}% (${s.count})${hold ? `, hold ${hold}` : ""}${tag}`);
  }
  return lines.join("\n");
}

// 🧪 Experiment #8: counterfactual skip review. Gated by the flag (default off).
// Reports pools we passed on whose mcap later popped (the ones that got away) and
// how many fell (good skips). Fail-open — never breaks the briefing.
function buildSkipReviewSection() {
  if (!config.experiments?.counterfactualReview) return null;
  try {
    const review = getSkipReview({
      deployedPoolAddresses: getDeployedPoolAddresses(),
      minMcapGainPct: config.experiments.counterfactualMinMcapGainPct ?? 25,
    });
    if (!review || review.skipped === 0) return null;
    const lines = [
      `<b>🧪 Skip Review (recent):</b>`,
      `👀 Passed on ${review.skipped} pools — ${review.dropped} later fell (good skips)`,
    ];
    if (review.gainers.length > 0) {
      lines.push(
        ...review.gainers.map(
          (g) => `📈 ${esc(g.name)}: mcap ${g.mcap_delta_pct >= 0 ? "+" : ""}${g.mcap_delta_pct}% since first seen (~${g.span_min}m)`,
        ),
      );
    } else {
      lines.push("✅ None of the skipped pools popped meaningfully.");
    }
    return lines.join("\n");
  } catch (e) {
    log("briefing_error", `skip review failed: ${e.message}`);
    return null;
  }
}

export async function generateBriefing() {
  const state = loadJson(STATE_FILE) || { positions: {}, recentEvents: [] };
  const lessonsData = loadJson(LESSONS_FILE) || { lessons: [], performance: [] };

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Positions Activity
  const allPositions = Object.values(state.positions || {});
  const openedLast24h = allPositions.filter(p => new Date(p.deployed_at) > last24h);
  const closedLast24h = allPositions.filter(p => p.closed && new Date(p.closed_at) > last24h);

  // 2. Performance Activity (from performance log)
  const perfLast24h = (lessonsData.performance || []).filter(p => new Date(p.recorded_at) > last24h);
  const totalPnLUsd = perfLast24h.reduce((sum, p) => sum + (p.pnl_usd || 0), 0);
  const totalFeesUsd = perfLast24h.reduce((sum, p) => sum + (p.fees_earned_usd || 0), 0);

  // 3. Lessons Learned
  const lessonsLast24h = (lessonsData.lessons || []).filter(l => new Date(l.created_at) > last24h);

  // 4. Current State
  const openPositions = allPositions.filter(p => !p.closed);
  const perfSummary = getPerformanceSummary();

  // 5. LLM cost data
  const [costData, balance, credits] = await Promise.all([
    getOpenRouter24hCost(),
    getOpenRouterBalance(),
    getOpenRouterCredits(),
  ]);

  // 6. Format Message
  const lines = [
    "☀️ <b>Morning Briefing</b> (Last 24h)",
    "────────────────",
    `<b>Activity:</b>`,
    `📥 Positions Opened: ${openedLast24h.length}`,
    `📤 Positions Closed: ${closedLast24h.length}`,
    "",
    `<b>Performance:</b>`,
    `💰 Net PnL: ${totalPnLUsd >= 0 ? "+" : ""}$${totalPnLUsd.toFixed(2)}`,
    `💎 Fees Earned: $${totalFeesUsd.toFixed(2)}`,
    perfLast24h.length > 0
      ? `📈 Win Rate (24h): ${Math.round((perfLast24h.filter(p => p.pnl_usd > 0).length / perfLast24h.length) * 100)}%`
      : "📈 Win Rate (24h): N/A",
    "",
    `<b>Lessons Learned (24h):</b>`,
    lessonsLast24h.length > 0
      ? lessonsLast24h.map(l => `• ${esc(l.rule)}`).join("\n")
      : "• No new lessons recorded overnight.",
    "",
    `<b>Current Portfolio:</b>`,
    `📂 Open Positions: ${openPositions.length}`,
    perfSummary
      ? `📊 All-time PnL: $${perfSummary.total_pnl_usd.toFixed(2)}${perfSummary.roi_pct != null ? ` (${perfSummary.roi_pct >= 0 ? "+" : ""}${perfSummary.roi_pct}%)` : ""} | ${perfSummary.win_rate_pct}% win over ${perfSummary.total_positions_closed} closed`
      : "",
    "",
    buildLlmCostSection(costData, balance, credits, totalPnLUsd) || "",
    "",
    buildLearningSection(lessonsData, last24h) || "",
    "",
    buildTimeProfileSection() || "",
    "",
    buildSkipReviewSection() || "",
    "",
    buildRecommendations(lessonsData.performance) || "",
    "────────────────"
  ];

  // Collapse runs of blank lines left by skipped (null) sections.
  return lines.filter((l, i) => !(l === "" && lines[i - 1] === "")).join("\n");
}

function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    log("briefing_error", `Failed to read ${file}: ${err.message}`);
    return null;
  }
}
