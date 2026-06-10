// SMI (Stochastic Momentum Index) — client-side TA computed from the full
// candles[] OHLCV array the chart-indicators API already returns. The server
// does NOT compute SMI, so everything here is pure and self-contained.
//
// Used by the `supertrend_plus_smi` entry preset (chart-indicators.js):
//   confirmed(entry) = supertrend_break AND (PathA OR PathB)
//     PathA "topping → roll over": a cross-down (smi crosses below smiEma) in the
//       last `crossWindow` candles, while smi>MID at the cross, preceded by a PD
//       trigger within `pdLookback` candles BEFORE the cross-down.
//     PathB "already accumulating": a PA trigger within the last `paLookback`
//       candles.
//
// Phase machine (1-candle '==' events, anti-starvation):
//   aCnt = consecutive candles smi>MID, bCnt = consecutive candles smi<MID.
//   PD trigger = aCnt == distCandles (default 2)  → pre-distribution (top).
//   PA trigger = bCnt == akumCandles (default 2)  → pre-accumulation (bottom).

const DEFAULTS = {
  lenK: 5, // stochastic lookback for highest-high / lowest-low
  lenD: 3, // first/second EMA smoothing length on rel & rng
  lenE: 3, // EMA length for the smiEma signal line
  mid: 0, // SMI midline
  distCandles: 2, // PD fires when aCnt hits this
  akumCandles: 2, // PA fires when bCnt hits this
  pdLookback: 5, // PD must occur within this many candles BEFORE the cross-down
  paLookback: 3, // PA must occur within the last this-many candles (PathB)
  crossWindow: 3, // cross-down must be within the last this-many candles (PathA)
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Pine-style ta.ema: first defined value seeds with the source, then recursive.
// `values` may contain leading nulls (warmup); output is same-length with nulls
// preserved until the first finite input.
function ema(values, length) {
  const alpha = 2 / (length + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      out[i] = prev; // hold last (no new input this bar)
      continue;
    }
    prev = prev == null ? v : alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

// Compute the full smi & smiEma series from candles. Returns null entries during
// the lenK warmup window.
function computeSmiSeries(candles, opts) {
  const { lenK, lenD, lenE } = opts;
  const n = candles.length;
  const high = candles.map((c) => num(c.high));
  const low = candles.map((c) => num(c.low));
  const close = candles.map((c) => num(c.close));

  const rel = new Array(n).fill(null);
  const rng = new Array(n).fill(null);
  for (let i = lenK - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    let bad = false;
    for (let j = i - lenK + 1; j <= i; j++) {
      if (high[j] == null || low[j] == null) { bad = true; break; }
      if (high[j] > hh) hh = high[j];
      if (low[j] < ll) ll = low[j];
    }
    if (bad || close[i] == null) continue;
    rel[i] = close[i] - (hh + ll) / 2;
    rng[i] = hh - ll;
  }

  // Double-smoothed numerator/denominator, then SMI = 200 * num / den.
  const relSmooth = ema(ema(rel, lenD), lenD);
  const rngSmooth = ema(ema(rng, lenD), lenD);
  const smi = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (relSmooth[i] == null || rngSmooth[i] == null || rngSmooth[i] === 0) continue;
    smi[i] = (200 * relSmooth[i]) / rngSmooth[i];
  }
  const smiEma = ema(smi, lenE);
  return { smi, smiEma };
}

/**
 * Evaluate the SMI entry logic over a candles[] array.
 * @returns {{ok:boolean, confirmed:boolean, pathA:boolean, pathB:boolean,
 *            reason:string, smi:?number, smiEma:?number}}
 */
export function evaluateSmi(candles, options = {}) {
  const opts = { ...DEFAULTS, ...(options || {}) };
  if (!Array.isArray(candles) || candles.length < opts.lenK + 2) {
    return { ok: false, confirmed: false, pathA: false, pathB: false, reason: "insufficient candles for SMI", smi: null, smiEma: null };
  }

  const { smi, smiEma } = computeSmiSeries(candles, opts);
  const n = smi.length;
  const mid = opts.mid;

  // Replay the phase machine + record trigger / cross events per candle.
  const pd = new Array(n).fill(false); // PD trigger (aCnt == distCandles)
  const pa = new Array(n).fill(false); // PA trigger (bCnt == akumCandles)
  const crossDown = new Array(n).fill(false); // crossunder(smi, smiEma) with smi>mid
  let aCnt = 0;
  let bCnt = 0;
  let lastDefined = -1; // index of previous candle with defined smi/smiEma
  for (let i = 0; i < n; i++) {
    if (smi[i] == null) continue;
    if (smi[i] > mid) { aCnt += 1; bCnt = 0; }
    else if (smi[i] < mid) { bCnt += 1; aCnt = 0; }
    else { aCnt = 0; bCnt = 0; }
    if (aCnt === opts.distCandles) pd[i] = true;
    if (bCnt === opts.akumCandles) pa[i] = true;
    if (
      lastDefined >= 0 && smiEma[i] != null && smiEma[lastDefined] != null && smi[lastDefined] != null &&
      smi[lastDefined] >= smiEma[lastDefined] && smi[i] < smiEma[i] && smi[i] > mid
    ) {
      crossDown[i] = true;
    }
    lastDefined = i;
  }

  const last = n - 1;

  // PathA: cross-down within the last crossWindow candles, preceded by a PD
  // trigger within pdLookback candles BEFORE that cross-down (PD strictly first).
  let pathA = false;
  let pathAReason = "";
  for (let j = last; j >= Math.max(0, last - opts.crossWindow + 1); j--) {
    if (!crossDown[j]) continue;
    for (let k = j - 1; k >= Math.max(0, j - opts.pdLookback); k--) {
      if (pd[k]) {
        pathA = true;
        pathAReason = `cross-down @${last - j} ago (smi>${mid}) after PD @${j - k} before it`;
        break;
      }
    }
    if (pathA) break;
  }

  // PathB: a PA trigger within the last paLookback candles.
  let pathB = false;
  let pathBReason = "";
  for (let k = last; k >= Math.max(0, last - opts.paLookback + 1); k--) {
    if (pa[k]) {
      pathB = true;
      pathBReason = `PA @${last - k} ago`;
      break;
    }
  }

  const confirmed = pathA || pathB;
  const reason = confirmed
    ? `SMI ${[pathA ? `PathA(${pathAReason})` : null, pathB ? `PathB(${pathBReason})` : null].filter(Boolean).join(" / ")}`
    : "SMI no PathA/PathB";

  return { ok: true, confirmed, pathA, pathB, reason, smi: smi[last], smiEma: smiEma[last] };
}

export const SMI_DEFAULTS = DEFAULTS;
