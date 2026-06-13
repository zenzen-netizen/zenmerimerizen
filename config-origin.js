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
      {
        id: "dev-unknown",
        title: "❓ UNKNOWN (perlu review)",
        desc: "Asal belum tercantum di peta divergensi — sementara ditaruh di Dev, butuh konfirmasi (keduanya tak terdaftar di CONFIG_MAP & undefined di config.js → render off).",
        keys: ["athFilterPct", "maxBundlePct"],
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
        desc: "Auto-tune cadangan gas.",
        keys: ["gasReserveAutoTune", "gasReserveBufferDays", "gasReserveFloorSol"],
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
};
