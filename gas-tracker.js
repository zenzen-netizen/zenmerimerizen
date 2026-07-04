/**
 * gas-tracker.js — records the REAL network fee paid per on-chain transaction.
 *
 * Solana charges a fee (base + priority) on every tx. The bot sends txs for
 * deploy / close / claim / swap but never recorded what they cost — so reports
 * could only ESTIMATE gas. This module captures the actual `meta.fee` (lamports)
 * for each confirmed signature and persists it to gas-log.json, giving reports a
 * real number and laying the groundwork for behaviour-driven gasReserve tuning.
 *
 * Everything here is best-effort / fail-open: a failure to fetch or record a fee
 * must NEVER affect the trade that already executed.
 */

import fs from "fs";
import { log } from "./logger.js";
import { paths } from "./paths.js";

const GAS_LOG = paths.gasLogPath;
const MAX_ENTRIES = 5000;            // hard cap so the file stays bounded
const PRUNE_MS = 40 * 24 * 60 * 60 * 1000; // keep ~40 days (covers monthly reports)

function load() {
  try { return JSON.parse(fs.readFileSync(GAS_LOG, "utf8")); } catch { return []; }
}
function save(rows) {
  try { fs.writeFileSync(GAS_LOG, JSON.stringify(rows)); } catch (e) { log("gas_error", `save failed: ${e.message}`); }
}

/** Append one fee record (lamports → SOL), prune by age, cap length. */
export function recordGasFee({ action, sig, lamports }) {
  if (!Number.isFinite(lamports)) return;
  const rows = load();
  rows.push({ ts: new Date().toISOString(), action: action || "unknown", sig: sig || null, sol: lamports / 1e9 });
  const cutoff = Date.now() - PRUNE_MS;
  let kept = rows.filter((e) => new Date(e.ts).getTime() >= cutoff);
  if (kept.length > MAX_ENTRIES) kept = kept.slice(-MAX_ENTRIES);
  save(kept);
}

/**
 * Fetch the actual fee for a confirmed signature and record it. Fire-and-forget
 * from the trade path: it retries a few times because a freshly-confirmed tx may
 * not be queryable for a moment. Never throws.
 */
export async function trackTxGas(connection, sig, action) {
  if (!connection || !sig) return;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        const fee = tx?.meta?.fee;
        if (Number.isFinite(fee)) { recordGasFee({ action, sig, lamports: fee }); return; }
      } catch { /* not indexed yet — retry */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    log("gas", `fee not found for ${String(sig).slice(0, 8)} (${action}) — skipped`);
  } catch (e) {
    log("gas_error", `trackTxGas failed (fail-open): ${e.message}`);
  }
}

/**
 * Real gas spent since `sinceMs`. Returns { sol, byAction, count, firstTs, hasData }.
 * `hasData` lets callers fall back to the estimate when there's no real data yet
 * (feature just deployed, or the window predates tracking).
 */
export function getGasStats(sinceMs = 0) {
  const rows = load();
  const inWindow = rows.filter((e) => new Date(e.ts).getTime() >= sinceMs);
  const byAction = {};
  for (const e of inWindow) byAction[e.action] = (byAction[e.action] || 0) + (e.sol || 0);
  return {
    sol: inWindow.reduce((s, e) => s + (e.sol || 0), 0),
    byAction,
    count: inWindow.length,
    firstTs: rows.length ? rows[0].ts : null,
    hasData: inWindow.length > 0,
  };
}
