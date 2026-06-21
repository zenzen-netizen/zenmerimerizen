/**
 * views/format.js — primitif format presentasi (Phase 2 workstream 🅴).
 *
 * Tujuan: encode invariant tampilan SEKALI di sini supaya tiap renderer (`views/*`)
 * konsisten. Zona merge-safe (file baru, di luar jalur upstream). MURNI string —
 * tanpa SDK / I/O / money-logic.
 *
 * ATURAN UNIT MATA UANG (terkunci, governing rule #3):
 *   solMode on  → "◎"  ·  solMode off → "$"  — berlaku PnL/saldo/value/fee.
 * Catatan data: field `*_usd` dari getMyPositions SUDAH berisi nilai SOL saat
 * solMode on (dlmm.js:2009-2035) — jadi angka "mode-correct" tinggal diberi simbol;
 * untuk pesan yang memang memegang DUA angka (SOL & USD) pakai `fmtCur(sol,usd,solMode)`.
 * Rent/held selalu ◎ (SOL intrinsik) — JANGAN dikonversi.
 */

// ── numeric ──────────────────────────────────────────────────────────────────

/** Bulatkan ke d desimal, hindari artefak float. Non-finite → dikembalikan apa adanya. */
export function round(n, d = 2) {
  const x = Number(n);
  if (n == null || !Number.isFinite(x)) return n;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

// ── mata uang ────────────────────────────────────────────────────────────────

/** Simbol mata uang per solMode (satu sumber kebenaran). */
export function curSym(solMode) {
  return solMode ? "◎" : "$";
}

/**
 * Brief-locked signature: pegang DUA angka (SOL & USD), pilih per solMode.
 * Dipakai pesan yang punya kedua basis (mis. blok wallet /status, /report).
 */
export function fmtCur(sol, usd, solMode) {
  return solMode ? `◎${round(sol, 4)}` : `$${round(usd, 2)}`;
}

/**
 * Satu angka yang SUDAH mode-correct (getMyPositions *_usd) → simbol + angka.
 * dp default: 4 (SOL) / 2 (USD). value non-finite → "<sym>?" (jaga fallback lama).
 */
export function fmtMoney(value, solMode, dp) {
  const sym = curSym(solMode);
  const d = dp ?? (solMode ? 4 : 2);
  const x = Number(value);
  if (value == null || !Number.isFinite(x)) return `${sym}?`;
  return `${sym}${round(x, d)}`;
}

/** Versi bertanda untuk delta/PnL: "+◎0.0047" / "-$1.10". */
export function fmtMoneySigned(value, solMode, dp) {
  const sym = curSym(solMode);
  const d = dp ?? (solMode ? 4 : 2);
  const x = Number(value) || 0;
  return `${x >= 0 ? "+" : "-"}${sym}${round(Math.abs(x), d)}`;
}

/** SOL eksplisit (rent/held & sejenisnya), selalu ◎, default 3dp padded (toFixed,
 *  cocokin display lama `rent.sol.toFixed(3)` + mockup "◎0.070"). */
export function fmtSol(value, dp = 3) {
  const x = Number(value);
  if (value == null || !Number.isFinite(x)) return "◎?";
  return `◎${x.toFixed(dp)}`;
}

/** Persen bertanda: "+1.61%" / "-2.20%". null → "". */
export function fmtPct(x) {
  if (x == null || !Number.isFinite(Number(x))) return "";
  const v = Number(x);
  return `${v >= 0 ? "+" : ""}${round(v, 2)}%`;
}

/** Umur dari menit — MIRROR persis fmtAgeMin (index.js:1635), byte-identik. */
export function fmtAge(m) {
  if (m == null || !Number.isFinite(Number(m))) return "?";
  const x = Number(m);
  return x >= 60 ? `${(x / 60).toFixed(1)}h` : `${x}m`;
}

/** Timestamp WIB (UTC+7, tanpa DST) → "YYYY-MM-DD HH:MM WIB". Deterministik
 *  (tak bergantung locale runtime). Default sekarang; bisa di-pass utk test. */
export function fmtWib(ms = Date.now()) {
  const s = new Date(Number(ms) + 7 * 3600000); // geser ke WIB, baca komponen UTC
  const p = (n) => String(n).padStart(2, "0");
  return `${s.getUTCFullYear()}-${p(s.getUTCMonth() + 1)}-${p(s.getUTCDate())} ${p(s.getUTCHours())}:${p(s.getUTCMinutes())} WIB`;
}

// ── bahasa desain (tree) ─────────────────────────────────────────────────────

export const SEP = "━━━━━━━━━━━━━━━━";

/** Kamus ikon TERKUNCI — satu sumber, dipakai semua renderer. */
export const ICON = {
  pnl: "💰", value: "💵", yield: "📊", time: "⏱", range: "📐", rule: "🎯", held: "🔒",
  inRange: "🟢", oor: "🔴", best: "🏆", worst: "💀", warn: "⚠️", deploy: "🚀",
  manage: "🔄", closed: "✅", stay: "✋", entry: "🪙", wallet: "💼", fee: "💧",
  swap: "🔄", briefing: "📊", config: "⚙️", bolt: "⚡", perf: "📈", brain: "🧠",
  arrow: "→",
};

/** Keycap-emoji untuk nomor 1–10; >10 → "<n>.". */
export function numEmoji(n) {
  const map = { 1: "1️⃣", 2: "2️⃣", 3: "3️⃣", 4: "4️⃣", 5: "5️⃣", 6: "6️⃣", 7: "7️⃣", 8: "8️⃣", 9: "9️⃣", 10: "🔟" };
  return map[n] || `${n}.`;
}

/**
 * Header pesan satu-subjek: "🚀 Position Opened — WIF-SOL" + opsional " · 🟢 IN".
 * (Untuk LIST seperti /positions, renderer susun header sendiri.)
 */
export function header(emoji, action, subject, status) {
  let h = `${emoji} ${action}`;
  if (subject) h += ` — ${subject}`;
  if (status) h += ` · ${status}`;
  return h;
}

/**
 * Gabung baris jadi tree: semua "├ " kecuali terakhir "└ ". Array kosong → "".
 * Baris falsy di-skip (memudahkan baris bersyarat).
 */
export function tree(lines) {
  const xs = (lines || []).filter(Boolean);
  if (xs.length === 0) return "";
  return xs.map((ln, i) => `${i === xs.length - 1 ? "└" : "├"} ${ln}`).join("\n");
}

/** Disclosure racikan: "⚠️ N trade di luar racikan ini dikecualikan (…) → /report all". */
export function disclosure(n, pnlStr, hint = "/report all") {
  if (!n || n <= 0) return "";
  const pnl = pnlStr ? ` (PnL ${pnlStr})` : "";
  return `${ICON.warn} ${n} trade di luar racikan ini dikecualikan${pnl} → ${hint}`;
}

/** Escape HTML minimal untuk teks dinamis yang masuk sendHTML. */
export function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
