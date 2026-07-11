# Audit F21 — Darwin + signal-weights (mandatory deep) — auto-evolve bobot signal
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: satu-satunya penulis-otomatis signal weights ke `signal-weights.json` (boost/decay ratchet, boost ×1.05 / decay ×0.95 dari DEFAULT 1.0, floor 0.3 ceiling 2.5), dispatch tiap 5 close LIVE (`lessons.js:317-322`) gated `config.darwin?.enabled` — INDEPENDEN dari `evolveEnabled` FREEZE; 3 lift computation mode (numeric normalize / boolean win-rate / categorical) atas 13 SIGNAL_NAMES via `signal_snapshot` 15-field F19; rolling window `windowDays=60` + `minSamples=10` gate; quartile split (top 25% boost, bottom 25% decay, middle idle); `getWeightsSummary()` inject ke prompt SCREENER via `agent.js:233-238` + `index.js:1028` (gated sama `darwin.enabled`); **`darwinRecalcEvery` config MATI** — pemicu pakai konstanta `MIN_EVOLVE_POSITIONS=5` di lessons.js:21, tak ada path baca `cfg.darwin.recalcEvery` (signal-weights.js tak baca; lessons.js tak baca). user-config.json live saat audit: darwin undefined → `config.darwin.enabled` default `true` (config.js:318) → Darwin AUTO aktif. 60 recalc sudah terjadi (signal-weights.json recalc_count=60, last_recalc 2026-07-07T05:30:38).
> Cross-ref: F19 (recordPerformance trigger dispatch + livePerf filter + signal_snapshot sumber), F20 (evolveThresholds paralel — toggle `evolveEnabled` FREEZE independen), F22 (getWeightsSummary inject prompt SCREENER + getLessonsForPrompt), F4 (agent.js role gate SCREENER + import dynamic), F26 (config.darwin 8-key defaults), F28 (update_config write path — Darwin section tak ada di CONFIG_MAP executor.js), F15 (signal_snapshot entry fields source), F5 (prompt.js weightsSummary interpolation").

## Ringkasan eksekutif (5 baris)
1. **1 file 336-baris, 1 trigger launch, 1 prompt injection**. `signal-weights.js` (336 baris): recalculateWeights `:100` = penulis auto, getWeightsSummary `:299` = render block teks prompt. Dispatch di `recordPerformance` `lessons.js:317-322`: bila `config.darwin?.enabled` → `await import("signal-weights.js")` + `recalculateWeights(livePerf, config)`. Returns `{changes, weights}`; changes non-empty → log "Darwin: adjusted N signal weight(s)" (`lessons.js:321`). `getWeightsSummary()` dipanggil di 2 titik: `agent.js:233-238` (agentLoop SCREENER build prompt) + `index.js:1028` (runScreeningCycle pre-deploy block) — kedua-duanya gated `config.darwin?.enabled`. Output block teks: 13 baris signal sort-desc weight + bar visual `#####.....` + label [STRONG]/[above avg]/[neutral]/[below avg]/[weak]. Di-inject prompt SCREENER via `prompt.js:157` interpolation `${weightsSummary ? ...}`.
2. **`darwinRecalcEvery` MATI — pemicu = konstanta `MIN_EVOLVE_POSITIONS=5`** (lessons.js:21). Verifikasi full: `signal-weights.js` grep `recalcEvery` = 0 hit; `lessons.js` grep `recalcEvery` = 0 hit; `index.js` hanya render display `:1826 `darwinRecalcEvery: ["darwinRecalcEvery", fmt(c.darwin.recalcEvery)]`. `config.js:320` set `recalcEvery: u.darwinRecalcEvery ?? 5` — value di-load dari user-config (default 5), tapi tak pernah dibaca pas dispatch. `config-origin.js:207` label eksplisit "(warisan dev — pemicu dipatok konstanta 5)". SETTINGS-GUIDE `:970` juga acknowledge. **Pemicu sebenarnya di `lessons.js:299`: `livePerf.length % MIN_EVOLVE_POSITIONS === 0`** — konstanta hardcoded 21, bukan config. User ubah `darwinRecalcEvery=10` di user-config → tak ada efek (still recalc every 5).
3. **3 lift mode atas 13 SIGNAL_NAMES**. SIGNAL_NAMES `:22-36` = 13 signal (organic_score/fee_tvl_ratio/volume/mcap/holder_count/smart_wallets_present/narrative_quality/study_win_rate/hive_consensus/volatility/entry_mcap/entry_tvl/entry_volume). Lift computation `computeLift :209` route ke 3 mode: (a) **numeric** `:215` utk 10 signal (organic/fee/vol/mcap/holder/study_win_rate/hive_consensus/volatility/entry_*): normalize 0-1 per-signal → `winMean - lossMean` (HIGHER_IS_BETTER :41 6 signal: organic/fee/vol/holder/study_win_rate/hive_consensus) atau `|winMean - lossMean|` utk sisanya. (b) **boolean** `:234` utk smart_wallets_present: win-rate saat signal true vs false, lift = selisih. (c) **categorical** `:250` utk narrative_quality: win-rate per category bucket, lift = max-min rate. Snapshot source: `entry.signal_snapshot` (fallback build dari `entry[signal]` kalau snap absent) — `:283 getEntrySignalSnapshot`. Min samples: `computeLift` cek `winVals.length + lossVals.length < minSamples` (`:218`) → null lift kalau tak cukup.
4. **Quartile boost/decay + persist + history**. `recalculateWeights :148-197`: rank lift desc → q1End = ceil(N×0.25) → topQuartile boost ×boostFactor (default 1.05) → clamp weightCeiling (2.5); q3Start = floor(N×0.75) → bottomQuartile decay ×decayFactor (0.95) → clamp weightFloor (0.3); middle 50% idle. Persist `signal-weights.json` via `saveWeights :83` (sync write). History `:187-197`: push `{timestamp, changes, window_size, win_count, loss_count}` ke `history[]` max 20 entry (slice -20). Recalc count++ `:186`. Live data saat audit: 13 signal weights + `recalc_count=60` + `last_recalc=2026-07-07T05:30:38` — Darwin aktif ~60 kali sejak mainzen_v2_1 start.
5. **趣 mode-aware SCREENER injection + full-sync GAP Darwin section**. `getWeightsSummary` hanya inject di agentType `SCREENER` — agent.js gate `if (agentType === "SCREENER")` (`:233`), index.js runScreeningCycle guna sama (`:1028`), prompt.js interpolation ada di basePrompt SCREENER block (`:157`). MANAGER tidak lihat weights (correct Darwin ada di screening side). **Full-sync GAP**: Darwin section tak ada di `CONFIG_MAP` executor.js — cek `grep -nE "darwin[A-Z]" tools/executor.js` = 0 hit. Darwin key hanya ter-registered di `index.js formatFullConfig` `:1824-1831` (display) + SETTINGS-GUIDE `:949-1015` (doc). Tak bisa di-`/setcfg` atau `/settings` button — operator must manual edit user-config.json utk ubah Darwin tuning. Kontrak: Darwin config = display-only + manual-edit, bukan interactive surface. CROSSREF F8 (full-sync 6-surface checklist) — Darwin = vaccination exception (display-only, tak interaktif).

## Progress
- [x] Spec F21 baca PLAN-audit-meridian.md Bagian 3 line 76
- [x] Cross-ref F19 (trigger + livePerf + signal_snapshot), F20 (toggle independen), F22 (prompt injection), F4 (agent.js role gate), F26 (config.darwin 8-key), F28 (CONFIG_MAP absence), F15 (signal_snapshot entry fields)
- [x] Baca signal-weights.js full 1-336 (3 lift mode + algorithm + persist + summary + interpret + bar)
- [x] Baca lessons.js 290-339 (Darwin dispatch window di recordPerformance)
- [x] Baca lessons.js 21 (MIN_EVOLVE_POSITIONS konstanta — pemicu hardcoded)
- [x] Baca config.js 317-325 (darwin 8-key defaults + recalcEvery mati konfirmasi)
- [x] Baca agent.js 220-238 (weightsSummary injection SCREENER-only)
- [x] Baca index.js 1028 (runScreeningCycle weightsSummary) + index.js 1824-1831 (formatFullConfig Darwin display)
- [x] Baca prompt.js 157 (weightsSummary interpolation)
- [x] Verifikasi darwinRecalcEvery MATI: grep signal-weights.js + lessons.js = 0 hit; config-origin.js:207 label "warisan dev"; SETTINGS-GUIDE :970 acknowledge
- [x] Verifikasi Darwin section CONFIG_MAP absence: grep tools/executor.js darwin = 0 hit (hanya KNOWN_SECTIONS acknowledge)
- [x] Verifikasi live signal-weights.json: 13 weights + recalc_count=60 + last_recalc
- [x] Detect 3 lift mode + 13 SIGNAL_NAMES + quartile split + clamp floor/ceiling
- [x] Detect full-sync gap Darwin (display-only, tak interactive)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Pelatih yang naik-turunkan nilai atribut pemain berdasar performa*: tim punya 13 atribut (speed/finishing/passing/...). Tiap 5 pertandingan, pelatih hitung: atribut mana yang konsisten muncul di pemain yang menang vs yang kalah. Atribut top-25% → boost nilai bobot (×1.05, max 2.5). Atribut bottom-25% → decay (×0.95, min 0.3). Tengah 50% → idle. Bobot tampil di papan strategi pre-match: "fokus pemain dgn passing 2.5 STRONG, hindari yg Physical 0.3 weak". Konsep sama: Darwin = pelatih, 13 signal = atribut, 5 close = pertandingan, prompt SCREENER = papan strategi. Boost ×1.05 / decay ×0.95 = ratchet lambat (tak pernah lompat ekstrem — 60 recalc bakar terus slow drift).
- *Saham index reweighting kuartal*: index 13 saham, tiap kuartal algoritma hitung "lift" = konsistensi saham muncul di periode positif vs negatif. Top 25% saham → naik weight di index (cap 2.5×). Bottom 25% → turunkan (floor 0.3×). Middle idle. Investor lihat index post-rebalance → tahu saham mana over-weight/under-weight. Darwin = algoritma, signal = saham, lift = konsistensi prediksi menang, weight cap 2.5/floor 0.3 = limit aman biar tak melumpuhkan satu signal. Rolling window 60 hari = "data terakhir lebih relevan".

**Di bot, ini = Darwinian signal weighting utk SCREENER** (1-2 kalimat)
`recalculateWeights(livePerf, config)` `signal-weights.js:100` = fungsi satu-satunya yang tulis-otomatis 13 signal weights berdasar PnL closed-position. Dipicu tiap 5 close LIVE active-racikan oleh `recordPerformance` (`lessons.js:317`). Lift computation 3-mode (numeric/boolean/categorical) atas `signal_snapshot` dari F19. `getWeightsSummary()` `:299` render teks utk inject prompt SCREENER — prioritas signal weight tinggi.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F19 (recordPerformance push entry + save `:256`, lalu dispatch window `:290-324`). SETELAH F20 juga (evolveThresholds jalan dulu di blok yang sama `:308-314`, lalu Darwin `:317-322`). Sebelum F22 (getLessonsForPrompt consumer + getModePerformance mode-scoped), F5 (prompt.js interpolation weightsSummary). F21 = ADAPTIVE priORITAS screening: tiap 5 close, Darwin re-learn signal mana prediksi profit. Tanpa F21, SCREENER lihat ke-13 signal setara (weight default 1.0) — tak ada pembelajaran "signal X lebih akurat di racikan-hari-ini". Darwin independent dari FREEZE threshold (F20) — operator bisa FREEZE evolve tapi Darwin tetap recalc (atau sebaliknya).

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Trigger**: `recordPerformance` selesai dispatch evolveThresholds (`:309`) → cek `config.darwin?.enabled` (`:317`).
2. **Skip bila OFF**: bila `enabled=false` → block skip total, no signal-weights write. Live saat audit: `darwin` undefined di user-config → default `true` (`config.js:318`) → Darwin AUTO aktif.
3. **Dynamic import + call**: `await import("./signal-weights.js")` → `recalculateWeights(livePerf, config)` (`:318-319`). `livePerf` = `!paper && !suspect_pnl && keepActiveRacikan` (filter dari `:298`).
4. **Read cfg**: `darwin = cfg.darwin || {}` (`:101`) → 6 param: `windowDays ?? 60`, `minSamples ?? 10`, `boostFactor ?? 1.05`, `decayFactor ?? 0.95`, `weightFloor ?? 0.3`, `weightCeiling ?? 2.5`. EAK `darwinRecalcEvery` TIDAK dibaca di sini.
5. **Load weights**: `loadWeights()` (`:109`) baca `signal-weights.json` — kalau absent → buat default `{weights: 13×1.0, last_recalc: null, recalc_count: 0, history: []}` (`:60-67`). Kalau parse-fail → fallback default (`:74-80`).
6. **Fill missing signals**: loop SIGNAL_NAMES → `weights[name] ?? 1.0` (`:113-115`) handle new signal added pasca-init.
7. **Rolling window filter**: `cutoff = now - windowDays×86400000` (`:118-120`). `recent = perfData.filter(ts >= cutoff)` (`:122-125`).
8. **Min samples gate**: bila `recent.length < minSamples` → log "only N records" + return `{changes:[], weights}` (`:127-130`). Lewat 5 close trigger (lessons.js MIN_EVOLVE_POSITIONS) TAPI masih harus lewati `minSamples` rolling window.
9. **Wins/losses split**: `wins = recent.filter(pnl_usd > 0)` (`:133`), `losses = recent.filter(pnl_usd <= 0)` (`:134`). Bila salah satu 0 → skip "need both wins and losses" (`:136-139`).
10. **Compute lifts**: loop 13 SIGNAL_NAMES → `computeLift(signal, wins, losses, minSamples)` (`:144`). 3 mode routing (`:209-213`): numeric/boolean/categorical.
11. **Rank + quartile split**: `lifts.sort desc` (`:148`). `q1End = ceil(N×0.25)` (`:156`), `q3Start = floor(N×0.75)` (`:157`). topQuartile = top 25%, bottomQuartile = bottom 25%, middle 50% idle (tak boost/decay).
12. **Boost/decay apply**: loop ranked → bila `topQuartile`: `next = min(prev×boostFactor, weightCeiling)` (`:167-168`). bila `bottomQuartile`: `next = max(prev×decayFactor, weightFloor)` (`:169-170`). round 3-decimal (`:173`). bila `next !== prev` → push changes `{signal, from, to, lift, action}` (`:175-180`).
13. **Persist + history append**: `data.weights = weights`, `last_recalc = now ISO`, `recalc_count++` (`:184-186`). Bila `changes.length > 0` → push `{timestamp, changes, window_size, win_count, loss_count}` ke `history[]`, slice -20 (`:188-196`). `saveWeights(data)` sync write (`:198`).
14. **Return**: `{changes, weights}` (`:204`). Caller (`lessons.js:320`) cek `changes.length > 0` → log "Darwin: adjusted N signal weight(s)".
15. **Prompt injection post-recalc**: siklus SCREENER berikutnya dimulai → `agent.js:233-238` (agentLoop SCREENER) atau `index.js:1028` (runScreeningCycle) → `config.darwin?.enabled` truthy → `getWeightsSummary()` render block teks 13-baris → prompt.js:157 interpolation → prompt SCREENER section "Prioritize candidates whose strongest attributes align with high-weight signals".

**Output recalculateWeights**: `{changes: [...], weights: {...}}` + side-effect mutate `signal-weights.json` (sync write). Changes = array `{signal, from, to, lift, action:"boosted"/"decayed"}`. Empty bila tak ada sinyal cukup / middle-quartile semua / already at floor/ceiling. Trigger ke fase berikut: prompt SCREENER guna weightsSummary utk prioritas candidate → AI pilih signal weight tinggi.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
`signal-weights.json` corrupt → `loadWeights` fallback default (1.0 semua) → Darwin reset, SCREENER lihat semua signal setara (factory). `recalculateWeights` throw → caught di `lessons.js:317`? TIDAK — tidak ada try-catch eksplisit di dispatch Darwin. Bila throw → propagate ke `recordPerformance` → close caller catch (dlmm.js:2336/2640/1691, F19 Open-Q #1 resolved — close path swallow). Darwin skip cycle, lesson persist tetap aman. `darwinRecalcEvery` user edit = no-op → user kira ubah interval tapi tak ada efek (silent bug — sudah documented di config-origin.js label + SETTINGS-GUIDE). `getWeightsSummary` throw → caught agent.js:237 `/* signal-weights not critical */` + index.js no visible catch (just null weightsSummary — prompt kosong, factory weights tak terlihat).

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **Darwin** — nama kolektif utk signal weight recalc system. Adaptif priortias SCREENER. `config.darwin.enabled` toggle.
- **signal weights** — bobot 13 signal (default 1.0). Range [0.3, 2.5]. Boost ×1.05, decay ×0.95. Ratchet slow.
- **SIGNAL_NAMES** — 13 signal daftar (`signal-weights.js:22-36`): organic_score / fee_tvl_ratio / volume / mcap / holder_count / smart_wallets_present / narrative_quality / study_win_rate / hive_consensus / volatility / entry_mcap / entry_tvl / entry_volume.
- **lift** — measure prediktif signal utk win vs loss. Numeric: `winMean - lossMean` (normalized 0-1). Boolean: `P(win|signal=true) - P(win|signal=false)`. Categorical: `max(rate) - min(rate)` per bucket.
- **HIGHER_IS_BETTER** — Set 6 signal (organic/fee/vol/holder/study_win_rate/hive_consensus) куда higher value → better. Rest numeric pakai `|winMean - lossMean|` (neutral direction).
- **quartile boost/decay** — top 25% lift → boost ×1.05, bottom 25% → decay ×0.95, middle 50% idle. Slow ratchet biar tak lompat ekstrem.
- **weightFloor / weightCeiling** — clamp [0.3, 2.5]. Signal tak pernah di-0 (still influential) atau dominan (cap 2.5×).
- **windowDays** — rolling window default 60 hari. Cutoff filter di recalculateWeights.
- **minSamples** — gate minimum 10 sampel di window. Bila < 10 → skip recalc (tak cukup data stats).
- **darwinRecalcEvery (MATI)** — config key warisan dev. Value di-load `config.darwin.recalcEvery` (`config.js:320`) tapi tak pernah dibaca pas dispatch. Pemicu actual = `MIN_EVOLVE_POSITIONS=5` konstanta `lessons.js:21`.
- **recalc_count / history** — recalc_count++ tiap call. History max 20 entry `{timestamp, changes, window_size, win_count, loss_count}`. Audit trail.
- **signal_snapshot** — 15-field freeze F19 (`PERFORMANCE_SIGNAL_FIELDS`). Source utk lift computation via `getEntrySignalSnapshot`.
- **getWeightsSummary** — render teks "Signal Weights (Darwinian ...)" + 13 baris sort desc + bar `#####.....` + label [STRONG]/[above avg]/[neutral]/[below avg]/[weak]. Inject prompt SCREENER only.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta file fase ini (tabel file → peran)

| File | Peran di F21 | Baris kunci |
|------|--------------|-------------|
| `signal-weights.js` | **Core module 336-baris**: SIGNAL_NAMES + DEFAULT + HIGHER_IS_BETTER + BOOLEAN/CATEGORICAL sets; loadWeights/saveWeights; recalculateWeights (algorithm + boost/decay + persist + history); computeLift 3-mode + numeric/boolean/categorical lift; helpers (extractNumeric/getEntrySignalSnapshot/mean); getWeightsSummary + interpretWeight + weightBar | 22-54 signal sets; 58-89 load/save; 100-205 recalc; 209-268 lift compute; 272-295 helpers; 299-322 summary; 324-336 interpret/bar |
| `lessons.js` | **Dispatch trigger**: `recordPerformance :156` hitung livePerf `:298` → cek `darwin.enabled` `:317` → dynamic import `:318` → `recalculateWeights(livePerf, config)` `:319` → log changes `:320-322`. `MIN_EVOLVE_POSITIONS=5 :21` = konstanta pemicu (NOT `darwinRecalcEvery`) | 21 konstanta; 156 recordPerformance; 298 livePerf filter; 317-322 Darwin dispatch |
| `agent.js` | **Prompt injection SCREENER**: `agentLoop :220` bila `agentType === "SCREENER"` → dynamic import `:234` → `getWeightsSummary()` `:237` gated `config.darwin?.enabled` → pass ke `buildSystemPrompt` `:238` | 233-238 weightsSummary block SCREENER-only |
| `index.js` | **Pre-deploy injection**: `runScreeningCycle :1028` weightsSummary gated same. **Display Darwin 8 key**: `formatFullConfig :1824-1831` render row utk `/config` (display-only, tak ada di CONFIG_MAP executor). KNOWN_SECTIONS acknowledge "darwin" sebagai valid section | 1028 pre-deploy; 1824-1831 display; 2132 KNOWN_SECTIONS; 2487 pageForKey darwin fallback to dev-management |
| `prompt.js` | **Interpolation**: `buildSystemPrompt :31` accept `weightsSummary` param; `:157` interpolate `${weightsSummary ? weightsSummary + "..." : ""}` di basePrompt SCREENER setelah RISK SIGNALS + sebelum LESSONS LEARNED | 31 signature; 157 interpolation SCREENER |
| `config.js` | **Defaults 8-key**: `darwin` block `:317-325` load dari user-config (`u.darwin*`). `enabled ?? true` default auto-on. `recalcEvery ?? 5` di-load tapi tak dibaca pas dispatch (MATI) | 317-325 darwin block |
| `config-origin.js` | **Label + L3 metadata**: `darwinRecalcEvery` label "(warisan dev — pemicu dipatok konstanta 5)" `:207` explicit acknowledgment. L3 sub-cluster data | 207 label; 310/374/516 mapping |
| `tools/executor.js` | **ABSEN Darwin**: `CONFIG_MAP :321` tak ada darwin* keys. `KNOWN_SECTIONS :535` acknowledge "darwin" only (tak reject section update bila user-config pakai section) | 321 CONFIG_MAP (darwin absent); 535 KNOWN_SECTIONS |
| `SETTINGS-GUIDE.md` | **Doc surface**: Darwin 8 key documented `:949-1015`. `darwinRecalcEvery :970` acknowledge "warisan". Display-only doc | 949-1015 darwin section |
| `paths.js` | **File location**: `signalWeightsPath :24` resolve `dataDir/signal-weights.json` (per-profil via paths) | 24 |
| `signal-weights.json` | **Persisted state** (runtime, tracked): `weights: {13 signal}, last_recalc, recalc_count, history: []` max 20. Live saat audit: 13 weights + recalc_count=60 + last_recalc 2026-07-07 | runtime file |
| `hivemind.js` | **No Darwin coupling**: signal-weights tak sync ke hive. Hive baca lessons + perf events (F33). Darwin = local-only | (no Darwin refs) |

---

## §B. Alur data hulu→hilir (ASCII diagram)

```
┌── F19 recordPerformance (lessons.js:156) ──────────────────────────────┐
│ 290: dispatch window start (livePerf.length % 5 === 0)                 │
│ 308-314: evolveThresholds (F20) — INDEPENDEN toggle evolveEnabled        │
│ 317: if (config.darwin?.enabled) ─→ Darwin dispatch                     │
│ 318:   const { recalculateWeights } = await import("signal-weights.js")│
│ 319:   const wResult = recalculateWeights(livePerf, config)            │
└────────────────┬───────────────────────────────────────────────────────┘
                 │ livePerf + cfg
                 ▼
┌── signal-weights.js recalculateWeights (100) ──────────────────────────┐
│ 1. darwin = cfg.darwin || {} (101)                                     │
│    windowDays=60, minSamples=10, boost=1.05, decay=0.95,               │
│    floor=0.3, ceiling=2.5  (102-107)                                    │
│    [darwinRecalcEvery TAK DIBACA — pemicu dari lessons.js:299]         │
│ 2. data = loadWeights() (109)                                          │
│    └→ signal-weights.json baca / create default 13×1.0                 │
│ 3. weights = data.weights || DEFAULT (110)                             │
│    fill missing SIGNAL_NAMES (113-115)                                 │
│ 4. recent = perfData.filter(ts >= now-windowDays) (118-125)           │
│ 5. if recent.length < minSamples → return {changes:[], weights} (127) │
│ 6. wins = pnl_usd>0, losses = pnl_usd<=0 (133-134)                    │
│    if salah 0 → return (136)                                          │
│ 7. lifts = {} ; for signal in SIGNAL(13): computeLift(signal,...)      │
│    ├→ numeric (215): normalize 0-1, winMean-lossMean / |diff|         │
│    ├→ boolean (234): P(win|true) - P(win|false)                        │
│    └→ categorical (250): max(rate) - min(rate) per bucket              │
│ 8. ranked = lifts.sort desc (148)                                      │
│ 9. q1End = ceil(N×0.25), q3Start = floor(N×0.75) (156-157)            │
│    topQuartile = ranked[:q1End], bottomQuartile = ranked[q3Start:]    │
│10. for ranked:                                                         │
│    if topQuartile: next = min(prev*1.05, 2.5) (167-168)               │
│    if bottomQuartile: next = max(prev*0.95, 0.3) (169-170)            │
│    round 3-decimal; if !== prev: push change (173-180)                │
│11. data.weights = weights; last_recalc = now; recalc_count++ (184-186)│
│    if changes.length>0: history.push({ts,changes,window,win,loss})    │
│    slice history[-20] (187-197)                                        │
│12. saveWeights(data) sync write signal-weights.json (198)             │
│13. return {changes, weights} (204)                                    │
└────────────────┬──────────────────────────────────────────────────────┘
                 │ {changes, weights}
                 ▼
┌── lessons.js recordPerformance (320-322) ──────────────────────────────┐
│ if wResult.changes.length > 0:                                         │
│   log("evolve", `Darwin: adjusted ${wResult.changes.length} weight(s)`)│
└────────────────┬───────────────────────────────────────────────────────┘
                 │ (signal-weights.json updated)
                 ▼
┌── Next SCREENER cycle (agent.js:233 / index.js:1028) ──────────────────┐
│ if agentType === "SCREENER" && config.darwin?.enabled:                │
│   weightsSummary = getWeightsSummary()                                │
│     └→ load signal-weights.json, sort desc by weight, render 13 line   │
│        "  organic_score       0.41  ........ weak [weak]"             │
│        + "Last recalculated: <ts> (<N> total)"                        │
│ systemPrompt = buildSystemPrompt(SCREENER, ..., weightsSummary, ...)  │
│   └→ prompt.js:157 interpolation:                                      │
│      "<weightsSummary text>"                                          │
│      "Prioritize candidates whose strongest attributes align with     │
│       high-weight signals."                                            │
└────────────────┬──────────────────────────────────────────────────────┘
                 │
                 ▼
┌── F4 agentLoop SCREENER → tools/definitions F6 ──────────────────────┐
│ LLM baca prompt (weights visible) → pilih candidate align high signal │
└───────────────────────────────────────────────────────────────────────┘
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| `recordPerformance` (lessons.js:318-319) | `recalculateWeights` (signal-weights.js:100) | `config.darwin?.enabled` truthy + `livePerf.length > 0 && %5 === 0` (lessons.js:299) | livePerf array + config object (full cfg.darwin block) | throw propagate → recordPerformance no try-catch → caller dlmm.js catch (F19 Resolved) |
| `recalculateWeights` (signal-weights.js:109) | `loadWeights` (signal-weights.js:58) | dispatch start | none | file absent → init default (`:60-67`); parse-fail → fallback (`:74-80`) |
| `recalculateWeights` (signal-weights.js:198) | `saveWeights` (signal-weights.js:83) | post-history append | data objek | write fail → log `signal_weights_error` + silent (return battered state from memory) |
| `recalculateWeights` (signal-weights.js:144) | `computeLift` (signal-weights.js:209) | per 13 SIGNAL_NAMES | signal, wins, losses, minSamples | null lift bila insufficient samples (218/245/263) |
| `computeLift` (signal-weights.js:210-212) | `computeNumericLift/BooleanLift/CategoricalLift` (215/234/250) | routed by BOOLEAN/CATEGORICAL sets | same args | null return per mode logic |
| `computeNumericLift` (signal-weights.js:272) | `extractNumeric` (signal-weights.js:272) + `getEntrySignalSnapshot` (283) | per wins/losses array | entries + signal name | skip entry bila `snap` null no `signal` fallback |
| `agentLoop` (agent.js:234) | `getWeightsSummary` (signal-weights.js:299) | agentType SCREENER + build prompt | none (read file) | try-catch `/* signal-weights not critical */` `:236` — null weightsSummary |
| `runScreeningCycle` (index.js:1028) | `getWeightsSummary` (signal-weights.js:299) | always run (gated enabled) pre-deploy | none | no visible catch — null weightsSummary = empty prompt section |
| `buildSystemPrompt` (prompt.js:31) | (panggil 7-arg) | agentLoop | weightsSummary text | `${weightsSummary ? ... : ""}` interpolation null-safe (`:157`) |

---

## §D. Logika kunci per fungsi

### `recalculateWeights(perfData, cfg)` (signal-weights.js:100-205)
- **Apa**: penulis auto signal weights dari PnL closed-position. Lift + quartile + boost/decay + persist + history.
- **Kapan dipicu**: tiap 5 close LIVE active-racikan, gated `config.darwin?.enabled`, dari `recordPerformance` (`lessons.js:317-322`).
- **Output**: `{changes, weights}`. changes = array `{signal, from, to, lift, action}` (empty bila middle-quartile semua / at floor/ceiling). weights = updated object.
- **Sinkron**: dipanggil recordPerformance; consumers baca signal-weights.json via getWeightsSummary.
- **Fail-mode**: insufficient samples (rolling window <10) → skip return early; one-sided wins/losses → skip; lift null utk semua signal → return empty changes; saveWeights throw → caught `:86-88` log error + return memory state.
- **Kontrak**: NO racikan filter inside — livePerf sudah filtered di lessons.js:298 (`!paper && !suspect_pnl && keepActiveRacikan`). recalculateWeights trust livePerf.
- **Bukti**: signal-weights.js:100-205.

### `computeLift(signal, wins, losses, minSamples)` (signal-weights.js:209-213)
- **Apa**: router ke 3 mode berdasar BOOLEAN_SIGNALS / CATEGORICAL_SIGNALS set membership.
- **Output**: signed lift number (numeric/boolean), atau max-min (categorical), atau null bila insufficient.
- **Sinkron**: dipanggil `recalculateWeights :144` per 13 signal.
- **Bukti**: 209-213 routing; 215-232 numeric; 234-248 boolean; 250-268 categorical.

### `computeNumericLift(signal, wins, losses, minSamples)` (signal-weights.js:215-232)
- **Apa**: normalize 0-1 per-signal (min-max dari all values win+loss), compute `winMean - lossMean` (HIGHER_IS_BETTER) atau `|winMean - lossMean|` (neutral).
- **Output**: signed value atau 0 (bila range 0 / all values equal).
- **Fail-mode**: `winVals.length + lossVals.length < minSamples` → null (`:218`). Either side 0 → null (`:219`).
- **Bukti**: 215-232; HIGHER_IS_BETTER 41-48; normalize 227; mean 228-229; return 231.

### `computeBooleanLift(signal, wins, losses, minSamples)` (signal-weights.js:234-248)
- **Apa**: lift = `P(win|signal=true) - P(win|signal=false)` utk signal boolean.
- **Output**: signed value (positive = signal true lebih sering menang).
- **Fail-mode**: `trueTotal + falseTotal < minSamples` → null. Either bucket 0 → null.
- **Bukti**: 234-248. Sample source: `smart_wallets_present` (only boolean signal di SIGNAL_NAMES).

### `computeCategoricalLift(signal, wins, losses, minSamples)` (signal-weights.js:250-268)
- **Apa**: lift = `max(win-rate per category bucket) - min(win-rate per category bucket)`. Sample bucket with total≥2 only.
- **Output**: positive value (0 bila single bucket).
- **Fail-mode**: totalSamples < minSamples → null. <2 buckets dengan total≥2 → null.
- **Bukti**: 250-268. Signal target: `narrative_quality` (only categorical).

### `getWeightsSummary()` (signal-weights.js:299-322)
- **Apa**: render teks utk inject prompt SCREENER. 13 baris signal sort-desc by weight + bar visual + label.
- **Output**: string multiline. Header + 13 signal rows + footer last_recalc/recalc_count.
- **Sinkron**: dipanggil agent.js:237 (agentLoop SCREENER) + index.js:1028 (runScreeningCycle). Gated `darwin.enabled`.
- **Fail-mode**: load fail → fallback default weights → render 13×1.0 [neutral].
- **Bukti**: 299-322. interpretWeight 324-330. weightBar 332-336.

### `loadWeights() / saveWeights(data)` (signal-weights.js:58-89)
- **Apa**: baca/tulis `signal-weights.json`. Init default kalau absent/parse-fail.
- **Bukti**: 58-81 load; 83-89 save.
- **Kontrak**: structure `{weights:{13}, last_recalc, recalc_count, history:[]}`.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### Kontrak kunci
1. **`darwinRecalcEvery` MATI — pemicu hardcoded `MIN_EVOLVE_POSITIONS=5`**. Verifikasi 4 titik:
   - `signal-weights.js`: grep `recalcEvery` = 0 hit. Darwin algorithm tak baca.
   - `lessons.js`: grep `recalcEvery` = 0 hit. Dispatch window pakai konstanta `:21` + `:299` `livePerf.length % MIN_EVOLVE_POSITIONS === 0`.
   - `config.js:320`: `recalcEvery: u.darwinRecalcEvery ?? 5` load dari user-config, default 5.
   - `config-origin.js:207`: label "(warisan dev — pemicu dipatok konstanta 5)" explicit acknowledgment.
   - `SETTINGS-GUIDE:970`: same acknowledgment.
   **Implikasi**: user ubah `darwinRecalcEvery=10` → no-op. Darwin still recalc tiap 5 close. Silent configuration bug (documented tapi tak ada warning di `/setcfg`/`/config`).
2. **Darwin INDEPENDEN dari evolveEnabled FREEZE**. `evolveThresholds` gate `config.learning?.evolveEnabled === false` (lessons.js:305). Darwin gate `config.darwin?.enabled` (317). 2 toggle terpisah — operator bisa `evolveEnabled=false` (FREEZE threshold) tapi `darwin.enabled=true` (weights tetap adapt). Atau sebaliknya. F20 + F21 dispatch di blok yang sama (`:308-322`) tapi conditional terpisah.
3. **Darwin = SCREENER-only injection**. agent.js gate `agentType === "SCREENER"` (`:233`) + index.js runScreeningCycle sama gate (`:1028`). MANAGER prompt tak terlihat weights (correct — Darwin ada di screening side, bukan management). prompt.js interpolation ada di basePrompt SCREENER block (`:157`), tak di MANAGER.
4. **Live saat audit Darwin AUTO aktif**. user-config.json `darwin` undefined → `config.darwin` default `{enabled: true, windowDays: 60, recalcEvery: 5, ...}` (config.js:317-325). `enabled ?? true` = auto-on. 60 recalc sudah terjadi sejak mainzen_v2_1 start (signal-weights.json `recalc_count: 60`). Tidak ada flag manual-off di user-config — Darwin default ON walau operator mungkin tak aware.
5. **Weights live drift ekstrem**. signal-weights.json: `fee_tvl_ratio: 0.3` (at floor), `volume: 0.3` (at floor), `holder_count: 0.3` (at floor), `mcap: 2.5` (at ceiling), `entry_mcap/tvl/volume: 2.5` (at ceiling). Setelah 60 recalc, top-quartile saturate ke 2.5, bottom-quartile saturate ke 0.3. Ratchet slow tapi cumulative drift. **UNKNOWN konsekuensi**: SCREENER prompt prioritaskan mcap-related 2.5× + entry_* 2.5× (post-deploy snapshot signal, paling predictive karena frozen saat deploy). fee_tvl_ratio di floor 0.3 = operator-set MinFeeActiveTvlRatio threshold (F20 evolved) + Darwin weight loss = double pengaruh (gate threshold + weight deprioritize).

### Bug / gap potensial
6. **Darwin dispatch NO try-catch di lessons.js:317-322**. Bila `recalculateWeights` throw (e.g. JSON parse race saat saveWeights) → propagate ke `recordPerformance` → propagate ke `closePosition` → caught dlmm.js:2336/2640/1691 (F19 Resolved showed callers wrap). Darwin skip cycle, lesson persist tetap aman. Tapi: bila throw terjadi SETELAH `saveWeights(data)` `:198` partial write → signal-weights.json corrupt → next load fallback default → Darwin reset. UNKNOWN probability (writeFileSync sync atomic per Node).
7. **getWeightsSummary di index.js:1028 NO visible catch**. `const weightsSummary = config.darwin?.enabled ? getWeightsSummary() : null;`. Bila `getWeightsSummary` throw (e.g. load fail propagates — `loadWeights` catch fail return fallback, tapi sort/interpretWeight di getWeightsSummary bisa throw bila weights type weird) → propagate ke `runScreeningCycle`. agent.js:237 try-catch — index.js:1028 NO. Asimetri safety. Verifikasi: bila `loadWeights` return corrupt object (parse-fail fallback well-formed, OK) — aman. Bisa terjadi bila user-config manual edit `darwin` jadi non-object? `config.darwin` undefined → `darwin.enabled` access throw. UNKNOWN, edge case.
8. **Full-sync GAP Darwin section**. CONFIG_MAP `executor.js:321` tak ada darwin* keys. `/setcfg` tak bisa set Darwin. `/settings` button menu tak ada darwin page (pageForKey :2487 fallback to "dev-management"). Operator must manual edit user-config.json utk ubah Darwin tuning. Surface ack: `formatFullConfig` display (`:1824-1831`) + SETTINGS-GUIDE doc (`:949-1015`). **Kontrak F8 (full-sync 6-surface) melanggar**: Darwin tak ada di CONFIG_MAP (interactive set), tak di renderSettingsMenu button, tak di BOT_COMMANDS. Tapi ack di KNOWN_SECTIONS (`:2132` executor + `:535 `executor — sama line, file beda). **Asymmetry vs evolveEnabled** — evolveEnabled juga tak ada di CONFIG_MAP (file-only). Keduanya = kontrak "learning section = display + manual edit only". Konsisten antar dua subsystem learning.
9. **`darwinRecalcEvery` user-edit silent bug #8** recap: dokumentasi acknowledge, tapi tak ada warning di `/setcfg darwinRecalcEvery=10` (bila operator pakai section update direktif `update_config` utk mutasi raw object). UNKNOWN apakah `update_config` executor accept `darwinRecalcEvery` di CONFIG_MAP reject vs silent accept no-op. Verifikasi: KNOWN_SECTIONS acknowledge darwin → update_config accept arbitrary section write → key persist but unused.
10. **signal_snapshot sumber prakiraan quality**. Lift computation pakai `entry.signal_snapshot` (15-field F19) fallback build from `entry[signal]` top-level. Bila SCREENER tak populate entry_top10_pct/bot_pct/age_hours (e.g. meteora path yang tak trigger bundler fetch), field null → extractNumeric skip (`:278`). Darwin recalc jadi pakai subset signal → quartile ranking skew ke signal yang populated. OPEN-Q bawa F22/F27 verifikasi coverage.
11. **history slice -20 = audit trail cap 20**. `data.history.length > 20 ? slice(-20)` (`:196`). 60 recalc already happened → 40 history entry overwritten. Recalc timing + changes trajectory tak ada audit lebih dari 20 recalc terakhir. UNKNOWN apakah dump-to-archive di al配 (F22 stop). Verifikasi: grep signal-weights_archive / lessonsArchivePath tak show Darwin archive path. Darwin history = ephemeral 20-entry buffer. **Gap**: bila operator mau audit kenapa weights naik 6 bulan lalu → data gone.
12. **`mcap` dan `entry_mcap/tvl/volume` sama-sama di ceiling 2.5**. Apakah `lift` duplicate? Cross-correlation: entry_mcap (snapshot post-deploy) adalah mcap at deploy time. Darwin boost keduanya independently → bobot mcap-related jadi 5× utk prompt SCREENER (2.5+2.5 inference). **UNKNOWN apakah design intent atau leak**. Tampaknya design: SIGNAL_NAMES 13 distinct utk audit purposes, prompt tampilkan terpisah utk transparency, operator inspect & manually reweight via signal-weights edit (file-based).

### Fail-open tak-terpenuhi
13. **agent.js:237 try-catch pass**. `/* signal-weights not critical */ ` — bila signal-weights throw, weightsSummary null, prompt SCREENER skip weights section. Factory behavior (tak terlihat Darwin). PASS.
14. **index.js:1028 NO catch** — bukan fail-open gap karena `loadWeights` internally returns safe fallback. Bila stringify-sort-interpret leak → UNKNOWN probability rendah. MEDIUM risk.
15. **recalculateWeights fail → return null/undefined?** Tidak return null, return `{changes:[], weights}` consistently. PASS.

---

## §F. Glosarium istilah fase
- **Darwin** — kolektif signal weight recalc system. `config.darwin.enabled` toggle.
- **signal weights** — bobot 13 signal default 1.0, range [0.3, 2.5], boost ×1.05, decay ×0.95.
- **SIGNAL_NAMES** — 13 signal: organic_score / fee_tvl_ratio / volume / mcap / holder_count / smart_wallets_present / narrative_quality / study_win_rate / hive_consensus / volatility / entry_mcap / entry_tvl / entry_volume.
- **HIGHER_IS_BETTER** — Set 6 signal (organic/fee/vol/holder/study_win_rate/hive_consensus) lebih bagus bila higher. Rest numeric neutral-direction.
- **BOOLEAN_SIGNALS** — Set {smart_wallets_present}. Lift = P(win|true) - P(win|false).
- **CATEGORICAL_SIGNALS** — Set {narrative_quality}. Lift = max(rate) - min(rate) per bucket.
- **lift** — prediktif signal score. Positive = signal true lebih sering menang.
- **quartile boost/decay** — top 25% lift boost ×1.05, bottom 25% decay ×0.95, middle 50% idle.
- **weightFloor/weightCeiling** — clamp [0.3, 2.5].
- **windowDays** — rolling window 60 hari default.
- **minSamples** — gate 10 sampel minimum di rolling window.
- **darwinRecalcEvery (MATI)** — user-config key warisan dev. Loaded ke `config.darwin.recalcEvery` tapi tak dibaca dispatch. Pemicu actual = `MIN_EVOLVE_POSITIONS=5` konstanta lessons.js:21.
- **recalc_count / history** — counter + 20-entry audit trail.
- **signal_snapshot** — 15-field F19 freeze. Source utk lift computation.
- **getWeightsSummary** — render teks utk prompt SCREENER + bar visual + label.
- **interpretWeight** — label [STRONG ≥1.8] / [above avg ≥1.2] / [neutral ≥0.8] / [below avg ≥0.5] / [weak <0.5].
- **weightBar** — bar ASCII `#####.....` 10-char-clamped utk visual weight di prompt.

---

## §G. Link fase lain (cross-ref)
- **F19**: recordPerformance trigger launch + livePerf filter + signal_snapshot source utk lift.
- **F20**: evolveThresholds paralel dispatch di blok yang sama `:308-322` — toggle `evolveEnabled` FREEZE TERPISAH dari `darwin.enabled`.
- **F22**: getWeightsSummary = SCREENER prompt injection layer + getLessonsForPrompt mode-scoped summary-lesson consumer (sama dispatch blok).
- **F4**: agent.js role gate SCREENER + dynamic import signal-weights + weightsSummary try-catch.
- **F5**: prompt.js interpolation weightsSummary di SCREENER basePrompt.
- **F6**: tools/definitions SCREENER_TOOLS surface (Darwin tak ada tool — getWeightsSummary runtime-only injection).
- **F15**: signal_snapshot entry fields source (entry_* dari meteora/gmgn screening path) → Darwin lift computation.
- **F26**: config.darwin 8-key defaults block (config.js:317-325).
- **F28**: update_config write path — Darwin section tak ada di CONFIG_MAP (full-sync gap).
- **F8**: full-sync 6-surface contract — Darwin = vaccination exception (display-only + manual edit, tak interactive).
- **F33**: hivemind sync non-paper only — signal-weights tak sync ke hive (local-only per bot instance).

---

## §H. Open-Q (bawa ke fase berikutnya)
- **`darwinRecalcEvery` user-edit silent bug #8** — bila operator `update_config darwinRecalcEvery=10` → executor accept? CONFIG_MAP reject? UNKNOWN apakah executor error "unknown key" vs silent accept no-op. Verifikasi F28 (update_config behavior utk non-CONFIG_MAP keys).
- **`/settings` button menu darwin page** — `pageForKey :2487` fallback to dev-management utk darwin* keys. UNKNOWN apakah ada page render di renderSettingsMenu utk darwin. Bila ya → button ada tapi tak bisa set value (no callback wiring). Verifikasi F31 (telegram UI).
- **`getWeightsSummary` index.js:1028 NO catch** — asimetri safety vs agent.js:237. UNKNOWN probability `getWeightsSummary` throw bila `loadWeights` return sane object. F22 cek edge-case behavior (corrupt signal-weights.json).
- **`signal_snapshot` partial populate** — coverage signal_entry_* bila meteora path tak trigger bundler fetch. Darwin quartile ranking skew ke signal yang populated. F15/F27 verifikasi coverage matrix.
- **`history` slice -20 = audit trail cap** — 60 recalc sudah terjadi, 40 entry overwrite. Bila operator mau audit recalc 6 bulan lalu → gone. Bisa dump-to-archive? Tidak terlihat di paths.js (grep signal-weights archive = 0). F23 (memory stores + audit trail) verifikasi apakah ada archive mechanism.
- **weights saturation drift** — 5 signal di ceiling 2.5 + 3 di floor 0.3 setelah 60 recalc. Ratchet slow tapi saturating. Bila reset Darwin (delete signal-weights.json) → factory 1.0 semua. Design intent? UNKNOWN apakah `darwin.reset` tool / config flag ada. Grep awal tak nemu reset tool.
- **`mcap` vs `entry_mcap` duplicate inference** — Darwin boost keduanya independently → prompt SCREENER inference 5× weight utk mcap-related. Design intent atau leak? Verifikasi F22 (prompt inspection actual SCREENER environment utk detect double-count).
- **Darwin live post-recalc timing** — recalc jalan tiap 5 close di recordPerformance. Next SCREENER cycle langsung baca updated weights. Bila 5 close terjadi di tengah screening cycle (race) → SCREENER baca mid-update? UNKNOWN — `saveWeights` sync write, atomik dari perpective reader. PASS default.

---

> Resume: buka file ini → lihat "## Progress" → lanjut dari `[ ]` terakhir. Audit read-only.