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

import { ICON, SEP, tree, header, esc, fmtMoneySigned } from "./format.js";

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

// ── notifyClose (#9) — fix HARD-$ ────────────────────────────────────────────
/**
 * @param d { pair, pnlUsd, pnlPct, peakPnlPct?, reason?, lesson?, feesUsd?,
 *   gasSol, solMode }
 *
 * HARD-$ #9: uang dirender MODE-CORRECT via fmtMoneySigned(_, solMode) — di USD-mode
 * byte-identik `$` lama, di ◎-mode jadi ◎ (bukan `$` salah). `fmtBoth($+◎)` TIDAK
 * dipakai: payload close cuma bawa SATU nilai mode-correct (no sol_price); nurunin
 * unit kedua = ubah executor (di luar scope) / ngarang konversi (DILARANG governing #2)
 * → tampil 1 unit apa adanya. Win/loss 🟢/🔴 DIPERTAHANKAN (bukan ✅ generik = reduksi).
 * Field icon (📊/💎/📈/⛽/📋/📚) + inline HTML (<b>/<i>) dipertahankan apa adanya.
 */
export function renderClose(d) {
  const net = d.pnlUsd ?? 0;
  const solMode = !!d.solMode;
  const m = (v) => fmtMoneySigned(v, solMode);                       // mode-correct
  const spct = (v) => `${v >= 0 ? "+" : ""}${(v ?? 0).toFixed(2)}%`;

  const lines = [`📊 Net PnL: ${m(net)} (${spct(d.pnlPct)})`];
  if (d.feesUsd != null) {
    const fee = d.feesUsd;
    lines.push(`💎 Fee panen ${m(fee)} · 📈 Efek-harga ${m(net - fee)}`);
    lines.push(`⛽ Gas ~${(d.gasSol ?? 0).toFixed(5)} SOL (est, di luar PnL — dari wallet)`);
  }
  if (Number.isFinite(d.peakPnlPct) && Number.isFinite(d.pnlPct)) {
    const giveback = d.peakPnlPct - d.pnlPct;
    if (d.peakPnlPct >= 3 && giveback >= 1) {
      lines.push(`📈 Give-back: peak +${d.peakPnlPct.toFixed(2)}% → exit ${spct(d.pnlPct)} (tinggal ${giveback.toFixed(2)}pp di meja)`);
    }
  }
  const trig = d.reason ? String(d.reason).match(/PnL (-?\d+(?:\.\d+)?)%/) : null;
  if (trig && d.pnlPct != null) {
    const t = parseFloat(trig[1]);
    const gap = Math.abs((d.pnlPct ?? 0) - t);
    if (Number.isFinite(gap) && gap >= 5) {
      lines.push(`⚠️ Trigger di ${t.toFixed(2)}%, realisasi ${(d.pnlPct ?? 0).toFixed(2)}% — harga terus bergerak selama eksekusi close (gap ${gap.toFixed(1)}pp).`);
    }
  }
  if (d.reason) lines.push(`📋 <b>Reason:</b> ${esc(String(d.reason).slice(0, 200))}`);
  if (d.lesson) lines.push(`📚 <b>Lesson:</b> <i>${esc(String(d.lesson).slice(0, 300))}</i>`);

  return [header(net >= 0 ? "🟢" : "🔴", "Closed", esc(d.pair || "?")), SEP, tree(lines)].join("\n");
}
