// config-schema.js — per-key validation schema for the update_config "satpam" (guard).
//
// Single source of truth for validating every value written through the
// `update_config` tool (tools/executor.js). Kept in its own file so it stays
// maintainable + merge-friendly, separate from the CONFIG_MAP (key→section)
// mapping it mirrors. There is one entry for EVERY flat key in CONFIG_MAP
// (165 keys); coverage is asserted by the parity check below + tests.
//
// Design (see notes/update-config-paths.md §5, notes/config-review.md):
//   - STRICT (hard reject) for harmful keys: model id format, risk/sizing
//     numerics out of absolute range, known enums out of their set.
//   - LIGHT (type-check only) for everything else: reject ONLY a clear type
//     mismatch (text in a number slot). Loose by design.
//   - PRINCIPLE: when in doubt, ALLOW. The goal is catching obvious garbage
//     (e.g. screeningModel=minimax_m2_5), not being fussy.
//   - Values arrive already coerced by coerceConfigValue (executor.js): "true"
//     →true, "off"/"null"→null, numeric strings→Number. So `null` here means
//     the user said "off"/"null" (the longstanding clear/disable idiom).
//   - Fail-open: a key absent from the schema returns null (allowed).
//
// Types: "model" | "enum" | "number" | "boolean" | "array" | "string".

// provider/slug[:tag] — kills the LLM "slugify" garble (minimax_m2_5 instead of
// minimax/minimax-m2.5), the bug that motivated this whole layer.
const MODEL_ID_RE = /^[a-z0-9-]+\/[a-z0-9._-]+(:[a-z0-9-]+)?$/i;

// Indicator presets — the closed set evaluatePreset() switches on
// (tools/chart-indicators.js). Add here when a new preset is added there.
const INDICATOR_PRESETS = [
  "supertrend_break", "rsi_reversal", "bollinger_reversion", "rsi_plus_supertrend",
  "supertrend_or_rsi", "bb_plus_rsi", "fibo_reclaim", "fibo_reject", "supertrend_plus_smi",
];

// ── Descriptor builders ──────────────────────────────────────────────────────
const model = () => ({ type: "model" });
const bool = () => ({ type: "boolean" });
const str = () => ({ type: "string" });
const arr = () => ({ type: "array" });
const enumOf = (...values) => ({ type: "enum", values });
const num = (opts = {}) => ({ type: "number", ...opts });                 // light
const numStrict = (opts = {}) => ({ type: "number", strict: true, ...opts });

// ── Schema — one entry per CONFIG_MAP key, same order/grouping ───────────────
export const CONFIG_SCHEMA = {
  // screening
  screeningSource: enumOf("meteora", "gmgn"),
  minFeeActiveTvlRatio: num(),
  excludeHighSupplyConcentration: bool(),
  minTvl: num(),
  maxTvl: num(),
  minVolume: num(),
  minOrganic: num(),
  minQuoteOrganic: num(),
  minHolders: num(),
  minMcap: num(),
  maxMcap: num(),
  minBinStep: num(),
  maxBinStep: num(),
  timeframe: str(),
  category: str(),
  screeningCategories: arr(),
  minTokenFeesSol: num(),
  useDiscordSignals: bool(),
  discordSignalMode: enumOf("merge", "only"),
  avoidPvpSymbols: bool(),
  blockPvpSymbols: bool(),
  maxBotHoldersPct: num(),
  maxTop10Pct: num(),
  allowedLaunchpads: arr(),
  blockedLaunchpads: arr(),
  minTokenAgeHours: num(),  // nullable (light num allows null)
  maxTokenAgeHours: num(),
  minFeePerTvl24h: num(),
  // management
  minClaimAmount: num(),
  autoSwapAfterClaim: bool(),
  outOfRangeBinsToClose: num(),
  outOfRangeWaitMinutes: num(),
  oorCooldownTriggerCount: num(),
  oorCooldownHours: num(),
  repeatDeployCooldownEnabled: bool(),
  repeatDeployCooldownTriggerCount: num(),
  repeatDeployCooldownHours: num(),
  repeatDeployCooldownScope: enumOf("pool", "token", "both"),
  repeatDeployCooldownMinFeeEarnedPct: num(),
  minVolumeToRebalance: num(),
  stopLossPct: numStrict({ min: -100, max: 0, label: "stopLossPct (ambang rugi, negatif)" }),
  takeProfitPct: numStrict({ min: 0, max: 500, label: "takeProfitPct" }),
  takeProfitFeePct: numStrict({ min: 0, max: 500, label: "takeProfitFeePct" }), // alias → takeProfitPct
  trailingTakeProfit: bool(),
  trailingTriggerPct: numStrict({ min: 0, max: 500, label: "trailingTriggerPct" }),
  trailingDropPct: numStrict({ min: 0, max: 500, label: "trailingDropPct" }),
  pnlSanityMaxDiffPct: num(),
  solMode: bool(),
  minSolToOpen: num(),
  deployAmountSol: numStrict({ min: 0, label: "deployAmountSol" }),
  gasReserve: numStrict({ min: 0, label: "gasReserve" }),
  gasReserveAutoTune: bool(),
  gasReserveBufferDays: num(),
  gasReserveFloorSol: num(),
  positionSizePct: numStrict({ min: 0, max: 1, label: "positionSizePct (fraksi 0–1)" }),
  sizingMode: enumOf("fixed", "maximize"),
  rentPerPositionSol: numStrict({ min: 0, max: 1, label: "rentPerPositionSol (SOL/posisi cadangan rent)" }),
  minAgeBeforeYieldCheck: num(),
  // risk
  maxPositions: numStrict({ min: 1, max: 50, integer: true, label: "maxPositions" }),
  maxDeployAmount: numStrict({ min: 0, label: "maxDeployAmount" }),
  // schedule
  managementIntervalMin: num(),
  screeningIntervalMin: num(),
  healthCheckIntervalMin: num(),
  adaptiveScreening: bool(),
  maxScreeningIntervalMin: num(),
  // models
  managementModel: model(),
  screeningModel: model(),
  generalModel: model(),
  temperature: num(),
  maxTokens: num(),
  generalMaxTokens: num(),
  maxSteps: num(),
  // strategy
  strategy: enumOf("spot", "bid_ask", "curve"),
  strategyLock: enumOf("default", "spot", "bid_ask", "curve"),
  binsBelow: num(),       // alias → maxBinsBelow (clamped before validation)
  minBinsBelow: num(),
  maxBinsBelow: num(),
  defaultBinsBelow: num(),
  // hive / api (free-text infra — never tightened)
  hiveMindUrl: str(),
  hiveMindApiKey: str(),
  agentId: str(),
  hiveMindPullMode: str(),
  publicApiKey: str(),
  agentMeridianApiUrl: str(),
  lpAgentRelayEnabled: bool(),
  // pnl fetcher / poller
  pnlSource: enumOf("rpc", "meteora"),
  pnlRpcUrl: str(),
  pnlPollIntervalSec: num(),
  pnlDepositCacheTtlSec: num(),
  // GMGN screening
  gmgnFeeSource: enumOf("gmgn", "jupiter"),
  gmgnApiKey: str(),
  gmgnBaseUrl: str(),
  gmgnInterval: str(),
  gmgnOrderBy: str(),
  gmgnDirection: str(),
  gmgnLimit: num(),
  gmgnEnrichLimit: num(),
  gmgnRequestDelayMs: num(),
  gmgnMaxRetries: num(),
  gmgnHoldersLimit: num(),
  gmgnKlineResolution: str(),
  gmgnKlineLookbackMinutes: num(),
  gmgnFilters: arr(),
  gmgnPlatforms: arr(),
  gmgnMinMcap: num(),
  gmgnMaxMcap: num(),
  gmgnMinVolume: num(),
  gmgnMinHolders: num(),
  gmgnMinTokenAgeHours: num(),
  gmgnMaxTokenAgeHours: num(),
  gmgnAthFilterPct: num(),  // nullable
  gmgnMaxTop10HolderRate: num(),
  gmgnMaxBundlerRate: num(),
  gmgnMaxRatTraderRate: num(),
  gmgnMaxFreshWalletRate: num(),
  gmgnMaxDevTeamHoldRate: num(),
  gmgnMaxBotDegenRate: num(),
  gmgnMaxSniperCount: num(),
  gmgnMaxSniperHoldRate: num(),
  gmgnPreferredKolNames: arr(),
  gmgnPreferredKolMinHoldPct: num(),
  gmgnDumpKolNames: arr(),
  gmgnDumpKolMinHoldPct: num(),
  gmgnRequireKol: bool(),
  gmgnMinKolCount: num(),
  gmgnMinSmartDegenCount: num(),
  gmgnMinTotalFeeSol: num(),
  gmgnIndicatorFilter: bool(),
  gmgnIndicatorInterval: str(),
  gmgnRequireBullishSt: bool(),
  gmgnRejectAtBottom: bool(),
  gmgnRequireAboveSt: bool(),
  gmgnMinRsi: num(),  // nullable
  gmgnMaxRsi: num(),  // nullable
  gmgnRequireBbPosition: str(),  // nullable free string (e.g. "above"/"below")
  // chart indicators
  chartIndicatorsEnabled: bool(),
  indicatorEntryPreset: enumOf(...INDICATOR_PRESETS),
  indicatorExitPreset: enumOf(...INDICATOR_PRESETS),
  rsiLength: num(),
  indicatorIntervals: arr(),
  indicatorCandles: num(),
  rsiOversold: num(),
  rsiOverbought: num(),
  requireAllIntervals: bool(),
  indicatorExitEnabled: bool(),
  indicatorRejectAtBottom: bool(),
  smiPdLookback: num(),
  smiPaLookback: num(),
  smiCrossWindow: num(),
  // experiments (🧪 GRUP 16)
  exitLiquidityCheck: bool(),
  exitLiquidityMaxSlippagePct: num(),
  marketRegimeGate: bool(),
  marketRegimeMaxDrop24hPct: num(),
  candidateMomentum: bool(),
  narrativeProfileSignal: bool(),
  expectedYieldSignal: bool(),
  convictionSizing: bool(),
  convictionSizingMaxAdjustPct: num(),
  counterfactualReview: bool(),
  counterfactualMinMcapGainPct: num(),
  smartWalletMomentum: bool(),
  idleScreeningCooldown: bool(),
  idleScreeningCooldownMin: num(),
  paperTrading: bool(),
  usePaperHistoryWhenLive: bool(),
  // reports
  learningReportEvery: num(),
  learningReportTrendN: num(),
  // learning (auto-evolve freeze)
  evolveEnabled: bool(),
};

/**
 * Validate one config write against the schema.
 * @param {string} key   canonical flat CONFIG_MAP key (e.g. "screeningModel")
 * @param {*}      value  the value AFTER coerceConfigValue (bool/number/null/string/array)
 * @returns {string|null} an error string to REJECT the write, or null to accept.
 *
 * Fail-open: unknown key → null (allowed). null → allowed except for STRICT
 * numbers (a hard limit like maxPositions can't be cleared to "off").
 */
export function validateConfigValue(key, value) {
  const s = CONFIG_SCHEMA[key];
  if (!s) return null; // not in schema → allow

  switch (s.type) {
    case "model": {
      if (value == null) return null; // off/null clears to default — allowed
      if (typeof value !== "string" || !MODEL_ID_RE.test(value.trim())) {
        return `model id harus format "provider/slug" (mis. "minimax/minimax-m2.5", "openrouter/healer-alpha") — bukan ${JSON.stringify(value)}`;
      }
      return null;
    }
    case "boolean": {
      // null = "off" (longstanding disable idiom) — allowed.
      if (value == null || typeof value === "boolean") return null;
      return `${key} harus true/false (atau "off") — bukan ${JSON.stringify(value)}`;
    }
    case "enum": {
      if (value == null) return null; // clears — allowed
      const v = String(value).trim().toLowerCase();
      if (s.values.some((x) => String(x).toLowerCase() === v)) return null;
      return `${key} harus salah satu dari [${s.values.join(", ")}] — bukan ${JSON.stringify(value)}`;
    }
    case "number": {
      const label = s.label || key;
      if (value == null) {
        // STRICT numbers (risk/sizing) can't be "off"; LIGHT numbers may be cleared.
        return s.strict ? `${label} harus angka (tidak boleh kosong/off)` : null;
      }
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return `${label} harus angka — bukan ${JSON.stringify(value)}`;
      if (s.integer && !Number.isInteger(n)) return `${label} harus bilangan bulat — bukan ${n}`;
      if (s.min != null && n < s.min) return `${label} minimal ${s.min} — bukan ${n}`;
      if (s.max != null && n > s.max) return `${label} maksimal ${s.max} — bukan ${n}`;
      return null;
    }
    case "array": {
      // arrays may arrive split (ARRAY_KEYS) or as a raw comma string for the
      // gmgn lists that aren't auto-split — accept both; only reject number/bool.
      if (value == null || Array.isArray(value) || typeof value === "string") return null;
      return `${key} harus berupa daftar — bukan ${JSON.stringify(value)}`;
    }
    case "string":
    default:
      return null; // free text — never restricted
  }
}

export const SCHEMA_KEYS = Object.keys(CONFIG_SCHEMA);
