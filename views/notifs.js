/**
 * views/notifs.js — renderer notif live (Phase 3 Batch B workstream 🅴). RENDER-ONLY.
 *
 * Migrasi rakitan-string `notify*` (telegram.js) ke bahasa-desain views: header() +
 * SEP 16 + tree ├/└. `notify*` di telegram.js jadi wrapper tipis (guard → renderX →
 * sendHTML); logika/trigger TIDAK disentuh. Zona merge-safe (file baru).
 *
 * Governing: NOL pengurangan detail — tiap field versi lama dipertahankan (inline
 * HTML <code>/<i>/<b> ikut), cuma layout yang dipindah. Header pakai ikon bahasa-
 * desain (🚀 deploy / 🔴 OOR / 🔄 swap / ✅ closed) tanpa <b> (selaras view lain).
 * Pemisah dalam-baris `  ·  `→` · ` (normalisasi, sama dgn /positions /status).
 */

import { ICON, SEP, tree, header, esc } from "./format.js";

/** Persen TANPA + (mirror fmtPct lokal telegram.js — beda dari format.js fmtPct yg bertanda). */
function pct2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "?";
}

// ── notifyDeploy (#4) ────────────────────────────────────────────────────────
/** Harga sangat kecil → eksponensial 3, else 6dp (mirror fmtP lama). */
function fmtPrice(v) { return v < 0.0001 ? v.toExponential(3) : v.toFixed(6); }

/**
 * @param d { pair, amountSol, position, tx, priceRange?, rangeCoverage?, binStep?,
 *   baseFee?, racikan? }  — racikan di-resolve di wrapper (activeRacikan).
 */
export function renderDeploy(d) {
  const lines = [
    `${ICON.value} Amount: ${d.amountSol} SOL${d.racikan ? ` · 🗂️ ${esc(d.racikan)}` : ""}`,
  ];
  if (d.priceRange) lines.push(`${ICON.range} Price range: ${fmtPrice(d.priceRange.min)} – ${fmtPrice(d.priceRange.max)}`);
  if (d.rangeCoverage) lines.push(`↕️ Cover: ${pct2(d.rangeCoverage.downside_pct)} ↓ | ${pct2(d.rangeCoverage.upside_pct)} ↑ | ${pct2(d.rangeCoverage.width_pct)} total`);
  if (d.binStep || d.baseFee) lines.push(`🧱 Bin step ${d.binStep ?? "?"} · base fee ${d.baseFee != null ? d.baseFee + "%" : "?"}`);
  lines.push(`🆔 Position: <code>${d.position?.slice(0, 8)}...</code>`);
  lines.push(`🔗 Tx: <code>${d.tx?.slice(0, 16)}...</code>`);
  return [header(ICON.deploy, "Deployed", esc(d.pair || "?")), SEP, tree(lines)].join("\n");
}

// ── notifyOutOfRange (#7) ────────────────────────────────────────────────────
/** @param d { pair, minutesOOR } */
export function renderOOR(d) {
  return [
    header(ICON.oor, "Out of Range", esc(d.pair || "?")),
    SEP,
    tree([`${ICON.time} Been OOR for ${d.minutesOOR} minutes`]),
  ].join("\n");
}

// ── notifySwap (#8) ──────────────────────────────────────────────────────────
/** @param d { inputSymbol, outputSymbol, amountIn, amountOut, tx } */
export function renderSwap(d) {
  const subject = `${esc(d.inputSymbol || "?")} → ${esc(d.outputSymbol || "?")}`;
  return [
    header(ICON.swap, "Swapped", subject),
    SEP,
    tree([
      `💱 In: ${d.amountIn ?? "?"} · Out: ${d.amountOut ?? "?"}`,
      `🔗 Tx: <code>${d.tx?.slice(0, 16)}...</code>`,
    ]),
  ].join("\n");
}
