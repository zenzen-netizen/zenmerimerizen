# PLAN AUDIT MENDALAM MERIDIAN — 33 Fase + Index

> Disusun: 2026-07-06 · Branch `experimental` · Read-only audit · Parital-resumable
> Tujuan: paham bot mendalam — arsitektur, hulu→hilir, sinkron antar-code, logic, cara kerja, failure mode.
> Pendamping: `notes/TUTORIAL-audit-meridian.md` (cara operasi dari terminal).
> Output audit: `notes/audit-F0-peta.md` … `notes/audit-F33-edge-leaf.md` + `notes/audit-INDEX.md`. Versi awam dengan §0: `notes/awam/audit-F<N>-*.md`.

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Inspektur rumah inheritance 33-kamar*: bos baru warisi rumah besar 33 kamar. Tiap kamar = 1 bagian bot (cron, deploy, safety, close, learning, briefing). Bos tak bisa begini dari tamu depan — ia harus keliling kamar satu per satu, catat apa isinya, kenapa kamar ini ada di posisi ini, pintu mana nyambung ke mana. Tiap kamar diaudi 1 lapis; catat hasil di buku kamar masing-masing. Kalau bos terhenti di kamar 7, lanjut besok buka buku kamar 7. Lapis demi lapis, akhirnya bos punya peta rumah hidup + tahu kamar mana retak, mana perlu renovasi. Audit ini konsep yang sama: 33 fase = 33 kamar, tiap fase = note tersendiri, partial-resumable.
- *Arkeologi strata kota tua*: kota telah dilapis-lapis berton-tahun. Tiap lapisan punya zaman + teknologi sendiri. Arkeolog tak gali semua sekaligus — mulai lapisan atas (pondasi), turun perlahan ke inti (on-chain), ke lapisan belajar (learning), ke lapisan presentasi (UI). Tiap galian dicatat dengan foto + letak + bukti. Audit belajar dari strata sebelumnya, jangan gali bodoamat. Hasil = peta peradaban kota: siapa panggil siapa, kapan, kenapa. Fase Meridian konsep sama: gelombang 1 pondasi atas → 2 safety → 3 on-chain → 4 screening → 5 state → 6 learning → 7 analytics → 8 config → 9 telegram → 10 edge. Tiap note fase = catatan galian 1 strata.

**Di bot, ini = plan meta-audit 33 fase + index** (1-2 kalimat)
File ini BUKAN note fase. = peta master: tujuan audit, prinsip, 33 fase daftar + kedalaman + file kunci + output filename, template struktur tiap note fase, hasil akhir. Note fase (output) pake §0 sendiri; plan ini pake §0 disini supaya pemilik non-programmer tau MENGAPA audit 33 fase + bagaimana struktur tiap fase, sebelum baca tabel teknis.

**Posisi file ini di alur audit** (1 paragraf)
PLAN = langkah #1 sebelum mulai: baca dulu sebelum mulai audit F0. Bila pemilik non-programmer baca langsung tabel 9 gelombang + 34 baris fase, ia akan tenggelam jargon (cron, deploy, OOR, fail-open, getModePerformance). §0 memberi konteks analogi dulu. Setelah paham analogi, tabel 33 fase jadi navigasi; tiap baris fase punya output filename (`audit-F<N>-*.md`) = kamar yang akan digali. TUTORIAL (`TUTORIAL-audit-meridian.md`) = pendamping operasional (cara mulai/resume dari terminal).

**Langkah kerja pembaca** (5 nomor, pakai istilah teknis)
1. Baca §0 ini → paham kenapa audit 33 fase + analogi kamar-rumah + arkeologi-strata.
2. Lompat ke **BAGIAN 1** untuk tujuan eksplisit + 8 prinsip (read-only, parital-resumable, progresif, bukti `file:line`, caveman mode, koreksi on-the-fly, §0 per fase, folder dua-lapis).
3. Lihat **BAGIAN 2** untuk legend kedalaman (⬛⬛ mandatory deep 25-40k token / ⬛ deep 15-25k / sedang 10-15k).
4. Buka **BAGIAN 3** tabel 33 fase + index — ini peta jalan. Tiap baris: F<nomor> | nama | file kunci codebase | kedalaman | output note filename. Kerjakan berurutan gelombang (bukan nomor).
5. Mulai sesi audit: buka `TUTORIAL-audit-meridian.md` → ikuti step-by-step (perintah `mulai audit F<N>` / `lanjut audit F<N>` / `resume audit dari note F<N-1>` / `ringkasan progress audit`).

**Output plan ini**: pemilik kuasai peta 33 fase + struktur tiap note + prinsip audit + kedalaman legend + template §A-§H. Bila terhenti, resume lanjut (file = parital-resumable). Cross-ref tiap note fase kembali ke tabel BAGIAN 3 di file ini.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
PLAN ini statis — tak ada kode yang bisa rusak. Skip bemua = pemilik pkai jargon teknis (cron, deploy, OOR) tanpa map → keterisan dlm analogi panjang saat baca note fase. Skip BAGIAN 3 saja = tak tahu urutan gelombang + output nama file → note asal-save, partial-resume pecah. BAGIAN 4 skip = struktur tiap note fase kacau (tak ada Progress / §0 / §A-§H konsisten) → resume tak bisa baca "## Progress" last-[x].

**Istilah yang muncul di file ini** (bullet, cuma yang baru)
- **Fase F<N>** — ID permanen cross-ref antar note. Nomor urut nominal; eksekusi via gelombang.
- **Gelombang eksekusi** — 10 urutan + index. Pondasi atas → safety → on-chain → screening → state → learning → analytics → config → telegram → edge → index.
- **Kedalaman legend** — ⬛⬛ mandatory deep (risk tinggi / cross-file / config auto-write / full-sync 6-surface) / ⬛ deep (density sinkron) / sedang (mekanis-matematis).
- **Parital-resumable** — tiap note fase berdiri sendiri; resume baca "## Progress" OK.
- **Bukti `file:line`** — tiap klaim teknis harus sitasi file:line codebase. `UNKNOWN` bila tak pasti.
- **Full-sync 6-surface** — kontrak: fitur config baru kariwiring CONFIG_MAP/definitions/formatFullConfig/renderSettingsMenu/BOT_COMMANDS/SETTINGS-GUIDE.
- **paper/live isolation** — kontrak: sim data (`paper:true` tag) tak pernah contaminate live stats/evolve/weights/hive.
- **racikan = snapshot sekali-muat** — preset = file snapshot, bukan aturan terus-dipaksa.

*Lewati §0 kalau sudah paham. Isi teknis mulai BAGIAN 1.*

---

## BAGIAN 1 — TUJUAN & PRINSIP

**Tujuan:** pemilik repo non-programmer paham Meridian end-to-end: arsitektur 6-lapisan, alur 1 trade dari buka→jaga→tutup→belajar→evolusi, sinkronisasi antar file (siapa-panggil-siapa, kapan dipicu, data lewat field apa, fail-mode apa), bug + gap terdokumentasi, kontrak kunci (hard-rule mekanis vs soft-signal AI, paper/live isolation, full-sync 6-surface, racikan = snapshot sekali-muat).

**Prinsip:**
1. **Read-only** tiap fase. Tak ada edit kode/config. Output cuma note fase.
2. **Parital-resumable** — tiap fase berdiri sendiri, dapat lanjut sesi berbeda. Resume cukup buka note fase.
3. **Bangun progresif** — gelombang eksekusi: pondasi atas → on-chain hulu → on-chain hilir → belajar → output → persistensi → UI → edge.
4. **Bukti `file:line`** di tiap klaim. `UNKNOWN` kalau tak pasti dari kode.
5. **Caveman mode** aktif → hemat token ~40-50% (aturan skill: code/commit/security warning tetap normal English).
6. **Mekanisme koreksi on-the-fly** — kedalaman fase bisa naik/turun saat mulai kalau over/under. Fase berikutnya ikut pelajaran.
7. **Tiap note = teknis + bahasa awam berdampingan.** Wajib `## §0. Cara Kerja (Bahasa Awam)` di awal (sebelum `## §A`), gunanya: pemilik non-programmer paham isi bot end-to-end. ~600-1000 kata/fase (lebih untuk F0 karena fondasi). Format: 2 analogi sehari-hari (konkrit), setelahnya istilah teknis biasa (cron, deploy, OOR, fail-open dst) supaya pembaca belajar subjek asli, bukan keterisan di analogi. Detail format di BAGIAN 4.
8. **Folder output dua-lapis.** File teknis bersih → `notes/audit-F<N>-*.md` (tak sentuh oleh retro-fit awam). File versi awam (full copy + §0) → `notes/awam/audit-F<N>-*.md`. Original jadi rujukan teknis bersih. Fase baru (F12+) langsung tulis ke `notes/awam/`.

---

## BAGIAN 2 — KEDALAMAN LEGEND

| Tag | Arti | Estimasi token | Kriteria |
|-----|------|----------------|----------|
| ⬛⬛ | **Mandatory deep** | 25-40k | Risk tinggi / cross-file bug / kontrak kunci / mengubah config otomatis / full-sync 6-surface |
| ⬛ | **Deep** | 15-25k | Density fungsi tinggi / lintas-lapisan / reasoning sinkron penting |
| sedang | sedang | 10-15k | Mekanis-matematis / well-documented / fungsi tunggal |

**Mekanisme koreksi:** saat mulai tiap fase, agent sebut dulu "dalaman: ⬛ / ⬛⬛, alasan X". Kalau over (ternyata mekanis-trivial) → turun. Kalau under (ternyata padat sinkron + reasoning) → naik. Fase berikut ikut pelajaran.

---

## BAGIAN 3 — TABEL 33 FASE + F34 INDEX

Eksekusi berurutan gelombang (bukan nomor fase). Nomor fase = ID cross-ref permanen.

### Gelombang 1 — Pondasi atas (F0-F6)
| F | Nama | File kunci | Kedalaman | Output |
|---|------|------------|-----------|--------|
| F0 | Peta + temuan lama + glosarium | peta-proyek.md, roadmap.md, CLAUDE.md, audit-progress, output-racikan-audit | sedang | `audit-F0-peta.md` |
| F1 | Cron orchestration + entry + race guard | index.js entry, `startCronJobs` (1046-1191), PnL poll 3s, `_screeningLastTriggered`, ecosystem.config.cjs | sedang | `audit-F1-cron.md` |
| F2 | 2 siklus inti | index.js `runManagementCycle` (339), `runScreeningCycle` (555), hard-guards (max-pos/SOL/market-regime) | ⬛ | `audit-F2-cycles.md` |
| F3 | Aturan exit mekanis NO-AI | index.js `getDeterministicCloseRule` (1255-1298), `getIndicatorExitSignal`, `computeBinsBelow` (1361-1369), `maybeAutoTuneGasReserve` (277) | sedang | `audit-F3-exits.md` |
| F4 | Otak AI ReAct + role gating + fallback | agent.js (535), role filter SCREENER/MANAGER/GENERAL (baris 6-8), fallback 502/503/529, `LLM_FALLBACK_BASE_URL` | ⬛ | `audit-F4-brain.md` |
| F5 | SOP prompt + racikan injection | prompt.js (201), `racikanRules(role)`, `getTimeProfileForPrompt`, narrative line | sedang | `audit-F5-prompt.md` |
| F6 | Tool schema (menu LLM) | tools/definitions.js (1173), definisi 30+ tool, `update_config` param schema | sedang | `audit-F6-definitions.md` |

### Gelombang 2 — Safety + post-close (F7-F8)
| F7 | Pre-deploy safety checks | tools/executor.js safety: bin step/max-pos/dup pool/dup token/single-side/range-floor `minBinsBelow≥35`/SOL balance, `WRITE_TOOLS`, dispatch `toolMap` | ⬛⬛ | `audit-F7-safety.md` |
| F8 | Post-close + CONFIG_MAP full-sync | executor.js auto-swap token→SOL, `recordPerformance` trigger, `update_config`, `CONFIG_MAP` 6-surface (CONFIG_MAP, definitions, formatFullConfig, renderSettingsMenu, BOT_COMMANDS, SETTINGS-GUIDE) | ⬛⬛ | `audit-F8-postclose.md` |

### Gelombang 3 — On-chain (F9-F13) — SEMUA ⬛⬛
| F9 | Deploy + rent bug | tools/dlmm.js `deployPosition` (645-833), `assertRangeDoesNotRequireBinArrayInitialization` (489-540), `assertNoInitializeBinArrayInstructions` (542), base factor fee (1077), **rent posisi refundable ~0.057 SOL tak dicadangkan executor.js:1016-1024** | ⬛⬛ mandatory | `audit-F9-deploy.md` |
| F10 | Close relay + public + claim + gap | dlmm.js `closePosition` relay (2136) + public (2430), `claimFees`, gap trigger-vs-realisasi warning (notifyClose), `recordPerformance` dipicu (2430) | ⬛⬛ | `audit-F10-close.md` |
| F11 | Positions list + in-range/OOR | dlmm.js `getMyPositions`, `markInRange`/`markOutOfRange`, OOR time accrual, `/positions` `:3292-3298` | ⬛ | `audit-F11-positions.md` |
| F12 | PnL tutup compute | dlmm.js PnL tutup (2337-2408), baca API Meteora closed, `final_value_usd`, `fees_earned_usd`, `pnl_usd/pct`, `range_efficiency` | ⬛⬛ | `audit-F12-pnl-close.md` |
| F13 | DRY_RUN + paper lifecycle + isolation | dlmm.js paper cabang (776/1209/1420-1598/1604/1964), `trackPosition` virtual `paper_…` id, `getPaperPositions`, `computePaperMetrics`, **paper/live isolation contract** (`paper:true` tag — `getModePerformance`, `evolveThresholds`, hive, briefing counts semua honor tag) | ⬛⬛ mandatory | `audit-F13-paper.md` |

### Gelombang 4 — Screening (F14-F16)
| F14 | Meteora screening funnel | tools/screening.js (872) `getTopCandidates`, hard-guard `runScreeningCycle` (555), `blockedLaunchpads` enforcement, candidate inject ke prompt SCREENER | ⬛ | `audit-F14-meteora.md` |
| F15 | Indicator gate + bundler + momentum/yield/sw injection | screening.js indicator entry gate (780), chart-indicators preset `confirmIndicatorPreset`, `rejectAlreadyAtBottom`; token.js bundler detect (`maxBundlersPct`/`maxTop10Pct`, `botHoldersPercentage`); screening.js momentum/yield/sw_momentum injection ke candidate block | ⬛ | `audit-F15-indicator-bundler.md` |
| F16 | GMGN alt path + chart indicators + smi | tools/gmgn.js (754) `checkBounceSetup`, `config.gmgn.indicatorRules`; chart-indicators.js (366) 8 preset entry/exit; smi.js (166) client-side `supertrend_plus_smi`; wallet.js quote impact | ⬛ | `audit-F16-gmgn-indicators.md` |

### Gelombang 5 — State (F17-F18)
| F17 | State registry + record shape + peak/trough | state.js `makePositionRecord` (60-135), `trackPosition` (140-157), peak/trough field, baca/tulis `state.json` | ⬛ | `audit-F17-state-registry.md` |
| F18 | Mekanis exit poll — jantung risk | state.js `updatePnlAndCheckExits` (473-589): SL (540), trailing (548), OOR (563), low-yield (574); **NO-AI hard rules, evaluasi tiap PnL poll** | ⬛⬛ mandatory | `audit-F18-mekanis-exits.md` |

### Gelombang 6 — Learning (F19-F23) — SEMUA ⬛⬛
| F19 | Capture belajar | lessons.js `recordPerformance` (147-205), `recordPoolDeploy` (223-247), `derivLesson` (208/288), `paper:true` stamp isolation | ⬛⬛ | `audit-F19-capture.md` |
| F20 | evolveThresholds — **MANDATORY DEEP** | lessons.js `evolveThresholds` (253-259) tiap 5 close LIVE, mutasi `minFeeActiveTvlRatio`+`minOrganic` → tulis balik `user-config.json` via `reloadScreeningThresholds`; **Tak filter `active_setup` → 84 record lama campur 61 mainzen_v2** | ⬛⬛ mandatory | `audit-F20-evolve.md` |
| F21 | Darwin + signal-weights | lessons.js `recalculateWeights` (262-268) jika `config.darwin.enabled`, signal-weights.js (336) recalc, `getWeightsSummary` inject prompt (agent.js:216); **`darwinRecalcEvery` config mati — pemicu konstanta `MIN_EVOLVE_POSITIONS=5`** | ⬛⬛ | `audit-F21-darwin.md` |
| F22 | Profile + lesson prompt | lessons.js `getHourlyProfile`/`getNarrativeProfile` via `getModePerformance` (834), `classifySession`, `getTimeProfileForPrompt` (prompt.js), `getLessonsForPrompt`, mode-scoped `paper:true` filter; **`getModePerformance` paper/live isolation** | ⬛⬛ | `audit-F22-profile-prompt.md` |
| F23 | Memory stores | pool-memory.js (422) riwayat+snapshot per-pool, candidate-memory.js (209) momentum/sw/counterfactual, decision-log.js (68) audit, smart-wallets.json KOL, `getDeployedPoolAddresses` | ⬛⬛ | `audit-F23-memory.md` |

### Gelombang 7 — Analytics & display (F24-F25)
| F24 | Stats engine | reports.js `computeTradeStats` (30-155) PF/DD/payoff/expectancy/by-tier/movement, `classifyCloseRule` (163-174), `buildVerdict`, `buildRecommendations` (display-only), shrunk-expectancy ranking (209-231) | ⬛ | `audit-F24-stats.md` |
| F25 | Briefing + milestone + trackers + cost net | briefing.js `generateBriefing` (271) + periodic (378), `sendAndPinBriefing` (186), `maybeFireLearningReport` (index.js:207), `buildSkipReviewSection` (243); pnl-tracker/gas-tracker/llm-cost-tracker/sol-tracker; `buildRoleCostLines`, `estimateGasSol`, cost net-vs-all | ⬛⬛ | `audit-F25-briefing.md` |

### Gelombang 8 — Config (F26-F29) — SEMUA ⬛⬛
| F26 | Config core | config.js (666) load `user-config.json` + defaults 165-key, `computeDeployAmount` compounding formula (`clamp(deployable × positionSizePct, deployAmountSol, maxDeployAmount)`), singleton live, `paths` resolve | ⬛⬛ | `audit-F26-config-core.md` |
| F27 | Conviction + indicators + GRUP 16 flags | config.js `applyConvictionSizing` re-clamp `[deployAmountSol, maxDeployAmount]`, indicators config (entry enabled default, exit opt-in, `rejectAlreadyAtBottom` opt-in), experiments GRUP 16 semua flag default OFF + fail-open: exitLiquidity/momentum/conviction/yield/sw_momentum/counterfactual/narrative/paper/usePaperHistory | ⬛⬛ | `audit-F27-experiments.md` |
| F28 | update_config + reload + normalizePromptNotes | config.js `update_config` (519) tulis-balik `user-config.json`, `reloadScreeningThresholds` (531) re-baca tanpa restart, `normalizePromptNotes` (per-role object vs array), `racikanRules(role)` prompt injection; updates config eksperimen trigger cron restart | ⬛⬛ | `audit-F28-update-config.md` |
| F29 | Preset + envcrypt + addprofil + paths + schema | preset-manager.js (190) `applyPreset` backup-swap (133), `getActiveSetupStatus` "edited" flag (154); envcrypt.js (128) per-profil isolation; addprofil.js (169) scaffolder; racikan-export (113) + profil-export (118); paths/repo-root; config-schema.js (285) + config-origin.js (578) 165-key strip | ⬛⬛ | `audit-F29-preset-paths.md` |

### Gelombang 9 — Telegram (F30-F31)
| F30 | Telegram transport + perintah core | telegram.js (622) `startPolling`/`getUpdates` (453-559), `notifyDeploy`/`notifyClose`/`notifySwap`/`notifyOutOfRange`; index.js handler `/positions`:3287 `/close <n>` `/set <n>` `/wallet`:3219 `/status` `/report`:3205 + CLI:3703 + `requestConfirmation` (1807), akun casual chat safety | ⬛⬛ | `audit-F30-telegram-cmd.md` |
| F31 | Telegram config UI | index.js `formatFullConfig` (1474-1693) 15-grup; `formatCoreConfig`; `renderSettingsMenu` (1944-2191) button menu + `settingValue` (1706) + `pageForKey` (1931); `applySettingsMenuCallback` (2212) + toggles/steps/inputs; `/preset` button page + `/guide`; **full-sync 6-surface check** | ⬛⬛ | `audit-F31-telegram-ui.md` |

### Gelombang 10 — Edge + leaf (F32-F33)
| F32 | Paper full lifecycle + isolation + usePaperHistory | paper-trading.js (216) — math murni `simulatePaperMetrics` (import config only, no SDK, no circular), `trackPosition` virtual `paper_…` id, `markInRange/markOutOfRange` sinkron, `closePaperPosition` → `recordPerformance` `paper:true` tag; `usePaperHistoryWhenLive` LIVE-only opt-in (`getLessonsForPrompt` inject paper-derived 🧪 flagged, excluded evolve/weights/reports/hive) | ⬛ | `audit-F32-paper-lifecycle.md` |
| F33 | Hivemind + KOL + leaf | hivemind.js (367) sync non-paper only, `HIVE_MIND_URL`/`HIVE_MIND_API_KEY`; smart-wallets.js (102) KOL/alpha tracker; setup.js wizard (500); tools/study.js LPer API (159); token-blacklist.js (104) + dev-blocklist.js; strategy-library.js (140); Discord listener kerangka OFF (`useDiscordSignals=false`) | ⬛ | `audit-F33-edge-leaf.md` |

### Index (F34)
| F34 | INDEX + glosarium master | lintas-fase ringkasan + open-Q aggregated + glosarium semua istilah + diagram alur master hulu→hilir 1 trade | sedang | `audit-INDEX.md` |

**Total: 34 file (33 fase audit + 1 index).**

---

## BAGIAN 4 — TEMPLATE NOTE FASE

Tiap `notes/audit-F<N>-<nama>.md` ikut struktur ini (ringkas, ~800-1500 baris):

```markdown
# Audit F<N> — <nama>
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ / ⬛ / sedang — alasan: <X>
> Cross-ref: F<N-1>, F<N+1>, F<M> (jika relevan)

## Ringkasan eksekutif (5 baris)

## Progress
- [x] Outline ditulis (date)
- [x] Bagian A selesai
- [ ] Bagian B dst.
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit <date>
<!-- Tulis lebih awal supaya aman kena limit. Resume baca sini. -->

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *<sehari-hari #1 — konkrit, sudut A>*
- *<sehari-hari #2 — konkrit, sudut B, complemen>*

**Di bot, ini = <istilah teknis fase>** (1-2 kalimat)
<map analogi → subject asli; pembaca langsung tau terminologi>

**Posisi fase ini di alur bot** (1 paragraf)
<datang setelah APA, sebelum APA, kenapa fase ini HARUS di titik itu>

**Langkah kerja** (5-10 nomor, pakai istilah teknis)
1. <trigger — cron/close/chat>
2-N. <langkah; terminologi teknis dipakai (cron, deploy, OOR, fail-open, PROTECTED_TOOLS dst.)>
N. <output ke fase berikutnya>

**Output <kode fungsi fase>**: <bentuk result + side-effects + cross-ref ke fase berikut>

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
<konsekuensi konkrit: "SOL masuk pool beracun → rugi" bukan abstrak>

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **term** — arti singkat + analogi mini
- ...

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta file fase ini (tabel file → peran)

## §B. Alur data hulu→hilir (ASCII diagram)

## §C. Sinkron: siapa-panggil-siapa
| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|

## §D. Logika kunci per fungsi
### <fnName> (file:line)
- Apa: <1 line>
- Kapan dipicu: <trigger>
- Output: <bentuk>
- Sinkron: <siapa baca>
- Fail-mode: <skenario>
- Bukti: file:line

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

## §F. Glosarium istilah fase
- <term>: <def>

## §G. Link fase lain (cross-ref)
- F<X>: <hubungannya apa>

## §H. Open-Q (bawa ke fase <…>)
- <pertanyaan terbuka>
```

---

## BAGIAN 5 — HASIL AKHIR (yang lu dapat)

Setelah 34 file selesai, lu kuasai:
1. **Peta arsitektur hidup** 6-lapisan Meridian + file mana di lapisan mana.
2. **Alur hulu→hilir 1 trade** lengkap: cron → screening → AI pilih → safety → deploy → state → poll PnL → exit mekanis → close → record → evolve → Darwin → pool-memory → prompt berubah → cycle.
3. **3 peran AI** (SCREENER/MANAGER/GENERAL) + tool mana boleh dipakai per peran.
4. **Sinkron antar code**: caller→callee `file:line`, trigger, data flow, fail-mode.
5. **Kontrak kunci**: hard-rule mekanis NO-AI vs soft-signal AI; paper/live isolation; full-sync 6-surface; racikan = snapshot sekali-muat bukan aturan terus-dipaksa.
6. **Bug + gap terdokumentasi**: rent posisi tak dicadangkan (F9), loop evolve campur 84 record lama (F20), `darwinRecalcEvery` config mati (F21), Discord listener OFF (F33), paper bug satuan (F13/F32) dst.
7. **Config system**: 165 key, 15 grup display, GRUP 16 experiments default OFF, compounding deploy formula, conviction re-clamp.
8. **Capability**: audit PR sendiri, pilih fase implement sadar sebab-akibat, tuning racikan dengan benar, onboarding orang baru via note (tak baca 23k baris kode mentah).

Plus 1 file `notes/audit-INDEX.md` untuk navigasi semua fase.

---

## BAGIAN 6 — OPERASIONAL

→ Lihat `notes/TUTORIAL-audit-meridian.md` (panduan step-by-step dari terminal: buka opencode, caveman, mulai/resume fase, kena limit, tracking, toggle mode, cheat-sheet).

---

*File ini = meta-plan. Kode/config tak diubah saat menyusun.*