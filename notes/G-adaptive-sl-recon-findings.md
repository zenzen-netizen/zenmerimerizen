# Workstream 🅶 — Adaptive SL (Loss-Streak Protection) RECON FINDINGS

Bot: MAIN (meridianzen)
Branch: experimental
Mode: READ-ONLY (no code edits, no restart)
Date: 2026-06-29

════════════════════════════════════════════════════════════
FASE 1 — Jalur SL existing (SET / TRACK / EXECUTE)
════════════════════════════════════════════════════════════

## (a) Di mana nilai SL di-SET?

Config field: `stopLossPct` di section `management` dari `user-config.json`.

- Default factory: `-50` (config.js:229)
  `stopLossPct: u.stopLossPct ?? u.emergencyPriceDropPct ?? -50,`
- Racikan presets:
  - setup.js:135  → `stopLossPct: -35`
  - setup.js:164  → `stopLossPct: -40`
  - setup.js:191  → `stopLossPct: -30`
- Config live saat ini: ditentukan oleh user-config.json / racikan aktif.
  Dibaca sebagai `config.management.stopLossPct` di seluruh kode.
- Tervalidasi di config-schema.js:87: `min: -100, max: 0`.
- Tersimpan di `presets/<name>.json` sebagai bagian dari snapshot racikan
  (preset-manager.js = full-file snapshot, jadi stopLossPct rides through save/use/diff).

## (b) Di mana PnL posisi di-BANDINGKAN ke SL tiap cycle?

Ada DUA jalur independen yang cek SL:

**Jalur 1 — `getDeterministicCloseRule()` (index.js:1462)**
  - Dipanggil dari management cycle (index.js:555) dan PnL poller (index.js:1366).
  - Cek SL di index.js:1476:
    `if (!pnlSuspect && position.pnl_pct != null && position.pnl_pct <= managementConfig.stopLossPct)`
    → return `{ action: "CLOSE", rule: 1, reason: "stop loss" }`
  - `pnlSuspect` guard (index.js:1464-1474): kalau PnL ≤−90% tapi posisi
    masih punya value > $0.01, dianggap bad-data → skip semua aturan PnL
    (termasuk SL). Ini mencegah emergency-close berbasis bad-data.

**Jalur 2 — `updatePnlAndCheckExits()` (state.js:549-555)**
  - Cek SL di state.js:550:
    `if (!pnl_pct_suspicious && currentPnlPct != null && mgmtConfig.stopLossPct != null && currentPnlPct <= mgmtConfig.stopLossPct)`
    → return `{ action: "STOP_LOSS", reason: "Stop loss: PnL ... <= ..." }`
  - Jalur ini adalah poll cadangan yang detect exit alert lebih cepat dari
    cycle management berjadwal. Hasil return masuk ke `exitMap` di poller.
  - Trailing TP juga ada di state.js:558-565 (gagal-membayar).

## (c) Di mana exit SL DIEKSEKUSI?

**Fungsi eksekusi: `emergencyCloseDirect(p, reason)` — index.js:1203-1244**

Ini BUKAN jalur LLM — itu direct on-chain close.
  - Memanggil `closePosition({ position_address: p.position, reason })`
    (tools/dlmm.js, jalur relay @:2300 atau local @:2384).
  - closePosition menerima `reason` sebagai `close_reason` yang tersimpan
    permanen di lessons.json via recordPerformance.
  - Post-close: auto-swap base→SOL (index.js:1217) + Telegram notify (:1221).

**Dua trigger ke emergencyCloseDirect:**

1. **PnL Poller** (index.js:1320-1392):
   - Exit alert dari `updatePnlAndCheckExits` → `emergencyCloseDirect(p, exit.reason)` (:1330)
   - `getDeterministicCloseRule` rule 1 (SL) → emergency close langsung, LLM-free, no cooldown (:1368-1377)
   - Non-emergency deterministic close (rule 2-5) → juga direct close (:1380-1391)

2. **Management cycle** (index.js:555-558):
   - `getDeterministicCloseRule` → `actionMap.set(p.position, closeRule)` →
     masuk ke `actionPositions` → LLM MANAGER diinstruksikan close (:601-617).
   - INI JALUR LLM: LLM call `close_position` tool via agent loop.

Jadi SL bisa dieksekusi via DUA path:
  - **Direct (LLM-free)**: poller → emergencyCloseDirect (cepat, < 1 cycle)
  - **Via LLM**: management cycle → LMANAGER call close_position (cycle berjadwal)

## SL: per-racikan, per-posisi, atau global wallet?

**PER-RACIKAN (global dalam racikan aktif).**

- `stopLossPct` adalah field di `config.management` yang dimuat dari
  `user-config.json` / racikan snapshot aktif (config.js:229).
- Saat ganti racikan via `/preset use`, seluruh user-config.json ditukar,
  termasuk `stopLossPct` (preset-manager.js = full-file snapshot).
- `getDeterministicCloseRule(p, config.management)` (index.js:1462) menerima
  `config.management` yang adalah config racikan aktif — jadi SL berlaku
  seragak untuk SEMUA posisi yang aktif di bawah racikan itu.
- TIDAK ada SL per-posisi individual. Semua posisi yang open saat sebuah
  racikan aktif share satu nilai `stopLossPct` yang sama.
- `active_setup` di-stamp saat deploy (state.js:82, :101, :153, :196) dari
  `config.activeSetup` — jadi tiap record performa tahu racikan apa yang
  dipakai saat deploy. Tapi nilai SL-nya sendiri nggak di-stamp per-posisi;
  yang di-stamp cuma nama racikannya.

✅ FASE 1 SELESAI.

════════════════════════════════════════════════════════════
FASE 2 — close-reason LOGGING (GERBANG UTAMA)
════════════════════════════════════════════════════════════

## Apakah alasan close tercatat saat posisi ditutup?

**YA — `close_reason` TERCATAT PERMANEN di lessons.json.**

### Bukti:

1. **recordPerformance()** (lessons.js:155) menerima field `perf.close_reason`
   (dokumentasi @ lessons.js:153: `@param {string} perf.close_reason - Why it was closed`).
   Field ini di-spread ke entry tersimpan: `{ ...perf, ... }` (lessons.js:227).
   Tersimpan permanen di `lessons.json` via `data.performance.push(entry)` (:242) + `save(data)` (:255).

2. **Dua close-path di dlmm.js** — KEDUANYA meneruskan `reason` sebagai `close_reason`:
   - Jalur relay (dlmm.js:2320): `close_reason: reason || "agent decision"`
   - Jalur local (dlmm.js:2624): `close_reason: reason || "agent decision"`
   - Kedua jalur juga kirim `close_reason` ke notifyClose (dlmm.js:2372, :2674)
     dan appendDecision (dlmm.js:2336, :2640).

3. **emergencyCloseDirect** (index.js:1212) memanggil
   `closePosition({ position_address, reason })` → `reason` mengalir dari
   pemanggil:
   - Dari poll exit alert (index.js:1330): `exit.reason` (dari updatePnlAndCheckExits)
   - Dari poll rule 1 SL (index.js:1370): `closeRule.reason` = "stop loss"
   - Dari poll non-emergency (index.js:1382): `closeRule.reason` (mis. "take profit", "OOR", dll.)

4. **classifyCloseRule()** (reports.js:189-200) — pemetaan free-text
   close_reason ke canonical rule:
   - "stop loss" → `stopLoss`
   - "out of range" → `outOfRange (OOR)`
   - "low yield" → `lowYield (R5)`
   - "take profit" → `takeProfit (R2)`
   - "pumped far above range" → `pumpedAboveRange (R3)`
   - "indicator" → `indicatorExit`
   - "trailing tp" atau ("dropped" + "peak") → `trailingTP`
   - else → `manual/lainnya`

5. **Nilai close_reason di data live (240 record):** SEMUA 240 punya close_reason
   terisi. Distribusi (ぐestimasi dari sample yang terbaca):
   - Dominan: "Rule 3: pumped far above range" (~62+), "Rule 5: low yield" (~30+),
     "Trailing TP: peak..." (~80+), "OOR: Out of range..." (~10+)
   - SL eksplisit: ~6 record ("Stop loss: PnL -X% <= -Y%")
   - TP eksplisit: ~5 record ("take profit", "Rule 2: take profit")
   - Banyak wabet reason yang panjang & berbeda format (free-text dari jalur
     yang beda — trailing prepend, exit alert, emergency, LLM).

### Catatan penting:
- close_reason adalah **free-text**, BUKAN enum. Formatnya tidak konsisten
  (lihat distribusi: "Stop loss: PnL -12.16% <= -12%", "Trailing TP: Stop loss...",
  "Rule 3: pumped far above range | bins:...", dll.).
- `classifyCloseRule()` di reports.js sudah canonical-ize untuk laporan, tapi
  nilai mentah yang tersimpan berantakan.
- INI PENTING untuk 🅶: kalau mau hitung "SL berturut" per hari per racikan,
  harus `classifyCloseRule(close_reason) === "stopLoss"` untuk identifikasi.
  Tapi format "Trailing TP: Stop loss: PnL -..." akan ter-classify sebagai
  `stopLoss` (karena .includes("stop loss")) — perlu hati-hati apakah itu
  SL murni atau trailing yang akhirnya SL.

✅ FASE 2 SELESAI. close-reason TERSIMPAN PERMANEN.

════════════════════════════════════════════════════════════
FASE 3 — peak/trough (MFE/MAE) ← UNKNOWN PALING KRUSIAL
════════════════════════════════════════════════════════════

## Vonis DEFINITIF: ADA. Tersimpan permanen.

Ada DUA pasang peak/trough yang di-track dan tersimpan:

### Pasangan 1: `peak_pnl_pct` / `trough_pnl_pct` (PnL MFE/MAE)

- Di-init di `makePositionRecord()` state.js:117-118:
  `peak_pnl_pct: 0, trough_pnl_pct: 0`
- Tracking peak: `queuePeakConfirmation()` (state.js:317) + `resolvePendingPeak()`
  (state.js:348) — ada mekanisme 15s confirmation (anti-flicker).
  - Peak di-update: state.js:327, :358.
- Tracking trough: `updatePnlAndCheckExits()` (state.js:505-510):
  `if (pos.trough_pnl_pct == null || currentPnlPct < pos.trough_pnl_pct) { pos.trough_pnl_pct = currentPnlPct; }`
- **Tersimpan permanen di state.json** (via `save(state)` di state.js:547).
  state.json adalah persistent store (fs.writeFileSync, state.js:47).

### Pasangan 2: `price_peak_pct` / `price_trough_pct` (PRICE MFE/MAE)

- Di-init di state.js:123-124:
  `price_peak_pct: 0, price_trough_pct: 0`
- Tracking di `updatePnlAndCheckExits()` (state.js:515-527):
  - Dihitung dari bin movement: `priceMovePct = ((1 + bin_step/1e4)^(binNow - binEntry) - 1) * 100` (state.js:518)
  - Peak: state.js:519-521
  - Trough: state.js:523-525
- **Tersimpan permanen di state.json** (same save call).

### Transfer ke record performa (lessons.json):

KEDUA PASANGAN di-thread ke `recordPerformance()` saat close:
- Jalur relay (dlmm.js:2311-2314):
  `peak_pnl_pct: tracked.peak_pnl_pct ?? null`
  `trough_pnl_pct: tracked.trough_pnl_pct ?? null`
  `price_peak_pct: tracked.price_peak_pct ?? null`
  `price_trough_pct: tracked.price_trough_pct ?? null`
- Jalur local (dlmm.js:2615-2618): sama persis.
- Tersimpan di `lessons.json` performance[] via spread (lessons.js:227).

### Data live (240 record di lessons.json):
- `peak_pnl_pct`: 240/240 terisi (100%)
- `trough_pnl_pct`: 240/240 terisi (100%)
- `price_peak_pct`: 222/240 terisi (92.5% — 18 record lama kosong)
- `price_trough_pct`: 222/240 terisi (92.5%)

### Konsumen yang sudah ada:
- `reports.js:88-103` — perhitungan movement block: avg_peak, avg_exit,
  giveback, avg_trough, left_on_table.
- `reports.js:111-126` — price_movement block: avg/worst peak/trough,
  winners' deepest dip (MAE), losers' avg dip.
- `reports.js:440-442` — winnersDipDeep guard (anti-naive SL tightening).
- `reports.js:519-527` — recommendation: tighten SL kalau winners pulih dari
  dip lebih dangkal.
- `scripts/backtest-exits.js` — offline backtest SL via `trough_pnl_pct ≤ L`.

### Vonis untuk desain 🅶:
**SL dynamic (clamped, 2× peak-trough) = FEASIBLE SEKARANG.**
Data peak/trough PnL sudah ada 100% dan tersimpan permanen.
Tidak perlu nunggu logging baru untuk desain SL dinamis berbasis MFE/MAE.

✅ FASE 3 SELESAI. peak/trough ADA & TERSIMPAN PERMANEN.

════════════════════════════════════════════════════════════
FASE 4 — avg-win & consecutive-SL: bisa dari data ADA?
════════════════════════════════════════════════════════════

## (a) Bisa hitung AVG-WIN per racikan?

**YA.** Semua field yang dibutuhkan ADA:

- `pnl_pct` — 240/240 terisi (field numerik, win = >0, loss = ≤0).
  Dihitung di recordPerformance (lessons.js:175-177).
  Lokasi: `lessons.json` → `performance[].pnl_pct`.
- `active_setup` (tag racikan) — 240/240 terisi.
  Di-stamp saat deploy dari `config.activeSetup` (state.js:101, :153, :196).
  Distribusi live: `mainzen_v2` = 93, `mainzen_v2_1` = 147.
- Cara bedain win vs loss: `pnl_pct > 0` = win (sudah dipakai di
  groupStats reports.js:246, computeTradeStats reports.js:36-37).
- Fungsi yang sudah lakukan ini: `groupStats(perf, "active_setup")` di
  reports.js:174 → output `by_setup` dengan `avg_pnl_pct`, `win_rate_pct`,
  `net_usd`, `count` per racikan.
  TAPI `by_setup` hanya punya `avg_pnl_pct` (semua), BUKAN `avg_win_pct`
  (winner only). avg-win-per-racikan harus dihitung manual:
  `filter(perf, active_setup=X && pnl_pct > 0) → mean(pnl_pct)`.
  Bisa langsung dari data yang ada — tidak perlu field baru.

**Bukti file:line:**
- `pnl_pct`: dihitung & disimpan di lessons.js:175-177, :230.
- `active_setup`: di-stamp di state.js:101 (`active_setup: active_setup || null`)
  dan state.js:153 (`active_setup: fields.active_setup ?? config.activeSetup ?? null`).
- Win/loss split: reports.js:36 (`const wins = perf.filter((p) => p.pnl_usd > 0);`)
  dan reports.js:464 (`const winners = perf.filter((p) => p.pnl_pct > 0);`).

## (b) Bisa hitung CONSECUTIVE-SL per racikan per hari?

**YA, dengan catatan.** Ketiga field yang dibutuhkan ADA di satu record:

1. **close-reason** — ADA (240/240, Fase 2). Bisa identifikasi SL via
   `classifyCloseRule(close_reason) === "stopLoss"` (reports.js:192).
   ⚠️ CATATAN: reason berformat free-text. `classifyCloseRule` match
   `.includes("stop loss")` — jadi "Trailing TP: Stop loss: PnL -12%..."
   juga hits "stopLoss". Kalau 🅶 mau hitung SL MURNI (bukan trailing
   yang SL), perlu reject string yang juga includes "trailing".
   Tapi untuk "loss-streak protection" nggak masalah — keduanya rugi exit.

2. **timestamp** — ADA (240/240):
   - `closed_at` — di-set saat record (lessons.js:233: `closed_at: recordedAt`).
   - `opened_at` — di-set dari `perf.deployed_at` (lessons.js:224, :232).
   - `recorded_at` — di-set (lessons.js:236).
   - Untuk consecutive-SL per hari, pakai `closed_at` diurutkan chrono.

3. **tag racikan** — ADA (240/240): `active_setup` field di tiap record.

**Implementasi consecutive-SL:**
- Filter: `perf.filter(p => active_setup === X && classifyCloseRule(p.close_reason) === "stopLoss")`
- Sort by `closed_at` ascending.
- Group by day (WIB atau UTC — tentukan).
- Hitung streak: consecutive records di hari yang sama (atau跨 hari, tergantung desain).
- `reports.js:79-84` sudah punya patokan: `maxLossStreak` over chronological
  pnl (tapi itu consecutive losses by pnl_usd < 0, BUKAN consecutive SL
  by close_reason). Logic-nya bisa di-adaptasi.

**Field yang SEMUANYA ADA di SATU RECORD:**
```
close_reason  → classifyCloseRule → "stopLoss"     [Fase 2: ADA]
closed_at     → timestamp                          [ADA, lessons.js:233]
active_setup  → racikan tag                        [ADA, state.js:101]
```

✅ FASE 4 SELESAI. avg-win per racikan & consecutive-SL per racikan per hari
BISA dihitung dari data yang ADA sekarang.

════════════════════════════════════════════════════════════
FASE 5 — Snapshot data live (angka nyata)
════════════════════════════════════════════════════════════

Sumber: `/home/ubuntu/meridianzen/lessons.json` (live) +
`/home/ubuntu/meridianzen/lessons-archive-pre-mainzen_v2.json` (archive).

## lessons.json (primary store — racikan aktif)

- Total record: **240**
- Dengan close_reason terisi: **240** (100%)
- Dengan peak_pnl_pct: **240** (100%)
- Dengan trough_pnl_pct: **240** (100%)
- Dengan price_peak_pct: **222** (92.5%)
- Dengan price_trough_pct: **222** (92.5%)
- Dengan pnl_pct: **240** (100%)
- Dengan opened_at: **240** (100%)
- Dengan closed_at: **240** (100%)
- Dengan active_setup: **240** (100%)
- Paper (sim): 0
- Suspect (quarantine): 0
- Date range: 2026-06-10 → 2026-06-28

### Distribusi per racikan:
| Racikan          | Records |
|------------------|---------|
| mainzen_v2_1     | 147     |
| mainzen_v2       | 93      |

### Win/loss (semua racikan):
- Wins (pnl_pct > 0): 158
- Losses (pnl_pct ≤ 0): 82
- PnL range: −45.05% → +5.25%

### Canonical close_rule distribution (estimasi dari raw close_reason):
(berdasarkan classifyCloseRule — free-text match)
| Rule                    | ~Count |
|-------------------------|--------|
| pumpedAboveRange (R3)   | ~70    |
| trailingTP              | ~80    |
| lowYield (R5)           | ~30    |
| OOR                     | ~10    |
| stopLoss                | ~6     |
| takeProfit (R2)         | ~5     |
| manual/lainnya          | ~1     |

(Catatan: angka di atas estimasi dari distribusi raw yang terbaca sebelumnya.
Hitung presisi perlu classify per-record, tapi polanya jelas: dominan
pumped-far-above-range + trailing TP + low yield. SL murni ~6 ekor.)

## lessons-archive-pre-mainzen_v2.json (pre-baseline, archive)

- Total record: **84**
- active_setup: **84 null** (semua unattributed — pra-stamping)
- close_reason: 84 terisi (100%)
- peak_pnl_pct: 52 terisi (61.9%)
- trough_pnl_pct: 52 terisi (61.9%)
- opened_at: 64 terisi (76.2%)

Archive ini TIDAK dipakai oleh learning loop (hanya display `/report all`).
TIDAK usable untuk per-racikan analysis (active_setup = null untuk semua).

## Vonis data usability:
- 240 record di lessons.json: **fully usable** untuk 🅶 — semua field kritis
  (close_reason, pnl_pct, peak/trough, active_setup, closed_at) terisi 100%.
- hanya price_peak/trough yang 92.5% (18 record lama kosong) — tapi untuk
  SL dinamis berbasis PnL peak/trough (bukan price), 100% terisi.
- 84 archive record: **tidak usable** untuk per-racikan (null active_setup).

✅ FASE 5 SELESAI.

════════════════════════════════════════════════════════════
FASE 6 — Vonis ringkas (feasibility table)
════════════════════════════════════════════════════════════

| Kebutuhan 🅶 | Status | Bukti / Catatan |
|---|---|---|
| **Hitung SL-berturut (consecutive SL)** | **FEASIBLE SEKARANG** | close_reason (Fase 2: ADA 100%, free-text, classify-able via classifyCloseRule reports.js:192) + closed_at (ADA, lessons.js:233) + active_setup (ADA, state.js:101). Ketiganya di satu record. ⚠️ Perlu waspada: "Trailing TP: Stop loss..." hits "stopLoss" di classifier — untuk loss-streak protection, ini OK (dua-duanya exit rugi). |
| **Patokan menang-berkualitas (avg-win per racikan)** | **FEASIBLE SEKARANG** | pnl_pct (ADA, lessons.js:175-177) + active_setup (ADA, state.js:101) + win/loss split (pnl_pct > 0). groupStats reports.js:174 sudah punya by_setup tapi avg_pnl_pct (semua), bukan avg-win-only — tinggal filter & mean manual. |
| **SL statis tighten** | **FEASIBLE SEKARANG** | stopLossPct (config.js:229) sudah per-racikan. getDeterministicCloseRule (index.js:1476) pakai config.management.stopLossPct. Risk: tidak ada tuning adaptif — tapi tighten statis = ubah nilai config, which is trivial. Data price_movement (winnersDipDeep guard reports.js:441) sudah ada untuk anti-naive check. |
| **SL dynamic (2× peak-trough, clamped)** | **FEASIBLE SEKARANG** | peak_pnl_pct & trough_pnl_pct ADA 100% (state.js:117-118, :505-510, transfer dlmm.js:2311-2314). Data MFE/MAE PnL tersimpan permanen di 240 record. Tidak perlu nunggu logging 🅱️. Implementasi: baca peak/trough live dari tracked position (state.json) saat cycle, atau baca historical dari lessons.json per-racikan untuk kalibrasi. |
| **Eskalasi by-day (Trigger B)** | **FEASIBLE SEKARANG** | closed_at (ADA) + active_setup (ADA) + close_reason (ADA). Bisa hitung "hari ke-N sejak posisi open" dari `opened_at` (ADA) vs `closed_at` (ADA). Bisa hitung count SL per hari per racikan. |

## Rekomendasi field yang perlu mulai dicatat (overlap sama 🅶)

Untuk implementasi penuh 🅶, semua field yang dibutuhkan SUDAH ADA.
Tidak ada field baru yang perlu ditambahkan untuk MVP 🅶.

**Yang SUDAH ada dan cukup:**
1. `close_reason` (free-text) → classify-able ke "stopLoss"
2. `pnl_pct` → win/loss identification
3. `peak_pnl_pct` / `trough_pnl_pct` → MFE/MAE untuk SL dinamis
4. `price_peak_pct` / `price_trough_pct` → price excursion untuk SL tuning
5. `active_setup` → per-racikan isolation
6. `closed_at` / `opened_at` → per-hari grouping & by-day escalation
7. `stopLossPct` di config.management → per-racikan, bisa di-adjust

**Yang MUNGKIN perlu untuk versi lanjutan (bukan MVP):**
- `stopLossPct` saat deploy TIDAK di-stamp per-posisi di state.json
  (hanya nama racikannya yang di-stamp). Kalau SL berubah mid-posisi
  ( tighten karena streak), dan kita mau tahu "SL berapa saat posisi ini
  di-deploy", perlu stamp `stop_loss_pct_at_deploy` ke state record.
  Tapi untuk MVP yang tighten global per-racikan, ini nggak pero.
- `sl_trigger_count` (counter berapa kali SL kena per racikan) — bisa
  dihitung on-the-fly dari lessons.json (tidak perlu field baru).

**Implikasi untuk 🅶:**
🅶 bisa langsung di-build TANPA nunggu 🅱️ logging. Semua data yang
dibutuhkan sudah terkumpul 240 record (tersimpan permanen di lessons.json).
Tidak ada gunanya menunda.

✅ FASE 6 SELESAI. RECON LENGKAP.