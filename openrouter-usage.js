import { log } from "./logger.js";

const API_KEY = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY;
const BASE_URL = (process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/api\/v1\/?$|\/v1\/?$/, "");
const IS_OPENROUTER = BASE_URL.includes("openrouter.ai");

export async function getOpenRouterBalance() {
  if (!IS_OPENROUTER || !API_KEY) return null;
  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/key`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const d = data.data ?? data;
    return {
      limit: d.limit ?? null,
      usage: d.usage ?? null,
      usageDaily: d.usage_daily ?? null,
      usageWeekly: d.usage_weekly ?? null,
      usageMonthly: d.usage_monthly ?? null,
      remaining: d.limit_remaining ?? (d.limit != null && d.usage != null ? d.limit - d.usage : null),
      isFreeTier: d.is_free_tier ?? false,
    };
  } catch (e) {
    log("openrouter", `Balance fetch failed: ${e.message}`);
    return null;
  }
}

export async function getOpenRouter24hCost() {
  if (!IS_OPENROUTER || !API_KEY) return null;
  try {
    const res = await fetch(`${BASE_URL}/api/v1/activity`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.data ?? data ?? [];
    if (!Array.isArray(items)) return null;

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recent = items.filter(i => {
      const ts = i.created_at ? new Date(i.created_at).getTime() : 0;
      return ts > since;
    });

    const byModel = {};
    let totalCost = 0;
    let totalTokens = 0;

    for (const item of recent) {
      const model = item.model || "unknown";
      const cost = Number(item.total_cost ?? item.usage ?? 0);
      const tokens = (Number(item.prompt_tokens ?? 0)) + (Number(item.completion_tokens ?? 0));
      if (!byModel[model]) byModel[model] = { cost: 0, tokens: 0, calls: 0 };
      byModel[model].cost += cost;
      byModel[model].tokens += tokens;
      byModel[model].calls += 1;
      totalCost += cost;
      totalTokens += tokens;
    }

    return { totalCost, totalTokens, byModel, calls: recent.length };
  } catch (e) {
    log("openrouter", `Activity fetch failed: ${e.message}`);
    return null;
  }
}

/**
 * Actual purchased-credit balance on the OpenRouter account
 * (total_credits − total_usage). This is the number to watch for top-ups,
 * independent of any per-key spend limit reported by /auth/key.
 * Returns null if the endpoint isn't accessible for this key.
 */
export async function getOpenRouterCredits() {
  if (!IS_OPENROUTER || !API_KEY) return null;
  try {
    const res = await fetch(`${BASE_URL}/api/v1/credits`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const d = data.data ?? data;
    const totalCredits = Number(d.total_credits);
    const totalUsage = Number(d.total_usage);
    if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) return null;
    return { totalCredits, totalUsage, balance: totalCredits - totalUsage };
  } catch (e) {
    log("openrouter", `Credits fetch failed: ${e.message}`);
    return null;
  }
}
