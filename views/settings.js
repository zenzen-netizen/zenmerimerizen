// views/settings.js — /settings interactive menu (inline-keyboard) builder.
//
// Workstream 🅴 (Batch D): extracted verbatim from index.js so the presentation
// layer (keyboard rows + render text) lives in views/, while index.js keeps the
// glue (MENU_CONTROLS registry, callback handler, _settingsView/_pendingInput
// state, the update_config mutation path). RENDER-ONLY: nothing here mutates
// config — every value is read live from the config singleton; every edit still
// flows through index.js's handler → executeTool("update_config").
//
// Dependency direction is ONE-WAY (index.js → views/settings.js). The few
// index.js-owned helpers this module needs (the MENU_CONTROLS registry plus the
// /config row/text builders) are injected once at startup via initSettingsViews()
// so there is no circular import.

import { config } from "../config.js";
import { listPresets, getActiveSetupStatus } from "../preset-manager.js";
import { ORIGIN_SECTIONS, KEY_SUBCLUSTER, SUB_CLUSTER_META, KEY_ORIGIN, FUNCTION_GROUPS, MONEY_KEYS } from "../config-origin.js";

// ── Injected deps (set once from index.js at startup) ────────────────────────
// _deps.MENU_CONTROLS       — editable-control registry (index.js)
// _deps.buildConfigRowMap   — () => rowMap (live values, 🟢/⚪-tagged)
// _deps.renderSubclusterRows— (keys, rowMap) => { text, placed }
// _deps.subgroupDesc        — (sg) => string (GMGN desc flips with source)
let _deps = {};
export function initSettingsViews(deps) {
  _deps = deps || {};
}
const MENU_CONTROLS = () => _deps.MENU_CONTROLS || {};

// ─────────────────────────────────────────────────────────────────────────────

export function settingValue(key) {
  const values = {
    solMode: config.management.solMode,
    lpAgentRelayEnabled: config.api.lpAgentRelayEnabled,
    chartIndicatorsEnabled: config.indicators.enabled,
    trailingTakeProfit: config.management.trailingTakeProfit,
    useDiscordSignals: config.screening.useDiscordSignals,
    blockPvpSymbols: config.screening.blockPvpSymbols,
    screeningSource: config.screening.source,
    screeningCategories: config.screening.categories,
    gmgnRequireKol: config.gmgn.requireKol,
    gmgnInterval: config.gmgn.interval,
    gmgnIndicatorFilter: config.gmgn.indicatorFilter,
    gmgnMinVolume: config.gmgn.minVolume,
    gmgnMinTokenAgeHours: config.gmgn.minTokenAgeHours,
    gmgnMaxTokenAgeHours: config.gmgn.maxTokenAgeHours,
    gmgnMaxBundlerRate: config.gmgn.maxBundlerRate,
    gmgnPreferredKolNames: config.gmgn.preferredKolNames,
    gmgnPreferredKolMinHoldPct: config.gmgn.preferredKolMinHoldPct,
    gmgnDumpKolNames: config.gmgn.dumpKolNames,
    gmgnDumpKolMinHoldPct: config.gmgn.dumpKolMinHoldPct,
    gmgnIndicatorInterval: config.gmgn.indicatorInterval,
    gmgnRequireBullishSt: config.gmgn.indicatorRules?.requireBullishSupertrend,
    gmgnRejectAtBottom: config.gmgn.indicatorRules?.rejectAlreadyAtBottom,
    gmgnRequireAboveSt: config.gmgn.indicatorRules?.requireAboveSupertrend,
    gmgnMinRsi: config.gmgn.indicatorRules?.minRsi,
    gmgnMaxRsi: config.gmgn.indicatorRules?.maxRsi,
    gmgnMinKolCount: config.gmgn.minKolCount,
    gmgnMinTotalFeeSol: config.gmgn.minTotalFeeSol,
    gmgnMinHolders: config.gmgn.minHolders,
    gmgnFeeSource: config.gmgn.feeSource,
    pnlSource: config.pnl.source,
    pnlRpcUrl: config.pnl.rpcUrl,
    pnlPollIntervalSec: config.pnl.pollIntervalSec,
    pnlDepositCacheTtlSec: config.pnl.depositCacheTtlSec,
    strategy: config.strategy.strategy,
    strategyLock: config.strategy.strategyLock,
    minBinsBelow: config.strategy.minBinsBelow,
    maxBinsBelow: config.strategy.maxBinsBelow,
    deployAmountSol: config.management.deployAmountSol,
    gasReserve: config.management.gasReserve,
    maxPositions: config.risk.maxPositions,
    maxDeployAmount: config.risk.maxDeployAmount,
    takeProfitPct: config.management.takeProfitPct,
    stopLossPct: config.management.stopLossPct,
    trailingTriggerPct: config.management.trailingTriggerPct,
    trailingDropPct: config.management.trailingDropPct,
    repeatDeployCooldownEnabled: config.management.repeatDeployCooldownEnabled,
    repeatDeployCooldownTriggerCount: config.management.repeatDeployCooldownTriggerCount,
    repeatDeployCooldownHours: config.management.repeatDeployCooldownHours,
    repeatDeployCooldownMinFeeEarnedPct: config.management.repeatDeployCooldownMinFeeEarnedPct,
    managementIntervalMin: config.schedule.managementIntervalMin,
    screeningIntervalMin: config.schedule.screeningIntervalMin,
    adaptiveScreening: config.schedule.adaptiveScreening,
    maxScreeningIntervalMin: config.schedule.maxScreeningIntervalMin,
    indicatorEntryPreset: config.indicators.entryPreset,
    indicatorExitPreset: config.indicators.exitPreset,
    indicatorExitEnabled: config.indicators.exitEnabled,
    indicatorRejectAtBottom: config.indicators.rejectAlreadyAtBottom,
    rsiLength: config.indicators.rsiLength,
    indicatorIntervals: config.indicators.intervals,
    requireAllIntervals: config.indicators.requireAllIntervals,
    smiPdLookback: config.indicators.smiPdLookback,
    smiPaLookback: config.indicators.smiPaLookback,
    smiCrossWindow: config.indicators.smiCrossWindow,
    // 🧪 GRUP 16 — Experiments
    candidateMomentum: config.experiments.candidateMomentum,
    smartWalletMomentum: config.experiments.smartWalletMomentum,
    expectedYieldSignal: config.experiments.expectedYieldSignal,
    narrativeProfileSignal: config.experiments.narrativeProfileSignal,
    counterfactualReview: config.experiments.counterfactualReview,
    counterfactualMinMcapGainPct: config.experiments.counterfactualMinMcapGainPct,
    exitLiquidityCheck: config.experiments.exitLiquidityCheck,
    exitLiquidityMaxSlippagePct: config.experiments.exitLiquidityMaxSlippagePct,
    marketRegimeGate: config.experiments.marketRegimeGate,
    marketRegimeMaxDrop24hPct: config.experiments.marketRegimeMaxDrop24hPct,
    convictionSizing: config.experiments.convictionSizing,
    convictionSizingMaxAdjustPct: config.experiments.convictionSizingMaxAdjustPct,
    idleScreeningCooldown: config.experiments.idleScreeningCooldown,
    idleScreeningCooldownMin: config.experiments.idleScreeningCooldownMin,
    paperTrading: config.experiments.paperTrading,
    usePaperHistoryWhenLive: config.experiments.usePaperHistoryWhenLive,
    // 🧬 Learning / Auto-Evolve freeze
    evolveEnabled: config.learning.evolveEnabled,
    // 📊 GRUP 17 — Reports & Gas
    learningReportEvery: config.reports.learningReportEvery,
    learningReportTrendN: config.reports.learningReportTrendN,
    gasReserveAutoTune: config.management.gasReserveAutoTune,
    gasReserveBufferDays: config.management.gasReserveBufferDays,
    gasReserveFloorSol: config.management.gasReserveFloorSol,
    sizingMode: config.management.sizingMode,
    rentPerPositionSol: config.management.rentPerPositionSol,
    // ── menu-editable additions (cascade /settings: cover remaining CONFIG_MAP keys) ──
    // screening
    minTvl: config.screening.minTvl,
    maxTvl: config.screening.maxTvl,
    minVolume: config.screening.minVolume,
    minFeeActiveTvlRatio: config.screening.minFeeActiveTvlRatio,
    minTokenFeesSol: config.screening.minTokenFeesSol,
    minOrganic: config.screening.minOrganic,
    minQuoteOrganic: config.screening.minQuoteOrganic,
    minMcap: config.screening.minMcap,
    maxMcap: config.screening.maxMcap,
    minHolders: config.screening.minHolders,
    minTokenAgeHours: config.screening.minTokenAgeHours,
    maxTokenAgeHours: config.screening.maxTokenAgeHours,
    minBinStep: config.screening.minBinStep,
    maxBinStep: config.screening.maxBinStep,
    maxBotHoldersPct: config.screening.maxBotHoldersPct,
    maxTop10Pct: config.screening.maxTop10Pct,
    excludeHighSupplyConcentration: config.screening.excludeHighSupplyConcentration,
    avoidPvpSymbols: config.screening.avoidPvpSymbols,
    timeframe: config.screening.timeframe,
    category: config.screening.category,
    discordSignalMode: config.screening.discordSignalMode,
    // management
    minSolToOpen: config.management.minSolToOpen,
    positionSizePct: config.management.positionSizePct,
    outOfRangeBinsToClose: config.management.outOfRangeBinsToClose,
    outOfRangeWaitMinutes: config.management.outOfRangeWaitMinutes,
    oorCooldownTriggerCount: config.management.oorCooldownTriggerCount,
    oorCooldownHours: config.management.oorCooldownHours,
    minFeePerTvl24h: config.management.minFeePerTvl24h,
    minAgeBeforeYieldCheck: config.management.minAgeBeforeYieldCheck,
    minVolumeToRebalance: config.management.minVolumeToRebalance,
    minClaimAmount: config.management.minClaimAmount,
    autoSwapAfterClaim: config.management.autoSwapAfterClaim,
    repeatDeployCooldownScope: config.management.repeatDeployCooldownScope,
    pnlSanityMaxDiffPct: config.management.pnlSanityMaxDiffPct,
    // strategy / schedule
    defaultBinsBelow: config.strategy.defaultBinsBelow,
    healthCheckIntervalMin: config.schedule.healthCheckIntervalMin,
    // llm
    temperature: config.llm.temperature,
    maxTokens: config.llm.maxTokens,
    maxSteps: config.llm.maxSteps,
    generalMaxTokens: config.llm.generalMaxTokens,
    // indicators
    indicatorCandles: config.indicators.candles,
    rsiOversold: config.indicators.rsiOversold,
    rsiOverbought: config.indicators.rsiOverbought,
    // infra
    hiveMindPullMode: config.hiveMind.pullMode,
    // gmgn
    gmgnMinMcap: config.gmgn.minMcap,
    gmgnMaxMcap: config.gmgn.maxMcap,
    gmgnAthFilterPct: config.gmgn.athFilterPct,
    gmgnMinSmartDegenCount: config.gmgn.minSmartDegenCount,
    gmgnMaxRatTraderRate: config.gmgn.maxRatTraderRate,
    gmgnMaxFreshWalletRate: config.gmgn.maxFreshWalletRate,
    gmgnMaxDevTeamHoldRate: config.gmgn.maxDevTeamHoldRate,
    gmgnMaxBotDegenRate: config.gmgn.maxBotDegenRate,
    gmgnMaxSniperCount: config.gmgn.maxSniperCount,
    gmgnMaxSniperHoldRate: config.gmgn.maxSniperHoldRate,
  };
  return values[key];
}

export function fmtSettingValue(value) {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "boolean") return value ? "🟢 on" : "⚪ off";
  return String(value);
}

export function settingButton(label, data) {
  return { text: label, callback_data: data };
}

export function toggleButton(key, label) {
  return settingButton(`${label}: ${fmtSettingValue(settingValue(key))}`, `cfg:toggle:${key}`);
}

// Multi-category merge toggle. categories is an array (merge) or null (factory single
// `category`). A category is ON only when explicitly listed; null/[] = all OFF (factory).
export function categoryButton(cat) {
  const cats = config.screening.categories;
  const on = Array.isArray(cats) && cats.includes(cat);
  return settingButton(`${cat} ${on ? "✅" : "⬜"}`, `cfg:cat:${cat}`);
}

export function stepButtons(key, label, step, { digits = 2 } = {}) {
  const value = Number(settingValue(key));
  const shown = Number.isFinite(value) ? value.toFixed(digits).replace(/\.?0+$/, "") : "?";
  return [
    settingButton(`- ${label}`, `cfg:step:${key}:${-step}`),
    settingButton(`${label}: ${shown}`, `cfg:noop`),
    settingButton(`+ ${label}`, `cfg:step:${key}:${step}`),
  ];
}

export function inputButton(key, label, { digits = 0 } = {}) {
  const value = settingValue(key);
  const shown = value == null ? "off" : Number.isFinite(Number(value)) ? String(parseFloat(Number(value).toFixed(digits))) : String(value);
  return [settingButton(`${label}: ${shown} ✏`, `cfg:input:${key}`)];
}

// ── Cascade /settings (breadcrumb) display data ──────────────────────────────
// Short T1 section labels + T2 group names so all three levels (header → group →
// settings) fit on screen at once. RENDER-ONLY metadata; the canonical grouping
// stays in config-origin.js. Falls back to the full title when a short is missing.
const MENU_SECTION_LABEL = { dev: "⚙️ Origin Dev", zen: "🧩 Add by Zen" };
// Per-key ASAL marker (⚙️ dev / 🧩 zen) prepended to CONTROL buttons in Mode Campur
// (function groups mix origins, so the origin shows on the control, not the group).
// Origin view doesn't need it (origin is its grouping axis). Trailing space so the
// marker reads as a prefix; empty (no marker) keeps Pisah byte-identik.
const ORIGIN_MARK = { dev: "⚙️ ", zen: "🧩 " };
// Short labels for the 12 function-group landing buttons (Mode Campur), analog to
// MENU_GROUP_SHORT. Keyed by FUNCTION_GROUPS id. Falls back to the full title.
const MENU_FNGROUP_SHORT = {
  sizing: "Sizing", screening: "Screen", gmgn: "GMGN", exit: "Exit",
  strategy: "Strat", indik: "Indik", jadwal: "Jadwal", llm: "LLM",
  darwin: "Darwin", reports: "Report", exp: "🧪Exp", infra: "Infra",
};
const MENU_GROUP_SHORT = {
  "dev-screening": "Screen", "dev-management": "Risk", "dev-strategy": "Strat",
  "dev-schedule": "Jadwal", "dev-llm": "LLM", "dev-darwin": "Darwin",
  "dev-indicators": "Indik", "dev-infra": "Infra",
  "zen-screening": "Screen+", "zen-gmgn": "GMGN", "zen-management": "Mgmt+",
  "zen-strategy": "Strat+", "zen-schedule": "Jadwal+", "zen-llm": "LLM+",
  "zen-indicators": "Indik+", "zen-reports": "Report", "zen-learning": "🧬Learn",
  "zen-experiments": "🧪Exp", "zen-racikan": "Racikan",
};
// Max editable T3 rows per page; groups with more paginate (T1+T2 stay visible).
const MAX_T3_ROWS = 8;
const chunkRows = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// Build a MENU_CONTROLS "cycle" entry for a small, KNOWN enum: a noop showing the
// current value + one `cfg:set` button per option (reuses the existing set
// mechanic + callback_data — no new edit mechanic). `opts` are the literal valid
// config values; perRow controls wrapping.
export function cycleControl(settingKey, label, opts, perRow = 3) {
  return {
    pageKeys: [settingKey],
    build: () => {
      const cur = fmtSettingValue(settingValue(settingKey));
      const rows = [[settingButton(`${label}: ${cur}`, "cfg:noop")]];
      for (let i = 0; i < opts.length; i += perRow) {
        rows.push(opts.slice(i, i + perRow).map((o) => settingButton(String(o), `cfg:set:${settingKey}:${o}`)));
      }
      return rows;
    },
  };
}

// ── /settings navigation (selaras /config: ASAL seksi → grup → sub-cluster) ──
// L1 main = two ASAL section buttons; L2 = relevance groups (same names as
// /config); L3 group page = read-only /config body + the editable controls for
// that group, bucketed under the same sub-clusters. RENDER-ONLY: every control
// is the SAME one MENU_CONTROLS already wired (unchanged callback_data/mechanics).

function findSubgroup(groupId) {
  for (const sec of ORIGIN_SECTIONS) {
    const sg = sec.subgroups.find((g) => g.id === groupId);
    if (sg) return { sec, sg };
  }
  return null;
}

// How many keys in a subgroup are editable from the menu (section-list hint).
function editableCountFor(sg) {
  const controls = MENU_CONTROLS();
  return sg.keys.filter((k) => controls[k]).length;
}

// TINGKAT 1 — header rows, ALWAYS shown. The two ASAL sections + Racikan + Config
// penuh + Refresh/Close. The active section (and Racikan on the presets page) is
// marked with ▸. `token` is the current page token so Refresh re-renders it.
function settingsHeaderRows(activeSection, token) {
  const secRow = ORIGIN_SECTIONS.map((sec) => {
    const lbl = MENU_SECTION_LABEL[sec.id] || sec.title;
    return settingButton(`${sec.id === activeSection ? "▸ " : ""}${lbl}`, `cfg:page:${sec.id}`);
  });
  const racikanActive = String(token).split("~")[0] === "presets";
  return [
    // Mode toggle (Batch D): jump to Mode Campur (per-fungsi). The two ASAL rows +
    // Racikan/Config/Refresh/Close below are unchanged from the origin-split menu.
    [settingButton("🔀 Mode: Campur", "cfg:page:fn-landing")],
    secRow,
    [
      settingButton(`${racikanActive ? "▸ " : ""}🗂️ Racikan`, "cfg:page:presets"),
      settingButton("📋 Config penuh", "cfg:show"),
    ],
    [settingButton("🔄 Refresh", `cfg:page:${token}`), settingButton("❌ Close", "cfg:close")],
  ];
}

// TINGKAT 2 — group rows for one ASAL section, shown whenever a section is active
// and STAY visible when a group is open. Short names, 2/row, each tagged ✏N
// (editable count) or 👁 (view-only). The active group is marked with ▸.
function settingsGroupRows(sec, activeGroupId) {
  const btns = sec.subgroups.map((sg) => {
    const short = MENU_GROUP_SHORT[sg.id] || sg.title;
    const mark = sg.id === activeGroupId ? "▸ " : "";
    if (sg.identity) return settingButton(`${mark}${short} 🗂️`, "cfg:page:presets");
    const n = editableCountFor(sg);
    return settingButton(`${mark}${short} ${n > 0 ? `✏${n}` : "👁"}`, `cfg:page:${sg.id}`);
  });
  return chunkRows(btns, 2);
}

// TINGKAT 3 — flat list of editable control rows for one group, bucketed by
// sub-cluster (a noop header per cluster when the group spans >1). Single-button
// controls pair two-per-row. Returns rows (incl. cluster headers) for pagination.
function settingsControlRows(sg, { withOriginMarker = false } = {}) {
  const controls = MENU_CONTROLS();
  // Per-key label prefix. 🟠 = money key (both modes — capital/gate/cooldown);
  // ⚙️/🧩 origin marker only in Mode Campur (Pisah groups BY origin already). For a
  // non-money key in Pisah both parts are empty → `${pfx}${label}` === label, so the
  // Pisah control STRUCTURE (callback_data/order/pagination) is unchanged.
  const pfx = (k) =>
    `${MONEY_KEYS.has(k) ? "🟠 " : ""}${withOriginMarker ? ORIGIN_MARK[KEY_ORIGIN[k]] || "" : ""}`;
  const order = [];
  const members = {};
  for (const k of sg.keys) {
    if (!controls[k]) continue;
    const cl = KEY_SUBCLUSTER[k] || "_misc";
    if (!members[cl]) { members[cl] = []; order.push(cl); }
    members[cl].push(k);
  }
  const rows = [];
  const showHdr = order.length > 1;
  for (const cl of order) {
    const meta = SUB_CLUSTER_META[cl];
    if (showHdr && meta) rows.push([settingButton(`· ${meta.emoji} ${meta.label} ·`, "cfg:noop")]);
    let buffered = null; // hold one single-button control to pair with the next
    const flush = () => { if (buffered) { rows.push(buffered); buffered = null; } };
    for (const k of members[cl]) {
      const ctrl = controls[k];
      const p = pfx(k);
      if (ctrl.build) {
        flush();
        const built = ctrl.build();
        // cycleControl's first row is the "Label: value" noop header — mark it.
        if (p && built[0]?.[0]) built[0][0].text = `${p}${built[0][0].text}`;
        rows.push(...built);
        continue;
      }
      const row = ctrl.toggle
        ? [toggleButton(ctrl.toggle[0], `${p}${ctrl.toggle[1]}`)]
        : inputButton(ctrl.input[0], `${p}${ctrl.input[1]}`, ctrl.input[2] || {});
      if (row.length === 1) {
        if (buffered) { rows.push([buffered[0], row[0]]); buffered = null; }
        else buffered = row;
      } else { flush(); rows.push(row); }
    }
    flush();
  }
  return rows;
}

// Compact "config inti" summary for the /settings landing. Values come from the
// SAME source as /config + /config core (buildConfigRowMap → already 🟢/⚪-tagged),
// so the landing can never drift from /config. The keys shown are the core set
// (mirrors config-origin CORE_GROUPS); they're just regrouped one line/kategori.
function formatSettingsLandingSummary() {
  const rowMap = _deps.buildConfigRowMap();
  const v = (k) => (rowMap[k] ? rowMap[k][1] : "—");
  const setup = (() => {
    try { const s = getActiveSetupStatus(); return s.name ? `${s.name}${s.edited ? " ✎" : ""}` : "—"; }
    catch { return "—"; }
  })();
  const lock = (config.strategy.strategyLock ?? "default") !== "default" ? ` 🔒${v("strategyLock")}` : "";
  const expOn = Object.entries(config.experiments).filter(([, x]) => x === true).map(([k]) => k).join(", ") || "none";
  return [
    `⚙️ SETTINGS · racikan ${setup}`,
    `💰 pos ${v("maxPositions")} · deploy ${v("deployAmountSol")} · SL ${v("stopLossPct")} · TP ${v("takeProfitPct")} · trail ${v("trailingTakeProfit")}`,
    `🔎 mcap ${v("minMcap")}–${v("maxMcap")} · TVL ${v("minTvl")}–${v("maxTvl")} · vol ${v("minVolume")} · holders ${v("minHolders")} · organic ${v("minOrganic")}`,
    `🎯 ${v("strategy")}${lock} · bins ${v("minBinsBelow")}–${v("maxBinsBelow")}`,
    `🧠 ${v("managementModel")} · ⏱ manage ${v("managementIntervalMin")}m / screen ${v("screeningIntervalMin")}m`,
    `📊 indikator ${v("enabled")} (${v("entryPreset")}) · exit ${v("exitEnabled")}`,
    `🧪 experiments ON: ${expOn}`,
  ].join("\n");
}

// LANDING — no section chosen: message = config-inti summary, buttons = TINGKAT 1.
function renderSettingsMain() {
  const bodyText = [
    formatSettingsLandingSummary(),
    "",
    "Pilih seksi ⤵️  ( ⚙️ dev · 🧩 zen )",
  ].join("\n");
  return { text: bodyText, keyboard: settingsHeaderRows(null, "main") };
}

// SECTION — a section is active: TINGKAT 1 (active ▸) + TINGKAT 2 groups (none ▸).
function renderSettingsSection(sectionId) {
  const sec = ORIGIN_SECTIONS.find((s) => s.id === sectionId);
  if (!sec) return renderSettingsMain();
  const bodyText = [
    `${MENU_SECTION_LABEL[sec.id] || sec.title} — ${sec.blurb}`,
    "",
    "Pilih grup ⤵️  ( ✏N = N setelan editable · 👁 = lihat-saja )",
  ].join("\n");
  const keyboard = [
    ...settingsHeaderRows(sec.id, sec.id),
    ...settingsGroupRows(sec, null),
  ];
  return { text: bodyText, keyboard };
}

// GROUP — a group is open: TINGKAT 1 (active section ▸) + TINGKAT 2 (active group
// ▸, STAYS visible) + TINGKAT 3 editable controls (paginated when many). Body text
// = the same read-only /config rows (sub-clusters, 🟢/⚪, legacy notes). `token`
// may carry a T3 page suffix ("dev-management~2"); switching group/section swaps
// the lower levels without any "back" button.
function renderSettingsGroup(token) {
  const [groupId, pageStr] = String(token).split("~");
  const found = findSubgroup(groupId);
  if (!found) return renderSettingsMain();
  const { sec, sg } = found;
  if (sg.identity) return renderSettingsPresets();

  const rowMap = _deps.buildConfigRowMap();
  const { text: body } = _deps.renderSubclusterRows(sg.keys, rowMap);

  let controlRows = settingsControlRows(sg);
  if (controlRows.length === 0) controlRows = [[settingButton("👁 Lihat-saja — ubah via /setcfg atau file", "cfg:noop")]];

  // T3 pagination: chunk control rows; T1 + T2 stay visible across pages.
  const totalPages = Math.max(1, Math.ceil(controlRows.length / MAX_T3_ROWS));
  const page = Math.min(Math.max(1, parseInt(pageStr, 10) || 1), totalPages);
  const controlsThisPage = totalPages > 1
    ? controlRows.slice((page - 1) * MAX_T3_ROWS, page * MAX_T3_ROWS)
    : controlRows;
  const pagerRows = totalPages > 1
    ? [[
        settingButton("‹", `cfg:page:${groupId}~${page > 1 ? page - 1 : totalPages}`),
        settingButton(`Hal ${page}/${totalPages}`, "cfg:noop"),
        settingButton("›", `cfg:page:${groupId}~${page < totalPages ? page + 1 : 1}`),
      ]]
    : [];
  const currentToken = totalPages > 1 ? `${groupId}~${page}` : groupId;

  const bodyText = [
    `${MENU_SECTION_LABEL[sec.id] || sec.title} › ${sg.title}`,
    `📝 ${_deps.subgroupDesc(sg)}`,
    "",
    body || "  (tak ada setelan)",
    "",
    totalPages > 1
      ? `Tombol edit (hal ${page}/${totalPages}). Sisanya lihat-saja (via /setcfg / file).`
      : "Tombol = bisa diubah. Sisanya lihat-saja (via /setcfg / file).",
  ].join("\n");

  const keyboard = [
    ...settingsHeaderRows(sec.id, currentToken),
    ...settingsGroupRows(sec, groupId),
    ...pagerRows,
    ...controlsThisPage,
  ];
  return { text: bodyText, keyboard };
}

// 🗂️ Racikan/Identitas — kept as the dedicated presets page (load/diff/del/save).
function renderSettingsPresets() {
  const presets = listPresets();
  const lines = presets.length
    ? presets.map((p) => p.error
        ? `⚠ ${p.name}`
        : `${p.isCurrent ? "●" : "○"} ${p.name} — ${p.dryRun ? "🧪 dry-run" : "live"} · ${p.keys} keys${p.isCurrent ? " (current)" : ""}`)
    : ["(belum ada preset)"];
  const setupStatus = (() => {
    try { const s = getActiveSetupStatus(); return s.name ? `${s.name}${s.edited ? " ✎ (ada edit manual)" : ""}` : "— (belum load)"; } catch { return "—"; }
  })();
  const bodyText = ["🧩 ADD BY ZEN › 🗂️ Racikan/Identitas", "",
    `Aktif: ${setupStatus}`,
    "(Racikan = snapshot config penuh. Beda dari 🧬 Profil = arketipe wizard.)", "",
    ...lines, "",
    "● = sama dgn config live · 🧪 = isi file dryRun (bukan berarti jalan)",
    "Per baris: ▶ load · 🔍 lihat beda · 🗑️ hapus.",
    "💾 = simpan config sekarang jadi racikan baru.",
  ].join("\n");
  const rows = presets.map((p) => p.error
    ? [settingButton(`⚠ ${p.name}`, "cfg:noop")]
    : [
        settingButton(`${p.isCurrent ? "●" : "▶"} ${p.name}${p.dryRun ? " 🧪" : ""}`, `cfg:preset:ask:${p.name}`),
        settingButton("🔍", `cfg:preset:diff:${p.name}`),
        settingButton("🗑️", `cfg:preset:rmask:${p.name}`),
      ]);
  rows.push([settingButton("💾 Simpan config sekarang", "cfg:preset:save")]);
  // Keep TINGKAT 1 + the Zen TINGKAT 2 groups visible (Racikan marked ▸) so the
  // user can jump straight to another section/group without a back button.
  const zenSec = ORIGIN_SECTIONS.find((s) => s.id === "zen");
  const keyboard = [
    ...settingsHeaderRows("zen", "presets"),
    ...settingsGroupRows(zenSec, "zen-racikan"),
    ...rows,
  ];
  return { text: bodyText, keyboard };
}

// ── Mode Campur (per-fungsi) — Batch D ───────────────────────────────────────
// A second navigation axis over the SAME MENU_CONTROLS: instead of ASAL→grup, the
// landing shows the 12 FUNCTION_GROUPS directly (function ≈ "what does it do"), and
// each opens its controls (the SAME editable buttons, paginated). Because controls
// mix dev+zen, each control button carries an inline ⚙️/🧩 origin marker. The Pisah
// (origin) mode is untouched; only the page TOKEN encodes the mode (fn-* = Campur).

function findFnGroup(id) {
  return FUNCTION_GROUPS.find((g) => g.id === id) || null;
}

// TINGKAT 1 (Campur) — mode toggle (→ Pisah) + Racikan/Config/Refresh/Close.
// Mirrors settingsHeaderRows but without the two ASAL buttons (Campur has no ASAL
// axis); the function groups are the TINGKAT 2 below.
function campurHeaderRows(token) {
  return [
    [settingButton("🔀 Mode: Pisah", "cfg:page:main")],
    [settingButton("🗂️ Racikan", "cfg:page:presets"), settingButton("📋 Config penuh", "cfg:show")],
    [settingButton("🔄 Refresh", `cfg:page:${token}`), settingButton("❌ Close", "cfg:close")],
  ];
}

// TINGKAT 2 (Campur) — the 12 function-group buttons, 2/row, each tagged ✏N / 👁
// like the origin groups. The active group is marked ▸. Stays visible when a group
// is open so the user can jump between functions without a back button.
function campurGroupRows(activeId) {
  const btns = FUNCTION_GROUPS.map((fg) => {
    const short = MENU_FNGROUP_SHORT[fg.id] || fg.title;
    const mark = fg.id === activeId ? "▸ " : "";
    const n = editableCountFor(fg); // axis-agnostic: only reads fg.keys
    return settingButton(`${mark}${fg.emoji} ${short} ${n > 0 ? `✏${n}` : "👁"}`, `cfg:page:fn-${fg.id}`);
  });
  return chunkRows(btns, 2);
}

// LANDING (Campur, default) — same config-inti summary as Pisah + TINGKAT 1 + the
// 12 function-group buttons (none active).
function renderCampurLanding() {
  const bodyText = [
    formatSettingsLandingSummary(),
    "",
    "🔀 Mode Campur — pilih grup fungsi ⤵️  ( ⚙️ dev · 🧩 zen di tiap setelan )",
  ].join("\n");
  const keyboard = [
    ...campurHeaderRows("fn-landing"),
    ...campurGroupRows(null),
  ];
  return { text: bodyText, keyboard };
}

// GROUP (Campur) — one function group open: TINGKAT 1 + TINGKAT 2 (active ▸) +
// editable controls (paginated, ⚙️/🧩-marked). Body = the SAME read-only /config
// rows as the origin group page. `token` may carry a T3 page suffix ("fn-gmgn~2").
function renderCampurGroup(token) {
  const [base, pageStr] = String(token).split("~");
  const id = base.slice(3); // strip "fn-"
  const fg = findFnGroup(id);
  if (!fg) return renderCampurLanding();

  const rowMap = _deps.buildConfigRowMap();
  const { text: body } = _deps.renderSubclusterRows(fg.keys, rowMap);

  let controlRows = settingsControlRows(fg, { withOriginMarker: true });
  if (controlRows.length === 0) controlRows = [[settingButton("👁 Lihat-saja — ubah via /setcfg atau file", "cfg:noop")]];

  // T3 pagination (same mechanic as the origin group page); T1 + T2 stay visible.
  const totalPages = Math.max(1, Math.ceil(controlRows.length / MAX_T3_ROWS));
  const page = Math.min(Math.max(1, parseInt(pageStr, 10) || 1), totalPages);
  const controlsThisPage = totalPages > 1
    ? controlRows.slice((page - 1) * MAX_T3_ROWS, page * MAX_T3_ROWS)
    : controlRows;
  const pagerRows = totalPages > 1
    ? [[
        settingButton("‹", `cfg:page:fn-${id}~${page > 1 ? page - 1 : totalPages}`),
        settingButton(`Hal ${page}/${totalPages}`, "cfg:noop"),
        settingButton("›", `cfg:page:fn-${id}~${page < totalPages ? page + 1 : 1}`),
      ]]
    : [];
  const currentToken = totalPages > 1 ? `fn-${id}~${page}` : `fn-${id}`;

  let head = `🔀 Campur › ${fg.emoji} ${fg.title}`;
  if (fg.gmgnDynamic) {
    const src = config.screening.source;
    head += String(src).toLowerCase() === "gmgn" ? " · 🟢 aktif (source=gmgn)" : ` · ⚪ nonaktif (source=${src})`;
  }
  const bodyText = [
    head,
    "",
    body || "  (tak ada setelan)",
    "",
    totalPages > 1
      ? `Tombol edit (hal ${page}/${totalPages}) — ⚙️ dev · 🧩 zen. Sisanya lihat-saja.`
      : "Tombol = bisa diubah ( ⚙️ dev · 🧩 zen ). Sisanya lihat-saja (via /setcfg / file).",
  ].join("\n");

  const keyboard = [
    ...campurHeaderRows(currentToken),
    ...campurGroupRows(id),
    ...pagerRows,
    ...controlsThisPage,
  ];
  return { text: bodyText, keyboard };
}

export function renderSettingsMenu(page = "main") {
  const base = String(page).split("~")[0];
  if (base === "main") return renderSettingsMain();
  if (base === "fn-landing") return renderCampurLanding();
  if (base.startsWith("fn-")) return renderCampurGroup(page); // Campur group token (e.g. "fn-gmgn~2")
  if (base === "dev" || base === "zen") return renderSettingsSection(base);
  if (base === "presets") return renderSettingsPresets();
  return renderSettingsGroup(page); // group token (e.g. "dev-management" / "zen-gmgn~2"); unknown → main
}
