// paper-trading.js — DRY-RUN-ONLY virtual position simulation.
//
// When config.experiments.paperTrading is ON *and* DRY_RUN=true, a would-deploy
// is tracked as a real record in state.json (via trackPosition) instead of
// vanishing. dlmm.js then routes getMyPositions / getPositionPnl / closePosition
// through the helpers here so the full lifecycle runs in simulation.
//
// This file is PURE MATH — it imports config only, never the Meteora SDK, so it
// stays free of circular deps and is unit-testable. dlmm.js does all on-chain
// price reads and feeds them in. Off / live = none of this runs (factory).
//
// Accuracy contract (be honest — this is what we promise the user):
//   EXACT      : entry timing, in-range/OOR (read from on-chain active bin).
//   APPROXIMATE: fees (proxy = deposit × fee/TVL ratio × time-in-range) and IL
//                (first-order single-side-SOL fill model). NOT a profit forecast.

import { config } from "./config.js";

/** Paper mode is the AND of the experiment flag and dry-run. Never on when live. */
export function isPaperMode() {
  return process.env.DRY_RUN === "true" && config.experiments?.paperTrading === true;
}

/** Stable-ish synthetic id for a virtual position (no on-chain pubkey exists). */
export function makePaperPositionId(poolAddress = "") {
  const slice = String(poolAddress).slice(0, 8) || "pool";
  return `paper_${slice}_${Date.now().toString(36)}`;
}

/** Parse a screening timeframe like "30m" / "5m" / "1h" into minutes (fallback 30). */
export function timeframeMinutes(tf) {
  const m = String(tf ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*([mhd])?$/i);
  if (!m) return 30;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return 30;
  const unit = (m[2] || "m").toLowerCase();
  return unit === "h" ? n * 60 : unit === "d" ? n * 1440 : n;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const fin = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

/**
 * First-order simulation of a single-side SOL-below DLMM position.
 *
 * Inputs (all from data we already hold; prices read on-chain by the caller):
 *   entryPrice    SOL/base at the active bin when we deployed
 *   currentPrice  SOL/base now
 *   lowerPrice    SOL/base at the bottom bin of our range
 *   lowerBin/upperBin/currentBin   bin ids (upperBin = entry active bin)
 *   amountSol     deposit (quote) size
 *   solPrice      USD per SOL (for USD fields)
 *   feeTvlRatio   pool fee / active-TVL over the screening window
 *   minutesInRange / minutesHeld
 *   windowMinutes screening timeframe in minutes
 *
 * Returns a normalized metrics object consumed by dlmm.js. Fees only accrue while
 * in range; IL comes from SOL converted to base as price fell through the range.
 */
export function simulatePaperMetrics({
  entryPrice,
  currentPrice,
  lowerPrice,
  lowerBin,
  upperBin,
  currentBin,
  amountSol,
  solPrice,
  feeTvlRatio,
  minutesInRange,
  minutesHeld,
  windowMinutes,
}) {
  const deposit = Math.max(0, fin(amountSol));
  const sp = Math.max(0, fin(solPrice));
  const ep = fin(entryPrice);
  const cp = fin(currentPrice);
  const lp = fin(lowerPrice, ep);

  const inRange = currentBin != null && lowerBin != null && upperBin != null
    ? currentBin >= lowerBin && currentBin <= upperBin
    : null;
  const priceMovePct = ep > 0 ? (cp / ep - 1) * 100 : 0;

  // ── IL: single-side SOL-below fill model (in SOL terms) ──────────────
  // fillFrac = fraction of our SOL converted to base as price fell through the
  // range from the top (entry). 0 at/above entry, 1 fully OOR below.
  const spanBins = upperBin != null && lowerBin != null ? Math.max(1, upperBin - lowerBin) : 1;
  const crossedBins = upperBin != null && currentBin != null
    ? clamp(upperBin - currentBin, 0, spanBins)
    : 0;
  const fillFrac = clamp(crossedBins / spanBins, 0, 1);
  const remainingSol = deposit * (1 - fillFrac);
  const solSpent = deposit * fillFrac;
  // Avg SOL/base paid over the crossed region ≈ midpoint of entry and the lower
  // of (currentPrice, lowerPrice). Mark the acquired base at currentPrice.
  const avgFillPrice = Math.max((ep + Math.min(cp > 0 ? cp : ep, lp)) / 2, 1e-12);
  const baseAcquired = avgFillPrice > 0 ? solSpent / avgFillPrice : 0;
  const baseValueSol = baseAcquired * (cp > 0 ? cp : 0);
  const positionValueSol = remainingSol + baseValueSol;
  const ilSol = positionValueSol - deposit;

  // ── Fees: proxy = deposit × fee/TVL ratio × (in-range time / window) ──
  // fee_active_tvl_ratio from the Meteora feed behaves as a ~24h fee/TVL rate
  // (e.g. 0.19 on a $277K pool = ~$52K/day in fees, plausible for a hot pool —
  // NOT per-screening-window, which would be absurd). So the window is 24h and
  // fees accrue pro-rata to in-range minutes. Capped so a coarse proxy can't
  // mint runaway fees on a long hold.
  const ftr = Math.max(0, fin(feeTvlRatio));
  const win = Math.max(1, fin(windowMinutes, 1440));
  const mir = Math.max(0, fin(minutesInRange));
  // Cap the time multiplier so a long-held position can't accrue absurd fees
  // from a coarse proxy; 0.5 = at most half the deposit in simulated fees.
  const feesSol = clamp(deposit * ftr * (mir / win), 0, deposit * 0.5);

  const pnlSol = ilSol + feesSol;
  const pnlPct = deposit > 0 ? (pnlSol / deposit) * 100 : 0;

  return {
    in_range: inRange,
    price_move_pct: round(priceMovePct, 2),
    fill_frac: round(fillFrac, 3),
    fees_sol: round(feesSol, 6),
    il_sol: round(ilSol, 6),
    pnl_sol: round(pnlSol, 6),
    pnl_pct: round(pnlPct, 2),
    position_value_sol: round(positionValueSol + feesSol, 6),
    // USD mirrors (sol_price may be 0 if the price feed is down → USD fields 0).
    fees_usd: round(feesSol * sp, 4),
    pnl_usd: round(pnlSol * sp, 4),
    initial_value_usd: round(deposit * sp, 4),
    position_value_usd: round((positionValueSol + feesSol) * sp, 4),
    minutes_in_range: Math.round(mir),
    minutes_held: Math.round(Math.max(0, fin(minutesHeld))),
  };
}

function round(v, d = 4) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
