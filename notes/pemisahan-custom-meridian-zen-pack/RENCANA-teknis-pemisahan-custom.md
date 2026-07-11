# PLAN — meridian-zen-pack

> Rencana teknis pemisahan custom meridian jadi paket plug-n-play terpisah dari upstream yunus-0x/meridian.

Dibuat: 2026-07-07
Status: draft, siap eksekusi
Branch kerja: `experimental` (fork `zenzen-netizen/zenmerimerizen`)
Upstream: `yunus-0x/meridian` (remote `upstream`)

---

## 1. Latar belakang

Repo `meridianzen` adalah fork dari `yunus-0x/meridian` yang sudah divergen masif:

| Metrik | Nilai |
|---|---|
| Commit custom di `experimental` (vs `upstream/main`) | 516 |
| File JS baru (pure-add) | 46 |
| File views baru | 13 |
| File tools/ baru | 4 |
| File core dimodifikasi | 27 |
| Baris ditambah di 6 core terbesar | +5735 / -558 |
| File notes/docs | ~80 (data, bukan kode) |

Integrasi custom saat ini: **static ESM import langsung di 27 core file**. Tidak ada plugin system. Drop folder custom ke vanilla yunus = tidak jalan apa-apa, karena call site tetap di core asli.

## 2. Goal

`git pull upstream main` → vanilla yunus bot, zero custom.
`./install.sh /path/to/meridian` → semua custom aktif (backend, telegram messages, UI views, learning, briefings, presets, paper-trading, addprofil, envcrypt, dll).
`./uninstall.sh /path/to/meridian` → kembali vanilla.

Mirip cara kerja opencode skill system: custom = file terpisah, core bersih, install/uninstall = taruh/hapus file.

## 3. Arsitektur paket

```
meridian-zen-pack/                    # repo terpisah
├── install.sh                        # entry point installer
├── uninstall.sh                      # restore backup + hapus plugins
├── manifest.json                     # peta: modul × integration point × fase
├── README.md                         # upgrade workflow
├── lib/
│   ├── bus.js                        # hook bus (EventEmitter wrapper, ~30 baris)
│   ├── loader.js                     # auto-scan plugins/, register ke bus
│   └── patcher.js                    # anchor-based patch engine (apply/revert/verify)
├── plugins/                          # drop-in JS modules (ex-custom)
│   ├── envcrypt.js                   # side-effect import
│   ├── paths.js                      # data-dir resolver
│   ├── paper-trading.js              # register: on("beforeDeploy"), on("getMyPositions")...
│   ├── addprofil.js                  # register: on("telegramCommand:/addprofil")
│   ├── profil-export.js
│   ├── racikan-export.js
│   ├── candidate-memory.js           # register: on("screeningCycle:afterFetch")
│   ├── signal-tracker.js             # register: on("managementCycle:afterPnl")
│   ├── signal-weights.js
│   ├── reports.js
│   ├── preset-manager.js
│   ├── hivemind.js
│   ├── dev-blocklist.js
│   ├── decision-log.js
│   ├── gas-tracker.js
│   ├── llm-cost-tracker.js
│   ├── sol-tracker.js
│   ├── pnl-tracker.js
│   ├── openrouter-usage.js
│   ├── screening-scales.js
│   ├── config-origin.js
│   ├── config-schema.js
│   ├── logger-ext.js                 # ekstrak dari logger.js (+4)
│   ├── prompt-racikan.js             # ekstrak racikanRules dari prompt.js
│   ├── state-ext.js                  # ekstrak dari state.js
│   ├── pool-memory-ext.js
│   ├── smart-wallets-ext.js
│   ├── strategy-library-ext.js
│   ├── token-blacklist-ext.js
│   ├── config-ext.js                 # ekstrak dari config.js (+591)
│   ├── agent-ext.js                  # ekstrak dari agent.js (+448)
│   ├── safety-ext.js                 # ekstrak dari tools/executor.js
│   ├── tool-schemas.js               # ekstrak dari tools/definitions.js
│   ├── wallet-ext.js                 # ekstrak dari tools/wallet.js
│   ├── dlmm-paper.js                 # ekstrak paper branches dari tools/dlmm.js
│   ├── screening-ext.js              # ekstrak dari tools/screening.js
│   ├── token-ext.js                  # ekstrak dari tools/token.js
│   ├── study-ext.js                  # ekstrak dari tools/study.js
│   ├── telegram-cmds.js              # ekstrak dari telegram.js
│   ├── lessons-ext.js                # ekstrak dari lessons.js (+753)
│   ├── briefing-ext.js               # ekstrak dari briefing.js (+550)
│   ├── index-cron.js                 # ekstrak cron cycles dari index.js
│   ├── index-commands.js             # ekstrak telegram/REPL commands dari index.js
│   ├── index-settings.js             # ekstrak settings menu dari index.js
│   ├── index-render.js               # ekstrak render call sites dari index.js
│   └── ... (total ~50 file di akhir Fase 2)
├── views/                            # 13 file display layer (drop-in)
│   ├── positions.js, status.js, wallet.js, settings.js,
│   ├── config.js, cycle.js, format.js, notifs.js,
│   ├── pool.js, render.js, system.js, trackers.js
├── tools-extra/                      # 4 file tools/ baru (drop-in setelah wiring)
│   ├── chart-indicators.js, gmgn.js, pnl.js, smi.js
├── core-patches/                     # surgical patches ke vanilla yunus
│   ├── 01-hook-bus.patch             # inject import loader.js di index.js
│   ├── 02-config-keys.patch          # inject config keys custom
│   ├── 03-telegram-cmds.patch        # inject /addprofil /export /preset handlers
│   ├── 04-cron-hooks.patch           # inject bus.emit di screening/management cycle
│   ├── 05-executor-hooks.patch       # inject beforeDeploy/afterClose emit
│   ├── 06-dlmm-paper.patch           # inject paper-trading branches di tools/dlmm.js
│   ├── 07-screening-yield.patch      # inject yield_to_me line di screening.js
│   ├── 08-definitions-tools.patch    # inject tool schemas custom
│   ├── 09-wallet-regime.patch        # inject getSolMarketRegime di wallet.js
│   ├── 10-lessons-mode-scoped.patch  # inject getModePerformance di lessons.js
│   ├── 11-briefing-sections.patch    # inject custom sections di briefing.js
│   ├── 12-agent-roles.patch          # inject MANAGER_TOOLS/SCREENER_TOOLS custom
│   ├── 13-state-trackers.patch       # inject paper flag + PnL tracking di state.js
│   ├── 14-prompt-racikan.patch       # inject racikanRules di prompt.js
│   ├── 15-logger-audit.patch         # inject audit trail di logger.js
│   ├── 16-paths-routing.patch        # inject paths.js routing di readers
│   ├── 17-views-render.patch         # inject render call sites di index.js
│   ├── 18-settings-menu.patch        # inject settings menu pages di index.js
│   └── ... (total ~15-20 patch files)
├── scripts/                          # standalone, tidak di-import runtime
│   ├── backtest-binwidth.js
│   ├── backtest-exits.js
│   ├── envrypt.js
│   └── smoke-sizing-v2.1.js
└── tests/
    ├── smoke-test.js                 # boot test: node -c + DRY_RUN boot
    └── feature-checklist.md          # manual checklist fitur
```

## 4. Klasifikasi 46 modul custom (pra-audit)

| Kategori | Jenis integration | Jumlah | Fase |
|---|---|---|---|
| Side-effect import | import saja, fitur aktif | 1 (`envcrypt.js`) | 1 |
| Library modules | export fungsi, butuh call site di core | ~18 | 2 |
| Command modules | butuh wiring ke telegram/REPL handler | 6 | 2 |
| Tools | butuh wiring ke executor toolMap + definitions | 4 | 2 |
| Views | butuh wiring dari index.js render call sites | 13 | 2 |
| Scripts | standalone, tidak di-import runtime | 4 | 1 |

## 5. Hook bus design

`lib/bus.js` — wrapper tipis di atas `EventEmitter`:
```js
import { EventEmitter } from "events";
export const bus = new EventEmitter();
bus.setMaxListeners(100);
export function on(event, handler) { bus.on(event, handler); }
export function emit(event, ctx) { bus.emit(event, ctx); return ctx; }
```

`lib/loader.js` — auto-import `plugins/*.js`:
```js
import { readdirSync } from "fs";
import { join } from "path";
import { bus } from "./bus.js";
for (const f of readdirSync(new URL("../plugins", import.meta.url))) {
  if (f.endsWith(".js")) {
    const mod = await import(join("../plugins", f));
    if (typeof mod.register === "function") mod.register(bus);
  }
}
```

Core yunus di-patch jadi `emit(...)` di titik-titik anchor. Plugin self-register via `on(...)`.

### Event registry (draft, akan tumbuh di Fase 2)

| Event | Emit point (core) | Listener (plugin) |
|---|---|---|
| `boot:beforeConfig` | config.js load | envcrypt, paths |
| `configLoaded` | config.js akhir load | config-ext, preset-manager |
| `beforeDeploy` | tools/executor.js safety check | paper-trading, safety-ext, conviction-sizing |
| `afterDeploy` | tools/executor.js post-deploy | state-ext, pool-memory, decision-log |
| `beforeClose` | tools/dlmm.js close branch | paper-trading |
| `afterClose` | tools/executor.js post-close | lessons-ext, reports, hive-mind |
| `screeningCycle:afterFetch` | index.js runScreeningCycle | candidate-memory, screening-ext, signal-tracker |
| `managementCycle:afterPnl` | index.js runManagementCycle | signal-tracker, dlmm-paper, state-ext |
| `telegramMessage` | telegram.js polling | telegram-cmds (addprofil, export, preset) |
| `telegramCommand:/x` | telegram.js dispatcher | per-command plugin |
| `briefingBuild` | briefing.js compose | briefing-ext, lessons-ext, reports |
| `promptBuild:screener` | prompt.js screener | prompt-racikan, lessons-ext, candidate-memory |
| `promptBuild:manager` | prompt.js manager | prompt-racikan, lessons-ext |
| `renderPositions` | index.js /positions | views/positions |
| `renderStatus` | index.js /status | views/status |
| `renderSettings` | index.js /settings | views/settings |
| `toolMapLoad` | tools/executor.js toolMap | tool-schemas, wallet-ext, dlmm-paper |
| `definitionsLoad` | tools/definitions.js | tool-schemas |

## 6. Patcher engine

`lib/patcher.js` — anchor-based, bukan line-number-based (tahan terhadap upstream ubah baris).

Format patch (YAML):
```yaml
# core-patches/01-hook-bus.patch
file: index.js
anchor: "import { agentLoop } from \"./agent.js\";"
inject_after: |
  import "./plugins/envcrypt.js";
  import "./plugins/lib/loader.js";
description: "Hook bus + envcrypt import di index.js entry"
```

Operasi:
1. Baca patch file
2. Backup target → `backups/<file>.<timestamp>.bak`
3. Cari `anchor` string di file (exact match)
4. Inject `inject_after` setelah anchor
5. `node --check <file>` syntax verify
6. Anchor tidak ditemukan → warning, skip, log ke `install.log`
7. Anchor ditemukan tapi string berikutnya sudah == `inject_after` → idempotent, skip (sudah terinstall)

Revert: restore dari `backups/` (uninstaller).

## 7. Installer flow

`install.sh <target_dir>`:
1. Verify target = meridian checkout (cek `index.js`, `agent.js`, `package.json` name="meridian" atau similar)
2. Verify upstream version: baca `git -C <target> log -1 upstream/main` → compare SHA ke `manifest.json` `tested_upstream_sha`. Kalau drift → warning, prompt konfirmasi.
3. Copy `plugins/*` → `<target>/plugins/`
4. Copy `views/*` → `<target>/views/`
5. Copy `tools-extra/*` → `<target>/tools/`
6. Copy `scripts/*` → `<target>/scripts/`
7. Apply `core-patches/*.patch` via patcher engine
8. Syntax check semua file patched (`node --check`)
9. Report: X plugins installed, Y patches OK, Z patches FAILED
10. Kalau Z > 0 → exit non-zero, print FAILED patches + saran fix manual

## 8. Uninstaller flow

`uninstall.sh <target_dir>`:
1. Cek `backups/` ada
2. Restore tiap file dari backup (overwrite patched version)
3. Hapus `plugins/`, `views/`, `tools-extra/` (yang di-copy installer — track di `manifest.json`)
4. Hapus `scripts/` custom
5. Verify vanilla: `git -C <target> diff upstream/main` harus kosong (kalau tidak, warn)
6. Hapus `backups/`

## 9. Manifest format

`manifest.json`:
```json
{
  "version": "0.1.0-fase1",
  "tested_upstream_sha": "<commit-sha upstream/main saat paket dibuild>",
  "min_node_version": "18",
  "modules": [
    {
      "name": "envcrypt",
      "file": "plugins/envcrypt.js",
      "type": "side-effect-import",
      "integration": [
        {
          "file": "index.js",
          "patch": "core-patches/01-hook-bus.patch",
          "anchor": "import { agentLoop } from \"./agent.js\";",
          "hook": "import-after",
          "fase": 1
        }
      ],
      "fase": 1
    },
    {
      "name": "paper-trading",
      "file": "plugins/paper-trading.js",
      "type": "library",
      "integration": [
        {"file": "tools/dlmm.js", "patch": "core-patches/06-dlmm-paper.patch", "events": ["beforeDeploy", "getMyPositions", "beforeClose"], "fase": 2},
        {"file": "CLAUDE.md", "hook": "doc-section", "fase": 2}
      ],
      "fase": 2
    }
  ],
  "patches": [
    {"file": "core-patches/01-hook-bus.patch", "applies_to": "index.js", "fase": 1},
    {"file": "core-patches/02-config-keys.patch", "applies_to": "config.js", "fase": 2}
  ],
  "views": ["positions.js", "status.js", "..."],
  "tools_extra": ["chart-indicators.js", "gmgn.js", "pnl.js", "smi.js"],
  "scripts": ["backtest-binwidth.js", "..."]
}
```

## 10. Test strategy

**Smoke test** (`tests/smoke-test.js`):
- `node --check` semua file di target setelah install
- `node index.js` boot dengan `DRY_RUN=true` selama 10 detik, verify tidak crash
- Verify `plugins/` ter-load (log line "loaded N plugins")

**Manual checklist** (`tests/feature-checklist.md`):
- [ ] `node index.js` boot clean (DRY_RUN=true)
- [ ] `/addprofil` responds
- [ ] `/export racikan` produces tar.gz
- [ ] `/export profil` produces tar.gz
- [ ] `/preset list` shows presets
- [ ] `/preset use <name>` applies preset
- [ ] `/positions` shows custom view
- [ ] `/status` shows custom view
- [ ] `/settings` menu shows custom pages (GRUP 13/16)
- [ ] `/config` shows full config
- [ ] Paper mode simulates deploy (paper_ id)
- [ ] Screening cycle emits momentum line
- [ ] Screening cycle emits yield_to_me line
- [ ] Briefing includes custom sections
- [ ] envcrypt decrypts .env
- [ ] paths.js resolves per-profil
- [ ] Telegram notifications fire with custom format
- [ ] Cron cycles run (screening + management)
- [ ] Lessons evolve thresholds
- [ ] Hive-mind sync (kalau HIVE_MIND_URL set)

## 11. Versioning + kompatibilitas

- Lock ke 1 upstream SHA per rilis paket
- Tag format: `v<major>.<minor>.<patch>-yunus-<short-sha>`
  - Contoh: `v1.0.0-yunus-291e30c`
- Kalau yunus update dan anchor drift:
  - Installer detect → warning → exit non-zero
  - Maintainer update anchor di patch → release versi baru
- Range support: tidak. Tiap rilis = 1 SHA tested.

## 12. Eksekusi sequence

### Step 0 — Cleanup working tree (kamu jalankan)
```bash
cd /home/ubuntu/meridianzen
git add notes/ && git commit -m "chore: prune progress notes (audit prep)"
git stash push -m "wip-agent-config-ecosystem" -- agent.js config.js ecosystem.config.cjs
rm ecosystem.config.cjs.bak
git status --short  # harus kosong
```

### Fase 1 — Infrastruktur (2-3 hari)
1. Buat repo `zenzen-netizen/meridian-zen-pack` di github, clone lokal
2. Bangun struktur folder (kosong dulu)
3. Bangun `lib/patcher.js` (anchor-based engine + backup/restore)
4. Bangun `lib/bus.js` + `lib/loader.js` (hook bus skeleton)
5. Bangun `install.sh` + `uninstall.sh` skeleton
6. Salin 46 file JS + 13 views + 4 tools-extra + 4 scripts ke paket
7. Bangun `manifest.json` (peta 46 modul × integration point × fase)
8. Test install di `/tmp/test-fresh` (clone vanilla yunus)
9. Release tag `v0.1.0-fase1-yunus-<sha>`

Hasil Fase 1: file custom tersalin, hook bus jalan, envcrypt aktif. Mayoritas fitur TIDAK aktif karena call site belum di-inject (Fase 2). Expected — Fase 1 = pondasi.

### Fase 2 — Ekstrak core (1-2 minggu, urutan kecil→besar)
Urutan ekstrak (dari diff terkecil → terbesar):

1. `logger.js` (+4) → `plugins/logger-ext.js`
2. `prompt.js` → `plugins/prompt-racikan.js`
3. `state.js`, `pool-memory.js`, `smart-wallets.js`, `strategy-library.js`, `token-blacklist.js` → tracker plugins
4. `config.js` (+591) → `plugins/config-ext.js`
5. `agent.js` (+448) → `plugins/agent-ext.js`
6. `tools/executor.js`, `tools/definitions.js` → `plugins/safety-ext.js`, `plugins/tool-schemas.js`
7. `tools/wallet.js`, `tools/dlmm.js`, `tools/screening.js`, `tools/token.js`, `tools/study.js` → tool plugins
8. `telegram.js` → `plugins/telegram-cmds.js`
9. `lessons.js` (+753) → `plugins/lessons-ext.js`
10. `briefing.js` (+550) → `plugins/briefing-ext.js`
11. `index.js` (+3947) → split jadi ~5 plugin:
    - `plugins/index-cron.js` (screening/management cycles)
    - `plugins/index-commands.js` (telegram/REPL commands)
    - `plugins/index-settings.js` (settings menu pages)
    - `plugins/index-render.js` (render call sites)
    - `plugins/index-boot.js` (bootstrap wires)
12. Tiap file: commit terpisah, smoke test boot
13. Bangun `core-patches/*.patch` (~15-20 file) sesuai urutan ekstrak
14. Test full install di fresh clone + jalankan checklist fitur
15. Release tag `v1.0.0-yunus-<sha>`

### Fase 3 — Maintenance (ongoing)
Tiap yunus update:
```bash
cd /path/to/meridian
git fetch upstream
git merge upstream/main
./meridian-zen-pack/install.sh .
# kalau anchor fail: installer report, fix 1 titik manual
```
- Rilis paket baru kalau anchor drift
- Test checklist ulang per rilis

## 13. Risiko + mitigasi

| Risiko | Mitigasi |
|---|---|
| Anchor drift (yunus ubah string anchor) | Installer detect + warn, fix 1 titik (bukan 27 file) |
| Behavior drift (plugin assume signature lama) | Test checklist per rilis, lock ke upstream SHA |
| Konflik fitur (yunus tambah fitur sama) | Manifest checksum, installer detect duplikat |
| Refactor rusak behavior | Ekstrak per-file, commit terpisah, smoke test tiap commit |
| Hook bus butuh merge juga | Hanya 1 patch (`01-hook-bus.patch`), sisanya plugin = drop-in |
| Plugin load order dependency | Loader urutkan by manifest priority field |

## 14. Yang dibutuhkan dari maintainer

- Akses github untuk buat repo `zenzen-netizen/meridian-zen-pack`
- Node 18+ di mesin kerja
- Clone fresh yunus untuk test (`/tmp/test-fresh`)
- Disk space ~50MB untuk paket + backups

## 15. Status langkah

- [x] Audit divergensi (516 commit, 27 core, 46 file baru)
- [x] Klasifikasi modul (5 kategori)
- [x] Pilih jalan (D bertahap)
- [x] Pilih kompatibilitas (lock SHA)
- [x] Pilih test strategy (smoke + checklist)
- [x] Tulis rencana ini
- [ ] Step 0: cleanup working tree
- [ ] Fase 1: bangun infra
- [ ] Fase 2: ekstrak core
- [ ] Fase 3: maintenance workflow doc
