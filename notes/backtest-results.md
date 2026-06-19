# BACKTEST EXIT PARAMS — HASIL (mainzen_v2, n=74)

**Tanggal:** 2026-06-16 · **Script:** `scripts/backtest-exits.js` (offline, READ-ONLY `lessons.json`).
**Sifat:** SIMULASI tuning — BUKAN apply ke live. Acuan model: `notes/v2.1-testmethod-recon.md`.
Reproduksi: `node scripts/backtest-exits.js`.

## SANITY-CHECK ✅
Agregasi script = jalur `/report` (getModePerformance + computeTradeStats), **persis**:
`n=74 · net −$8.43 · roi −0.65% · win 69% · PF 0.53`. → math + filter benar.

> Baseline live saat ini: **stopLoss −12 · trailing trig 1.5 / drop 1.0**. Buku 74-trade ini
> net SEDIKIT MERAH (−$8.43), didominasi 1 ekor: rug **1B-SOL −$16.14** (tanpa dia, buku hijau).

---

## FASE 1 — STOPLOSS (trigger faithful via `trough_pnl_pct ≤ L`)

⚠️ Caveat optimistik: exit dimodelkan TEPAT di L (abaikan overshoot/slippage). Utk RUG, realita gap jauh.

| L | trig | win-cut | loss-cap | loss-deep | net$ | roi% | win% | PF | Δnet vs −12 |
|---|---|---|---|---|---|---|---|---|---|
| −6 | 4 | **2** | 1 | 1 | +$1.90 | 0.15 | 66 | 1.30 | −1.49 |
| −8 | 1 | 0 | 1 | 0 | +$4.83 | 0.37 | 69 | 2.06 | +1.43 |
| −10 | 1 | 0 | 1 | 0 | +$4.11 | 0.32 | 69 | 1.78 | +0.72 |
| **−12*** | 1 | 0 | 1 | 0 | +$3.39 | 0.26 | 69 | 1.57 | 0 |
| −15 | 0 | 0 | 0 | 0 | −$8.45 | −0.65 | 69 | 0.53 | −11.84 |

`win-cut` = winner (pnl asli>0) ke-stop jadi rugi L (biaya). `loss-cap` = loser (asli≤L) di-cap (manfaat).
`*` baseline. Catatan: tiap L≥−12 cuma cap rug ke −12 (net overlay +$3.39 vs raw −$8.43 = +$11.84 optimis).

**🛑 SOROTAN RUG 1B-SOL:** trough −12.16% → model exit −12% = −$4.30. **REALITA −45.05% = −$16.14**
(reason: "Trailing TP: Stop loss: PnL −12.16% <= −12%"). StopLoss **memang nyala** di −12 tapi
swap-exit ke SOL realisasi −45% (token rug, exit ilikuid). Model overstate **+$11.84** di trade ini.

**Baca trade-off:**
- Di rentang **−8…−12 cuma RUG yg ke-trigger** → buku NON-rug tak tersentuh sama sekali. "Perbaikan"
  −8 vs −12 (+$1.43) = **PALSU** (cuma cap rug lebih ketat di model; realita rug gap −45 apapun L-nya).
- **−6 mulai motong 2 WINNER** (PF 1.57→1.30, net turun) → terlalu ketat.
- **−15 = praktis tanpa stopLoss** (tak ada dip ≤−15 selain rug yg juga lolos) → net = raw.

**Verdict stopLoss:** level stopLoss punya **~nol leverage nyata** di buku ini. Satu-satunya yg disentuh
di [−8,−12] = rug, dan rug **tak bisa diselamatkan PnL-stop** (gap lewat ambang). Mengetatkan ke −6 malah
motong pemenang. → **PERTAHANKAN −12** (jangan ketatkan demi nangkap rug). Pertahanan rug asli =
**screening (hindari pool)** / exit-liquidity check, BUKAN stopLoss lebih ketat.

---

## FASE 2 — TRAILING (RANKING — APPROX)

⚠️ APPROX: urutan peak/trough TAK diketahui. Model "tiap trade peak≥T exit di peak−D" = **PLAFON OPTIMIS**
(asumsi jual dekat puncak). Magnitudo TAK dipercaya; pakai utk arah + ranking → konfirmasi paper.

| T | D | armed | net$ | roi% | win% | PF | Δnet vs base |
|---|---|---|---|---|---|---|---|
| 0.8 | 0.5 | 35 | +$10.39 | 0.80 | 74 | 20.66 | +18.41 |
| 0.8 | 1.0 | 35 | +$7.32 | 0.57 | 69 | 13.70 | +15.35 |
| 1.0 | 0.5 | 32 | +$10.03 | 0.78 | 72 | 14.62 | +18.06 |
| 1.0 | 1.0 | 32 | +$7.23 | 0.56 | 70 | 10.81 | +15.25 |
| 1.2 | 0.5 | 28 | −$6.14 | −0.47 | 70 | 0.64 | +1.88 |
| 1.2 | 1.0 | 28 | −$8.40 | −0.65 | 70 | 0.50 | −0.38 |
| 1.5 | 0.5 | 23 | −$6.33 | −0.49 | 70 | 0.62 | +1.69 |
| **1.5*** | **1.0** | 23 | −$8.03 | −0.62 | 70 | 0.52 | 0 |

**Pola (arah, bukan angka):**
- **Drop ketat menang konsisten:** D=0.5 > D=1.0 di SEMUA T (+$2–3 tiap pasang) → kunci profit lebih awal.
- **Cliff di T≈1.0–1.2:** T≤1.0 (arm 32–35 trade) lompat ke net positif; T≥1.2 (arm 23–28) tetap merah.
  → banyak trade "bagus" ber-peak di [1.0,1.2): arm lebih dini menguncinya. Ambang T~1.0 berarti.
- PF 20 / +$18 = artefak optimisme model (jangan dibaca harfiah).

**Verdict trailing:** arah jelas = **turunkan drop 1.0→0.5** + **turunkan trigger 1.5→~1.0**. Tapi karena
model = plafon optimis, ini **kandidat RANKING**, wajib **konfirmasi paper** sebelum apply live.

---

## REKOMENDASI

| Param | Aksi | Kepercayaan | Catatan |
|---|---|---|---|
| **stopLossPct** | **TETAP −12** | Tinggi (trigger faithful) | level inert utk buku non-rug; rug gap lewat ambang → jangan ketatkan. −6 motong winner. |
| **trailingDropPct** | **uji 1.0 → 0.5 (paper)** | Sedang (arah) | menang konsisten di semua T; magnitudo optimis. |
| **trailingTriggerPct** | **uji 1.5 → ~1.0 (paper)** | Sedang (arah) | cliff T≈1.0–1.2; arm lebih dini kunci trade peak-rendah. |
| rug defense | screening / exit-liquidity (BUKAN stopLoss) | Tinggi | PnL-stop tak menyelamatkan exit ilikuid. |

**Langkah lanjut:** spin paper bench (lihat `notes/v2.1-testmethod-recon.md` Q3) utk konfirmasi
kandidat trailing **(T=1.0, D=0.5)** dan **(T=0.8, D=0.5)** sebelum apply ke live. StopLoss = tak perlu diubah.

**Batas (DI LUAR backtest ini):** bin-width = fase lain. screening-rug = paper. Backtest ≠ apply live.
