/**
 * backtest-binwidth.js — OFFLINE, READ-ONLY backtest of RANGE WIDTH / COVERAGE
 * over the recorded mainzen_v2 closed-position book in lessons.json.
 *
 * SAFETY: reads lessons.json only. Writes NOTHING (no data/state/config/bot touch).
 * This is a SIMULATION for tuning — it never applies anything to the live bot.
 *
 * ⚠️ SCOPE CAVEAT (WAJIB, dicetak di output): this backtest is COVERAGE / OOR-risk
 *    ONLY. The FEE side (a narrower range packs more fees per $ — the very point of
 *    the bid_ask racikan) CANNOT be replayed from this data → output is
 *    INFORMATIONAL. Final bin-width decision = confirm live/paper.
 *
 * Racikan mainzen_v2 = bid_ask SINGLE-SIDE-BELOW (deposit SOL, buy as price falls).
 *   bins_above=0 for ALL records → the UPPER edge sits AT entry, so any pump → idle
 *   SOL above range → exit "pumped far above range" (we leave the up-move on the table).
 *
 * Geometry (DLMM, EXACT — price_peak/trough_pct are bin-quantized in state.js:505-516):
 *   per bin move k from entry: price% = (1+step/1e4)^k − 1.
 *   in-range Δbin ∈ [−bins_below, +bins_above].
 *   OOR-above ⇔ peak Δbin > bins_above ; OOR-below ⇔ trough Δbin > bins_below.
 *
 * Usage:  node scripts/backtest-binwidth.js [racikan]   (default racikan: mainzen_v2)
 */

import fs from "fs";
import { repoPath } from "../repo-root.js";

const RACIKAN = process.argv[2] || "mainzen_v2";

// ── Load (READ-ONLY) ────────────────────────────────────────────
function loadRecords() {
  const raw = JSON.parse(fs.readFileSync(repoPath("lessons.json"), "utf8"));
  return (raw.performance || []).filter(
    (r) =>
      !r.paper &&
      !r.suspect_pnl &&
      r.active_setup === RACIKAN &&
      Number.isFinite(r.pnl_pct) &&
      r.bin_range &&
      Number.isFinite(r.bin_step) &&
      r.bin_step > 0,
  );
}

// ── Geometry helpers (bin ↔ price%) ─────────────────────────────
const sOf = (rec) => rec.bin_step / 1e4; // per-bin price ratio increment
const pricePctAt = (k, s) => (Math.pow(1 + s, k) - 1) * 100; // % move at +k bins (k may be negative)
// Excursion → integer bins from entry. peak% ≥ 0 → bins up ; trough% ≤ 0 → bins down (positive count).
const binsUp = (peakPct, s) => Math.round(Math.log(1 + peakPct / 100) / Math.log(1 + s));
const binsDown = (troughPct, s) => Math.round(-Math.log(1 + troughPct / 100) / Math.log(1 + s));

// ── Formatting ──────────────────────────────────────────────────
const f = (x) => Number.isFinite(x);
const r1 = (x) => (x == null ? "—" : Math.round(x * 10) / 10);
const r2 = (x) => (x == null ? "—" : Math.round(x * 100) / 100);
const pct = (x, d = 1) => (x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(d) + "%");
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  const m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};

// ── Per-trade coverage map (excursion vs ACTUAL range edges) ─────
// Returns: { oorAbove, oorBelow, depthAbovePct/Bins, depthBelowPct/Bins, edgeAbovePct, edgeBelowPct, ... }
function mapTrade(rec) {
  const s = sOf(rec);
  const bb = rec.bin_range.bins_below;
  const ba = rec.bin_range.bins_above; // 0 for single-side-below
  const edgeAbovePct = pricePctAt(ba, s); // highest in-range price% (≈0 when ba=0)
  const edgeBelowPct = pricePctAt(-bb, s); // lowest in-range price% (deep negative)
  const out = { s, bb, ba, edgeAbovePct, edgeBelowPct, hasPeak: f(rec.price_peak_pct), hasTrough: f(rec.price_trough_pct) };

  if (out.hasPeak) {
    const bu = binsUp(rec.price_peak_pct, s);
    out.peakBins = bu;
    out.oorAbove = bu > ba;
    out.depthAboveBins = bu - ba; // bins past the upper edge (>0 ⇔ OOR-above)
    out.depthAbovePct = rec.price_peak_pct - edgeAbovePct; // % past upper edge
  }
  if (out.hasTrough) {
    const bd = binsDown(rec.price_trough_pct, s);
    out.troughBins = bd;
    out.oorBelow = bd > bb;
    out.depthBelowBins = bd - bb; // bins past the lower edge (>0 ⇔ OOR-below)
    out.depthBelowPct = edgeBelowPct - rec.price_trough_pct; // % past lower edge (>0 ⇔ OOR-below)
  }
  return out;
}

const isPump = (rec) => (rec.close_reason || "").toLowerCase().includes("pump");

// ── FASE 1 — OOR DIRECTION + DEPTH ──────────────────────────────
function fase1(recs) {
  console.log("\n=== FASE 1 — OOR ARAH + KEDALAMAN (excursion vs tepi range AKTUAL) ===");
  console.log("Tepi dihitung dari bin_range tiap trade (BUKAN asumsi). edge_atas = +bins_above bin (=0 di entry),");
  console.log("edge_bawah = −bins_below bin. OOR-atas ⇔ peak lewat edge_atas; OOR-bawah ⇔ trough lewat edge_bawah.\n");

  const maps = recs.map(mapTrade);
  const withPeak = maps.filter((m) => m.hasPeak);
  const withTrough = maps.filter((m) => m.hasTrough);
  const oorAbove = withPeak.filter((m) => m.oorAbove);
  const oorBelow = withTrough.filter((m) => m.oorBelow);

  console.log(`Cakupan excursion: peak ${withPeak.length}/${recs.length}, trough ${withTrough.length}/${recs.length}.\n`);

  console.log(pad("arah", 12) + padL("n-cek", 7) + padL("OOR", 6) + padL("freq%", 8) +
    padL("depth bins (med/avg)", 22) + padL("depth % (med/avg)", 20));
  console.log("─".repeat(75));
  const row = (label, base, oor, depthBinsKey, depthPctKey) => {
    const db = oor.map((m) => m[depthBinsKey]);
    const dp = oor.map((m) => m[depthPctKey]);
    console.log(
      pad(label, 12) +
        padL(base.length, 7) +
        padL(oor.length, 6) +
        padL(base.length ? Math.round((oor.length / base.length) * 100) : "—", 8) +
        padL(`${r1(median(db))} / ${r1(mean(db))}`, 22) +
        padL(`${pct(median(dp))} / ${pct(mean(dp))}`, 20),
    );
  };
  row("OOR-ATAS", withPeak, oorAbove, "depthAboveBins", "depthAbovePct");
  row("OOR-BAWAH", withTrough, oorBelow, "depthBelowBins", "depthBelowPct");

  console.log("\n  freq%  = % trade (yg punya data arah itu) yg excursion-nya lewat tepi range.");
  console.log("  depth  = SEBERAPA JAUH lewat tepi: dalam bin & dalam % harga (median / rata-rata).");

  // Spotlights.
  const deepestBelow = [...oorBelow].sort((a, b) => b.depthBelowPct - a.depthBelowPct)[0];
  const deepestAbove = [...oorAbove].sort((a, b) => b.depthAbovePct - a.depthAbovePct)[0];
  console.log("\n  Asimetri racikan single-side-bawah:");
  console.log(`   · tepi ATAS ada DI entry (edge_atas≈0%) → naik ≥1 bin langsung OOR-atas → ${oorAbove.length}/${withPeak.length} trade.`);
  console.log(`   · tepi BAWAH dalam (median edge ${pct(median(withTrough.map((m) => m.edgeBelowPct)))}) → trough jarang sampai → ${oorBelow.length}/${withTrough.length} trade.`);
  if (deepestAbove) {
    const rec = recs[maps.indexOf(deepestAbove)];
    console.log(`   · OOR-atas terdalam: ${rec.pool_name} peak ${pct(rec.price_peak_pct)} = ${deepestAbove.depthAboveBins} bin lewat atas (step ${rec.bin_step}).`);
  }
  if (deepestBelow) {
    const rec = recs[maps.indexOf(deepestBelow)];
    console.log(`   · OOR-bawah terdalam: ${rec.pool_name} trough ${pct(rec.price_trough_pct)} vs edge ${pct(deepestBelow.edgeBelowPct)} = ${pct(deepestBelow.depthBelowPct)} lewat bawah.`);
  }
  return { maps, withPeak, withTrough, oorAbove, oorBelow };
}

// ── MAIN ────────────────────────────────────────────────────────
function main() {
  const recs = loadRecords();
  if (recs.length === 0) {
    console.error(`No records for racikan="${RACIKAN}" (filter !paper & !suspect_pnl & bin_range & bin_step). Abort.`);
    process.exit(1);
  }
  console.log(`=== BACKTEST BIN-WIDTH / COVERAGE (offline, READ-ONLY) — racikan=${RACIKAN}, n=${recs.length} ===`);
  console.log("⚠️  LINGKUP: COVERAGE / OOR-risk SAJA. Sisi FEE (range sempit = fee/$ lebih padat) TAK ter-replay");
  console.log("    → output INFORMASIONAL. Keputusan final lebar bin = konfirmasi live/paper.");
  console.log(`    Racikan = bid_ask single-side-BAWAH (bins_above=0 di ${recs.filter((r) => r.bin_range.bins_above === 0).length}/${recs.length} record).`);

  fase1(recs);
}

main();
