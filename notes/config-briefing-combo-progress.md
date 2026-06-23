# CONFIG TREE + BRIEFING SCOPE — PROGRESS

Bot: MAIN (pm2 id 0 = meridian, /home/ubuntu/meridianzen, branch experimental, LOCAL = sumber kebenaran)
Workstream 🅴 — layer presentasi modular. Display-only, scoping-inti NOL ubah.

- [x] 1  /config: baris key sub-cluster → tree ├/└ (parity 166)
- [x] 2  recon scope briefing (daily + periodik) — seksi + scope + lokasi analisis-dalam
- [ ] 3  /briefing → Opsi B (all-time=stats; racikan-aktif=stats+analisis-dalam; disclosure)
- [ ] 4  /briefing alltime → command BARU Opsi A (all-time JUGA dapat analisis-dalam)

## Catatan/limit-recovery

### FASE 1 ✅ (commit pending di bawah)
- Perubahan SUDAH ada di working tree (revisi kecil yang pending dari sesi lalu) di
  `renderSubclusterRows` (views/config.js:126-175).
- Jalur `marked=true` (view FUNGSI / default `/config`): induk (non-L4) kini pakai tree
  `├` (semua) / `└` (induk TERAKHIR di sub-cluster). Anak `↳` (L4) indent di bawah induk,
  marker ⚙️/🧩 tetap, TIDAK ikut hitungan ├/└ (anak hang di bawah induknya). Header
  sub-cluster (emoji+label) tetap. Divider ┈ dibatasi ke gaya lama (origin).
- Jalur `marked=false` (view ORIGIN / `/config origin`): SENGAJA tetap gaya lama (indent
  4-spasi, ↳ 6-spasi, divider ┈) — origin nesting 4-lapis pakai ┈+indent dalam, jadi tree
  dibatasi ke function-view biar nesting origin tak terganggu (brief membolehkan ini).
- PARITY (bukti `/tmp/parity-config.mjs`): KEY_ORIGIN=166.
  - function: 166 key-line, 152 `├/└` + 14 `↳` = 166, 0 orphan.
  - origin:   166 key-line, 14 `↳` (6-spasi), 0 orphan.
  - L4_CHILDREN=14 utuh. ORIGIN_NOTES inline via `note(k)` di kedua jalur.
- `node --check views/config.js` → OK.

### FASE 2 ✅ recon scope briefing (READ-ONLY)
Baseline: `/tmp/briefing-baseline-FASE2.js` (= working tree pra-FASE3) + `/tmp/briefing-HEAD.js`.

**`generateBriefing` (harian, briefing.js:277-397)** — komposisi `lines[]`:
| Seksi | Scope | Analisis-dalam |
|---|---|---|
| Activity | 24h | — |
| Performance (24h) | 24h | — |
| formatPnlTracker(modePerf) | all-time mode (SEMUA racikan) | tracker |
| formatStatsBlock(statsAll,"All-time (semua racikan)") | All-time semua-racikan | **STATS** |
| buildVerdict(statsAll) | All-time | **DEEP** verdict |
| formatQuantBlock(statsAll) | All-time | **DEEP** quant (RR/BE-WR/EV-R/cost-drag) |
| formatMovement(statsAll) | All-time | **DEEP** movement (price excursion) |
| formatStatsBlock(statsRacikan,racikanLabel) | Racikan aktif (getModePerformance) | **STATS only** |
| racikanScopeDisclosure() | — | disclosure |
| Lessons (24h)/Portfolio/featureStatus/cost/learning/timeProfile/skipReview | mixed | — |
| formatBreakdown(statsAll,{sessions:false}) | All-time | **DEEP** breakdown |
| buildRecommendations(modePerf,statsAll) | All-time | **DEEP** recs |

→ KONFIRMASI: **All-time = SEMUA analisis-dalam** (verdict+quant+movement+breakdown+recs); **Racikan = stats+disclosure saja**. (Hipotesis brief benar.)

**`generatePeriodicBriefing` (week/month/day, briefing.js:406-506)**:
- `buildTradeReport(windowPerf, statsLabel:"Last Xd (semua racikan)")` = window SEMUA-racikan → **DEEP penuh** (stats+verdict+**TREND**+breakdown+recs).
- `formatStatsBlock(racikanWindowPerf, racikanLabel)` = window racikan → **STATS only**.
- + disclosure, pnlTracker, Activity, featureStatus, costBody, timeProfile.
→ Pola sama: window-semua-racikan = deep, racikan = stats. Catatan: TREND eksklusif ke buildTradeReport (buildScopeBlock tak punya).

**Fungsi sumber stats** (reports.js): formatStatsBlock · buildVerdict · formatQuantBlock · formatMovement · formatBreakdown · buildRecommendations · buildTradeReport (komposit, incl TREND).
**Pembangunan 2 blok**: daily → `statsAll=computeTradeStats(modePerf[mode,all-racikan])` vs `statsRacikan=computeTradeStats(getModePerformance()[mode+active-racikan+!suspect])`; periodik → `windowPerf[mode,window,all-racikan]` vs `racikanWindowPerf=getModePerformance().filter(window)`.

**Dispatch** (untuk FASE 4): `/briefing`(exact)→generateBriefing (index.js:3461 TG, :4013 REPL); `/report week|month|day`→generatePeriodicBriefing (index.js:285-287). Help: views/system.js:25-27. BOT_COMMANDS: telegram.js:510-518.

**Rencana FASE 3/4**: helper `buildScopeBlock(perf,label,{deep,quantOpts,recOpts})` (stats selalu; deep→+verdict+quant+movement+breakdown+recs). Daily: all-time `{deep:allTimeDeep}`, racikan `{deep:true}`; hapus breakdown/recs bawah (folded). Periodik: buildTradeReport diretarget ke racikanWindowPerf (deep+TREND), all-racikan jadi stats-only. `generateBriefing({allTimeDeep})` + wrapper untuk `/briefing alltime`.
