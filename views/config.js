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

  // Tiap grup fungsi → renderSubclusterRows (marked): sub-cluster L3 + anak ↳ L4
  // dipertahankan, key dev+zen TERCAMPUR dalam sub-cluster (KEY_SUBCLUSTER lintas-
  // asal), tiap baris diberi marker ⚙️/🧩. Cuma split L1 DEV/ZEN yang hilang.
  for (const g of FUNCTION_GROUPS) {
    const { text, placed: pl } = renderSubclusterRows(g.keys, rowMap, true);
    if (!pl.length) continue;
    pl.forEach((k) => placed.add(k));
    let head = `▸ ${g.emoji} ${g.title}`;
    // Hint hidup blok GMGN (mempertahankan detail aktif/nonaktif dari subgroupDesc).
    if (g.gmgnDynamic && vm.screeningSource != null) {
      head += String(vm.screeningSource).toLowerCase() === "gmgn"
        ? " · 🟢 aktif (source=gmgn)"
        : ` · ⚪ nonaktif (source=${vm.screeningSource})`;
    }
    out.push(head, text);
  }

  // Safety-net: rowMap key yang tak ter-grup mana pun tetap tampil (nol hilang).
  const orphans = Object.keys(rowMap).filter((k) => !placed.has(k));
  if (orphans.length) {
    const rows = orphans.map((k) => { const [l, v] = rowMap[k]; return `    ${MARK[KEY_ORIGIN[k]] || "·"} ${l}: ${v}${note(k)}`; });
    out.push("▸ ❓ Belum terpetakan (auto — cek config-origin.js)", rows.join("\n"));
  }

  out.push(SEP,
    "Legenda: 🧩 custom by Zen · ⚙️ origin dev · 🟢 on · ⚪ off · ↳ anak setelan",
    `${ICON.arrow} /config origin (dipisah per-asal) · /config core (ringkas) · /guide (detail)`);
  return out.join("\n");
}

// ── mode "origin" — /config origin (4-lapis, tree-style, Zen di atas) ─────────
// Port struktur penuh formatFullConfig (L1 seksi → L2 grup ▸ → L3 sub-cluster →
// L4 ↳ anak) ke gaya tree, plus count per-asal + safety-net orphan. Layout/
// placement tetap milik config-origin.js; value tetap dari rowMap. Urutan seksi
// di-ZEN-dulu (brief) tanpa mengubah array ORIGIN_SECTIONS (dipakai /settings).
function renderOrigin(vm) {
  const { rowMap } = vm;
  const placed = new Set();
  // Zen di atas, Dev di bawah — salinan lokal, tak menyentuh sumber.
  const ordered = [...ORIGIN_SECTIONS].sort((a, b) => (a.id === "zen" ? -1 : 1) - (b.id === "zen" ? -1 : 1));

  const sectionBlocks = ordered.map((sec) => {
    let secCount = 0;
    const subBlocks = sec.subgroups.map((sg) => {
      if (sg.identity) {
        const body = (vm.identity || "🧬 Profil: —\n🗂️ Racikan: —").split("\n").map((l) => `    ${l}`).join("\n");
        return `▸ ${sg.title} · ${sg.desc}\n${body}`;
      }
      const { text, placed: pl } = renderSubclusterRows(sg.keys, rowMap);
      pl.forEach((k) => placed.add(k));
      secCount += pl.length;
      const desc = vm.subgroupDesc ? vm.subgroupDesc(sg) : sg.desc;
      return `▸ ${sg.title} · ${desc}\n${text}`;
    });
    return `${SEP}\n${sec.title} · ${secCount} — ${sec.blurb}\n${SEP}\n\n${subBlocks.join("\n\n")}`;
  });

  const orphans = Object.keys(rowMap).filter((k) => !placed.has(k));
  if (orphans.length) {
    const rows = orphans.map((k) => { const [label, value] = rowMap[k]; return `    ${label}: ${value}${note(k)}`; });
    sectionBlocks.push(`▸ ❓ Belum terpetakan (auto — cek config-origin.js)\n${rows.join("\n")}`);
  }

  const intro = `${ICON.tools} Config by origin · 🗂 ${vm.racikanName || "—"}\nLegenda: 🟢 on · ⚪ off · ↳ anak setelan · per-fungsi → /config · ringkas → /config core`;
  const outro = "Ubah lewat /settings (menu tombol) atau chat biasa. Detail tiap setting: ketik /guide";
  return `${intro}\n\n${sectionBlocks.join("\n\n\n")}\n\n${outro}`;
}

// Bucket key per sub-cluster (first-seen), header L3 bila >1 cluster, indent L4 ↳.
// MIRROR renderSubclusterRows (index.js) — satu sumber layout. `marked=true`
// (view fungsi) menyisipkan marker asal ⚙️/🧩 di depan label tiap key; origin view
// (marked=false) tidak (asal = sumbu pengelompokannya). Value verbatim dari rowMap.
function renderSubclusterRows(keys, rowMap, marked = false) {
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
      if (!marked) out.push(`  ${dash}`); // divider ┈ hanya gaya lama (origin)
    }
    const mems = members[cl];
    if (marked) {
      // Gaya tree (view fungsi): induk (non-L4) dapat ├/└ — └ = induk TERAKHIR di
      // sub-cluster ini; anak ↳ (L4) di-indent di bawah induknya, marker tetap,
      // tanpa ├/└ (anak tak ikut dihitung dalam urutan ├/└). Header sub-cluster tetap.
      const induks = mems.filter((k) => !L4_CHILDREN.has(k));
      let seenInduk = 0;
      for (const k of mems) {
        placed.push(k);
        const [label, value] = rowMap[k];
        const mk = `${MARK[KEY_ORIGIN[k]] || "·"} `;
        if (L4_CHILDREN.has(k)) {
          out.push(`    ↳ ${mk}${label}: ${value}${note(k)}`);
        } else {
          seenInduk++;
          const branch = seenInduk === induks.length ? "└" : "├";
          out.push(`  ${branch} ${mk}${label}: ${value}${note(k)}`);
        }
      }
    } else {
      // Gaya lama (origin, marked=false): indent 4-spasi / ↳ 6-spasi, tanpa marker.
      for (const k of mems) {
        placed.push(k);
        const [label, value] = rowMap[k];
        const indent = L4_CHILDREN.has(k) ? "      ↳ " : "    ";
        out.push(`${indent}${label}: ${value}${note(k)}`);
      }
    }
  }
  return { text: out.join("\n"), placed };
}
