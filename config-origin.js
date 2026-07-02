// config-origin.js — single source of truth for the /config "origin" grouping.
//
// RENDER-ONLY. This module decides WHERE each /config row is shown (which
// ASAL section + relevance sub-group). It does NOT touch live values, config
// loading, or any trading logic. Pure data: imports nothing.
//
// Derived from notes/divergence-map.md (Bab 3 & Bab 5 = the source-of-truth for
// key origin). Labels there:
//   [DEV]  = asli upstream            → section "dev"
//   [ZEN]  = tambahan/ubahan zen      → section "zen"
//   UNKNOWN = tak tercantum di peta   → section "dev" (sub-grup ❓, perlu review)
//
// formatFullConfig() (index.js) builds a rowMap keyed by EXACTLY these key
// strings (live value + value-formatting stay there). The renderer walks
// ORIGIN_SECTIONS in order and pulls each row by key. Any computed row NOT
// referenced here falls into a safety "review" bucket — so a key can never be
// silently dropped. GMGN screening rows use a "gmgn." key prefix to stay unique
// (their screening twins — minTvl/minVolume/… — keep the bare key).

export const ORIGIN_SECTIONS = [
  {
    id: "dev",
    title: "⚙️ ORIGIN DEV",
    blurb: "Fitur asli upstream (kerangka inti bot).",
    subgroups: [
      {
        id: "dev-screening",
        title: "Screening",
        desc: "Filter pool dasar: TVL/volume/mcap/organic/holders/usia/bin-step/keamanan token/launchpad/Discord.",
        keys: [
          "timeframe", "category", "minTvl", "maxTvl", "minVolume",
          "minFeeActiveTvlRatio", "minTokenFeesSol", "minOrganic", "minQuoteOrganic",
          "minMcap", "maxMcap", "minHolders", "minTokenAgeHours", "maxTokenAgeHours",
          "minBinStep", "maxBinStep", "excludeHighSupplyConcentration",
          "maxBotHoldersPct", "maxTop10Pct", "avoidPvpSymbols", "blockPvpSymbols",
          "allowedLaunchpads", "blockedLaunchpads", "useDiscordSignals", "discordSignalMode",
        ],
      },
      {
        id: "dev-management",
        title: "Management & Risk",
        desc: "Modal & cadangan gas, exit (SL/TP/trailing), OOR + cooldown, yield-check, claim, rebalance.",
        keys: [
          "dryRun", "maxPositions", "maxDeployAmount", "deployAmountSol",
          "positionSizePct", "minSolToOpen", "gasReserve",
          "stopLossPct", "takeProfitPct", "trailingTakeProfit", "trailingTriggerPct", "trailingDropPct",
          "outOfRangeBinsToClose", "outOfRangeWaitMinutes", "oorCooldownTriggerCount", "oorCooldownHours",
          "minFeePerTvl24h", "minAgeBeforeYieldCheck", "minVolumeToRebalance",
          "minClaimAmount", "autoSwapAfterClaim",
          "repeatDeployCooldownEnabled", "repeatDeployCooldownTriggerCount", "repeatDeployCooldownHours",
          "repeatDeployCooldownScope", "repeatDeployCooldownMinFeeEarnedPct", "solMode",
        ],
      },
      {
        id: "dev-strategy",
        title: "Strategy & Bins",
        desc: "Bentuk sebaran modal + lebar range (bin).",
        keys: ["strategy", "minBinsBelow", "maxBinsBelow", "defaultBinsBelow"],
      },
      {
        id: "dev-schedule",
        title: "Schedule",
        desc: "Interval siklus manajemen, screening, health-check.",
        keys: ["managementIntervalMin", "screeningIntervalMin", "healthCheckIntervalMin"],
      },
      {
        id: "dev-llm",
        title: "LLM",
        desc: "Model AI per-peran + parameter generasi.",
        keys: ["managementModel", "screeningModel", "generalModel", "temperature", "maxTokens", "maxSteps"],
      },
      {
        id: "dev-darwin",
        title: "Darwin",
        desc: "Bobot sinyal adaptif (seleksi alam sinyal screening).",
        keys: [
          "darwinEnabled", "darwinWindowDays", "darwinRecalcEvery", "darwinBoost",
          "darwinDecay", "darwinFloor", "darwinCeiling", "darwinMinSamples",
        ],
      },
      {
        id: "dev-indicators",
        title: "Indicators",
        desc: "Gerbang timing teknikal dasar (RSI/Supertrend/Bollinger/Fibo, dihitung server-side).",
        keys: [
          "enabled", "entryPreset", "exitPreset", "rsiLength", "intervals", "candles",
          "rsiOversold", "rsiOverbought", "requireAllIntervals",
        ],
      },
      {
        id: "dev-infra",
        title: "Infra/Meridian",
        desc: "Koneksi inti: HiveMind, API Meridian, relay, poller PnL (RPC), GMGN fee-source.",
        keys: [
          "lpAgentRelayEnabled", "agentId", "publicApiKey", "pnlSource", "pnlRpcUrl",
          "pnlPollIntervalSec", "pnlDepositCacheTtlSec", "pnlSanityMaxDiffPct", "gmgnFeeSource",
          "hiveMindStatus", "hiveMindPullMode", "hiveMindUrl",
        ],
      },
    ],
  },
  {
    id: "zen",
    title: "🧩 ADD BY ZEN",
    blurb: "Tambahan/ubahan zen di atas kerangka dev.",
    subgroups: [
      {
        id: "zen-screening",
        title: "Screening+",
        desc: "Sumber & multi-kategori screening.",
        keys: ["screeningSource", "screeningCategories"],
      },
      {
        id: "zen-gmgn",
        title: "Screening-GMGN",
        desc: "Pipeline screening GMGN penuh (KOL/sniper/rug/bundler + indikator). Aktif hanya bila screeningSource=gmgn.",
        keys: [
          "gmgn.interval", "gmgn.orderBy", "gmgn.direction", "gmgn.platforms", "gmgn.filters",
          "gmgn.minMcap", "gmgn.maxMcap", "gmgn.minTvl", "gmgn.minVolume", "gmgn.minHolders",
          "gmgn.minTokenAgeHours", "gmgn.maxTokenAgeHours", "gmgn.athFilterPct", "gmgn.minTotalFeeSol",
          "gmgn.requireKol", "gmgn.minKolCount", "gmgn.minSmartDegenCount", "gmgn.maxRugRatio",
          "gmgn.maxBundlerRate", "gmgn.maxRatTraderRate", "gmgn.maxFreshWalletRate", "gmgn.maxDevTeamHoldRate",
          "gmgn.maxBotDegenRate", "gmgn.maxSniperCount", "gmgn.maxSniperHoldRate",
          "gmgn.preferredKolNames", "gmgn.preferredKolMinHoldPct", "gmgn.dumpKolNames", "gmgn.dumpKolMinHoldPct",
          "gmgn.indicatorFilter", "gmgn.indicatorInterval",
          "gmgn.rules.requireBullishSupertrend", "gmgn.rules.rejectAlreadyAtBottom",
          "gmgn.rules.requireAboveSupertrend", "gmgn.rules.minRsi", "gmgn.rules.maxRsi", "gmgn.rules.requireBbPosition",
        ],
      },
      {
        id: "zen-management",
        title: "Management+",
        desc: "Mode sizing (maximize: bagi modal rata across slot + cadangkan rent/posisi) + auto-tune cadangan gas.",
        keys: ["sizingMode", "rentPerPositionSol", "gasReserveAutoTune", "gasReserveBufferDays", "gasReserveFloorSol"],
      },
      {
        id: "zen-strategy",
        title: "Strategy+",
        desc: "Kunci paksa bentuk strategi (spot/bid_ask/curve).",
        keys: ["strategyLock"],
      },
      {
        id: "zen-schedule",
        title: "Schedule+",
        desc: "Screening adaptif (regangkan interval di sesi historis lemah).",
        keys: ["adaptiveScreening", "maxScreeningIntervalMin"],
      },
      {
        id: "zen-llm",
        title: "LLM+",
        desc: "Limit token khusus chat umum.",
        keys: ["generalMaxTokens"],
      },
      {
        id: "zen-indicators",
        title: "Indicators+",
        desc: "Ekstensi indikator zen: gerbang EXIT, veto at-bottom, SMI client-side.",
        keys: ["exitEnabled", "rejectAlreadyAtBottom", "smiPdLookback", "smiPaLookback", "smiCrossWindow"],
      },
      {
        id: "zen-reports",
        title: "Reports",
        desc: "Frekuensi & panjang tren laporan pembelajaran.",
        keys: ["learningReportEvery", "learningReportTrendN"],
      },
      {
        id: "zen-learning",
        title: "Learning/Evolve",
        desc: "Kunci auto-evolve threshold screening. OFF = baseline BEKU (minFeeActiveTvlRatio + minOrganic tidak ditulis-ulang otomatis tiap 5 close). Darwin punya toggle sendiri (GRUP Darwin).",
        keys: ["evolveEnabled"],
      },
      {
        id: "zen-experiments",
        title: "🧪 Experiments (GRUP 16)",
        desc: "Fitur coba-coba opt-in, default OFF = perilaku pabrik.",
        keys: [
          "exitLiquidityCheck", "exitLiquidityMaxSlippagePct", "marketRegimeGate", "marketRegimeMaxDrop24hPct",
          "candidateMomentum", "narrativeProfileSignal", "expectedYieldSignal",
          "convictionSizing", "convictionSizingMaxAdjustPct", "counterfactualReview", "counterfactualMinMcapGainPct",
          "smartWalletMomentum", "idleScreeningCooldown", "idleScreeningCooldownMin",
          "paperTrading", "usePaperHistoryWhenLive",
        ],
      },
      {
        id: "zen-racikan",
        title: "Racikan/Identitas",
        desc: "Identitas racikan & profil aktif (level file, bukan /setcfg).",
        identity: true, // body = formatIdentityLines() instead of key rows
        keys: [],
      },
    ],
  },
];

// Inline notes appended after a row's value when that key is rendered.
// (Bab 5 — kasus khusus.) gmgnRequestDelayMs is the lone [DEV+ZEN-TUNED] key but
// is NOT surfaced in /config today, so its note never renders — kept here only
// so the origin map stays complete if it is ever added to the view.
export const ORIGIN_NOTES = {
  useDiscordSignals: "(tidak terpasang / OFF)",
  discordSignalMode: "(tidak terpasang / OFF)",
  gmgnRequestDelayMs: "(default diubah zen: 2500→350)",
  // Warisan dev: key tampil tapi pemicunya konstanta/tercakup key lain (audit
  // notes/config-review.md §3A). Ditandai di /config, tetap dirender.
  healthCheckIntervalMin: "(warisan dev — cron per jam)",
  minSolToOpen: "(warisan dev — tercakup deployAmountSol+gasReserve)",
  darwinRecalcEvery: "(warisan dev — pemicu dipatok konstanta 5)",
};

// ── L3 SUB-CLUSTER + L4 MINI-GRUP + CORE TAG (render-only) ────────────────────
// Source: notes/config-review.md Bagian 1 (kolom sub-cluster / beranak / core?).
// formatFullConfig() (index.js) groups each L2 subgroup's rows into these
// sub-clusters (L3) and indents the "beranak" children (L4). Pure data.

// L3: sub-cluster id → { emoji, label }. One neutral emoji per cluster.
export const SUB_CLUSTER_META = {
  // Screening (dev)
  source: { emoji: "🔎", label: "Sumber" },
  window: { emoji: "🪟", label: "Jendela & Kategori" },
  size: { emoji: "📏", label: "Ukuran Pool" },
  quality: { emoji: "⭐", label: "Kualitas" },
  bin: { emoji: "🪜", label: "Bin-step" },
  age: { emoji: "⏳", label: "Usia Token" },
  safety: { emoji: "🛡", label: "Keamanan Token" },
  discord: { emoji: "💬", label: "Discord" },
  // Management & Risk (dev)
  risk: { emoji: "⚖️", label: "Risiko" },
  sizing: { emoji: "💰", label: "Sizing (modal)" },
  gas: { emoji: "⛽", label: "Gas" },
  exit: { emoji: "🛡", label: "Exit (SL/TP)" },
  "exit-trail": { emoji: "📉", label: "Trailing" },
  oor: { emoji: "📤", label: "Out-of-Range" },
  "oor-cooldown": { emoji: "❄️", label: "OOR Cooldown" },
  yield: { emoji: "🌾", label: "Yield" },
  claim: { emoji: "🧾", label: "Claim" },
  "redeploy-cd": { emoji: "🔁", label: "Re-deploy Cooldown" },
  display: { emoji: "🖥", label: "Display" },
  // Strategy & Bins (dev)
  strategy: { emoji: "📐", label: "Strategi" },
  bins: { emoji: "🪜", label: "Lebar Range (bins)" },
  // Schedule (dev)
  schedule: { emoji: "⏱", label: "Jadwal" },
  // LLM (dev)
  model: { emoji: "🧠", label: "Model" },
  gen: { emoji: "🎛", label: "Parameter Generasi" },
  // Darwin (dev)
  darwin: { emoji: "🧬", label: "Darwin" },
  // Indicators (dev/zen)
  "ind-core": { emoji: "📊", label: "Inti Indikator" },
  "ind-rsi": { emoji: "📈", label: "RSI" },
  "ind-exit": { emoji: "🚪", label: "Gerbang Exit" },
  "ind-entry": { emoji: "🚧", label: "Veto Entry" },
  "ind-smi": { emoji: "〰️", label: "SMI" },
  // Infra/Meridian (dev)
  meridian: { emoji: "🌐", label: "Meridian/API" },
  hive: { emoji: "🐝", label: "HiveMind" },
  pnl: { emoji: "📡", label: "PnL Poller" },
  fee: { emoji: "💵", label: "Fee Source" },
  // GMGN (zen)
  "gmgn-disc": { emoji: "🔍", label: "Discovery" },
  "gmgn-size": { emoji: "📏", label: "Ukuran" },
  "gmgn-age": { emoji: "⏳", label: "Usia" },
  "gmgn-fee": { emoji: "💵", label: "Fee" },
  "gmgn-kol": { emoji: "👑", label: "KOL" },
  "gmgn-safety": { emoji: "🛡", label: "Keamanan" },
  "gmgn-ind": { emoji: "📊", label: "Indikator" },
  "gmgn-ind-rules": { emoji: "📐", label: "Aturan Indikator" },
  // Reports (zen)
  reports: { emoji: "📑", label: "Reports" },
  // Learning/Evolve (zen)
  learning: { emoji: "🧬", label: "Auto-Evolve" },
  // Experiments (zen)
  experiments: { emoji: "🧪", label: "Experiments" },
};

// L3: display key → sub-cluster id. Keys absent here fall back to the subgroup
// itself (single cluster → no L3 header). GMGN keys keep their "gmgn." prefix.
export const KEY_SUBCLUSTER = {
  // dev-screening
  timeframe: "window", category: "window",
  minTvl: "size", maxTvl: "size", minVolume: "size", minMcap: "size", maxMcap: "size", minHolders: "size",
  minFeeActiveTvlRatio: "quality", minTokenFeesSol: "quality", minOrganic: "quality", minQuoteOrganic: "quality",
  minBinStep: "bin", maxBinStep: "bin",
  minTokenAgeHours: "age", maxTokenAgeHours: "age",
  excludeHighSupplyConcentration: "safety", maxBotHoldersPct: "safety", maxTop10Pct: "safety",
  avoidPvpSymbols: "safety", blockPvpSymbols: "safety", allowedLaunchpads: "safety", blockedLaunchpads: "safety",
  useDiscordSignals: "discord", discordSignalMode: "discord",
  // dev-management
  dryRun: "risk", maxPositions: "risk", maxDeployAmount: "risk",
  deployAmountSol: "sizing", positionSizePct: "sizing", minSolToOpen: "sizing",
  gasReserve: "gas",
  stopLossPct: "exit", takeProfitPct: "exit",
  trailingTakeProfit: "exit-trail", trailingTriggerPct: "exit-trail", trailingDropPct: "exit-trail",
  outOfRangeBinsToClose: "oor", outOfRangeWaitMinutes: "oor",
  oorCooldownTriggerCount: "oor-cooldown", oorCooldownHours: "oor-cooldown",
  minFeePerTvl24h: "yield", minAgeBeforeYieldCheck: "yield", minVolumeToRebalance: "yield",
  minClaimAmount: "claim", autoSwapAfterClaim: "claim",
  repeatDeployCooldownEnabled: "redeploy-cd", repeatDeployCooldownTriggerCount: "redeploy-cd",
  repeatDeployCooldownHours: "redeploy-cd", repeatDeployCooldownScope: "redeploy-cd",
  repeatDeployCooldownMinFeeEarnedPct: "redeploy-cd",
  solMode: "display",
  // dev-strategy
  strategy: "strategy", minBinsBelow: "bins", maxBinsBelow: "bins", defaultBinsBelow: "bins",
  // dev-schedule
  managementIntervalMin: "schedule", screeningIntervalMin: "schedule", healthCheckIntervalMin: "schedule",
  // dev-llm
  managementModel: "model", screeningModel: "model", generalModel: "model",
  temperature: "gen", maxTokens: "gen", maxSteps: "gen",
  // dev-darwin
  darwinEnabled: "darwin", darwinWindowDays: "darwin", darwinRecalcEvery: "darwin", darwinBoost: "darwin",
  darwinDecay: "darwin", darwinFloor: "darwin", darwinCeiling: "darwin", darwinMinSamples: "darwin",
  // dev-indicators
  enabled: "ind-core", entryPreset: "ind-core", exitPreset: "ind-core",
  intervals: "ind-core", candles: "ind-core", requireAllIntervals: "ind-core",
  rsiLength: "ind-rsi", rsiOversold: "ind-rsi", rsiOverbought: "ind-rsi",
  // dev-infra
  lpAgentRelayEnabled: "meridian", publicApiKey: "meridian",
  agentId: "hive", hiveMindStatus: "hive", hiveMindPullMode: "hive", hiveMindUrl: "hive",
  pnlSource: "pnl", pnlRpcUrl: "pnl", pnlPollIntervalSec: "pnl", pnlDepositCacheTtlSec: "pnl", pnlSanityMaxDiffPct: "pnl",
  gmgnFeeSource: "fee",
  // zen-screening
  screeningSource: "source", screeningCategories: "window",
  // zen-gmgn
  "gmgn.interval": "gmgn-disc", "gmgn.orderBy": "gmgn-disc", "gmgn.direction": "gmgn-disc",
  "gmgn.platforms": "gmgn-disc", "gmgn.filters": "gmgn-disc",
  "gmgn.minMcap": "gmgn-size", "gmgn.maxMcap": "gmgn-size", "gmgn.minTvl": "gmgn-size",
  "gmgn.minVolume": "gmgn-size", "gmgn.minHolders": "gmgn-size", "gmgn.athFilterPct": "gmgn-size",
  "gmgn.minTokenAgeHours": "gmgn-age", "gmgn.maxTokenAgeHours": "gmgn-age",
  "gmgn.minTotalFeeSol": "gmgn-fee",
  "gmgn.requireKol": "gmgn-kol", "gmgn.minKolCount": "gmgn-kol", "gmgn.minSmartDegenCount": "gmgn-kol",
  "gmgn.preferredKolNames": "gmgn-kol", "gmgn.preferredKolMinHoldPct": "gmgn-kol",
  "gmgn.dumpKolNames": "gmgn-kol", "gmgn.dumpKolMinHoldPct": "gmgn-kol",
  "gmgn.maxRugRatio": "gmgn-safety", "gmgn.maxBundlerRate": "gmgn-safety", "gmgn.maxRatTraderRate": "gmgn-safety",
  "gmgn.maxFreshWalletRate": "gmgn-safety", "gmgn.maxDevTeamHoldRate": "gmgn-safety", "gmgn.maxBotDegenRate": "gmgn-safety",
  "gmgn.maxSniperCount": "gmgn-safety", "gmgn.maxSniperHoldRate": "gmgn-safety",
  "gmgn.indicatorFilter": "gmgn-ind", "gmgn.indicatorInterval": "gmgn-ind",
  "gmgn.rules.requireBullishSupertrend": "gmgn-ind-rules", "gmgn.rules.rejectAlreadyAtBottom": "gmgn-ind-rules",
  "gmgn.rules.requireAboveSupertrend": "gmgn-ind-rules", "gmgn.rules.minRsi": "gmgn-ind-rules",
  "gmgn.rules.maxRsi": "gmgn-ind-rules", "gmgn.rules.requireBbPosition": "gmgn-ind-rules",
  // zen-management
  sizingMode: "sizing", rentPerPositionSol: "sizing",
  gasReserveAutoTune: "gas", gasReserveBufferDays: "gas", gasReserveFloorSol: "gas",
  // zen-strategy
  strategyLock: "strategy",
  // zen-schedule
  adaptiveScreening: "schedule", maxScreeningIntervalMin: "schedule",
  // zen-llm
  generalMaxTokens: "gen",
  // zen-indicators
  exitEnabled: "ind-exit", rejectAlreadyAtBottom: "ind-entry",
  smiPdLookback: "ind-smi", smiPaLookback: "ind-smi", smiCrossWindow: "ind-smi",
  // zen-reports
  learningReportEvery: "reports", learningReportTrendN: "reports",
  // zen-learning
  evolveEnabled: "learning",
  // zen-experiments (single cluster)
  exitLiquidityCheck: "experiments", exitLiquidityMaxSlippagePct: "experiments",
  marketRegimeGate: "experiments", marketRegimeMaxDrop24hPct: "experiments",
  candidateMomentum: "experiments", narrativeProfileSignal: "experiments", expectedYieldSignal: "experiments",
  convictionSizing: "experiments", convictionSizingMaxAdjustPct: "experiments",
  counterfactualReview: "experiments", counterfactualMinMcapGainPct: "experiments",
  smartWalletMomentum: "experiments", idleScreeningCooldown: "experiments", idleScreeningCooldownMin: "experiments",
  paperTrading: "experiments", usePaperHistoryWhenLive: "experiments",
};

// L4: "anak" (child) keys of the four beranak families that get indented under
// their induk (parent). Only these four families per task spec; other induk/anak
// pairs render flat inside their sub-cluster.
export const L4_CHILDREN = new Set([
  "trailingTriggerPct", "trailingDropPct",
  "oorCooldownHours",
  "repeatDeployCooldownTriggerCount", "repeatDeployCooldownHours",
  "repeatDeployCooldownScope", "repeatDeployCooldownMinFeeEarnedPct",
  "darwinWindowDays", "darwinRecalcEvery", "darwinBoost", "darwinDecay",
  "darwinFloor", "darwinCeiling", "darwinMinSamples",
]);

// /config core — only the "core?" ✅-tagged keys (config-review.md), full key
// names, compact. Each entry: [rowMapKey, displayName]. displayName differs from
// rowMapKey only where the canonical settable name differs (indicators).
export const CORE_GROUPS = [
  {
    emoji: "💰", title: "Sizing / Risk / Exit",
    keys: [
      ["maxPositions", "maxPositions"], ["maxDeployAmount", "maxDeployAmount"],
      ["deployAmountSol", "deployAmountSol"], ["positionSizePct", "positionSizePct"],
      ["minSolToOpen", "minSolToOpen"], ["gasReserve", "gasReserve"],
      ["stopLossPct", "stopLossPct"], ["takeProfitPct", "takeProfitPct"],
      ["trailingTakeProfit", "trailingTakeProfit"], ["trailingTriggerPct", "trailingTriggerPct"],
      ["trailingDropPct", "trailingDropPct"], ["outOfRangeWaitMinutes", "outOfRangeWaitMinutes"],
      ["minFeePerTvl24h", "minFeePerTvl24h"], ["strategy", "strategy"], ["strategyLock", "strategyLock"],
      ["minBinsBelow", "minBinsBelow"], ["maxBinsBelow", "maxBinsBelow"],
    ],
  },
  {
    emoji: "🔎", title: "Screening",
    keys: [
      ["screeningSource", "screeningSource"], ["timeframe", "timeframe"], ["category", "category"],
      ["screeningCategories", "screeningCategories"], ["minTvl", "minTvl"], ["maxTvl", "maxTvl"],
      ["minVolume", "minVolume"], ["minMcap", "minMcap"], ["maxMcap", "maxMcap"], ["minHolders", "minHolders"],
      ["minOrganic", "minOrganic"], ["minFeeActiveTvlRatio", "minFeeActiveTvlRatio"],
      ["minBinStep", "minBinStep"], ["maxBinStep", "maxBinStep"],
    ],
  },
  {
    emoji: "⏱", title: "Jadwal",
    keys: [["managementIntervalMin", "managementIntervalMin"], ["screeningIntervalMin", "screeningIntervalMin"]],
  },
  {
    emoji: "🧠", title: "LLM",
    keys: [["managementModel", "managementModel"], ["screeningModel", "screeningModel"]],
  },
  {
    emoji: "📊", title: "Indikator",
    keys: [["enabled", "chartIndicatorsEnabled"], ["entryPreset", "indicatorEntryPreset"]],
  },
];

// ── FUNCTION grouping (default /config, Batch E) ──────────────────────────────
// Second layout over the SAME 166 rowMap keys, grouped by daily-practical FUNCTION
// instead of by origin. RENDER-ONLY: owns WHICH function-group each row lands in;
// values stay in buildConfigRowMap (index.js). The view does NOT render these key
// lists flat — it pipes each group's keys through renderSubclusterRows so the L3
// sub-clusters + L4 ↳ children survive (the SAME taxonomy as /config origin), and
// dev+zen twins MIX inside each sub-cluster (KEY_SUBCLUSTER is already cross-origin).
// Each key's ASAL (dev/zen) shows as an inline marker (⚙️/🧩) via KEY_ORIGIN. So
// only the top-level L1 ⚙️DEV/🧩ZEN split is dropped vs the origin view.
// Parity invariant: the union of every group's keys == the 166 rowMap keys (a
// node check guards this; any unplaced key still falls into the view's "❓"
// safety bucket). Identity (Profil/Racikan) is rendered by the view header, not
// a group here. `gmgnDynamic` flags the GMGN block so the view can append the
// live source-active hint.
// `id` (added Batch D): stable slug used by the /settings "Mode Campur" page token
// (cfg:page:fn-<id>) + return-after-edit map. RENDER-ONLY; /config ignores it.
export const FUNCTION_GROUPS = [
  {
    id: "sizing",
    emoji: "📊", title: "Sizing & Posisi",
    keys: [
      "dryRun", "maxPositions", "maxDeployAmount", "deployAmountSol", "positionSizePct", "minSolToOpen",
      "gasReserve", "sizingMode", "rentPerPositionSol",
      "gasReserveAutoTune", "gasReserveBufferDays", "gasReserveFloorSol",
    ],
  },
  {
    id: "screening",
    emoji: "🔍", title: "Screening",
    keys: [
      "screeningSource", "screeningCategories", "timeframe", "category",
      "minTvl", "maxTvl", "minVolume", "minMcap", "maxMcap", "minHolders",
      "minFeeActiveTvlRatio", "minTokenFeesSol", "minOrganic", "minQuoteOrganic",
      "minBinStep", "maxBinStep", "minTokenAgeHours", "maxTokenAgeHours",
      "excludeHighSupplyConcentration", "maxBotHoldersPct", "maxTop10Pct",
      "avoidPvpSymbols", "blockPvpSymbols", "allowedLaunchpads", "blockedLaunchpads",
      "useDiscordSignals", "discordSignalMode",
    ],
  },
  {
    id: "gmgn",
    emoji: "🔎", title: "Screening-GMGN", gmgnDynamic: true,
    keys: [
      "gmgn.interval", "gmgn.orderBy", "gmgn.direction", "gmgn.platforms", "gmgn.filters",
      "gmgn.minMcap", "gmgn.maxMcap", "gmgn.minTvl", "gmgn.minVolume", "gmgn.minHolders",
      "gmgn.minTokenAgeHours", "gmgn.maxTokenAgeHours", "gmgn.athFilterPct", "gmgn.minTotalFeeSol",
      "gmgn.requireKol", "gmgn.minKolCount", "gmgn.minSmartDegenCount", "gmgn.maxRugRatio",
      "gmgn.maxBundlerRate", "gmgn.maxRatTraderRate", "gmgn.maxFreshWalletRate", "gmgn.maxDevTeamHoldRate",
      "gmgn.maxBotDegenRate", "gmgn.maxSniperCount", "gmgn.maxSniperHoldRate",
      "gmgn.preferredKolNames", "gmgn.preferredKolMinHoldPct", "gmgn.dumpKolNames", "gmgn.dumpKolMinHoldPct",
      "gmgn.indicatorFilter", "gmgn.indicatorInterval",
      "gmgn.rules.requireBullishSupertrend", "gmgn.rules.rejectAlreadyAtBottom",
      "gmgn.rules.requireAboveSupertrend", "gmgn.rules.minRsi", "gmgn.rules.maxRsi", "gmgn.rules.requireBbPosition",
    ],
  },
  {
    id: "exit",
    emoji: "🚪", title: "Exit & Management",
    keys: [
      "stopLossPct", "takeProfitPct", "trailingTakeProfit", "trailingTriggerPct", "trailingDropPct",
      "outOfRangeBinsToClose", "outOfRangeWaitMinutes", "oorCooldownTriggerCount", "oorCooldownHours",
      "minFeePerTvl24h", "minAgeBeforeYieldCheck", "minVolumeToRebalance", "minClaimAmount", "autoSwapAfterClaim",
      "repeatDeployCooldownEnabled", "repeatDeployCooldownTriggerCount", "repeatDeployCooldownHours",
      "repeatDeployCooldownScope", "repeatDeployCooldownMinFeeEarnedPct",
    ],
  },
  {
    id: "strategy",
    emoji: "📐", title: "Strategy & Range",
    keys: ["strategy", "minBinsBelow", "maxBinsBelow", "defaultBinsBelow", "strategyLock"],
  },
  {
    id: "indik",
    emoji: "📊", title: "Indikator",
    keys: [
      "enabled", "entryPreset", "exitPreset", "rsiLength", "intervals", "candles",
      "rsiOversold", "rsiOverbought", "requireAllIntervals",
      "exitEnabled", "rejectAlreadyAtBottom", "smiPdLookback", "smiPaLookback", "smiCrossWindow",
    ],
  },
  {
    id: "jadwal",
    emoji: "⏱", title: "Jadwal",
    keys: [
      "managementIntervalMin", "screeningIntervalMin", "healthCheckIntervalMin",
      "adaptiveScreening", "maxScreeningIntervalMin",
    ],
  },
  {
    id: "llm",
    emoji: "🧠", title: "LLM",
    keys: ["managementModel", "screeningModel", "generalModel", "temperature", "maxTokens", "maxSteps", "generalMaxTokens"],
  },
  {
    id: "darwin",
    emoji: "🧬", title: "Darwin",
    keys: [
      "darwinEnabled", "darwinWindowDays", "darwinRecalcEvery", "darwinBoost",
      "darwinDecay", "darwinFloor", "darwinCeiling", "darwinMinSamples",
    ],
  },
  {
    id: "reports",
    emoji: "📑", title: "Reports & Learning",
    keys: ["learningReportEvery", "learningReportTrendN", "evolveEnabled"],
  },
  {
    id: "exp",
    emoji: "🧪", title: "Eksperimen (GRUP 16)",
    keys: [
      "exitLiquidityCheck", "exitLiquidityMaxSlippagePct", "marketRegimeGate", "marketRegimeMaxDrop24hPct",
      "candidateMomentum", "narrativeProfileSignal", "expectedYieldSignal",
      "convictionSizing", "convictionSizingMaxAdjustPct", "counterfactualReview", "counterfactualMinMcapGainPct",
      "smartWalletMomentum", "idleScreeningCooldown", "idleScreeningCooldownMin",
      "paperTrading", "usePaperHistoryWhenLive",
    ],
  },
  {
    id: "infra",
    emoji: "🌐", title: "Sistem/Infra",
    keys: [
      "lpAgentRelayEnabled", "agentId", "publicApiKey", "pnlSource", "pnlRpcUrl",
      "pnlPollIntervalSec", "pnlDepositCacheTtlSec", "pnlSanityMaxDiffPct", "gmgnFeeSource",
      "hiveMindStatus", "hiveMindPullMode", "hiveMindUrl", "solMode",
    ],
  },
];

// key → "dev" | "zen", derived ONCE from ORIGIN_SECTIONS (rule #3: reuse existing
// origin data, no new origin logic). The function view reads this for the inline
// ⚙️/🧩 marker; the origin view doesn't need it (origin is its grouping axis).
export const KEY_ORIGIN = (() => {
  const m = {};
  for (const sec of ORIGIN_SECTIONS) for (const sg of sec.subgroups) for (const k of sg.keys) m[k] = sec.id;
  return m;
})();

// ── MONEY keys (🟠 render-only marker) — Batch D recon §6 ─────────────────────
// Keys whose value changes trading BEHAVIOR (capital sizing, entry/exit gates,
// cooldowns). Surfaced as a 🟠 prefix on the /settings CONTROL buttons (both modes)
// so a glance separates "this moves money" from display/infra/tuning toggles. PURE
// DATA — no logic gates on this; it only decorates labels.
// Derived by FUNCTION: the trading function groups are wholly money; the experiment
// group is mixed (only the ones that actually move a decision); jadwal/llm/darwin/
// reports/infra are not money. Discord keys are inert (OFF/not wired) → excluded.
const MONEY_FN_GROUPS = new Set(["sizing", "screening", "gmgn", "exit", "strategy", "indik"]);
const MONEY_EXP_KEYS = new Set([
  "exitLiquidityCheck", "exitLiquidityMaxSlippagePct", "marketRegimeGate", "marketRegimeMaxDrop24hPct",
  "convictionSizing", "convictionSizingMaxAdjustPct", "idleScreeningCooldown", "idleScreeningCooldownMin",
]);
const MONEY_EXCLUDE = new Set(["useDiscordSignals", "discordSignalMode"]);
export const MONEY_KEYS = (() => {
  const s = new Set();
  for (const g of FUNCTION_GROUPS) {
    if (MONEY_FN_GROUPS.has(g.id)) for (const k of g.keys) s.add(k);
    else if (g.id === "exp") for (const k of g.keys) if (MONEY_EXP_KEYS.has(k)) s.add(k);
  }
  for (const k of MONEY_EXCLUDE) s.delete(k);
  return s;
})();
