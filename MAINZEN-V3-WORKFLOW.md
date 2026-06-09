# mainzen_v3 — "Trend Rider" (preset alternatif)

> Status: **DRAFT preset dibuat** (`presets/mainzen_v3.json`), belum di-`/preset use`. (2026-06-09)
> **Keputusan: v3 = PRESET MURNI.** Replika pendekatan agent hive-mind `…1d8ac7` lewat
> beda config saja. TIDAK butuh kode baru.
> Beda dari `mainzen_v2` (sudah final, lagi diuji; v2 = LOCK bid_ask + scalp).

---

## 0. Asal-usul (bedah PARQ-SOL + agent `…1d8ac7`)

- `agt_f59a53e38bdce8778b1d8ac7` = **spesialis `spot`**: 6/6 consensus-lesson yg dia ikuti
  bertema `strategy=spot`, in-range eff 87–100%, vol 1.07→12.55, bin_step 80–125.
- Trade acuan: `closed PARQ-SOL +11.06% • trailing 12.56% → 10.22%`.
- Kita di pool PARQ yg sama (2026-06-08): 5× bid_ask single-side-below, hasil kecil (~$1.67),
  tiap pump → OOR atas / trailing 1% motong kepagian.

## 1. KOREKSI ASUMSI — 1d8ac7 JUGA single-side (bukan two-sided)

Dia bot Meridian juga → base code sama → `bins_above=0` hardcoded → **dia single-side SOL juga.**
BUKTI: consensus-lesson spot punya `bin_range={...,"bins_above":0}`. Asumsi two-sided GUGUR.
Edge-nya BUKAN dari geometri dua-sisi. Edge ada di **exit + pilihan strategy + range**.

Mekanisme single-side SOL below bisa hasilkan profit besar: harga **dip masuk range** (SOL beli
token murah) → **pump balik** (token kejual lagi lebih tinggi) → realized buy-low-sell-high
sepanjang range. Persis deploy #3 kita (+3.24% "pumped far above range") — cuma kita di-cap.

## 2. EDGE SEBENARNYA (berbasis data, bukan terkaan)

1. **Exit: jangan cap winner.** Cohort spot hive-mind: SLAB +6.99%, GACHA +4.66%, HUNTER +4.53%
   — semua **lewat +4%** → mereka TIDAK pakai `takeProfitPct=4`. Winner kita (spot & bid_ask)
   semua dipotong kepagian oleh TP4 / trailing 1.0 / OOR.
2. **Spot ternyata VIABLE buat kita (sekarang stopLoss -12).** Riwayat kita (lessons.json):
   - bid_ask: n=32, WR 69%, net **+$3.27**, worst −1.49%
   - spot:    n=27, **WR 74%**, net −$2.70, worst −53%
   Tapi net spot negatif = **1 ekor GACHA** (−53% / −$3.86 / 417m, era stopLoss −50). Bukti:
   - spot **EX-GACHA = +$1.16** (≈ bid_ask)
   - spot **SLOW(>30m) ex-GACHA = +$0.87, WR 74% (14/19), worst −10.53%** (di dalam cap −12!)
   - spot FAST(≤30m) = +$0.29
   → analisa v2 "spot SLOW bleeding −$2.99" itu MURNI 1 ekor GACHA, bukan cacat spot.
3. **Range pas volatility (in-range eff 90–100%).** Range cukup lebar → harga stay → terus narik
   fee + siklus buy-low-sell-high.

**Risiko jujur:** worst spot ex-tail (−10.53) lebih dalam dari bid_ask (−1.5) → spot bakal kena
sesekali −10..−12. Taruhan v3 = WR tinggi (74%) + winner gak di-cap (SLAB +6.99 / PARQ +11)
mengalahkan sesekali −12. HARUS DIUJI, bukan diasumsikan menang.

## 3. Delta config v3 vs v2 (preset murni — di `presets/mainzen_v3.json`)

| key | v2 | v3 | alasan |
|-----|----|----|--------|
| `strategy` | bid_ask | **spot** | tiru 1d8ac7; WR spot kita 74% (aman dgn stopLoss -12) |
| `takeProfitPct` | 4 | **15** | buang ceiling; near-zero cost (cuma 2 trade pernah lewat 4%) |
| `trailingTriggerPct` | 1.5 | **2.5** | arm setelah cluster winner kita (2–3.5%); BUKAN 4 (peak tertinggi sejarah cuma 3.89% → trigger 4 = trailing mati total) |
| `trailingDropPct` | 1.0 | **3.0** | give-back lebar (~tiru 2.34pp 1d8ac7); ini yg ngerjain "biarin lari", bukan trigger |
| `maxBinsBelow` | 69 | **100** | ruang traverse naik sebelum OOR |
| `defaultBinsBelow` | 69 | **90** | "" |
| `stopLossPct` | -12 | -12 | floor risiko (KRUSIAL utk spot — jangan dilonggarkan) |

Sisanya FREEZE dari v2 (perbandingan bersih).

**Quant audit angka §3 (2026-06-09, n=59):**
- Angka spot/bid_ask terverifikasi (bid_ask WR 66% bukan 69%, sisanya persis).
- **Peak PnL tertinggi SEPANJANG 59 trade = +3.89%. Trade peak >4% = 0.** → premis "TP4 cap winner" cuma kena 2 trade. Yg BENER motong: `pumped far above range` = **26 trade (44%!)** avgPnl +0.38% — token pump KELUAR atas range single-side (`max_bin==active_bin`, nol ruang atas).
- → **trigger diturunin 4→2.5** (trigger 4 = trailing gak pernah arm = mati total, winner 2–3.5% gak keproteksi → ngegelundung ke −12). drop=3.0 yg ngerjain "biarin lari".
- **Insight struktural:** range lebar (bins 100) cuma nolong **Skenario B** (dip dulu→recover, kuadrat-capture). 44% leak kita = **Skenario A** (pump LANGSUNG dari deploy) yg range lebar GAK nolong. Fix Skenario A = bins_above>0 (dicoret). → yg nentuin masuk A/B = **TIMING ENTRY** (entry gate supertrend_break + rejectAlreadyAtBottom, udah live). Lever ini > semua delta exit. Pas ngukur: kalau masih banyak Skenario A, masalah di entry timing bukan angka exit.

**Confound yg disadari:** v3 ubah strategy DAN exit sekaligus → kalau menang/kalah, susah tahu
lever mana. Opsi (kalau mau bersih): jalankan juga varian "exit-only" (bid_ask + TP/trailing
longgar) utk isolasi. Diskusikan dulu sebelum eksekusi.

## 4. Track eksperimen kode (OPSIONAL, GRUP 16, default OFF) — tidak diperlukan utk v3

Two-sided/`binsAbove` **DICORET** (edge tak butuh itu). Yang mungkin masih berguna ke depan:
1. **`adaptiveTrailing`** — `trailingDropPct` melebar saat momentum kuat (versi kode dari
   trailing-lebar statis v3). config.js:202 + index.js trailing path + state.js.
2. **`rejectBelowWhilePumping`** — gate ENTRY: skip deploy below saat token jelas pump/sudah jauh
   di atas (kurangi entry yg langsung OOR atas). executor.js confirmIndicatorPreset/runSafetyChecks.

Semua: default OFF, fail-open, full-sync semua permukaan Telegram ([[feedback-full-sync-on-feature-update]]).

## 5. Cara uji (A/B vs v2)

- v2 lagi diuji → JANGAN ganggu. v3 jalan TERPISAH (fork/akun/window beda).
- Kelas pool sama (uptrend ber-pump, vol tinggi): payoff ratio, jumlah `pumped far above range`,
  range-eff, avg PnL winner, max winner tertangkap, frekuensi vs ukuran −12 stopLoss.
- Minimal ~3–7 hari (disiplin [[project-screening-edge-audit]]).

## 6. Next

1. Review angka delta §3 (TP15, trailing 4/3, bins 100/90) — sesuaikan kalau perlu.
2. Putuskan: replika penuh (spot) saja, atau + varian exit-only (bid_ask) utk isolasi confound.
3. Uji terpisah, ukur 3–7 hari vs v2.
