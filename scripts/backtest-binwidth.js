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

// ── FASE 2 — COVERAGE % + ⭐ MISSED-UPSIDE ──────────────────────
function fase2(recs, maps) {
  console.log("\n=== FASE 2 — COVERAGE % + ⭐ MISSED-UPSIDE ===");

  // Coverage classification over trades with BOTH peak & trough.
  const both = maps
    .map((m, i) => ({ m, rec: recs[i] }))
    .filter(({ m }) => m.hasPeak && m.hasTrough);
  let inRange = 0, breachAbove = 0, breachBelow = 0, breachBoth = 0;
  for (const { m } of both) {
    if (m.oorAbove && m.oorBelow) breachBoth++;
    else if (m.oorAbove) breachAbove++;
    else if (m.oorBelow) breachBelow++;
    else inRange++;
  }
  const nb = both.length;
  const p = (x) => (nb ? Math.round((x / nb) * 100) : 0) + "%";
  console.log(`\nKlasifikasi excursion (n=${nb} trade dgn peak & trough lengkap):`);
  console.log(`  · DALAM range penuh (tak tembus dua arah) : ${padL(inRange, 3)}  (${p(inRange)})`);
  console.log(`  · tembus ATAS saja                        : ${padL(breachAbove, 3)}  (${p(breachAbove)})`);
  console.log(`  · tembus BAWAH saja                       : ${padL(breachBelow, 3)}  (${p(breachBelow)})`);
  console.log(`  · tembus DUA arah                         : ${padL(breachBoth, 3)}  (${p(breachBoth)})`);
  console.log(`  → ${p(breachAbove + breachBoth)} excursion keluar lewat ATAS, ${p(breachBelow + breachBoth)} lewat BAWAH.`);

  // ⭐ MISSED-UPSIDE: how far price ran ABOVE the top edge before we'd be idle SOL.
  // In single-side-below the upper edge sits at entry (edgeAbovePct≈0) → we capture ~0 of any
  // up-move; the whole peak above the edge is "left on the table".
  console.log("\n⭐ MISSED-UPSIDE — 'kita ninggalin berapa di meja karena single-side-bawah?'");
  console.log("   Pas harga pump, SOL kita idle di atas range (deket entry) → up-move TAK ke-capture.");
  console.log("   missed% = peak% − edge_atas% (edge_atas≈0 krn bins_above=0) ≈ seluruh run di atas entry.\n");

  const summarize = (label, items) => {
    if (!items.length) {
      console.log(`  ${label}: (tak ada sampel)`);
      return;
    }
    const missedPct = items.map(({ m, rec }) => rec.price_peak_pct - m.edgeAbovePct);
    // $ CEILING: full deployed capital riding the up-move then sold at peak. NOT achievable
    // (would need to HOLD the base token + eat IL) — strictly an upper bound for scale.
    const missedUsd = items.map(({ rec }, i) =>
      f(rec.initial_value_usd) ? (missedPct[i] / 100) * rec.initial_value_usd : 0);
    const totUsd = missedUsd.reduce((s, x) => s + x, 0);
    console.log(`  ${label} (n=${items.length}):`);
    console.log(`     missed% per trade  : median ${pct(median(missedPct))} · avg ${pct(mean(missedPct))} · max ${pct(Math.max(...missedPct))}`);
    console.log(`     $ CEILING (≣ atas) : total ~$${r2(totUsd)} · median/trade ~$${r2(median(missedUsd))}  ⚠️ plafon (butuh HOLD token + kena IL)`);
  };

  const breachers = maps
    .map((m, i) => ({ m, rec: recs[i] }))
    .filter(({ m }) => m.hasPeak && m.oorAbove);
  const pumped = breachers.filter(({ rec }) => isPump(rec));
  summarize("Exit 'pumped far above range'", pumped);
  summarize("SEMUA trade tembus tepi-atas (apapun exit)", breachers);

  console.log("\n  Baca: di single-side-bawah, tiap pump = upside penuh KELEWAT (median ~+11%/trade).");
  console.log("  ⚠️ Ini sisi COVERAGE saja — meng-capture upside butuh GANTI strategi (hold token /");
  console.log("     dual-side bins_above>0), yg bawa IL + ubah profil fee (TAK ter-replay di sini).");
  return { both, breachers, pumped };
}

// ── FASE 3 — CANDIDATE WIDTH / SHAPE (coverage-side, direction only) ──
function fase3(recs, maps) {
  console.log("\n=== FASE 3 — KANDIDAT LEBAR/BENTUK (coverage-side, ARAH doang) ===");
  console.log("⚠️  FEE TAK TERHITUNG: range lebih sempit = fee/$ lebih padat (inti bid_ask) — TAK ter-replay.");
  console.log("    Tabel ini cuma trade-off OOR/coverage. Keputusan lebar = konfirmasi live/paper.\n");

  // (A) bins_below scenarios — does a narrower DOWN range start breaching? (currently 0% OOR-below)
  const tr = maps.map((m, i) => ({ m, rec: recs[i] })).filter(({ m }) => m.hasTrough);
  console.log(`(A) bins_below {lebih sempit ↔ lebih lebar} — efek ke OOR-BAWAH (n=${tr.length} trade dgn trough):`);
  console.log("    Tepi bawah = sisi 'beli pas turun' (inti racikan). OOR-bawah = berhenti nampung dip.\n");
  console.log(pad("skala bb", 10) + padL("bb median", 11) + padL("OOR-bawah", 11) + padL("freq%", 8) + padL("depth-past bins (med/avg)", 27));
  console.log("─".repeat(67));
  for (const mult of [0.5, 0.75, 1.0, 1.25, 1.5]) {
    const rows = tr.map(({ m, rec }) => {
      const bbNew = Math.max(1, Math.round(m.bb * mult));
      const bd = binsDown(rec.price_trough_pct, m.s);
      return { bbNew, oor: bd > bbNew, depthPast: bd - bbNew };
    });
    const oor = rows.filter((r) => r.oor);
    const dp = oor.map((r) => r.depthPast);
    const tag = mult === 1.0 ? " *base" : "";
    console.log(
      pad("×" + mult + tag, 10) +
        padL(median(rows.map((r) => r.bbNew)), 11) +
        padL(oor.length, 11) +
        padL(Math.round((oor.length / rows.length) * 100), 8) +
        padL(`${r1(median(dp))} / ${r1(mean(dp))}`, 27),
    );
  }
  console.log("\n  Trade-off bawah: lebih SEMPIT → OOR-bawah naik (kehilangan coverage dip = inti racikan) TAPI");
  console.log("  fee/$ lebih padat (TAK terhitung). Lebih LEBAR → OOR-bawah tetap ~0 tapi modal makin encer.");

  // (B) upper edge / dual-side scenarios — how much pump would a wider TOP / dual-side cover?
  const pk = maps.map((m, i) => ({ m, rec: recs[i] })).filter(({ m }) => m.hasPeak);
  console.log(`\n(B) tepi-ATAS lebih lebar / dual-side (bins_above>0) — efek ke OOR-ATAS + upside ke-capture (n=${pk.length}):`);
  console.log("    base = bins_above 0 (di entry). Skenario = naikin tepi atas X bin di ATAS entry.\n");
  console.log(pad("bins_above", 12) + padL("edge_atas%", 12) + padL("OOR-atas", 10) + padL("freq%", 8) +
    padL("captured med%", 15) + padL("missed med%", 13));
  console.log("─".repeat(70));
  for (const ba of [0, 5, 10, 20, 35]) {
    const rows = pk.map(({ m, rec }) => {
      const bu = binsUp(rec.price_peak_pct, m.s);
      const edge = pricePctAt(ba, m.s);
      const captured = Math.min(rec.price_peak_pct, edge); // % up to the new upper edge (cap at peak)
      const missed = Math.max(0, rec.price_peak_pct - edge);
      return { oor: bu > ba, captured, missed, edge };
    });
    const oor = rows.filter((r) => r.oor);
    const tag = ba === 0 ? " *base" : "";
    console.log(
      pad(ba + tag, 12) +
        padL(pct(median(rows.map((r) => r.edge))), 12) +
        padL(oor.length, 10) +
        padL(Math.round((oor.length / rows.length) * 100), 8) +
        padL(pct(median(rows.map((r) => r.captured))), 15) +
        padL(pct(median(rows.map((r) => r.missed))), 13),
    );
  }
  console.log("\n  Trade-off atas: tepi-atas lebih lebar → OOR-atas turun + sebagian pump ke-capture (captured%↑).");
  console.log("  ⚠️ TAPI bins_above>0 = HOLD base token saat deploy (BUKAN single-side-SOL lagi — safety check");
  console.log("     executor.js larang bins_above>0 di single-side-SOL) → bawa IL + ubah profil fee. GANTI strategi,");
  console.log("     bukan tuning lebar. Angka captured = plafon coverage; realisasi butuh paper/live.");
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

  const { maps } = fase1(recs);
  fase2(recs, maps);
  fase3(recs, maps);
}

main();
