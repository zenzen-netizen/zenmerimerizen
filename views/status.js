/**
 * views/status.js — renderer /status (Phase 3 🅴). Render-only.
 *
 * Komposit (cross-check §C /status, index.js:3547-3611 — SEMUA field dipertahankan):
 *   wallet block (Saldo+price+posisi+per-slot+bebas+held) · All-time PnL+ROI ·
 *   Learning win%/avg · last good/bad lesson (condensed) · realized PnL tracker (1D/7D/30D) ·
 *   excluded-racikan disclosure · dry-run · HiveMind · OpenRouter saldo(+today+low-warn) ·
 *   hint /positions.
 *
 * FIX #12: wallet block ikut solMode lewat walletBlockLines (lihat wallet.js). All-time
 * PnL pakai fmtMoneySigned solMode-aware (persis `cur` lama). OpenRouter + realized
 * tracker + disclosure = USD by-design, di-embed apa adanya (string pre-built di index.js).
 *
 * Reorder vs versi lama (struktur, bukan pengurangan): Wallet → Performa → realized →
 * Insight → Sistem(dry-run/hive/OpenRouter) → hint. OpenRouter & "use /positions"
 * pindah seksi; semua data tetap ada.
 */

import { ICON, SEP, tree, fmtWib, fmtMoneySigned, fmtBothSigned, fmtPct } from "./format.js";
import { walletBlockLines, systemLines } from "./wallet.js";

/**
 * @param input {
 *   cfg, nowMs?,
 *   sol, solUsd, solPrice, totalPositions, maxPositions, deployAmount, gasReserve,
 *   heldSol, heldEst, dryRun, hive, orLines,            // shared wallet/system
 *   pnlBlock, disclosure,                                // embedded (string)
 *   perf, lastGoodRule, lastBadRule                      // status-only
 * }
 */
export function buildView(input) {
  const solMode = !!input.cfg?.management?.solMode;
  return { type: "status", solMode, nowMs: input.nowMs ?? Date.now(), ...input };
}

export function telegram(vm) {
  const { solMode } = vm;
  const out = [`${ICON.status} Status · ${fmtWib(vm.nowMs)}`, SEP];

  // 👛 Wallet
  out.push(`${ICON.wallet} Wallet`);
  out.push(tree(walletBlockLines({
    solMode, sol: vm.sol, solUsd: vm.solUsd, solPrice: vm.solPrice,
    totalPositions: vm.totalPositions, maxPositions: vm.maxPositions,
    deployAmount: vm.deployAmount, gasReserve: vm.gasReserve,
    heldSol: vm.heldSol, heldEst: vm.heldEst,
  })));

  // 📈 Performa (All-time PnL + Learning) — hanya bila ada data closed.
  if (vm.perf) {
    out.push(SEP, `${ICON.perf} Performa · ${vm.perf.total_positions_closed} closed`);
    const roi = fmtPct(vm.perf.roi_pct);
    const pnlUsd = vm.perf.total_pnl_usd;
    const pnlStr = (vm.solPrice && vm.solPrice > 0)
      ? fmtBothSigned(pnlUsd, pnlUsd / vm.solPrice, solMode)   // dua unit, benar di kedua mode
      : fmtMoneySigned(pnlUsd, false);                          // solPrice unknown → paksa label $ (JANGAN ◎)
    out.push(tree([
      `${ICON.pnl} All-time: ${pnlStr}${roi ? ` (${roi})` : ""}`,
      `${ICON.rule} Win ${vm.perf.win_rate_pct}% · avg ${fmtPct(vm.perf.avg_pnl_pct)}`,
    ]));
  }

  // Realized PnL & Net tracker (USD by-design) + disclosure — embed apa adanya.
  if (vm.pnlBlock) out.push("", vm.pnlBlock);
  if (vm.disclosure) out.push(vm.disclosure.replace(/^\n+/, ""));

  // 🧠 Insight (lesson terakhir) — bila ada.
  if (vm.lastGoodRule || vm.lastBadRule) {
    out.push(SEP, `${ICON.brain} Insight`);
    out.push(tree([
      vm.lastGoodRule ? `${ICON.closed} ${vm.lastGoodRule}` : null,
      vm.lastBadRule ? `${ICON.warn} ${vm.lastBadRule}` : null,
    ]));
  }

  // ⚙️ Sistem (dry-run / HiveMind / OpenRouter).
  out.push(SEP, `${ICON.config} Sistem`);
  out.push(tree(systemLines({ dryRun: vm.dryRun, hive: vm.hive }, vm.orLines)));

  if (vm.totalPositions > 0) out.push(`${ICON.arrow} /positions buat daftar bernomor`);
  return out.join("\n");
}
