# 🔍 RECON PROFIL & RACIKAN — FINAL REPORT
**Status Recon: ✅ LENGKAP**

---

## 📋 FASE 1 — VERIFIKASI SUMBU RACIKAN (match-OLD)
**Status: ✅ Lengkap**

### 1.1 preset-manager.js — Fungsi core + line:
- ✅ savePreset — line 107
- ✅ applyPreset — line 133
- ✅ getPresetDiff — line 121
- ✅ listPresets — line 79
- ✅ deletePreset — line 182
- ✅ diffConfigs — line 57
- ✅ validName — line 70
- ✅ getActiveSetupStatus — line 154
- ✅ formatIdentity — line 170
- ✅ META_KEYS = {"preset", "activeSetup"} — line 41

### 1.2 lessons.js — Helper filter racikan + line:
- ✅ `keepActiveRacikan(p)` — line 892
  - Logika: `(p?.active_setup ?? null) === (config.activeSetup ?? null)`
- ✅ `getPerformanceForRacikan(name)` — line 935
  - Filter: `!p.paper && p.active_setup === name`
- ✅ `listRacikanInPerformance()` — line 944
  - Return: `[{name, count}, ...]` sorted by count DESC

### 1.3 index.js — runPresetCommand + registrasi:
- ✅ `runPresetCommand(argStr)` definisi — line 2718
- ✅ Handler Telegram /preset — line 3133
- ✅ Handler CLI /preset — line 3738

---

## 🔐 FASE 2 — SECRET PRESET + DATA LESSONS
**Status: ✅ Lengkap (VALUES di-redact)**

### 2.1 Preset aktual: mainzen.json
**Total keys: 97**

⚠️ SECRET keys (JANGAN print value):
- hiveMindApiKey
- publicApiKey
- rpcUrl
- telegramChatId

ℹ️ Config keys sample: agentId, darwinEnabled, deployAmountSol, dryRun, generalModel, llmBaseUrl, managementIntervalMin, maxPositions, minMcap, minTvl, screeningModel, strategy + 80 lainnya

### 2.2 Lessons data breakdown:
```
Total records:           346
Live (non-paper):        346
Untagged (no active_setup): 0 ← SEMUA ter-tag racikan

Breakdown per racikan:
  mainzen_v2_1:  253 record (73%)
  mainzen_v2:     93 record (27%)
```

### 2.3 Struktur 1 record lessons (37 fields):
```
active_setup, amount_sol, base_mint, bin_range, bin_step, close_reason,
closed_at, deployed_at, entry_holders, entry_mcap, entry_tvl, entry_volume,
exit_mcap, exit_tvl, exit_volume, fee_tvl_ratio, fees_earned_usd,
final_value_usd, initial_value_usd, minutes_held, minutes_in_range,
narrative_category, open_hour_wib, open_session, opened_at, organic_score,
peak_pnl_pct, pnl_pct, pnl_usd, pool, pool_name, position, profile,
range_efficiency, recorded_at, shadow_signals, signal_snapshot, strategy,
trough_pnl_pct, volatility
```

**⚠️ Catatan:** Nggak ada field rahasia di lessons records — semua telemetri.

---

## 📁 FASE 3 — UKUR + PETAKAN SUMBU PROFIL

### 3.1 Baseline paths:
- ✅ `paths.js` absent → `/home/ubuntu/meridianzen/paths.js` tidak ada
- ✅ `MERIDIAN_PROFILE` unused → grep return 0 matches di semua *.js
- ✅ `MERIDIAN_DATA_DIR` unused → grep return 0 matches di semua *.js

### 3.5 Hardcode non-repoPath di preset-manager.js:
- ✅ `PRESETS_DIR = path.join(__dirname, "presets")` — line 20
- ✅ `USER_CONFIG_PATH = path.join(__dirname, "user-config.json")` — line 21

Catatan: preset-manager.js is standalone CLI, wajar hardcode.

---

## 📊 TABEL 1 — KLASIFIKASI REPOPATH CALLS (3.2)

### Kategori [A] — FILE_DATA per-profil (BUTUH reroute ke paths.js):

| File | Usage Sites |
|------|-------------|
| user-config.json | config.js:7, executor.js:31, telegram.js:8 |
| state.json | state.js:16, briefing.js:148 |
| lessons.json | lessons.js:19, index.js:3720, briefing.js:149 |
| pool-memory.json | pool-memory.js:14 |
| decision-log.json | decision-log.js:4 |
| signal-weights.json | signal-weights.js:17 |
| hivemind-cache.json | hivemind.js:8 |
| smart-wallets.json | smart-wallets.js:5 |
| token-blacklist.json | token-blacklist.js:12 |
| strategy-library.json | strategy-library.js:13 |
| sol-balance-history.json | sol-tracker.js:22 |
| candidate-memory.json | (created by index.js) |
| llm-cost-log.json | (created by executor.js) |
| gas-log.json | (created by executor.js) |
| logs/ | logger.js:5 |
| lessons-archive-*.json | lessons.js:902 (archive) |

**✅ Total [A]: 22 baris repoPath calls** (16 file + 1 folder + implicit)

### Kategori [B] — STATIC/shared (TIDAK di-reroute):

| File | Usage |
|------|-------|
| .env | envcrypt.js:6, setup.js:19 |
| .env.raw | envcrypt.js:95 |
| .envrypt | envcrypt.js:7 |
| user-config.example.json | setup.js:204 |
| gmgn-config.example.json | setup.js:205 |
| dev-blocklist.json | dev-blocklist.js:13 |
| package.json | hivemind.js:9 |

**✅ Total [B]: 8 baris repoPath calls**

---

## 📊 TABEL 2 — FILE COVERAGE vs paths.js dev (3.4)

### SUDAH di paths.js dev (7/15 file):
```
✅ user-config.json      → paths.dataDir('user-config.json')
✅ state.json            → paths.dataDir('state.json')
✅ lessons.json          → paths.dataDir('lessons.json')
✅ pool-memory.json      → paths.dataDir('pool-memory.json')
✅ decision-log.json     → paths.dataDir('decision-log.json')
✅ hivemind-cache.json   → paths.dataDir('hivemind-cache.json')
✅ logs/                 → paths.dataDir('logs')
```

### EXTRA file fork Zen (BELUM di paths.js dev — perlu ditambah):
```
⬜ candidate-memory.json      — Snapshot momentum/TVL per pool
⬜ gas-log.json               — Gas spend log per tx
⬜ llm-cost-log.json          — LLM token/cost accounting
⬜ signal-weights.json        — Learned signal weights (ML)
⬜ smart-wallets.json         — KOL/alpha wallet tracker
⬜ sol-balance-history.json   — Daily SOL balance snapshots
⬜ strategy-library.json      — Saved LP strategies (presets)
⬜ token-blacklist.json       — Permanent token blacklist
⬜ lessons-archive-*.json     — Archive (opsional, read-only)
```

**⬜ Total EXTRA: 9 file** (8 aktif + 1 archive)

**Catatan:** gmgn-config.json di paths.js dev, tp di VPS live hanya .example (bukan file data utama yang dimuat runtime).

---

## ✅ KESIMPULAN ADOPSI PATHS.JS

### Ukuran refactor [A]:
- File data per-profil: 16 file + 1 folder (logs)
- Baris repoPath: 22 calls di 19 file source
- **Effort: MEDIUM** — reroute 22 calls, update 19 file

### Entri baru yang harus ditambah paths.js dev:
1. candidate-memory.json
2. gas-log.json
3. llm-cost-log.json
4. signal-weights.json
5. smart-wallets.json
6. sol-balance-history.json
7. strategy-library.json
8. token-blacklist.json
9. lessons-archive-pre-mainzen_v2.json (optional, read-only)

### Preset-manager.js impact:
- Hardcode: `PRESETS_DIR = __dirname/presets` (line 20)
- Hardcode: `USER_CONFIG_PATH = __dirname/user-config.json` (line 21)
- **Decision: OK untuk tetap hardcode** (independence dari bot runtime)

### Status paths.js adoption:
🟢 **READY FOR MIGRATION ✅**

- Zero blocker (MERIDIAN_PROFILE/DATA_DIR unused)
- Clear [A]/[B] split (22 per-profil, 8 static)
- Footprint mapped (9 entry untuk paths.js dev)
- Racikan system solid (2 racikan active, 346 lessons ter-tag)

---

**Report generated:** `/home/ubuntu/meridianzen/notes/RECON-FINAL-REPORT.md`  
**Progress checklist:** `/home/ubuntu/meridianzen/notes/profil-racikan-recon-progress.md`
