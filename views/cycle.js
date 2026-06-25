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
  fmtMoney, fmtPct, fmtAge,
} from "./format.js";

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
      `${ICON.pnl} PnL: ${fmtPct(p.pnl_pct) || "?"}`,
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
