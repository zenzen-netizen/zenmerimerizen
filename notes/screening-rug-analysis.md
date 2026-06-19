# ANALISIS SCREENING-RUG — bedah sinyal entry trade katastrofik

**Tanggal:** 2026-06-19 · **Sifat:** ANALISIS read-only, offline, nol LLM, nol sentuh live.
**Status:** ✅ FASE 2 selesai. **BUKAN apply** — rekomendasi pengetatan = keputusan terpisah pasca-analisis.
**Data:** `lessons.json` (99) + `lessons-archive-pre-mainzen_v2.json` (84) = **183 trade**; 121 W / 62 L; net **−$7.93**.

> ⚠️ **CAVEAT WAJIB (dibaca duluan):** sampel rug **kecil (n=4, efektif n=2 di rezim sekarang)**.
> Semua di bawah = **reasoned tightening** (penalaran), **BUKAN vonis statistik**. Satu trade (**1B-SOL −$16.14**)
> mendominasi seluruh kemerahan buku — buang dia, buku **HIJAU**. Jadi tiap "perbaikan net" yg keliatan
> besar sebenarnya = efek **menghapus 1 ekor**, bukan sinyal yg memisahkan rug dari winner.

> **Untuk pemula:** "rug" = harga token ambruk mendadak; LP kita (yg pegang SOL + token) ikut nyangkut di
> token yg jadi tak berharga. "Threshold/floor" = pagar seleksi ("cuma masuk kalau organik ≥70"). Pertanyaan
> di sini: **pagar mana yg bocor** kebobolan rug, dan kalau pagar dirapatin, berapa winner ikut kebuang.

---

## 1. TRADE KATASTROFIK (rug / loss besar)

| Pool | Setup | PnL% | Net$ | trough_pnl | held | Mode kegagalan |
|---|---|---|---|---|---|---|
| **1B-SOL** | mainzen_v2 | **−45.05%** | **−$16.14** | −12.16 | 23m | **GAP** — SL −12 jebol, tutup di −45 |
| **ANSEM-SOL** | mainzen_v2 | −21.65% | −$3.21 | −12.67 | 107m | **GAP** — SL −12 jebol, tutup di −21 |
| **GACHA-SOL** | (arsip, pra-v2) | −53% | −$3.86 | n/a | 417m | SL lama −50 (rezim beda) |
| **Magpie-SOL** | (arsip, pra-v2) | −10.53% | −$1.04 | −12.12 | 67m | Bleed pelan, likuiditas mati |

> **Dua mode kegagalan beda:**
> - **GAP-RUG (1B, ANSEM)** — harga jatuh **lompat** antar-poll. `trough_pnl` tercatat ≈ −12 (SL *harus* kena)
>   tapi tutup di −45/−21 → harga lewat ambang lebih cepat dari poll bisa nutup. Ini **masalah EXIT (gap)**,
>   bukan murni entry. *Entry-side*: keduanya pool **frothy/panas** (lihat §3).
> - **DEAD-BLEED (Magpie)** — volume mati ($6.8k), fee/tvl 0.15 (nyaris floor) → luruh pelan.

---

## 2. SINYAL ENTRY YG DIREKAM PER-TRADE

Ada (✓): `organic_score, entry_holders, entry_mcap, entry_tvl, entry_volume, fee_tvl_ratio, volatility,
bin_step, narrative_quality, smart_wallets_present, shadow_signals.sw.count`.
**TAK ada** (✗ → tak bisa diuji): **bundler%, top10%, botHolders%, umur token**. (lihat backtestability-audit.md §B.)

---

## 3. DI MANA RUG "DUDUK" vs DISTRIBUSI (winner n=123)

Persentil dari WINNERS, lalu posisi tiap rug:

| Sinyal | Winner med | Winner p75 | Winner p90 | Winner max | 1B | ANSEM | GACHA | Magpie |
|---|---|---|---|---|---|---|---|---|
| **volatility** | 3.28 | 4.66 | **7.0** | 11.32 | **7.72** ⬆p90 | 4.89 | 2.94 | 2.15 |
| **fee_tvl_ratio** | 0.45 | 0.75 | **1.33** | 5.50 | **1.86** ⬆p90 | **1.60** ⬆p90 | 0.66 | 0.15 ⬇floor |
| **organic_score** | 80 | 86 | 88 | 92 | 80 | **74** ⬇near-floor(70) | 82 | 81 |
| **entry_volume** | 7233 | 13.2k | **27k** | 178k | **89.7k** ⬆⬆ | 22k | **67k** ⬆ | 6.8k ⬇ |
| **entry_mcap** | 934k | 1.86M | 3.97M | 7.43M | 1.89M | 582k | **4.76M** ⬆ | 1.38M |
| **entry_holders** | 2214 | 4595 | 7711 | 116k | **116k** (max!) | 1296 ⬇ | n/a | n/a |

**Bacaan:**
- **volatility** = sinyal pemisah terkuat utk **gap-rug terbesar**: 1B duduk di **>p90 (7.72)** winner. Tapi
  ANSEM cuma 4.89 (p75-an), GACHA/Magpie rendah → vol **tak** nangkep semua rug.
- **fee_tvl_ratio** = kedua gap-rug (1B 1.86, ANSEM 1.60) duduk **>p90 (>1.33)** → frothy. Magpie malah
  **terendah** (0.15, nyaris floor 0.12) → ujung berlawanan.
- **organic** nyaris tak memisah: rug 74–82, winner med 80. ANSEM (74) satu-satunya near-floor.
- **holders/mcap besar TAK melindungi**: 1B punya **holders terbanyak di seluruh dataset** (116k) & mcap $1.89M,
  tetap −45%. GACHA mcap $4.76M (mendekati maxMcap 10M) tetap −53%. → "token gede = aman" **MITOS** di sini.

---

## 4. APAKAH RUG DI TEPI THRESHOLD? (nyaris ketolak)

| Rug | Sinyal di tepi pagar | Pagar sekarang | Jarak |
|---|---|---|---|
| ANSEM | organic 74 | minOrganic **70** | +4 (tipis) |
| Magpie | fee_tvl 0.15 | minFeeActiveTvlRatio **0.12** | +0.03 (mepet) |
| 1B, ANSEM | volatility 7.72 / fee_tvl 1.86,1.60 | **TAK ADA ceiling** | lolos bebas (tak ada pagar atas) |

> **Temuan struktural:** 1B & ANSEM lolos karena **tak ada pagar ATAS** sama sekali — screening cuma punya
> floor (`minFeeActiveTvlRatio`) + `isUsableVolatility` (finite & >0, `screening.js:86`), **nol ceiling**
> volatility/fee_tvl. Jadi pool "panas" mana pun lolos. (konfirmasi: `screening.js:127-155`, `index.js` hard-guard.)

---

## 5. ⚠️ TES KEJUJURAN — apakah vol/fee_tvl tinggi BENERAN sinyal rug?

**TIDAK bersih.** Daftar pool frothy (fee_tvl >1.5) & high-vol (>6.5) **mayoritas WINNER kecil**:

- **fee_tvl >1.5** (17 trade): 11 W / 6 L. Yg menang: Billy +$0.40, MMG +$0.32, SOCCER +$0.55, PARQ, Pnut, BRIM…
  Rug cuma 1B & ANSEM. → froth ≠ rug; froth = "kebanyakan cuan tipis, sesekali ekor maut".
- **volatility >6.5** (25 trade): mayoritas winner kecil (MMG +0.32 @vol 11.3, Billy +0.40 @9.1, dst). 1B
  satu-satunya bencana.

**Simulasi ceiling (in-sample survival; ⚠️ optimistik, n=1 dominan):**

| Aturan | Trade dibuang (W/L) | Net trade-dibuang | Net buku SISA |
|---|---|---|---|
| **maxVolatility ≤ 7.5** | 9 (6W/3L) | −$14.94 | **+$7.01** (dari −$7.93) |
| maxVolatility ≤ 7.0 | 17 (12W/5L) | −$14.02 | +$6.09 |
| **maxFeeTvl ≤ 1.5** | 17 (11W/6L) | −$17.69 | **+$9.76** |
| maxFeeTvl ≤ 2.0 | 10 (7W/3L) | **+$0.53** ❌ malah buang cuan | — |

> Baca hati-hati: `maxVol ≤ 7.5` buang **9** trade — **6 di antaranya WINNER**. Buku jadi hijau **hampir
> seluruhnya karena 1B (−$16.14) ikut terbuang**, bukan karena 9 trade itu "jelek". `maxFeeTvl ≤ 1.5`
> nangkep KEDUA gap-rug (1B+ANSEM) tapi korban 11 winner. **Ini pagar tumpul** — tukar variansi-ekor
> dengan banyak cuan kecil. Itu keputusan **manajemen-risiko (tekan tail)**, **BUKAN edge**.

---

## 6. REKOMENDASI (reasoned, BUKAN vonis — owner putuskan apply terpisah)

Diurut dari paling defensible:

1. **(EXIT, bukan entry) Tangani GAP — prioritas #1.** Akar 1B & ANSEM = SL −12 **jebol** karena harga
   *gap*. Pengetatan *entry* mana pun tak menyembuhkan ini. Lever sebenarnya: poll lebih rapat saat rugi
   mendekati SL, atau exit-buffer. (Lihat `notes/backtest-results.md` — model SL optimistik; realita gap.)
   → **bukan lingkup screening, tapi ini obat utama buat trade terbesar.**

2. **Pasang `maxVolatility` ceiling ~**`7.5`** (pagar BARU, belum ada).** Penalaran: gap-rug terbesar (1B)
   duduk di vol >p90; menghapusnya >> manfaat. **CAVEAT:** korban ~6 winner; manfaat ≈ 1 ekor (1B).
   Sifatnya **tekan-tail**, bukan naikin win-rate. Jangan set < 7.0 (mulai makan banyak winner produktif).

3. **Pertimbangkan `maxFeeActiveTvlRatio` ceiling ~**`1.6–2.0`** (pagar BARU).** ~1.5 nangkep 1B+ANSEM
   tapi tumpul (11 winner). ~2.0 nangkep cuma yg ekstrem (1B 1.86 lolos? 1.86<2.0 → **tidak** kena) —
   trade-off: 1.6 nangkep keduanya & korban lebih sedikit dari 1.5. **Lemah** (overlap froth-winner besar).

4. **JANGAN naikin `minOrganic` / `minVolume` / `minFeeActiveTvlRatio` floor demi rug ini.** ANSEM (organic 74)
   & Magpie (fee_tvl 0.15) mepet floor, TAPI audit lama (`project-screening-edge-audit`) sudah buktikan
   naikin floor = **theater** (survival-test buang 7W/0L). Magpie −$1.04 tak sepadan ongkosnya.

5. **Logging buat ronde berikut:** stamp **bundler%, top10%, botHolders%, umur-token** ke `signal_snapshot`
   (sekarang ✗ tak direkam) — supaya rug berikutnya bisa dibedah di sinyal-sinyal itu (lihat backtestability §B).

---

## RINGKASAN EKSEKUTIF FASE 2

- Kemerahan buku = **1 trade** (1B-SOL −$16.14). Mode: **gap lewat stopLoss**, bukan seleksi entry gagal.
- Sinyal entry **TIDAK** memisahkan rug dari winner secara bersih — pool frothy/high-vol **mayoritas winner kecil**.
- Pagar yg bocor = **ketiadaan ceiling** (volatility & fee_tvl tak ada batas atas); rug lolos bebas ke atas.
- Pengetatan paling masuk akal: **(a)** obati GAP di sisi EXIT (#1), **(b)** kalau mau tekan-tail di entry,
  `maxVolatility ~7.5` (pagar baru) — sadar penuh korbannya ~6 winner & manfaatnya ≈ menghapus 1 ekor.
- **Hindari** naikin floor (theater, buang winner). **Log dulu** bundler/top10/umur buat bukti rug berikut.
- **n=2 efektif → semua di atas penalaran, bukan statistik. Nol perubahan diterapkan.**
