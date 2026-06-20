# LEVER-G RECON — Exit-liquidity gate / hindari pool tipis (dead-bleed)

> RECON OFFLINE, READ-ONLY. Nol edit/restart/commit kode/config. Branch `experimental`,
> BOT UTAMA `/home/ubuntu/meridianzen`. Bukti = `file:line`. Ragu = UNKNOWN. Tanggal 2026-06-20.
> Rekomendasi-only. Lanjutan [[gap-recon]] Lever G.

## TL;DR — **DIMINISHING RETURNS** untuk buku ini

Seluruh rugi `mainzen_v2` = **2 rug** (1B −45%, ANSEM −21.6% = −$19.35; net ex-rug = **+$8.15**).
Dua rug itu justru **pool PALING LIKUID & rame** di buku (1B: volume $89.7k = MAX seluruh buku, TVL $67.6k,
organic 80; ANSEM: vol $22k, TVL $33.5k, organic 74) — lolos semua filter dengan longgar. **Gate
exit-liquidity / min-depth / anti-dead-bleed TAK akan menangkapnya** (kebalikan dari tipis). Winner justru
condong **volume LEBIH RENDAH** (med $6.9k) dari loser (med $8.4k) → naikin floor volume/depth **motong
winner**. Lever G salah-sasaran: damage = **rug pool likuid** (masalah EKSEKUSI [[gap-recon]] A/B/C +
deteksi-rug token-level), bukan pool tipis. Gate yg ada punya **niche sempit** (honeypot / sell-tax /
sell-side benar2 tipis yg TVL tak ungkap) tapi bukan obat rugi buku ini.

---

## FASE 2 — RECON Lever G ✅

### (1) Peta `exitLiquidityCheck` yang SUDAH ADA — apa, ambang, di mana
| Aspek | Detail | Bukti |
|---|---|---|
| Status | **OFF** (default false; tak ada key di `user-config.json` flat → factory off) | config.js:398 (`?? false`) |
| Tipe | Eksperimen #3, **gate ENTRY pra-deploy** di `runSafetyChecks` | executor.js:1041-1067 |
| Ambang | `exitLiquidityMaxSlippagePct` (default **10**) — tolak kalau round-trip > limit | executor.js:1051,1058; config.js:399 |
| Mekanik | `quoteSellPriceImpact()`: 2 quote Jupiter (SOL→base, lalu base→SOL pakai base itu) → `roundTripLossPct=(solIn−solOut)/solIn·100`. Tangkap friksi "gampang masuk, susah keluar" + fee/spread dua arah | wallet.js:168-185 |
| Skip | Di-skip saat `DRY_RUN` (executor.js:1049). Fail-open: quote error → izinkan deploy | executor.js:1064-1066 |
| Surface | Full-synced (config-origin, /config GRUP, /settings toggle+input, schema, definitions) | index.js:1945/2148/2709, config-schema.js:205 |

→ Gate ini ukur **kedalaman SWAP** (slippage exit lewat router Jupiter) pada notional = `amountY`. Bukan
ukur volume/aktivitas pool. **Off**, jadi sekarang nol pengaruh.

### (2) "Dead-bleed" (Magpie) — apa, dan apakah sumber damage?
Magpie di buku = **2 winner KECIL** (+$0.15, +$0.02), tutup "Rule 3: pumped far above range" (OOR-pump),
entry_volume $7.1k/$7.5k, TVL $33-37k, fee_tvl **0.57** (jauh DI ATAS floor 0.19, bukan "nyaris floor").
Instance ke-2 volume jatuh $7.5k→$1.3k saat exit (memang melambat).
→ **Dead-bleed = mode PnL ≈ $0** (menang/kalah tipis), **BUKAN** sumber rugi besar. Floor froth
(`minVolume=1000`, `minFeePerTvl24h=6`, `minFeeActiveTvlRatio=0.19`) sudah dilewati Magpie. Per
[[project-screening-edge-audit]] floor froth memang **tumpul** (W≈L) — recon ini mengonfirmasi & memperluas.

### (3) ⭐ Nilai gate: bisa nangkep damage TANPA motong winner? **TIDAK**
Distribusi entry-liquidity winner vs loser vs rug (lessons.json, n=116; field `entry_tvl`/`entry_volume`):

| grup | entry_tvl med | entry_volume med |
|---|---|---|
| WINNERS (n=76) | $45.5k | **$6.9k** |
| LOSERS ≤0 (n=40) | $36.5k | **$8.4k** |
| DEEP LOSERS ≤−2% (n=5) | $27.6k | **$15.8k** |
| **RUGS ≤−10% (n=2)** | $33.5k / **$67.6k** | $22k / **$89.7k** |

- **Rug = pool PALING likuid/rame**, bukan tipis. 1B punya **volume tertinggi se-buku** ($89.7k) + organic 80.
  Gate depth/volume/exit-liquidity mustahil nangkap pola ini.
- **Winner condong volume LEBIH RENDAH** dari loser → naikin floor = buang winner duluan. Trade-off min-volume:

  | floor entry_vol | winner-cut | loser-cut | net trade yg dibuang |
  |---|---|---|---|
  | $5k | 27 | 13 | **+$2.62 (winner net) ke-buang** |
  | $8k | 45 | 18 | +$6.32 ke-buang |
  | $10k | 50 | 21 | +$6.93 ke-buang |
  | $15k | 61 | 28 | +$8.45 ke-buang |

  Tiap floor buang net POSITIF (winner) > loser. **Counterproductive.**
- fee_tvl_ratio: winner med 0.517 vs loser med 0.491 → **W≈L**, bukan diskriminator.

### Apakah gate exit-liquidity (yg ADA) akan nangkep 1B/ANSEM? Hampir pasti TIDAK
Gate ukur round-trip swap cost. 1B ($89.7k vol) & ANSEM ($22k vol) jelas tradeable → round-trip cost
rendah → **lolos** ambang 10%. Plus [[gap-recon]] Q3 sudah simpulkan rugi −45/−21 = **devaluasi LP di harga
lebih dalam saat eksekusi**, BUKAN slippage swap. Jadi gate swap-cost bukan obatnya. **UNKNOWN** (tak bisa
replay offline — butuh quote Jupiter live): nilai roundTripLoss persis 1B/ANSEM saat itu — tapi volume tinggi
bikin "lolos" jadi kesimpulan paling mungkin.

---

## ⭐ VERDICT FASE 2 — Lever G: **diminishing returns; jangan prioritaskan**

1. **Sumber rugi buku ini = 2 rug pool LIKUID** (net ex-rug +$8.15). Lever G (hindari pool tipis/dead-bleed)
   secara struktural **tak bisa** nangkap rug pool likuid.
2. **Gate min-volume/min-depth = counterproductive**: winner condong volume rendah → floor naik buang winner
   net-positif > loser. Sejalan [[project-screening-edge-audit]] (floor froth tumpul).
3. **Gate exit-liquidity yang ADA** (`exitLiquidityCheck`, OFF) punya **niche sempit & valid**: honeypot /
   sell-tax / sell-side benar2 tipis yg TVL/volume tak ungkap (round-trip probe nangkap friksi jual yg
   depth-statis sembunyikan). Tapi **bukan** lever buat damage buku ini, dan +2 quote Jupiter/deploy
   (latensi/API). Kalau dinyalakan: anggap asuransi tail tipis (honeypot), **bukan** perbaikan PnL terukur.
4. **Lever yg RELEVAN buat rug (di luar scope G):**
   - **Eksekusi** [[gap-recon]] A/B/C (close LLM-free, matiin relay mati, nol cooldown darurat) — sudah
     dibangun sebagian ([[project-leverA-recon]], [[project-gap-fix-phase1-relay]]). Ini yg memangkas
     magnitude rug −45/−21.
   - **Deteksi-rug token-level** (top10%/bundler/umur/mint-auth) — datanya sudah di-fetch saat screening
     ([[project-logging-recon]]). Apakah konsentrasi holder akan nangkap 1B/ANSEM = pertanyaan TERPISAH
     (bukan Lever G), layak recon sendiri. Catatan: organic 80/74 tinggi → froth-signal saja tak cukup.

**Rekomendasi:** Lever G **TIDAK worth dibuat/dinyalakan** sebagai perbaikan PnL. Sisakan `exitLiquidityCheck`
tetap OFF (atau ON hanya sebagai asuransi-honeypot sadar-trade-off). Fokus tetap di eksekusi (A/B/C) untuk
magnitude rug, dan recon terpisah untuk deteksi-rug token-level.

**Apply = keputusan terpisah. Nol perubahan kode/config dibuat.**
