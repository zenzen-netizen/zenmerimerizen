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

// FASE 3: flat exit-swap haircut. A single-side-SOL position that drifts below range
// accumulates base token; closing it auto-swaps base→SOL (Jupiter), paying price-impact
// + swap fee. We model that as a flat % of the base value being sold (entry needs no
// swap — SOL is deposited directly). Flat proxy: real impact depends on pool depth (a
// live Jupiter quote would refine it — out of scope). Tunable via the slippagePct param.
export const PAPER_EXIT_SLIPPAGE_PCT = 0.01; // 1% of the swapped-out base value

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
 *   feeYieldPerWindow  TRUE per-window fee yield = fee/active_tvl (a FRACTION, not the
 *                      ×100 fee_active_tvl_ratio percentage). Caller supplies the matching
 *                      windowMinutes. See paper-fix-progress.md FASE 1.
 *   minutesInRange / minutesHeld
 *   windowMinutes the window feeYieldPerWindow was measured over, in minutes
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
  feeYieldPerWindow,
  minutesInRange,
  minutesHeld,
  windowMinutes,
  gasDragSol = 0,   // FASE 2: est. round-trip gas (deploy+close+claim+swap), SOL
  slippagePct = PAPER_EXIT_SLIPPAGE_PCT, // FASE 3: exit-swap haircut on base sold at close
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

  // ── Slippage (FASE 3): exit-swap haircut on the accumulated base ─────
  // The base side (baseValueSol) must be swapped back to SOL at close; that swap
  // pays price-impact + fee. Fully in-range (no base) → 0. Frictional, not free.
  const slipPct = clamp(fin(slippagePct), 0, 0.5);
  const slippageSol = Math.max(0, baseValueSol) * slipPct;

  // ── Fees: deposit × per-window fee yield × (in-range time / window) ──────
  // feeYieldPerWindow is the TRUE fraction fee/active_tvl (caller already converted
  // the ×100 fee_active_tvl_ratio, or used raw fee/active_tvl). An LP earns ≈ its
  // pro-rata share of pool fees = deposit × (fee/active_tvl) over that window; we
  // accrue pro-rata to in-range minutes. windowMinutes must match the window the
  // yield was measured over (caller passes 24h→1440 by default). See FASE 1.
  const fy = Math.max(0, fin(feeYieldPerWindow));
  const win = Math.max(1, fin(windowMinutes, 1440));
  const mir = Math.max(0, fin(minutesInRange));
  // Defensive cap only — with correct scaling this should never bind (a daily fee
  // yield > 50% of deposit would be a data anomaly, not a real pool).
  const feesSol = clamp(deposit * fy * (mir / win), 0, deposit * 0.5);

  // ── Costs (FASE 2 gas; FASE 3 adds slippage) + PnL decomposition (FASE 4) ──
  // "Edge before costs" = the raw LP outcome (fee yield + IL/price). "After costs"
  // nets the frictions a real round-trip pays (gas now, slippage later) so paper PnL
  // can predict live PnL instead of an idealized frictionless number.
  const gas = Math.max(0, fin(gasDragSol));
  const costsSol = gas + slippageSol;
  const pnlBeforeCostsSol = ilSol + feesSol;
  const pnlSol = pnlBeforeCostsSol - costsSol;
  const pnlPct = deposit > 0 ? (pnlSol / deposit) * 100 : 0;

  return {
    in_range: inRange,
    price_move_pct: round(priceMovePct, 2),
    fill_frac: round(fillFrac, 3),
    fees_sol: round(feesSol, 6),
    il_sol: round(ilSol, 6),
    gas_drag_sol: round(gas, 6),
    slippage_sol: round(slippageSol, 6),
    costs_sol: round(costsSol, 6),
    pnl_before_costs_sol: round(pnlBeforeCostsSol, 6),
    pnl_sol: round(pnlSol, 6),
    pnl_pct: round(pnlPct, 2),
    position_value_sol: round(positionValueSol + feesSol, 6),
    // USD mirrors (sol_price may be 0 if the price feed is down → USD fields 0).
    fees_usd: round(feesSol * sp, 4),
    il_usd: round(ilSol * sp, 4),
    gas_drag_usd: round(gas * sp, 4),
    slippage_usd: round(slippageSol * sp, 4),
    costs_usd: round(costsSol * sp, 4),
    pnl_before_costs_usd: round(pnlBeforeCostsSol * sp, 4),
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

/**
 * FASE 4 — classify the SOURCE of a paper position's edge: did it earn from
 * harvesting fees, or from price luck (IL/price moving favorably)? Looks at the
 * pre-cost split (fee vs IL/price). Answers "racikan untung dari panen-fee atau
 * hoki-harga?". Pure read of a metrics object.
 */
export function classifyPaperEdge(m) {
  const fee = Number(m?.fees_usd) || 0;
  const il = Number(m?.il_usd) || 0;
  const before = Number(m?.pnl_before_costs_usd ?? fee + il);
  if (before <= 0) {
    return il < 0 ? "rugi — fee tak nutup drag IL/harga" : "rugi — kalah di ongkos";
  }
  if (il >= 0) return fee >= il ? "panen-fee (fee > efek harga)" : "hoki-harga (efek harga > fee)";
  return "panen-fee (fee menutup drag IL/harga)"; // il<0 tapi net positif → fee yang menanggung
}

/**
 * FASE 4 — human-readable PnL decomposition for a paper close. Splits PnL into
 * fee / IL-price / slippage / gas, and shows "edge sebelum ongkos" vs "sesudah
 * ongkos" so the bench separates real LP edge from frictions. USD-denominated.
 */
export function formatPaperDecomposition(m) {
  if (!m) return "";
  const usd = (x) => { const n = Number(x) || 0; return `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(4)}`; };
  const init = Number(m.initial_value_usd) || 0;
  const pct = (x) => (init > 0 ? ` (${((Number(x) || 0) / init * 100).toFixed(2)}%)` : "");
  return [
    "🧪 Dekomposisi PnL (simulasi):",
    `  Fee (panen):       ${usd(m.fees_usd)}`,
    `  IL / harga:        ${usd(m.il_usd)}`,
    `  ── Edge sblm ongkos: ${usd(m.pnl_before_costs_usd)}${pct(m.pnl_before_costs_usd)}`,
    `  Slippage exit:     ${usd(-Math.abs(Number(m.slippage_usd) || 0))}`,
    `  Gas round-trip:    ${usd(-Math.abs(Number(m.gas_drag_usd) || 0))}`,
    `  ── Edge stlh ongkos: ${usd(m.pnl_usd)}${pct(m.pnl_usd)}`,
    `  Sumber: ${classifyPaperEdge(m)}`,
    "  (LLM = ongkos global, lihat /briefing — bukan per-trade)",
  ].join("\n");
}
