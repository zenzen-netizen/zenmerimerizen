/**
 * views/positions.js — renderer /positions (PILOT Phase 2 workstream 🅴).
 *
 * Render-only. Logika ambil data (getMyPositions, getPositionsRentSol) tetap di
 * index.js — di sini cuma view-model netral + render tree.
 *
 * Cross-check field vs versi inline lama (index.js:3624-3663) — SEMUA dipertahankan:
 *   pair · state(in-range/OOR+menit) · value · PnL(%+delta) · fees(unclaimed) ·
 *   age · bins · 💧 fee-density · rent/held(+est) · footer total-held(+sebagian est,
 *   "refund saat close") · hint "/close <n> · /pool <n> · /set <n> <note>".
 * Ikon disegarkan ke bahasa desain (🟢/🔴/💼/⚡) — info tak ada yang hilang.
 *
 * Unit uang: field `*_usd` SUDAH mode-correct (SOL saat solMode on) → `fmtMoney`
 * cuma kasih simbol. Rent/held selalu ◎ (SOL intrinsik), JANGAN dikonversi.
 */

import {
  ICON, SEP, tree, numEmoji, esc,
  fmtMoney, fmtMoneySigned, fmtSol, fmtPct, fmtAge, fmtBothFromMode, pnlMark,
} from "./format.js";

/**
 * View-model netral-format dari data posisi mentah.
 * @param {Array} positions  array dari getMyPositions().positions
 * @param {object} cfg        config (untuk solMode)
 * @param {object} rentMap    { [position]: { sol, estimated } } (rent on-chain)
 * @param {number|null} solPrice  harga SOL (USD) untuk dual-unit display; null → fail-open 1-unit
 */
export function buildView(positions, cfg, rentMap = {}, solPrice = null) {
  const solMode = !!cfg?.management?.solMode;
  let totalHeldSol = 0, anyHeldEst = false;

  const items = (positions || []).map((p) => {
    const rent = rentMap[p.position];
    let heldSol = null, heldEst = false;
    if (rent && Number.isFinite(rent.sol)) {
      heldSol = rent.sol;
      heldEst = !!rent.estimated;
      totalHeldSol += rent.sol;
      if (rent.estimated) anyHeldEst = true;
    }

    const bins = (Number.isFinite(p.lower_bin) && Number.isFinite(p.upper_bin))
      ? (p.upper_bin - p.lower_bin + 1)
      : null;

    // Fee density so far: (collected+unclaimed)/value × 100 — % modal kembali jadi
    // fee. BUKAN annualized (APR proper di /report). Hanya bila value>0 && fees>0.
    const feesSoFar = (p.collected_fees_usd ?? 0) + (p.unclaimed_fees_usd ?? 0);
    let feeDensityPct = null;
    if (Number.isFinite(p.total_value_usd) && p.total_value_usd > 0 && feesSoFar > 0) {
      feeDensityPct = (feesSoFar / p.total_value_usd) * 100;
    }

    return {
      pair: p.pair,
      inRange: !!p.in_range,                       // null/false → OOR (sama dgn lama)
      oorMin: p.in_range ? null : (p.minutes_out_of_range ?? 0),
      value: p.total_value_usd ?? null,            // mode-correct
      pnlVal: p.pnl_usd ?? 0,                       // mode-correct (delta uang)
      pnlPct: p.pnl_pct ?? null,
      fees: p.unclaimed_fees_usd ?? null,          // mode-correct (unclaimed, sama dgn lama)
      ageMin: p.age_minutes ?? null,
      bins,
      feeDensityPct,
      heldSol,
      heldEst,
    };
  });

  return { type: "positions", solMode, solPrice, count: items.length, items, totalHeldSol, anyHeldEst };
}

/** Render view-model → string HTML (tree desain). */
export function telegram(vm) {
  const { solMode } = vm;
  const out = [
    `${ICON.position} Open Positions (${vm.count})`,
    SEP,
  ];

  vm.items.forEach((it, i) => {
    const state = it.inRange
      ? `${ICON.inRange} IN range`
      : `${ICON.oor} OOR ${it.oorMin ?? 0}m`;
    out.push(`${numEmoji(i + 1)} ${esc(it.pair || "?")} · ${state}`);

    const pctStr = fmtPct(it.pnlPct);
    out.push(tree([
      `${pnlMark(it.pnlVal)} PnL: ${pctStr ? pctStr + " · " : ""}${fmtBothFromMode(it.pnlVal, solMode, vm.solPrice, true)}`,
      `${ICON.value} Value: ${fmtBothFromMode(it.value, solMode, vm.solPrice, false)} · fees ${fmtMoney(it.fees, solMode)}`,
      `${ICON.time} Age: ${fmtAge(it.ageMin)} · ${it.bins ?? "?"} bins`,
      it.feeDensityPct != null ? `${ICON.fee} fee ${it.feeDensityPct.toFixed(2)}%` : null,
      it.heldSol != null ? `${ICON.held} ${fmtSol(it.heldSol)} held${it.heldEst ? " (est)" : ""}` : null,
    ]));
  });

  out.push(SEP);
  out.push(`${ICON.held} ${fmtSol(vm.totalHeldSol)} total held${vm.anyHeldEst ? " (sebagian est)" : ""} — refund saat close`);
  // esc(): hint memuat "<n>"/"<note>" → escape biar Telegram HTML parser tak nolak
  // (unsupported tag). render.js "plain" men-decode balik entity utk REPL.
  out.push(`${ICON.bolt} ${esc("/close <n> · /pool <n> · /set <n> <note>")}`);
  return out.join("\n");
}