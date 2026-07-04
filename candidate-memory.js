/**
 * Candidate memory — short rolling snapshots of screening candidates.
 *
 * Backs the 🧪 candidate-momentum experiment (#1): each screening cycle we
 * snapshot every fetched candidate's TVL / volume / mcap, keyed by pool. On a
 * later cycle, the delta over the retained window tells us whether a pool is
 * gaining or fading — a soft signal injected into the SCREENER's candidate block.
 *
 * Kept deliberately separate from pool-memory.json: that file drives cooldowns
 * and deploy history for pools we actually entered. This one is throwaway
 * trend data for pools we are merely *looking at*, with bounded retention so it
 * never grows without limit. Only written when the experiment is ON.
 */

import fs from "fs";
import { log } from "./logger.js";
import { paths } from "./paths.js";

const CANDIDATE_MEMORY_FILE = paths.candidateMemoryPath;
const MAX_SNAPSHOTS = 8; // per pool (~last few screening cycles)
const STALE_MS = 24 * 60 * 60 * 1000; // drop pools not seen in 24h

function num(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

function load() {
  if (!fs.existsSync(CANDIDATE_MEMORY_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CANDIDATE_MEMORY_FILE, "utf8"));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(CANDIDATE_MEMORY_FILE, JSON.stringify(data, null, 2));
}

/**
 * Record one snapshot per candidate for this screening cycle, then prune pools
 * not seen recently. Safe to call with the raw candidate list — pools missing a
 * pool address or numeric metrics are skipped / stored as null.
 */
export function recordCandidateSnapshots(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return;
  const db = load();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  for (const pool of candidates) {
    const addr = pool?.pool;
    if (!addr) continue;
    if (!db[addr]) db[addr] = { name: pool.name || addr.slice(0, 8), snaps: [] };
    db[addr].name = pool.name || db[addr].name;
    db[addr].snaps.push({
      ts: nowIso,
      tvl: num(pool.tvl ?? pool.active_tvl),
      volume: num(pool.volume_window ?? pool.volume),
      mcap: num(pool.mcap),
    });
    if (db[addr].snaps.length > MAX_SNAPSHOTS) {
      db[addr].snaps = db[addr].snaps.slice(-MAX_SNAPSHOTS);
    }
  }

  // Prune pools whose newest snapshot is stale — keeps the file bounded.
  for (const [addr, entry] of Object.entries(db)) {
    const last = entry.snaps?.[entry.snaps.length - 1]?.ts;
    if (!last || now - new Date(last).getTime() > STALE_MS) delete db[addr];
  }

  save(db);
}

/**
 * Momentum for a single pool: pct change of TVL / volume / mcap from the oldest
 * retained snapshot to the newest. Returns { samples, span_min, *_delta_pct } or
 * { samples, first_sighting } when there isn't enough history yet. Null on no entry.
 */
export function getCandidateMomentum(poolAddress) {
  if (!poolAddress) return null;
  const entry = load()[poolAddress];
  const snaps = entry?.snaps || [];
  if (snaps.length < 2) return { samples: snaps.length, first_sighting: true };

  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const spanMin = Math.round((new Date(last.ts).getTime() - new Date(first.ts).getTime()) / 60000);
  const pct = (a, b) => (num(a) != null && num(b) != null && a > 0 ? ((b - a) / a) * 100 : null);

  return {
    samples: snaps.length,
    span_min: spanMin,
    tvl_delta_pct: round2(pct(first.tvl, last.tvl)),
    volume_delta_pct: round2(pct(first.volume, last.volume)),
    mcap_delta_pct: round2(pct(first.mcap, last.mcap)),
  };
}

/**
 * 🧪 Experiment #8: counterfactual skip review. Looks at pools we snapshotted
 * but never deployed into (address not among deployedPoolAddresses) and measures
 * their mcap drift from oldest → newest retained snapshot. Surfaces the biggest
 * "ones that got away" (gained ≥ minMcapGainPct) plus how many skips fell (which
 * validates the skip). Reflection only — never gates anything.
 *
 * Bounded by candidate-memory's own retention (≤8 snaps/pool, 24h prune), so the
 * horizon is short — fine for a daily briefing of recent skips.
 */
export function getSkipReview({ deployedPoolAddresses = [], minMcapGainPct = 25, limit = 3 } = {}) {
  const deployed = new Set((deployedPoolAddresses || []).filter(Boolean));
  const db = load();
  const gainers = [];
  let skipped = 0;
  let dropped = 0;

  for (const [addr, entry] of Object.entries(db)) {
    if (deployed.has(addr)) continue;
    const snaps = entry?.snaps || [];
    if (snaps.length < 2) continue;
    const first = num(snaps[0].mcap);
    const last = num(snaps[snaps.length - 1].mcap);
    if (first == null || last == null || first <= 0) continue;

    skipped++;
    const deltaPct = ((last - first) / first) * 100;
    if (deltaPct < 0) dropped++;
    if (deltaPct >= minMcapGainPct) {
      const spanMin = Math.round(
        (new Date(snaps[snaps.length - 1].ts).getTime() - new Date(snaps[0].ts).getTime()) / 60000,
      );
      gainers.push({ name: entry.name || addr.slice(0, 8), addr, mcap_delta_pct: round2(deltaPct), samples: snaps.length, span_min: spanMin });
    }
  }

  gainers.sort((a, b) => b.mcap_delta_pct - a.mcap_delta_pct);
  return { skipped, dropped, gainers: gainers.slice(0, limit) };
}

/**
 * Render a momentum object as one compact line for the candidate block, or null
 * if there's nothing useful to say (caller drops null lines).
 */
export function formatCandidateMomentum(m) {
  if (!m) return null;
  if (m.first_sighting || m.samples < 2) return "first sighting (no momentum history yet)";
  const sign = (v) => `${v >= 0 ? "+" : ""}${v}`;
  const parts = [];
  if (m.tvl_delta_pct != null) parts.push(`tvl ${sign(m.tvl_delta_pct)}%`);
  if (m.volume_delta_pct != null) parts.push(`vol ${sign(m.volume_delta_pct)}%`);
  if (m.mcap_delta_pct != null) parts.push(`mcap ${sign(m.mcap_delta_pct)}%`);
  if (parts.length === 0) return null;
  return `${parts.join(", ")} over ${m.samples} samples (~${m.span_min}m)`;
}

/**
 * 🧪 Smart-wallet momentum: append this cycle's smart-wallet count per pool to a
 * per-pool buffer (sw_snaps) inside candidate-memory. Entries are created/pruned
 * by recordCandidateSnapshots (which runs in the same cycles), so we only append
 * here. rows: [{ addr, name, sw_count }]. Safe with missing/odd values.
 */
export function recordSmartWalletCounts(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const db = load();
  const nowIso = new Date().toISOString();
  for (const r of rows) {
    const addr = r?.addr;
    const count = num(r?.sw_count);
    if (!addr || count == null) continue;
    if (!db[addr]) db[addr] = { name: r.name || addr.slice(0, 8), snaps: [] };
    if (!Array.isArray(db[addr].sw_snaps)) db[addr].sw_snaps = [];
    db[addr].sw_snaps.push({ ts: nowIso, count });
    if (db[addr].sw_snaps.length > MAX_SNAPSHOTS) {
      db[addr].sw_snaps = db[addr].sw_snaps.slice(-MAX_SNAPSHOTS);
    }
  }
  save(db);
}

/**
 * Smart-wallet count drift for one pool: oldest → newest retained sw snapshot.
 * Returns { first, last, delta, samples } or null when there isn't enough history.
 */
export function getSmartWalletMomentum(poolAddress) {
  if (!poolAddress) return null;
  const snaps = load()[poolAddress]?.sw_snaps || [];
  if (snaps.length < 2) return null;
  const first = num(snaps[0].count);
  const last = num(snaps[snaps.length - 1].count);
  if (first == null || last == null) return null;
  return { first, last, delta: last - first, samples: snaps.length };
}

/**
 * Render smart-wallet momentum as one compact line, or null when flat / unknown
 * (caller drops null lines). Only speaks when the count actually moved.
 */
export function formatSmartWalletMomentum(m) {
  if (!m || m.samples < 2 || m.delta === 0) return null;
  const dir = m.delta > 0 ? `entering (+${m.delta})` : `leaving (${m.delta})`;
  return `smart wallets ${dir}: ${m.first}→${m.last} over ${m.samples} cycles`;
}
