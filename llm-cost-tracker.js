/**
 * llm-cost-tracker.js — records the cost of every LLM call locally, tagged by the
 * AGENT ROLE that made it (SCREENER / MANAGER / GENERAL).
 *
 * Why: OpenRouter's /api/v1/activity feed (per-model cost) needs a provisioning
 * key and is often empty, so reports couldn't split LLM cost per role. But the bot
 * makes the calls itself and knows the role each time — so we capture cost+tokens
 * per call here (same pattern as gas-tracker), giving TRUE per-role attribution
 * with no external dependency. Fail-open: a recording failure never breaks a call.
 */

import fs from "fs";
import { log } from "./logger.js";
import { paths } from "./paths.js";

const LOG_FILE = paths.llmCostLogPath;
const MAX_ENTRIES = 20000;
const PRUNE_MS = 40 * 24 * 60 * 60 * 1000; // ~40 days (covers monthly reports)

const ROLE_LABEL = { SCREENER: "Screening", MANAGER: "Management", GENERAL: "General" };

function load() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, "utf8")); } catch { return []; }
}
function save(rows) {
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(rows)); } catch (e) { log("llm_cost_error", `save failed: ${e.message}`); }
}

/** Record one LLM call's cost. cost in USD (may be 0/null for free models). */
export function recordLlmCost({ role, model, cost, tokens }) {
  try {
    const rows = load();
    rows.push({
      ts: new Date().toISOString(),
      role: role || "GENERAL",
      model: model || "?",
      cost: Number.isFinite(cost) ? cost : 0,
      tokens: Number.isFinite(tokens) ? tokens : 0,
    });
    const cutoff = Date.now() - PRUNE_MS;
    let kept = rows.filter((e) => new Date(e.ts).getTime() >= cutoff);
    if (kept.length > MAX_ENTRIES) kept = kept.slice(-MAX_ENTRIES);
    save(kept);
  } catch (e) {
    log("llm_cost_error", `record failed (fail-open): ${e.message}`);
  }
}

/**
 * LLM spend since `sinceMs`, grouped by role. Returns
 * { totalCost, totalTokens, calls, byRole: { Screening:{cost,tokens,calls}, ... },
 *   hasData }. byRole keys use friendly labels.
 */
export function getLlmCostStats(sinceMs = 0) {
  const rows = load().filter((e) => new Date(e.ts).getTime() >= sinceMs);
  const byRole = {};
  let totalCost = 0, totalTokens = 0;
  for (const e of rows) {
    const label = ROLE_LABEL[e.role] || e.role || "Other";
    if (!byRole[label]) byRole[label] = { cost: 0, tokens: 0, calls: 0, model: e.model };
    byRole[label].cost += e.cost || 0;
    byRole[label].tokens += e.tokens || 0;
    byRole[label].calls += 1;
    totalCost += e.cost || 0;
    totalTokens += e.tokens || 0;
  }
  return { totalCost, totalTokens, calls: rows.length, byRole, hasData: rows.length > 0 };
}
