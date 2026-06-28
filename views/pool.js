/**
 * views/pool.js — renderer /pool <n> (Phase 3 🅴). Render-only.
 *
 * Cross-check §C /pool (index.js:3654-3681) — SEMUA field dipertahankan:
 *   idx+pair · Pool addr · Position addr · Range efficiency block (Range bins+bin_step,
 *   Active-bin bar "N dari bawah/ke atas", State IN/OOR+menit, In-range approx
 *   "in ~Xh / OOR-spell Ym") · PnL% · fees · value · Age · rent/held(+estimasi) · Note.
 * Tambah (governing #1 boleh nambah, sejajar pilot 💧): 💰 PnL delta uang + 💧 fee-density.
 *
 * Unit: value/fees pakai *_usd mode-correct (fmtMoney ikut solMode). PnL delta
 * fmtMoneySigned solMode-aware. Held selalu ◎ (SOL intrinsik).
 *
 * Label "In-range (approx)" SENGAJA dipertahankan apa adanya (bukan dibuat seolah
 * pasti) — over-state utk posisi yang sering OOR-balik (recon §E-257). rangeEffLines
 * dibangun di index.js (buildRangeEfficiencyLines) lalu di-embed di sini.
 */

import {
  ICON, SEP, tree, esc,
  fmtMoney, fmtMoneySigned, fmtSol, fmtPct, fmtAge, fmtBothFromMode, pnlMark,
} from "./format.js";

/**
 * @param input {
 *   cfg, idx, pair, inRange, poolAddr, positionAddr,
 *   pnlPct, pnlVal, value, fees, collectedFees, unclaimedFees, ageMin,
 *   heldSol, heldEst, note, rangeEffLines, solPrice  // array dari buildRangeEfficiencyLines
 * }
 */
export function buildView(input) {
  const solMode = !!input.cfg?.management?.solMode;
  // Fee density so far: (collected+unclaimed)/value × 100 — sama dgn /positions
  // (BUKAN annualized; APR proper di /report). Hanya bila value>0 && fees>0.
  const feesSoFar = (input.collectedFees ?? 0) + (input.unclaimedFees ?? 0);
  let feeDensityPct = null;
  if (Number.isFinite(input.value) && input.value > 0 && feesSoFar > 0) {
    feeDensityPct = (feesSoFar / input.value) * 100;
  }
  return { type: "pool", solMode, feeDensityPct, ...input };
}

export function telegram(vm) {
  const { solMode } = vm;
  const status = vm.inRange ? `${ICON.inRange} IN range` : `${ICON.oor} OOR`;
  const pctStr = fmtPct(vm.pnlPct) || "?";

  const out = [
    `${ICON.range} Pool #${vm.idx + 1} — ${esc(vm.pair || "?")} · ${status}`,
    SEP,
  ];

  out.push(tree([
    `${pnlMark(vm.pnlVal)} PnL: ${pctStr} · ${fmtBothFromMode(vm.pnlVal, solMode, vm.solPrice, true)}`,
    `${ICON.value} Value: ${fmtBothFromMode(vm.value, solMode, vm.solPrice, false)} · fees ${fmtMoney(vm.fees, solMode)}`,
    vm.feeDensityPct != null ? `${ICON.fee} fee-density: ${vm.feeDensityPct.toFixed(2)}%` : null,
    `${ICON.time} Age: ${fmtAge(vm.ageMin)}`,
    vm.heldSol != null ? `${ICON.held} ${fmtSol(vm.heldSol, 4)} held${vm.heldEst ? " (estimasi)" : ""} · refund saat close` : null,
  ]));

  // Range efficiency — embed penuh (detail tak boleh hilang).
  if (vm.rangeEffLines && vm.rangeEffLines.length) {
    out.push(SEP, `${ICON.range} Range efficiency`, ...vm.rangeEffLines.map((l) => esc(l)));
  }

  // Identitas pool + note.
  out.push(SEP, `🔖 Pool: ${esc(vm.poolAddr ?? "?")}`, `🔖 Position: ${esc(vm.positionAddr ?? "?")}`);
  if (vm.note) out.push(`📝 Note: ${esc(vm.note)}`);
  return out.join("\n");
}