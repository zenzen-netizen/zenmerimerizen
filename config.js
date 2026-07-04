import fs from "fs";
import { REPO_ROOT, repoPath } from "./repo-root.js";
import { paths } from "./paths.js";
import { getScreeningDefaultsForTimeframe, normalizeTimeframe, scaleScreeningToTimeframe, TIMEFRAME_SCREENING_SCALES } from "./screening-scales.js";

export { REPO_ROOT, repoPath, getScreeningDefaultsForTimeframe, normalizeTimeframe, scaleScreeningToTimeframe, TIMEFRAME_SCREENING_SCALES };

const USER_CONFIG_PATH = paths.userConfigPath;
const GMGN_CONFIG_PATH = paths.gmgnConfigPath;
const DEFAULT_HIVEMIND_URL = "https://api.agentmeridian.xyz";
const DEFAULT_AGENT_MERIDIAN_API_URL = "https://api.agentmeridian.xyz/api";
const DEFAULT_AGENT_MERIDIAN_PUBLIC_KEY = "bWVyaWRpYW4taXMtdGhlLWJlc3QtYWdlbnRz";
const DEFAULT_HIVEMIND_API_KEY = DEFAULT_AGENT_MERIDIAN_PUBLIC_KEY;

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8"))
    : {};
}

const u = readJsonIfExists(USER_CONFIG_PATH);
const gmgnUserConfig = readJsonIfExists(GMGN_CONFIG_PATH);

// Strip dead screening-side orphans. Upstream deleted these in its setup
// overhaul (setup.js delete block); our merge fdc0c45 swallowed the overhaul
// but dropped the delete lines, so the keys lingered in user-config.json and
// were still advertised to the LLM. config.js has no field for either, so this
// is purely defensive — should one reappear in the file it can never be read.
// The LIVE bundler/ATH gates are maxBotHoldersPct + gmgn.maxBundlerRate +
// gmgn.athFilterPct (key gmgnAthFilterPct) — those are untouched here.
// See notes/dev-crosscheck.md §4/§5.
delete u.maxBundlePct;
delete u.athFilterPct;

export const MIN_SAFE_BINS_BELOW = 35;

function numericConfig(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const legacyBinsBelow = numericConfig(u.binsBelow);
const configuredMinBinsBelow = numericConfig(u.minBinsBelow) ?? MIN_SAFE_BINS_BELOW;
const configuredMaxBinsBelow = numericConfig(u.maxBinsBelow)
  ?? (legacyBinsBelow != null ? Math.max(legacyBinsBelow, configuredMinBinsBelow) : 69);
const configuredDefaultBinsBelow = numericConfig(u.defaultBinsBelow) ?? legacyBinsBelow ?? configuredMaxBinsBelow;
const strategyMinBinsBelow = Math.max(MIN_SAFE_BINS_BELOW, Math.round(configuredMinBinsBelow));
const strategyMaxBinsBelow = Math.max(strategyMinBinsBelow, Math.round(configuredMaxBinsBelow));
const strategyDefaultBinsBelow = Math.max(
  strategyMinBinsBelow,
  Math.min(strategyMaxBinsBelow, Math.round(configuredDefaultBinsBelow)),
);

// Apply wallet/RPC from user-config if not already in env
if (u.rpcUrl)    process.env.RPC_URL            ||= u.rpcUrl;
if (u.walletKey) process.env.WALLET_PRIVATE_KEY ||= u.walletKey;
if (u.llmModel)  process.env.LLM_MODEL          ||= u.llmModel;
if (u.llmBaseUrl) process.env.LLM_BASE_URL      ||= u.llmBaseUrl;
if (u.llmApiKey)  process.env.LLM_API_KEY       ||= u.llmApiKey;
if (u.dryRun !== undefined) process.env.DRY_RUN = String(u.dryRun);
if (u.publicApiKey) process.env.PUBLIC_API_KEY ||= u.publicApiKey;
if (u.agentMeridianApiUrl) process.env.AGENT_MERIDIAN_API_URL ||= u.agentMeridianApiUrl;
if (gmgnUserConfig.apiKey || u.gmgnApiKey) {
  process.env.GMGN_API_KEY ||= gmgnUserConfig.apiKey || u.gmgnApiKey;
}
if (u.telegramChatId) process.env.TELEGRAM_CHAT_ID ||= String(u.telegramChatId);

const indicatorUserConfig = u.chartIndicators ?? {};

/**
 * Racikan-borne prompt rules (`promptNotes` in user-config.json). The loaded
 * preset carries its own prompt "character" as data, so behavior travels with
 * the racikan file — never hardcode racikan-specific prompt text in code.
 * Accepts a plain array (= SCREENER notes) or a per-role object
 * { screener: [], manager: [], general: [] }. Anything malformed → empty.
 */
function normalizePromptNotes(raw) {
  const clean = (v) => Array.isArray(v)
    ? v.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
    : [];
  if (Array.isArray(raw)) return { screener: clean(raw), manager: [], general: [] };
  if (raw && typeof raw === "object") {
    return { screener: clean(raw.screener), manager: clean(raw.manager), general: clean(raw.general) };
  }
  return { screener: [], manager: [], general: [] };
}

function nonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function gmgnValue(key, legacyKey, fallback) {
  return gmgnUserConfig[key] ?? u[legacyKey] ?? fallback;
}

function gmgnArray(key, legacyKey, fallback) {
  if (Array.isArray(gmgnUserConfig[key])) return gmgnUserConfig[key];
  if (Array.isArray(u[legacyKey])) return u[legacyKey];
  return fallback;
}

export const config = {
  // ─── Identity / Setup ────────────────────
  // Two SEPARATE concepts (historically conflated under one "preset" word):
  //   profile     = wizard archetype chosen at setup (degen|moderate|safe|custom).
  //                 Static — only changes if you re-run setup. Character baseline.
  //   activeSetup = the named saved snapshot ("Racikan") currently loaded via
  //                 /preset use (e.g. "mainzen_v2"); null = none. Set by applyPreset.
  // See preset-manager.js + SETTINGS-GUIDE "Profil vs Racikan".
  profile:     u.preset       ?? "moderate",
  activeSetup: u.activeSetup  ?? null,
  // Free-text prompt rules carried by the loaded Racikan (see normalizePromptNotes).
  promptNotes: normalizePromptNotes(u.promptNotes),

  // ─── Risk Limits ─────────────────────────
  risk: {
    maxPositions:    u.maxPositions    ?? 3,
    maxDeployAmount: u.maxDeployAmount ?? 50,
  },

  // ─── Pool Screening Thresholds ───────────
  screening: {
    source:            u.screeningSource    ?? "meteora", // meteora | gmgn
    excludeHighSupplyConcentration: u.excludeHighSupplyConcentration ?? true,
    minFeeActiveTvlRatio: u.minFeeActiveTvlRatio ?? 0.05,
    minTvl:            u.minTvl            ?? 10_000,
    maxTvl:            u.maxTvl !== undefined ? u.maxTvl : 150_000,
    minVolume:         u.minVolume         ?? 500,
    minOrganic:        u.minOrganic        ?? 60,
    minQuoteOrganic:   u.minQuoteOrganic   ?? 60,
    minHolders:        u.minHolders        ?? 500,
    minMcap:           u.minMcap           ?? 150_000,
    maxMcap:           u.maxMcap           ?? 10_000_000,
    minBinStep:        u.minBinStep        ?? 80,
    maxBinStep:        u.maxBinStep        ?? 125,
    timeframe:         u.timeframe         ?? "5m",
    category:          u.category          ?? "trending",
    // Multi-category discovery: fetch each listed category and merge+dedupe (breadth, same filters).
    // null/[] = factory single-category behavior (falls back to `category`). Valid API values: trending|top|new.
    categories:        Array.isArray(u.screeningCategories) ? u.screeningCategories : null,
    minTokenFeesSol:   u.minTokenFeesSol   ?? 30,  // global fees paid (priority+jito tips). below = bundled/scam
    useDiscordSignals: u.useDiscordSignals ?? false,
    discordSignalMode: u.discordSignalMode ?? "merge", // merge | only
    avoidPvpSymbols:   u.avoidPvpSymbols   ?? true, // avoid exact-symbol rivals with real active pools
    blockPvpSymbols:   u.blockPvpSymbols   ?? false, // hard-filter PVP rivals before the LLM sees them
    maxBotHoldersPct:  u.maxBotHoldersPct  ?? 30,  // max bot holder addresses % (Jupiter audit)
    maxTop10Pct:       u.maxTop10Pct       ?? 60,  // max top 10 holders concentration
    allowedLaunchpads: u.allowedLaunchpads ?? [],  // allow-list launchpads, [] = no allow-list
    blockedLaunchpads:  u.blockedLaunchpads  ?? [],  // e.g. ["letsbonk.fun", "pump.fun"]
    minTokenAgeHours:   u.minTokenAgeHours   ?? null, // null = no minimum
    maxTokenAgeHours:   u.maxTokenAgeHours   ?? null, // null = no maximum
  },

  gmgn: {
    apiKey: nonEmptyString(gmgnUserConfig.apiKey, u.gmgnApiKey, process.env.GMGN_API_KEY),
    baseUrl: nonEmptyString(gmgnUserConfig.baseUrl, u.gmgnBaseUrl, "https://openapi.gmgn.ai"),
    // gmgn = use GMGN /v1/token/info total_fee for global_fees_sol (minTokenFeesSol gate); jupiter = legacy Jupiter fees
    feeSource: nonEmptyString(gmgnUserConfig.feeSource, u.gmgnFeeSource, "gmgn"),
    interval: gmgnValue("interval", "gmgnInterval", "5m"),
    orderBy: gmgnValue("orderBy", "gmgnOrderBy", "default"),
    direction: gmgnValue("direction", "gmgnDirection", "desc"),
    limit: gmgnValue("limit", "gmgnLimit", 100),
    enrichLimit: gmgnValue("enrichLimit", "gmgnEnrichLimit", 20),
    requestDelayMs: gmgnValue("requestDelayMs", "gmgnRequestDelayMs", 350),
    maxRetries: gmgnValue("maxRetries", "gmgnMaxRetries", 2),
    holdersLimit: gmgnValue("holdersLimit", "gmgnHoldersLimit", 100),
    klineResolution: gmgnValue("klineResolution", "gmgnKlineResolution", "5m"),
    klineLookbackMinutes: gmgnValue("klineLookbackMinutes", "gmgnKlineLookbackMinutes", 60),
    filters: gmgnArray("filters", "gmgnFilters", ["renounced", "frozen", "not_wash_trading"]),
    platforms: gmgnArray("platforms", "gmgnPlatforms", ["Pump.fun", "meteora_virtual_curve", "pool_meteora"]),
    minMcap: gmgnValue("minMcap", "gmgnMinMcap", u.minMcap ?? 150_000),
    maxMcap: gmgnValue("maxMcap", "gmgnMaxMcap", u.maxMcap ?? 10_000_000),
    minTvl: gmgnValue("minTvl", "gmgnMinTvl", u.minTvl ?? 10_000),
    minVolume: gmgnValue("minVolume", "gmgnMinVolume", 1000),
    minHolders: gmgnValue("minHolders", "gmgnMinHolders", u.minHolders ?? 500),
    minTokenAgeHours: gmgnValue("minTokenAgeHours", "gmgnMinTokenAgeHours", 2),
    maxTokenAgeHours: gmgnValue("maxTokenAgeHours", "gmgnMaxTokenAgeHours", 24 * 7),
    minSmartDegenCount: gmgnValue("minSmartDegenCount", "gmgnMinSmartDegenCount", 1),
    requireKol: gmgnValue("requireKol", "gmgnRequireKol", true),
    minKolCount: gmgnValue("minKolCount", "gmgnMinKolCount", 1),
    maxRugRatio: gmgnValue("maxRugRatio", "gmgnMaxRugRatio", 0.3),
    maxTop10HolderRate: gmgnValue("maxTop10HolderRate", "gmgnMaxTop10HolderRate", 0.5),
    maxBundlerRate: gmgnValue("maxBundlerRate", "gmgnMaxBundlerRate", 0.5),
    maxRatTraderRate: gmgnValue("maxRatTraderRate", "gmgnMaxRatTraderRate", 0.2),
    maxFreshWalletRate: gmgnValue("maxFreshWalletRate", "gmgnMaxFreshWalletRate", 0.2),
    maxDevTeamHoldRate: gmgnValue("maxDevTeamHoldRate", "gmgnMaxDevTeamHoldRate", 0.02),
    preferredKolMinHoldPct: gmgnValue("preferredKolMinHoldPct", "gmgnPreferredKolMinHoldPct", 1),
    dumpKolMinHoldPct: gmgnValue("dumpKolMinHoldPct", "gmgnDumpKolMinHoldPct", 0.5),
    maxBotDegenRate: gmgnValue("maxBotDegenRate", "gmgnMaxBotDegenRate", 0.4),
    maxSniperCount: gmgnValue("maxSniperCount", "gmgnMaxSniperCount", 20),
    maxSniperHoldRate: gmgnValue("maxSniperHoldRate", "gmgnMaxSniperHoldRate", 0.3),
    minTotalFeeSol: gmgnValue("minTotalFeeSol", "gmgnMinTotalFeeSol", 30),
    athFilterPct: gmgnValue("athFilterPct", "gmgnAthFilterPct", null),
    preferredKolNames: gmgnArray("preferredKolNames", "gmgnPreferredKolNames", []),
    dumpKolNames: gmgnArray("dumpKolNames", "gmgnDumpKolNames", []),
    indicatorFilter: gmgnValue("indicatorFilter", "gmgnIndicatorFilter", true),
    indicatorInterval: gmgnValue("indicatorInterval", "gmgnIndicatorInterval", "15_MINUTE"),
    indicatorRules: (() => {
      const r = gmgnUserConfig.indicatorRules || {};
      return {
        requireBullishSupertrend: r.requireBullishSupertrend ?? true,
        rejectAlreadyAtBottom:    r.rejectAlreadyAtBottom    ?? true,
        requireAboveSupertrend:   r.requireAboveSupertrend   ?? false,
        minRsi:                   r.minRsi                   ?? null,
        maxRsi:                   r.maxRsi                   ?? null,
        requireBbPosition:        r.requireBbPosition        ?? null,
      };
    })(),
  },

  // ─── Position Management ────────────────
  management: {
    minClaimAmount:        u.minClaimAmount        ?? 5,
    autoSwapAfterClaim:    u.autoSwapAfterClaim    ?? false,
    outOfRangeBinsToClose: u.outOfRangeBinsToClose ?? 10,
    outOfRangeWaitMinutes: u.outOfRangeWaitMinutes ?? 30,
    oorCooldownTriggerCount: u.oorCooldownTriggerCount ?? 3,
    oorCooldownHours:       u.oorCooldownHours       ?? 12,
    repeatDeployCooldownEnabled: u.repeatDeployCooldownEnabled ?? true,
    repeatDeployCooldownTriggerCount: u.repeatDeployCooldownTriggerCount ?? 3,
    repeatDeployCooldownHours: u.repeatDeployCooldownHours ?? 12,
    repeatDeployCooldownScope: u.repeatDeployCooldownScope ?? "token", // pool | token | both
    repeatDeployCooldownMinFeeEarnedPct: u.repeatDeployCooldownMinFeeEarnedPct ?? u.repeatDeployCooldownMinFeeYieldPct ?? 0,
    minVolumeToRebalance:  u.minVolumeToRebalance  ?? 1000,
    stopLossPct:           u.stopLossPct           ?? u.emergencyPriceDropPct ?? -50,
    takeProfitPct:         u.takeProfitPct         ?? u.takeProfitFeePct ?? 5,
    minFeePerTvl24h:       u.minFeePerTvl24h       ?? 7,
    minAgeBeforeYieldCheck: u.minAgeBeforeYieldCheck ?? 60, // minutes before low yield can trigger close
    minSolToOpen:          u.minSolToOpen          ?? 0.55,
    deployAmountSol:       u.deployAmountSol       ?? 0.5,
    gasReserve:            u.gasReserve            ?? 0.2,
    // gasReserve auto-tune (default OFF): when on, periodically right-sizes
    // gasReserve from REAL measured gas burn (keep gasReserveBufferDays of runway,
    // never below gasReserveFloorSol). OFF = gasReserve stays exactly as you set it.
    gasReserveAutoTune:    u.gasReserveAutoTune    ?? false,
    gasReserveBufferDays:  u.gasReserveBufferDays  ?? 14,
    gasReserveFloorSol:    u.gasReserveFloorSol    ?? 0.03,
    positionSizePct:       u.positionSizePct       ?? 0.35,
    // Sizing mode: "fixed" (factory) = computeDeployAmount uses the legacy
    // walletSol×positionSizePct formula (slot-blind). "maximize" = split the
    // deployable wallet evenly across the REMAINING position slots, reserving
    // gas + rent per slot, so every maxPositions slot can open without the
    // last one failing on rent. Default "fixed" → behavior byte-identical.
    sizingMode:            u.sizingMode            ?? "fixed",
    // SOL locked as account rent per open DLMM position (refundable on close).
    // 0 (factory) = balance check & sizing ignore rent (legacy). >0 (e.g. 0.057)
    // = balance check reserves it AND "maximize" sizing reserves it per slot.
    rentPerPositionSol:    u.rentPerPositionSol    ?? 0,
    // Trailing take-profit
    trailingTakeProfit:    u.trailingTakeProfit    ?? true,
    trailingTriggerPct:    u.trailingTriggerPct    ?? 3,    // activate trailing at X% PnL
    trailingDropPct:       u.trailingDropPct       ?? 1.5,  // close when drops X% from peak
    pnlSanityMaxDiffPct:   u.pnlSanityMaxDiffPct   ?? 5,    // max allowed diff between reported and derived pnl % before ignoring a tick
    // SOL mode — positions, PnL, and balances reported in SOL instead of USD
    solMode:               u.solMode               ?? false,
  },

  // ─── Strategy Mapping ───────────────────
  strategy: {
    strategy:     u.strategy     ?? "bid_ask",
    // "default" (factory) = flexible: LLM/user choice wins, config.strategy.strategy
    // is only the fallback. "spot" | "bid_ask" | "curve" = mechanical lock: executor
    // force-overwrites every deploy's strategy regardless of what was requested.
    strategyLock: u.strategyLock ?? "default",
    minBinsBelow: strategyMinBinsBelow,
    maxBinsBelow: strategyMaxBinsBelow,
    defaultBinsBelow: strategyDefaultBinsBelow,

    // ─── Dual-side (E1) — default OFF, byte-identical saat OFF ───
    // Naruh sebagian kecil modal sbg TOKEN di bin ATAS harga → nangkep fee & apresiasi
    // saat harga pump. OFF = single-side SOL seperti biasa (nol perubahan perilaku).
    dualSideEnabled:   u.dualSideEnabled   ?? false,  // gerbang utama
    dualSideTokenPct:  u.dualSideTokenPct  ?? 10,     // PERSEN (10 = 10%); di-/100 saat dipakai
    dualSideUpsidePct: u.dualSideUpsidePct ?? 15,     // seberapa jauh (%) di atas harga token dipasang
    dualSideStrategy:  u.dualSideStrategy  ?? "bid_ask", // "spot" | "bid_ask" bentuk sebaran atas
  },

  // ─── Scheduling ─────────────────────────
  schedule: {
    managementIntervalMin:  u.managementIntervalMin  ?? 10,
    screeningIntervalMin:   u.screeningIntervalMin   ?? 30,
    healthCheckIntervalMin: u.healthCheckIntervalMin ?? 60,
    // Adaptive screening: when true, the screening cadence stretches during
    // historically weak WIB sessions (saves LLM tokens) but stays 24/7.
    // screeningIntervalMin acts as the floor (fastest); maxScreeningIntervalMin
    // the ceiling (slowest). When false, screeningIntervalMin is fixed.
    adaptiveScreening:       u.adaptiveScreening       ?? false,
    maxScreeningIntervalMin: u.maxScreeningIntervalMin ?? 90,
  },

  // ─── LLM Settings ──────────────────────
  llm: {
    temperature: u.temperature ?? 0.373,
    maxTokens:   u.maxTokens   ?? 4096,
    generalMaxTokens: u.generalMaxTokens ?? 8192,
    maxSteps:    u.maxSteps    ?? 20,
    managementModel: u.managementModel ?? process.env.LLM_MODEL ?? "openrouter/healer-alpha",
    screeningModel:  u.screeningModel  ?? process.env.LLM_MODEL ?? "openrouter/hunter-alpha",
    generalModel:    u.generalModel    ?? process.env.LLM_MODEL ?? "openrouter/healer-alpha",
  },

  // ─── Learning / Auto-Evolve ───────────
  // Gate for evolveThresholds (the auto-writer of minFeeActiveTvlRatio + minOrganic,
  // fired every 5 closes). true (default) = factory behavior unchanged. false = FROZEN:
  // the auto-write is skipped so a baseline racikan never drifts while it's being tuned.
  // Reversible (flip back to true). Darwin (signal weights) has its OWN toggle below.
  learning: {
    evolveEnabled:  u.evolveEnabled     ?? true,
  },

  // ─── Darwinian Signal Weighting ───────
  darwin: {
    enabled:        u.darwinEnabled     ?? true,
    windowDays:     u.darwinWindowDays  ?? 60,
    recalcEvery:    u.darwinRecalcEvery ?? 5,    // recalc every N closes
    boostFactor:    u.darwinBoost       ?? 1.05,
    decayFactor:    u.darwinDecay       ?? 0.95,
    weightFloor:    u.darwinFloor       ?? 0.3,
    weightCeiling:  u.darwinCeiling     ?? 2.5,
    minSamples:     u.darwinMinSamples  ?? 10,
  },

  // ─── Common Token Mints ────────────────
  tokens: {
    SOL:  "So11111111111111111111111111111111111111112",
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },

  // ─── HiveMind ─────────────────────────
  hiveMind: {
    url: nonEmptyString(u.hiveMindUrl, DEFAULT_HIVEMIND_URL),
    apiKey: nonEmptyString(u.hiveMindApiKey, process.env.HIVEMIND_API_KEY, DEFAULT_HIVEMIND_API_KEY),
    agentId: u.agentId ?? null,
    pullMode: u.hiveMindPullMode ?? "auto",
  },

  api: {
    url: nonEmptyString(u.agentMeridianApiUrl, process.env.AGENT_MERIDIAN_API_URL, DEFAULT_AGENT_MERIDIAN_API_URL),
    publicApiKey: nonEmptyString(u.publicApiKey, process.env.PUBLIC_API_KEY, DEFAULT_AGENT_MERIDIAN_PUBLIC_KEY),
    lpAgentRelayEnabled: u.lpAgentRelayEnabled ?? false,
  },

  // ─── PnL fetcher / poller (public infra: RPC + Meteora deposits + Jupiter) ──
  pnl: {
    rpcUrl: nonEmptyString(u.pnlRpcUrl, process.env.PNL_RPC_URL, "https://pump.helius-rpc.com"),
    source: nonEmptyString(u.pnlSource, "rpc"), // rpc | meteora (fallback-only)
    pollIntervalSec: Number(u.pnlPollIntervalSec ?? 3),
    depositCacheTtlSec: Number(u.pnlDepositCacheTtlSec ?? 300),
  },

  jupiter: {
    apiKey: process.env.JUPITER_API_KEY ?? "",
    referralAccount:
      process.env.JUPITER_REFERRAL_ACCOUNT ??
      "9MzhDUnq3KxecyPzvhguQMMPbooXQ3VAoCMPDnoijwey",
    referralFeeBps: Number(
      process.env.JUPITER_REFERRAL_FEE_BPS ?? 50,
    ),
    referralEnabled: u.jupiterReferralEnabled ?? true,
  },

  indicators: {
    enabled: indicatorUserConfig.enabled ?? false,
    entryPreset: indicatorUserConfig.entryPreset ?? "supertrend_break",
    exitPreset: indicatorUserConfig.exitPreset ?? "supertrend_break",
    // exitEnabled (default OFF): when false the exitPreset is inert (factory
    // behavior — exits governed only by stopLoss/TP/trailing/yield-floor/OOR).
    // When true, a confirmed exitPreset signal can trigger a position close.
    exitEnabled: indicatorUserConfig.exitEnabled ?? false,
    rsiLength: indicatorUserConfig.rsiLength ?? 2,
    intervals: Array.isArray(indicatorUserConfig.intervals)
      ? indicatorUserConfig.intervals
      : ["5_MINUTE"],
    candles: indicatorUserConfig.candles ?? 298,
    rsiOversold: indicatorUserConfig.rsiOversold ?? 30,
    rsiOverbought: indicatorUserConfig.rsiOverbought ?? 80,
    requireAllIntervals: indicatorUserConfig.requireAllIntervals ?? false,
    // rejectAlreadyAtBottom (default OFF): ported from GMGN checkBounceSetup.
    // When true, the meteora ENTRY gate additionally vetoes a candidate that has
    // already dumped to the bottom (RSI < oversold AND price below lower
    // Bollinger) — no room left to dump into a single-side-below range.
    rejectAlreadyAtBottom: indicatorUserConfig.rejectAlreadyAtBottom ?? false,
    // SMI (supertrend_plus_smi preset) — client-side TA from candles[], see
    // tools/smi.js. Only the three recency windows are tunable here; the SMI
    // math (lenK/lenD/lenE, MID, PD/PA trigger counts) is fixed in the module.
    // PathA: cross-down within smiCrossWindow candles, preceded by a PD trigger
    // within smiPdLookback candles before it. PathB: PA trigger within smiPaLookback.
    smiPdLookback: indicatorUserConfig.smiPdLookback ?? 5,
    smiPaLookback: indicatorUserConfig.smiPaLookback ?? 3,
    smiCrossWindow: indicatorUserConfig.smiCrossWindow ?? 3,
  },

  // ─── Experimental Features (🧪 GRUP 16) ─────────────────────
  // Every flag defaults to false → OFF = factory behavior: the feature's code
  // path is skipped entirely, so the bot runs exactly as if it didn't exist.
  // Toggle via /setcfg or /settings; shown grouped under 🧪 in /config so it's
  // easy to track what's still experimental.
  experiments: {
    // #3 Exit-liquidity check — before a deploy, probe the round-trip cost of
    // entering and exiting the full position back to SOL (Jupiter quote, no real
    // tx). Skip pools where that cost exceeds exitLiquidityMaxSlippagePct.
    exitLiquidityCheck:          u.exitLiquidityCheck          ?? false,
    exitLiquidityMaxSlippagePct: u.exitLiquidityMaxSlippagePct ?? 10,
    // #4 Market regime gate — before screening runs, read SOL's 24h price change
    // (Jupiter price, read-only). If SOL is down more than marketRegimeMaxDrop24hPct
    // over 24h, treat the market as risk-off and skip the whole screening cycle
    // (no LLM call, no new deploy). Catches scheduled + freed-slot screening.
    marketRegimeGate:            u.marketRegimeGate            ?? false,
    marketRegimeMaxDrop24hPct:   u.marketRegimeMaxDrop24hPct   ?? 8,
    // #1 Candidate momentum — snapshot each screening candidate's TVL/volume/mcap
    // every cycle (candidate-memory.json) and annotate the SCREENER's candidate
    // block with the delta over the retained window. Soft signal only — surfaces
    // pools that are gaining vs fading; never gates a deploy on its own.
    candidateMomentum:           u.candidateMomentum           ?? false,
    // #7 Narrative profile signal — bucket closed-position performance by the
    // narrative_category tagged at deploy and inject a soft one-line hint into the
    // SCREENER prompt (best/weakest narratives). Tagging is collected passively;
    // this flag only gates the prompt nudge. Never overrides hard rules.
    narrativeProfileSignal:      u.narrativeProfileSignal      ?? false,
    // #2 Expected yield-to-me (proxy) — annotate each candidate with a rough
    // estimate of OUR footprint and fee capture: share of pool TVL (deposit USD /
    // pool TVL) + expected fees/window (deposit × fee/active-TVL ratio). A proxy —
    // it ignores per-bin liquidity concentration (the accurate version needs the
    // SDK's bin reserves). Soft signal only; never gates a deploy.
    expectedYieldSignal:         u.expectedYieldSignal         ?? false,
    // #6 Conviction sizing — let the SCREENER's conviction nudge the deploy size:
    // high → bigger, low → smaller, by at most convictionSizingMaxAdjustPct, and
    // ALWAYS re-clamped to [deployAmountSol, maxDeployAmount] so it can never breach
    // the configured min/max sizing. medium/omitted = no change. See applyConvictionSizing.
    convictionSizing:            u.convictionSizing            ?? false,
    convictionSizingMaxAdjustPct: u.convictionSizingMaxAdjustPct ?? 30,
    // #8 Counterfactual skip review — reuse the candidate snapshots to review
    // pools we LOOKED at but did NOT deploy into, and report in the daily briefing
    // which skips later popped (mcap gain ≥ counterfactualMinMcapGainPct) vs fell.
    // Reflection only — never gates anything. Short horizon (candidate-memory's 24h
    // retention). When on, candidate snapshots are recorded even if #1 is off.
    counterfactualReview:        u.counterfactualReview        ?? false,
    counterfactualMinMcapGainPct: u.counterfactualMinMcapGainPct ?? 25,
    // Smart-wallet momentum — track each candidate's smart-wallet count across
    // cycles (sw_snaps in candidate-memory) and add a soft line to the SCREENER's
    // candidate block when it moves: smart money entering = bullish, leaving =
    // bearish. Trusted (our own count), soft — never gates. Snapshots accrue only
    // when on; piggybacks on the candidate-memory store.
    smartWalletMomentum:         u.smartWalletMomentum         ?? false,
    // Idle-screening cooldown — when ON, throttle the 0-position screening trigger
    // (management cycle, index.js): during a dry spell the management tick fires a
    // full screening cycle (incl. LLM call) every tick. This caps that to at most
    // once per idleScreeningCooldownMin minutes. OFF (default) = factory: idle
    // screening fires every management tick. Shares _screeningLastTriggered with the
    // scheduled + freed-slot screening, so the scheduled cron still runs underneath.
    // Fail-open: any error → trigger screening (factory). Never blocks management.
    idleScreeningCooldown:       u.idleScreeningCooldown       ?? false,
    idleScreeningCooldownMin:    u.idleScreeningCooldownMin    ?? 20,
    // Paper trading — DRY-RUN ONLY. When ON (and DRY_RUN=true), a would-deploy
    // is tracked as a VIRTUAL position (state.json) instead of vanishing, so the
    // full lifecycle runs in simulation: /positions populates, Telegram fires a
    // 🧪-labelled deploy/close notice, getMyPositions/getPositionPnl return a
    // SIMULATED PnL (timing + in-range/OOR read from on-chain active bin = exact;
    // fees + IL = rough approximation, NOT a profit forecast), close rules run,
    // and recordPerformance feeds lessons.json + briefings. Lets you evaluate a
    // preset's ENTRY behavior in dry-run. No effect when live (DRY_RUN!=true) or
    // off (factory: would-deploy returns and vanishes). See paper-trading.js.
    paperTrading:                u.paperTrading                ?? false,
    // Use paper history when live — only consulted once LIVE (DRY_RUN off). OFF
    // (default/factory) = a paper history left on file is fully ignored when live:
    // sim records never reach the prompt, thresholds, reports or hive (they're
    // already isolated by the `paper` tag). ON = paper-derived LESSONS may be
    // injected into the live prompt as a 🧪-flagged, LOW-CREDIBILITY soft reference
    // ONLY — still excluded from threshold evolution, signal weights, reports and
    // hive. Lets a live bot "remember" what dry-run taught it without contaminating
    // any mechanical/reporting path. No effect while dry-running (paper is the data).
    usePaperHistoryWhenLive:     u.usePaperHistoryWhenLive     ?? false,
  },

  // Trade reports — milestone learning report (auto every N closes) + on-demand
  // /report. learningReportEvery=0 disables the auto milestone report; /report
  // still works. learningReportTrendN = how many recent closes the "last N vs
  // prior N" trend compares.
  reports: {
    learningReportEvery: u.learningReportEvery ?? 10,
    learningReportTrendN: u.learningReportTrendN ?? 10,
  },
};

/**
 * Minimum SOL a single position may deploy — our sanity floor against dust
 * positions (NOT a Meteora protocol limit; Meteora accepts smaller deposits).
 * Shared by computeDeployAmount (maximize adaptive slots) AND the deploy safety
 * check (executor.js) so the two can never disagree — a divergence there is what
 * let sizing emit a sub-min amount the check then rejected (the stuck-retry bug).
 */
export function minDeployAmount() {
  return Math.max(0.1, config.management.deployAmountSol ?? 0.1);
}

/**
 * Compute the optimal deploy amount for a given wallet balance.
 *
 * Two modes (config.management.sizingMode):
 *
 * "fixed" (factory) — scales position size with wallet growth (compounding):
 *   Formula: clamp(deployable × positionSizePct, floor=deployAmountSol, ceil=maxDeployAmount)
 *   Examples (defaults: gasReserve=0.2, positionSizePct=0.35, floor=0.5):
 *     0.8 SOL wallet → 0.6 SOL deploy (floor) · 2.0 → 0.63 · 3.0 → 0.98 · 4.0 → 1.33
 *   Slot-blind: ignores how many position slots remain.
 *
 * "maximize" — fills the wallet across the REMAINING slots with ADAPTIVE slot
 *   count, reserving gas + rent per slot so every slot opens without the last
 *   failing on rent:
 *     perSlot(N) = (walletSol − gasReserve − rentPerPositionSol × N) / N
 *   Picks the LARGEST N ∈ [1..slotsRemaining] whose perSlot stays ≥ minDeployAmount,
 *   so it opens as many positions as the wallet can size at/above the floor (small
 *   wallet → falls back to one bigger position). If even N=1 can't clear the floor,
 *   returns 0 (explicit "can't deploy"). Re-derived from the CURRENT wallet every
 *   cycle (self-corrects as positions fill), floored to 3 decimals so it NEVER
 *   over-commits the balance check, clamped to maxDeployAmount. slotsRemaining
 *   defaults to maxPositions (fresh-start, most conservative).
 *
 * @param {number} walletSol  current free wallet SOL
 * @param {{slotsRemaining?: number}} [opts]  open slots left to fill (maximize mode)
 */
export function computeDeployAmount(walletSol, opts = {}) {
  const reserve  = config.management.gasReserve      ?? 0.2;
  const ceil     = config.risk.maxDeployAmount;

  if (config.management.sizingMode === "maximize") {
    const rent     = Math.max(0, config.management.rentPerPositionSol ?? 0);
    const maxSlots = Math.max(1, Math.floor(opts.slotsRemaining ?? config.risk.maxPositions ?? 1));
    const min      = minDeployAmount();
    // ADAPTIVE SLOTS. perSlot = (wallet − gas − rent×N)/N decreases monotonically
    // as N grows (more rent reserved + a smaller share each), so the LARGEST N that
    // still keeps every slot ≥ min opens as many positions as possible without any
    // falling under the floor. Iterate N down from the open slots; take the first
    // that clears min. If even a single position can't reach min (wallet too small),
    // return 0 — an explicit "can't deploy" signal. Returning a sub-min amount was
    // the stuck-retry bug: the deploy safety check rejects it, the LLM retries, the
    // cycle burns. 0 lets callers skip cleanly instead.
    for (let n = maxSlots; n >= 1; n--) {
      const deployable = Math.max(0, walletSol - reserve - rent * n);
      const perSlot    = Math.floor((deployable / n) * 1000) / 1000; // never round UP
      if (perSlot >= min) return Math.min(ceil, perSlot);
    }
    return 0;
  }

  const pct        = config.management.positionSizePct ?? 0.35;
  const floor      = config.management.deployAmountSol;
  const deployable = Math.max(0, walletSol - reserve);
  const dynamic    = deployable * pct;
  const result     = Math.min(ceil, Math.max(floor, dynamic));
  return parseFloat(result.toFixed(2));
}

/**
 * 🧪 Experiment #6: conviction sizing. Nudge a chosen deploy amount up or down
 * based on the SCREENER's conviction in the setup, but strictly INSIDE the same
 * [floor=deployAmountSol, ceil=maxDeployAmount] rails computeDeployAmount uses —
 * so it can NEVER breach the configured min/max sizing (the user's worry).
 *
 *   high → amt × (1 + adj),  low → amt × (1 - adj),  medium/unknown → amt
 *   adj = convictionSizingMaxAdjustPct / 100   (e.g. 30 → ±30%)
 *
 * Returns the input unchanged when the experiment is off or conviction is
 * medium/missing (multiplier 1.0 = factory behavior). Fail-safe on bad input.
 */
export function applyConvictionSizing(amountSol, conviction) {
  const amt = Number(amountSol);
  if (!Number.isFinite(amt) || amt <= 0) return amountSol;
  if (!config.experiments?.convictionSizing) return amt;
  const adj = Math.max(0, Number(config.experiments.convictionSizingMaxAdjustPct ?? 30)) / 100;
  const mult = conviction === "high" ? 1 + adj : conviction === "low" ? 1 - adj : 1;
  if (mult === 1) return amt;
  const floor = config.management.deployAmountSol;
  const ceil  = config.risk.maxDeployAmount;
  return parseFloat(Math.min(ceil, Math.max(floor, amt * mult)).toFixed(2));
}

/**
 * Update one live config value AND persist it to user-config.json (flat key, the
 * shape config reads on startup). Used by auto-tuners outside the update_config
 * tool path. Returns true on a successful write. Fail-open.
 */
export function persistConfigChange(section, field, flatKey, value) {
  if (config[section]) config[section][field] = value;
  try {
    const u = fs.existsSync(USER_CONFIG_PATH) ? JSON.parse(fs.readFileSync(USER_CONFIG_PATH, "utf8")) : {};
    u[flatKey] = value;
    fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(u, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reload user-config.json and apply updated screening thresholds to the
 * in-memory config object. Called after threshold evolution so the next
 * agent cycle uses the evolved values without a restart.
 */
export function reloadScreeningThresholds() {
  try {
    const fresh = readJsonIfExists(USER_CONFIG_PATH);
    const s = config.screening;
    if (fresh.screeningSource != null) s.source = fresh.screeningSource;
    if (fresh.minFeeActiveTvlRatio != null) s.minFeeActiveTvlRatio = fresh.minFeeActiveTvlRatio;
    if (fresh.minTokenFeesSol  != null) s.minTokenFeesSol  = fresh.minTokenFeesSol;
    if (fresh.maxTop10Pct      != null) s.maxTop10Pct      = fresh.maxTop10Pct;
    if (fresh.useDiscordSignals !== undefined) s.useDiscordSignals = fresh.useDiscordSignals;
    if (fresh.discordSignalMode != null) s.discordSignalMode = fresh.discordSignalMode;
    if (fresh.excludeHighSupplyConcentration !== undefined) s.excludeHighSupplyConcentration = fresh.excludeHighSupplyConcentration;
    if (fresh.minOrganic     != null) s.minOrganic     = fresh.minOrganic;
    if (fresh.minQuoteOrganic != null) s.minQuoteOrganic = fresh.minQuoteOrganic;
    if (fresh.minHolders     != null) s.minHolders     = fresh.minHolders;
    if (fresh.minMcap        != null) s.minMcap        = fresh.minMcap;
    if (fresh.maxMcap        != null) s.maxMcap        = fresh.maxMcap;
    if (fresh.minTvl         != null) s.minTvl         = fresh.minTvl;
    if (fresh.maxTvl         !== undefined) s.maxTvl   = fresh.maxTvl;
    if (fresh.minVolume      != null) s.minVolume      = fresh.minVolume;
    if (fresh.minBinStep     != null) s.minBinStep     = fresh.minBinStep;
    if (fresh.maxBinStep     != null) s.maxBinStep     = fresh.maxBinStep;
    if (fresh.timeframe         != null) s.timeframe         = fresh.timeframe;
    if (fresh.category          != null) s.category          = fresh.category;
    if (fresh.screeningCategories !== undefined) s.categories = Array.isArray(fresh.screeningCategories) ? fresh.screeningCategories : null;
    if (fresh.minTokenAgeHours  !== undefined) s.minTokenAgeHours = fresh.minTokenAgeHours;
    if (fresh.maxTokenAgeHours  !== undefined) s.maxTokenAgeHours = fresh.maxTokenAgeHours;
    if (fresh.avoidPvpSymbols   !== undefined) s.avoidPvpSymbols = fresh.avoidPvpSymbols;
    if (fresh.blockPvpSymbols   !== undefined) s.blockPvpSymbols = fresh.blockPvpSymbols;
    if (fresh.maxBotHoldersPct  != null) s.maxBotHoldersPct = fresh.maxBotHoldersPct;
    if (fresh.allowedLaunchpads !== undefined) s.allowedLaunchpads = fresh.allowedLaunchpads;
    if (fresh.blockedLaunchpads !== undefined) s.blockedLaunchpads = fresh.blockedLaunchpads;
    // Racikan prompt rules: pick up hand-edits to user-config.json without a restart.
    if (fresh.promptNotes !== undefined) config.promptNotes = normalizePromptNotes(fresh.promptNotes);
    if (fresh.activeSetup !== undefined) config.activeSetup = fresh.activeSetup;
    // Auto-evolve freeze: hand-edits to evolveEnabled apply without a restart too.
    if (fresh.evolveEnabled !== undefined) { if (!config.learning) config.learning = {}; config.learning.evolveEnabled = fresh.evolveEnabled; }
    // Sizing mode + per-position rent reserve: pick up hand-edits without a restart.
    if (fresh.sizingMode !== undefined) config.management.sizingMode = fresh.sizingMode;
    if (fresh.rentPerPositionSol !== undefined) {
      const rv = numericConfig(fresh.rentPerPositionSol);
      if (rv != null) config.management.rentPerPositionSol = rv;
    }
    const minBinsBelow = numericConfig(fresh.minBinsBelow) ?? config.strategy.minBinsBelow;
    const maxBinsBelow = numericConfig(fresh.maxBinsBelow) ?? numericConfig(fresh.binsBelow) ?? config.strategy.maxBinsBelow;
    const defaultBinsBelow = numericConfig(fresh.defaultBinsBelow) ?? numericConfig(fresh.binsBelow) ?? config.strategy.defaultBinsBelow ?? maxBinsBelow;
    config.strategy.minBinsBelow = Math.max(MIN_SAFE_BINS_BELOW, Math.round(minBinsBelow));
    config.strategy.maxBinsBelow = Math.max(config.strategy.minBinsBelow, Math.round(maxBinsBelow));
    config.strategy.defaultBinsBelow = Math.max(
      config.strategy.minBinsBelow,
      Math.min(config.strategy.maxBinsBelow, Math.round(defaultBinsBelow)),
    );
  } catch { /* ignore */ }
  try {
    const freshGmgn = readJsonIfExists(GMGN_CONFIG_PATH);
    const g = config.gmgn;
    for (const [key, value] of Object.entries(freshGmgn)) {
      if (key in g && key !== "apiKey") g[key] = value;
    }
    if (freshGmgn.apiKey) g.apiKey = freshGmgn.apiKey;
  } catch { /* ignore */ }
}
