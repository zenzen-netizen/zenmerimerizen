/**
 * backtest-exits.js — OFFLINE, READ-ONLY backtest of EXIT params (stopLoss + trailing)
 * over the recorded mainzen_v2 closed-position book in lessons.json.
 *
 * SAFETY: reads lessons.json only. Writes NOTHING (no data/state/config/bot touch).
 * This is a SIMULATION for tuning — it never applies anything to the live bot.
 *
 * Model (from notes/v2.1-testmethod-recon.md):
 *   - stopLoss L : trigger ⇔ trough_pnl_pct ≤ L → simExit% = L (ignores overshoot/slippage
 *                  → OPTIMISTIC; for rugs reality gaps far past L). Not triggered → actual pnl_pct.
 *   - trailing (T,D): armed ⇔ peak_pnl_pct ≥ T → simExit% = peak − D (mechanical). Not armed → actual.
 *                  APPROX: peak/trough ordering is unknown → RANKING aid, not a verdict.
 *
 * Usage:  node scripts/backtest-exits.js [racikan]   (default racikan: mainzen_v2)
 */

import fs from "fs";
import { repoPath } from "../repo-root.js";
import { getModePerformance } from "../lessons.js";
import { computeTradeStats } from "../reports.js";

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
      Number.isFinite(r.initial_value_usd),
  );
}

// ── Aggregate stats (same shape /report uses) ───────────────────
// rows: [{ pnlPct, pnlUsd, initial }]
function stats(rows) {
  const n = rows.length;
  const netUsd = sum(rows.map((r) => r.pnlUsd));
  const invested = sum(rows.map((r) => r.initial));
  const wins = rows.filter((r) => r.pnlUsd > 0);
  const losses = rows.filter((r) => r.pnlUsd < 0);
  const grossWin = sum(wins.map((r) => r.pnlUsd));
  const grossLoss = Math.abs(sum(losses.map((r) => r.pnlUsd)));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null;
  return {
    n,
    netUsd,
    roiPct: invested > 0 ? (netUsd / invested) * 100 : null,
    winRate: n ? (wins.length / n) * 100 : 0,
    pf,
    wins: wins.length,
    losses: losses.length,
  };
}

const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const r2 = (x) => (x == null ? "—" : Math.round(x * 100) / 100);
const pfStr = (pf) => (pf === Infinity ? "∞" : pf == null ? "—" : pf.toFixed(2));
const usd = (x) => (x >= 0 ? "+$" : "-$") + Math.abs(x).toFixed(2);
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

// Actual (baseline) rows, untouched.
function actualRows(recs) {
  return recs.map((r) => ({ pnlPct: r.pnl_pct, pnlUsd: r.pnl_usd, initial: r.initial_value_usd }));
}

// ── STOPLOSS overlay ────────────────────────────────────────────
function simStopLoss(recs, L) {
  let winnerCut = 0, loserCapped = 0, loserDeepened = 0, triggered = 0;
  let deltaUsd = 0; // sim − actual, capital terms
  const rows = recs.map((r) => {
    const hit = Number.isFinite(r.trough_pnl_pct) && r.trough_pnl_pct <= L;
    const simPct = hit ? L : r.pnl_pct;
    const simUsd = (simPct / 100) * r.initial_value_usd;
    if (hit) {
      triggered++;
      deltaUsd += simUsd - r.pnl_usd;
      if (r.pnl_pct > 0) winnerCut++;
      else if (r.pnl_pct <= L) loserCapped++;
      else loserDeepened++;
    }
    return { pnlPct: simPct, pnlUsd: simUsd, initial: r.initial_value_usd };
  });
  return { rows, triggered, winnerCut, loserCapped, loserDeepened, deltaUsd, st: stats(rows) };
}

function fase1StopLoss(recs, baseActual) {
  const Ls = [-6, -8, -10, -12, -15];
  const BASELINE = -12;
  const sims = new Map(Ls.map((L) => [L, simStopLoss(recs, L)]));
  const baseNet = sims.get(BASELINE).st.netUsd;

  console.log("\n=== FASE 1 — STOPLOSS BACKTEST (faithful trigger via trough_pnl_pct) ===");
  console.log("⚠️  CAVEAT (optimistik): exit dimodelkan TEPAT di L — abaikan overshoot/slippage.");
  console.log("    Utk RUG, realita bisa gap jauh lewat L (lihat sorotan di bawah).\n");
  console.log(
    pad("L", 8) + padL("trig", 5) + padL("win-cut", 9) + padL("loss-cap", 10) +
    padL("loss-deep", 11) + padL("net$", 11) + padL("roi%", 8) + padL("win%", 7) +
    padL("PF", 7) + padL("Δnet$ vs −12", 15),
  );
  console.log("─".repeat(91));
  for (const L of Ls) {
    const s = sims.get(L);
    const tag = L === BASELINE ? "*" : "";
    console.log(
      pad(L + tag, 8) +
        padL(s.triggered, 5) +
        padL(s.winnerCut, 9) +
        padL(s.loserCapped, 10) +
        padL(s.loserDeepened, 11) +
        padL(usd(s.st.netUsd), 11) +
        padL(r2(s.st.roiPct), 8) +
        padL(Math.round(s.st.winRate), 7) +
        padL(pfStr(s.st.pf), 7) +
        padL((s.st.netUsd - baseNet >= 0 ? "+" : "") + r2(s.st.netUsd - baseNet), 15),
    );
  }
  console.log("\n  win-cut   = WINNER (pnl asli>0) ke-stop jadi rugi L  → BIAYA stopLoss ketat");
  console.log("  loss-cap  = LOSER (pnl asli≤L) di-cap ke L            → MANFAAT stopLoss");
  console.log("  loss-deep = rugi kecil (L<asli≤0) dipotong dalam ke L → biaya kecil");
  console.log("  * = baseline live (−12)");

  // Rug spotlight — the deepest realized loss.
  const rug = [...recs].sort((a, b) => a.pnl_pct - b.pnl_pct)[0];
  if (rug) {
    const modelUsdAtBaseline = (BASELINE / 100) * rug.initial_value_usd;
    console.log(`\n🛑 SOROTAN RUG: ${rug.pool_name}`);
    console.log(`   trough ${rug.trough_pnl_pct}% → model exit di −12% = ${usd(modelUsdAtBaseline)} (init $${r2(rug.initial_value_usd)})`);
    console.log(`   REALITA: pnl ${rug.pnl_pct}% = ${usd(rug.pnl_usd)} (reason: ${(rug.close_reason || "").slice(0, 60)})`);
    console.log(`   → model TERLALU OPTIMIS +${usd(modelUsdAtBaseline - rug.pnl_usd).replace("+", "")} di trade ini. Semua L≥trough 'menangkap' rug ini sbg cap bersih −L (palsu).`);
  }
  return { sims, baseActual };
}

// ── TRAILING overlay (APPROX) ───────────────────────────────────
function simTrailing(recs, T, D) {
  let armed = 0, deltaUsd = 0;
  const rows = recs.map((r) => {
    const isArmed = Number.isFinite(r.peak_pnl_pct) && r.peak_pnl_pct >= T;
    const simPct = isArmed ? r.peak_pnl_pct - D : r.pnl_pct;
    const simUsd = (simPct / 100) * r.initial_value_usd;
    if (isArmed) { armed++; deltaUsd += simUsd - r.pnl_usd; }
    return { pnlPct: simPct, pnlUsd: simUsd, initial: r.initial_value_usd };
  });
  return { rows, armed, deltaUsd, st: stats(rows) };
}

function fase2Trailing(recs) {
  const Ts = [0.8, 1.0, 1.2, 1.5];
  const Ds = [0.5, 1.0];
  const BASE_T = 1.5, BASE_D = 1.0;
  const combos = [];
  for (const T of Ts) for (const D of Ds) combos.push({ T, D, sim: simTrailing(recs, T, D) });
  const baseNet = combos.find((c) => c.T === BASE_T && c.D === BASE_D).sim.st.netUsd;

  console.log("\n=== FASE 2 — TRAILING BACKTEST (RANKING — APPROX) ===");
  console.log("⚠️  APPROX: urutan peak/trough TAK diketahui. Model = 'tiap trade ber-peak≥T exit di peak−D'.");
  console.log("    Bisa over/understate (lewatkan recovery pasca-drop, atau potong yg masih naik).");
  console.log("    Pakai utk RANKING kandidat → konfirmasi paper, BUKAN vonis.\n");
  console.log(
    pad("T", 6) + pad("D", 6) + padL("armed", 7) + padL("net$", 11) + padL("roi%", 8) +
    padL("win%", 7) + padL("PF", 7) + padL("Δnet$ vs base", 15),
  );
  console.log("─".repeat(67));
  for (const c of combos) {
    const s = c.sim;
    const isBase = c.T === BASE_T && c.D === BASE_D;
    console.log(
      pad(c.T + (isBase ? "*" : ""), 6) +
        pad(c.D, 6) +
        padL(s.armed, 7) +
        padL(usd(s.st.netUsd), 11) +
        padL(r2(s.st.roiPct), 8) +
        padL(Math.round(s.st.winRate), 7) +
        padL(pfStr(s.st.pf), 7) +
        padL((s.st.netUsd - baseNet >= 0 ? "+" : "") + r2(s.st.netUsd - baseNet), 15),
    );
  }
  console.log("\n  armed = jml trade dgn peak_pnl_pct ≥ T (yg model-nya trailing-exit di peak−D)");
  console.log("  * = baseline live (trig 1.5 / drop 1.0)");
  return { combos, baseNet };
}

// ── MAIN ────────────────────────────────────────────────────────
function main() {
  const recs = loadRecords();
  if (recs.length === 0) {
    console.error(`No records for racikan="${RACIKAN}" (filter !paper & !suspect_pnl). Abort.`);
    process.exit(1);
  }
  const baseActual = stats(actualRows(recs));

  console.log(`=== BACKTEST EXIT PARAMS (offline, READ-ONLY) — racikan=${RACIKAN}, n=${recs.length} ===`);

  // SANITY: my raw aggregation vs the exact /report path (getModePerformance + computeTradeStats).
  console.log("\n--- SANITY: raw-actual (script) vs /report path ---");
  const rep = computeTradeStats(getModePerformance());
  console.log(`  script raw : n=${baseActual.n} net=${usd(baseActual.netUsd)} roi=${r2(baseActual.roiPct)}% win=${Math.round(baseActual.winRate)}% pf=${pfStr(baseActual.pf)}`);
  console.log(`  /report    : n=${rep.count} net=${usd(rep.net_pnl_usd)} roi=${rep.roi_pct}% win=${rep.win_rate_pct}% pf=${pfStr(rep.profit_factor)}`);
  const match = rep.count === baseActual.n && Math.abs((rep.net_pnl_usd || 0) - baseActual.netUsd) < 0.05;
  console.log(`  match: ${match ? "✓ (model aggregation OK)" : "✗ — MODEL/ FILTER SALAH, periksa"}`);

  fase1StopLoss(recs, baseActual);
  fase2Trailing(recs);
}

main();
