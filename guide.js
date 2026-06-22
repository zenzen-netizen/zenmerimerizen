// guide.js — Live reader for SETTINGS-GUIDE.md.
//
// One source, two doors: both the Telegram and the terminal `/guide` command
// call renderGuide(). The guide is read from disk on EVERY call, so editing
// SETTINGS-GUIDE.md is reflected instantly — no code change, no restart.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SEP, tree } from "./views/format.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIDE_PATH = path.join(__dirname, "SETTINGS-GUIDE.md");

const MAX_SEARCH_HITS = 12; // beyond this, list names instead of dumping bodies

function readGuideRaw() {
  return fs.readFileSync(GUIDE_PATH, "utf8");
}

// Split the doc on H1 (`# `) boundaries. blocks[0] is the title + intro
// (the `## Cara Ubah Setting` / `## Struktur` part); blocks[1..] are the
// navigable sections (GRUP 1..N plus the trailing reference sections).
function parseBlocks() {
  const lines = readGuideRaw().split("\n");
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (/^# (?!#)/.test(line)) {
      if (current) blocks.push(current);
      current = { title: line.replace(/^#\s+/, "").trim(), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// blocks[1..] as { num, title, short, raw }. `short` drops the "GRUP N — "
// prefix so the TOC number isn't redundant.
function getSections() {
  const blocks = parseBlocks();
  return blocks.slice(1).map((b, i) => ({
    num: i + 1,
    title: b.title,
    short: b.title.replace(/^GRUP\s+\d+\s*[—–-]\s*/i, "").trim(),
    raw: b.lines.join("\n").trim(),
  }));
}

// Collapse a markdown table row to plain text. "| Label | 5 |" → "Label: 5".
// Separator rows ("|---|---|") and fully-empty rows ("| | |") drop to null.
function tableRowToPlain(line) {
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.every((c) => c === "" || /^:?-+:?$/.test(c))) return null;
  const [a, b] = cells;
  if (cells.length === 2) return b ? (a ? `${a}: ${b}` : b) : a;
  return cells.filter(Boolean).join(" — ");
}

// Light markdown → plain text for Telegram/terminal (no parse_mode used).
function plainify(md) {
  return md
    .split("\n")
    .filter((l) => !/^```/.test(l)) // drop code-fence markers, keep content
    .map((l) => {
      const h = /^(#{1,6})\s+(.*)$/.exec(l);
      if (h) return h[1].length >= 3 ? `• ${h[2]}` : h[2]; // mark per-key headings
      if (/^\s*\|.*\|\s*$/.test(l)) return tableRowToPlain(l); // table row → label: value
      return l;
    })
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1") // strip bold
    .replace(/`([^`]+)`/g, "$1") // strip inline-code backticks
    .replace(/\n{3,}/g, "\n\n") // collapse blank runs
    .trim();
}

function guideToc() {
  const blocks = parseBlocks();
  const title = blocks[0]?.title || "Panduan Setting";
  const sections = getSections();
  const list = tree(sections.map((s) => `${String(s.num).padStart(2, " ")}. ${s.short}`));
  return [
    `📘 ${title}`,
    SEP,
    list,
    SEP,
    "Ketik /guide <no> untuk buka satu bagian (mis. /guide 5)",
    "Ketik /guide <katakunci> untuk cari (mis. /guide claim)",
    "Ketik /guide all untuk tampilkan semua",
  ].join("\n");
}

function guideSection(num) {
  const sections = getSections();
  const sec = sections.find((s) => s.num === num);
  if (!sec) {
    return `Bagian ${num} tidak ada. Ketik /guide untuk lihat daftar (1–${sections.length}).`;
  }
  return plainify(sec.raw);
}

// Collect every `### key` block, tagged with its parent GRUP title.
function getKeyBlocks() {
  const lines = readGuideRaw().split("\n");
  const out = [];
  let group = "";
  let current = null;
  const flush = () => {
    if (current) out.push(current);
    current = null;
  };
  for (const line of lines) {
    if (/^# (?!#)/.test(line)) {
      flush();
      group = line.replace(/^#\s+/, "").trim();
    } else if (/^###\s+/.test(line)) {
      flush();
      current = { group, heading: line.replace(/^###\s+/, "").trim(), lines: [line] };
    } else if (/^##\s+/.test(line)) {
      flush();
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return out;
}

function guideSearch(query) {
  const kw = query.toLowerCase();
  const sections = getSections();

  // 1) Topic-level: a GRUP title contains the keyword → return whole group(s).
  const titleHits = sections.filter((s) => s.title.toLowerCase().includes(kw));
  if (titleHits.length) {
    return titleHits.map((s) => plainify(s.raw)).join(`\n\n${SEP}\n\n`);
  }

  // 2) Key-level: `### key` heading contains the keyword.
  const keyHits = getKeyBlocks().filter((b) => b.heading.toLowerCase().includes(kw));
  if (keyHits.length === 0) {
    return `Tidak ada yang cocok dengan "${query}". Ketik /guide untuk lihat daftar bagian.`;
  }
  if (keyHits.length > MAX_SEARCH_HITS) {
    const names = keyHits.map((b) => `• ${b.heading}  (${b.group})`).join("\n");
    return `🔎 ${keyHits.length} hasil untuk "${query}" — perjelas kata kuncinya:\n\n${names}`;
  }
  const header = keyHits.length === 1 ? "" : `🔎 ${keyHits.length} hasil untuk "${query}":\n\n`;
  return (
    header +
    keyHits
      .map((b) => `📘 ${b.group}\n\n${plainify(b.lines.join("\n"))}`)
      .join(`\n\n${SEP}\n\n`)
  );
}

// Single entry point shared by Telegram + terminal. Returns a plain string.
export function renderGuide(arg) {
  const a = (arg || "").trim();
  try {
    if (!a) return guideToc();
    if (a.toLowerCase() === "all") return plainify(readGuideRaw());
    if (/^\d+$/.test(a)) return guideSection(parseInt(a, 10));
    return guideSearch(a);
  } catch (e) {
    return `Gagal baca panduan (SETTINGS-GUIDE.md): ${e.message}`;
  }
}
