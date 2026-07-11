# Audit F20 — evolveThresholds (mandatory deep) — auto-evolve jantung
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: satu-satunya penulis-otomatis threshold screening ke `user-config.json` (RAISE-only ratchet), 2 path mutasi (`minFeeActiveTvlRatio` + `minOrganic`), dispatch tiap 5 close LIVE active-racikan (lessons.js:299) gated `evolveEnabled` (FREEZE), persist langsung + `reloadScreeningThresholds` (config.js:606) re-baca ke live config tanpa restart, summary lesson di-push ke lessons.json (560) → masuk `getLessonsForPrompt` (F22 cross-ref); `keepActiveRacikan` chokepoint di 462 isolasi per-racikan; `MAX_CHANGE_PER_STEP=0.20` cap per-step + clamp `[0.05,10]`/`[60,90]` jaga agar tak melompat; manual `/evolve` + `/evolve force` (index.js:3810) override operator; 3 caller closePosition (paper 1691/relay 2336/public 2640) try-catch recordPerformance → evolve throw non-fatal.
> Cross-ref: F19 (recordPerformance trigger dispatch + keepActiveRacikan + livePerf filter), F21 (Darwin recalculateWeights terpisah — `darwin.enabled` toggle independen), F22 (getLessonsForPrompt baca summary lesson + getModePerformance mode-scoped), F26 (config.screening defaults + config.learning.evolveEnabled + config.activeSetup), F28 (reloadScreeningThresholds detail + update_config persist path), F29 (preset applyPreset swap file → evolve write timing).

## Ringkasan eksekutif (5 baris)
1. **1 fungsi, 2 threshold, RAISE-only.** `evolveThresholds(perfData, config)` (lessons.js:458-570) satu-satunya penulis-otomatis threshold screening. Cuma 2 key: `minFeeActiveTvlRatio` (475-513) + `minOrganic` (515-537). Kedua-duanya RAISE-only (`if (rounded > current)` di 489, 506, 531). Tak pernah lower. Ratchet satu-arah: threshold sekali naik, tak balik turun via evolve. Cap `MAX_CHANGE_PER_STEP=0.20` (22) = max 20% per step. Clamp: fee `[0.05, 10.0]` (487, 504), organic `Math.round` `[60, 90]` (530). Algorithm: naikkan floor ke "sedikit di bawah winner terburuk" (target `minWinner×0.85` fee / `minWinner−3` organic) BILA winner-consensus ≥2 + gap jelas.
2. **Dispatch tiap 5 close LIVE active-racikan, gated FREEZE.** `recordPerformance` (lessons.js:298-314): `livePerf = !paper && !suspect_pnl && keepActiveRacikan`. Bila `livePerf.length > 0 && % MIN_EVOLVE_POSITIONS(=5) === 0` → cek `config.learning?.evolveEnabled === false` (305): FROZEN → log only, NO user-config write; else `evolveThresholds(livePerf, config)` (309) → bila changes non-empty → `reloadScreeningThresholds()` (311) re-baca ke live config. Darwin (317-322) terpisah, gated `config.darwin?.enabled` — INDEPENDEN dari evolveEnabled. `MIN_EVOLVE_POSITIONS=5` konstanta hardcoded (21), BUKAN config.
3. **keepActiveRacikan chokepoint isolasi per-racikan di entry fungsi.** `evolveThresholds` baris 462: `perfData = (perfData || []).filter(keepActiveRacikan)`. `(p?.active_setup ?? null) === (config.activeSetup ?? null)` (893-895). Jadi: auto-loop (livePerf sudah filtered di 298) DAN manual `/evolve` (passes raw `lessonsData.performance` 364 record di index.js:3836) KEDUA-DUANYA di-filter ulang di 462 → hanya active racikan dipakai. **Koreksi temuan lama**: claim PLAN "Tak filter active_setup → 84 record lama campur 61 mainzen_v2" = STALE. Filter ADA. 84 record null = ARSIP terpisah (`lessons-archive-pre-mainzen_v2.json`, `load()` 106-115 tak baca arsip) → tak pernah masuk `performance[]`. Data live saat ini: 364 record = 93 `mainzen_v2` + 271 `mainzen_v2_1` (0 paper, 0 suspect). activeSetup=mainzen_v2_1 → evolve lihat 271.
4. **Persist = direct write user-config.json + reloadScreeningThresholds + summary lesson.** `evolveThresholds` baca `user-config.json` (544), `Object.assign(userConfig, changes)` (547) + meta `_lastEvolved`/`_positionsAtEvolution` (548-549), `fs.writeFileSync` sync (551). Lalu mutasi live `config.screening` langsung (554-556). Caller dispatch panggil `reloadScreeningThresholds()` (311) = re-baca `user-config.json` ke live config (config.js:606-657, ~25 key screening subset + promptNotes/activeSetup/evolveEnabled/sizingMode/rentPerPositionSol/minBinsBelow). Summary lesson di-push ke `lessons.json.lessons[]` (560-566) dengan `outcome:"manual"`, tags `["evolution","config_change"]` → FEED `getLessonsForPrompt` (F22) → inject prompt SCREENER.
5. **Live state + caller safety.** `user-config.json` saat audit: `activeSetup=mainzen_v2_1`, `evolveEnabled=undefined` (→ default `true` di config.js:313 → AUTO-evolve TIDAK dibekukan), `darwin=undefined` (→ Darwin AUTO skip). 3 caller `recordPerformance` (paper dlmm.js:1693 / relay :2348 / public :2652) semua wrap try-catch (1692/2336/2640) → evolve throw = caught, entry sudah persist di 256 sebelum dispatch 290, derived_lesson=null → notifyClose lesson missing (minor). **F19 Open-Q #1 (evolve try-catch gap) RESOLVED**: caller catch, non-fatal.

## Progress
- [x] Spec F20 baca PLAN-audit-meridian.md Bagian 3 line 75
- [x] Cross-ref F19 (trigger + keepActiveRacikan + livePerf), F21 (Darwin split), F22 (summary lesson consumer), F26 (config defaults), F28 (reload detail)
- [x] Baca lessons.js 1-30 (konstanta MIN_EVOLVE_POSITIONS + MAX_CHANGE_PER_STEP + PERFORMANCE_SIGNAL_FIELDS)
- [x] Baca lessons.js 156-205 (recordPerformance compute + suspect scan)
- [x] Baca lessons.js 290-339 (evolve dispatch + Darwin split + hive event)
- [x] Baca lessons.js 458-570 (evolveThresholds full body)
- [x] Baca lessons.js 574-592 (helpers: isFiniteNum/avg/clamp/nudge)
- [x] Baca lessons.js 888-985 (keepActiveRacikan + getAllPerformance + getArchivedPerformance + getLifetimePerformance + getPerformanceForRacikan + listRacikanInPerformance + getModePerformance + getSuspectCount)
- [x] Baca lessons.js 1007-1035 (getPerformanceSummary — /evolve guard)
- [x] Baca config.js 600-666 (reloadScreeningThresholds full)
- [x] Baca config.js 308-313 (evolveEnabled default true)
- [x] Baca index.js 3810-3848 (manual /evolve + /evolve force)
- [x] Verifikasi caller try-catch: dlmm.js 1691-1731 (paper), 2336-2431 (relay), 2640-2756 (public)
- [x] Verifikasi data live: lessons.json 364 record (93 mainzen_v2 + 271 mainzen_v2_1), archive 84 null separate
- [x] Verifikasi user-config.json live: activeSetup=mainzen_v2_1, evolveEnabled=undefined, darwin=undefined
- [x] Koreksi temuan stale PLAN "84 lama campur" → filter ada, archive isolated
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Pasar ikan dg aturan masuk yang menyesuaikan*: bos lama-lama belajar dari hasil jualan. Kalau 5 transaksi terakhir rata-rata rugi di ikan murah, bos naikkan harga-minimum-yang-boleh-masuk (gak beli ikan < X). Tapi bos cuma bisa NAIKKAN harga-minimum, tidak pernah menurunkan lewat aturan otomatis ini — sekali dinaikkan, gak balik. Maks 20% kenaikan per putaran. Bos juga cuma hitung transaksi "rasa-racikan-hari-ini" (mainzen_v2_1), bukan catatan lama mainzen_v2. Bos cadangkan tombol darurat: `/evolve force` = paksa jalan sekali walau aturan dibekukan.
- *Pelatih yang naikkan standar latihan*: tim kalah 2x di lawan organic-score rendah → pelatih naikkan batas organic minimum utk match berikutnya. Tapi pelatih HANYA bisa naikkan, tak pernah turun. Kalau salah naikkan terlalu tinggi, pemain tak qualified → tim main sedikit → data datang lambat → susah koreksi. Standar terkunci naik. Bos manual harus turunkan tangan.

**Di bot, ini = auto-evolve threshold writer** (1-2 kalimat)
`evolveThresholds(perfData, config)` `lessons.js:458` = fungsi satu-satunya yang tulis-otomatis `minFeeActiveTvlRatio` + `minOrganic` ke `user-config.json` berdasar PnL closed-position. Dipicu tiap 5 close LIVE active-racikan oleh `recordPerformance` (299). RAISE-only ratchet + cap 20%/step + clamp.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F19 (recordPerformance push entry + save 256, lalu dispatch 290). Sebelum F21 (Darwin recalcWeights terpisah — dispatch 317 di blok yang sama tapi toggle berbeda), F22 (summary lesson di-push 560 → `getLessonsForPrompt` inject prompt), F26 (config.screening defaults + evolveEnabled), F28 (reloadScreeningThresholds detail). F20 = JANTUNG auto-tuning: tiap 5 close, bot ubah ambang screen berdasar winner/loser distribution. Tanpa F20, screening thresholds static — bot tak pernah belajarkan "kolam fee rendah = rugi" dari data sendiri. Dengan FREEZE (evolveEnabled=false), F20 dimatikan, threshold manual.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Trigger**: `recordPerformance` selesai push entry + `save(data)` (256) → hitung `livePerf = data.performance.filter(!paper && !suspect_pnl && keepActiveRacikan)` (298).
2. **Gate cadence**: `livePerf.length > 0 && livePerf.length % MIN_EVOLVE_POSITIONS(=5) === 0` (299). Mis 271 record mainzen_v2_1 → 271 % 5 = 1 ≠ 0 → skip. Next evolve di 275 close.
3. **Gate FREEZE**: `config.learning?.evolveEnabled === false` (305) → log "frozen" + skip user-config write. Toggle false = FREEZE baseline.
4. **Call**: `evolveThresholds(livePerf, config)` (309) → filter `keepActiveRacikan` ulang di 462 (redundant aman untuk manual path) → cek `length < 5` return null (463).
5. **Bucket**: `winners = pnl_pct > 0` (465), `losers = pnl_pct < -5` (466). hasSignal = `winners≥2 OR losers≥2` (469) else return null.
6. **minFeeActiveTvlRatio path-A** (482-494): winnerFees≥2 + `minWinnerFee > current×1.2` → target `minWinner×0.85`, `nudge(current, target, 0.20)`, clamp `[0.05,10.0]`, round 2 desimal. Bila `rounded > current` → tulis `changes.minFeeActiveTvlRatio` + rationale.
7. **minFeeActiveTvlRatio path-B** (496-512): loserFees≥2 + `maxLoserFee < current×1.5` + `minWinnerFee > maxLoserFee` + path-A belum jalan (`!changes.minFeeActiveTvlRatio`) → target `maxLoser×1.2`, nudge, clamp. Raise.
8. **minOrganic** (522-536): loserOrganics≥2 + winnerOrganics≥1 + `avgWinner − avgLoser ≥ 10` → target `max(minWinner−3, current)`, nudge, round, clamp `[60,90]`. Bila `newVal > current` → tulis.
9. **No changes**: `Object.keys(changes).length === 0` (539) → return `{changes:{}, rationale:{}}` (NO persist, NO lesson push).
10. **Persist user-config**: baca `user-config.json` (544), `Object.assign(userConfig, changes)` (547) + meta `_lastEvolved` + `_positionsAtEvolution` (548-549), `fs.writeFileSync` sync (551).
11. **Mutasi live config**: `config.screening.minFeeActiveTvlRatio = changes.minFeeActiveTvlRatio` (555) + `config.screening.minOrganic = changes.minOrganic` (556) langsung.
12. **Summary lesson push**: `data.lessons.push({id:Date.now(), rule:"[AUTO-EVOLVED @ N positions] key=val — rationale", tags:["evolution","config_change"], outcome:"manual", created_at})` (560-566) → `save(data)` (567).
13. **Return** `{changes, rationale}` (569) → dispatch (309) → bila changes non-empty → `reloadScreeningThresholds()` (311) re-baca user-config ke live config (config.js:606-657).
14. **Downstream**: summary lesson → `getLessonsForPrompt` (F22) → prompt SCREENER. Threshold baru → screening filter (F14) → kolam eligible berubah.

**Output evolveThresholds**: `{changes, rationale}` atau null/`{changes:{},rationale:{}}` + side-effect mutate user-config.json (thresholds + meta) + live config.screening + lessons.json (summary lesson). Trigger ke F22 (lesson prompt) + F14 (screening uses new thresholds).

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
Evolve throw (e.g. user-config.json parse-fail saat baca 544, atau fs.writeFileSync permission) → propagate ke `recordPerformance` (tak ada try-catch di blok 290-324) → propagate ke caller `closePosition` (dlmm.js 2348/2652/1693) → caught di 2431/2756/1731 `relayError`/`error`/`paper_warn`. Entry sudah persist (save 256 sebelum dispatch 290) — data aman. Tapi `derived_lesson=null` → `notifyClose` (executor.js:803) kirim close notif tanpa lesson. Minor. Bila `reloadScreeningThresholds` throw (catch di config.js:657 swallow) → live config tetap pakai nilai lama (554-556 sudah apply langsung sebelum reload, jadi live config OK walau reload gagal). Bila evolve raise minFee terlalu tinggi → kolam eligible shrink → SCREENER starve → sedikit close → data datang lambat → susah koreksi (ratchet self-reinforcing, lihat §E bug #2).

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **RAISE-only ratchet** — `evolveThresholds` cuma tulis `rounded > current`. Sekali naik, tak balik turun via evolve. Lower = hand-edit user-config.
- **MAX_CHANGE_PER_STEP** — konstanta 0.20 (lessons.js:22). Cap per-step: threshold tak shift > 20% dalam 1 evolve.
- **nudge(current, target, maxChange)** — helper (587): move current toward target by at most `current×maxChange`. Bila delta ≤ maxDelta → target; else `current + sign(delta)×maxDelta`.
- **clamp(val, min, max)** — helper (582): `Math.max(min, Math.min(max, val))`. Fee [0.05, 10.0], organic [60, 90].
- **hasSignal gate** — `winners≥2 OR losers≥2` (469). Tanpa sinyal cukup, return null (no evolve).
- **keepActiveRacikan chokepoint** — filter di 462. `(p.active_setup ?? null) === (config.activeSetup ?? null)`. Isolasi per-racikan di entry fungsi (bukan cuma di dispatch).
- **evolveEnabled (FREEZE)** — `config.learning.evolveEnabled`. Default `true` (config.js:313). `false` = FROZEN: auto-trigger skip user-config write. Manual `/evolve` refuses; `/evolve force` override.
- **MIN_EVOLVE_POSITIONS** — konstanta 5 (lessons.js:21). Pemicu cadence. Hardcoded, bukan config.
- **summary lesson** — record di `lessons.json.lessons[]` push setelah evolve (560). `outcome:"manual"`, tags `["evolution","config_change"]`. Feed prompt via `getLessonsForPrompt` (F22).
- **_lastEvolved / _positionsAtEvolution** — meta field di root user-config.json (548-549). Persist tapi UNKNOWN apakah dibaca kode (grep tak ketemu consumer — decorative?).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta file fase ini (tabel file → peran)

| File | Peran di F20 | Baris kunci |
|------|--------------|-------------|
| `lessons.js` | Jantung evolve: definisi `evolveThresholds` + dispatch di `recordPerformance` + helpers + keepActiveRacikan chokepoint + getPerformanceSummary (/evolve guard) + load/getAllPerformance (data source) | 21, 22, 156-339, 458-570, 574-592, 893-895, 899-901, 903-928, 1007-1035 |
| `config.js` | `reloadScreeningThresholds` re-baca user-config ke live config + `evolveEnabled` default + `config.activeSetup` singleton + `update_config` persist path (cross-ref F28) | 115, 308-313, 519, 531, 606-657 |
| `index.js` | Manual `/evolve` + `/evolve force` REPL command + `formatFullConfig` GRUP display `evolveEnabled` + `/settings` toggle | 13, 15, 1930, 2429, 3608, 3810-3848 |
| `tools/dlmm.js` | 3 caller `recordPerformance` (paper 1693 / relay 2348 / public 2652) — try-catch wrap, evolve throw non-fatal | 1691-1731, 2336-2431, 2640-2756 |
| `paths.js` | `paths.userConfigPath` + `paths.lessonsPath` + `paths.lessonsArchivePath` resolve | (F29 detail) |
| `user-config.json` | Target persist evolve (thresholds + meta `_lastEvolved`/`_positionsAtEvolution`) + `activeSetup` + `learning.evolveEnabled` + `darwin.enabled` | live: activeSetup=mainzen_v2_1, evolveEnabled=undefined |
| `lessons.json` | Sumber data `performance[]` (364 record) + target summary lesson push (560) | 364 = 93 mainzen_v2 + 271 mainzen_v2_1, 0 paper, 0 suspect |
| `lessons-archive-pre-mainzen_v2.json` | Arsip 84 record null active_setup, SEPARATE file. `load()` tak baca. Display-only via `getArchivedPerformance`. | 84 record null |

---

## §B. Alur data hulu→hilir (ASCII diagram)

```
┌──────────────────────────────────────────────────────────────────────┐
│ CLOSE PATH (F10)                                                     │
│  dlmm.js closePosition:                                               │
│   paper 1693 ─┐                                                       │
│   relay  2348 ┼─→ recordPerformance(perf)   lessons.js:156            │
│   public 2652 ─┘      │                                               │
│                       ├─ compute pnl_usd/pct/range_eff (175-181)     │
│                       ├─ suspect_pnl scan (190-220) — flag + alert   │
│                       ├─ buildSignalSnapshot (121) — 15 fields       │
│                       ├─ data.performance.push(entry) (243)          │
│                       ├─ derivLesson → data.lessons.push (250)       │
│                       ├─ save(data) (256) ← ENTRY PERSIST DI SINI    │
│                       │                                               │
│                       ├─ livePerf filter (298)                       │
│                       │   !paper && !suspect_pnl && keepActiveRacikan│
│                       │                                               │
│                       ├─ if length>0 && %5===0 (299)  ─── NO ──→ skip│
│                       │       │ YES                                   │
│                       │       ▼                                       │
│                       ├─ evolveEnabled===false? (305)                │
│                       │       │ YES → log "frozen", skip write       │
│                       │       │ NO                                    │
│                       │       ▼                                       │
│                       ├─ evolveThresholds(livePerf, config) (309)    │
│                       │       │                                       │
│                       │       ├─ filter keepActiveRacikan (462)      │
│                       │       ├─ length<5? → return null (463)       │
│                       │       ├─ winners/losers bucket (465-466)     │
│                       │       ├─ hasSignal? (469) → return null      │
│                       │       ├─ minFee path-A (482-494) RAISE       │
│                       │       ├─ minFee path-B (496-512) RAISE       │
│                       │       ├─ minOrganic (522-536) RAISE          │
│                       │       ├─ no changes? → return {empty} (539) │
│                       │       ├─ read user-config.json (544)         │
│                       │       ├─ Object.assign + meta (547-549)      │
│                       │       ├─ fs.writeFileSync (551) ← PERSIST    │
│                       │       ├─ mutate config.screening (554-556)   │
│                       │       ├─ push summary lesson (560-566)      │
│                       │       ├─ save(data) (567)                    │
│                       │       └─ return {changes, rationale} (569)   │
│                       │                                               │
│                       ├─ changes non-empty? (310)                    │
│                       │       │ YES                                   │
│                       │       ▼                                       │
│                       ├─ reloadScreeningThresholds() (311)           │
│                       │   config.js:606-657                          │
│                       │   re-baca user-config → live config.screening│
│                       │   (fail-open try/catch 657)                  │
│                       │                                               │
│                       ├─ darwin?.enabled? (317) → F21 terpisah       │
│                       ├─ hive event push (328-335)                   │
│                       └─ return lesson||null (337)                   │
│                                                                       │
│  Caller catch (1691/2336/2640): evolve throw → caught                │
│  entry persist aman (save 256 sebelum dispatch 290)                  │
│  derived_lesson=null → notifyClose (executor.js:803) kirim tanpa lesson│
└──────────────────────────────────────────────────────────────────────┘

DATA LIVE (saat audit):
  lessons.json performance[] = 364 record
    ├─ mainzen_v2:   93   (active_setup match bila config.activeSetup=mainzen_v2)
    ├─ mainzen_v2_1: 271  (active_setup match bila config.activeSetup=mainzen_v2_1) ← LIVE
    ├─ paper:        0
    └─ suspect_pnl:  0
  archive (separate file) = 84 null  ← tak pernah load()
  config.activeSetup = mainzen_v2_1
  → livePerf (dispatch 298) = 271 record
  → evolveThresholds chokepoint 462 = 271 record
  → 271 % 5 = 1 ≠ 0 → next auto-evolve di 275 close
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| `recordPerformance` dispatch (lessons.js:309) | `evolveThresholds(livePerf, config)` (lessons.js:458) | `livePerf.length % 5 === 0` + `evolveEnabled !== false` | `livePerf` array (filtered) + `config` objek (mutated) | Throw → propagate ke caller closePosition catch (non-fatal, entry persist) |
| `recordPerformance` dispatch (lessons.js:311) | `reloadScreeningThresholds()` (config.js:606) | `result.changes` non-empty | (no args — re-baca user-config.json) | Throw → caught di config.js:657 swallow, live config tetap (554-556 sudah apply) |
| `index.js` manual `/evolve` (3836) | `evolveThresholds(lessonsData.performance, config)` (458) | Operator ketik `/evolve` atau `/evolve force` | RAW 364 record (all racikan) + config | Filtered di 462 → active only. Throw → caught `runBusy` (UNKNOWN, perlu cek) |
| `index.js` manual `/evolve` (3840) | `reloadScreeningThresholds()` (config.js:606) | `result.changes` non-empty | (no args) | Swallow di 657 |
| `evolveThresholds` (551) | `fs.writeFileSync(USER_CONFIG_PATH, ...)` | changes non-empty | JSON userConfig + meta | Throw (EACCES/ENOSPC) → propagate. UNKNOWN recovery (caller catch) |
| `evolveThresholds` (554-556) | mutate `config.screening.minFee/minOrganic` | post-write | langsung ke singleton | Mutasi in-place, no fail |
| `evolveThresholds` (560-567) | `data.lessons.push(summary) + save(data)` | post-write | summary lesson objek | save throw → propagate |
| `config.js:reloadScreeningThresholds` (608) | `readJsonIfExists(USER_CONFIG_PATH)` | dipanggil oleh evolve dispatch/manual | (no args) | try/catch 657 swallow → live config tak di-reload (tapi 554-556 sudah apply) |
| `recordPerformance` (298) | `keepActiveRacikan(p)` inline filter | tiap close | perf record | `(p?.active_setup ?? null) === (config.activeSetup ?? null)` — pure, no fail |
| `evolveThresholds` (462) | `keepActiveRacikan(p)` chokepoint | entry fungsi | perfData array | Pure, no fail |
| `closePosition` paper (dlmm.js:1693) | `recordPerformance(perf)` (156) | paper close | perf payload + paper:true | try 1692 / catch 1731 `paper_warn` |
| `closePosition` relay (dlmm.js:2348) | `recordPerformance(perf)` (156) | relay close | perf payload + relay:true | try 2336 / catch 2431 `relayError` |
| `closePosition` public (dlmm.js:2652) | `recordPerformance(perf)` (156) | public close | perf payload | try 2640 / catch 2756 `error` |

---

## §D. Logika kunci per fungsi

### `evolveThresholds(perfData, config)` (lessons.js:458-570)
- **Apa**: Satu-satunya penulis-otomatis threshold screening (minFeeActiveTvlRatio + minOrganic) berdasar PnL closed-position.
- **Kapan dipicu**: (a) Auto — `recordPerformance` dispatch tiap 5 close LIVE active-racikan (299), gated `evolveEnabled !== false`; (b) Manual — `/evolve` atau `/evolve force` REPL (index.js:3836).
- **Output**: `{changes, rationale}` atau `null` (length<5) atau `{changes:{},rationale:{}}` (no changes). Side-effect: write user-config.json + mutate config.screening + push summary lesson.
- **Sinkron**: Dispatch (309) → changes non-empty → `reloadScreeningThresholds` (311) re-baca ke live config. Manual path (3840) sama.
- **Fail-mode**: Throw di 544/551/560 → propagate ke caller catch. Entry close sudah persist aman (save 256 di recordPerformance sebelum dispatch 290).
- **Bukti**: lessons.js:458-570.

### `recordPerformance` dispatch block (lessons.js:290-324)
- **Apa**: Trigger evolve + Darwin + hive event setelah entry persist.
- **Kapan dipicu**: Setiap `recordPerformance` call, setelah `save(data)` (256).
- **Output**: side-effect (evolve write user-config + Darwin recalc + hive push). Return lesson di 337.
- **Sinkron**: `livePerf` filter (298) = `!paper && !suspect_pnl && keepActiveRacikan`. Cadence `%5===0`. FREEZE gate 305. Darwin INDEPENDEN 317 (toggle `darwin.enabled` terpisah dari `evolveEnabled`).
- **Fail-mode**: NO try-catch di blok 290-324. Evolve throw → propagate. F19 Open-Q #1 RESOLVED: caller catch.
- **Bukti**: lessons.js:290-324.

### `keepActiveRacikan(p)` (lessons.js:893-895)
- **Apa**: Filter chokepoint isolasi per-racikan. `(p?.active_setup ?? null) === (config.activeSetup ?? null)`.
- **Kapan dipicu**: Dipanggil di `recordPerformance` livePerf filter (298), `evolveThresholds` entry (462), `getModePerformance` (972), `getExcludedRacikanStats` (998), `getHourlyProfile` (1050), `getNarrativeProfile` (1155), `getPerformanceSummary` (1012), `getSuspectCount` (984).
- **Output**: boolean.
- **Sinkron**: `config.activeSetup` singleton (config.js:115 baca saat startup, 639 reload). Record `active_setup` di-stamp di deploy (state.js:151) + di-spread ke close path (dlmm.js 2150/2444).
- **Fail-mode**: Pure function, no fail. Record `active_setup=null` match hanya saat `config.activeSetup=null` juga.
- **Bukti**: lessons.js:893-895.

### `reloadScreeningThresholds()` (config.js:606-657)
- **Apa**: Re-baca `user-config.json` ke live `config` tanpa restart. ~25 key screening subset + promptNotes/activeSetup/evolveEnabled/sizingMode/rentPerPositionSol/minBinsBelow.
- **Kapan dipicu**: (a) evolve dispatch (311); (b) manual /evolve (3840); (c) `update_config` (cross-ref F28); (d) `applyPreset` (cross-ref F29).
- **Output**: Mutasi `config.screening` + `config.strategy` + `config.promptNotes` + `config.activeSetup` + `config.learning.evolveEnabled` + `config.management.sizingMode/rentPerPositionSol`.
- **Sinkron**: Baca `USER_CONFIG_PATH` (608), apply tiap key `if (fresh.X != null)`. Fail-open try/catch 657.
- **Fail-mode**: Parse-fail / file absent → catch swallow → live config tak di-reload (tapi evolve sudah apply langsung di 554-556 jadi live OK walau reload gagal). GMGN config reload terpisah (658-665).
- **Bukti**: config.js:606-657.

### `getPerformanceSummary()` (lessons.js:1007-1035)
- **Apa**: Headline stats untuk `/status` + `/evolve` guard. Filter `keepActiveRacikan + !suspect_pnl`.
- **Kapan dipicu**: `/evolve` guard (index.js:3828) cek `total_positions_closed < 5`; `/status` (3172, 3692).
- **Output**: `{total_positions_closed, total_pnl_usd, total_invested_usd, roi_pct, avg_pnl_pct, avg_range_efficiency_pct, win_rate_pct, total_lessons}`.
- **Sinkron**: Active-racikan isolated + suspect excluded. `total_positions_closed` = active racikan only.
- **Fail-mode**: `p.length === 0` → return null (1014). /evolve guard handle null (3829 `perf?.total_positions_closed || 0`).
- **Bukti**: lessons.js:1007-1035.

### Manual `/evolve` + `/evolve force` (index.js:3810-3848)
- **Apa**: Operator trigger evolve sekali jalan. `/evolve` plain = refuses if frozen; `/evolve force` = override.
- **Kapan dipicu**: REPL input.
- **Output**: Console log thresholds evolved + "Saved to user-config.json. Applied immediately."
- **Sinkron**: Baca raw `lessonsData.performance` (364 record) → `evolveThresholds` filter di 462 → 271 active. Guard 3828 pakai `getPerformanceSummary` (active-only) — konsisten.
- **Fail-mode**: Frozen + plain → refuses (3818-3822). Frozen + force → warning + jalan (3824-3827). `result.changes` empty → "No threshold changes needed" (3837-3838).
- **Bukti**: index.js:3810-3848.

### Helpers (lessons.js:574-592)
- `isFiniteNum(n)` (574): `typeof number && isFinite`. Filter NaN/non-number di fee/organic array.
- `avg(arr)` (578): reduce sum / length. Untuk `avgWinnerOrganic`/`avgLoserOrganic` (523-524).
- `clamp(val, min, max)` (582): `Math.max(min, Math.min(max, val))`. Fee `[0.05,10.0]`, organic `[60,90]`.
- `nudge(current, target, maxChange)` (587): `delta = target-current`, `maxDelta = current×maxChange`. Bila `|delta| ≤ maxDelta` → target; else `current + sign(delta)×maxDelta`. Cap 20% per step.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### Kontrak kunci
1. **RAISE-only ratchet (by design)**. `evolveThresholds` cuma tulis `if (rounded > current)` (489, 506, 531). Threshold sekali naik, tak balik turun via evolve. Konservatif (jangan asal turun dari data noisy). Lower = hand-edit user-config. BUKAN bug — design choice. Tapi lihat #2 self-reinforcing risk.
2. **keepActiveRacikan chokepoint ganda**. Filter di dispatch (298) + ulang di entry fungsi (462). Redundant untuk auto-loop (livePerf sudah filtered), TAPI penting untuk manual `/evolve` yang passes raw 364 record. Defense-in-depth. PASS.
3. **FREEZE gate lengkap**. `evolveEnabled===false` (305) → skip user-config write + skip reloadScreeningThresholds + skip summary lesson (sebenarnya: bila dispatch 309 tak jalan, summary 560 juga tak jalan). Manual `/evolve` plain refuses (3818). `/evolve force` override (3824). Darwin INDEPENDEN (317) — toggle terpisah. PASS.
4. **caller catch semua 3 path**. Paper 1691-1731, relay 2336-2431, public 2640-2756. Evolve throw → caught, entry persist aman. F19 Open-Q #1 RESOLVED. PASS.

### Bug / gap
5. **STALE: claim "84 record lama campur 61 mainzen_v2" (PLAN row F20 + F19 §G) KOREKSI**. Filter `keepActiveRacikan` ADA (462). Archive 84 null = SEPARATE file `lessons-archive-pre-mainzen_v2.json`, `load()` (106-115) hanya baca `lessons.json`. `getAllPerformance()` (899-901) return `load().performance` (364 record), tak merge archive. `getArchivedPerformance()` (910) display-only. Data live: 93 mainzen_v2 + 271 mainzen_v2_1 = 364. activeSetup=mainzen_v2_1 → evolve lihat 271 record. **Bug lama SUDAH TERATASI** (archive reset + keepActiveRacikan). Update: PLAN perlu koreksi.
6. **Self-reinforcing ratchet risk**. RAISE-only + SCREENER starve loop. Bila evolve naik minFee terlalu tinggi (e.g. winner-streak fluktuasi) → kolam eligible shrink → SCREENER deploy sedikit → sedikit close → data datang lambat → susah koreksi (no lower path). Mitigasi: cap 20%/step + clamp [0.05,10]/[60,90] jaga agar tak melompat. Tapi bila dibiarkan lama tanpa hand-edit, bisa stuck di high floor. UNKNOWN apakah terjadi di live (perlu sampling F24). Severity P2 (design trade-off, bukan bug).
7. **minFee path-B asymmetric "losers high fee = noise"** (497-512 comment). Kalau losers punya fee_tvl TINGGI (pump-crash pattern), path-B skip raise. Cuma low-fee losers trigger raise. Artinya: bila rugi dominan dari pump-crash high-fee, evolve tak naikkan minFee. Sinyal narrow. Bisa miss pattern. Severity P2 (design, bukan bug — comment aware).
8. **hasSignal OR-logic asymmetry** (469). `winners≥2 OR losers≥2`. Bila 2 winners 0 losers → still evolve minFee path-A. Tapi minOrganic butuh `loserOrganics≥2 AND winnerOrganics≥1` (522) → minOrganic butuh losers. Jadi: minFee bisa evolve tanpa loser data, minOrganic tidak. Asymmetric. Severity P2.
9. **`MIN_EVOLVE_POSITIONS=5` + `gap ≥10` organic hardcoded** (21, 526). Bukan config. Sama kayak F19 temuan #6. User tak bisa tune cadence/gap tanpa recompile. Severity P2 (terdokumentasi, by-design).
10. **clamp organic [60,90] override user floor** (530). Bila user set `minOrganic=55` di user-config, evolve clamp ke 60 minimum → silently raises. Bukan bug (industry floor), tapi override user intent. Severity info.
11. **`_lastEvolved`/`_positionsAtEvolution` meta fields decorative?** (548-549). Persist ke root user-config.json. Grep tak ketemu consumer. Mungkin utk debugging post-hoc. UNKNOWN. Severity info.
12. **Summary lesson FEED prompt (F22 cross-ref)** (560-566). Push ke `lessons.json.lessons[]` dengan `outcome:"manual"`. `getLessonsForPrompt` (F22) baca lessons[] → inject prompt SCREENER. Tiap evolve = 1 lesson baru masuk prompt. Akumulasi: 271 record mainzen_v2_1, tiap 5 close = 1 evolve = 1 summary lesson. Bila banyak evolve, prompt bisa penuh lesson "AUTO-EVOLVED". UNKNOWN apakah `getLessonsForPrompt` cap/dedupe. F22 harus verifikasi. Severity P1 (potential prompt bloat).
13. **persist race window** (544-551). `evolveThresholds` baca user-config (544), mutasi, write (551). Single-threaded JS mitigates, TAPI `update_config` (config.js:519) dari chat bisa interleave di async window antara baca (544) dan write (551) kalau `recordPerformance` await di tengah. UNKNOWN: `evolveThresholds` sync (no await inside 458-570), jadi window = fungsi eksekusi time = trivial. `update_config` juga sync write. Race sangat sempit. Severity info (theoretical).
14. **reloadScreeningThresholds partial** (config.js:606-657). Cuma reload screening subset + listed keys. Bila user hand-edit key di luar subset (e.g. deployAmountSol, gasReserve) antara evolve write + reload, key itu NOT applied oleh reload (hanya di startup). Documented behavior (F28 detail). Bukan bug.
15. **live config: `evolveEnabled=undefined` (→ default true = NOT frozen)**. user-config.json tidak set `learning.evolveEnabled`. config.js:313 default `?? true`. Jadi auto-evolve AKTIF di repo ini. Berbeda dari freeze-evolve-progress.md (meridianzen2) yang set false. Bisa jadi intentional (repo v2 pengen auto-evolve) atau lupa set. UNKNOWN intent operator. Severity info (verifikasi: `/config` GRUP learning baris evolveEnabled tampil "aktif").

### Fail-open tak-terpenuhi
16. **reloadScreeningThresholds fail-open**: try/catch 657 swallow. PASS — live config tetap (554-556 apply langsung). Reload gagal = no-op.
17. **evolve dispatch NO local try-catch** (290-324). Throw propagate ke caller. TAPI caller catch (1691/2336/2640). Jadi fail-open via caller, bukan lokal. ACCEPTABLE (caller-bound). Severity info — F19 Open-Q #1 RESOLVED.
18. **manual `/evolve` try-catch?** (3811 `runBusy`). `runBusy` wrapper UNKNOWN — perlu cek apakah wrap try-catch atau throw ke REPL top-level. Bila throw → crash REPL? Severity P2 (verifikasi F22/F30 — operator path).

---

## §F. Glosarium istilah fase
- **evolveThresholds** — `lessons.js:458`. Satu-satunya penulis-otomatis threshold screening. RAISE-only. 2 key: minFeeActiveTvlRatio + minOrganic.
- **RAISE-only ratchet** — threshold cuma naik, tak turun via evolve. `if (rounded > current)`.
- **MAX_CHANGE_PER_STEP** — konstanta 0.20 (lessons.js:22). Cap 20% per evolve step.
- **nudge / clamp** — helper (582/587). nudge = move toward target capped; clamp = batas min/max.
- **hasSignal gate** — `winners≥2 OR losers≥2` (469). Tanpa sinyal, return null.
- **keepActiveRacikan chokepoint** — filter di 462. `(p.active_setup ?? null) === (config.activeSetup ?? null)`.
- **evolveEnabled (FREEZE)** — `config.learning.evolveEnabled`. Default true. false = FROZEN.
- **MIN_EVOLVE_POSITIONS** — konstanta 5 (21). Cadence auto-evolve.
- **summary lesson** — record di `lessons.json.lessons[]` (560). `outcome:"manual"`, tags `["evolution","config_change"]`. Feed prompt F22.
- **_lastEvolved / _positionsAtEvolution** — meta field root user-config.json (548-549). Decorative.
- **reloadScreeningThresholds** — `config.js:606`. Re-baca user-config ke live config tanpa restart.
- **getPerformanceSummary** — `lessons.js:1007`. Headline stats active-racikan + !suspect. /evolve guard.
- **getArchivedPerformance** — `lessons.js:910`. 84 null record display-only. Tak feed evolve.
- **getLifetimePerformance** — `lessons.js:926`. Archive + live (paper excluded) utk `/report all`. Mixed racikan, display-only.
- **livePerf** — `recordPerformance` filter (298): `!paper && !suspect_pnl && keepActiveRacikan`. Sumber data evolve.
- **path-A / path-B (minFee)** — path-A: winner-consensus raise (482-494). path-B: loser-low-fee raise (496-512). path-B only if path-A skip.

---

## §G. Link fase lain (cross-ref)
- **F19**: recordPerformance trigger dispatch (290-324) + keepActiveRacikan + livePerf filter. F20 = downstream fungsi yang dipanggil dispatch.
- **F21**: Darwin `recalculateWeights` (317-322) terpisah — toggle `darwin.enabled` INDEPENDEN dari `evolveEnabled`. F20 dispatch bareng F21, tapi toggle berbeda. F21 detail signal-weights recalc.
- **F22**: `getLessonsForPrompt` baca summary lesson (560) → inject prompt SCREENER. F20 supply summary lesson, F22 manipulasi + cap/dedupe (verifikasi). Juga `getModePerformance` (963) mode-scoped — F22 konsumer.
- **F23**: pool-memory `recordPoolDeploy` (F19 dispatch 265) — terpisah dari evolve. F20 tak interaksi langsung.
- **F24**: reports.js consume performance[] utk PF/DD. F20 summary lesson masuk lessons[] (bukan performance[]) — F24 baca performance[], tak langsung konsumsi summary. Tapi threshold hasil evolve ngaruh ke screening → ngaruh future performance.
- **F25**: briefing `getModePerformance` trade-stats. F20 summary lesson muncul di "cleaned lessons 24h" count (config-change audit excluded → counted). Verifikasi F25.
- **F26**: `config.screening` defaults 165-key + `config.learning.evolveEnabled` default + `config.activeSetup` singleton + `config.darwin.enabled`. F20 pakai semua.
- **F28**: `reloadScreeningThresholds` detail (config.js:606) + `update_config` persist path (519). F20 panggil reload pasca-write.
- **F29**: `applyPreset` (preset-manager.js:133) swap user-config — timing relatif evolve write? Bila preset swap di tengah recordPerformance await → user-config berubah → evolve baca config baru. UNKNOWN window. F29 verifikasi.
- **F30**: notifyClose (executor.js:803) kirim lesson. Evolve throw → derived_lesson=null → notifyClose tanpa lesson. Minor.
- **F14**: screening.js pakai `config.screening.minFeeActiveTvlRatio` + `minOrganic` sebagai hard-filter. Threshold hasil evolve langsung ngaruh ke kolam eligible.

---

## §H. Open-Q (bawa ke fase berikutnya)
- **Summary lesson prompt bloat** (temuan #12) — `getLessonsForPrompt` (F22) cap/dedupe summary lesson `outcome:"manual"`? Bila 271 close → ~54 evolve → ~54 summary lesson di prompt. F22 verifikasi apakah di-filter (e.g. "evolution" tag di-skip) atau di-cap. Severity P1.
- **`runBusy` try-catch di manual /evolve** (temuan #18) — `/evolve` throw (e.g. user-config EACCES) ke `runBusy` (3811). Apakah `runBusy` wrap try-catch? Bila tidak, REPL crash? F22/F30 verifikasi operator path.
- **Self-reinforcing ratchet di live** (temuan #6) — sampling data: berapa kali evolve jalan di 271 record mainzen_v2_1? Threshold naik berapa kali? Ada stuck di high floor? F24 (data audit) sampling `_lastEvolved` + threshold history.
- **`_lastEvolved`/`_positionsAtEvolution` consumer** (temuan #11) — grep repo-wide. Ada `/evolve-status` baca? Atau briefing tampil? Atau murni decorative? F25 verifikasi.
- **Darwin live state** — `darwin=undefined` di user-config → `config.darwin?.enabled` falsy → Darwin AUTO skip. Apakah intentional? F21 verifikasi default + operator intent.
- **evolveEnabled default true vs freeze-evolve-progress.md** (temuan #15) — repo v2 (meridianzen) NOT frozen, repo v3 (meridianzen2) frozen. Intentional? Atau lupa set? Operator clarifikasi.
- **`activeSetup=mainzen_v2_1` + 93 mainzen_v2 record** — 93 record mainzen_v2 di lessons.json tapi activeSetup=mainzen_v2_1. mainzen_v2 record tak pernah feed evolve (filtered out). Display-only via `getPerformanceForRacikan("mainzen_v2")`. Sinkron ini OK (isolasi by-design), tapi operator perlu sadar: mainzen_v2 data "dorman" — tak belajarkan prompt/evolve lagi. F22/F24 konfirmasi display path.
- **persist race `update_config` vs evolveThresholds** (temuan #13) — window sempit (sync fungsi), tapi `update_config` dari chat bisa interleave di `recordPerformance` await sebelum dispatch 290. Bila user `/setcfg minFeeActiveTvlRatio 0.3` di window antara close + evolve → user-config berubah → evolve baca nilai baru → write ulang. UNKNOWN konsekuensi (mungkin benign — last-write-wins). F28 verifikasi.
- **manual `/evolve` live vs archive** — `/evolve` baca `lessonsData.performance` (index.js:3835) = `JSON.parse(fs.readFileSync(lessonsPath))` = 364 record (NO archive). Evolve filter 462 → 271 active. Konsisten. TAPI `/report all` (getLifetimePerformance 926) include archive 84. Headline /evolve guard (getPerformanceSummary 1012) exclude archive. Jadi `/report all` tampil 345 (84+271+0paper... actually 84+364? no — getLifetimePerformance = archive + live-non-paper = 84 + 364 = 448). /evolve guard = 271. Beda basis. Verifikasi F24/F25 labeling.

---

> Resume: buka file ini → lihat "## Progress" → lanjut dari `[ ]` terakhir. Audit read-only.
