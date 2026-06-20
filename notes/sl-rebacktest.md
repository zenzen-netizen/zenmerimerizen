# SL-REBACKTEST — Apakah trough-beku nyesatin verdict Stop-Loss?

> ANALISIS OFFLINE, READ-ONLY. Nol edit/restart/commit kode/config. Branch `experimental`,
> BOT UTAMA `/home/ubuntu/meridianzen`. Bukti = `file:line`. Ragu = UNKNOWN. Tanggal 2026-06-20.
> Lanjutan [[gap-recon]] (notes/gap-recon.md) yg nemu `trough_pnl_pct` beku saat tick suspicious.

## TL;DR — verdict SL −10 **BERTAHAN**; trough-beku **TIDAK** nyesatin tuning SL

`price_trough_pct` (excursion HARGA, jujur) memang jeblok jauh lebih dalam dari `trough_pnl_pct`
(PnL beku) di **41 dari 76 winner** — sekilas "winner cuma dip dangkal padahal harga ambruk 20-34%".
**TAPI itu axis yang SALAH buat tuning SL.** SL bertindak atas **mark-to-market PnL** (`currentPnlPct`),
bukan excursion harga — dan SL **berbagi gate `!pnl_pct_suspicious` yang SAMA PERSIS** dengan perekaman
`trough_pnl_pct`. Jadi `trough_pnl_pct` = "lantai PnL terdalam yang PERNAH dilihat SL". Lantai itu untuk
winner **terdalam cuma −7.0%** — 3pp di atas −10. **SL −10 motong 0 winner** (faithful). Pakai
`price_trough` sbg axis SL = over-state 41 winner-cut palsu.

---

## FASE 1 — CEK trough-beku nyesatin verdict SL ✅

### Mekanik (kode) — kenapa dua field beda & kenapa itu menentukan
`updatePnlAndCheckExits()` (state.js:483):
- `trough_pnl_pct` (state.js:505-510) = PnL mark-to-market terendah, **DIJAGA `!pnl_pct_suspicious`**.
- `price_trough_pct` (state.js:515-526) = excursion harga dari gerak bin `((1+step/1e4)^(bin_now−bin_entry)−1)·100`,
  **TIDAK dijaga** → terus update walau harga ambruk.
- ⭐ **STOP-LOSS (state.js:550)**: `if (!pnl_pct_suspicious && currentPnlPct <= stopLossPct)`. **GATE SAMA**
  (`!pnl_pct_suspicious`) dgn perekaman trough (state.js:505). `pnl_pct_suspicious` di-set saat reported vs
  derived PnL beda >5pp (`dlmm.js:1766`, `pnlSanityMaxDiffPct=5`) — gampang nyala saat crash cepat.

**Implikasi kunci:** karena SL dan trough_pnl **dibekukan oleh flag yang sama**, `trough_pnl_pct` adalah
batas jujur dari "PnL terdalam yang bisa ditindak SL". Kalau satu tick suspicious, SL **juga tak nyala** di
tick itu. Jadi excursion harga yang dalam (`price_trough`) **tak pernah** jadi tick PnL-bersih ≤ −10 yang
bisa dipicu SL. → trough-beku **tak bisa** bikin SL diam-diam motong winner.

### Coverage (caveat task)
- total live record (non-paper, non-suspect): **116** · punya `price_trough_pct`: **98 (84%)** · winner: **76**
  (punya price_trough: 63) · loser: 40. Record lama (cth 1B-SOL) tak punya `price_trough_pct` (tracker
  ditambah belakangan). Jadi ini **cek-silang**, bukan vonis baru — sesuai arahan.

### ⭐ PERTANYAAN INTI: ada WINNER dip-dangkal-by-trough tapi price_trough jeblok dalam?
**ADA — 41 winner.** Contoh ekstrem (semua WINNER, tutup positif):

| pool | pnl% | trough_pnl% (beku) | price_trough% (jujur) | SL −10 faithful nyala? |
|---|---|---|---|---|
| Merlin-SOL | +3.6 | −0.1 | **−20.5** | tidak |
| SOCCER-SOL | +4.2 | −3.9 | **−34.2** | tidak |
| Islands-SOL | +4.2 | −1.4 | **−29.4** | tidak |
| 01-SOL | +1.4 | −0.0 | **−26.7** | tidak |
| bullieve-SOL | +1.5 | −0.1 | **−26.5** | tidak |
| TURTLE-SOL | +2.2 | −4.8 | **−30.8** | tidak |
| Jotchua-SOL | +4.1 | −1.0 | **−21.2** | tidak |

### TAPI — apakah SL −10 motong mereka di realita? **TIDAK.** (jawaban verdict)
Cross-check dua-axis, ambang SL −10, n=116:

| Axis | trig | **WINNER-CUT** | loss-cap |
|---|---|---|---|
| `trough_pnl_pct` (FAITHFUL — yg ditindak SL) | 2 | **0** | 2 |
| `price_trough_pct` (HARGA — axis SALAH) | 50 | **41** | 9 |

- Dari **41** winner yg "di-flag" axis-harga, yg benar-benar memicu **SL faithful = 0**.
- **Winner dgn lantai-PnL terdalam = MMG-SOL −7.0%** (lalu poke −6.7%, TURTLE −4.8%). SEMUA di atas −10
  (buffer ≈3pp). → SL −10 tak nyentuh winner mana pun.
- **Cuma 2 record** ber-`trough_pnl ≤ −10`: **1B-SOL** (rug, realisasi −45%, LOSER) & **ANSEM-SOL** (rug,
  realisasi −21.6%, LOSER). SL −10 nyala **HANYA di 2 rug** ini, 0 winner.

### Re-run backtest-exits.js (axis faithful `trough_pnl_pct`, opsional yg diminta)
`node scripts/backtest-exits.js <racikan>` (model: trigger ⇔ `trough_pnl_pct ≤ L`, optimistik di L):

- **mainzen_v2 (n=93):** L=−10 → trig 2, **win-cut 0**, net +$3.07 (vs −12 baseline +$2.06). L=−6 → **win-cut 2**
  (MMG −7.0, poke −6.7), net turun +$1.46. → motong winner baru mulai di **−6**, bukan −10.
- **mainzen_v2_1 (n=23):** semua L (−6..−15) → trig 0, win-cut 0 (tak ada trade v2_1 ber-trough ≤ −6).
- ⚠️ Baris SANITY "✗" saat backtest mainzen_v2 = artefak: `getModePerformance()` baca racikan AKTIF
  (mainzen_v2_1, n=23) sedang script load mainzen_v2 (n=93) → mismatch wajar, BUKAN bug model. Saat racikan
  yg di-backtest = aktif, match.

**Catatan kenapa axis-harga menyesatkan kalau dipakai:** `price_trough` = excursion harga token (volatilitas /
drift OOR), bukan PnL. Buat LP single-side-SOL-below, harga jeblok dalam → drawdown PnL mark-to-market jauh
lebih dangkal (SOL nyicil kebeli token saat turun + recovery + fee → 41 winner ini justru pulih & tutup +).
Konversi `price_trough`→"PnL" lalu backtest SL di atasnya = motong 41 winner palsu. Itu sebabnya
`backtest-exits.js` **benar** pakai `trough_pnl_pct`.

---

## ⭐ VERDICT FASE 1

1. **YA**, banyak winner (41/76) keliatan dip-dangkal di `trough_pnl` padahal harga jeblok dalam — jadi
   kekhawatiran task itu *teramati*.
2. **TAPI verdict SL −10 TIDAK perlu direvisi.** Karena (a) SL bertindak atas mark-to-market PnL, bukan
   excursion harga; (b) SL & trough_pnl berbagi gate `!pnl_pct_suspicious` yang sama, jadi trough_pnl
   adalah batas jujur dari apa yg bisa ditindak SL; (c) lantai-PnL winner terdalam = −7.0%, di atas −10;
   (d) cuma 2 rug (loser) yg pernah ≤ −10. **Trough-beku kena rug/loser, BUKAN winner.** Verdict lama
   ([[project-v2.1-exit-backtest]]: −10/−12 ok, −6 motong winner) **bertahan**.
3. **Sisi gelap freeze (terkonfirmasi dari sudut lain, bukan isu ambang SL):** karena SL juga dibekukan
   `!pnl_pct_suspicious`, saat **rug cepat** (tick suspicious) SL **mati sementara** → posisi turun tanpa
   distop sampai tick bersih / close lain. Inilah mekanik gap −45/−21 [[gap-recon]] (eksekusi/latency),
   yg obatnya = **Lever A/B/C** (close LLM-free, matiin relay, nol cooldown), **bukan** ngutak-atik
   ambang SL. UNKNOWN: nilai PnL "benar" selama tick suspicious (tak terekam) — tapi tak relevan ke
   verdict karena SL tak bisa nindak tick itu juga.

**Apply = keputusan terpisah. Nol perubahan kode/config dibuat.**
