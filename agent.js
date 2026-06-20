import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import { buildSystemPrompt } from "./prompt.js";
import { executeTool } from "./tools/executor.js";
import { tools } from "./tools/definitions.js";

const MANAGER_TOOLS  = new Set(["close_position", "claim_fees", "swap_token", "get_position_pnl", "get_my_positions", "get_wallet_balance"]);
// LLM-efficiency trim (notes/llm-cost-recon.md #4): six recon tools were dropped from the
// SCREENER's offered schema — get_active_bin, check_smart_wallets_on_pool, get_token_holders,
// get_token_narrative, get_token_info, get_pool_memory — because their data is already
// pre-loaded into every candidate block in runScreeningCycle (index.js: active_bin / audit /
// smart_wallets / narrative_untrusted / memory_untrusted). Not offering them means the model
// can't burn extra ~8k-token multi-step round-trips re-fetching data it already sees. The tool
// impls remain wired for GENERAL/manual use; only the SCREENER schema is slimmed.
const SCREENER_TOOLS = new Set(["deploy_position", "get_top_candidates", "search_pools", "get_time_profile", "get_narrative_profile", "get_wallet_balance", "get_my_positions"]);
// Tools that MUST be confirmed before executing in the interactive (casual-chat) path.
// update_config = mutates settings; the four on-chain trade actions move real capital /
// live positions, so an ambiguous chat message must never fire them unprompted. This set
// only bites when the caller wires { interactive, onConfirmRequired } (see runToolCall) —
// the autonomous SCREENER/MANAGER cron loops pass neither, so they keep auto-trading.
const CHAT_CONFIRM_TOOLS = new Set(["update_config", "deploy_position", "close_position", "claim_fees", "swap_token"]);

const GENERAL_INTENT_ONLY_TOOLS = new Set([
  "self_update",
  "update_config",
  "add_to_blacklist",
  "remove_from_blacklist",
  "block_deployer",
  "unblock_deployer",
  "add_pool_note",
  "set_position_note",
  "add_smart_wallet",
  "remove_smart_wallet",
  "add_lesson",
  "pin_lesson",
  "unpin_lesson",
  "clear_lessons",
  "add_strategy",
  "remove_strategy",
  "set_active_strategy",
]);

// Intent → tool subsets for GENERAL role
const INTENT_TOOLS = {
  decisions:   new Set(["get_recent_decisions"]),
  deploy:      new Set(["deploy_position", "get_top_candidates", "get_active_bin", "get_pool_memory", "check_smart_wallets_on_pool", "get_token_holders", "get_token_narrative", "get_token_info", "search_pools", "get_wallet_balance", "get_my_positions", "add_pool_note"]),
  close:       new Set(["close_position", "get_my_positions", "get_position_pnl", "get_wallet_balance", "swap_token"]),
  claim:       new Set(["claim_fees", "get_my_positions", "get_position_pnl", "get_wallet_balance"]),
  swap:        new Set(["swap_token", "get_wallet_balance"]),
  config:      new Set(["update_config"]),
  blocklist:   new Set(["add_to_blacklist", "remove_from_blacklist", "list_blacklist", "block_deployer", "unblock_deployer", "list_blocked_deployers"]),
  selfupdate:  new Set(["self_update"]),
  balance:     new Set(["get_wallet_balance", "get_my_positions", "get_wallet_positions"]),
  positions:   new Set(["get_my_positions", "get_position_pnl", "get_wallet_balance", "set_position_note", "get_wallet_positions"]),
  strategy:    new Set(["list_strategies", "get_strategy", "add_strategy", "update_strategy", "delete_strategy", "remove_strategy", "set_active_strategy"]),
  screen:      new Set(["get_top_candidates", "get_token_holders", "get_token_narrative", "get_token_info", "search_pools", "check_smart_wallets_on_pool", "get_pool_detail", "get_my_positions", "discover_pools"]),
  memory:      new Set(["get_pool_memory", "add_pool_note", "list_blacklist", "add_to_blacklist", "remove_from_blacklist"]),
  smartwallet: new Set(["add_smart_wallet", "remove_smart_wallet", "list_smart_wallets", "check_smart_wallets_on_pool"]),
  study:       new Set(["study_top_lpers", "get_top_lpers", "get_pool_detail", "search_pools", "get_token_info", "discover_pools", "add_smart_wallet", "list_smart_wallets"]),
  performance: new Set(["get_performance_history", "get_my_positions", "get_position_pnl"]),
  lessons:     new Set(["add_lesson", "pin_lesson", "unpin_lesson", "list_lessons", "clear_lessons"]),
};

const INTENT_PATTERNS = [
  { intent: "decisions",   re: /\b(why did you|why'd you|why was (?:this|that|it)|what made you|what was the reason|why no deploy|why didn't you deploy|why did you close|why did you deploy|why did you skip|kenapa kamu|kenapa kau|kenapa tidak|kenapa nggak|kenapa gak|mengapa kamu|apa alasan|apa yang membuat)\b/i },
  { intent: "deploy",      re: /\b(deploy|open|add liquidity|lp into|invest in|buka posisi|tambah likuiditas|lp ke)\b/i },
  { intent: "close",       re: /\b(close|exit|withdraw|remove liquidity|shut down|tutup|tarik|cabut|hentikan|keluar dari)\b/i },
  { intent: "claim",       re: /\b(claim|harvest|collect|klaim|panen|ambil)\b.*\b(fee|biaya|imbal)/i },
  { intent: "swap",        re: /\b(swap|convert|sell|exchange|tukar|jual|konversi)\b/i },
  { intent: "selfupdate",  re: /\b(self.?update|git pull|pull latest|update (the )?bot|update (the )?agent|update yourself|perbarui bot|perbarui agent|perbarui diri)\b/i },
  { intent: "blocklist",   re: /\b(blacklist|block|unblock|blocklist|blocked deployer|rugger|block dev|block deployer|blokir|buka blokir|daftar hitam)\b/i },
  { intent: "config",      re: /\b(config|konfigurasi|setting|setelan|threshold|ambang|update|set |change|ubah|ganti|atur|setel|enable|disable|turn (on|off)|switch (on|off)|activate|deactivate|toggle|matikan|nyalakan|hidupkan|aktifkan|non-?aktifkan|jalankan|hentikan)\b/i },
  { intent: "balance",     re: /\b(balance|wallet|sol|how much|saldo|dompet|berapa)\b/i },
  { intent: "positions",   re: /\b(position|portfolio|open|pnl|yield|range|posisi|portofolio)\b/i },
  { intent: "strategy",    re: /\b(strategy|strategies|strategi)\b/i },
  { intent: "screen",      re: /\b(screen|candidate|find pool|search|research|token|cari pool|cari token|kandidat|riset|telusuri)\b/i },
  { intent: "memory",      re: /\b(memory|pool history|note|remember|memori|riwayat pool|catatan|ingat)\b/i },
  { intent: "smartwallet", re: /\b(smart wallet|kol|whale|watch.?list|add wallet|remove wallet|list wallet|tracked wallet|check pool|who.?s in|wallets in|add to (smart|watch|kol)|dompet pintar|pantau wallet|tambah wallet|hapus wallet|daftar wallet)\b/i },
  { intent: "study",       re: /\b(study top|top lpers?|best lpers?|who.?s lping|lp behavior|lpers?|pelajari lper|lper terbaik)\b/i },
  { intent: "performance", re: /\b(performance|history|how.?s the bot|how.?s it doing|stats|report|performa|kinerja|riwayat|laporan|statistik|gimana)\b/i },
  { intent: "lessons",     re: /\b(lesson|learned|teach|pin|unpin|clear lesson|what did you learn|pelajaran|ajari|sematkan|lepas sematan)\b/i },
];

function getToolsForRole(agentType, goal = "") {
  if (agentType === "MANAGER")  return tools.filter(t => MANAGER_TOOLS.has(t.function.name));
  if (agentType === "SCREENER") return tools.filter(t => SCREENER_TOOLS.has(t.function.name));

  // GENERAL: match intent from goal, combine matched tool sets
  const matched = new Set();
  for (const { intent, re } of INTENT_PATTERNS) {
    if (re.test(goal)) {
      for (const t of INTENT_TOOLS[intent]) matched.add(t);
    }
  }

  // Fall back to all tools if no intent matched
  if (matched.size === 0) return tools.filter(t => !GENERAL_INTENT_ONLY_TOOLS.has(t.function.name));
  return tools.filter(t => matched.has(t.function.name));
}
import { getWalletBalances } from "./tools/wallet.js";
import { getMyPositions } from "./tools/dlmm.js";
import { log } from "./logger.js";
import { config } from "./config.js";
import { getStateSummary } from "./state.js";
import { getLessonsForPrompt, getPerformanceSummary } from "./lessons.js";
import { getDecisionSummary } from "./decision-log.js";
import { recordLlmCost } from "./llm-cost-tracker.js";

// Supports OpenRouter (default) or any OpenAI-compatible local server (e.g. LM Studio)
// To use LM Studio: set LLM_BASE_URL=http://localhost:1234/v1 and LLM_API_KEY=lm-studio in .env
const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
  apiKey: process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY,
  timeout: 5 * 60 * 1000,
});

const DEFAULT_MODEL = process.env.LLM_MODEL || "openrouter/healer-alpha";

const MUTATING_TOOL_INTENTS = /\b(deploy|open position|add liquidity|lp into|invest in|close|exit|withdraw|remove liquidity|claim|harvest|collect|swap|convert|sell|exchange|block|unblock|blacklist|add smart wallet|remove smart wallet|add wallet|remove wallet|pin|unpin|clear lesson|add lesson|set active strategy|remove strategy|add strategy|set |change |update |self.?update|pull latest|git pull|update yourself|enable|disable|turn (on|off)|switch (on|off)|activate|deactivate|toggle|matikan|nyalakan|hidupkan|aktifkan|non-?aktifkan|buka posisi|tambah likuiditas|tutup|tarik|cabut|hentikan|klaim|panen|tukar|jual|konversi|blokir|buka blokir|ubah|ganti|atur|setel|sematkan|lepas sematan|perbarui|tambah wallet|hapus wallet|tambah strategi|hapus strategi)\b/i;
const LIVE_DATA_TOOL_INTENTS = /\b(balance|wallet|position|portfolio|pnl|yield|range|show positions|open positions|screen|candidate|find pool|search|research|analyze|check pool|token holders|narrative|study top|top lpers?|lp behavior|who.?s lping|performance|history|stats|report|list smart wallets|list blacklist|list blocked deployers|list lessons|saldo|dompet|posisi|portofolio|cari pool|kandidat|riset|performa|kinerja|riwayat|laporan|statistik|daftar)\b/i;
const CONFIG_READ_ONLY_INTENTS = /\b(check|show|what(?:'s| is)?|review|inspect|see|cek|lihat|tampilkan|tunjukkan|periksa)\b.*\b(config|konfigurasi|settings?|setelan|thresholds?|ambang)\b/i;
const DECISION_EXPLANATION_INTENTS = /\b(why did you|why'd you|why was (?:this|that|it)|what made you|what was the reason|why no deploy|why didn't you deploy|why did you close|why did you deploy|why did you skip|kenapa kamu|kenapa kau|kenapa tidak|kenapa nggak|kenapa gak|mengapa kamu|apa alasan|apa yang membuat)\b/i;

function shouldRequireRealToolUse(goal, agentType, interactive = false) {
  if (agentType === "MANAGER") return false;
  if (DECISION_EXPLANATION_INTENTS.test(goal)) return false;
  if (CONFIG_READ_ONLY_INTENTS.test(goal)) return false;
  if (MUTATING_TOOL_INTENTS.test(goal)) return true;
  return interactive && LIVE_DATA_TOOL_INTENTS.test(goal);
}

// Some models (esp. weaker / non-native function-callers like minimax-m2) emit their
// intended tool calls as plain-text JSON in `content` instead of using the function-
// calling channel — e.g. `[{"name":"get_top_candidates","parameters":{"limit":3}}]`.
// Left unhandled, an allowNoToolFinal caller (the screening cron) posts this raw JSON
// straight to Telegram as if it were a report. parseContentToolCalls recognizes such
// dumps so the loop can either salvage them (read-only) or reject-and-retry.
const VALID_TOOL_NAMES = new Set(tools.map((t) => t.function.name));
// Never auto-execute these from a text dump: a dump is an un-vetted "plan", not a
// deliberate call — acting on it could move real capital or mutate persistent state.
const ONCHAIN_WRITE_TOOLS = new Set(["deploy_position", "claim_fees", "close_position", "swap_token"]);
const NO_SALVAGE_TOOLS = new Set([...ONCHAIN_WRITE_TOOLS, ...GENERAL_INTENT_ONLY_TOOLS]);

function parseContentToolCalls(content) {
  if (!content || typeof content !== "string") return null;
  let text = content.trim();
  if (!text) return null;
  // Strip a single surrounding markdown code fence if present
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();
  if (!/^[[{]/.test(text)) return null; // a real report never starts with [ or {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    try { parsed = JSON.parse(jsonrepair(text)); } catch { return null; }
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  if (arr.length === 0) return null;
  const calls = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") return null;
    const name = item.name || item.tool || item.function;
    if (typeof name !== "string" || !VALID_TOOL_NAMES.has(name)) return null; // all entries must be real tools
    const raw = item.parameters ?? item.arguments ?? item.args ?? {};
    if (raw != null && typeof raw !== "object") return null;
    calls.push({ name, arguments: raw && typeof raw === "object" ? raw : {} });
  }
  return calls.length ? calls : null;
}

function buildMessages(systemPrompt, sessionHistory, goal, providerMode = "system") {
  if (providerMode === "user_embedded") {
    return [
      ...sessionHistory,
      {
        role: "user",
        content: `[SYSTEM INSTRUCTIONS]\n${systemPrompt}\n\n[USER REQUEST]\n${goal}`,
      },
    ];
  }

  return [
    { role: "system", content: systemPrompt },
    ...sessionHistory,
    { role: "user", content: goal },
  ];
}

function isSystemRoleError(error) {
  const message = String(error?.message || error?.error?.message || error || "");
  return /invalid message role:\s*system/i.test(message);
}

function isToolChoiceRequiredError(error) {
  const message = String(error?.message || error?.error?.message || error || "");
  return /tool_choice/i.test(message) && /required/i.test(message);
}

function isThinkingModeToolChoiceError(error) {
  const message = String(error?.message || error?.error?.message || error || "");
  return /thinking mode does not support/i.test(message) && /tool_choice/i.test(message);
}

/**
 * Core ReAct agent loop.
 *
 * @param {string} goal - The task description for the agent
 * @param {number} maxSteps - Safety limit on iterations (default 20)
 * @returns {string} - The agent's final text response
 */
export async function agentLoop(goal, maxSteps = config.llm.maxSteps, sessionHistory = [], agentType = "GENERAL", model = null, maxOutputTokens = null, options = {}) {
  const { interactive = false, onToolStart = null, onToolFinish = null, onConfirmRequired = null, allowNoToolFinal = false } = options;
  // Build dynamic system prompt with current portfolio state
  const [portfolio, positions] = await Promise.all([getWalletBalances(), getMyPositions()]);
  const stateSummary = getStateSummary();
  const lessons = getLessonsForPrompt({ agentType });
  const perfSummary = getPerformanceSummary();
  const decisionSummary = getDecisionSummary();
  let weightsSummary = null;
  if (agentType === "SCREENER") {
    try {
      const { getWeightsSummary } = await import("./signal-weights.js");
      const { config } = await import("./config.js");
      if (config.darwin?.enabled) weightsSummary = getWeightsSummary();
    } catch { /* signal-weights not critical */ }
  }
  const systemPrompt = buildSystemPrompt(agentType, portfolio, positions, stateSummary, lessons, perfSummary, weightsSummary, decisionSummary);

  let providerMode = "system";
  let messages = buildMessages(systemPrompt, sessionHistory, goal, providerMode);

  // Track write tools fired this session — prevent the model from calling the same
  // destructive tool twice (e.g. deploy twice, swap twice after auto-swap)
  const ONCE_PER_SESSION = new Set(["deploy_position", "swap_token", "close_position"]);
  // These lock after first attempt regardless of success — retrying them is always wrong
  const NO_RETRY_TOOLS = new Set(["deploy_position"]);
  const firedOnce = new Set();
  const mustUseRealTool = shouldRequireRealToolUse(goal, agentType, interactive);
  let sawToolCall = false;
  let noToolRetryCount = 0;
  // Recovery budgets for models that dump tool calls as plain text (see parseContentToolCalls)
  let contentSalvageCount = 0;
  let toolDumpRetryCount = 0;
  const MAX_CONTENT_SALVAGE = 4;
  const MAX_TOOL_DUMP_RETRY = 2;
  // Stays true for the whole run once a thinking-mode provider rejects tool_choice
  let omitToolChoice = false;

  let emptyStreak = 0;
  for (let step = 0; step < maxSteps; step++) {
    log("agent", `Step ${step + 1}/${maxSteps}`);

    try {
      const activeModel = model || DEFAULT_MODEL;

      // Retry up to 3 times on transient provider errors (502, 503, 529)
      const FALLBACK_MODEL = "stepfun/step-3.5-flash:free";
      let response;
      let usedModel = activeModel;
      // Force a tool call on step 0 for action intents — prevents the model from inventing deploy/close outcomes
      const ACTION_INTENTS = /\b(deploy|open|add liquidity|close|exit|withdraw|claim|swap|block|unblock)\b/i;
      let toolChoice = (step === 0 && (ACTION_INTENTS.test(goal) || mustUseRealTool)) ? "required" : "auto";

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const reqParams = {
            model: usedModel,
            messages,
            tools: getToolsForRole(agentType, goal),
            temperature: config.llm.temperature,
            max_tokens: maxOutputTokens ?? (agentType === "GENERAL" ? config.llm.generalMaxTokens : config.llm.maxTokens),
            usage: { include: true }, // OpenRouter returns per-call cost in response.usage
          };
          if (!omitToolChoice) reqParams.tool_choice = toolChoice;
          response = await client.chat.completions.create(reqParams);
          // Record this call's cost per role (local, no external feed needed). Fail-open.
          try {
            const u = response?.usage;
            if (u) recordLlmCost({ role: agentType, model: usedModel, cost: u.cost ?? u.total_cost ?? null, tokens: u.total_tokens ?? 0 });
          } catch { /* never break the call */ }
        } catch (error) {
          if (providerMode === "system" && isSystemRoleError(error)) {
            providerMode = "user_embedded";
            messages = buildMessages(systemPrompt, sessionHistory, goal, providerMode);
            log("agent", "Provider rejected system role — retrying with embedded system instructions");
            attempt -= 1;
            continue;
          }
          if (toolChoice === "required" && isToolChoiceRequiredError(error)) {
            toolChoice = "auto";
            log("agent", "Provider rejected tool_choice=required — retrying with tool_choice=auto");
            attempt -= 1;
            continue;
          }
          if (!omitToolChoice && isThinkingModeToolChoiceError(error)) {
            omitToolChoice = true;
            log("agent", "Provider thinking mode does not support tool_choice — retrying without it");
            attempt -= 1;
            continue;
          }
          throw error;
        }
        if (response.choices?.length) break;
        const errCode = response.error?.code;
        if (errCode === 502 || errCode === 503 || errCode === 529) {
          const wait = (attempt + 1) * 5000;
          if (attempt === 1 && usedModel !== FALLBACK_MODEL) {
            usedModel = FALLBACK_MODEL;
            log("agent", `Switching to fallback model ${FALLBACK_MODEL}`);
          } else {
            log("agent", `Provider error ${errCode}, retrying in ${wait / 1000}s (attempt ${attempt + 1}/3)`);
            await new Promise((r) => setTimeout(r, wait));
          }
        } else {
          break;
        }
      }

      if (!response.choices?.length) {
        log("error", `Bad API response: ${JSON.stringify(response).slice(0, 200)}`);
        throw new Error(`API returned no choices: ${response.error?.message || JSON.stringify(response)}`);
      }
      const msg = response.choices[0].message;
      // Repair malformed tool call JSON before pushing to history —
      // the API rejects the next request if history contains invalid JSON args
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.function?.arguments) {
            try {
              JSON.parse(tc.function.arguments);
            } catch {
              try {
                tc.function.arguments = JSON.stringify(JSON.parse(jsonrepair(tc.function.arguments)));
                log("warn", `Repaired malformed JSON args for ${tc.function.name}`);
              } catch {
                tc.function.arguments = "{}";
                log("error", `Could not repair JSON args for ${tc.function.name} — cleared to {}`);
              }
            }
          }
        }
      }
      messages.push(msg);

      // Salvage: some models emit their intended tool calls as plain-text JSON in
      // `content` instead of using the function-calling channel. Convert read-only
      // dumps into real tool calls so the loop can proceed. Writes / state mutators
      // are deliberately NOT salvaged — they fall through to the reject-and-retry
      // path below (never act on an un-vetted plan that could move real capital).
      if ((!msg.tool_calls || msg.tool_calls.length === 0) && msg.content) {
        const dumped = parseContentToolCalls(msg.content);
        if (dumped && contentSalvageCount < MAX_CONTENT_SALVAGE
            && !dumped.some((c) => NO_SALVAGE_TOOLS.has(c.name))) {
          contentSalvageCount += 1;
          msg.tool_calls = dumped.map((c, i) => ({
            id: `salvage_${step}_${i}`,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.arguments) },
          }));
          msg.content = ""; // drop the raw dump so the model doesn't echo it next turn
          log("agent", `Salvaged ${dumped.length} text-dumped tool call(s): ${dumped.map((c) => c.name).join(", ")}`);
        }
      }

      // If the model didn't call any tools, it's done
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        // Hermes sometimes returns null content — pop the empty message and retry once
        if (!msg.content) {
          messages.pop(); // remove the empty assistant message
          log("agent", "Empty response, retrying...");
          continue;
        }
        // A content that is actually a tool-call/schema dump (contains a write tool, or
        // read-only but past the salvage budget) is NEVER a valid final answer — never let
        // it reach the user/Telegram. Nudge the model to call the tool properly or report
        // in prose; if it keeps dumping, return a clean skip / failure instead of the JSON.
        if (parseContentToolCalls(msg.content)) {
          toolDumpRetryCount += 1;
          messages.pop();
          log("agent", `Rejected tool-dump-as-text final answer (${toolDumpRetryCount}/${MAX_TOOL_DUMP_RETRY})`);
          if (toolDumpRetryCount >= MAX_TOOL_DUMP_RETRY) {
            return {
              content: allowNoToolFinal
                ? "⛔ NO DEPLOY\n\nCycle finished with no valid entry.\n(Model emitted tool calls as text instead of executing them — treated as a skip.)"
                : "I couldn't complete that reliably — the model emitted tool definitions as text instead of calling them. Please retry.",
              userMessage: goal,
            };
          }
          const reminder = "Your previous reply pasted tool definitions/calls as plain JSON text instead of using them. Do NOT output tool schemas or example arguments as text. Either (a) actually CALL the tool through the function-calling interface, or (b) if you are finished, write your final answer as plain prose in the required format. Never paste the tool list.";
          messages.push({
            role: providerMode === "system" ? "system" : "user",
            content: providerMode === "system" ? reminder : `[SYSTEM REMINDER]\n${reminder}`,
          });
          continue;
        }
        // allowNoToolFinal: caller (e.g. the screening cron) treats "no action / skip"
        // as a valid terminal answer. A no-tool final response is the legitimate ⛔ NO
        // DEPLOY path, so accept it instead of looping to the canned retry message. The
        // caller is responsible for guarding against a claimed-success-without-tool report.
        if (mustUseRealTool && !sawToolCall && !allowNoToolFinal) {
          noToolRetryCount += 1;
          messages.pop();
          log("agent", `Rejected no-tool final answer (${noToolRetryCount}/2) for tool-required request`);
          if (noToolRetryCount >= 2) {
            return {
              content: "I couldn't complete that reliably because no tool call was made. Please retry after checking the logs.",
              userMessage: goal,
            };
          }
          messages.push({
            role: providerMode === "system" ? "system" : "user",
            content: providerMode === "system"
              ? "You have not used any tool yet. This request requires real tool execution or live tool-backed data. Do not answer from memory or inference. Call the appropriate tool first, then report only the real result."
              : "[SYSTEM REMINDER]\nYou have not used any tool yet. This request requires real tool execution or live tool-backed data. Do not answer from memory or inference. Call the appropriate tool first, then report only the real result.",
          });
          continue;
        }
        log("agent", "Final answer reached");
        log("agent", msg.content);
        return { content: msg.content, userMessage: goal };
      }
      sawToolCall = true;

      // Run one tool call, returning the JSON content string for its tool message.
      const runToolCall = async (toolCall) => {
        const functionName = toolCall.function.name.replace(/<.*$/, "").trim();
        let functionArgs;

        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          try {
            functionArgs = JSON.parse(jsonrepair(toolCall.function.arguments));
            log("warn", `Repaired malformed JSON args for ${functionName}`);
          } catch (parseError) {
            log("error", `Failed to parse args for ${functionName}: ${parseError.message}`);
            functionArgs = {};
          }
        }

        // Block once-per-session tools from firing a second time
        if (ONCE_PER_SESSION.has(functionName) && firedOnce.has(functionName)) {
          log("agent", `Blocked duplicate ${functionName} call — already executed this session`);
          const blocked = { blocked: true, reason: `${functionName} already attempted this session — do not retry. If it failed, report the error and stop.` };
          await onToolFinish?.({ name: functionName, args: functionArgs, result: blocked, success: false, step });
          return JSON.stringify(blocked);
        }

        if (interactive && onConfirmRequired && CHAT_CONFIRM_TOOLS.has(functionName)) {
          const confirmed = await onConfirmRequired(functionName, functionArgs);
          if (!confirmed) {
            const cancelResult = { success: false, cancelled: true, reason: "User cancelled the action." };
            await onToolFinish?.({ name: functionName, args: functionArgs, result: cancelResult, success: false, step });
            return JSON.stringify(cancelResult);
          }
        }

        await onToolStart?.({ name: functionName, args: functionArgs, step });
        const result = await executeTool(functionName, functionArgs);
        await onToolFinish?.({
          name: functionName,
          args: functionArgs,
          result,
          success: result?.success !== false && !result?.error && !result?.blocked,
          step,
        });

        // Lock deploy_position after first attempt regardless of outcome — retrying is never right
        // For close/swap: only lock on success so genuine failures can be retried
        if (NO_RETRY_TOOLS.has(functionName)) firedOnce.add(functionName);
        else if (ONCE_PER_SESSION.has(functionName) && result.success === true) firedOnce.add(functionName);

        return JSON.stringify(result);
      };

      // Deduplicate identical tool calls within one turn. Weak models sometimes emit
      // the same call hundreds of times in a single message (observed: 300+ identical
      // update_config calls); executing each would re-run the action, spam confirmation
      // prompts, and stack writes. The API still needs a tool message per tool_call_id,
      // so we execute once per unique signature and fan the same result back to each id.
      const execCache = new Map(); // signature -> Promise<contentString>
      const toolResults = await Promise.all(msg.tool_calls.map(async (toolCall) => {
        const signature = `${toolCall.function.name}|${toolCall.function.arguments}`;
        if (!execCache.has(signature)) execCache.set(signature, runToolCall(toolCall));
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: await execCache.get(signature),
        };
      }));

      messages.push(...toolResults);
    } catch (error) {
      log("error", `Agent loop error at step ${step}: ${error.message}`);

      // If it's a rate limit, wait and retry
      if (error.status === 429) {
        log("agent", "Rate limited, waiting 30s...");
        await sleep(30000);
        continue;
      }

      // For other errors, break the loop
      throw error;
    }
  }

  log("agent", "Max steps reached without final answer");
  return { content: "Max steps reached. Review logs for partial progress.", userMessage: goal };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
