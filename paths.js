import path from "path";
import { REPO_ROOT } from "./repo-root.js";

const dataDir = process.env.MERIDIAN_DATA_DIR
  ? path.resolve(REPO_ROOT, process.env.MERIDIAN_DATA_DIR)
  : REPO_ROOT;

const userConfigPath = process.env.MERIDIAN_CONFIG_PATH
  ? path.resolve(REPO_ROOT, process.env.MERIDIAN_CONFIG_PATH)
  : path.join(dataDir, "user-config.json");

export const paths = {
  dataDir,
  userConfigPath,
  presetsDir:            path.join(dataDir, "presets"),
  gmgnConfigPath:        path.join(dataDir, "gmgn-config.json"),
  statePath:             path.join(dataDir, "state.json"),
  lessonsPath:           path.join(dataDir, "lessons.json"),
  lessonsArchivePath:    path.join(dataDir, "lessons-archive-pre-mainzen_v2.json"),
  poolMemoryPath:        path.join(dataDir, "pool-memory.json"),
  decisionLogPath:       path.join(dataDir, "decision-log.json"),
  hivemindCachePath:     path.join(dataDir, "hivemind-cache.json"),
  candidateMemoryPath:   path.join(dataDir, "candidate-memory.json"),
  signalWeightsPath:     path.join(dataDir, "signal-weights.json"),
  smartWalletsPath:      path.join(dataDir, "smart-wallets.json"),
  tokenBlacklistPath:    path.join(dataDir, "token-blacklist.json"),
  strategyLibraryPath:   path.join(dataDir, "strategy-library.json"),
  solBalanceHistoryPath: path.join(dataDir, "sol-balance-history.json"),
  llmCostLogPath:        path.join(dataDir, "llm-cost-log.json"),
  gasLogPath:            path.join(dataDir, "gas-log.json"),
  logDir:                path.join(dataDir, "logs"),
};
