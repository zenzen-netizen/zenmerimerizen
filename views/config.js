/**
 * views/config.js — renderer /config (Phase 3 🅴, Batch E). Render-only.
 *
 * DUA mode atas SATU sumber data (rowMap dari buildConfigRowMap, index.js):
 *   - mode "function" → default `/config`: dikelompokkan per FUNGSI (praktis harian),
 *     tiap baris ditandai ASAL-nya (⚙️ origin dev / 🧩 add by zen). Layout =
 *     FUNCTION_GROUPS (config-origin.js). Identitas (Profil/Racikan) di header.
 *   - mode "origin"   → `/config origin`: dikelompokkan per ASAL (4-lapis L1 seksi →
 *     L2 grup ▸ → L3 sub-cluster → L4 ↳ anak), port tree-style dari formatFullConfig.
 *     Layout = ORIGIN_SECTIONS + SUB_CLUSTER_META + KEY_SUBCLUSTER + L4_CHILDREN.
 *
 * NOL pengurangan detail: kedua mode pakai value-string verbatim dari rowMap +
 * inline ORIGIN_NOTES. Safety-net "❓ Belum terpetakan" menjamin tak ada key yang
 * hilang diam-diam (old count == new count). Plain text (no HTML) — dikirim via
 * sendMessage yang auto-split @4096; render(... ,"plain") identik (tak ada tag).
 */

import { ICON, SEP } from "./format.js";
import {
  FUNCTION_GROUPS, KEY_ORIGIN, ORIGIN_SECTIONS, ORIGIN_NOTES,
  SUB_CLUSTER_META, KEY_SUBCLUSTER, L4_CHILDREN,
} from "../config-origin.js";

const MARK = { dev: ICON.dev, zen: ICON.zen }; // ⚙️ / 🧩
const note = (k) => (ORIGIN_NOTES[k] ? ` ${ORIGIN_NOTES[k]}` : "");

/**
 * @param input {
 *   mode: "function" | "origin",
 *   rowMap,            // { key → [label, valueString] } dari buildConfigRowMap
 *   identity,          // string 2-baris (🧬 Profil / 🗂️ Racikan) — formatIdentityLines
 *   racikanName,       // nama racikan aktif untuk header ("—" bila belum load)
 *   screeningSource,   // untuk hint aktif/nonaktif blok GMGN (mode function)
 *   subgroupDesc,      // (mode origin) fn(sgId, baseDesc) → desc dinamis (GMGN flip)
 * }
 */
export function buildView(input) {
  return { type: "config", mode: input.mode || "function", ...input };
}

export function telegram(vm) {
  return vm.mode === "origin" ? renderOrigin(vm) : renderFunction(vm);
}

// ── mode "function" — default /config ────────────────────────────────────────
function renderFunction(vm) {
  const { rowMap } = vm;
  const placed = new Set();
  const out = [`${ICON.tools} Config · 🗂 ${vm.racikanName || "—"}`, SEP];

  // Identitas (Profil + Racikan, dengan status edit ✎) — verbatim dari index.js.
  if (vm.identity) out.push(vm.identity, SEP);

  for (const g of FUNCTION_GROUPS) {
    const rows = [];
    for (const k of g.keys) {
      if (!rowMap[k]) continue;
      placed.add(k);
      const [label, value] = rowMap[k];
      rows.push(`${MARK[KEY_ORIGIN[k]] || "·"} ${label}: ${value}${note(k)}`);
    }
    if (!rows.length) continue;
    let head = `${g.emoji} ${g.title}`;
    // Hint hidup blok GMGN (mempertahankan detail aktif/nonaktif dari subgroupDesc).
    if (g.gmgnDynamic && vm.screeningSource != null) {
      head += String(vm.screeningSource).toLowerCase() === "gmgn"
        ? " · 🟢 aktif (source=gmgn)"
        : ` · ⚪ nonaktif (source=${vm.screeningSource})`;
    }
    out.push(head, treeRows(rows));
  }

  // Safety-net: rowMap key yang tak ter-grup mana pun tetap tampil (nol hilang).
  const orphans = Object.keys(rowMap).filter((k) => !placed.has(k));
  if (orphans.length) {
    out.push("❓ Belum terpetakan (auto — cek config-origin.js)",
      treeRows(orphans.map((k) => { const [l, v] = rowMap[k]; return `${MARK[KEY_ORIGIN[k]] || "·"} ${l}: ${v}${note(k)}`; })));
  }

  out.push(SEP,
    "Legenda: 🧩 custom by Zen · ⚙️ origin dev · 🟢 on · ⚪ off",
    `${ICON.arrow} /config origin (per-asal) · /config core (ringkas) · /guide (detail)`);
  return out.join("\n");
}

/** Susun baris jadi tree ├/└ (terakhir └). Array kosong → "". */
function treeRows(rows) {
  const xs = (rows || []).filter(Boolean);
  return xs.map((r, i) => `${i === xs.length - 1 ? "└" : "├"} ${r}`).join("\n");
}

// ── mode "origin" — /config origin (4-lapis, tree-style) ─────────────────────
// Port struktur penuh formatFullConfig (L1 seksi → L2 grup → L3 sub-cluster →
// L4 ↳ anak) ke gaya tree, plus safety-net orphan. Layout/placement tetap milik
// config-origin.js; value tetap dari rowMap.
function renderOrigin(vm) {
  const { rowMap } = vm;
  const placed = new Set();

  const sectionBlocks = ORIGIN_SECTIONS.map((sec) => {
    const subBlocks = sec.subgroups.map((sg) => {
      if (sg.identity) {
        const body = (vm.identity || "🧬 Profil: —\n🗂️ Racikan: —").split("\n").map((l) => `    ${l}`).join("\n");
        return `▸ ${sg.title} · ${sg.desc}\n${body}`;
      }
      const { text, placed: pl } = renderSubclusterRows(sg.keys, rowMap);
      pl.forEach((k) => placed.add(k));
      const desc = vm.subgroupDesc ? vm.subgroupDesc(sg.id, sg.desc) : sg.desc;
      return `▸ ${sg.title} · ${desc}\n${text}`;
    });
    return `${SEP}\n${sec.title} — ${sec.blurb}\n${SEP}\n\n${subBlocks.join("\n\n")}`;
  });

  const orphans = Object.keys(rowMap).filter((k) => !placed.has(k));
  if (orphans.length) {
    const rows = orphans.map((k) => { const [label, value] = rowMap[k]; return `    ${label}: ${value}${note(k)}`; });
    sectionBlocks.push(`▸ ❓ Belum terpetakan (auto — cek config-origin.js)\n${rows.join("\n")}`);
  }

  const intro = `${ICON.tools} Config — per ASAL (⚙️ Origin Dev vs 🧩 Add by zen)\nLegenda: 🟢 on · ⚪ off · ↳ anak setelan · per-fungsi → /config · ringkas → /config core`;
  const outro = "Ubah lewat /settings (menu tombol) atau chat biasa. Detail tiap setting: ketik /guide";
  return `${intro}\n\n${sectionBlocks.join("\n\n\n")}\n\n${outro}`;
}

// Bucket key per sub-cluster (first-seen), header L3 bila >1 cluster, indent L4 ↳.
// MIRROR renderSubclusterRows (index.js) — satu sumber layout, beda cuma gaya
// pemanggilan (di sini render-only, value dari rowMap yang sama).
function renderSubclusterRows(keys, rowMap) {
  const dash = "┈┈┈┈┈┈┈┈┈┈";
  const order = [];
  const members = {};
  for (const k of keys) {
    if (!rowMap[k]) continue;
    const cl = KEY_SUBCLUSTER[k] || "_misc";
    if (!members[cl]) { members[cl] = []; order.push(cl); }
    members[cl].push(k);
  }
  const showL3 = order.length > 1;
  const out = [];
  const placed = [];
  for (const cl of order) {
    const meta = SUB_CLUSTER_META[cl];
    if (showL3 && meta) {
      out.push(`  ${meta.emoji} ${meta.label}`);
      out.push(`  ${dash}`);
    }
    for (const k of members[cl]) {
      placed.push(k);
      const [label, value] = rowMap[k];
      const indent = L4_CHILDREN.has(k) ? "      ↳ " : "    ";
      out.push(`${indent}${label}: ${value}${note(k)}`);
    }
  }
  return { text: out.join("\n"), placed };
}
