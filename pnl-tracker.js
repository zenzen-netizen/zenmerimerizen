/**
 * pnl-tracker.js — windowed REALIZED-PnL + NET-of-cost tracker (1D / 7D / 30D).
 *
 * Visual sibling of sol-tracker.js, but answers a different question. The SOL
 * tracker shows raw wallet balance (polluted by deposits/withdrawals & capital
 * parked in positions). THIS tracks the bot's actual trading result:
 *   - Realized PnL = sum of pnl_usd of positions CLOSED inside the window
 *     (a flow, so each window is a cumulative sum — not a start-vs-now balance).
 *   - Net = realized PnL − operating cost (gas + LLM) over the same window, i.e.
 *     "did the bot make money after paying for its own brain + network fees?"
 *
 * Cost is REAL when captured (gas-tracker.js / llm-cost-tracker.js); gas falls
 * back to a per-trade lifecycle estimate when no on-chain capture exists, and is
 * only money-ised when a SOL price is supplied. Estimated figures are flagged ~.
 * Everything fail-open: a tracker error must never break the view it rides on.
 */

import { getGasStats } from "./gas-tracker.js";
import { getLlmCostStats } from "./llm-cost-tracker.js";
import { GAS_EST_SOL } from "./reports.js";

const PERIODS = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
];

// One position's typical on-chain lifecycle (deploy + close + auto-swap to SOL),
// used only when gas-tracker has no real capture for the window.
const PER_TRADE_GAS_SOL =
  GAS_EST_SOL.deploy_position + GAS_EST_SOL.close_position + GAS_EST_SOL.swap_token;

const closeTime = (p) => new Date(p.closed_at || p.recorded_at || 0).getTime();

/**
 * Per-window {realized, trades, gasUsd, llmUsd, costUsd, net, gasIsEst}.
 * @param perf closed-position records (lessons.json performance[])
 * @param solPriceUsd SOL→USD for gas; null → gas omitted from net (flagged)
 */
export function getPnlTracker(perf, { solPriceUsd = null, now = Date.now() } = {}) {
  const closed = (perf || []).filter((p) => p && Number.isFinite(p.pnl_usd) && closeTime(p) > 0);
  return PERIODS.map((pd) => {
    const startMs = now - pd.days * 86400000;
    const inWin = closed.filter((p) => closeTime(p) >= startMs);
    const realized = inWin.reduce((s, p) => s + p.pnl_usd, 0);
    const trades = inWin.length;

    // Gas: real capture preferred, else per-trade lifecycle estimate.
    let gasSol = 0, gasIsEst = true;
    try {
      const g = getGasStats(startMs);
      if (g?.hasData) { gasSol = g.sol; gasIsEst = false; }
      else gasSol = trades * PER_TRADE_GAS_SOL;
    } catch { gasSol = trades * PER_TRADE_GAS_SOL; }
    const gasUsd = solPriceUsd != null ? gasSol * solPriceUsd : null;

    // LLM: real per-call cost log (role-tagged), windowed.
    let llmUsd = null;
    try { const l = getLlmCostStats(startMs); if (l?.hasData) llmUsd = l.totalCost; } catch { /* fail-open */ }

    const costUsd = (gasUsd || 0) + (llmUsd || 0);
    const hasCost = gasUsd != null || llmUsd != null;
    return { label: pd.label, realized, trades, gasUsd, llmUsd, costUsd, net: realized - costUsd, hasCost, gasIsEst };
  });
}

function dot(n) { return n > 0 ? "🟢" : n < 0 ? "🔴" : "⚪"; }
function sd(n) { return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`; }

/**
 * Compact Telegram block (plain text). Net leads (the bottom line); realized PnL
 * + cost shown in parens so both numbers are visible — like the SOL tracker but
 * for trading result instead of wallet balance.
 */
export function formatPnlTracker(perf, opts = {}) {
  let rows;
  try { rows = getPnlTracker(perf, opts); } catch { return ""; }
  const lines = ["📊 Realized PnL & Net", "━━━━━━━━━━━━━━━━━"];
  let anyEst = false;
  const gasIncluded = rows.some((r) => r.gasUsd != null);
  for (const r of rows) {
    if (r.hasCost) {
      const tilde = r.gasIsEst && r.gasUsd != null ? "~" : "";
      if (r.gasIsEst && r.gasUsd != null) anyEst = true;
      lines.push(`${r.label.padEnd(3)} ${dot(r.net)} ${sd(r.net)} net  (PnL ${sd(r.realized)} − biaya ${tilde}$${r.costUsd.toFixed(2)} · ${r.trades} tr)`);
    } else {
      // No cost data at all → show realized only.
      lines.push(`${r.label.padEnd(3)} ${dot(r.realized)} ${sd(r.realized)} PnL  (${r.trades} tr)`);
    }
  }
  lines.push(`ℹ️ Net = PnL − ${gasIncluded ? "gas − " : ""}LLM${gasIncluded ? (anyEst ? " (~ = gas estimasi)" : "") : " (gas blm dihitung — tanpa harga SOL)"}`);
  return lines.join("\n");
}
