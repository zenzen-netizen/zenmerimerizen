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
import { getHourlyProfile, classifySession, getNarrativeProfile, classifyNarrative, sessionLabel } from "./lessons.js";
import { SEP, tree } from "./views/format.js"; // bahasa-desain tree-style (Batch C) — primitif murni, no cycle

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

  // Fee density — how hard the deployed capital works as FEES, independent of
  // price PnL. fee% = fees recovered per $ deployed; fee-APR annualizes that by
  // total in-range time (fees only accrue in range). Pure render metric — the
  // v2.1 question is whether the narrower bin range packs fees denser.
  // minutes_in_range falls back to minutes_held when absent.
  const inRangeMin = sum(fin(perf.map((p) => Number.isFinite(p.minutes_in_range) ? p.minutes_in_range : p.minutes_held)));
  const feePctCapital = invested > 0 ? (feesUsd / invested) * 100 : null;
  const feeAprPct = (feePctCapital != null && inRangeMin > 0) ? feePctCapital * (525600 / inRangeMin) : null;

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
  // peakAtMaxDD = the equity-curve peak at the moment of the worst drawdown, so we
  // can express the DD as a % of that peak (recovery_needed = 1/(1−DD%)−1).
  const chron = [...perf].sort((a, b) => new Date(a.closed_at || a.recorded_at || 0) - new Date(b.closed_at || b.recorded_at || 0));
  let cum = 0, peak = 0, maxDD = 0, peakAtMaxDD = 0;
  for (const p of chron) { cum += p.pnl_usd; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) { maxDD = dd; peakAtMaxDD = peak; } }
  // DD relative to the peak equity it ate into (only meaningful when peak > 0).
  const maxDDPct = peakAtMaxDD > 0 ? r2((maxDD / peakAtMaxDD) * 100) : null;

  // Worst single trade by $ (the tail) + what net would be without it — surfaces
  // how much one loser dominates the book (a render of the existing data).
  const worstUsdRow = [...losses].sort((a, b) => a.pnl_usd - b.pnl_usd)[0] || null;

  // Max consecutive losses (tail-risk awareness).
  let curLossStreak = 0, maxLossStreak = 0;
  for (const p of chron) {
    if (p.pnl_usd < 0) { curLossStreak++; if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak; }
    else curLossStreak = 0;
  }

  // ── PnL movement (peak/trough during the trade) — only records that carry it ──
  // Shows how much trades ran up before exit (give-back) and how deep they dipped.
  const withMove = perf.filter((p) => Number.isFinite(p.peak_pnl_pct) && Number.isFinite(p.pnl_pct));
  let movement = null;
  if (withMove.length >= 4) {
    const avgPeak = mean(withMove.map((p) => p.peak_pnl_pct));
    const avgExit = mean(withMove.map((p) => p.pnl_pct));
    const troughs = fin(withMove.map((p) => p.trough_pnl_pct));
    const leftOnTable = withMove.filter((p) => p.peak_pnl_pct - p.pnl_pct >= 5).length;
    movement = {
      samples: withMove.length,
      avg_peak_pct: r2(avgPeak),
      avg_exit_pct: r2(avgExit),
      avg_trough_pct: troughs.length ? r2(mean(troughs)) : null,
      giveback_pct: r2(avgPeak - avgExit),     // peak run-up not captured at exit
      left_on_table: leftOnTable,              // trades that gave back ≥5pp from peak
    };
  }

  // ── Raw PRICE excursion (token price vs entry, from bin movement) ──
  // Separate from the PnL pair above: this is how far PRICE ran up / drew down
  // while open, regardless of fees/IL. Winners' deepest dip (MAE — maximum
  // adverse excursion) is the key input for stop-loss tuning: an SL tighter
  // than what winners typically survive cuts winners; one far looser than any
  // winner ever needed just rides losers down.
  const withPrice = perf.filter((p) => Number.isFinite(p.price_peak_pct) && Number.isFinite(p.price_trough_pct));
  let priceMovement = null;
  if (withPrice.length >= 4) {
    const winnersP = withPrice.filter((p) => p.pnl_usd > 0);
    const losersP = withPrice.filter((p) => p.pnl_usd <= 0);
    priceMovement = {
      samples: withPrice.length,
      avg_peak_pct: r2(mean(withPrice.map((p) => p.price_peak_pct))),
      avg_trough_pct: r2(mean(withPrice.map((p) => p.price_trough_pct))),
      worst_trough_pct: r2(Math.min(...withPrice.map((p) => p.price_trough_pct))),
      best_peak_pct: r2(Math.max(...withPrice.map((p) => p.price_peak_pct))),
      win_avg_trough_pct: winnersP.length ? r2(mean(winnersP.map((p) => p.price_trough_pct))) : null,
      win_worst_trough_pct: winnersP.length ? r2(Math.min(...winnersP.map((p) => p.price_trough_pct))) : null,
      loss_avg_trough_pct: losersP.length ? r2(mean(losersP.map((p) => p.price_trough_pct))) : null,
    };
  }

  // Canonical close-rule per record, so the breakdown can show how much each
  // exit rule (SL / trailing / TP / OOR / …) contributes to the overall book.
  const perfWithRule = perf.map((p) => ({ ...p, close_rule: classifyCloseRule(p.close_reason) }));

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
    worst_trade_usd: worstUsdRow ? r2(worstUsdRow.pnl_usd) : null,
    worst_trade_name: worstUsdRow ? (worstUsdRow.pool_name || "?") : null,
    // Net the book would show WITHOUT the single worst loser — exposes tail dominance.
    net_excl_worst_usd: worstUsdRow ? r2(netUsd - worstUsdRow.pnl_usd) : r2(netUsd),
    fees_usd: r2(feesUsd),
    fee_pct_capital: feePctCapital != null ? r2(feePctCapital) : null,
    fee_apr_pct: feeAprPct != null ? Math.round(feeAprPct) : null,
    in_range_min_total: r2(inRangeMin),
    avg_hold_min: r2(mean(fin(perf.map((p) => p.minutes_held)))),
    avg_range_efficiency: r2(mean(fin(perf.map((p) => p.range_efficiency)))),
    max_drawdown_usd: r2(maxDD),
    max_drawdown_pct: maxDDPct,
    max_consecutive_losses: maxLossStreak,
    movement,
    price_movement: priceMovement,
    by_strategy: groupStats(perf, "strategy"),
    by_session: groupStats(perf, "open_session"),
    by_narrative: groupStats(perf, "narrative_category"),
    by_setup: groupStats(perf, "active_setup"),
    // Close rules are safety mechanisms, not choices to "do more of" — so unlike
    // the other breakdowns, rank them by absolute $ impact (|net|): which rule
    // moves the book the most, gain or leak. Per-row avg/trade still shows quality.
    by_close_rule: groupStats(perfWithRule, "close_rule")
      .sort((a, b) => Math.abs(b.net_usd ?? 0) - Math.abs(a.net_usd ?? 0)),
  };
}

/**
 * Map a free-text close_reason to a canonical exit rule. Reasons are messy
 * ("Trailing TP: Stop loss: PnL -12% <= -12%", "⚡ Trailing TP: Out of range…"),
 * so the SPECIFIC cause is matched before the generic trailing-TP wrapper the
 * exit pipeline prepends.
 */
export function classifyCloseRule(reason) {
  const r = String(reason || "").toLowerCase();
  if (!r) return "lainnya";
  if (r.includes("stop loss")) return "stopLoss";
  if (r.includes("out of range")) return "outOfRange (OOR)";
  if (r.includes("low yield")) return "lowYield (R5)";
  if (r.includes("take profit")) return "takeProfit (R2)";
  if (r.includes("pumped far above range") || r.includes("above range")) return "pumpedAboveRange (R3)";
  if (r.includes("indicator")) return "indicatorExit";
  if (r.includes("trailing tp") || (r.includes("dropped") && r.includes("peak"))) return "trailingTP";
  return "manual/lainnya";
}

/** PnL movement block (peak → exit give-back, trough). Null until data accrues. */
export function formatMovement(st) {
  const m = st?.movement;
  const pm = st?.price_movement;
  if (!m && !pm) return null;
  const out = [];
  if (m) {
    const b = [`avg peak ${pct(m.avg_peak_pct)} → avg exit ${pct(m.avg_exit_pct)} (give-back ${pct(m.giveback_pct)})`];
    if (m.avg_trough_pct != null) b.push(`avg trough (worst dip) ${pct(m.avg_trough_pct)}`);
    if (m.left_on_table > 0) b.push(`${m.left_on_table} trade(s) gave back ≥5pp from peak`);
    out.push(`<b>📈 PnL Movement (${m.samples} tracked):</b>`, tree(b));
  }
  if (pm) {
    const b = [`avg peak ${pct(pm.avg_peak_pct)} (best ${pct(pm.best_peak_pct)}) | avg drawdown ${pct(pm.avg_trough_pct)} (worst ${pct(pm.worst_trough_pct)})`];
    if (pm.win_avg_trough_pct != null) {
      b.push(`winners dipped avg ${pct(pm.win_avg_trough_pct)} (deepest ${pct(pm.win_worst_trough_pct)}) before recovering — SL must survive this`);
    }
    if (pm.loss_avg_trough_pct != null) {
      b.push(`losers dipped avg ${pct(pm.loss_avg_trough_pct)}`);
    }
    out.push(`<b>💹 Price Movement vs entry (${pm.samples} tracked):</b>`, tree(b));
  }
  return out.join("\n");
}

// Buckets carry an N-fair "score" = shrunk per-trade expectancy ($): each
// bucket's per-trade net is blended toward the GLOBAL per-trade net with weight
// SHRINK_K, so a 1-trade fluke can't top a 15-trade bucket, and total-net volume
// (more trades = bigger net) doesn't unfairly win. Ranked best-first by score.
const SHRINK_K = 5; // trades of "prior belief" pulling small samples to the mean
function groupStats(perf, key) {
  const buckets = {};
  for (const p of perf) {
    const k = p[key];
    if (!k) continue;
    (buckets[k] ??= []).push(p);
  }
  const globalAvg = perf.length ? sum(perf.map((p) => p.pnl_usd)) / perf.length : 0;
  return Object.entries(buckets)
    .map(([k, arr]) => {
      const net = sum(arr.map((p) => p.pnl_usd));
      return {
        key: k,
        count: arr.length,
        win_rate_pct: Math.round((arr.filter((p) => p.pnl_usd > 0).length / arr.length) * 100),
        avg_pnl_pct: r2(mean(fin(arr.map((p) => p.pnl_pct)))),
        net_usd: r2(net),
        avg_net_usd: r2(net / arr.length),
        score: r2((net + SHRINK_K * globalAvg) / (arr.length + SHRINK_K)),
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

const pf = (v) => (v === Infinity ? "∞" : v == null ? "?" : v.toFixed(2));

/**
 * Headline stats block (HTML). `label` describes the window (e.g. "All-time",
 * "Last 10", "This week").
 */
export function formatStatsBlock(st, label) {
  if (!st || st.count === 0) return `<b>📊 ${esc(label)}:</b> no closed positions yet`;
  const expPct = st.expectancy_pct != null ? ` (${pct(st.expectancy_pct)})` : "";
  // DD% is relative to the peak cumulative profit it ate into; only meaningful as
  // a percentage while ≤100% (a drawdown that exceeds the prior peak makes the
  // ratio explode — show the solid $ figure alone in that case).
  const ddPct = (st.max_drawdown_pct != null && st.max_drawdown_pct > 0 && st.max_drawdown_pct <= 100)
    ? ` (${pct(-st.max_drawdown_pct)} dari puncak)` : "";
  const header = `<b>📊 ${esc(label)} — ${st.count} closed</b>`;
  const body = [
    `💰 PnL: ${money(st.net_pnl_usd)}${st.roi_pct != null ? ` (${pct(st.roi_pct)} ROI)` : ""} | 💎 fees $${st.fees_usd.toFixed(2)}`,
    `🎯 Win ${st.win_rate_pct}% (${st.wins}W/${st.losses}L) | profit factor ${pf(st.profit_factor)} | expectancy ${money(st.expectancy_usd)}${expPct}/trade`,
    `⚖️ Avg win ${pct(st.avg_win_pct)} vs avg loss ${pct(st.avg_loss_pct)}${st.payoff_ratio != null ? ` (payoff ${st.payoff_ratio.toFixed(2)}×)` : ""}`,
    `📉 Max drawdown -$${(st.max_drawdown_usd ?? 0).toFixed(2)}${ddPct} | worst streak ${st.max_consecutive_losses}L | avg hold ${fmtHold(st.avg_hold_min)} | in-range ${st.avg_range_efficiency ?? "?"}%`,
  ];
  if (st.biggest_win) body.push(`🏆 Best: ${esc(st.biggest_win.name)} ${pct(st.biggest_win.pnl_pct)} | 💀 Worst: ${st.biggest_loss ? `${esc(st.biggest_loss.name)} ${pct(st.biggest_loss.pnl_pct)}` : "—"}`);
  // Tail dominance: the single worst loser in $ and what net would be without it.
  if (st.worst_trade_usd != null && st.worst_trade_usd < 0) {
    body.push(`🩸 Tail: trade terburuk ${esc(st.worst_trade_name)} ${money(st.worst_trade_usd)} → tanpa itu PnL ${money(st.net_excl_worst_usd)}`);
  }
  return [header, tree(body)].join("\n");
}

function fmtHold(m) {
  if (m == null) return "?";
  return m >= 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`;
}

/**
 * Quant edge block (HTML) — all derived from the stats already computed, no new
 * data. Surfaces the "is the edge real, and what's the cost drag" lens:
 *   • RR            = avg_win% / |avg_loss%| (reward-to-risk per trade)
 *   • break-even WR = 1/(RR+1) → "WR aktual X% vs impas Y% (±Zpp)"
 *   • EV/trade (R)  = WR·RR − (1−WR)  (>0 = positive expectancy)
 *   • cost-drag %/yr = annualized (gas+LLM) / modal × 100  — passed in by caller
 *     (reports.js stays config/cost-fetch free); healthy < `costDragHealthyMax`%
 *   • recovery_needed% from max drawdown = 1/(1−DD%)−1
 *   • SAMPLE FLAG: n < `noisyBelow` → "noisy ±10%, directional, jangan overfit"
 * Returns an HTML block or null on empty stats.
 */
export function formatQuantBlock(st, { costDragPct = null, costDragHealthyMax = 20, noisyBelow = 100 } = {}) {
  if (!st || st.count === 0) return null;
  const n = st.count;
  const noisy = n < noisyBelow;
  const header = `<b>🧮 Quant Edge${noisy ? ` — n=${n}` : ""}:</b>`;
  const body = [];

  // RR + break-even WR. No losses yet → RR effectively ∞, break-even 0%.
  const aw = st.avg_win_pct, al = st.avg_loss_pct;
  let rrStr = "?", beStr = "";
  if (al != null && al !== 0 && aw != null) {
    const rr = aw / Math.abs(al);
    const beWr = (1 / (rr + 1)) * 100;        // break-even win-rate, %
    const diff = st.win_rate_pct - beWr;       // actual minus break-even, pp
    const mark = diff >= 0 ? "✅" : "⚠️";
    rrStr = rr.toFixed(2);
    beStr = `break-even WR ${beWr.toFixed(0)}% vs aktual ${st.win_rate_pct}% (${diff >= 0 ? "+" : ""}${diff.toFixed(0)}pp ${mark})`;
  } else if (al == null || al === 0) {
    rrStr = "∞"; // no losing trades in window
    beStr = `break-even WR 0% vs aktual ${st.win_rate_pct}% (belum ada trade rugi)`;
  }
  body.push(`RR (avg win/loss) ${rrStr}${beStr ? ` | ${beStr}` : ""}`);

  // EV per trade in R units. WR·RR − (1−WR), with WR as a fraction.
  if (aw != null && al != null && al !== 0) {
    const wr = st.win_rate_pct / 100;
    const rr = aw / Math.abs(al);
    const evR = wr * rr - (1 - wr);
    const evMark = evR > 0 ? "✅ positif" : evR < 0 ? "🔴 negatif" : "⚪ impas";
    body.push(`EV/trade ${evR >= 0 ? "+" : ""}${evR.toFixed(2)}R (${evMark})`);
  }

  // Recovery needed from the max drawdown (gain required on current equity to
  // climb back to the prior peak): 1/(1−DD%)−1.
  if (st.max_drawdown_pct != null && st.max_drawdown_pct > 0 && st.max_drawdown_pct < 100) {
    const dd = st.max_drawdown_pct / 100;
    const recov = (1 / (1 - dd) - 1) * 100;
    body.push(`Max DD -$${(st.max_drawdown_usd ?? 0).toFixed(2)} (−${st.max_drawdown_pct.toFixed(0)}% dari puncak) → butuh +${recov.toFixed(0)}% buat pulih`);
  }

  // Fee density — income side (how hard capital works as fees), the counterpart
  // to cost-drag below. v2.1 lens: did narrower bins pack fees denser?
  if (Number.isFinite(st.fee_pct_capital)) {
    const aprStr = Number.isFinite(st.fee_apr_pct) ? ` · ~${st.fee_apr_pct}%/th in-range` : "";
    body.push(`💧 Fee-density ${st.fee_pct_capital}% modal-deploy${aprStr} (total fee $${(st.fees_usd ?? 0).toFixed(2)})`);
  }

  // Cost drag — only when the caller supplied it (it owns cost/wallet fetch).
  // Basis (modal) = total wallet USD (the capital you hold), distinct from the
  // fee-density basis above (deployed capital). Verdict sits OUTSIDE the threshold
  // note so "berat" no longer collides with "sehat" inside one parenthesis.
  if (Number.isFinite(costDragPct)) {
    const ok = costDragPct < costDragHealthyMax;
    const verdict = ok ? "✅ sehat" : "⚠️ berat";
    body.push(`Cost-drag ~${costDragPct.toFixed(0)}%/th (biaya jalan ÷ modal wallet) — ${verdict} (ambang <${costDragHealthyMax}%)`);
  }

  if (noisy) body.push(`<i>⚠️ n=${n} (<${noisyBelow}) — noisy ±10%, baca arah saja, jangan overfit angka.</i>`);
  return [header, tree(body)].join("\n");
}

/**
 * Annualized cost-drag %: (cost over window, scaled to a year) / capital × 100.
 * Pure helper so callers (briefing, /report) compute it from data they already
 * fetch (gas+LLM USD, window days, wallet USD). Returns null on bad inputs.
 */
export function computeCostDragPct({ costUsd, windowDays, modalUsd }) {
  if (!Number.isFinite(costUsd) || !Number.isFinite(modalUsd) || modalUsd <= 0) return null;
  if (!Number.isFinite(windowDays) || windowDays <= 0) return null;
  const annualCost = (costUsd / windowDays) * 365;
  return (annualCost / modalUsd) * 100;
}

/** Per-bucket breakdown block (strategy / session / narrative). */
export function formatBreakdown(st, opts = {}) {
  if (!st || st.count === 0) return null;
  const out = [];
  const block = (title, rows, { minCount = 1, keyFmt = (k) => k, maxRows = 5 } = {}) => {
    const shown = rows.filter((r) => r.count >= minCount).slice(0, maxRows);
    if (shown.length === 0) return;
    out.push(`<b>${title}</b>`);
    // tree branch conveys rank-order (best-first); row data unchanged.
    out.push(tree(shown.map((r) => `${esc(keyFmt(r.key))}: ${money(r.net_usd)} net, ${r.win_rate_pct}% win, avg/trade ${money(r.avg_net_usd)} (${r.count})`)));
  };
  block("📦 By strategy:", st.by_strategy);
  if (st.by_setup && st.by_setup.length) block("🗂️ By racikan:", st.by_setup);
  // Session keys render with their WIB hour range ("siang" → "11–15 siang").
  if (opts.sessions !== false) block("🕒 By session (WIB):", st.by_session, { keyFmt: sessionLabel });
  if (st.by_narrative.length) block("🏷️ By narrative:", st.by_narrative);
  // Exit-rule contribution: which hard-stop/close rule produced how much of the book.
  if (st.by_close_rule && st.by_close_rule.length) block("🛑 By close rule (urut dampak $):", st.by_close_rule, { maxRows: 8 });
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
    tree([
      `PnL: ${money(prior.net_pnl_usd)} → ${money(recent.net_pnl_usd)}${arrow(recent.net_pnl_usd, prior.net_pnl_usd)}`,
      `Win rate: ${prior.win_rate_pct}% → ${recent.win_rate_pct}%${arrow(recent.win_rate_pct, prior.win_rate_pct)}`,
      `Profit factor: ${pf(prior.profit_factor)} → ${pf(recent.profit_factor)}${arrow(recent.profit_factor === Infinity ? 99 : recent.profit_factor, prior.profit_factor === Infinity ? 99 : prior.profit_factor)}`,
    ]),
  ].join("\n");
}

/**
 * Profitability-aware recommendations. Unlike the old win-rate-only logic, this
 * refuses to recommend MORE size when the book is net-negative or profit factor
 * is weak, and surfaces the real leak (avg loss >> avg win, a weak bucket, a
 * single tail loss). Returns an HTML block or null.
 */
export function buildRecommendations(allPerf, st = null, opts = {}) {
  const perf = (allPerf || []).filter((p) => Number.isFinite(p.pnl_pct) && Number.isFinite(p.pnl_usd));
  if (perf.length < 4) return null;
  const stats = st || computeTradeStats(perf);
  const s = config.screening || {};
  const m = config.management || {};
  const recs = [];

  const netNeg = (stats.net_pnl_usd ?? 0) < 0;
  const weakPF = stats.profit_factor !== Infinity && stats.profit_factor != null && stats.profit_factor < 1.2;
  const lopsided = stats.payoff_ratio != null && stats.payoff_ratio < 1; // avg loss bigger than avg win

  // ── Anti-naive guard: would tightening the price stop CUT WINNERS? ──
  // If winners routinely survive deeper price dips than the average loser, a
  // tighter stopLossPct would stop out the eventual winners. In that regime we
  // must NOT recommend "tighten stopLoss / shorten OOR" — the leak is entry
  // quality (rug/dump screening), not the exit stop. winnersDipDeep encodes that.
  const pm = stats.price_movement;
  const winnersDipDeep = !!(pm && pm.win_worst_trough_pct != null && pm.loss_avg_trough_pct != null
    && pm.win_worst_trough_pct < pm.loss_avg_trough_pct); // winners' deepest dip is below losers' avg dip

  // ── Risk posture first — the lens the old briefing was missing ──
  if (netNeg || weakPF) {
    recs.push(`⚠️ PnL ${money(stats.net_pnl_usd)} with profit factor ${pf(stats.profit_factor)} — book is not profitable yet. <b>Do NOT scale up</b>; fix the leak before sizing up.`);
    const curSize = m.positionSizePct ?? 0.35;
    if (curSize > 0.25) recs.push(`Lower <code>positionSizePct</code> ${curSize} → ${(curSize * 0.8).toFixed(2)} until profit factor &gt; 1.5`);
  }
  if (lopsided) {
    if (winnersDipDeep) {
      // Cutting losers faster via a tighter price stop would also cut winners here.
      recs.push(`Avg loss (${pct(stats.avg_loss_pct)}) > avg win (${pct(stats.avg_win_pct)}). TAPI winners justru tahan dip lebih dalam (${pct(pm.win_worst_trough_pct)}) dari rata-rata loser (${pct(pm.loss_avg_trough_pct)}) — <b>jangan perketat stopLoss/OOR</b> (bakal motong pemenang). Bocornya di kualitas entry: perketat <b>screening rug/dump</b> (holder/bundler/likuiditas exit).`);
    } else {
      recs.push(`Avg loss (${pct(stats.avg_loss_pct)}) bigger than avg win (${pct(stats.avg_win_pct)}) — cut losers faster: tighten <code>stopLossPct</code> (now ${m.stopLossPct ?? "off"}) or shorten <code>outOfRangeWaitMinutes</code> (now ${m.outOfRangeWaitMinutes ?? 30})`);
    }
  }
  if (stats.biggest_loss && stats.biggest_loss.pnl_pct <= -30) {
    // A −50%+ single loss is almost always a rug/dump — a price stop fires too
    // late to help, so point at the rug screen, not the stop.
    if (stats.biggest_loss.pnl_pct <= -50 || winnersDipDeep) {
      recs.push(`Tail risk: trade terburuk ${esc(stats.biggest_loss.name)} ${pct(stats.biggest_loss.pnl_pct)} — sedalam ini biasanya rug/dump, <b>stop harga telat</b>. Perketat <b>screening rug</b> (holder/bundler/likuiditas exit), bukan stopLoss.`);
    } else {
      recs.push(`Tail risk: worst trade ${esc(stats.biggest_loss.name)} ${pct(stats.biggest_loss.pnl_pct)} — a hard <code>stopLossPct</code> would have capped it`);
    }
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

  // ── PnL movement → take-profit / trailing / stop tuning ──
  const mv = stats.movement;
  if (mv && mv.giveback_pct >= 3) {
    // Give-back = peak run-up not captured at exit. If avg peak never even reaches
    // the trailing TRIGGER, trailing never arms → the fix is LOWERING the trigger,
    // not the drop. Otherwise nudge trailing/TP generally.
    const trig = m.trailingTriggerPct;
    const peakBelowTrigger = m.trailingTakeProfit && trig != null && mv.avg_peak_pct != null && mv.avg_peak_pct < trig;
    if (peakBelowTrigger) {
      const target = Math.max(1, Math.floor(mv.avg_peak_pct));
      recs.push(`Give-back ~${pct(mv.giveback_pct)}: avg peak ${pct(mv.avg_peak_pct)} TAK pernah capai <code>trailingTriggerPct</code> ${trig}% → trailing tak pernah aktif. Turunkan trigger ke ~${target}% biar ngunci sebelum harga balik (jangan sentuh stop harga).`);
    } else {
      const tp = m.trailingTakeProfit ? "rapatkan" : "nyalakan";
      recs.push(`Tinggalin ~${pct(mv.giveback_pct)} di meja (avg peak ${pct(mv.avg_peak_pct)} → exit ${pct(mv.avg_exit_pct)}) — ${tp} trailing TP (<code>trailingTriggerPct</code>/<code>trailingDropPct</code>) atau naikin <code>takeProfitPct</code> biar ngunci dekat puncak`);
    }
  }
  if (mv && mv.avg_trough_pct != null && mv.avg_trough_pct <= -10) {
    // Only suggest a tighter stop when winners DON'T need the room — else it cuts them.
    if (winnersDipDeep) {
      recs.push(`Trades dip avg ${pct(mv.avg_trough_pct)} sebelum exit, tapi winners pulih dari dip lebih dalam (${pct(pm.win_worst_trough_pct)}) — <b>jangan</b> perketat <code>stopLossPct</code>, itu motong pemenang. Tail dalam = kasus rug → perketat screening.`);
    } else {
      recs.push(`Trades dip avg ${pct(mv.avg_trough_pct)} sebelum exit & winners pulih dari dip lebih dangkal — <code>stopLossPct</code> lebih ketat bisa nutup drawdown dalam tanpa motong banyak pemenang`);
    }
  }

  // ── Gas efficiency — fixed gas vs %-based profit (only meaningful if gas is real & material) ──
  if (opts.gasPerTradeUsd > 0 && stats.avg_win_usd > 0 && opts.gasPerTradeUsd >= stats.avg_win_usd * 0.3) {
    const eat = (opts.gasPerTradeUsd / stats.avg_win_usd) * 100;
    recs.push(`Gas ~$${opts.gasPerTradeUsd.toFixed(4)}/trade eats ${eat.toFixed(0)}% of the avg win ($${stats.avg_win_usd.toFixed(2)}) — size up or trade less so %-profit dwarfs fixed gas`);
  }

  // Only suggest scaling UP when genuinely earning it.
  if (!netNeg && !weakPF && stats.win_rate_pct > 60 && (stats.profit_factor === Infinity || stats.profit_factor >= 1.5)) {
    const cur = m.positionSizePct ?? 0.35;
    if (cur < 0.5) recs.push(`Profitable (PF ${pf(stats.profit_factor)}, win ${stats.win_rate_pct}%) — room to raise <code>positionSizePct</code> ${cur} → ${Math.min(0.5, cur * 1.2).toFixed(2)} to compound`);
  }

  if (recs.length === 0) return null;
  return ["💡 <b>Recommendations:</b>", tree(recs.slice(0, 7))].join("\n");
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
    verdict = `✅ Sehat — PnL ${money(st.net_pnl_usd)}, profit factor ${pf(pfv)}. Edge nyata; pertahankan & boleh compounding pelan.`;
  } else if ((st.net_pnl_usd ?? 0) >= 0) {
    verdict = `🟡 Tipis — PnL ${money(st.net_pnl_usd)} tapi profit factor cuma ${pf(pfv)}. Untung rapuh; jangan gedein size, perbaiki rasio menang/kalah dulu.`;
  } else if (st.win_rate_pct >= 60) {
    verdict = `🔴 Jebakan win-rate — menang ${st.win_rate_pct}% TAPI PnL ${money(st.net_pnl_usd)}. Masalahnya rugi besar (avg loss ${pct(st.avg_loss_pct)} vs avg win ${pct(st.avg_win_pct)}), bukan sering kalah. Fokus: potong rugi lebih cepat.`;
  } else {
    verdict = `🔴 Belum profit — PnL ${money(st.net_pnl_usd)}, win ${st.win_rate_pct}%, profit factor ${pf(pfv)}. Perketat screening & exit sebelum nambah modal.`;
  }
  return `<b>🧭 Verdict:</b> ${verdict}`;
}

/**
 * Compose a full trade report (HTML) from a windowed set of performance records.
 * Shared by the milestone learning report, the /report command, and the
 * weekly/monthly digests — they differ only in which records they pass in and
 * the title/labels. Returns null when there's nothing to say.
 */
export function buildTradeReport(perf, { title, subtitle = null, statsLabel = "Summary", trendN = 10, includeBreakdown = true, includeTrend = true, identity = null, quant = null } = {}) {
  const records = (perf || []).filter((p) => p && Number.isFinite(p.pnl_usd));
  const idLine = identity ? `${identity}\n` : ""; // 🧬 Profil + 🗂️ Racikan, passed by caller (keeps this module config-free)
  if (records.length === 0) return `<b>${esc(title || "Trade Report")}</b>\n${subtitle ? `<i>${esc(subtitle)}</i>\n` : ""}${idLine}No closed positions in this window yet.`;
  const st = computeTradeStats(records);
  const parts = [`<b>${esc(title)}</b>`, ...(subtitle ? [`<i>${esc(subtitle)}</i>`] : []), ...(identity ? [identity] : []), SEP, formatStatsBlock(st, statsLabel)];
  const verdict = buildVerdict(st); if (verdict) parts.push(verdict);
  const quantBlock = formatQuantBlock(st, quant || {}); if (quantBlock) parts.push("", quantBlock);
  if (includeTrend) { const t = formatTrend(records, trendN); if (t) parts.push("", t); }
  const mv = formatMovement(st); if (mv) parts.push("", mv);
  if (includeBreakdown) { const b = formatBreakdown(st); if (b) parts.push("", b); }
  const recs = buildRecommendations(records, st); if (recs) parts.push("", recs);
  parts.push(SEP);
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
