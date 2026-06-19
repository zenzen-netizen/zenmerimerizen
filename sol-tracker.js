/**
 * sol-tracker.js — calendar-day SOL balance growth tracker.
 *
 * Records the OPENING SOL balance of each WIB (UTC+7) calendar day and reports
 * growth over the 1d / 7d / 30d windows for the Telegram /wallet command.
 *
 * Windows are CALENDAR-based, not rolling:
 *   - 1d  window = today only        (start = today          00:00:01 WIB)
 *   - 7d  window = last 7 cal. days  (start = today − 6 days, 00:00:01 WIB)
 *   - 30d window = last 30 cal. days (start = today − 29 days, 00:00:01 WIB)
 * inclusive of today. The FIRST valid balance observation of a new WIB day
 * becomes that day's baseline (so it reflects the day's open, not its latest
 * value). Everything is fail-open: a tracker error must never affect the wallet
 * read it piggybacks on.
 */

import fs from "fs";
import { log } from "./logger.js";
import { repoPath } from "./repo-root.js";

const HISTORY_FILE = repoPath("sol-balance-history.json");
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const KEEP_DAYS = 35; // > 30d window, with slack for missed days

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    return data && typeof data.days === "object" && data.days ? data : { days: {} };
  } catch {
    return { days: {} };
  }
}

function save(data) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    log("sol_tracker_error", `save failed: ${e.message}`);
  }
}

/** WIB calendar date ("YYYY-MM-DD") for a JS Date. */
function wibDateKey(date = new Date()) {
  return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Shift a "YYYY-MM-DD" key by whole days (date-only UTC arithmetic). */
function shiftKey(key, deltaDays) {
  const t = Date.parse(`${key}T00:00:00Z`) + deltaDays * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "Jun 10" label from a "YYYY-MM-DD" key. */
function labelFromKey(key) {
  const [, m, d] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${d}`;
}

/**
 * Ensure today's WIB day has a baseline opening balance. The FIRST valid
 * observation of a new day wins; later same-day reads are ignored. Prunes days
 * older than the 30d window. Fail-open — called from every wallet read.
 */
export function recordSolBalance(sol) {
  if (!Number.isFinite(sol) || sol <= 0) return; // guard error/empty reads
  try {
    const data = load();
    const today = wibDateKey();
    if (data.days[today] != null) return; // baseline already set for today
    data.days[today] = Math.round(sol * 1e6) / 1e6;
    const cutoff = shiftKey(today, -KEEP_DAYS);
    for (const k of Object.keys(data.days)) {
      if (k < cutoff) delete data.days[k];
    }
    save(data);
  } catch (e) {
    log("sol_tracker_error", `record failed: ${e.message}`);
  }
}

/**
 * Baseline opening balance for a nominal period-start key: exact day if we have
 * it, else the earliest snapshot on/after it (partial window), else the earliest
 * snapshot we have (partial). Returns null when there's no history at all.
 */
function baselineFor(days, startKey) {
  if (days[startKey] != null) return { key: startKey, sol: days[startKey], partial: false };
  const after = Object.keys(days).filter((k) => k >= startKey).sort();
  if (after.length) return { key: after[0], sol: days[after[0]], partial: after[0] !== startKey };
  const all = Object.keys(days).sort();
  if (all.length) return { key: all[0], sol: days[all[0]], partial: true };
  return null;
}

const PERIODS = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
];

/**
 * Optional user-chosen anchor date ("track mulai tanggal X") for the SOL tracker.
 * Stored in the history file alongside the daily baselines. Adds a "SINCE <date>"
 * growth row to /wallet. Display-only setting — never affects trading.
 */
export function getTrackStart() {
  return load().trackStart || null;
}

export function setTrackStart(dateKey) {
  try {
    const data = load();
    if (dateKey == null) { delete data.trackStart; save(data); return { ok: true, cleared: true }; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || Number.isNaN(Date.parse(`${dateKey}T00:00:00Z`))) {
      return { ok: false, error: "format tanggal harus YYYY-MM-DD (mis. 2026-06-10)" };
    }
    if (dateKey > wibDateKey()) return { ok: false, error: "tanggal mulai tak boleh di masa depan" };
    data.trackStart = dateKey;
    save(data);
    return { ok: true, dateKey };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Growth row from the user-anchored start date to now, or null when unset. */
function sinceStartRow(currentSol) {
  const data = load();
  const start = data.trackStart;
  if (!start) return null;
  const now = Number.isFinite(currentSol) ? currentSol : null;
  const base = baselineFor(data.days, start);
  if (base == null || now == null) {
    return { anchor: start, startKey: start, startBal: null, now, deltaSol: null, deltaPct: null, partial: true };
  }
  const deltaSol = now - base.sol;
  const deltaPct = base.sol > 0 ? (deltaSol / base.sol) * 100 : null;
  return { anchor: start, startKey: base.key, startBal: base.sol, now, deltaSol, deltaPct, partial: base.key !== start };
}

/** Compute the 1d/7d/30d tracker rows against the current SOL balance. */
export function getSolTracker(currentSol) {
  const data = load();
  const today = wibDateKey();
  const now = Number.isFinite(currentSol) ? currentSol : null;
  return PERIODS.map((p) => {
    const startKey = shiftKey(today, -(p.days - 1));
    const base = baselineFor(data.days, startKey);
    if (base == null || now == null) {
      return { label: p.label, startKey, startBal: null, now, deltaSol: null, deltaPct: null, partial: true };
    }
    const deltaSol = now - base.sol;
    const deltaPct = base.sol > 0 ? (deltaSol / base.sol) * 100 : null;
    return { label: p.label, startKey: base.key, startBal: base.sol, now, deltaSol, deltaPct, partial: base.partial };
  });
}

function fmtSol(n) { return n.toFixed(3); }
function signedSol(n) { return `${n >= 0 ? "+" : ""}${n.toFixed(3)}`; }
function signedPct(n) { return n == null ? "n/a" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }
function dot(n) { return n > 0 ? "🟢" : n < 0 ? "🔴" : "⚪"; }

/**
 * Telegram (plain-text) SOL balance tracker block. Compact one-line-per-window
 * layout: the shared "Now" balance sits in the header, then each window is a
 * single row "<label> <dot> <Δsol> (<Δ%>) ← <start bal> @ <start day>".
 */
export function formatSolTracker(currentSol) {
  const rows = getSolTracker(currentSol);
  const now = Number.isFinite(currentSol) ? fmtSol(currentSol) : "?";
  const lines = [`📊 SOL Tracker · Now ${now} SOL`, "━━━━━━━━━━━━━━━━━"];
  for (const r of rows) {
    const label = r.label.padEnd(3);
    if (r.startBal == null) {
      lines.push(`${label} ⚪ (blm ada baseline)`);
      continue;
    }
    const star = r.partial ? " *" : "";
    lines.push(
      `${label} ${dot(r.deltaSol)} ${signedSol(r.deltaSol)} SOL (${signedPct(r.deltaPct)}) ← ${fmtSol(r.startBal)} @ ${labelFromKey(r.startKey)}${star}`,
    );
  }
  // User-anchored "SINCE <date>" row, when set via /wallet trackstart.
  const ss = sinceStartRow(currentSol);
  if (ss) {
    if (ss.startBal == null) {
      lines.push(`SINCE ${labelFromKey(ss.anchor)} ⚪ (blm ada baseline)`);
    } else {
      const star = ss.partial ? " *" : "";
      lines.push(`SINCE ${labelFromKey(ss.startKey)} ${dot(ss.deltaSol)} ${signedSol(ss.deltaSol)} SOL (${signedPct(ss.deltaPct)}) ← ${fmtSol(ss.startBal)}${star}`);
    }
  }
  if (rows.some((r) => r.partial) || ss?.partial) {
    lines.push("* window/anchor blm punya baseline pas — pakai hari terlama tercatat");
  }
  // Honesty note: this tracks raw liquid SOL, not PnL — deposits/withdrawals
  // and capital parked in positions all move it. Use /report for true PnL.
  lines.push("ℹ️ saldo SOL mentah (termasuk deposit/tarik & modal di posisi) — buat PnL murni pakai /report");
  if (!ss) lines.push("💡 set anchor: /wallet trackstart YYYY-MM-DD");
  return lines.join("\n");
}
