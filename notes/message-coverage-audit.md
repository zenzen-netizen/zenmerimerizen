# RECON 🅴 — Audit Coverage Menyeluruh Semua Jalur-Render Pesan

> **READ-ONLY.** Disusun 2026-06-26 dari pembacaan LOCAL `index.js`, `telegram.js`,
> `views/*.js`, `reports.js`, `briefing.js`, `guide.js`, `sol-tracker.js`,
> `pnl-tracker.js`, `lessons.js`, `preset-manager.js`. Bukti `file:line` aktual
> (catatan: line di `telegram-message-index.md` (2026-06-21) sudah STALE — handler
> TG yang dulu ~3500 sekarang ~2900–3350 karena migrasi views sudah jalan jauh).
> **Nol ubah kode, nol restart.**
>
> **Tujuan:** peta LENGKAP tiap pesan user-facing → semua titik render → status gaya
> (🟢 BARU `views/*` · 🔴 LAMA inline · 🟡 CAMPUR) + daftar JALUR-GANDA (satu pesan
> logis dirender >1 tempat dgn gaya beda) = sumber gap kayak `/screen`.

---

## 0. Arsitektur render saat ini (2 pola)

Layer `views/` punya **DUA pola** yang hidup berdampingan:

1. **View-model + dispatcher** (`views/render.js`): `buildView()` → objek netral → `render(vm, "telegram"|"plain")`. Terdaftar di `RENDERERS`: **positions, status, wallet, pool, config** (render.js:19-25). Dipakai via `render(...)` di index.js:2002, 2038, 3065, 3102, 3136, 3162.
2. **Builder fungsi langsung** (di-import & dipanggil): `views/cycle.js` (mgmt/screening/confirm), `views/notifs.js` (notif), `views/system.js` (help/hive/pause/error/queue), `views/settings.js` (menu), `views/trackers.js` (sol/pnl tracker), `views/format.js` (primitif `tree`/`SEP`/`ICON`/`fmt*`/`header`).

**Primitif bersama** `views/format.js` di-import LUAS — bukan cuma views, tapi juga **engine** `reports.js:17`, `briefing.js:20`, `guide.js:10` (semua `{ SEP, tree }`), `telegram.js:6` (`ICON`), `sol-tracker.js:20` / `pnl-tracker.js:21` (`renderSolTracker`/`renderPnlTracker`). Artinya laporan/briefing/guide **sudah pakai bahasa-desain tree** walau builder-nya tinggal di file engine, bukan di `views/`. Saya klasifikasikan ini **🟢 (design-aligned)** dgn catatan "builder di engine".

> **Klasifikasi yang dipakai di tabel:**
> - 🟢 **BARU** = dirender via renderer `views/*` ATAU disusun pakai primitif `views/format.js` (tree/SEP/ICON/header) sehingga gaya konsisten.
> - 🔴 **LAMA** = string dijahit inline di `index.js`/engine TANPA primitif views.
> - 🟡 **CAMPUR** = sebagian via views, sebagian inline dalam satu pesan.

---

## 1. Enumerasi SEMUA permukaan output

### 1A. Command Telegram (`telegramHandler` index.js:2896-3355)

| # | Command | Render `file:line` | Builder | Status |
|---|---|---|---|---|
| T1 | `/settings`·`/menu`·`/configmenu` | index.js:2962 → `showSettingsMenu` → `renderSettingsMenu` | views/settings.js:631 | 🟢 |
| T2 | `/guide [arg]` | index.js:2968 `renderGuide` | guide.js (`SEP`/`tree`) | 🟢 |
| T3 | `/briefing [alltime]` | index.js:2983-2986 `generateBriefing`→`sendAndPinBriefing` | briefing.js (`SEP`/`tree`) | 🟢 |
| T4 | `/report [arg]` | index.js:2995 `buildReportForArg` | reports.js (`SEP`/`tree`) | 🟢 |
| T5 | `/help` | index.js:3003 `systemView.renderHelp` | views/system.js:17 | 🟢 |
| T6 | `/wallet trackstart [date\|off]` | index.js:3008-3027 inline `sendMessage` | inline | 🔴 |
| T7 | `/status` | index.js:3050-3065 `statusView.buildView`→`render` | views/status.js + render.js | 🟢 |
| T8 | `/wallet` | index.js:3089-3102 `walletView.buildView`→`render` | views/wallet.js + render.js | 🟢 |
| T9 | `/config core` | index.js:3110 `formatCoreConfig` | **INLINE** index.js:2014-2034 | 🔴 |
| T10 | `/config origin` | index.js:3114 `formatFullConfig`→`render(configView mode:origin)` | views/config.js | 🟢 |
| T11 | `/config` | index.js:3118 `formatFunctionConfig`→`render(configView mode:function)` | views/config.js | 🟢 |
| T12 | `/preset [..]` | index.js:3124 `runPresetCommand` `res.text` | preset-manager.js (no views) | 🔴 |
| T13 | `/positions` | index.js:3135 `positionsView.buildView`→`render` | views/positions.js + render.js | 🟢 |
| T14 | `/pool <n>` | index.js:3151-3162 `poolView.buildView`→`render` | views/pool.js (+`buildRangeEfficiencyLines` inline di-feed) | 🟢 |
| T15 | `/close <n>` | index.js:3181/3183 inline `sendMessage` | inline | 🔴 |
| T16 | `/closeall` | index.js:3203 inline | inline | 🔴 |
| T17 | `/set <n> <note>` | index.js:3219 inline | inline | 🔴 |
| T18 | `/setcfg <k> <v>` | index.js:3234/3237 inline | inline | 🔴 |
| T19 | `/screen` | index.js:3246 `runDeterministicScreen` | **INLINE** index.js:2791-2810 | 🔴 |
| T20 | `/candidates` (cache) | index.js:3254 `describeLatestCandidates` | **INLINE** index.js:1603-1614 | 🔴 |
| T21 | `/deploy <n>` | index.js:3266-3273 inline array.join | inline (+notif post-hook) | 🔴 |
| T22 | `/pause` | index.js:3283 `systemView.renderPaused` | views/system.js:88 | 🟢 |
| T23 | `/resume` | index.js:3293/3295 `systemView.renderResumed/AlreadyRunning` | views/system.js:91/94 | 🟢 |
| T24 | `/hive [pull]` | index.js:3305/3315 `systemView.renderHive` | views/system.js:65 | 🟢 |
| T25 | Casual chat (LLM) | index.js:3337-3346 `createLiveMessage` + `finalize` | telegram.js live (ICON views) + LLM free text | 🟢 |
| T26 | Queue full/queued | index.js:2974/2976 `systemView.renderQueued/QueueFull` | views/system.js:99/102 | 🟢 |
| T27 | Error generik per-handler | `systemView.renderError` (15× — 2988,2997,3067,3104,3137,3164,3185,3205,3220,3239,3248,3275,3320,3349 + HiveMind 3320) | views/system.js:110 | 🟢 |
| T28 | Error/teks inline sisa | "No open positions." (3132,3192), "Invalid number…" (3146,3174,3216), "Config update failed.\nUnknown:" (3234), "Failed to update" (2948), "Invalid value…" (2942), "Nama tidak valid" (2923), "Gagal simpan" (2929), preset-save ok (2927) | inline | 🔴 |

### 1B. REPL / CLI console (`rl.on("line")` index.js:3468-3705)

| # | Command | Render `file:line` | Builder | Status |
|---|---|---|---|---|
| R1 | angka `1/2/3…` (deploy pick) | index.js:3476-3487 `console.log` + `agentLoop` | raw console + LLM | 🔴 (no layer) |
| R2 | `auto` | index.js:3492-3504 `console.log` + `agentLoop` | raw console + LLM | 🔴 (no layer) |
| R3 | `go` | index.js:3508 `launchCron` (no msg) | — | — |
| R4 | `/stop` | index.js:3515 `shutdown` | — | — |
| R5 | `/status` | index.js:3517-3531 **INLINE** `console.log` (+`formatPnlTracker`🟢+disclosure) | inline LAMA | 🔴 |
| R6 | `/briefing [alltime]` | index.js:3535-3539 `generateBriefing` strip-HTML | briefing.js (same source as T3) | 🟢 |
| R7 | `/report [arg]` | index.js:3543-3548 `buildReportForArg` strip | reports.js (same source as T4) | 🟢 |
| R8 | `/guide [arg]` | index.js:3551-3554 `renderGuide` | guide.js (same as T2) | 🟢 |
| R9 | `/candidates` (fetch LIVE) | index.js:3557-3565 `getTopCandidates`+`formatCandidates` | **INLINE** index.js:1439-1456 | 🔴 |
| R10 | `/thresholds` | index.js:3568-3590 **INLINE** `console.log`×12 | inline LAMA (REPL-only) | 🔴 |
| R11 | `/learn [addr]` | index.js:3593-3640 `console.log` + `agentLoop` | raw console + LLM (REPL-only) | 🔴 |
| R12 | `/evolve [force]` | index.js:3642-3681 **INLINE** `console.log` | inline LAMA (REPL-only) | 🔴 |
| R13 | `/preset [..]` | index.js:3683-3690 `runPresetCommand` | preset-manager.js (same as T12) | 🔴 |
| R14 | Free chat (LLM) | index.js:3693-3704 `console.log(content)` | raw console + LLM | — |

> Banner start REPL (index.js:3450-3464) = teks statis, **out-of-date** vs `renderHelp` (T5) — gap lama §D-7 inventory, masih berlaku.

### 1C. Cycle otomatis (cron)

| # | Pesan | Render `file:line` | Builder | Status |
|---|---|---|---|---|
| C1 | Management cycle report | index.js:568 `buildMgmtReport` + 611 `frameMgmtResult`; finalize 631-632 | views/cycle.js:46/86 | 🟢 (lihat ⚠️ envelope) |
| C2 | Mgmt catch-fail | index.js:626 inline `Management cycle failed: …` | **inline** (BUKAN `cycleFail`) | 🔴 (inkonsisten vs C5) |
| C3 | Screening skip (max-pos / modal-kurang) | index.js:669,696 `cycleSkip` | views/cycle.js:94 | 🟢 |
| C4 | Screening no-candidate | index.js:847 `buildNoCandidates` | views/cycle.js:111 | 🟢 |
| C5 | Screening lone-no-deploy | index.js:872 `buildLoneNoDeploy` | views/cycle.js:128 | 🟢 |
| C6 | Screening fail/error | index.js:739,769,1138 `cycleFail` | views/cycle.js:99 | 🟢 |
| C7 | Screening SUCCESS report | index.js:~1100 LLM free text → `stripThink` finalize | LLM (dibingkai live) | 🟡 (teks LLM, bukan template) |
| C8 | Envelope cycle (judul + fallback non-live) | index.js:632 `🔄 Management Cycle\n\n`, 1144 `🔍 Screening Cycle\n\n` | **inline string** | 🔴 (judul tak tersentral) |

### 1D. Notifikasi (`notify*` telegram.js — post-hook executor + cron)

| # | Pesan | Render `file:line` | Builder | Status |
|---|---|---|---|---|
| N1 | notifyDeploy | telegram.js:589 `renderDeploy` | views/notifs.js:30 | 🟢 |
| N2 | notifyClose | telegram.js:605 `renderClose` | views/notifs.js:79 | 🟢 |
| N3 | notifySwap | telegram.js:610 `renderSwap` | views/notifs.js:54 | 🟢 |
| N4 | notifyOutOfRange | telegram.js:615 `renderOOR` | views/notifs.js:44 | 🟢 |

### 1E. Live / streaming + confirm

| # | Pesan | Render `file:line` | Builder | Status |
|---|---|---|---|---|
| L1 | Live tool-line stream | telegram.js:337-432 `createLiveMessage` (toolStart/Finish pakai `ICON`) | telegram.js container + views/format.js ICON | 🟢 (ikon migrasi; container telegram.js) |
| L2 | requestActionConfirmation (deploy/close/claim/swap) | index.js:2075 `summarizeTradeAction` + 2091/2909 `CONFIRM_*` | views/cycle.js:149/181-183 | 🟢 |
| L3 | requestConfirmation (update_config) | index.js:2180 `buildConfigDiff` + `CONFIRM_*` | views/cycle.js:176/181-183 | 🟢 |

### 1F. Pesan sistem otonom lain

| # | Pesan | Render `file:line` | Builder | Status |
|---|---|---|---|---|
| S1 | gasReserve auto-tune | index.js:414 inline `sendMessage` | inline | 🔴 |
| S2 | Suspect-PnL alert | lessons.js:205 inline `sendMessage` (dynamic import) | inline | 🔴 |
| S3 | Daily briefing (cron+watchdog) | briefing.js `generateBriefing` → `sendAndPinBriefing` | briefing.js (design-aligned, sama T3) | 🟢 |
| S4 | Weekly/Monthly briefing (cron) | briefing.js `generatePeriodicBriefing` | briefing.js | 🟢 |
| S5 | Milestone learning report | reports.js `buildTradeReport` | reports.js (sama T4) | 🟢 |
| S6 | Trackers (SOL & PnL/Net) — embedded di T7/T8/R5 | sol-tracker.js:166→`renderSolTracker`; pnl-tracker.js:74→`renderPnlTracker` | views/trackers.js:32/72 | 🟢 |

---

## 2. Tabel coverage — rekap status

**Total titik-render terenumerasi: ~55** (T1–T28, R1–R14, C1–C8, N1–N4, L1–L3, S1–S6).
Buang yang netral/no-message (R3 go, R4 stop, R14 free-chat) → **~52 pesan user-facing**.

| Status | Jumlah | Daftar ringkas |
|---|---|---|
| 🟢 BARU (views / design-aligned) | **~33** | T1-T5,T7,T8,T10,T11,T13,T14,T22-T27; R6,R7,R8; C1,C3,C4,C5,C6; N1-N4; L1,L2,L3; S3,S4,S5,S6 |
| 🔴 LAMA inline | **~17** | T6,T9,T12,T15-T21,T28; R1,R2,R5,R9,R10,R11,R12,R13; C2,C8; S1,S2 |
| 🟡 CAMPUR / teks-LLM | **~2** | C7 (report screening = teks LLM), C8 envelope (judul inline membungkus body 🟢) |

> Catatan: `/preset` (T12/R13) saya hitung 🔴 karena `preset-manager.js` tak pakai views — tapi outputnya konsisten antar-surface (satu builder), jadi gap-nya "belum tree-style", BUKAN "divergen surface".

---

## 3. Daftar JALUR-GANDA (deliverable inti — sumber gap kayak `/screen`)

Satu pesan logis dirender di >1 tempat dgn gaya beda. Diurut prioritas.

### 🔴 JG-1 — "No candidates" (EMPAT rendering berbeda) ⭐ gap utama
| Permukaan | Render | Gaya | Teks |
|---|---|---|---|
| Cycle otomatis | `buildNoCandidates` (C4) | 🟢 tree | `⏭️ No candidates available\n━━…\nFiltered examples:\n├ …` |
| TG `/screen` | `runDeterministicScreen` (T19) | 🔴 inline | `No candidates available.\nFiltered examples:\n- name: reason` |
| REPL `/candidates` | `formatCandidates` (R9) | 🔴 inline | `  No eligible pools found right now.` |
| TG `/candidates` | `describeLatestCandidates` (T20) | 🔴 inline | `No cached candidates yet. Run /screen first.` |
**Fix:** ketiga jalur manual tinggal panggil `buildNoCandidates({examples,...})` dari views/cycle.js.

### 🔴 JG-2 — "Daftar kandidat" (EMPAT format berbeda)
| Permukaan | Render | Gaya | Bentuk |
|---|---|---|---|
| Cycle otomatis | LLM free text (C7) | 🟡 | alasan deploy/no-deploy LLM |
| TG `/screen` | `runDeterministicScreen` (T19) | 🔴 | `Top candidates (N)\n\n1. name \| pool\n  fee/aTVL…` |
| TG `/candidates` cache | `describeLatestCandidates` (T20) | 🔴 | `Latest candidates (N) — updated …\n1. name \| fee/aTVL…` |
| REPL `/candidates` fetch | `formatCandidates` (R9) | 🔴 | tabel ber-header padding `# pool fee/aTVL vol …` |
**Fix:** satu `buildCandidateList(candidates)` di views/cycle.js (atau views baru `candidates.js`), dipanggil 3 jalur. Catat semantik beda (cache vs fetch) di pemanggil, format disamakan.

### 🔴 JG-3 — Lone "NO DEPLOY"
| Permukaan | Render | Gaya |
|---|---|---|
| Cycle otomatis | `buildLoneNoDeploy` (C5) | 🟢 `⛔ NO DEPLOY` tree |
| TG `/deploy <n>` (kandidat tunggal) | `deployLatestCandidate` throw `NO DEPLOY: only cached candidate…` (index.js:2840) → systemView.renderError | 🔴 plain error |
**Fix:** /deploy lone-skip bisa render via `buildLoneNoDeploy` alih-alih throw mentah.

### 🔴 JG-4 — Reply CLOSE
| Permukaan | Render | Gaya | Detail |
|---|---|---|---|
| TG `/close <n>` | inline (T15) | 🔴 | `✅ Closed pair\nPnL: ◎/$X \| close txs:…` (1-baris, solMode-aware) |
| Notif (post-hook/Lever-A) | `renderClose` (N2) | 🟢 | dekomposisi Fee/Efek-harga/Gas, both-unit, lesson |
**Fix:** /close reply boleh ringkas, TAPI notif sudah lengkap → pertimbangkan /close cukup ack singkat + biarkan N2 yang detail (hindari dobel vocab "PnL").

### 🔴 JG-5 — Reply DEPLOY (potensi DOBEL PESAN)
| Permukaan | Render | Gaya |
|---|---|---|
| TG `/deploy <n>` | inline array.join (T21) | 🔴 `✅ Deployed name\nPool…\nAmount…` |
| Notif post-hook | `renderDeploy` (N1) | 🟢 |
`deployLatestCandidate` lewat `executeTool("deploy_position")` → post-hook `notifyDeploy` (executor.js:797). Guard `hasActiveLiveMessage()` di N1 = **false** untuk `/deploy` manual (tak ada live message) → **notif N1 DAN reply inline T21 dua-duanya kirim** = pesan dobel. (Bandingkan cycle otomatis: live aktif → N1 di-skip, cuma tool-line.)
**Fix:** /deploy cukup andalkan N1; reply inline jadi ack singkat saja (atau di-suppress).

### 🔴 JG-6 — `/status` TG vs REPL (divergen besar — gap §D-1 inventory)
| Permukaan | Render | Gaya |
|---|---|---|
| TG `/status` | `statusView` (T7) | 🟢 kaya (wallet/slot/rent/OpenRouter/all-time/learning/pnl) |
| REPL `/status` | inline console (R5) | 🔴 minim (cuma wallet+posisi+pnlBlock+disclosure) |
**Fix:** REPL bisa `render(statusView.buildView(...), "plain")` — dispatcher sudah dukung target `"plain"` (render.js:43-49). Tinggal feed data yang sama.

### 🔴 JG-7 — `/config` tiga-varian (core ketinggalan)
| Varian | Render | Gaya |
|---|---|---|
| `/config` (function) | `render(configView mode:function)` (T11) | 🟢 |
| `/config origin` | `render(configView mode:origin)` (T10) | 🟢 |
| `/config core` | `formatCoreConfig` inline (T9) | 🔴 |
**Fix:** tambah `mode:"core"` di views/config.js, atau biarkan (core = ringkas sengaja). Prioritas rendah (tampilan beda by-design).

### 🟡 JG-8 — Cycle fail: mgmt vs screening
- Mgmt catch (C2) = inline `Management cycle failed: …`; Screening catch (C6) = `cycleFail(…)`.
**Fix:** mgmt catch panggil `cycleFail()` juga (1 baris).

### ✅ Jalur-ganda yang SUDAH sinkron (tak perlu kerja)
- `/briefing` TG (T3) vs REPL (R6) — satu sumber `generateBriefing`, beda cuma pin vs strip. ✅
- `/report` TG (T4) vs REPL (R7) — satu sumber `buildReportForArg`. ✅
- `/guide` TG (T2) vs REPL (R8) — satu `renderGuide`. ✅
- `/preset` TG (T12) vs REPL (R13) — satu `runPresetCommand` (cuma belum tree-style, tapi konsisten). ✅
- Daily/weekly/milestone (S3/S4/S5) vs `/briefing`/`/report` (T3/T4) — reuse `buildTradeReport`/`generateBriefing`. ✅
- Posisi: `/positions` (T13 🟢) & mgmt-cycle per-posisi (C1 🟢) — builder beda (positionsView vs buildMgmtReport) tapi **dua-duanya tree-style**, jadi gaya konsisten walau bukan satu builder. (REPL /status R5 per-posisi 🔴 = lihat JG-6.)

---

## 4. Cross-check ke inventory awal

### vs `telegram-message-index.md` (35 baris)
Index awal **under-count** karena:
1. **REPL nyaris tak masuk index** (index "telegram-only"): R1 angka-pick, R2 auto, R5 /status, R9 /candidates-fetch, R10 /thresholds, R11 /learn, R12 /evolve = 7 titik render REPL tak terindeks.
2. **`/config` di-collapse jadi 1 baris** (#21 "/config · /config core") — realita **3 varian** (function/origin/core) dgn 2 builder berbeda. Kurang 2.
3. **`/briefing alltime`** (sub-command, T3/R6) tak dibedakan.
4. **Sub-branch render dalam satu command tak dihitung**: /screen & /candidates di-treat 1 baris (#2,#3), padahal masing-masing punya cabang "ada kandidat" vs "no candidate" yang JADI jalur-ganda dgn cycle.
5. **Mgmt catch-fail (C2)** & **cycle envelope (C8)** tak terpisah sebagai titik inline.
6. Index #14 nandai `/positions` PILOT "✅ migrasi" — kini SEMUA position-view (T7,T8,T13,T14) + notif (N1-N4) + cycle (C1,C3-C6) + confirm (L2,L3) + live (L1) **sudah** migrasi (jauh melewati snapshot index).

### vs `command-surface-inventory.md`
- §D-1 (/status TG≫REPL), §D-2 (/candidates semantik beda), §D-6 (/stop TG no-handler), §D-7 (banner REPL out-of-date) **MASIH BERLAKU** semua.
- §D-6 `/stop` TG: dikonfirmasi masih tak ada handler di telegramHandler (2896-3355) → jatuh ke LLM. (REPL R4 ada.)
- Yang BERUBAH sejak inventory: line number semua geser; `/config` nambah varian `function`/`origin`; sebagian besar money-view sudah tree.

---

## 5. Verdict

- **Total permukaan output terenumerasi: ~52 pesan user-facing** (+ 3 neutral).
- **Sudah BARU (🟢): ~33** — semua money-view utama TG (/status,/wallet,/positions,/pool,/config[2 varian]), notif (4), cycle JS-scaffold (mgmt+screening skip/fail/no-cand/lone), confirm (2), live-stream, system (help/hive/pause/resume/queue/error), report/briefing/guide/milestone (design-aligned), trackers.
- **Masih LAMA (🔴): ~17** — daftar:
  - **TG:** `/screen` (T19), `/candidates` cache (T20), `/deploy` reply (T21), `/close` (T15), `/closeall` (T16), `/set` (T17), `/setcfg` (T18), `/config core` (T9), `/preset` text (T12), `/wallet trackstart` (T6), error/teks inline sisa (T28).
  - **REPL:** `/status` (R5), `/candidates` fetch (R9), `/thresholds` (R10), `/learn` (R11), `/evolve` (R12), angka/auto (R1/R2), `/preset` (R13).
  - **Cycle/sistem:** mgmt catch-fail (C2), envelope judul cycle (C8), gasReserve auto-tune (S1), suspect alert (S2).
- **Jalur-ganda belum-sinkron: 8** (JG-1…JG-8); 6 di antaranya prioritas (JG-1 s/d JG-6).

### Estimasi sisa kerja redesign (builder reuse)
| Gap | Builder reuse | Effort |
|---|---|---|
| JG-1 No-candidates (T19/T20/R9) | `buildNoCandidates` (views/cycle.js) sudah ada | KECIL (panggil ulang, ~3 titik) |
| JG-2 Candidate-list (T19/T20/R9) | belum ada → bikin `buildCandidateList` baru (views/cycle.js / views/candidates.js) | SEDANG (1 builder + 3 pemanggil) |
| JG-3 Lone-no-deploy (T21) | `buildLoneNoDeploy` sudah ada | KECIL |
| JG-5 Deploy dobel (T21) | andalkan `renderDeploy` (N1), reply jadi ack | KECIL |
| JG-4 Close reply (T15) | andalkan `renderClose` (N2), reply jadi ack | KECIL |
| JG-6 /status REPL (R5) | `render(statusView.buildView, "plain")` — dispatcher sdh dukung | KECIL-SEDANG |
| JG-7 /config core (T9) | tambah `mode:"core"` di views/config.js | SEDANG (opsional) |
| JG-8 mgmt catch (C2) | `cycleFail()` | TRIVIAL |
| C8 envelope judul | konstanta judul di views/cycle.js | TRIVIAL |
| T15/T16/T17/T18/T6/S1/S2 ack/sistem | string pendek → format.js `ICON`/`header` | KECIL (kosmetik) |
| R10/R12 (REPL-only) | `views/` plain-render | SEDANG (REPL-only, prioritas rendah) |

### Flag rawan-upstream vs aman
- **🔴 RAWAN upstream** (kode "yunus"/dev original, bisa berubah saat pull — sebagian besar gap 🔴 ADA DI SINI):
  - `index.js` body handler: `telegramHandler`, `rl.on("line")`, `runScreeningCycle`, `runManagementCycle`, `runDeterministicScreen` (T19), `formatCandidates` (R9), `describeLatestCandidates` (T20), `deployLatestCandidate` (T21), `formatCoreConfig` (T9), envelope cycle (C8), mgmt catch (C2). Semua inline LAMA hidup di `index.js` → **edit di sini = risiko konflik merge tinggi**.
  - `telegram.js` `createLiveMessage` (L1) — shared, tapi tinggal ICON (tipis).
  - `lessons.js` suspect alert (S2) — shared engine.
- **🟢 AMAN** (file Zen/views, konflik rendah):
  - `views/*.js` (cycle, notifs, format, settings, status, wallet, pool, config, system, trackers, render), `sol-tracker.js`, `pnl-tracker.js`, `guide.js`. Builder baru/reuse taruh di sini.

### Rekomendasi urutan vs upstream-merge
- **Sebelum merge (cepat, low-risk, high-value):** JG-8 (cycleFail), C8 (judul konstanta), JG-1 (reuse buildNoCandidates) — semua nambah panggilan builder views yang SUDAH ada, perubahan di index.js minim & lokal.
- **Bisa setelah merge:** JG-2 (builder baru), JG-6 (/status REPL plain), JG-7 (/config core), kosmetik ack T15-T18. Karena ini sentuh body handler index.js (rawan konflik), lebih aman dikerjakan SETELAH pull supaya tak rebase dua kali.
- **Catatan strategi:** karena hampir semua 🔴 tersisa ada di `index.js` (zona rawan), pertimbangkan **ekstrak helper render ke views/ dulu** (file aman), lalu handler index.js cukup panggil 1 baris — meminimalkan footprint diff yang bentrok dgn upstream.

---

**STOP — RECON saja. Nol ubah kode, nol restart.**
