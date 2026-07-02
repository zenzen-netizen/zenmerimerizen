# ROI Recon — Findings

Tanggal: 2026-06-28
Branch: experimental | Commit HEAD: 44280c8

(Read-only recon — semua temuan `file:line` diverifikasi live dari repo.)

---

## FASE 1 — PRODUCER: di mana ROI / PnL% DIHITUNG

### P1 — Per-posisi PnL saat close (lessons.js recordPerformance)

`lessons.js:174-177` — di dalam `recordPerformance`:

```
174| const pnl_usd = (perf.final_value_usd + perf.fees_earned_usd) - perf.initial_value_usd;
175| const pnl_pct = perf.initial_value_usd > 0
176|   ? (pnl_usd / perf.initial_value_usd) * 100
177|   : 0;
```

- **Rumus:** `pnl_usd = (final + fees) − initial`; `pnl_pct = pnl_usd / initial × 100`.
- **Denominator:** `initial_value_usd` (dari `perf`/state record, berasal dari `trackPosition` field `initial_value_usd` — `state.js:73,99`).
- **`fees_earned_usd` SUDAH termasuk** di numerator (final + fees).
- **Edge case `initial <= 0`:** `pnl_pct = 0` (bukan null) — record TETAP disimpan dengan `pnl_pct: 0`.
- **Suspect guard:** `lessons.js:189-199` — jika `pnl_pct <= -90` DAN `initial_value_usd >= 20` DAN bukan stop-loss → flag `suspect_pnl: true` (record tetap disimpan, TIDAK dibuang; di-quarantine di downstream consumers lewat filter `!p.suspect_pnl`).
- **Sumber `initial_value_usd`:** `index.js:2869` → `trackPosition({ initial_value_usd: candidate.tvl ?? candidate.active_tvl ?? null })` — bisa `null` kalau kedua field kandidat hilang.

### P2 — ROI agregat all-time (lessons.js getPerformanceSummary)

`lessons.js:1006,1011,1015-1022,1028` — di dalam `getPerformanceSummary`:

```
1006| export function getPerformanceSummary() {
1010|   // excluded so a flagged bad-data artifact can't skew the headline stats.
1011|   const p = (data.performance || []).filter((p) => keepActiveRacikan(p) && !p.suspect_pnl);
1013|   if (p.length === 0) return null;
1015|   const totalPnl = p.reduce((s, x) => s + x.pnl_usd, 0);
1019|   const totalInvested = p.reduce((s, x) => s + (x.initial_value_usd || 0), 0);
1022|   const roiPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : null;
1028|     roi_pct: roiPct != null ? Math.round(roiPct * 100) / 100 : null,
```

- **Rumus:** `roi_pct = totalPnl / totalInvested × 100` (capital-weighted, BUKAN rata-rata per-posisi).
- **Denominator:** `totalInvested = sum(x.initial_value_usd || 0)` — **`|| 0`!** Record tanpa `initial_value_usd` (null/undefined/0) menambah **0** ke denominator TAPI `pnl_usd`-nya TETAP masuk numerator (`totalPnl`).
- **`totalPnl`** menggunakan `x.pnl_usd` yang sudah disimpan P1 (sudah include fees).
- **Risiko:** bila ada record dengan `initial_value_usd` hilang/0 TAPI `pnl_usd != 0`, ROI P2_TERGELEMBUNGkan (numerator bertambah, denominator tidak).
- **Filter record:** `keepActiveRacikan(p) && !p.suspect_pnl` — racikan aktif + buang suspect. TIDAK ada filter paper di P2 secara eksplisit (tidak ada `!p.paper`). Catatan: P2 dipakai oleh `/status` dan `agent.js`, bukan oleh `/report` atau briefing.

### P3 — ROI agregat (reports.js computeTradeStats)

`reports.js:31-40,143` — di dalam `computeTradeStats`:

```
31| export function computeTradeStats(records = []) {
32|   const perf = (records || []).filter((p) => p && Number.isFinite(p.pnl_usd));
...
39|   const netUsd = sum(perf.map((p) => p.pnl_usd));
40|   const invested = sum(fin(perf.map((p) => p.initial_value_usd)));
...
143|     roi_pct: invested > 0 ? r2((netUsd / invested) * 100) : null,
```

- **Rumus:** `roi_pct = netUsd / invested × 100` (capital-weighted, sama struktur P2).
- **Denominator:** `invested = sum(fin(perf.map(initial_value_usd)))` — **`fin()` (baris 20)** membuang non-finite (null/undefined/NaN). Record tanpa `initial_value_usd` **TIDAK masuk denominator** (dibuang oleh `fin`).
- **`netUsd`** menggunakan `perf.pnl_usd` (record yang sudah di-filter `Number.isFinite(pnl_usd)` di baris 32).
- **Risiko:** berbeda dengan P2 — record `initial_value_usd` hilang TAPI `pnl_usd` finite TETAP masuk ke `netUsd` (numerator) karena `perf` di baris 32 hanya memfilter `pnl_usd`, BUKAN `initial_value_usd`. JADI numerator bisa tergelembung seperti P2.

Pertanyaan Fase 3: apakah numerator P3 juga termasuk record dengan `initial_value_usd` hilang? YA, karena:
- baris 32: `perf` = filter `Number.isFinite(p.pnl_usd)` (initial tidak dicek).
- baris 39: `netUsd = sum(perf.map(p.pnl_usd))` — semua record di `perf` masuk.
- baris 40: `invested = sum(fin(perf.map(p.initial_value_usd)))` — hanya yang finite.

Jadi sebuah record `(pnl_usd=-5, initial_value_usd=null)` akan: masuk numerator (−5), TIDAK masuk denominator → **ROI P3 MAGang sama seperti P2**.

### P4 — LIVE position PnL% (tools/pnl.js buildPosition)

`tools/pnl.js:224-229,285` — di dalam `buildPosition` (dipanggil `computePositions`):

```
224| const pnlUsd = balancesUsd + withdrawUsd + claimableUsd + claimedUsd - depositsUsd;
225| const pnlSol = balancesSol + withdrawSol + claimableSol + claimedSol - depositsSol;
226| const pctUsd = depositsUsd > 0 ? (pnlUsd / depositsUsd) * 100 : 0;
227| const pctSol = depositsSol > 0 ? (pnlSol / depositsSol) * 100 : 0;
229| const ourPct = solMode ? pctSol : pctUsd;
...
285|     pnl_pct:            round(ourPct, 2),
```

- **Rumus berbeda dari P1!** `pnl_pct = pnlUsd / depositsUsd × 100` di mana `depositsUsd` adalah all-time deposit dari Meteora API (bukan `initial_value_usd` dari state).
- **PnL usd:** `balances + withdraw + claimable + claimed − deposits` (mencakup semua alur, bukan cuma final+fees).
- **Hanya untuk posisi LIVE** (open). TIDAK dipakai untuk aggregate ROI — hanya ditampilkan di `/positions`, `/pool`, notif OOR, dan exit-rule evaluation di management cycle.
- **Edge case:** `depositsUsd <= 0` → `pnl_pct = 0` (bukan null). Posisi dapat flag `pnl_pct_suspicious: true` bila `priceMissing` atau `depositsMissing` (baris 244-248).

### Mirror P1 (tools/dlmm.js)

`tools/dlmm.js:2354-2355,2658-2659` — di dalam `closePosition`, ada recompute untuk notif:

```
2354| const recordedPnlUsd = (finalValueUsd + feesUsd) - initialUsd;
2355| const recordedPnlPct = initialUsd > 0 ? (recordedPnlUsd / initialUsd) * 100 : 0;
```

Ini BUKAN producer terpisah — cuma "surface the SAME PnL that recordPerformance stores" (comment baris 2349-2353). `recordPerformance` (P1) dipanggil internal oleh `closePosition` dengan angka yang sama. Mirror ini hanya dipakai untuk notif (`recorded_pnl_usd/pct` di executor.js:802, index.js:1225-1226).

### Apakah ada producer KE-4 yang belum duduga?

**YA — P4 (tools/pnl.js buildPosition) ditemukan.** P4 menghitung `pnl_pct` untuk posisi live dengan rumus berbeda (deposit-based, bukan initial-based). P4 tidak masuk aggregate ROI, tapi penting karena `/positions`, `/pool`, dan exit-rules memakainya.

Tidak ada producer lain. Cek:
- `briefing.js:50,388,391` — memanggil `computeTradeStats` (P3), bukan producer.
- `views/cycle.js, positions.js, notifs.js, status.js, wallet.js, pool.js` — render-only, tidak compute ROI sendiri.
- `pnl-tracker.js` — compute windowed realized PnL (`pnl_usd` sum), TIDAK menghitung `roi_pct`; hanya menampilkan USD.
- `sol-tracker.js` — saldo mentah ◎, bukan ROI.

→ Tulis hasil. ✅ progress.

---

## FASE 2 — CONSUMER: di mana ROI / PnL% DITAMPILKAN

| Surface | Producer (P1/P2/P3/P4) | Bukti file:line |
|---|---|---|
| `/status` headline ROI | **P2** via `getPerformanceSummary()` | `index.js:3069` `perf: getPerformanceSummary()`; `views/status.js:52-54` `roi = fmtPct(vm.perf.roi_pct)` |
| `/wallet` | **TIDAK ADA ROI** | `index.js:3099-3111` — view-model `walletView.buildView` tidak menerima `perf`; `views/wallet.js:74-93` telegram() hanya blok wallet + sistem + tracker, no ROI line |
| `/report` (semua varian) | **P3** via `computeTradeStats` | `index.js:348-349` `buildTradeReport(getModePerformance())` → `reports.js:577` `const st = computeTradeStats(records)`; tampil `reports.js:272` `(pct(st.roi_pct)} ROI)` |
| `/briefing` (daily/alltime) | **P3** via `computeTradeStats` | `briefing.js:50` `const stats = computeTradeStats(perf)`; `briefing.js:388-391` `buildScopeBlock` memakai `formatStatsBlock(stats, label)` → `reports.js:272` |
| Periodic digest (week/month/day) | **P3** via `computeTradeStats` | `briefing.js:480` `buildTradeReport(racikanWindowPerf, ...)`; `briefing.js:523` `formatStatsBlock(computeTradeStats(windowPerf)...)` |
| Close notif (PnL per-posisi) | **P1 (mirror)** via `recorded_pnl_pct` | `tools/executor.js:802` `pnlPct: result.recorded_pnl_pct ?? result.pnl_pct ?? 0`; mirror di `tools/dlmm.js:2354-2355,2658-2659`; tampil `views/notifs.js:94` `spct(d.pnlPct)` |
| `/positions` (PnL per-posisi live) | **P4** | `views/positions.js:60` `pnlPct: p.pnl_pct ?? null`; tampil `views/positions.js:87-89` |
| `/pool` (PnL per-posisi live) | **P4** | `views/pool.js:53` `fmtMoneySigned(vm.pnlVal, solMode)` + `fmtPct(pnlPct)` |
| Trackers (SOL/PnL `pnl-tracker.js`) | **TIDAK ADA ROI** — hanya realized `pnl_usd` (USD only) | `pnl-tracker.js:46,64` `realized = sum(p.pnl_usd)`; render di `views/trackers.js:82-85` `usdSigned(r.net)`; tidak ada `roi_pct` |

→ Dugaan user:** `/status` → P2 (benar, `index.js:3069`); `/report` & `/briefing` → P3 (benar).** Tambahan: `/positions` & `/pool` → P4 (live position).

→ Tulis hasil. ✅ progress.

---

## FASE 3 — KONSISTENSI: apakah P2 vs P3 bisa kasih ROI BEDA?

Baca kodenya, jangan jalankan.

### 1. Rumus

| | P2 (lessons) | P3 (reports) | Beda? |
|---|---|---|---|
| **Rumus** | `totalPnl/totalInvested×100` (`lessons.js:1022`) | `netUsd/invested×100` (`reports.js:143`) | TIDAK — struktur sama persis (capital-weighted). |

### 2. Scope record

| | P2 (lessons) | P3 (reports) | Beda? |
|---|---|---|---|
| **Filter suspect** | `!p.suspect_pnl` (`lessons.js:1011`) | TIDAK ada filter suspect di `computeTradeStats` (`reports.js:32` hanya `Number.isFinite(p.pnl_usd)`) | **YA** — P3 TIDAK membuang suspect. TAPI: pemanggil `computeTradeStats` sudah pre-filter lewat `getModePerformance()` (`index.js:348`) yang membuang suspect (`lessons.js:971`). Jadi dalam praktek P3 terima record yang sama P2 UNTUK tier `/report default`. LIFETIME tier (`getLifetimePerformance`, `lessons.js:925-927`) hanya memfilter `!p.paper` — TIDAK membuang suspect → **P3 lifetime BISA beda dengan P2**. |
| **Filter paper** | TIDAK ada filter paper di P2 secara eksplisit (P2 iterasi `data.performance` langsung). Catatan: P2 dipakai di `/status`/agent; `getModePerformance` terfilter paper. | P3 tergantung pemanggil: `getModePerformance` (default) buang paper; `getLifetimePerformance` buang paper; `getPerformanceForRacikan` buang paper. Tapi `briefing.js:335` `modePerf = filter(keepMode)` HANYA filter mode, TIDAK `keepActiveRacikan` → briefing all-time mencakup SEMUA racikan mode-correct. | **YA** — P2 ter-filter `keepActiveRacikan` (current racikan only) + `!suspect_pnl`; P3 di briefing all-time pakai `modePerf` = `filter(keepMode)` SAJA (semua racikan, no suspect filter). |
| **Filter racikan** | P2: `keepActiveRacikan(p)` (`lessons.js:1011`, def `892-894`) — current `active_setup` only. | P3: tergantung pemanggil. `/report default` → `getModePerformance` (racikan aktif + suspect + paper di-filter). `/report all/lifetime` → `getLifetimePerformance` (SEMUA live, NO racikan isolation, NO suspect filter — hanya `!p.paper`). `/report <racikan>` → `getPerformanceForRacikan` (NO suspect filter). Briefing all-time → `modePerf` (SEMUA racikan mode-correct, NO suspect filter, NO racikan isolation). | **YA** — P2 selalu racikan-aktif; P3 scope bervariasi sesuai tier. Dalam praktek P2 vs P3 (`/report default`) SAMA; tapi bandedkan briefing all-time vs `/status` bisa beda. |

Catatan: `keepActiveRacikan` (`lessons.js:892`) tidak ditemukan di repo lain (grep physicists return 0 callers selain `lessons.js`); hanya `getPerformanceSummary` (P2) dan `getModePerformance` (P3 default) yang memanggil `keepActiveRacikan`.

### 3. Penanganan `initial_value_usd` kosong/non-finite

| | P2 (lessons) | P3 (reports) | Beda? |
|---|---|---|---|
| **Pembagi** | `sum(x.initial_value_usd \|\| 0)` (`lessons.js:1021`) — record `null`/`0`/`undefined` dijumlahkan sebagai **0** ke denominator. Tapi `pnl_usd` record itu TETAP masuk numerator. | `sum(fin(...initial_value_usd))` (`reports.js:40`) — `fin()` membuang non-finite; record `null` TIDAK dijumlahkan ke denominator. TAPI `pnl_usd` record itu TETAP masuk numerator (karena `perf` di `reports.js:32` hanya filter `pnl_usd`). | **YA** — keduanya punya bug serupa (numerator dari record `initial=0` ikut masuk), tapi P2 anggap `initial=0` = +0 ke denominator, P3 mengeluarkan record itu dari denominator. Beda perilaku denominator; efek ROI beda. |
| **Risiko** | Record `initial=null, pnl_usd=-5` → numerator `+(-5)`, denominator `+0` → **ROI menggelembung** (numerator turun, denominator tidak turun proporsional). | Record `initial=null, pnl_usd=-5` → numerator `+(-5)`, denominator TIDAK berubah → **ROI JUGA menggelembung**. | Keduanya bermasalah dengan cara yang mirip tapi tidak identik. |

**CEK DATA (read-only, JANGAN ubah):** apakah ADA record live dengan `initial_value_usd` hilang/0/non-finite?

File penyimpanan performa: `lessons.json` (653573 bytes) ditemukan via `grep -rl "initial_value_usd" --include="*.json"` (4 files total termasuk archip).

Saya mencoba menjalankan perintah `node -e` read-only yang murni `JSON.parse + filter + console.log(count)` untuk menghitung berapa record `initial_value_usd` null/0/non-finite, tapi **perintah itu di-BLOCK oleh user** (consent ditolak). Saya tidak mencoba ulang.

→ **UNKNOWN** — jumlah record live dengan `initial_value_usd` hilang/0/non-finite tidak dapat diverifikasi tanpa eksekusi node. Cek dilakukan via `grep -rl "initial_value_usd" --include="*.json"` saja (file ditemukan: `lessons.json`, `lessons-archive-pre-mainzen_v2.json`, `state.json`, `notes/backups/20260615T061757Z/lessons.json`).

### Tabel Divergence

| Sumbu | P2 (lessons `getPerformanceSummary`) | P3 (reports `computeTradeStats`) | Beda? | Dampak ke ROI |
|---|---|---|---|---|
| **Rumus** | `totalPnl/totalInvested×100` (`lessons.js:1022`) | `netUsd/invested×100` (`reports.js:143`) | TIDAK | — |
| **Filter suspect** | `!p.suspect_pnl` (`lessons.js:1011`) | TIDAK ada filter di fn (rely on caller) | **YA** — tapi `/report default` pre-filter via `getModePerformance` → praktek sama. `/report all` & briefing all-time TIDAK filter suspect. | `/status` (P2) vs `/report all` (P3) → ROI bisa beda bila ada suspect record. |
| **Filter paper** | TIDAK eksplisit (P2 baca `data.performance` langsung) | Tergantung caller; `getModePerformance`/`getLifetimePerformance`/`getPerformanceForRacikan` semua `!p.paper`. Briefing all-time `modePerf` filter `keepMode` (mode-correct) saja. | **YA** — P2 tidak filter paper; tapi `/status` dipakai saat live, di saat `lessons.performance` cuma berisi live record (paper hanya ada saat dry-run). Praktek: P2 = live, P3 briefing all-time = live. Sama. | TIDAK signifikan dalam praktek (paper hanya ada saat dry-run, saat P2 juga lihat mode-correct). |
| **Filter racikan** | `keepActiveRacikan(p)` (`lessons.js:1011`) — current `active_setup` only. | `/report default`: `getModePerformance` (racikan aktif + suspect filter). `/report all`: `getLifetimePerformance` (SEMUA live, NO racikan-isolation, NO suspect filter). Briefing all-time: `modePerf` (SEMUA racikan mode-correct, NO suspect filter, NO racikan isolation). | **YA** | `/status` (P2, racikan aktif only) vs `/report all` (P3, SEMUA racikan) → ROI SANGAT BISA BEDA. Bisa-bisa operator lihat `/status` ROI 10% lalu `/report all` ROI 50% atau −20% karena trade racikan lama ikut. |
| **initial kosong** | `\|\| 0` (`lessons.js:1021`) → +0 ke denominator. | `fin()` (`reports.js:40`) → record keluar dari denominator. | **YA** | Bila ada record `initial=null` dengan `pnl_usd!=0`: P2 jadikan denominator tetap, ROI tergelembung; P3 keluarkan record dari denominator, ROI juga tergelembung (beda besar). Kedua-duanya bisa salah. |
| **#record initial-kosong (data live)** | — | — | — | **UNKNOWN** — perintah node di-block user. Bila 0 record: divergence initial-kosong tidak bermaterial; bila ≥1 record dengan `pnl_usd!=0`: ROI uang-asli bisa salah di kedua surface. |

→ Tulis hasil. ✅ progress.

---

## FASE 4 — `/wallet` ROI-dari-balance (dicek khusus)

### 1. Baca `views/wallet.js` dan `views/status.js`

`views/wallet.js:26-45` `walletBlockLines(d)` dan `views/wallet.js:74-93` `telegram(vm)`.

`walletBlockLines` menampilkan:
- `Saldo:` (◎ $\approx) — via `fmtCur` (baris 31-33).
- `SOL @ $<price>` — selalu $ (harga USD) (baris 34).
- `Posisi: x/max` (baris 35) — count, bukan USD.
- `📦 per slot:` — `fmtCur(deployAmount)` (baris 38).
- `bebas:` — `fmtCur(free)` (baris 39).
- `held:` (bila `heldSol > 0`) — `fmtSol(heldSol)` (baris 42) — selalu ◎ (SOL intrinsik).

`views/wallet.js:74-93` `telegram(vm)`:
- blok wallet (di atas).
- ⚙️ Sistem (dry-run / HiveMind / OpenRouter).
- `solTracker: formatSolTracker(wallet.sol)` (`index.js:3108`) — saldo mentah ◎ (1D/7D/30D).
- `pnlBlock: formatPnlTracker(getModePerformance(), { solPriceUsd })` (`index.js:3109`) — realized PnL 1D/7D/30D (USD only).
- `disclosure: racikanScopeDisclosure()` (`index.js:3110`).

### 2. Jawab eksplisit: Apakah `/wallet` menampilkan baris ROI sama sekali?

**TIDAK ADA baris ROI di `/wallet`.** ROI all-time muncul di `/status` via P2 (`views/status.js:52-54`). `walletView.buildView` tidak menerima `perf` (`index.js:3099-3111`), dan `views/wallet.js` tidak punya line `roi`/`perf.roi_pct`.

### 3. Angka yang blok wallet tampilkan + sumber

| Angka | Sumber | `file:line` |
|---|---|---|
| Saldo SOL/USD | `getWalletBalances` (via index.js) → `walletBlockLines` | `views/wallet.js:31-33`; `index.js:3101` |
| Harga SOL | `wallet.sol_price` | `views/wallet.js:34` |
| Count posisi/max | `positions.total_positions`, `config.risk.maxPositions` | `views/wallet.js:35`; `index.js:3102` |
| per-slot deploy | `computeDeployAmount(wallet.sol, { slotsRemaining })` | `views/wallet.js:38`; `index.js:3103` |
| bebas | `wallet.sol − gasReserve` | `views/wallet.js:37,39` |
| HELD rent (◎) | `getPositionsRentSol` (via index.js:3093-3095) | `views/wallet.js:42`; `index.js:3093-3095` |
| SOL tracker 1D/7D/30D (◎) | `formatSolTracker` (sol-tracker.js) | `index.js:3108`; `views/trackers.js:32-61` |
| Realized PnL/Net 1D/7D/30D (USD only) | `formatPnlTracker` (pnl-tracker.js) | `index.js:3109`; `views/trackers.js:72-91` |
| Disclosure racikan (text) | `racikanScopeDisclosure` | `index.js:3110` |

**Kesiapan untuk ROI-vs-balance (kalau mau ditambah):** data `getPnlTracker` (realized `pnl_usd` per window) SUDAH ada; kalau mau ROI 1D/7D/30D, butuh `initial_value_usd` sum per window (data `getModePerformance` ada). Untuk ROI all-time di `/wallet`, tinggal tambah `perf: getPerformanceSummary()` ke `walletView.buildView` dan render di `views/wallet.js`. Datanya sudah tersedia — tinggal plumbing.

→ Tulis hasil. ✅ progress.

---

## FASE 5 — Kesiapan DUAL-UNIT (USD & SOL)

### 1. Konfirmasi primitif di `views/format.js`

| Primitif | file:line | Bedanya |
|---|---|---|
| `fmtBoth(usd, sol, solMode)` | `views/format.js:70-75` | Tampil DUA angka sekaligus: mode $ → "$X (≈◎Y)"; mode ◎ → "◎Y ($X)". |
| `fmtBothSigned(usd, sol, solMode)` | `views/format.js:84-97` | Sama seperti `fmtBoth` tapi bertanda (PnL/delta): "+$1.10 (≈◎0.0073)" / "-◎0.0042 (≈$0.61)". Dipakai notif close. |
| `fmtCur(sol, usd, solMode)` | `views/format.js:37-39` | Tampil DUA basis: mode ◎ → "◎Y"; mode $ → "$X". **Tidak bertanda**, untuk value (bukan PnL). |
| `fmtMoney(value, solMode)` | `views/format.js:47-52` | SATU unit per `solMode`: mode $ → "$<v>"; mode ◎ → "◎<v>". Tidak bertanda. |
| `fmtMoneySigned(value, solMode)` | `views/format.js:56-60` | SATU unit, bertanda: "+$1.10" / "-◎0.0042". Dipakai banyak surface PnL. |
| `fmtPct(x)` | `views/format.js:101-103` | Persen bertanda "+1.61%"; tidak ada unit currency — sama di kedua mode. |

### 2. Klasifikasi per surface PnL/value

| Surface | DUAL / SINGLE | file:line | Catatan |
|---|---|---|---|
| **Close notif** (`notifyClose`) | **DUAL** (`fmtBothSigned`, fallback `fmtMoneySigned`) | `views/notifs.js:87-90` | `pnlUsd`, `feesUsd` 1 nilai mode-correct; unit kedua diturunkan via `solPrice`. Fail-safe ke 1-unit bila `solPrice` hilang. |
| **`/status` All-time PnL** | **SINGLE** (`fmtMoneySigned`) | `views/status.js:54` | `vm.perf.total_pnl_usd` (mode-correct) → 1 unit saja. ROI `vm.perf.roi_pct` via `fmtPct` (persen, bukan currency). |
| **`/wallet` Saldo/per-slot/bebas** | **DUAL** via `fmtCur` (selalu tampil dua basis dalam satu mode) | `views/wallet.js:31-39` | `fmtCur(sol, sol*price, solMode)` — di mode $ tampil $ primari + ◎ secondary (sebenarnya `fmtCur` hanya pilih SATU berdasarkan `solMode`, tapi baris Saldo punya inline `(≈$usd)` / `(≈◎sol)` manual). Sebenarnya ini SINGLE-gated tapi saldo baris manual overlay dua basis. |
| **`/wallet` HELD rent** | **SINGLE** (`fmtSol`, selalu ◎) | `views/wallet.js:42` | SOL intrinsik, tidak dikonversi. Governing: selalu ◎. |
| **`/wallet` SOL tracker** | **SINGLE** (◎ only) | `views/trackers.js:20-22,32-61` | `sol3(n)` / `solSigned(n)` — hardcode ◎. USD sama sekali tidak ada. |
| **`/wallet` Realized PnL tracker** | **SINGLE** ($ only) | `views/trackers.js:65,82-85` | `usdSigned(n)` — hardcode $. Tidak ada `solMode`. Governing: sumber $. |
| **`/positions`** | **SINGLE** (`fmtMoneySigned`, `fmtMoney`) | `views/positions.js:89-90` | Mode-correct 1 unit. `pnlVal`, `value`, `fees` semua `*_usd` mode-correct. |
| **`/pool`** | **SINGLE** (`fmtMoneySigned`, `fmtMoney`) | `views/pool.js:53-54` | Sama `/positions`. |
| **`/report` (stats block)** | **SINGLE** (hardcode $ via `money()` lokal) | `reports.js:24,272` | `money(n) = "+$X" / "-$X"` — hardcode USD, TIDAK ikut `solMode`. `pct(st.roi_pct)` tidak punya unit. |
| **`/briefing` (stats block)** | **SINGLE** (hardcode $ via `money()` lokal reports.js) | `briefing.js:50` → `reports.js:272` | Pakai `formatStatsBlock(stats, label)` yang render `$<value>`. Tidak ada `solMode`. Governing #2: report = USD by-design. |
| **SOL tracker line footnote** | **SINGLE** (text) | `views/trackers.js:59` | "ℹ️ saldo SOL mentah". |

### 3. Blocker untuk surface yang masih SINGLE

Untuk setiap surface SINGLE, apakah pemanggil punya DUA angka atau cuma 1?

| Surface SINGLE | Punya 2 angka (sol & usd)? | Blocker |
|---|---|---|
| `/status` All-time PnL (`views/status.js:54`) | `vm.perf.total_pnl_usd` = 1 nilai mode-correct (`getPerformanceSummary` tidak menyimpan SOL). `solPrice` tersedia di `vm.solPrice`. → **Tinggal swap `fmtMoneySigned`→`fmtBothSigned`** kalau mau dual (mirip notif close). Tapi `getPerformanceSummary` return field `total_pnl_usd` saja, tidak `total_pnl_sol`. | **Punya 1 nilai mode-correct + `solPrice`** → bisa turunkan unit kedua (display-only) seperti `views/notifs.js:88-90`. |
| `/positions` PnL/Value/fees (`views/positions.js:89-90`) | `p.pnl_usd`, `p.total_value_usd`, `p.unclaimed_fees_usd` semua mode-correct 1 nilai (P4 `tools/pnl.js:283-279`); `config.management.solMode` tersedia. Tidak ada `solPrice` di view-model, tapi bisa diturunkan dari PnL usd × px. | **Punya 1 nilai + bisa akses `solPrice` kalau di-pass** → tinggal plumbing seperti notif close. |
| `/pool` (sama `/positions`) | Sama. | Sama. |
| `/report` stats block (`reports.js:272`) | `st.net_pnl_usd`, `st.invested_usd` — USD nominal (mode-correct dari `pnl_usd` yang sudah SOL saat solMode). `reports.js` pure (tidak import config); tidak ada `solMode`/`solPrice` di scope. | **Cuma 1 unit; butuh plumbing `solMode`+`solPrice` ke `reports.js`** atau pre-convert di caller. `reports.js` sengaja dibuat pure (governing #2: report = USD by-design). |
| `/briefing` stats block (`briefing.js:388-391` → `reports.js:272`) | Sama seperti `/report`. | Sama. |
| `pnl-tracker` realized PnL/Net (`views/trackers.js:82-85`) | `r.net`, `r.realized` = USD (compute dari `pnl_usd` sum + gas USD). `solPriceUsd` sudah ada di `getPnlTracker` opts (`pnl-tracker.js:41,56`). | **Punya `solPriceUsd`** → tinggal turunkan ◎ = USD/px; tapi `formatPnlTracker` return konta USD by-design (governing #2). |

→ Tulis hasil. ✅ progress.

---

## FASE 6 — VONIS + rapikan findings

### 1. Vonis "satu atau kepencar"

**ROI dihitung di 3 tempat yang MATERI bagi ROI all-time**:
- **P1** (`lessons.js:174-177`) — per-posisi saat close (membentuk `pnl_usd`/`pnl_pct` per record).
- **P2** (`lessons.js:1022-1028` `getPerformanceSummary`) — agregat all-time, DIPAKAI `/status` (`index.js:3069`).
- **P3** (`reports.js:143` `computeTradeStats`) — agregat all-time, DIPAKAI `/report` & `/briefing` (`briefing.js:50`, `index.js:348-349`).

**P4** (`tools/pnl.js:226-229,285`) hanya untuk posisi live — tidak agregat ROI.

**Rumus seragam/tidak:** rumus dasar SAMA (`netPnl/invested×100`). TAPI implementasi pembagi (denominator) berbeda:
- P2 pakai `(x.initial_value_usd || 0)` → +0 untuk record hilang.
- P3 pakai `fin(...)` → record hilang di-drop dari denominator.

**Risiko divergence: ADA.** Divergence utama:
1. **Scope record** — P2 selalu racikan-aktif + suspect-filter; P3 bervariasi (terutama `/report all` & briefing all-time: NO racikan-isolation, suspect optional). → `/status` bisa beda dengan `/report all`.
2. **Penanganan `initial_value_usd` kosong** — P2 `\|\| 0`; P3 `fin()` membuang. Keduanya bisa menggelembungkan ROI bila ada record hilang dengan `pnl_usd!=0`.

### 2. Daftar divergence berisiko (urut paling berdampak)

1. **Scope racikan** — `/status` (P2) racikan-aktif only vs `/report all` (P3) semua racikan → ROI bisa beda jauh bila ada trade dari racikan lama. Dampak HIGH; sering muncul operator bingung "kok `/status` ROI 10% tapi `/report all` 50% atau −20%?".
2. **Suspect filter** — `/report all` & briefing all-time TIDAK filter suspect (`getLifetimePerformance` hanya `!p.paper`); P2 filter suspect. Bila ada record `suspect_pnl: true` dengan `pnl_usd` ekstrim, `/report all` / briefing all-time bisa menyeret ROI jauh dari `/status`. Dampak MEDIUM-HIGH (tergantung berapa suspect).
3. **`initial_value_usd` kosong** — bila ADA record live dengan `initial` hilang/0 (UNKNOWN apakah ada), kedua producer menggelembungkan ROI. P2 `\|\| 0` vs P3 `fin()` → beda besar ROI untuk record yang sama. Dampak UNKNOWN tapi potensial HIGH.
4. **Scope briefing all-time** — briefing baris 388 pakai `modePerf = (performance).filter(keepMode)` (semua racikan mode-correct, NO suspect filter), sedangkan briefing baris 391 pakai `getModePerformance()` (racikan aktif + suspect). → "All-time" briefing vs "Racikan aktif" briefing bisa beda. Mungkin by-design (opsi B), tapi oleh-design ROI all-time briefing SUSAH DIBEDAKAN dari `/status` P2 yang racikan-aktif-only.

### 3. Rekomendasi ringkas (tanpa sentuh kode sekarang)

1. **Satukan filter suspect + paper + racikan ke 1 helper di `lessons.js`** — kedua producer (P2 & P3) harus menerima record yang sudah di-pre-filter dengan scope yang sama. `getModePerformance` sudah melakukan ini; P2 (`getPerformanceSummary`) TIDAK konsisten dengan pemanggil P3 (`getLifetimePerformance` yang tidak filter suspect/racikan). Opsi: ubah `getPerformanceSummary` pakai `getModePerformance` internal, atau tambah `!p.suspect_pnl` ke `getLifetimePerformance` & briefing all-time.
2. **Samakan penanganan `initial_value_usd` kosong** — buat helper `computeRoi(perf)` di satu tempat (mis. `reports.js`), pakai yang mana: (a) buang record dengan `initial_value_usd` non-finite dari numerator DAN denominator, ATAU (b) treat 0 sebagai 0 di keduanya. Konsistensi lebih penting daripada pilihan. Lalu P2 dan P3 fungsinya panggil helper itu.
3. **Verifikasi data live** — jalankan `node -e` read-only (perlu consent user) untuk hitung berapa record `initial_value_usd` null/0/non-finite di `lessons.json`. Kalau 0 record → divergence initial-kosong tidak bermaterial; kalau ≥1 → fix prioritas tinggi.
4. **Surface disclosure** — untuk divergence scope racikan (P1 di atas), tambah disclosure di `/report all` & briefing all-time yang menyebutkan "mixed racikan, NO suspect filter → ROI bisa beda dari `/status`". Sudah ada `racikanScopeDisclosure` di `index.js:286-293`; tinggal perluas.
5. **`/wallet` ROI** — kalau mau ROI-vs-balance (`/wallet` menampilkan ROI 1D/7D/30D), data `formatPnlTracker` sudah punya `realized` per window; tinggal tambah baris ROI (realized / invested-for-window). Tapi invested per window harus di-compute baru (sum `initial_value_usd` record yang close di window).

### 4. Daftar UNKNOWN

- **Jumlah record live dengan `initial_value_usd` null/0/non-finite** — perintah `node -e` di-block user. File `lessons.json` (653573 bytes) ditemukan tapi tidak dihitung isinya. Bila 0 → divergence initial-kosong tidak bermaterial; bila ≥1 dengan `pnl_usd!=0` → ROI uang-asli bisa salah di `/status` DAN `/report`/`/briefing`.
- **Apakah record paper ada di `lessons.json`** — saya tidak bisa verifikasi tanpa baca file; catatan CLAUDE.md menyatakan paper hanya saat dry-run. Saya asumsikan repo dry-run saat ini (DRY_RUN default false → live).

---

**AKHIR RECON — 2 file notes ditinggalkan apa adanya. Tidak ada commit, tidak ada restart.**