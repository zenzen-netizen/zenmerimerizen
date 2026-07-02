/**
 * views/cycle.js — builder pure utk PESAN SIKLUS (management & screening) ke Telegram/CLI.
 * Phase 🅴 Batch F (penutup).
 *
 * PLAIN TEXT, bukan HTML. Pesan siklus mengalir lewat createLiveMessage.finalize →
 * editMessage/sendMessage TANPA parse_mode → JANGAN pakai esc()/tag HTML di sini.
 * Primitif tree (├/└), ICON (emoji), SEP (━), fmt* aman plain-text.
 *
 * Render-only. Logika siklus/gate/sizing/exit tetap di index.js — di sini cuma
 * scaffolding TEKS-TETAP (skip/funnel/no-deploy/reportLines/Summary/confirm-prompt).
 * OUTPUT-LLM (teks-bebas) cuma DIBINGKAI header, tak pernah di-template/parse.
 *
 * Unit ◎/$ ikut solMode (governing rule unit) — fmtMoney/fmtMoneySigned dari format.js.
 * Vocab anti-halu `🚀 DEPLOYED`/`⛔ NO DEPLOY` (regex guard index.js) JANGAN diubah —
 * blok lone-candidate di sini sengaja memakai literal `⛔ NO DEPLOY`.
 */

import {
  ICON, SEP, tree, numEmoji,
  fmtMoney, fmtPct, fmtAge, fmtWib, pnlMark,
} from "./format.js";

// Judul envelope siklus (single-source — live-message title + fallback non-live).
// Dipakai 4 titik di index.js (2 createLiveMessage + 2 sendMessage fallback) supaya
// teks judul tak tersebar literal. NOL ubah alur live/finalize (cuma nilai literal → konstanta).
export const CYCLE_TITLE = { mgmt: "🔄 Management Cycle", screen: "🔍 Screening Cycle" };

// ── Management cycle ───────────────────────────────────────────────────────────

/** Status terakhir per-posisi (branch └) dari aksi deterministik. */
function statusLine(act) {
  const a = act?.action || "STAY";
  if (a === "STAY") return `${ICON.stay} STAY`;
  if (a === "CLAIM") return `${ICON.fee} CLAIM fees`;
  if (a === "INSTRUCTION") return `${ICON.brain} HOLD (instruction)`;
  if (a === "CLOSE") {
    if (act.rule === "exit") return `${ICON.warn} CLOSE — ${ICON.bolt} Trailing TP: ${act.reason}`;
    if (act.rule) return `${ICON.warn} CLOSE — Rule ${act.rule}: ${act.reason}`;
    return `${ICON.warn} CLOSE`;
  }
  return a;
}

/**
 * Laporan JS siklus management (scaffolding TEKS-TETAP, tanpa output LLM).
 * Header ringkas (jumlah/value/fees) + tree per posisi + baris aksi.
 * @param {Array} positions  positionData (butuh .position key + field tampilan)
 * @param {Map|object} actionMap  position → { action, rule, reason }
 * @param {object} cfg  config (solMode)
 */
export function buildMgmtReport(positions, actionMap, cfg) {
  const solMode = !!cfg?.management?.solMode;
  const ps = positions || [];
  const get = (pos) => (actionMap?.get ? actionMap.get(pos) : actionMap?.[pos]) || { action: "STAY" };

  let totalValue = 0, totalUnclaimed = 0;
  const body = [];
  ps.forEach((p, i) => {
    const act = get(p.position);
    totalValue += p.total_value_usd ?? 0;
    totalUnclaimed += p.unclaimed_fees_usd ?? 0;

    const state = p.in_range ? `${ICON.inRange} IN` : `${ICON.oor} OOR ${p.minutes_out_of_range ?? 0}m`;
    body.push(`${numEmoji(i + 1)} ${p.pair || "?"} · ${state}`);
    body.push(tree([
      `${ICON.time} Age: ${fmtAge(p.age_minutes)}`,
      `${ICON.value} Val: ${fmtMoney(p.total_value_usd, solMode)} · unclaimed ${fmtMoney(p.unclaimed_fees_usd, solMode)}`,
      `${pnlMark(p.pnl_pct)} PnL: ${fmtPct(p.pnl_pct) || "?"}`,
      `${ICON.yield} Yield: ${p.fee_per_tvl_24h ?? "?"}%`,
      p.instruction ? `Note: "${p.instruction}"` : null,
      statusLine(act),
    ]));
  });

  // Ringkasan aksi (mirror logika lama: STAY dikecualikan; INSTRUCTION → EVAL).
  const actions = ps
    .map((p) => get(p.position))
    .filter((a) => a.action !== "STAY")
    .map((a) => a.action === "INSTRUCTION" ? "EVAL instruction" : `${a.action}${a.reason ? ` (${a.reason})` : ""}`);
  const actionSummary = actions.length ? actions.join(", ") : "no action";

  const head = `${ICON.position} ${ps.length} ${ps.length === 1 ? "position" : "positions"} · ${fmtMoney(totalValue, solMode)} · fees ${fmtMoney(totalUnclaimed, solMode)}`;
  return [head, SEP, ...body, SEP, `${ICON.rule} Actions: ${actionSummary}`].join("\n");
}

/**
 * Bingkai output-LLM management (teks-bebas "one-line result per position") di
 * bawah scaffolding JS — HEADER saja, isi apa adanya (JANGAN di-template/parse).
 * Kosong/whitespace → "" (tak menambah apa-apa).
 */
export function frameMgmtResult(content) {
  if (!content || !String(content).trim()) return "";
  return `\n\n${SEP}\n${ICON.tools} Hasil aksi\n${content}`;
}

// ── Screening cycle ────────────────────────────────────────────────────────────

/** Footer satu-baris siklus DILEWATI (skip). Plain text. */
export function cycleSkip(detail) {
  return `${ICON.skip} ${detail}`;
}

/** Footer satu-baris siklus GAGAL/error. Plain text. */
export function cycleFail(detail) {
  return `${ICON.warn} ${detail}`;
}

/**
 * "No candidates available" + varian (funnel / contoh terfilter / thresholds).
 * Prioritas mirror logika lama: funnel > examples > thresholds.
 * @param {object} o
 * @param {string|null} o.funnel       buildGmgnFunnelReport (string) atau null
 * @param {Array<{name,reason}>} o.examples  contoh kandidat terfilter (≤5)
 * @param {Array<string>} o.thresholds baris threshold (mode "all filtered")
 */
export function buildNoCandidates({ funnel = null, examples = [], thresholds = [] } = {}) {
  const head = `${ICON.skip} No candidates available`;
  if (funnel) return `${head}\n${SEP}\n${funnel}`;
  if (examples.length) {
    return `${head}\n${SEP}\nFiltered examples:\n${tree(examples.map((e) => `${e.name}: ${e.reason}`))}`;
  }
  if (thresholds.length) {
    return `${head} (all filtered)\n${SEP}\nThresholds:\n${tree(thresholds)}`;
  }
  return `${head} (all filtered)`;
}

/**
 * Blok ⛔ NO DEPLOY single-candidate (semua tersaring, sisa 1 tak layak deploy).
 * VOCAB `⛔ NO DEPLOY` LITERAL (anti-halu) — JANGAN diubah.
 * funnel di-append dgn pemisah lama ───────────── (kompat tampilan).
 */
export function buildLoneNoDeploy({ candidateName = "unknown", skipReason = "", funnel = null } = {}) {
  const block = [
    "⛔ NO DEPLOY",
    SEP,
    "Cycle finished with no valid entry.",
    tree([
      `${ICON.best} Best: ${candidateName}`,
      `${ICON.warn} Why skipped: only one candidate survived filtering, but it was not worth deploying: ${skipReason}.`,
      `Rejected: ${candidateName} — ${skipReason}`,
    ]),
  ].join("\n");
  return funnel ? `${block}\n\n─────────────\n${funnel}` : block;
}

// ── Daftar kandidat (permukaan MANUAL: /screen, /candidates TG cache, REPL fetch) ──

/**
 * Cache kandidat KOSONG (belum pernah /screen). SENGAJA beda dari buildNoCandidates
 * (yang = "sudah screen, 0 yang lolos") — distingsi semantik dijaga (recon governing #4).
 */
export function buildNoCache() {
  return `${ICON.skip} No cached candidates yet — run /screen first.`;
}

/** Baris-metrik satu kandidat (field OPSIONAL → cuma yang ada). Metrik pool eksternal
 *  ($ vol / % fee-aTVL / organic / in-range), BUKAN modal kita → tak ikut solMode. */
function candidateLines(p) {
  const feeTvl = p.fee_active_tvl_ratio ?? p.fee_tvl_ratio;
  const volRaw = p.volume_window ?? p.volume_24h;
  const vol = Number.isFinite(Number(volRaw)) ? `$${(Number(volRaw) / 1000).toFixed(1)}k` : null;
  const metrics = [
    feeTvl != null ? `fee/aTVL ${feeTvl}%` : null,
    vol ? `vol ${vol}` : null,
  ].filter(Boolean).join(" · ");
  // Sumber kepercayaan: GMGN (smart/KOL/fee) bila pool gmgn, else organic + in-range.
  const src = p.gmgn
    ? `GMGN smart ${p.gmgn_smart_wallets ?? "?"}, KOL ${p.gmgn_kol_wallets ?? "?"}, fee ${p.gmgn_total_fee_sol ?? "?"} SOL`
    : [
        p.active_pct != null ? `in-range ${p.active_pct}%` : null,
        p.organic_score != null ? `organic ${p.organic_score}` : null,
      ].filter(Boolean).join(" · ");
  return [
    p.pool ? `pool: ${p.pool}` : null,
    metrics || null,
    src || null,
  ].filter(Boolean);
}

/**
 * Daftar kandidat utk permukaan MANUAL. Pure, plain-text, gaya 🅴 (numEmoji header +
 * tree per kandidat). Field OPSIONAL → cuma yang ada dirender (NOL detail hilang per
 * permukaan; permukaan yg dulu tak punya addr/in-range tetap valid). Satu builder utk
 * /screen, /candidates cache, REPL fetch → gap render-ganda (JG-1/JG-2) hilang.
 * @param {Array} candidates
 * @param {{updatedAt?:number|string|null}} opts  updatedAt (ms ATAU ISO string) → "· updated <WIB>".
 */
export function buildCandidateList(candidates, { updatedAt = null } = {}) {
  const cs = candidates || [];
  const ms = updatedAt == null ? null : (typeof updatedAt === "string" ? Date.parse(updatedAt) : Number(updatedAt));
  const upd = Number.isFinite(ms) ? ` · updated ${fmtWib(ms)}` : "";
  const head = `${ICON.briefing} Top candidates (${cs.length})${upd}`;
  const blocks = cs.map((p, i) => `${numEmoji(i + 1)} ${p.name || "unknown"}\n${tree(candidateLines(p))}`);
  return [head, SEP, ...blocks].join("\n");
}

// ── Confirm-gate (display ⟂ logika; lihat recon §D) ─────────────────────────────

/**
 * Ringkasan satu-aksi untuk prompt konfirmasi (deploy/close/claim/swap).
 * PURE/DEFENSIVE: bentuk arg aneh tetap menghasilkan baris terbaca (tak pernah throw).
 * Vocab header (🚀/🔻/💰/🔁) dipertahankan apa adanya; cuma sub-baris jadi tree.
 */
export function summarizeTradeAction(toolName, args = {}) {
  const a = args || {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const shortAddr = (x) => (typeof x === "string" && x.length > 12 ? `${x.slice(0, 4)}…${x.slice(-4)}` : (x ?? "?"));
  if (toolName === "deploy_position") {
    const amt = num(a.amount_y) ?? num(a.amount_sol) ?? num(a.amount_x);
    return `🚀 BUKA POSISI (deploy)\n${tree([
      `pool: ${shortAddr(a.pool_address)}`,
      `◎ ${amt ?? "?"} SOL${a.strategy ? ` | ${a.strategy}` : ""}`,
    ])}`;
  }
  if (toolName === "close_position") {
    return `🔻 TUTUP POSISI (close)\n${tree([
      `position: ${shortAddr(a.position_address)}`,
      a.reason ? `reason: ${a.reason}` : null,
    ])}`;
  }
  if (toolName === "claim_fees") {
    return `💰 CLAIM FEES\n${tree([`position: ${shortAddr(a.position_address)}`])}`;
  }
  if (toolName === "swap_token") {
    return `🔁 SWAP TOKEN\n${tree([`${num(a.amount) ?? "?"} ${shortAddr(a.input_mint)} → ${shortAddr(a.output_mint)}`])}`;
  }
  return `${toolName}\n${JSON.stringify(a).slice(0, 200)}`;
}

/** Diff update_config sebagai tree: "key: current → val" per baris. */
export function buildConfigDiff(entries = []) {
  return tree((entries || []).map((e) => `${e.key}: ${e.current ?? "unset"} → ${e.val}`));
}

// Edit pasca-aksi (display saja; netral utk trade & config). Single-source.
export const CONFIRM_OK = "✅ Confirmed — executing…";
export const CONFIRM_NO = "❌ Cancelled — no action taken.";
export const CONFIRM_EXPIRED = "⏰ Expired — no action taken.";