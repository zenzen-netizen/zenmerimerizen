# BUILD paths.js adoption — progress
- [x] F1 paths.js + config/state/lessons
- [x] F2 decision-log/pool-memory/hivemind/logger/signal-weights
- [x] F3 smart-wallets/sol-tracker/strategy-library/token-blacklist
- [x] F4 fix path-relatif: candidate-memory/gas-tracker/llm-cost-tracker
- [x] F5 briefing/index:lessons/telegram/executor
- [x] F6 verifikasi paritas + owner smoke-test  ← paritas 17/17 OK; owner restart #58 boot BERSIH

## Commit per-fase (branch: experimental)
- F0 `2c82bff` feat: add paths.js (data-dir resolver, default-root)
- F1 `541c686` refactor: route config/state/lessons via paths.js
- F2 `c634aff` refactor: route logging/memory files via paths.js
- F3 `05ce5b8` refactor: route trackers/libraries via paths.js
- F4 `6b8f986` fix: route candidate/gas/llm-cost via paths.js (cwd-independent)
- F5 `8e37721` refactor: route remaining readers via paths.js

## F6a — bukti paritas (nol env, tanpa MERIDIAN_DATA_DIR/MERIDIAN_CONFIG_PATH)
Semua 17 key == `path.join(REPO_ROOT, <file lama>)` → **17/17 OK, nol MISMATCH**.
Artinya default-ke-root: tiap paths.X nunjuk ke lokasi file LAMA persis → perilaku identik.

## F6b — grep sisa repoPath file-data
Tak ada file dalam tabel reroute yang tersisa. Sisa match = pengecualian disengaja:
- `setup.js` (user-config/gmgn/*.example.json) → **[B] dilarang disentuh**.
- `scripts/backtest-exits.js`, `scripts/backtest-binwidth.js` (lessons.json) → **di luar scope**
  (skrip offline manual, tidak di tabel reroute).
- `hivemind.js` `repoPath("package.json")` → **[B] sengaja dibiarkan** (bukan file data).

## Catatan behavior-change (intended, Fase 4)
candidate-memory / gas-tracker / llm-cost-tracker DULU pakai path relatif `"./x.json"`
(CWD-dependent). Sekarang di-anchor ke REPO_ROOT. Karena bot selalu jalan dari repo root
(pm2/npm start → CWD==REPO_ROOT), file target SAMA. Ini fix kerapuhan, bukan pindah data.

## F6c — HASIL SMOKE-TEST OWNER (Zen), restart #58 (2026-07-04T09:45Z)
  [x] pm2 restart 0 (meridian) → boot BERSIH: Mode LIVE, cron 10m/30m, polling, wallet init.
      cwd==repo-root (Fase-4 relatif→root = no-op di praktik).
  [x] baca-data KONFIRM via log: pool-memory (FABLE-SOL 100% WR/3 deploys), config (deploy
      0.213 SOL maximize + minFeeActiveTvlRatio 0.19%), state (0 pos), lessons/screening jalan.
  [x] Nol error path/module (grep ENOENT/Cannot-find/no-such-file/repoPath di err.log = kosong).
  [~] Telegram: 1x `fetch failed` sesaat pas boot (glitch JARINGAN ke API TG, BUKAN refactor
      path — tak berulang, polling pulih). Zen boleh eyeball /status sekali utk pastiin chat responsif.
