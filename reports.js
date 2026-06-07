/**
 * reports.js — shared trade-analytics engine for all reports.
 *
 * One place computes the rich metrics; the daily briefing, the milestone
 * learning report, the weekly/monthly digests, and the on-demand /report command
 * all consume it. Pure functions over an array of closed-position performance
 * records (the shape stored in lessons.json `performance[]`).
 *
 * Why this exists: the old briefing keyed advice off win-rate alone, which is
 * misleading — you can win 73% of trades and still be net-negative if a few
 * losers are huge. Everything here is built around the profitability lens
 * (profit factor, avg win vs avg loss, expectancy, drawdown), not just win-rate.
 */

import { config } from "./config.js";
import { getHourlyProfile, classifySession, getNarrativeProfile, classifyNarrative } from "./lessons.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fin = (arr) => arr.filter((n) => Number.isFinite(n));
const sum = (arr) => arr.reduce((s, x) => s + x, 0);
const mean = (arr) => (arr.length ? sum(arr) / arr.length : null);
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const money = (n) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
const pct = (n) => (n == null ? "?" : `${n >= 0 ? "+" : ""}${r2(n)}%`);

/**
 * Compute a full statistics object from a list of closed-position records.
 * Records without a finite pnl_usd are ignored. Safe on empty input.
 */
export function computeTradeStats(records = []) {
  const perf = (records || []).filter((p) => p && Number.isFinite(p.pnl_usd));
  const n = perf.length;
  if (n === 0) return { count: 0 };

  const wins = perf.filter((p) => p.pnl_usd > 0);
  const losses = perf.filter((p) => p.pnl_usd < 0);

  const netUsd = sum(perf.map((p) => p.pnl_usd));
  const invested = sum(fin(perf.map((p) => p.initial_value_usd)));
  const grossProfit = sum(wins.map((p) => p.pnl_usd));
  const grossLoss = Math.abs(sum(losses.map((p) => p.pnl_usd)));
  const feesUsd = sum(fin(perf.map((p) => p.fees_earned_usd)));

  const winPcts = fin(wins.map((p) => p.pnl_pct));
  const lossPcts = fin(losses.map((p) => p.pnl_pct));
  const avgWinUsd = mean(wins.map((p) => p.pnl_usd));
  const avgLossUsd = mean(losses.map((p) => p.pnl_usd)); // negative

  // Biggest single win / loss (by %), with names for context.
  const byPct = [...perf].filter((p) => Number.isFinite(p.pnl_pct)).sort((a, b) => a.pnl_pct - b.pnl_pct);
  const biggestLoss = byPct[0] && byPct[0].pnl_pct < 0
    ? { name: byPct[0].pool_name || "?", pnl_pct: r2(byPct[0].pnl_pct), pnl_usd: r2(byPct[0].pnl_usd) } : null;
  const biggestWin = byPct.length && byPct[byPct.length - 1].pnl_pct > 0
    ? { name: byPct[byPct.length - 1].pool_name || "?", pnl_pct: r2(byPct[byPct.length - 1].pnl_pct), pnl_usd: r2(byPct[byPct.length - 1].pnl_usd) } : null;

  // Max drawdown over the equity curve (cumulative pnl_usd, chronological).
  const chron = [...perf].sort((a, b) => new Date(a.closed_at || a.recorded_at || 0) - new Date(b.closed_at || b.recorded_at || 0));
  let cum = 0, peak = 0, maxDD = 0;
  for (const p of chron) { cum += p.pnl_usd; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) maxDD = dd; }

  // Max consecutive losses (tail-risk awareness).
  let curLossStreak = 0, maxLossStreak = 0;
  for (const p of chron) {
    if (p.pnl_usd < 0) { curLossStreak++; if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak; }
    else curLossStreak = 0;
  }

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null);
  const payoffRatio = (avgWinUsd != null && avgLossUsd != null && avgLossUsd !== 0)
    ? avgWinUsd / Math.abs(avgLossUsd) : null;

  return {
    count: n,
    wins: wins.length,
    losses: losses.length,
    win_rate_pct: Math.round((wins.length / n) * 100),
    net_pnl_usd: r2(netUsd),
    invested_usd: r2(invested),
    roi_pct: invested > 0 ? r2((netUsd / invested) * 100) : null,
    gross_profit_usd: r2(grossProfit),
    gross_loss_usd: r2(grossLoss),
    profit_factor: profitFactor === Infinity ? Infinity : r2(profitFactor),
    avg_win_pct: r2(mean(winPcts)),
    avg_loss_pct: r2(mean(lossPcts)),
    avg_win_usd: r2(avgWinUsd),
    avg_loss_usd: r2(avgLossUsd),
    payoff_ratio: r2(payoffRatio),
    expectancy_usd: r2(mean(perf.map((p) => p.pnl_usd))),
    expectancy_pct: r2(mean(fin(perf.map((p) => p.pnl_pct)))),
    biggest_win: biggestWin,
    biggest_loss: biggestLoss,
    fees_usd: r2(feesUsd),
    avg_hold_min: r2(mean(fin(perf.map((p) => p.minutes_held)))),
    avg_range_efficiency: r2(mean(fin(perf.map((p) => p.range_efficiency)))),
    max_drawdown_usd: r2(maxDD),
    max_consecutive_losses: maxLossStreak,
    by_strategy: groupStats(perf, "strategy"),
    by_session: groupStats(perf, "open_session"),
    by_narrative: groupStats(perf, "narrative_category"),
  };
}

// Per-bucket {count, win_rate_pct, avg_pnl_pct, net_usd} sorted best-first by net.
function groupStats(perf, key) {
  const buckets = {};
  for (const p of perf) {
    const k = p[key];
    if (!k) continue;
    (buckets[k] ??= []).push(p);
  }
  return Object.entries(buckets)
    .map(([k, arr]) => ({
      key: k,
      count: arr.length,
      win_rate_pct: Math.round((arr.filter((p) => p.pnl_usd > 0).length / arr.length) * 100),
      avg_pnl_pct: r2(mean(fin(arr.map((p) => p.pnl_pct)))),
      net_usd: r2(sum(arr.map((p) => p.pnl_usd))),
    }))
    .sort((a, b) => (b.net_usd ?? 0) - (a.net_usd ?? 0));
}

const pf = (v) => (v === Infinity ? "∞" : v == null ? "?" : v.toFixed(2));

/**
 * Headline stats block (HTML). `label` describes the window (e.g. "All-time",
 * "Last 10", "This week").
 */
export function formatStatsBlock(st, label) {
  if (!st || st.count === 0) return `<b>📊 ${esc(label)}:</b> no closed positions yet`;
  const lines = [
    `<b>📊 ${esc(label)} — ${st.count} closed</b>`,
    `💰 Net: ${money(st.net_pnl_usd)}${st.roi_pct != null ? ` (${pct(st.roi_pct)} ROI)` : ""} | 💎 fees $${st.fees_usd.toFixed(2)}`,
    `🎯 Win ${st.win_rate_pct}% (${st.wins}W/${st.losses}L) | profit factor ${pf(st.profit_factor)} | expectancy ${money(st.expectancy_usd)}/trade`,
    `⚖️ Avg win ${pct(st.avg_win_pct)} vs avg loss ${pct(st.avg_loss_pct)}${st.payoff_ratio != null ? ` (payoff ${st.payoff_ratio.toFixed(2)}×)` : ""}`,
    `📉 Max drawdown -$${(st.max_drawdown_usd ?? 0).toFixed(2)} | worst streak ${st.max_consecutive_losses}L | avg hold ${fmtHold(st.avg_hold_min)} | in-range ${st.avg_range_efficiency ?? "?"}%`,
  ];
  if (st.biggest_win) lines.push(`🏆 Best: ${esc(st.biggest_win.name)} ${pct(st.biggest_win.pnl_pct)} | 💀 Worst: ${st.biggest_loss ? `${esc(st.biggest_loss.name)} ${pct(st.biggest_loss.pnl_pct)}` : "—"}`);
  return lines.join("\n");
}

function fmtHold(m) {
  if (m == null) return "?";
  return m >= 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`;
}

/** Per-bucket breakdown block (strategy / session / narrative). */
export function formatBreakdown(st, opts = {}) {
  if (!st || st.count === 0) return null;
  const out = [];
  const block = (title, rows, minCount = 1) => {
    const shown = rows.filter((r) => r.count >= minCount).slice(0, 5);
    if (shown.length === 0) return;
    out.push(`<b>${title}</b>`);
    for (const r of shown) {
      out.push(`  • ${esc(r.key)}: ${money(r.net_usd)} net, ${r.win_rate_pct}% win, avg ${pct(r.avg_pnl_pct)} (${r.count})`);
    }
  };
  block("📦 By strategy:", st.by_strategy);
  if (opts.sessions !== false) block("🕒 By session (WIB):", st.by_session);
  if (st.by_narrative.length) block("🏷️ By narrative:", st.by_narrative);
  return out.length ? out.join("\n") : null;
}

/**
 * Trend block: compares the most recent N closes against the prior N. The
 * "is my edge improving?" view — the heart of the milestone review.
 */
export function formatTrend(allPerf, n) {
  const chron = (allPerf || []).filter((p) => Number.isFinite(p.pnl_usd))
    .sort((a, b) => new Date(a.closed_at || a.recorded_at || 0) - new Date(b.closed_at || b.recorded_at || 0));
  if (chron.length < n * 2) return null;
  const recent = computeTradeStats(chron.slice(-n));
  const prior = computeTradeStats(chron.slice(-n * 2, -n));
  const arrow = (a, b) => (a == null || b == null ? "" : a > b ? " 📈" : a < b ? " 📉" : " ➡️");
  return [
    `<b>📈 Trend — last ${n} vs prior ${n}:</b>`,
    `  Net: ${money(prior.net_pnl_usd)} → ${money(recent.net_pnl_usd)}${arrow(recent.net_pnl_usd, prior.net_pnl_usd)}`,
    `  Win rate: ${prior.win_rate_pct}% → ${recent.win_rate_pct}%${arrow(recent.win_rate_pct, prior.win_rate_pct)}`,
    `  Profit factor: ${pf(prior.profit_factor)} → ${pf(recent.profit_factor)}${arrow(recent.profit_factor === Infinity ? 99 : recent.profit_factor, prior.profit_factor === Infinity ? 99 : prior.profit_factor)}`,
  ].join("\n");
}

/**
 * Profitability-aware recommendations. Unlike the old win-rate-only logic, this
 * refuses to recommend MORE size when the book is net-negative or profit factor
 * is weak, and surfaces the real leak (avg loss >> avg win, a weak bucket, a
 * single tail loss). Returns an HTML block or null.
 */
export function buildRecommendations(allPerf, st = null) {
  const perf = (allPerf || []).filter((p) => Number.isFinite(p.pnl_pct) && Number.isFinite(p.pnl_usd));
  if (perf.length < 4) return null;
  const stats = st || computeTradeStats(perf);
  const s = config.screening || {};
  const m = config.management || {};
  const recs = [];

  const netNeg = (stats.net_pnl_usd ?? 0) < 0;
  const weakPF = stats.profit_factor !== Infinity && stats.profit_factor != null && stats.profit_factor < 1.2;
  const lopsided = stats.payoff_ratio != null && stats.payoff_ratio < 1; // avg loss bigger than avg win

  // ── Risk posture first — the lens the old briefing was missing ──
  if (netNeg || weakPF) {
    recs.push(`⚠️ Net ${money(stats.net_pnl_usd)} with profit factor ${pf(stats.profit_factor)} — book is not profitable yet. <b>Do NOT scale up</b>; fix the leak before sizing up.`);
    const curSize = m.positionSizePct ?? 0.35;
    if (curSize > 0.25) recs.push(`Lower <code>positionSizePct</code> ${curSize} → ${(curSize * 0.8).toFixed(2)} until profit factor &gt; 1.5`);
  }
  if (lopsided) {
    recs.push(`Avg loss (${pct(stats.avg_loss_pct)}) bigger than avg win (${pct(stats.avg_win_pct)}) — cut losers faster: tighten <code>stopLossPct</code> (now ${m.stopLossPct ?? "off"}) or shorten <code>outOfRangeWaitMinutes</code> (now ${m.outOfRangeWaitMinutes ?? 30})`);
  }
  if (stats.biggest_loss && stats.biggest_loss.pnl_pct <= -30) {
    recs.push(`Tail risk: worst trade ${esc(stats.biggest_loss.name)} ${pct(stats.biggest_loss.pnl_pct)} — a hard <code>stopLossPct</code> would have capped it`);
  }

  // ── Dimension tweaks (same data the auto-evolver doesn't fully cover) ──
  const winners = perf.filter((p) => p.pnl_pct > 0);
  const losers = perf.filter((p) => p.pnl_pct < -5);

  const wFee = fin(winners.map((p) => p.fee_tvl_ratio));
  if (wFee.length >= 2) {
    const minWinFee = Math.min(...wFee);
    const cur = s.minFeeActiveTvlRatio ?? 0.05;
    if (minWinFee > cur * 1.3) recs.push(`Raise <code>minFeeActiveTvlRatio</code> ${cur} → ~${(minWinFee * 0.85).toFixed(2)} (worst winner fee/TVL ${minWinFee.toFixed(2)})`);
  }
  const wBin = fin(winners.map((p) => p.bin_step)), lBin = fin(losers.map((p) => p.bin_step));
  if (wBin.length >= 2 && lBin.length >= 2 && mean(lBin) - mean(wBin) >= 10) {
    recs.push(`Lower <code>maxBinStep</code> toward ~${Math.round(mean(wBin) + 10)} (losers avg bin_step ${mean(lBin).toFixed(0)} vs winners ${mean(wBin).toFixed(0)})`);
  }
  if ((stats.avg_range_efficiency ?? 100) < 50) {
    recs.push(`Avg in-range only ${stats.avg_range_efficiency}% — widen ranges (more bins_below) or raise <code>outOfRangeWaitMinutes</code> (now ${m.outOfRangeWaitMinutes ?? 30})`);
  }

  // Best/worst buckets — favor winners, avoid losers.
  const bestStrat = stats.by_strategy.filter((b) => b.count >= 2 && b.net_usd > 0)[0];
  if (bestStrat) recs.push(`Best strategy: <b>${esc(bestStrat.key)}</b> (${money(bestStrat.net_usd)} net, avg ${pct(bestStrat.avg_pnl_pct)}) — favor it`);
  const worstStrat = [...stats.by_strategy].filter((b) => b.count >= 2).reverse()[0];
  if (worstStrat && worstStrat.net_usd < 0 && (!bestStrat || worstStrat.key !== bestStrat.key)) {
    recs.push(`Avoid strategy <b>${esc(worstStrat.key)}</b> (${money(worstStrat.net_usd)} net over ${worstStrat.count})`);
  }

  // Weak time-of-day / narrative buckets from the dedicated classifiers.
  try {
    const prof = getHourlyProfile();
    const weakSessions = (prof?.sessions || []).filter((x) => classifySession(x.key) === "weak").map((x) => x.label);
    if (weakSessions.length) recs.push(`Weak sessions (WIB): ${weakSessions.map(esc).join(", ")} — screen less aggressively there`);
  } catch { /* fail-open */ }
  try {
    const np = getNarrativeProfile();
    const weakNarr = (np?.categories || []).filter((c) => classifyNarrative(c.category) === "weak").map((c) => c.category);
    if (weakNarr.length) recs.push(`Weak narratives: ${weakNarr.map(esc).join(", ")} — be stricter on these`);
  } catch { /* fail-open */ }

  // Only suggest scaling UP when genuinely earning it.
  if (!netNeg && !weakPF && stats.win_rate_pct > 60 && (stats.profit_factor === Infinity || stats.profit_factor >= 1.5)) {
    const cur = m.positionSizePct ?? 0.35;
    if (cur < 0.5) recs.push(`Profitable (PF ${pf(stats.profit_factor)}, win ${stats.win_rate_pct}%) — room to raise <code>positionSizePct</code> ${cur} → ${Math.min(0.5, cur * 1.2).toFixed(2)} to compound`);
  }

  if (recs.length === 0) return null;
  return ["💡 <b>Recommendations:</b>", ...recs.slice(0, 7).map((r) => `  • ${r}`)].join("\n");
}

/**
 * A short narrative verdict — the "review" the user asked for. Plain-language
 * read of the book's health, derived from the same stats.
 */
export function buildVerdict(st) {
  if (!st || st.count < 4) return null;
  const pfv = st.profit_factor;
  let verdict;
  if ((st.net_pnl_usd ?? 0) >= 0 && (pfv === Infinity || (pfv ?? 0) >= 1.5)) {
    verdict = `✅ Sehat — net ${money(st.net_pnl_usd)}, profit factor ${pf(pfv)}. Edge nyata; pertahankan & boleh compounding pelan.`;
  } else if ((st.net_pnl_usd ?? 0) >= 0) {
    verdict = `🟡 Tipis — net ${money(st.net_pnl_usd)} tapi profit factor cuma ${pf(pfv)}. Untung rapuh; jangan gedein size, perbaiki rasio menang/kalah dulu.`;
  } else if (st.win_rate_pct >= 60) {
    verdict = `🔴 Jebakan win-rate — menang ${st.win_rate_pct}% TAPI net ${money(st.net_pnl_usd)}. Masalahnya rugi besar (avg loss ${pct(st.avg_loss_pct)} vs avg win ${pct(st.avg_win_pct)}), bukan sering kalah. Fokus: potong rugi lebih cepat.`;
  } else {
    verdict = `🔴 Belum profit — net ${money(st.net_pnl_usd)}, win ${st.win_rate_pct}%, profit factor ${pf(pfv)}. Perketat screening & exit sebelum nambah modal.`;
  }
  return `<b>🧭 Verdict:</b> ${verdict}`;
}

/**
 * Compose a full trade report (HTML) from a windowed set of performance records.
 * Shared by the milestone learning report, the /report command, and the
 * weekly/monthly digests — they differ only in which records they pass in and
 * the title/labels. Returns null when there's nothing to say.
 */
export function buildTradeReport(perf, { title, statsLabel = "Summary", trendN = 10, includeBreakdown = true, includeTrend = true } = {}) {
  const records = (perf || []).filter((p) => p && Number.isFinite(p.pnl_usd));
  if (records.length === 0) return `<b>${esc(title || "Trade Report")}</b>\nNo closed positions in this window yet.`;
  const st = computeTradeStats(records);
  const parts = [`<b>${esc(title)}</b>`, "────────────────", formatStatsBlock(st, statsLabel)];
  const verdict = buildVerdict(st); if (verdict) parts.push(verdict);
  if (includeTrend) { const t = formatTrend(records, trendN); if (t) parts.push("", t); }
  if (includeBreakdown) { const b = formatBreakdown(st); if (b) parts.push("", b); }
  const recs = buildRecommendations(records, st); if (recs) parts.push("", recs);
  parts.push("────────────────");
  return parts.filter((l) => l != null).join("\n");
}

/**
 * Rough per-action Solana network-fee estimate (SOL), used ONLY as a fallback
 * until real per-tx fees accrue in gas-log.json. Calibrated to MEASURED on-chain
 * fees (median ~0.000005 SOL/tx = base fee, avg ~0.000017; a deploy is a few txs).
 * Earlier defaults were ~100× too high — Solana base fees are tiny and the bot
 * pays little/no priority fee. Real capture (gas-tracker.js) overrides this.
 */
export const GAS_EST_SOL = {
  deploy_position: 0.00004, // ~2-3 txs
  close_position: 0.00003,
  claim_fees: 0.000015,
  swap_token: 0.000015,
};

/** Estimated gas (SOL) from a map of { tool: count }. */
export function estimateGasSol(counts = {}) {
  return Object.entries(GAS_EST_SOL).reduce((s, [tool, perSol]) => s + (counts[tool] || 0) * perSol, 0);
}

/**
 * LLM cost broken down per agent ROLE. OpenRouter only reports cost per MODEL, so
 * we map each model back to the role(s) that use it (screening/management/general).
 * Precise when roles use distinct models (the usual case); when two roles share a
 * model we can't split it, so it's labelled an estimate. Returns lines[] or null.
 */
export function buildRoleCostLines(costData) {
  if (!costData || !costData.byModel || costData.calls === 0) return null;
  const roleOf = {
    [config.llm.screeningModel]: "Screening",
    [config.llm.managementModel]: "Management",
    [config.llm.generalModel]: "General",
  };
  // Detect collisions (a model used by >1 role) → those attributions are estimates.
  const modelRoleCount = {};
  for (const role of ["screeningModel", "managementModel", "generalModel"]) {
    const mdl = config.llm[role];
    modelRoleCount[mdl] = (modelRoleCount[mdl] || 0) + 1;
  }
  const lines = [];
  let anyEstimate = false;
  for (const [model, stats] of Object.entries(costData.byModel).sort((a, b) => b[1].cost - a[1].cost)) {
    const role = roleOf[model];
    const short = esc(model.split("/").pop());
    if (role) {
      const shared = modelRoleCount[model] > 1;
      if (shared) anyEstimate = true;
      lines.push(`  • ${role}${shared ? " (est, shared model)" : ""} [${short}]: $${stats.cost.toFixed(4)} (${stats.calls} calls)`);
    } else {
      lines.push(`  • Other [${short}]: $${stats.cost.toFixed(4)} (${stats.calls} calls)`);
    }
  }
  if (anyEstimate) lines.push(`  <i>(roles sharing a model can't be split precisely — shown combined)</i>`);
  return lines;
}
