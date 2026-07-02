# Workstream 🅶 — Trigger-Frequency + Backtest SL-tighten FINDINGS

Bot: MAIN (meridianzen)
Branch: experimental
Scope: mainzen_v2_1 SAJA (147 records, filter !paper & !suspect_pnl)
SL live: -10% (user-config.json, flat key `stopLossPct`)
Date: 2026-06-29

════════════════════════════════════════════════════════════
FASE 0 — Setup + konfirmasi nilai live
════════════════════════════════════════════════════════════

Branch: experimental (confirmed).
stopLossPct live = **-10** (user-config.json, flat top-level key, bukan nested `management`).
  Verifikasi: `python3 -c "import json; print(json.load(open('user-config.json'))['stopLossPct'])"`
  → output: `-10`
  Catatan: config.js:229 membaca `u.stopLossPct ?? u.emergencyPriceDropPct ?? -50` (default
  factory -50), tapi user-config.json override ke -10. activeSetup = "mainzen_v2_1" (confirmed).

✅ FASE 0 SELESAI.

════════════════════════════════════════════════════════════
FASE 1 — Klasifikasi PRESISI (mainzen_v2_1, 147 records)
════════════════════════════════════════════════════════════

classifyCloseRule() (reports.js:189-200) diterapkan ke setiap close_reason.

## Tabel EXACT count per canonical rule:

| Canonical Rule             | Count |
|----------------------------|-------|
| pumpedAboveRange (R3)      | 56    |
| trailingTP                 | 45    |
| lowYield (R5)              | 28    |
| outOfRange (OOR)           | 11    |
| stopLoss                   | 5     |
| takeProfit (R2)            | 2     |
| **Total**                  | **147** |

## SL-reason MURNI (includes "stop loss" AND NOT "trailing"): 5 record

| # | closed_at (UTC)          | WIB                      | pnl_pct  | trough   | pool           | close_reason                         |
|---|--------------------------|--------------------------|----------|----------|----------------|--------------------------------------|
| 1 | 2026-06-24T05:17:21Z     | 2026-06-24 12:17 WIB     | -8.34%   | -10.18%  | QUEST-SOL      | Stop loss: PnL -10.18% <= -10%       |
| 2 | 2026-06-25T13:12:33Z     | 2026-06-25 20:12 WIB     | -12.88%  | -13.68%  | AIAIAI-SOL     | Stop loss: PnL -13.68% <= -10%       |
| 3 | 2026-06-26T05:36:21Z     | 2026-06-26 12:36 WIB     | -9.54%   | -10.24%  | FLKR-SOL       | Stop loss: PnL -10.24% <= -10%       |
| 4 | 2026-06-26T22:39:42Z     | 2026-06-27 05:39 WIB     | -10.56%  | -10.27%  | VALORA-SOL     | Stop loss: PnL -10.27% <= -10%       |
| 5 | 2026-06-27T03:49:00Z     | 2026-06-27 10:49 WIB     | -6.48%   | -12.36%  | liquititty-SOL | Stop loss: PnL -12.36% <= -10%       |

Trailing TP yang also mentions "stop loss": **0 record** (tidak ada overlap di v2_1).
Jadi classifyCloseRule=="stopLoss" di v2_1 = murni SL, tidak ada trailing yang false-positive.

## Rugi terdalam di v2_1:

| Rank | pnl_pct   | trough    | peak   | pool           | close_reason                         |
|------|-----------|-----------|--------|----------------|--------------------------------------|
| 1    | -12.88%   | -13.68%   | 0.03%  | AIAIAI-SOL     | Stop loss: PnL -13.68% <= -10%       |
| 2    | -10.56%   | -10.27%   | 0.06%  | VALORA-SOL     | Stop loss: PnL -10.27% <= -10%       |
| 3    | -9.54%    | -10.24%   | 0.47%  | FLKR-SOL       | Stop loss: PnL -10.24% <= -10%       |
| 4    | -8.34%    | -10.18%   | 0.72%  | QUEST-SOL      | Stop loss: PnL -10.18% <= -10%       |
| 5    | -6.48%    | -12.36%   | 0.33%  | liquititty-SOL | Stop loss: PnL -12.36% <= -10%       |

**Temuan kritis:** SEMUA 5 rugi terdalam v2_1 adalah SL-triggered.
Tidak ada rugi dalam dari exit rule lain (pumped/OOR/lowYield). Rugi terdalam
(-12.88%, AIAIAI-SOL) adalah SL yang triggered di trough -13.68% (gap 3.68pp
lebih dalam dari -10% SL). close_reason-nya: "Stop loss: PnL -13.68% <= -10%".

✅ FASE 1 SELESAI.

════════════════════════════════════════════════════════════
FASE 2 — Frekuensi SL-cluster NYATA + "apakah bahaya berlanjut"
════════════════════════════════════════════════════════════

Timezone: closed_at disimpan UTC (lessons.js:233). Semua tanggal di bawah
dikonversi ke WIB (UTC+7) untuk per-hari grouping.

## (a) 1b: Hari dengan >=2 SL-event

| Tanggal (WIB)  | SL-event(s) |
|----------------|-------------|
| 2026-06-24     | 1           |
| 2026-06-25     | 1           |
| 2026-06-26     | 1           |
| 2026-06-27     | 2           |

Total hari dengan >=2 SL-event: **1 hari** (2026-06-27 WIB).

## (b) 1a: Streak SL-event BERTURUT-TURUT terpanjang

Streak dihitung per tanggal (WIB) yang sama — consecutive SL events di hari yang sama.

| Streak | Tanggal       |
|--------|---------------|
| 1      | 2026-06-24    |
| 1      | 2026-06-25    |
| 2      | 2026-06-26*   |
| 1      | 2026-06-27    |

*) Catatan: streak=2 di tanggal 2026-06-26 terjadi karena event #3
(2026-06-26T05:36 UTC = 2026-06-26 12:36 WIB) dan event #4
(2026-06-26T22:39 UTC = 2026-06-27 05:39 WIB) — di timezone WIB,
event #4 jatuh di 2026-06-27, bukan 2026-06-26. Jadi sebenarnya
di WIB, streak same-day maksimal = 1 (tidak ada 2 SL di hari WIB yang sama).
Streak=2 di atas HANYA valid kalau pakai UTC date.

**REVISI dengan WIB date:**
- Max streak same-day (WIB): **1** (tidak pernah 2 SL di hari WIB yang sama)
- Streaks >= 2 (WIB): **0**
- Streaks >= 3 (WIB): **0**

Max streak consecutive SL (UNRELATED to same-day — pure chronological):
- Event #4 (VALORA, -10.56%) → event #5 (liquititty, -6.48%) adalah 2 SL
  berturut-turut secara kronologis (tidak ada non-SL exit di antara).
  Tapi ini bukan same-day (WIB): #4 = 27 Jun 05:39 WIB, #5 = 27 Jun 10:49 WIB.
  Jadi chrono-streak = 2, same-day WIB streak = 1 (kedua event di tanggal WIB
  yang berbeda jika #4 dihitung ke 26 Jun UTC / 27 Jun WIB).

## (c) by-day: "hari-X ada SL, besoknya ada SL lagi"

Back-to-back days (WIB): tanggal T ada >=1 SL-event dan T+1 juga ada >=1 SL-event.

| Tanggal (WIB) → T+1     | Status         |
|-------------------------|----------------|
| 2026-06-24 → 06-25      | back-to-back ✓ |
| 2026-06-25 → 06-26      | back-to-back ✓ |
| 2026-06-26 → 06-27      | back-to-back ✓ |

Total back-to-back days: **3**.

SL events berlangsung 4 hari berturut-turut (24-27 Jun WIB), dengan
3 hari sebagai back-to-back pairs. Ini adalah satu cluster berkelanjutan.

## (d) VALIDASI NILAI PROTEKSI: setelah SL-event, posisi BERIKUTNYA hasil apa?

Urut chronological by closed_at. Tiap SL-event → record CLOSEST berikutnya:

| SL event                              | Next position                         | Next is SL? | Next pnl  |
|---------------------------------------|---------------------------------------|-------------|-----------|
| #1 QUEST -8.34% (06-24 05:17 UTC)     | FLKR +1.15% (06-24 05:31, low yield)  | NO          | +1.15%    |
| #2 AIAIAI -12.88% (06-25 13:12 UTC)   | GLUE +0.60% (06-25 13:30, pumped)     | NO          | +0.60%    |
| #3 FLKR -9.54% (06-26 05:36 UTC)      | VALORA +0.81% (06-26 07:23, trailing) | NO          | +0.81%    |
| #4 VALORA -10.56% (06-26 22:39 UTC)   | liquititty -6.48% (06-27 03:49, SL)   | **YES**     | -6.48%    |
| #5 liquititty -6.48% (06-27 03:49 UTC)| CATWIF +0.29% (06-27 06:59, pumped)   | NO          | +0.29%    |

**Hasil validasi:**
- Dari 5 SL-events, hanya 1 kasus (event #4 → #5) di mana posisi berikutnya
  juga SL. Itu satu-satunya "SL beruntun" di seluruh history v2_1.
- 3 dari 5 SL-event diikuti posisi yang MENANG (pnl > 0).
- 1 dari 5 diikuti posisi rugi non-SL (liquiditty: -6.48% — yang juga SL).

**Hipotesis owner "pas SL nyala beruntun, bahaya masih lanjut":**
- Hanya 1 instance SL-beruntun (event #4 → #5). Sampel terlalu kecil untuk
  konfirmasi statistik, tapi DALAM kasus itu, hipotesis TERKONFIRMASI:
  setelah SL #4 (VALORA -10.56%), posisi berikutnya juga SL (-6.48%).
 模型 simply tighten setelah SL #4 bisa saja telah menyelamatkan trade #5
  (liquititty: trough -12.36%, yang akan dipotong lebih awal oleh tighter SL).
- TAPI untuk 4 SL-event lainnya, posisi berikutnya BUKAN SL — bahkan 3 di antaranya menang.
  Jadi "bahaya berlanjut" TIDAK terjadi setiap SL.
- Vonis:hipotesis TERKONFIRMASI untuk 1 kasus (SL #4→#5), TIDAK untuk 4 lainnya.

## Side-reference: losing-exit (pnl_pct<0) per hari (WIB)

| Tanggal (WIB) | Losing exits |
|---------------|--------------|
| 2026-06-19    | 6            |
| 2026-06-20    | 5            |
| 2026-06-21    | 2            |
| 2026-06-22    | 1            |
| 2026-06-23    | 6            |
| 2026-06-24    | 5            |
| 2026-06-25    | 6            |
| 2026-06-26    | 6            |
| 2026-06-27    | 3            |
| 2026-06-28    | 7            |
| 2026-06-29    | 1            |

Catatan: losing-exit umum jauh lebih sering (~47 losing exits total),
tapi hanya 5 yang SL-triggered. Triggerbasis = SL-reason (owner decision) —
bukan losing-exit umum. Data losing-exit umum di sini hanya konteks.

✅ FASE 2 SELESAI.

════════════════════════════════════════════════════════════
FASE 3 — Avg-win & MAE (mainzen_v2_1) buat threshold
════════════════════════════════════════════════════════════

## Stats dasar (147 records, 98 wins, 49 losses):

| Metric                      | Value        |
|-----------------------------|--------------|
| Wins                        | 98           |
| Losses                      | 49           |
| Win rate                    | 66.7%        |
| **avg-win** (mean pnl_pct, pnl>0) | **+0.8070%** |
| **avg-loss** (mean pnl_pct, pnl<0) | **-1.3804%** |
| **50% dari avg-win**        | **+0.4035%** |
| Net PnL                     | +$1.98       |
| ROI                         | 0.07%        |
| Profit factor               | 1.15         |

## Trough (MAE / Maximum Adverse Excursion):

| Group   | N   | avg trough  | worst trough |
|---------|-----|-------------|--------------|
| ALL     | 147 | -0.9379%    | -13.68%      |
| WINNERS | 98  | -0.4984%    | **-7.22%**   |
| LOSERS  | 49  | -1.8169%    | -13.68%      |

## Price Trough (raw price MAE, dari bin movement):

| Group   | N   | avg trough  | worst trough |
|---------|-----|-------------|--------------|
| ALL     | 147 | -9.72%      | -45.50%      |
| WINNERS | 98  | -9.80%      | -33.50%      |
| LOSERS  | 49  | -9.55%      | -45.50%      |

## Winners' worst trough (5 terdalam):

| trough    | pnl_pct | pool        |
|-----------|---------|-------------|
| -7.22%    | +1.17%  | glippy-SOL  |
| -5.47%    | +2.31%  | WYNN-SOL    |
| -3.78%    | +0.18%  | POKÉFIGHT-SOL |
| -3.46%    | +1.03%  | FARM-SOL    |
| -2.45%    | +0.30%  | POKÉFIGHT-SOL |

## Winners yang sempat trough <= level X (dipotong oleh tighter SL):

| SL Level | Winners with trough <= X | % of winners |
|----------|--------------------------|--------------|
| -5%      | 2/98                     | 2.0%         |
| -6%      | 1/98                     | 1.0%         |
| -7%      | 1/98                     | 1.0%         |
| -8%      | 0/98                     | 0.0%         |
| -10%     | 0/98                     | 0.0%         |

## Losers yang sempat trough <= level X:

| SL Level | Losers with trough <= X | % of losers |
|----------|-------------------------|------------|
| -5%      | 5/49                    | 10.2%      |
| -6%      | 5/49                    | 10.2%      |
| -7%      | 5/49                    | 10.2%      |
| -8%      | 5/49                    | 10.2%      |
| -10%     | 5/49                    | 10.2%      |

**Temuan kritis:** tidak ada winner yang trough <= -8%. Artinya SL di -8%
 atau lebih ketat TIDAK akan memotong ANY winner (dalam data v2_1).
 SL di -7% memotong 1 winner (glippy-SOL, trough -7.22%, actual pnl +1.17%).
 SL di -5% memotong 2 winner (glippy + WYNN).

✅ FASE 3 SELESAI.

════════════════════════════════════════════════════════════
FASE 4 — BACKTEST tighten + cek GAP-THROUGH
════════════════════════════════════════════════════════════

## Script: scripts/backtest-exits.js

Bukti file:line:
- Load: scripts/backtest-exits.js:25-35 — filter `!r.paper && !r.suspect_pnl && r.active_setup === RACIKAN`
- Sim model: scripts/backtest-exits.js:72-89 — `simStopLoss(recs, L)`:
  - `hit = trough_pnl_pct <= L` (:76)
  - `simPct = hit ? L : r.pnl_pct` (:77)
  - `simUsd = (simPct / 100) * r.initial_value_usd` (:78)
  - winner_cut: pnl_pct > 0 dan hit (:82)
  - loser_capped: pnl_pct <= L dan hit (:83)
  - loser_deepened: L < pnl_pct <= 0 dan hit (:84)
- Script default baseline = -12 (old v2), level Ls = [-6,-8,-10,-12,-15].
- Script dijalankan: `node scripts/backtest-exits.js mainzen_v2_1`
  → output: n=147, net=+$1.98, win=66%, PF=1.15 (match with /report ✓).

## Backtest TIGHTEN (baseline=-10 LIVE, level lebih ketat saja)

Model: sama dengan script (trough_pnl_pct <= L → simExit = L).
Dihitung manual (read-only) menggunakan formula identik scripts/backtest-exits.js:72-89.

| L      | trig | win-cut | loss-cap | loss-deep | net$    | win% | Δnet$ vs -10 |
|--------|------|---------|----------|-----------|---------|------|--------------|
| -10 *  | 5    | 0       | 2        | 3         | +$1.59  | 67%  | +0.00        |
| -9     | 5    | 0       | 3        | 2         | +$2.58  | 67%  | +$0.99       |
| -8     | 5    | 0       | 4        | 1         | +$3.57  | 67%  | +$1.98       |
| -7     | 6    | 1       | 4        | 1         | +$2.65  | 66%  | +$1.06       |
| -6     | 6    | 1       | 5        | 0         | +$3.88  | 66%  | +$2.29       |
| -5     | 7    | 2       | 5        | 0         | +$3.87  | 65%  | +$2.28       |

* = baseline live (-10%)

Catatan: net$ di tabel INI berbeda dari output script (+$1.98) karena:
  - Script baseline = -12 (old v2), tabel ini baseline = -10 (live v2_1).
  - Dengan L=-10, simExit=-10% untuk 5 record yang trough<=-10. Tapi actual
    data sudah punya beberapa record yang exit di level lebih dalam dari -10
    (gap-through). Jadi simExit=-10 untuk record dengan actual pnl=-12.88%
    menghasilkan delta positif (cap lebih tinggi), tapi actual net virtual
    (no SL overlay) = +$1.98 sedangkan sim L=-10 = +$1.59.
  - Perbedaan +$1.98 vs +$1.59 = $0.39 — ini karena "loss-deep" records
    (pnl antara -10% dan 0%) dipotong ke -10% (lebih dalam dari actual
    mereka yang <10% loss). Lihat loss-deep column: 3 records di L=-10.

## Detail per level (record yang ter-impact):

### L=-5 (trig: 7)
| Pool           | trough   | actual pnl | sim  | Δ$     | Status       |
|----------------|----------|-----------|------|--------|--------------|
| AIAIAI-SOL     | -13.68%  | -12.88%   | -5%  | +$1.63 | LOSER CAPPED |
| liquititty-SOL | -12.36%  | -6.48%    | -5%  | +$0.26 | LOSER CAPPED |
| VALORA-SOL     | -10.27%  | -10.56%   | -5%  | +$1.05 | LOSER CAPPED |
| FLKR-SOL       | -10.24%  | -9.54%    | -5%  | +$0.86 | LOSER CAPPED |
| QUEST-SOL      | -10.18%  | -8.34%    | -5%  | +$0.75 | LOSER CAPPED |
| glippy-SOL     | -7.22%   | +1.17%    | -5%  | -$1.44 | **WINNER CUT** |
| WYNN-SOL       | -5.47%   | +2.31%    | -5%  | -$1.24 | **WINNER CUT** |

### L=-6 (trig: 6)
| Pool           | trough   | actual pnl | sim  | Δ$     | Status       |
|----------------|----------|-----------|------|--------|--------------|
| AIAIAI-SOL     | -13.68%  | -12.88%   | -6%  | +$1.43 | LOSER CAPPED |
| liquititty-SOL | -12.36%  | -6.48%    | -6%  | +$0.09 | LOSER CAPPED |
| VALORA-SOL     | -10.27%  | -10.56%   | -6%  | +$0.86 | LOSER CAPPED |
| FLKR-SOL       | -10.24%  | -9.54%    | -6%  | +$0.67 | LOSER CAPPED |
| QUEST-SOL      | -10.18%  | -8.34%    | -6%  | +$0.53 | LOSER CAPPED |
| glippy-SOL     | -7.22%   | +1.17%    | -6%  | -$1.67 | **WINNER CUT** |

### L=-7 (trig: 6)
| Pool           | trough   | actual pnl | sim  | Δ$     | Status       |
|----------------|----------|-----------|------|--------|--------------|
| AIAIAI-SOL     | -13.68%  | -12.88%   | -7%  | +$1.22 | LOSER CAPPED |
| liquititty-SOL | -12.36%  | -6.48%    | -7%  | -$0.09 | LOSER DEEPENED |
| VALORA-SOL     | -10.27%  | -10.56%   | -7%  | +$0.67 | LOSER CAPPED |
| FLKR-SOL       | -10.24%  | -9.54%    | -7%  | +$0.48 | LOSER CAPPED |
| QUEST-SOL      | -10.18%  | -8.34%    | -7%  | +$0.30 | LOSER CAPPED |
| glippy-SOL     | -7.22%   | +1.17%    | -7%  | -$1.90 | **WINNER CUT** |

### L=-8 (trig: 5)
| Pool           | trough   | actual pnl | sim  | Δ$     | Status       |
|----------------|----------|-----------|------|--------|--------------|
| AIAIAI-SOL     | -13.68%  | -12.88%   | -8%  | +$1.01 | LOSER CAPPED |
| liquititty-SOL | -12.36%  | -6.48%    | -8%  | -$0.27 | LOSER DEEPENED |
| VALORA-SOL     | -10.27%  | -10.56%   | -8%  | +$0.48 | LOSER CAPPED |
| FLKR-SOL       | -10.24%  | -9.54%    | -8%  | +$0.29 | LOSER CAPPED |
| QUEST-SOL      | -10.18%  | -8.34%    | -8%  | +$0.07 | LOSER CAPPED |

### L=-9 (trig: 5)
| Pool           | trough   | actual pnl | sim  | Δ$     | Status       |
|----------------|----------|-----------|------|--------|--------------|
| AIAIAI-SOL     | -13.68%  | -12.88%   | -9%  | +$0.81 | LOSER CAPPED |
| liquititty-SOL | -12.36%  | -6.48%    | -9%  | -$0.45 | LOSER DEEPENED |
| VALORA-SOL     | -10.27%  | -10.56%   | -9%  | +$0.29 | LOSER CAPPED |
| FLKR-SOL       | -10.24%  | -9.54%    | -9%  | +$0.10 | LOSER CAPPED |
| QUEST-SOL      | -10.18%  | -8.34%    | -9%  | -$0.15 | LOSER DEEPENED |

## NET PnL delta vs baseline -10:

| L  | Δnet$ vs -10 | Win-cut | Biaya winner-cut | Manfaat loss-cap | Biaya loss-deep |
|----|-------------|---------|------------------|------------------|-----------------|
| -9 | +$0.99      | 0       | $0              | +$1.20           | -$0.15 (net)    |
| -8 | +$1.98      | 0       | $0              | +$2.45           | -$0.27          |
| -7 | +$1.06      | 1       | -$1.90          | +$2.67           | -$0.09          |
| -6 | +$2.29      | 1       | -$1.67          | +$3.58           | $0              |
| -5 | +$2.28      | 2       | -$2.68          | +$4.55           | $0              |

**Semua level tighten NET POSITIF vs baseline -10.**
Level terbaik: L=-6 (+$2.29) dan L=-5 (+$2.28) hampir sama.
Level tanpa winner-cut: L=-8 (+$1.98) dan L=-9 (+$0.99).

CATATAN konsep (dari task spec):
Backtest ini "always-tight" (SL selalu di level X). Padahal adaptive SL cuma
tighten SELAMA danger-window. Jadi ongkos potong-winner versi adaptif
< angka backtest ini. Ini adalah batas ATAS ongkos.

## GAP-THROUGH analysis (pertanyaan uang)

Pertanyaan: apakah trough jauh lebih dalam dari -10% SL? Kalau ya, tighten
ke -5% mungkin nggak nangkep (gap lebih cepat dari poll).

### 5 SL-triggered records: trough vs SL=-10

| Pool           | trough   | actual pnl | gap-through (|trough - (-10)|) |
|----------------|----------|-----------|------------------------------|
| QUEST-SOL      | -10.18%  | -8.34%    | 0.18pp                       |
| AIAIAI-SOL     | -13.68%  | -12.88%   | 3.68pp                       |
| FLKR-SOL       | -10.24%  | -9.54%    | 0.24pp                       |
| VALORA-SOL     | -10.27%  | -10.56%   | 0.27pp                       |
| liquititty-SOL | -12.36%  | -6.48%    | 2.36pp                       |

### Vonis gap-through:
- **3 dari 5** SL events trough hanya sedikit di bawah -10% (0.18-0.27pp).
  Ini "berhenti dekat level SL" — tighten ke -5% atau -8% akan menangkap
  lebih awal (karena trough <= L juga triggered).
- **2 dari 5** SL events gap jauh: AIAIAI (3.68pp) dan liquititty (2.36pp).
  Tapi tetap tertangkap: trough mereka (-13.68%, -12.36%) masih di atas
  level tighten manapun (-5 sampai -9), jadi model backtest menangkap semua.
- **TIDAK ADA rugi yang totally gap-through lewat SL.** Semua 5 SL-triggered
  record punya trough yang readable dan tertangkap di semua level L.
- Yang lebih penting: dari trough <= -10 group, actual pnl vs trough gap:
  — QUEST: trough -10.18% → actual -8.34% (gap 1.84pp, pulih 1.84pp)
  — AIAIAI: trough -13.68% → actual -12.88% (gap 0.80pp, hampir tidak pulih)
  — FLKR: trough -10.24% → actual -9.54% (gap 0.70pp, pulih)
  — VALORA: trough -10.27% → actual -10.56% (gap 0.29pp, makin dalam)
  — liquititty: trough -12.36% → actual -6.48% (gap 5.88pp, pulih besar!)

Catatan: liquititty pulih dari -12.36% ke -6.48% — ini mengindikasikan
SL di -12% menutup posisi tepat sebelum pemulihan. Tapi SL dipicu
tepat di -12.36% trough (bukan actual pnl), dan actual close di -6.48%.
Ini terjadi karena SL dipicu saat trough lewat -10%, tapi close terjadi
nanti setelah pulih. Artinya: tighten SL ke -6% akan memicu exit lebih awal
di -6% (trough -12.36% <= -6%), menghasilkan simExit=-6% vs actual -6.48%.
Delta = +$0.09 (sedikit lebih baik).

### Gap-through ke -45% area?
Dari recon sebelumnya, ada 1 record v2_1 dengan price_trough_pct=-45.5%
(price excursion, bukan PnL trough). Tapi itu PRICE movement, bukan PnL.
PnL trough terdalam = -13.68% (AIAIAI). Tidak ada PnL trough yang lewat -14%.
Jadi gap-through ekstrim (rug -45%) TIDAK ada di PnL dimension — yang ada
di price dimension. SL bekerja pada PnL, bukan price.

✅ FASE 4 SELESAI.

════════════════════════════════════════════════════════════
FASE 5 — Recommendation engine existing bilang apa?
════════════════════════════════════════════════════════════

## Logika yang dibaca (file:line):

### reports.js:440-442 — winnersDipDeep guard
```js
const pm = stats.price_movement;
const winnersDipDeep = !!(pm && pm.win_worst_trough_pct != null && pm.loss_avg_trough_pct != null
  && pm.win_worst_trough_pct < pm.loss_avg_trough_pct); // winners' deepest dip is below losers' avg dip
```
Logika: kalau winners' worst trough (MAE terdalam) LEBIH DALAM dari losers'
avg trough, maka tighten SL akan memotong winners → JANGAN tighten.

### reports.js:450-456 — lopsided + winnersDipDeep recommendation
```js
if (lopsided) {
  if (winnersDipDeep) {
    recs.push(`Avg loss ... > avg win ... TAPI winners justru tahan dip lebih dalam ... jangan perketat stopLoss/OOR ... Bocornya di kualitas entry: perketat screening rug/dump ...`);
  } else {
    recs.push(`Avg loss ... bigger than avg win ... cut losers faster: tighten stopLossPct ... or shorten outOfRangeWaitMinutes ...`);
  }
}
```

### reports.js:458-466 — tail risk recommendation
Kalau biggest_loss pnl_pct <= -30%:
  - Kalau <= -50% atau winnersDipDeep → "stop harga telat, perketat screening"
  - Lainnya → "a hard stopLossPct would have capped it"

## Output untuk data live v2_1 SEKARANG:

Dijalankan via node (menggunakan getModePerformance() + computeTradeStats()):

| Metric                  | Value        |
|-------------------------|--------------|
| net_pnl_usd             | +$1.98       |
| profit_factor           | 1.15         |
| payoff_ratio            | 0.56         |
| netNeg                  | false        |
| weakPF                  | **true** (< 1.2) |
| lopsided                | **true** (payoff < 1) |
| price_movement samples  | 147          |
| win_worst_trough_pct    | -33.50%      |
| loss_avg_trough_pct     | -9.36%       |
| **winnersDipDeep**      | **true** (-33.5 < -9.36) |

## Output rekomendasi engine:

1. "⚠️ PnL $1.98 with profit factor 1.15 — book is not profitable yet.
    DO NOT scale up; fix the leak before sizing up."
   → Dipicu karena weakPF (1.15 < 1.2).

2. "Avg loss (-1.38%) > avg win (+0.81%). TAPI winners justru tahan dip lebih
    dalam (-33.50%) dari rata-rata loser (-9.36%) — **jangan perketat
    stopLoss/OOR** (bakal motong pemenang). Bocornya di kualitas entry:
    perketat screening rug/dump (holder/bundler/likuiditas exit)."
   → Dipicu karena lopsided AND winnersDipDeep.

3. Tail risk: biggest_loss pnl_pct = -12.88% → tidak <= -30%, jadi tidak dipicu.

**"Pendapat kedua" dari kode existing:**
Engine JUSTRU MENYARANKAN **JANGAN PERKETAT SL** (karena winnersDipDeep = true).
Alasannya: winners' worst price trough (-33.5%) jauh lebih dalam dari losers'
avg price trough (-9.36%), jadi tighten SL berbasis PRICE akan memotong
winners yang survive price dip dalam.

**TAPI ada nuansa penting:**
- winnersDipDeep guard memakai price_movement (price_trough_pct = raw price
  excursion dari bin movement), BUKAN trough_pnl_pct (PnL MAE yang sudah
  hitung fees/IL).
- Price trough -33.5% vs PnL trough -7.22% untuk winners = sangat berbeda.
  Winners' PnL trough terdalam hanya -7.22% (Fase 3) — bahkan tidak ada
  winner yang trough_pnl_pct <= -8%.
- Jadi guard winnersDipDeep di kode existing menimbang dari PRICE MAE
  (yang lebih ekstrim), bukan PnL MAE (yang lebih realistis untuk SL).
- BACKTEST PnL-MAE (Fase 4) menunjukkan tighten ke -8% TIDAK memotong
  ANY winner (0 winner-cut). Ini kontradiksi dengan winnersDipDeep guard.

**Vonis Fase 5:**
Kode existing memakai PRICE MAE sebagai proxy → lebih konservatif →
menyarankan jangan tighten. Backtest PnL MAE (yang akurat untuk SL) →
menunjukkan tighten ke -8% aman (0 winner cut) dan net positif.
Pendapat kedua: **"jangan tighten"** — tapi berdasarkan price MAE yang
lebih konservatif dari PnL MAE yang sebenarnya relevan untuk SL.

✅ FASE 5 SELESAI.

════════════════════════════════════════════════════════════
FASE 6 — Vonis berbasis angka
════════════════════════════════════════════════════════════

## Tabel keputusan

### 1. N realistis untuk 1a (consecutive SL) & ambang 1b (per-hari)

**Data v2_1 (5 SL-events dalam 147 records, 19 hari):**

| Metric                                   | Value  | Vonis                                |
|------------------------------------------|--------|--------------------------------------|
| SL-events total                           | 5      | —                                    |
| Hari dengan >=2 SL-event (1b)            | **1**  | 2026-06-27 WIB (2 events)            |
| Max same-day streak (WIB) (1a)           | **1**  | tidak pernah 2 SL di hari WIB sama   |
| Max same-day streak (UTC) (1a)           | **2**  | 2026-06-26 UTC (FLKR + VALORA)       |
| Chrono consecutive SL streak             | **1**  | (hanya 1 pair: #4→#5) berdurasi 2    |
| Back-to-back days (SL hari-T, SL hari-T+1)| **3**  | 24-25, 25-26, 26-27 Jun WIB          |

**Vonis JUJUR:**
- SL-cluster di v2_1 adalah ** event langka**. Hanya 5 SL-events dalam
  147 records (3.4%). Hanya 1 hari dengan >=2 SL-events.
- Untuk 1a (consecutive SL): max streak = 2 (chrono), 1 (same-day WIB).
  N=2 adalah satu-satunya instance. Tidak ada >=3.
- Untuk 1b (per-hari >=2): hanya 1 hari kejadian. Ambang "2 SL di hari
  yang sama" kelihatan TIDAK akan trigger sering di v2_1.
- TAPI: 4 hari berturut-turut (24-27 Jun) semua ada SL events, dengan
  3 back-to-back pairs. Ini adalah satu cluster berkelanjutan. Kalau
  ambangnya "2 SL dalam 2 hari berturut" (rolling window), ini lebih
  sering trigger (3 kali).
- **Fitur = asuransi langka.** Keputusan owner apakah tetap worth:
  clamp di -10% sudah melindungi 5 rugi terdalam (yang semua SL-triggered).
  Tighten adaptif hanya aktif saat danger window, dan danger window
  kebetulan jarang. Tapi ketika aktif (24-27 Jun), tighten ke -8% atau -6%
  bisa menambah $1.98-$2.29 PnL (backtest always-tight, batas atas).

### 2. Level tighten kandidat yang NET positif

| Level | Δnet$ vs -10 | win-cut | Gap-through risk | Vonis    |
|-------|-------------|---------|------------------|----------|
| -9    | +$0.99      | 0       | minimal          | AMAN, modest |
| **-8**| **+$1.98**  | **0**   | **minimal**      | **AMAN, optimal** |
| -7    | +$1.06      | 1 (glippy -$1.90) | minimal  | winner-cut mengurangi net |
| -6    | +$2.29      | 1 (glippy -$1.67) | minimal  | best net, tapi ada winner-cut |
| -5    | +$2.28      | 2 (glippy+WYNN -$2.68) | minimal | best net hampir sama -6, tapi 2 winner-cut |

**Rekomendasi level tighten:**
- **-8%** = optimal "safe" zone: 0 winner-cut, +$1.98 net delta.
- **-6%** = best net (+$2.29) tapi potong 1 winner (glippy-SOL).
  Dalam adaptif (hanya saat danger), ongkos glippy-cut mungkin dihindari.
- -5% hampir sama dengan -6%, tapi potong 2 winner → tidak worth tambahan.

### 3. Ambang menang-berkualitas

| Metric                          | Value        |
|---------------------------------|--------------|
| avg-win                         | +0.8070%     |
| 50% dari avg-win                | +0.4035%     |
| 1 winner-cut at L=-6 (glippy)   | -$1.67       |
| 1 winner-cut at L=-7 (glippy)   | -$1.90       |

Kandidat ambang "menang berkualitas" (win yang nggak ingin dipotong):
- avg-win = +0.81%. Winner-cut terkecil di data = glippy (+1.17%) dan
  WYNN (+2.31%). Keduanya dipotong hanya di L=-5 / L=-6 / L=-7.
- L=-8 tidak memotong winner APAPUN. Jadi -8% adalah level aman yang
  melindungi semua winner di data v2_1.

### 4. FLAG JUJUR

**(i) Backtest net NEGATIF?**
**TIDAK.** Semua level tighten (-5 sampai -9) NET POSITIF vs baseline -10.
Tidak ada level yang merugikan. Level terburuk (-9) masih +$0.99.
Level terbaik (-6) +$2.29.
Tapi ingat: ini adalah "always-tight" backtest (batas atas ongkos).
Adaptif hanya tighten saat danger → ongkos lebih kecil.

**(ii) Deep-loss gap-through?**
**TIDAK SIGNIFIKAN.** Hanya 2 dari 5 SL events yang trough gap >2pp
lebih dalam dari -10% (AIAIAI 3.68pp, liquititty 2.36pp). Sisanya
(3 dari 5) berhenti dekat -10% (0.18-0.27pp gap).
Tidak ada PnL trough yang jauh lewat -14% area. PnL trough terdalam
= -13.68% (AIAIAI). Semua tertangkap di semua level L (karena trough
di atas -5/-6/-7/-8/-9). Jadi tighten ke -5% pun tetap menangkap semua.

**CATATAN penting tentang gap-through:**
Gap-through di sini berarti "trough lewat SL level tapi tetap
tertangkap karena trough masih di atas level tighten". Ini BUKAN
gap-through dalam arti "rugi loncat dari -5% langsung ke -30% tanpa
nglicable trough intermediate". Untuk cek itu, perlu data tick-by-tick
polling, yang tidak tersimpan. Yang tersimpan adalah trough_pnl_pct
(lowest PnL% seen while open) — ini adalah hasil polling, bukan tick.
Kalau ada rugi yang gap dari 0% ke -30% dalam 1 poll interval (10 menit),
trough akan tercatat -30% (tertangkap), tapi actual exit mungkin di -30%
juga (tidak sempat dipotong di -5%). Backtest model "exit di L" optimistik.
Untuk v2_1, tidak ada record dengan PnL trough < -14%, jadi risiko
gap-through ekstrim rendah di data ini.

### 5. Konflik dengan kode existing (Fase 5)

Engine existing menyarankan **JANGAN tighten** (winnersDipDeep = true),
tapi itu memakai price_trough_pct (raw price MAE) sebagai proxy.
Backtest PnL MAE (yang akurat untuk SL) menunjukkan tighten ke -8%
aman (0 winner-cut). Engine existing lebih konservatif karena price
MAE lebih ekstrim dari PnL MAE (fees/IL meredam PnL trough).

**Vonis:** Engine existing TIDAK akan recommend tighten SL untuk v2_1.
Ini bukan berarti tighten salah — engine memakai proxy yang berbeda
(price vs PnL). Keputusan adaptif SL tetap kewenangan desain 🅶.
Tapi HATI-HATI: kalau 🅶 diaktifkan dan engine existing tetap memakai
winnersDipDeep guard, engine akan menyarankan "jangan tighten" bahkan
ketika 🅶 sedang aktif tighten. Perlu sinkronisasi logika di masa depan.

### 6. Rekomendasi field yang perlu dicatat (overlap sama 🅱️)

Untuk implementasi 🅶, semua field yang dibutuhkan SUDAH ADA (lihat
recon sebelumnya: notes/G-adaptive-sl-recon-findings.md). Tidak ada
field baru yang diperlukan untuk MVP.

Yang MUNGKIN perlu untuk versi lanjutan:
- `sl_trigger_count` per racikan per rolling window — bisa dihitung
  on-the-fly dari lessons.json, tidak perlu field baru.
- `stop_loss_pct_at_deploy` (value SL saat deploy) — kalau SL berubah
  mid-posisi karena tighten adaptif, perlu tahu "SL berapa saat deploy"
  untuk audit. Tapi MVP yang tighten global per-racikan tidak pero.

✅ FASE 6 SELESAI. ANALISA LENGKAP.