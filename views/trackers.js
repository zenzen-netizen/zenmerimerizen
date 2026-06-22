/**
 * views/trackers.js — renderer tree-style untuk SOL Tracker & Realized-PnL/Net
 * (Phase 2/3 workstream 🅴, Rute X). RENDER-ONLY, murni string.
 *
 * Compute tetap di sol-tracker.js (getSolTracker/sinceStartRow) & pnl-tracker.js
 * (getPnlTracker) — keduanya mengembalikan objek terstruktur; di sini cuma rakit
 * string ke bahasa-desain (header + SEP 16 + tree ├/└) bareng /status & /wallet.
 *
 * Byte-fidelity (governing #1, NOL pengurangan detail): angka tetap dirakit dgn
 * `.toFixed` lokal (SOL 3dp / $ 2dp) — BUKAN round()/fmtMoney — supaya padding
 * trailing-zero identik dgn versi lama (round buang "0.050"→"0.05"). Unit beda by
 * design (governing #3): SOL Tracker = ◎ (saldo intrinsik), Realized = $ (sumber $).
 */

import { ICON, SEP, tree } from "./format.js";

function dot(n) { return n > 0 ? ICON.inRange : n < 0 ? ICON.oor : "⚪"; }

// ── SOL Tracker (◎) ──────────────────────────────────────────────────────────
function sol3(n) { return n.toFixed(3); }
function solSigned(n) { return `${n >= 0 ? "+" : "-"}◎${Math.abs(n).toFixed(3)}`; } // "+◎0.005"
function solPct(n) { return n == null ? "n/a" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }

/**
 * @param d {
 *   currentSol: number|null,
 *   rows: [{ label, startBal, deltaSol, deltaPct, startLabel, partial }],
 *   since: null | { anchorLabel, startLabel, startBal, deltaSol, deltaPct, partial }
 * }
 * rows/since = display-data dari sol-tracker.js (tanggal sudah jadi label "Jun 22").
 */
export function renderSolTracker(d) {
  const now = Number.isFinite(d.currentSol) ? sol3(d.currentSol) : "?";
  const out = [`${ICON.yield} SOL Tracker · now ◎${now}`, SEP];

  const data = [];
  let anyPartial = false;
  for (const r of d.rows || []) {
    const label = r.label.padEnd(3);
    if (r.startBal == null) { data.push(`${label} ⚪ (blm ada baseline)`); continue; }
    if (r.partial) anyPartial = true;
    const star = r.partial ? " *" : "";
    data.push(`${label} ${dot(r.deltaSol)} ${solSigned(r.deltaSol)} (${solPct(r.deltaPct)}) ← ◎${sol3(r.startBal)} @ ${r.startLabel}${star}`);
  }
  const ss = d.since;
  if (ss) {
    if (ss.startBal == null) {
      data.push(`sejak ${ss.anchorLabel} ⚪ (blm ada baseline)`);
    } else {
      if (ss.partial) anyPartial = true;
      const star = ss.partial ? " *" : "";
      data.push(`sejak ${ss.startLabel} ${dot(ss.deltaSol)} ${solSigned(ss.deltaSol)} (${solPct(ss.deltaPct)}) ← ◎${sol3(ss.startBal)}${star}`);
    }
  }
  out.push(tree(data));

  // footnote di LUAR tree (apa adanya) — nol detail hilang.
  if (anyPartial) out.push("* window/anchor blm punya baseline pas — pakai hari terlama tercatat");
  out.push("ℹ️ saldo SOL mentah (termasuk deposit/tarik & modal di posisi) — buat PnL murni pakai /report");
  if (!ss) out.push("💡 set anchor: /wallet trackstart YYYY-MM-DD");
  return out.join("\n");
}
