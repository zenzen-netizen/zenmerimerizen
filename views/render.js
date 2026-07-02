/**
 * views/render.js — dispatcher renderer (Phase 2 workstream 🅴).
 *
 * Satu view-model netral-format → DUA target:
 *   - "telegram" : string HTML (kirim via sendHTML).
 *   - "plain"    : struktur tree dipertahankan, tag HTML dibuang (untuk REPL).
 *
 * Tiap tipe view didaftarkan di RENDERERS. Renderer per-tipe hidup di file
 * sendiri (mis. views/positions.js) supaya satu file = satu pesan.
 */

import * as positions from "./positions.js";
import * as status from "./status.js";
import * as wallet from "./wallet.js";
import * as pool from "./pool.js";
import * as config from "./config.js";

// type -> { telegram(vm) -> string }. plain di-derive dari telegram via stripHtml.
const RENDERERS = {
  positions,
  status,
  wallet,
  pool,
  config,
};

/** Buang tag HTML tapi pertahankan struktur tree/baris (untuk REPL plain).
 *  Decode entity dasar setelah strip supaya teks yang sengaja di-escape
 *  (mis. placeholder "&lt;n&gt;" pada hint) balik jadi "<n>" di REPL. */
function stripHtml(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Render view-model ke target.
 * @param {{type:string}} view  view-model (punya `type`)
 * @param {"telegram"|"plain"} target
 */
export function render(view, target = "telegram") {
  const r = RENDERERS[view?.type];
  if (!r || typeof r.telegram !== "function") {
    throw new Error(`no renderer for ${view?.type}`);
  }
  const html = r.telegram(view);
  return target === "plain" ? stripHtml(html) : html;
}
