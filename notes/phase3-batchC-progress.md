# PHASE 3 BATCH C — PROGRESS

Bot MAIN (`pm2 id 0` = meridian, branch `experimental`, LOCAL = sumber kebenaran). Display-only,
restart owner-only. Workstream 🅴 — Report & Briefing (⑥⑦) → tree-style. Zona aman: `reports.js`,
`briefing.js`, render-ekstrak ke `views/` bila perlu; `index.js` cuma 1-baris (milestone).

## Checklist (report/briefing)
- [x] 0  recon EXACT /report (semua varian) + briefing harian/mingguan/bulanan + milestone — field + baseline
- [x] 1  /report → tree-style (SEMUA stat dipertahankan)
- [ ] 2  Daily briefing → tree-style
- [ ] 3  Weekly/Monthly briefing → tree-style
- [ ] 4  Milestone learning report → tree-style (render ekstrak dari index.js, 1-baris call)

---

## FASE 1 — /report → tree-style — SELESAI
`reports.js`: import `{ SEP, tree }` dari `./views/format.js` (primitif murni, no cycle). Tiap sub-block jadi
`<b>header</b>` + `tree(body)` (├/└), SEP (16×━ heavy) ganti `────` (16×─ light) di buildTradeReport (atas+bawah).
Diubah (rakitan string SAJA, perhitungan NOL ubah): formatStatsBlock · formatQuantBlock · formatTrend ·
formatMovement (2 sub-block, masing-masing tree) · formatBreakdown (per-blok header+tree; ordinal `N.` dibuang —
urutan rank dibawa branch tree) · buildRecommendations (`• ` → tree) · buildTradeReport (SEP). buildVerdict tetap
1-baris. **buildTradeReport DIPAKAI BERSAMA** → /report (semua varian), milestone, briefing periodik auto-ikut;
formatStatsBlock/Quant/Movement/Breakdown/Recs yg dipanggil langsung briefing.js juga auto-tree (FASE 2 sisanya).
**Cross-check token-multiset (HTML+tree/list-marker+SEP di-strip) IDENTIK**: report_default 437=437 · report_all
549=549 · report_milestone 423=423 tok → nol stat hilang. `node --check reports.js` OK. Commit `feat(views): /report tree-style`.

---

## FASE 0 — Recon EXACT (READ-ONLY) — SELESAI
Baseline real disimpan `/tmp/bl_report_{default,all,milestone}.txt` + `/tmp/bl_briefing_{daily,week,month}.txt`
(146 perf record di lessons.json). Cross-check pasca-migrasi = multiset token (HTML+tree-prefix+SEP di-strip) IDENTIK.

**Builder utama (reports.js, dipanggil index.js:3517/4065 & briefing.js):**
- `buildTradeReport(perf,{title,subtitle,statsLabel,trendN,identity,quant})` (reports.js:575) — komposer.
  Urutan: `<b>title</b>` → `<i>subtitle?</i>` → identity (formatIdentity: 🧬 Profil + 🗂️ Racikan) →
  `────────────────` (16×─ light) → **formatStatsBlock** → **buildVerdict?** → ""+**formatQuantBlock?** →
  ""+**formatTrend?** → ""+**formatMovement?** → ""+**formatBreakdown?** → ""+**buildRecommendations?** →
  `────────────────`. Empty-window → "<b>title</b>… No closed positions in this window yet."
- `formatStatsBlock` (265): `<b>📊 label — N closed</b>` + 💰PnL/ROI/fees · 🎯Win(W/L)/PF/expectancy ·
  ⚖️avg win/loss(payoff) · 📉MaxDD(%)/streak/hold/in-range · 🏆Best|💀Worst? · 🩸Tail?
- `buildVerdict` (553): `<b>🧭 Verdict:</b> <emoji status + kalimat>` (1 baris, n≥4).
- `formatQuantBlock` (305): `<b>🧮 Quant Edge — n=N?:</b>` + RR/break-even · EV/trade · MaxDD recovery? ·
  💧Fee-density? · Cost-drag? · `<i>noisy flag?</i>`.
- `formatTrend` (404): `<b>📈 Trend — last N vs prior N:</b>` + PnL · Win rate · Profit factor (arrow 📈/📉/➡️).
- `formatMovement` (202): `<b>📈 PnL Movement (N tracked):</b>` + avg peak→exit(give-back) · avg trough? ·
  left-on-table? ; `<b>💹 Price Movement vs entry (N tracked):</b>` + avg peak(best)|drawdown(worst) ·
  winners dip? · losers dip?
- `formatBreakdown` (379): per blok `<b>title</b>` + baris `  N. key: ±$net net, W% win, avg/trade ±$avg (count)`.
  Blok: 📦 By strategy · 🗂️ By racikan? · 🕒 By session (WIB)? · 🏷️ By narrative? · 🛑 By close rule (urut dampak $)?
- `buildRecommendations` (425): `💡 <b>Recommendations:</b>` + `  • <rec>` (≤7, HTML inline `<code>`/`<b>`).
- `buildRoleCostLines` (616): `  • Role [model]: $x (n calls)` — dipakai cost-section briefing.

**Varian /report (index.js buildReportForArg:286):** default=racikan aktif (getModePerformance) · all/lifetime
(getLifetimePerformance, +subtitle warning) · setups (list racikan, BUKAN buildTradeReport — list sendiri pakai
`────`) · `<racikan>` (getPerformanceForRacikan) · week/month/day → generatePeriodicBriefing. Tiap varian
buildTradeReport SAMA strukturnya, beda title/subtitle/perf. index.js NAMBAH di luar builder: `formatPnlTracker`
(renderPnlTracker, SUDAH tree — cuma dipanggil) + suspectLine? + racikanScopeDisclosure?.

**Briefing harian (generateBriefing, briefing.js:284):** ☀️ header + identity → `────` → Activity(opened/closed)
→ Performance 24h(PnL/fees/winrate) → formatPnlTracker(tree) → formatStatsBlock(All-time)+verdict+quant+movement →
formatStatsBlock(Racikan)+disclosure → Lessons 24h → Portfolio → buildFeatureStatus → buildCostSection →
buildLearningSection → buildTimeProfileSection → buildSkipReviewSection → formatBreakdown → buildRecommendations →
`────`. (Seksi reports.js auto-ikut tree dari FASE 1; seksi LOKAL briefing.js di-tree FASE 2.)

**Briefing periodik (generatePeriodicBriefing, briefing.js:411):** buildTradeReport(window) + formatStatsBlock(Racikan)
+ disclosure + formatPnlTracker + Activity(Nd) + buildFeatureStatus + costLines + buildTimeProfileSection. Join `\n\n`.

**Milestone (maybeFireLearningReport, index.js:216):** buildTradeReport(perf,{title:"🎓 Learning Report — N closed",
statsLabel:"All-time",trendN,identity:formatIdentity()}) → sendHTML. FASE 4: ekstrak render ke file aman, index.js 1-baris.

**Catatan unit (governing #2):** report = $ by-design (`money()` reports.js:23 selalu `±$`); realized tracker =
renderPnlTracker (sudah tree, $). TIDAK ngarang konversi. Hanya rakitan string → tree; perhitungan stat NOL ubah.

---

---

# ADDENDUM — FASE 5: notifyClose both-units ($+◎)
> Dikerjakan lebih dulu (sebelum Batch C report/briefing) atas keputusan owner; sudah LIVE (commit a383eb2,
> restart MAIN). Independen dari FASE 0–4 di atas. Detail di bawah.

## FASE 5.1 — Recon (READ-ONLY) — SELESAI

**Pertanyaan: ada harga SOL ter-cache/global yang kejangkau dari layer notif tanpa import money-logic/executor?**

- **TAK ADA cached/global SOL price.** Grep `lastSolPrice|_solPrice|cachedSolPrice|priceCache|...` → kosong.
  `/status` & `/wallet` ambil `solPrice` dari `getWalletBalances()` (tools/wallet.js, field `sol_price`) —
  fetch async tiap panggil (index.js:3574,3613; viewmodel `vm.solPrice`). Bukan cache.
- **Close `result` (caller executor.js:802) cuma bawa SATU unit mode-correct.** Field ada: `pnl_usd`,
  `recorded_pnl_usd`/`recorded_pnl_pct`, `fees_earned_usd`, `pnl_pct`, `peak_pnl_pct`, `pool_name`,
  `close_reason`, `derived_lesson` (dlmm.js:2356-2375 & 2660-2677). **TAK ADA** `sol_price`/`pnl_sol`/`fees_sol`/
  pasangan SOL↔USD. USD-mode: semua USD; SOL-mode: `pnl_usd`/`fees_earned_usd` bawa nilai SOL, `recorded_pnl_usd`=null.
  ⇒ engine **tak menghitung** unit-kedua di mana pun.
- **Sumber harga read-only & bebas side-effect:** `getSolMarketRegime()` (wallet.js:196) → `{ usdPrice, change24hPct,
  liquidity }`, pure Jupiter price fetch, **nol side-effect** (beda dari `getWalletBalances()` yang manggil
  `recordSolBalance()`). Ini sumber harga JALUR A.
- **Cycle-safe:** wallet.js import {bs58, logger, config, gas-tracker, sol-tracker} — tak ada yang import
  telegram.js; config.js tak import telegram.js. Jadi telegram.js boleh akses wallet.js tanpa cycle. Tetap
  pakai **dynamic import** di dalam `notifyClose` biar static-graph telegram.js tetap ringan (konvensi file:
  telegram.js sengaja baca user-config.json via fs, hindari import config.js).

**JALUR DIPILIH: A (display-only).**
- JALUR B (aditif executor.js) **DITOLAK**: precondition brief ("nilai SOL $-pasangan sudah dihitung &
  tinggal dilempar") GAGAL — engine tak hitung unit-kedua. Brief: "kalau belum ada → STOP, jangan hitung
  di engine". Maka executor.js TAK disentuh.
- JALUR A: harga SOL kejangkau bersih dari layer notif via `getSolMarketRegime()` (read-only, no side-effect,
  cycle-safe). executor.js/money-logic/trade-logic NOL ubah.

## FASE 5.2A — JALUR A (display-only) — SELESAI
- `views/format.js`: TAMBAH `fmtBothSigned(usd, sol, solMode)` — mirror `fmtMoneySigned` (sign-before-symbol)
  + `≈` di unit turunan (kedua mode). `fmtBoth` lama (unsigned) TAK disentuh (0 caller). Alasan: PnL bertanda;
  fmtBoth render `$-1.10` (salah), butuh `-$1.10`.
- `views/notifs.js` `renderClose`: terima `d.solPrice`. `m(v)`: kalau harga valid (>0 finite) → both-units via
  `fmtBothSigned` (mode off: ◎=$/px; mode on: $=◎×px); kalau tidak → **fall back** `fmtMoneySigned` (1-unit
  mode-correct, byte-identik Batch B — governing #3). Dipakai 3 baris uang: Net PnL, Fee panen, Efek-harga.
  **Gas TIDAK** (sudah ◎/SOL apa adanya).
- `telegram.js` `notifyClose`: dynamic-import `getSolMarketRegime` → `solPrice = regime?.usdPrice || null`,
  fail-open (catch → null), diteruskan ke `renderClose`. Guard/trigger/logic TAK diubah.
- `node --check` ketiga file: OK.
- Commit: `feat(views): notifyClose both-units via harga SOL read-only (≈, display-only)`.

## FASE 5.3 — Smoke-test 2 mode — SELESAI (LULUS)
Render-test `renderClose` (harga contoh SOL @ $150), angka dicek manual — semua benar, field-map tak ketuker:
- **USD mode (MAIN)** win: `📊 Net PnL: +$0.14 (≈◎0.0009) (+1.50%)` · `💎 Fee panen +$0.02 (≈◎0.0001) · 📈 Efek-harga +$0.12 (≈◎0.0008)`. (0.14/150=0.0009 ✓)
- **USD mode** loss: `-$1.10 (≈◎0.0073)` · efek `-$1.15 (≈◎0.0077)`. (1.10/150=0.00733 ✓) — sign-before-`$`, `≈` di ◎ turunan.
- **USD mode harga hilang (px=0)** → fallback `-$1.10` **byte-identik Batch B** (1-unit) ✓.
- **SOL mode** win: `+◎0.0042 (≈$0.63)` · fee `$0.12` · efek `$0.51`. (0.0042×150=0.63 ✓) — `≈` di `$` turunan.
- **SOL mode** loss: `-◎0.0073 (≈$1.09)` · efek `-◎0.0076 (≈$1.14)`.
- **SOL mode harga hilang (null)** → fallback `-◎0.0073` (1-unit) ✓.
- Gas baris TAK diubah (◎/SOL apa adanya). Win/loss 🟢/🔴 dipertahankan. `node --check` ketiga file OK.

## VERIFIKASI AKHIR
- branch `experimental`. Diff JALUR A: `views/format.js` (+fmtBothSigned, fmtBoth utuh) · `views/notifs.js`
  (renderClose pakai solPrice+fmtBothSigned, fallback) · `telegram.js` (wrapper fetch harga read-only) +
  `notes/`. **executor.js / money-logic / trade-logic NOL ubah.**
- **Restart owner-only** (Claude TIDAK restart). Konfirmasi end-to-end nyata = pas close beneran berikutnya
  (cek notifyClose nampilin $+◎). MAIN = USD mode → primary `$`, sekunder `≈◎`.
</content>
