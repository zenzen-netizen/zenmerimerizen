/**
 * views/wallet.js — renderer /wallet + shared wallet-block helpers (Phase 3 🅴).
 *
 * Render-only. Data fetch (getWalletBalances, getMyPositions, getPositionsRentSol,
 * OpenRouter, trackers) tetap di index.js — di sini cuma view-model + render tree.
 *
 * FIX bug unit ◎/$-campur (#12): blok wallet lama (formatWalletStatus, index.js:1681)
 * hard-`$` sementara baris lain (All-time PnL) ikut solMode → satu pesan campur ◎ & $.
 * Di sini SEMUA jumlah ikut solMode lewat `fmtCur` (◎ saat on / $ via ×price saat off).
 * PENGECUALIAN terkunci (governing #2):
 *   - HELD/RENT selalu ◎ (SOL intrinsik, refundable) — JANGAN dikonversi.
 *   - "SOL @ $<price>" selalu $ (memang harga USD).
 *   - OpenRouter / realized-PnL tracker = USD by-design (di-embed apa adanya).
 *
 * `walletBlockLines` + `systemLines` di-share ke views/status.js supaya kedua view
 * pakai render wallet yang IDENTIK (anti-divergen — itu kelas bug yang lagi difix).
 */

import { ICON, SEP, tree, round, fmtCur, fmtSol, fmtWib } from "./format.js";

/**
 * Baris blok wallet (tanpa prefix tree) — SHARED /status & /wallet.
 * d: { solMode, sol, solUsd, solPrice, totalPositions, maxPositions,
 *      deployAmount, gasReserve, heldSol, heldEst }
 */
export function walletBlockLines(d) {
  const { solMode } = d;
  const lines = [];
  // Saldo: tampilkan KEDUA basis (primary ikut solMode, secondary info) — versi
  // lama selalu nampilin SOL + ($usd), jadi dua-duanya dipertahankan.
  lines.push(solMode
    ? `${ICON.value} Saldo: ◎${round(d.sol, 4)} (≈$${Number(d.solUsd).toFixed(2)})`
    : `${ICON.value} Saldo: $${Number(d.solUsd).toFixed(2)} (≈◎${round(d.sol, 4)})`);
  lines.push(`${ICON.entry} SOL @ $${round(d.solPrice, 2)}`);          // harga SOL = USD selalu
  lines.push(`${ICON.position} Posisi: ${d.totalPositions}/${d.maxPositions}`);
  // per-slot & bebas = jumlah SOL → fmtCur (◎ saat solMode, $ via ×price saat off).
  const free = d.sol - d.gasReserve;
  lines.push(`📦 per slot: ${fmtCur(d.deployAmount, d.deployAmount * d.solPrice, solMode)} (ukuran per posisi baru)`);
  lines.push(`${ICON.inRange} bebas: ${fmtCur(free, free * d.solPrice, solMode)} (wallet − gasReserve ${d.gasReserve})`);
  // HELD/RENT: selalu ◎; info — sudah keluar wallet, balik saat close.
  if ((d.heldSol ?? 0) > 0) {
    lines.push(`${ICON.held} held (${d.totalPositions} pos): ${fmtSol(d.heldSol)}${d.heldEst ? " (sebagian est)" : ""} — sudah keluar wallet, balik saat close`);
  }
  return lines;
}

/**
 * Baris blok sistem (tanpa prefix tree) — SHARED. orLines = array baris OpenRouter
 * (pre-built di index.js; bisa kosong / 1 / 2 baris incl warning menipis).
 */
export function systemLines(d, orLines = []) {
  const lines = [`🌫 Dry-run: ${d.dryRun ? "on" : "off"} · 🐝 HiveMind: ${d.hive ? "on" : "off"}`];
  for (const l of orLines) if (l) lines.push(l);
  return lines;
}

/**
 * View-model /wallet. Cross-check §C /wallet (index.js:3547,3581-3584): blok wallet
 * (= /status block + OpenRouter) + formatSolTracker + formatPnlTracker + disclosure.
 * Field formatWalletStatus lama termasuk Dry-run + HiveMind → DIPERTAHANKAN (mockup
 * brief tak nampilin; dikembalikan di seksi ⚙️ Sistem, governing #1).
 *
 * @param input {
 *   cfg, nowMs?, sol, solUsd, solPrice, totalPositions, maxPositions, deployAmount,
 *   gasReserve, heldSol, heldEst, dryRun, hive, orLines,   // shared wallet/system
 *   solTracker, pnlBlock, disclosure                        // embedded (string)
 * }
 */
export function buildView(input) {
  const solMode = !!input.cfg?.management?.solMode;
  return { type: "wallet", solMode, nowMs: input.nowMs ?? Date.now(), ...input };
}

export function telegram(vm) {
  const { solMode } = vm;
  const out = [`${ICON.wallet} Wallet · ${fmtWib(vm.nowMs)}`, SEP];

  out.push(tree(walletBlockLines({
    solMode, sol: vm.sol, solUsd: vm.solUsd, solPrice: vm.solPrice,
    totalPositions: vm.totalPositions, maxPositions: vm.maxPositions,
    deployAmount: vm.deployAmount, gasReserve: vm.gasReserve,
    heldSol: vm.heldSol, heldEst: vm.heldEst,
  })));

  // ⚙️ Sistem (dry-run / HiveMind / OpenRouter) — Dry-run+HiveMind dikembalikan dari versi lama.
  out.push(SEP, `${ICON.config} Sistem`);
  out.push(tree(systemLines({ dryRun: vm.dryRun, hive: vm.hive }, vm.orLines)));

  // Tracker SOL (saldo mentah 1D/7D/30D) + realized PnL/Net + disclosure — embed (string).
  if (vm.solTracker) out.push("", vm.solTracker);
  if (vm.pnlBlock) out.push("", vm.pnlBlock);
  if (vm.disclosure) out.push(vm.disclosure.replace(/^\n+/, ""));
  return out.join("\n");
}
