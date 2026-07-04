import fs from "fs";
import { log } from "./logger.js";
import { repoPath } from "./repo-root.js";
import { paths } from "./paths.js";
import { getHourlyProfile, getModePerformance, getExcludedRacikanStats } from "./lessons.js";
import { config } from "./config.js";
import { getOpenRouterBalance, getOpenRouter24hCost, getOpenRouterCredits } from "./openrouter-usage.js";
import { getSkipReview } from "./candidate-memory.js";
import { getDeployedPoolAddresses } from "./pool-memory.js";
import { getWalletBalances } from "./tools/wallet.js";
import { getGasStats } from "./gas-tracker.js";
import { getLlmCostStats } from "./llm-cost-tracker.js";
import { isPaperMode } from "./paper-trading.js";
import {
  computeTradeStats, formatStatsBlock, formatBreakdown, formatMovement, buildVerdict,
  buildRecommendations, buildRoleCostLines, estimateGasSol, buildTradeReport,
  formatQuantBlock, computeCostDragPct,
} from "./reports.js";
import { formatIdentity } from "./preset-manager.js";
import { formatPnlTracker } from "./pnl-tracker.js";
import { SEP, tree } from "./views/format.js"; // bahasa-desain tree-style (Batch C)

// Section tree-style: header + tree(body) (├/└). body falsy di-skip oleh tree().
const section = (header, body) => [header, tree(body)].join("\n");

const money = (n) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;

// Racikan-scope disclosure (mirrors index.js racikanScopeDisclosure): when the
// active-racikan view holds out LIVE trades (a different racikan or untagged),
// state the count + net so the briefing's racikan block never SILENTLY differs
// from the All-time block. Returns "" when nothing is held out (fail-open).
function racikanScopeDisclosure() {
  try {
    const { count, net_usd } = getExcludedRacikanStats();
    if (!count) return "";
    return `⚠️ ${count} trade live di luar racikan ini dikecualikan (PnL ${money(net_usd)}) — /report all buat semua.`;
  } catch { return ""; }
}

/**
 * Komposisi SATU blok scope untuk briefing harian (Opsi B / Opsi A). DISPLAY-ONLY:
 * scoping (perf mana yang masuk) ditentukan PEMANGGIL — helper cuma menyusun tampilan.
 *   - selalu: formatStatsBlock (PnL/ROI/win/PF/EV/payoff/DD/hold/in-range/best/worst).
 *   - deep:true → + buildVerdict + formatQuantBlock + formatMovement + formatBreakdown
 *     (+ buildRecommendations bila recOpts diberikan).
 * Spasi antar sub-blok meniru layout lama: verdict rapat di bawah stats; quant/
 * movement/breakdown/recs dipisah satu baris kosong. Tiap komponen fail-open (skip
 * bila falsy). recs butuh perf+opts → recOpts (null = lewati recs).
 */
function buildScopeBlock(perf, label, { deep = false, quantOpts = {}, recOpts = null } = {}) {
  const stats = computeTradeStats(perf);
  const parts = [formatStatsBlock(stats, label)];
  if (deep) {
    const v = buildVerdict(stats); if (v) parts.push(v);
    const q = formatQuantBlock(stats, quantOpts); if (q) parts.push("\n" + q);
    const m = formatMovement(stats); if (m) parts.push("\n" + m);
    const b = formatBreakdown(stats, { sessions: false }); if (b) parts.push("\n" + b);
    if (recOpts) { const r = buildRecommendations(perf, stats, recOpts); if (r) parts.push("\n" + r); }
  }
  return parts.join("\n");
}

// On-chain tools whose successful calls cost network/gas fees.
const ONCHAIN_TOOLS = ["deploy_position", "close_position", "claim_fees", "swap_token"];

/**
 * Count successful on-chain actions since `sinceMs` from the daily actions logs,
 * for the gas ESTIMATE. Skips log files whose date is entirely before the window.
 * Fail-open → {} on any error (gas line is simply omitted).
 */
function countOnChainActions(sinceMs) {
  const counts = {};
  try {
    const dir = "./logs";
    if (!fs.existsSync(dir)) return counts;
    const sinceDay = new Date(sinceMs).toISOString().slice(0, 10);
    const files = fs.readdirSync(dir).filter((f) => /^actions-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(8, 18) >= sinceDay);
    for (const f of files) {
      for (const line of fs.readFileSync(`${dir}/${f}`, "utf8").split("\n")) {
        if (!line.trim()) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        if (!o.success || !ONCHAIN_TOOLS.includes(o.tool)) continue;
        if (new Date(o.timestamp).getTime() < sinceMs) continue;
        // Dry-run/paper actions never paid gas — keep them out of the live estimate.
        // (result is sometimes logged as a JSON string, sometimes as an object)
        let r = o.result;
        if (typeof r === "string") { try { r = JSON.parse(r); } catch { r = null; } }
        if (r?.dry_run || r?.paper) continue;
        counts[o.tool] = (counts[o.tool] || 0) + 1;
      }
    }
  } catch (e) { log("briefing_error", `gas action count failed: ${e.message}`); }
  return counts;
}

// Escape data-derived text before embedding in HTML messages (lesson rules can
// contain <, >, & — e.g. "PnL -50% <= -50%" — which break Telegram's HTML parser).
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Surfaces only what the 24h sections above DON'T already show:
// older lessons (outside the 24h window), the last threshold adjustment,
// and avg in-range efficiency (the one all-time stat not printed elsewhere).
function buildLearningSection(lessonsData, since) {
  // Mode scope: while dry-running show ONLY sim (paper) rows; live shows ONLY real
  // rows. Keeps sim history from ever leaking into the live learning section.
  const keepMode = (x) => (isPaperMode() ? !!x.paper : !x.paper);
  const allLessons = (lessonsData.lessons || []).filter(keepMode);
  const allPerf = (lessonsData.performance || []).filter(keepMode);

  // Recent lessons are already listed under "Lessons Learned (24h)" — keep only older ones.
  const older = allLessons.filter(l => !l.created_at || new Date(l.created_at) <= since);

  const warnings = older
    .filter(l => l.outcome === "bad" || l.outcome === "poor" || (l.rule || "").startsWith("FAILED"))
    .slice(-3);

  // Highest-confidence proven winners. Sort descending, take the FIRST 3.
  const winners = older
    .filter(l => l.outcome === "good" || (l.rule || "").startsWith("PREFER") || (l.rule || "").startsWith("WORKED"))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 3);

  // Latest auto-evolution change (not shown anywhere else in the briefing)
  const evolved = allLessons.filter(l => l.tags?.includes("evolution")).slice(-1)[0];

  // Avg in-range efficiency, all-time (PnL/win-rate are already shown above; this isn't)
  const effPerf = allPerf.filter(p => Number.isFinite(p.range_efficiency));
  const avgEff = effPerf.length
    ? effPerf.reduce((s, p) => s + p.range_efficiency, 0) / effPerf.length
    : null;

  if (warnings.length === 0 && winners.length === 0 && !evolved && avgEff == null) return null;

  const out = ["<b>🧠 Learning Insights:</b>"];
  if (warnings.length > 0) out.push(section("⚠️ <b>Older warnings:</b>", warnings.map((l) => esc(String(l.rule).slice(0, 180)))));
  if (winners.length > 0) out.push(section("✅ <b>Proven patterns:</b>", winners.map((l) => esc(String(l.rule).slice(0, 180)))));
  const tail = [];
  if (evolved) tail.push(`🔧 <b>Last threshold adjustment:</b> ${esc(String(evolved.rule).slice(0, 200))}`);
  if (avgEff != null) tail.push(`📊 <b>Avg in-range (all-time):</b> ${avgEff.toFixed(0)}%`);
  if (tail.length) out.push(tree(tail));

  return out.join("\n");
}

// Recommendations now come from reports.js (buildRecommendations) — a single,
// profitability-aware engine shared by the briefing, the milestone learning
// report, and the weekly/monthly digests.

const STATE_FILE = paths.statePath;
const LESSONS_FILE = paths.lessonsPath;

// At-a-glance ON/OFF + auto/manual status so the user can tell what's active from
// the briefing alone (e.g. gas reserve auto vs manual, which experiments are on).
function buildFeatureStatus() {
  const m = config.management || {}, s = config.schedule || {}, r = config.reports || {}, e = config.experiments || {};
  const onoff = (b) => (b ? "on" : "off");
  const modes = [
    `gas reserve ${m.gasReserveAutoTune ? "AUTO" : "manual"}`,
    `learning report ${r.learningReportEvery > 0 ? `/${r.learningReportEvery}` : "off"}`,
    `trailing TP ${onoff(m.trailingTakeProfit)}`,
    `adaptive screening ${onoff(s.adaptiveScreening)}`,
    `auto-swap ${onoff(m.autoSwapAfterClaim)}`,
  ];
  const expOn = Object.entries(e).filter(([, v]) => v === true).map(([k]) => k);
  const lines = [`⚙️ <b>Mode:</b> ${modes.join(" · ")}`];
  lines.push(expOn.length ? `🧪 Experiments ON (${expOn.length}): ${expOn.map(esc).join(", ")}` : "🧪 Experiments: semua off");
  return lines.join("\n");
}

// Combined cost section: LLM (broken down per agent role) + gas (estimate) + the
// bottom line "did trading cover ALL costs?". `windowLabel` describes the period.
function buildCostSection({ costData, balance, credits, llmStats, gasSol, gasIsEst = true, solPrice, netPnlUsd, windowLabel = "24h", windowDays = 1 }) {
  if (!costData && !balance && !credits && !gasSol && !llmStats?.hasData) return null;
  // Paper mode: no real on-chain spend exists, so gas is a SIMULATED would-be-if-live
  // cost and the LLM number must come ONLY from local per-call tracking (the OpenRouter
  // account feed is shared with the live bot → contaminated on this box).
  const paper = isPaperMode();
  const header = `<b>💵 Costs (${esc(windowLabel)})${paper ? " — 🧪 simulasi" : ""}:</b>`;
  const body = [];
  // Dry-run/paper only: spell out which number is real vs simulated so the line is
  // never misread as live spend. Disappears automatically once live.
  if (paper) body.push(`<i>💡 LLM = biaya nyata (tracking lokal) · gas = estimasi bila live</i>`);

  // ── LLM, per role — prefer LOCAL per-call tracking (true per-role, no external
  //    feed); fall back to OpenRouter activity (model→role), then the daily total.
  //    In paper mode the fallback is suppressed: only the real local cost is shown. ──
  let llmUsd = 0;
  if (llmStats?.hasData) {
    llmUsd = llmStats.totalCost;
    body.push(`🤖 LLM: $${llmUsd.toFixed(4)} (${llmStats.calls} calls, ${llmStats.totalTokens.toLocaleString()} tokens)`);
    for (const [role, s] of Object.entries(llmStats.byRole).sort((a, b) => b[1].cost - a[1].cost)) {
      body.push(`${esc(role)}: $${s.cost.toFixed(4)} (${s.calls} calls)`);
    }
  } else if (paper) {
    body.push(`🤖 LLM: $0.0000 (belum ada call tercatat lokal)`);
  } else {
    const llmCost = costData && costData.calls > 0 ? costData.totalCost : (balance?.usageDaily ?? null);
    llmUsd = llmCost ?? 0;
    const roleLines = buildRoleCostLines(costData);
    if (roleLines) {
      body.push(`🤖 LLM: $${llmUsd.toFixed(4)} (${costData.calls} calls, ${costData.totalTokens.toLocaleString()} tokens)`);
      body.push(...roleLines.map((l) => l.replace(/^\s*•?\s*/, ""))); // strip "  • " — tree adds branch
    } else if (llmCost != null) {
      body.push(`🤖 LLM: $${llmCost.toFixed(4)}`);
    }
  }

  // ── Gas: real (from gas-tracker) when available, else estimate. In paper mode no
  //    real fee is ever paid → it's an explicit simulation of the live cost. ──
  const gasUsd = gasSol != null && solPrice ? gasSol * solPrice : null;
  if (gasSol > 0) {
    const gasTag = paper ? " (simulasi)" : gasIsEst ? " (est)" : "";
    const approx = paper || gasIsEst ? "~" : "";
    body.push(`⛽ Gas${gasTag}: ${approx}${gasSol.toFixed(4)} SOL${gasUsd != null ? ` (${approx}$${gasUsd.toFixed(2)})` : ""}${paper ? " — estimasi biaya bila live" : ""}`);
    // gasReserve runway — how long the configured reserve lasts at this burn rate.
    const reserve = config.management?.gasReserve;
    if (reserve > 0 && windowDays > 0) {
      const dailyBurn = gasSol / windowDays;
      if (dailyBurn > 0) {
        const runwayDays = reserve / dailyBurn;
        const flag = runwayDays < 7 ? " ⚠️ tipis" : "";
        const mode = config.management?.gasReserveAutoTune ? " (auto-tune)" : " (manual)";
        body.push(`🪫 gasReserve ${reserve} SOL${mode} ≈ ${runwayDays.toFixed(0)}d runway @ ${dailyBurn.toFixed(4)} SOL/hari${flag}`);
      }
    }
  }

  // ── Bottom line: trading net vs ALL costs (LLM + gas) ──
  const totalCost = llmUsd + (gasUsd ?? 0);
  if (Number.isFinite(netPnlUsd) && totalCost > 0) {
    const real = netPnlUsd - totalCost;
    const verdict = real >= 0 ? "✅ profit bersih" : "🔴 rugi setelah biaya";
    body.push(`📊 Net − semua biaya${paper ? " (simulasi)" : ""}: PnL ${money(netPnlUsd)} − biaya $${totalCost.toFixed(4)} (LLM $${llmUsd.toFixed(4)}${gasUsd != null ? ` + gas $${gasUsd.toFixed(2)}` : ""}) = ${money(real)} ${verdict}`);
  }

  if (credits?.balance != null) {
    body.push(`💳 Saldo OpenRouter: $${credits.balance.toFixed(2)}`);
    if (credits.balance < 5) body.push(`⚠️ Saldo menipis — pertimbangkan top up`);
  } else if (balance?.remaining != null) {
    body.push(`💳 Balance remaining: $${balance.remaining.toFixed(2)}`);
  }
  return body.length ? section(header, body) : null;
}

function buildTimeProfileSection() {
  const prof = getHourlyProfile();
  if (!prof || prof.total_with_open_time < prof.min_samples) return null;

  const fmtHold = (m) => (m == null ? null : m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`);
  const overallHold = fmtHold(prof.overall_avg_hold_min);
  const header = `🕒 <b>Best Open Hours (WIB)</b> — overall win ${prof.overall_win_rate_pct}%${overallHold ? `, avg hold ${overallHold}` : ""}`;
  const rated = prof.sessions.filter((s) => s.count > 0);
  if (rated.length === 0) return null;
  // Fair rank (same idea as reports.js groupStats): shrink each session's avg
  // PnL% toward the overall mean with K pseudo-trades, so a 2-sample 100% run
  // can't outrank a well-sampled solid session. All sessions stay listed —
  // ranking only reorders, never hides.
  const K = 5;
  const totalN = rated.reduce((s, x) => s + x.count, 0);
  const globalAvg = totalN > 0 ? rated.reduce((s, x) => s + x.avg_pnl_pct * x.count, 0) / totalN : 0;
  const ranked = rated
    .map((s) => ({ ...s, _score: (s.avg_pnl_pct * s.count + K * globalAvg) / (s.count + K) }))
    .sort((a, b) => b._score - a._score);
  // tree branch conveys rank-order; ordinal "N." dropped (data unchanged).
  const rows = ranked.map((s) => {
    const tag = s.count >= prof.min_samples ? "" : " <i>(few samples)</i>";
    const hold = fmtHold(s.avg_hold_min);
    return `${esc(s.label)}: ${s.win_rate_pct}% win, avg ${s.avg_pnl_pct >= 0 ? "+" : ""}${s.avg_pnl_pct}% (${s.count})${hold ? `, hold ${hold}` : ""}${tag}`;
  });
  return section(header, rows);
}

// 🧪 Experiment #8: counterfactual skip review. Gated by the flag (default off).
// Reports pools we passed on whose mcap later popped (the ones that got away) and
// how many fell (good skips). Fail-open — never breaks the briefing.
function buildSkipReviewSection() {
  if (!config.experiments?.counterfactualReview) return null;
  try {
    const review = getSkipReview({
      deployedPoolAddresses: getDeployedPoolAddresses(),
      minMcapGainPct: config.experiments.counterfactualMinMcapGainPct ?? 25,
    });
    if (!review || review.skipped === 0) return null;
    const body = [`👀 Passed on ${review.skipped} pools — ${review.dropped} later fell (good skips)`];
    if (review.gainers.length > 0) {
      body.push(
        ...review.gainers.map(
          (g) => `📈 ${esc(g.name)}: mcap ${g.mcap_delta_pct >= 0 ? "+" : ""}${g.mcap_delta_pct}% since first seen (~${g.span_min}m)`,
        ),
      );
    } else {
      body.push("✅ None of the skipped pools popped meaningfully.");
    }
    return section(`<b>🧪 Skip Review (recent):</b>`, body);
  } catch (e) {
    log("briefing_error", `skip review failed: ${e.message}`);
    return null;
  }
}

export async function generateBriefing({ allTimeDeep = false } = {}) {
  const state = loadJson(STATE_FILE) || { positions: {}, recentEvents: [] };
  const lessonsData = loadJson(LESSONS_FILE) || { lessons: [], performance: [] };

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Mode scope: dry-run → sim rows only, live → real rows only (no cross-mix).
  const keepMode = (x) => (isPaperMode() ? !!x.paper : !x.paper);
  // Tracked positions carry no paper flag — the synthetic id prefix marks sim rows.
  const keepModePos = (p) => {
    const sim = String(p.position || "").startsWith("paper_");
    return isPaperMode() ? sim : !sim;
  };

  // 1. Positions Activity
  const allPositions = Object.values(state.positions || {}).filter(keepModePos);
  const openedLast24h = allPositions.filter(p => new Date(p.deployed_at) > last24h);
  const closedLast24h = allPositions.filter(p => p.closed && new Date(p.closed_at) > last24h);

  // 2. Performance Activity (from performance log)
  const perfLast24h = (lessonsData.performance || []).filter(p => keepMode(p) && new Date(p.recorded_at) > last24h);
  const totalPnLUsd = perfLast24h.reduce((sum, p) => sum + (p.pnl_usd || 0), 0);
  const totalFeesUsd = perfLast24h.reduce((sum, p) => sum + (p.fees_earned_usd || 0), 0);

  // 3. Lessons — separate genuine trading lessons from config-change audit noise.
  const lessonsLast24h = (lessonsData.lessons || []).filter(l => keepMode(l) && new Date(l.created_at) > last24h);
  const tradingLessons = lessonsLast24h.filter(l => l.sourceType !== "config_change" && !(l.tags || []).includes("config_change"));
  const configChangeCount = lessonsLast24h.length - tradingLessons.length;

  // 4. Current State + scope perf sets (risk metrics, not just win-rate).
  //    Opsi B: dua scope sama-sama tampil, analisis-dalam difokus ke racikan aktif.
  //    All-time = mode-scoped semua racikan; Racikan = mode + active-racikan + !suspect
  //    (sama persis scope /report default → briefing rekonsiliasi). DISPLAY-ONLY.
  const openPositions = allPositions.filter(p => !p.closed);
  const modePerf = (lessonsData.performance || []).filter(keepMode);
  const racikanPerf = getModePerformance();
  const racikanLabel = config.activeSetup ? `Racikan aktif: ${config.activeSetup}` : "Racikan aktif";

  // 5. Cost data (LLM + SOL price for gas USD) + gas estimate over the 24h window
  const [costData, balance, credits, wallet] = await Promise.all([
    getOpenRouter24hCost(),
    getOpenRouterBalance(),
    getOpenRouterCredits(),
    getWalletBalances().catch(() => null),
  ]);
  const gasStatsW = getGasStats(last24h.getTime());
  const gasSol = gasStatsW.hasData ? gasStatsW.sol : estimateGasSol(countOnChainActions(last24h.getTime()));
  const gasIsEst = !gasStatsW.hasData;
  const solPrice = wallet?.sol_price || 0;

  // Cost-drag for the quant block: annualize the 24h (gas+LLM) burn over liquid
  // wallet capital. Directional (1d window ×365 is noisy) — null on any gap.
  const llmStats24h = getLlmCostStats(last24h.getTime());
  const modalUsd = wallet?.total_usd || wallet?.sol_usd || null;
  const gasUsd24h = gasSol && solPrice ? gasSol * solPrice : 0;
  const llmUsd24h = llmStats24h.hasData ? llmStats24h.totalCost : 0;
  const costDragPct = modalUsd
    ? computeCostDragPct({ costUsd: gasUsd24h + llmUsd24h, windowDays: 1, modalUsd })
    : null;
  const quantOpts = Number.isFinite(costDragPct) ? { costDragPct } : {};
  // Recs opts (per-trade gas dari window 24h) — dipakai blok deep mana pun.
  const recOpts = {
    gasPerTradeUsd: solPrice && perfLast24h.length ? (gasSol * solPrice) / perfLast24h.length : 0,
  };

  // 6. Format Message
  const lines = [
    "☀️ <b>Morning Briefing</b> (Last 24h)",
    (() => { try { return formatIdentity({ compact: true }); } catch { return null; } })(),
    SEP,
    section(`<b>Activity:</b>`, [
      `📥 Positions Opened: ${openedLast24h.length}`,
      `📤 Positions Closed: ${closedLast24h.length}`,
    ]),
    "",
    section(`<b>Performance (24h):</b>`, [
      `💰 PnL: ${totalPnLUsd >= 0 ? "+" : ""}$${totalPnLUsd.toFixed(2)}`,
      `💎 Fees Earned: $${totalFeesUsd.toFixed(2)}`,
      perfLast24h.length > 0
        ? `📈 Win Rate (24h): ${Math.round((perfLast24h.filter(p => p.pnl_usd > 0).length / perfLast24h.length) * 100)}% (${perfLast24h.length} closed)`
        : "📈 Win Rate (24h): N/A",
    ]),
    "",
    formatPnlTracker(modePerf, { solPriceUsd: solPrice || null }),
    "",
    // All-time (semua racikan) — STATS saja (Opsi B). /briefing alltime → deep (Opsi A).
    // (formatStatsBlock sudah memprefiks 📊 — label cukup teks, distinksi scope jelas.)
    buildScopeBlock(modePerf, "All-time (semua racikan)", { deep: allTimeDeep, quantOpts, recOpts }),
    "",
    // Racikan aktif — STATS + analisis-dalam (verdict/quant/movement/breakdown/recs).
    buildScopeBlock(racikanPerf, racikanLabel, { deep: true, quantOpts, recOpts }),
    racikanScopeDisclosure() || "",
    "",
    section(`<b>Lessons Learned (24h):</b>`, [
      ...(tradingLessons.length > 0
        ? tradingLessons.slice(0, 6).map(l => esc(l.rule))
        : ["No new trading lessons overnight."]),
      ...(configChangeCount > 0 ? [`🔧 Config changes (24h): ${configChangeCount}`] : []),
    ]),
    "",
    section(`<b>Current Portfolio:</b>`, [`📂 Open Positions: ${openPositions.length}`]),
    "",
    buildFeatureStatus(),
    "",
    buildCostSection({ costData, balance, credits, llmStats: getLlmCostStats(last24h.getTime()), gasSol, gasIsEst, solPrice, netPnlUsd: totalPnLUsd, windowLabel: "24h", windowDays: 1 }) || "",
    "",
    buildLearningSection(lessonsData, last24h) || "",
    "",
    buildTimeProfileSection() || "",
    "",
    buildSkipReviewSection() || "",
    "",
    // Opsi B: breakdown + recommendations kini di DALAM blok scope (buildScopeBlock
    // deep) — analisis-dalam terkonsolidasi per-scope, tak lagi berdiri sendiri di bawah.
    SEP
  ];

  // Collapse runs of blank lines left by skipped (null) sections.
  return lines.filter((l, i) => !(l === "" && lines[i - 1] === "")).join("\n");
}

/**
 * Periodic digest (day / week / month) — broader than the daily morning briefing:
 * the full profitability report over the window (stats, verdict, trend, strategy/
 * session/narrative breakdown, recommendations) + activity counts + cost over the
 * window (LLM aggregate from the account + gas estimate). Used by the scheduled
 * weekly/monthly crons and by on-demand /report week|month|day.
 */
export async function generatePeriodicBriefing(period = "week") {
  const days = period === "month" ? 30 : period === "day" ? 1 : 7;
  const meta = { day: ["📈", "Daily"], week: ["📅", "Weekly"], month: ["📆", "Monthly"] }[period] || ["📅", "Weekly"];
  const [emoji, label] = meta;

  const lessonsData = loadJson(LESSONS_FILE) || { performance: [], lessons: [] };
  const state = loadJson(STATE_FILE) || { positions: {} };
  const now = Date.now();
  const since = now - days * 86400000;

  // Mode scope: dry-run → sim rows only, live → real rows only (no cross-mix).
  const keepMode = (p) => (isPaperMode() ? !!p.paper : !p.paper);
  const windowPerf = (lessonsData.performance || []).filter((p) => keepMode(p) && new Date(p.closed_at || p.recorded_at || 0).getTime() >= since);
  // Tracked positions carry no paper flag — the synthetic id prefix marks sim rows.
  const allPositions = Object.values(state.positions || {}).filter((p) => {
    const sim = String(p.position || "").startsWith("paper_");
    return isPaperMode() ? sim : !sim;
  });
  const opened = allPositions.filter((p) => new Date(p.deployed_at).getTime() >= since).length;
  const netPnl = windowPerf.reduce((s, p) => s + (p.pnl_usd || 0), 0);
  // Opsi B: analisis-dalam (report penuh + TREND) difokus ke RACIKAN aktif; window
  // semua-racikan turun jadi blok STATS-only buat rekonsiliasi. Scope sama /report
  // default (getModePerformance = mode + active-racikan + !suspect). DISPLAY-ONLY.
  const racikanWindowPerf = getModePerformance().filter((p) => new Date(p.closed_at || p.recorded_at || 0).getTime() >= since);
  const racikanLabel = config.activeSetup ? `Racikan aktif: ${config.activeSetup} (${days}d)` : `Racikan aktif (${days}d)`;

  const [balance, credits, wallet] = await Promise.all([
    getOpenRouterBalance(),
    getOpenRouterCredits(),
    getWalletBalances().catch(() => null),
  ]);
  const gasStatsW = getGasStats(since);
  const gasSol = gasStatsW.hasData ? gasStatsW.sol : estimateGasSol(countOnChainActions(since));
  const gasIsEst = !gasStatsW.hasData;
  const solPrice = wallet?.sol_price || 0;
  const gasUsd = gasSol && solPrice ? gasSol * solPrice : null;
  // Prefer local per-call LLM tracking (true per-role); fall back to the account
  // usage figure for the window when there's no local data yet.
  const llmStats = getLlmCostStats(since);
  // Paper mode: gas is a simulated would-be-if-live cost, and LLM must come ONLY from
  // local tracking (the account-wide OpenRouter window is shared with the live bot).
  const paper = isPaperMode();
  const llmWindow = period === "month" ? balance?.usageMonthly : period === "week" ? balance?.usageWeekly : balance?.usageDaily;
  const llmTotal = llmStats.hasData ? llmStats.totalCost : (paper ? 0 : (llmWindow ?? 0));

  // Cost-drag (annualized window burn over liquid wallet capital) for the quant block.
  const modalUsd = wallet?.total_usd || wallet?.sol_usd || null;
  const windowCostUsd = (gasUsd ?? 0) + llmTotal;
  const costDragPct = modalUsd ? computeCostDragPct({ costUsd: windowCostUsd, windowDays: days, modalUsd }) : null;

  // Report penuh (stats+verdict+TREND+breakdown+recs) di-scope ke RACIKAN aktif (Opsi B).
  const report = buildTradeReport(racikanWindowPerf, {
    title: `${emoji} ${label} Briefing — last ${days}d`,
    statsLabel: racikanLabel,
    trendN: period === "month" ? 10 : 7,
    identity: (() => { try { return formatIdentity({ compact: true }); } catch { return null; } })(),
    quant: Number.isFinite(costDragPct) ? { costDragPct } : {},
  });

  const costHeader = `<b>💵 Costs (${days}d)${paper ? " — 🧪 simulasi" : ""}:</b>`;
  const costBody = [];
  if (llmStats.hasData) {
    costBody.push(`🤖 LLM: $${llmStats.totalCost.toFixed(4)} (${llmStats.calls} calls)`);
    for (const [role, s] of Object.entries(llmStats.byRole).sort((a, b) => b[1].cost - a[1].cost)) {
      costBody.push(`${role}: $${s.cost.toFixed(4)} (${s.calls} calls)`); // "  •" → branch
    }
  } else if (paper) {
    costBody.push(`🤖 LLM: $0.0000 (belum ada call tercatat lokal)`);
  } else if (llmWindow != null) {
    costBody.push(`🤖 LLM (${period}): $${llmWindow.toFixed(4)}`);
  }
  if (gasSol > 0) {
    const gasTag = paper ? " (simulasi)" : gasIsEst ? " (est)" : "";
    const approx = paper || gasIsEst ? "~" : "";
    costBody.push(`⛽ Gas${gasTag}: ${approx}${gasSol.toFixed(4)} SOL${gasUsd != null ? ` (${approx}$${gasUsd.toFixed(2)})` : ""}${paper ? " — estimasi biaya bila live" : ""}`);
    const reserve = config.management?.gasReserve;
    const dailyBurn = gasSol / days;
    if (reserve > 0 && dailyBurn > 0) {
      const runwayDays = reserve / dailyBurn;
      const mode = config.management?.gasReserveAutoTune ? " (auto-tune)" : " (manual)";
      costBody.push(`🪫 gasReserve ${reserve} SOL${mode} ≈ ${runwayDays.toFixed(0)}d runway @ ${dailyBurn.toFixed(4)} SOL/hari${runwayDays < 7 ? " ⚠️ tipis" : ""}`);
    }
  }
  const totalCost = llmTotal + (gasUsd ?? 0);
  if (totalCost > 0) {
    const real = netPnl - totalCost;
    costBody.push(`📊 Net − biaya${paper ? " (simulasi)" : ""}: PnL ${money(netPnl)} − biaya $${totalCost.toFixed(4)} = ${money(real)} ${real >= 0 ? "✅" : "🔴"}`);
  }
  if (credits?.balance != null) costBody.push(`💳 Saldo OpenRouter: $${credits.balance.toFixed(2)}`);

  const parts = [
    report,
    racikanScopeDisclosure() || null,
    // Window semua-racikan → STATS-only (rekonsiliasi); analisis-dalam ada di report racikan.
    formatStatsBlock(computeTradeStats(windowPerf), `Semua racikan (${days}d)`),
    formatPnlTracker((lessonsData.performance || []).filter(keepMode), { solPriceUsd: solPrice || null }) || null,
    section(`<b>Activity (${days}d):</b>`, [`📥 ${opened} opened`, `📤 ${windowPerf.length} closed`]),
    buildFeatureStatus(),
    costBody.length ? section(costHeader, costBody) : null,
    buildTimeProfileSection(),
  ];
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Milestone learning report render (every N closes). Komposisi render diekstrak dari
 * index.js (file panas) ke sini (file aman) — index.js tinggal panggil 1-baris +
 * orkestrasi (counter/dedup/send). Tree-style otomatis lewat buildTradeReport (FASE 1).
 * SEMUA field dipertahankan (title/statsLabel/trendN/identity identik dgn versi inline).
 */
export function buildMilestoneReport(perf, milestone) {
  return buildTradeReport(perf, {
    title: `🎓 Learning Report — ${milestone} closed positions`,
    statsLabel: "All-time",
    trendN: config.reports?.learningReportTrendN ?? 10,
    identity: formatIdentity(),
  });
}

function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    log("briefing_error", `Failed to read ${file}: ${err.message}`);
    return null;
  }
}
