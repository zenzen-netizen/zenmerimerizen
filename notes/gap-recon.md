# GAP-RECON — Mekanik Gap Exit (1B-SOL −45 & ANSEM −21 padahal SL −12)

> RECON BACA-SAJA. Nol edit/restart/commit. Branch `experimental`. Bukti = `file:line`.
> Ragu = UNKNOWN. Tanggal: 2026-06-19.

Pertanyaan inti: trough (titik terendah yg KECATAT) ≈ −12, tapi posisi tutup di
−45 / −21. Kenapa? Dan apakah ini bisa diperbaiki murah?

---

## Data dua trade (dari `lessons.json`)

| | 1B-SOL (`Dpp…K9f1`) | ANSEM (`51bq…RM1o`) |
|---|---|---|
| pnl_pct (realisasi tutup) | **−45.05%** (−$16.14) | **−21.65%** (−$3.21) |
| trough_pnl_pct (PnL terendah tercatat) | −12.16% | −12.67% |
| peak_pnl_pct | +1.05% | +0.6% |
| price_trough_pct (gerak HARGA terendah, basis bin) | *tidak ada* (record lama) | **−49.5%** |
| close_reason | `Stop loss: PnL −12.16% <= −12%` | `Stop loss: PnL −12.67% <= −12%` |
| held | ~23 mnt (08:18→08:42) | ~1j47m (13:51→15:38) |
| setup | mainzen_v2 (SL=−12 saat itu) | mainzen_v2 (SL=−12 saat itu) |

> Catatan: SL sekarang −10 (mainzen_v2_1, `user-config.json`); saat dua trade ini
> berjalan SL = −12 (cocok dgn teks close_reason). 1B record dibuat sebelum tracker
> price-excursion ada → field `price_trough_pct` absen. ANSEM punya → **harga jeblok −49.5%**.

---

## Q1 — MEKANIK POLL / CLOSE ✅

**Dua loop terpisah:**

1. **Cron management** tiap `managementIntervalMin` = **10 menit** (`index.js:1179`).
2. **PnL poller** tiap `pnl.pollIntervalSec` = **3 detik** (default; `index.js:1233`), sumber
   PnL = RPC (`config.js:343`). Loop di `index.js:1235-1286`.

**Cek deterministik (SL/TP/trailing/OOR) = TANPA LLM.** Dihitung di:
- `updatePnlAndCheckExits()` (`state.js:473`) — SL di `state.js:540` (`pnl <= stopLossPct`).
- `getDeterministicCloseRule()` (`index.js:1362`) — SL rule 1 di `index.js:1376`.

**TAPI deteksi ≠ eksekusi.** Poller yg deteksi SL **tidak menutup langsung**. Ia cuma
**memicu `runManagementCycle()`** (`index.js:1263` & `1276`) — dan di dalam management,
penutupan dieksekusi lewat **panggilan LLM** (`agentLoop` MANAGER, `index.js:571-602`;
perintah "CLOSE → call close_position" di `index.js:591-597`).

**Plus ada cooldown.** Poller cuma boleh memicu management kalau
`Date.now() − _pollTriggeredAt >= managementIntervalMin` (`index.js:1258-1260`, `1271-1273`).
Kalau baru saja memicu, ia **menunggu sampai 10 menit** ("cooldown Xs left", `index.js:1265`).

> Awam: alarm kebakaran (poller, 3 detik) sudah pasang & bunyi cepat. Tapi yg matikan api
> bukan alarm — alarm nelepon manajer (LLM), dan kalau manajer baru ditelepon, alarm
> nunggu giliran sampai 10 menit. Apinya keburu membesar.

**Jalur lengkap saat SL nyala:**
poll (≤3s) → `updatePnlAndCheckExits` STOP_LOSS → cek cooldown (0–10 mnt) →
`runManagementCycle` → **LLM round-trip** → `close_position` →
relay (lihat Q3, MATI → timeout) → fallback close (klaim + remove-liq + konfirmasi).

Bukti jalur langsung TANPA LLM **ada & jalan** tapi cuma dipakai manual: `/close <n>` &
`/closeall` memanggil `closePosition()` langsung (`index.js:3589`, `3609`). Jadi infrastruktur
close-deterministik sudah ada — hanya tidak dipakai untuk SL otomatis.

---

## Q2 — DISKREPANSI −12 → −45/−21: TIPE GAP ✅

Kunci pembeda ada di ANSEM. Dua angka ini **direkam oleh poll yang sama** (fungsi yg sama,
`updatePnlAndCheckExits`), tapi beda jauh:

- `price_trough_pct` = **−49.5%** → **TIDAK** dijaga flag suspicious (`state.js:505-517`),
  jadi terus update mengikuti harga jeblok.
- `trough_pnl_pct` = **−12.67%** → **DIJAGA** `!pnl_pct_suspicious` (`state.js:495`), jadi
  bisa **beku** begitu satu tick PnL dianggap "mencurigakan".

`pnl_pct_suspicious` di-set kalau PnL "reported" vs "derived" beda > 5pp (`dlmm.js:1766`,
ambang `pnlSanityMaxDiffPct=5`). Saat crash cepat, tick API gampang divergen → flag nyala.

**Rekonstruksi (paling konsisten dgn data):**
1. Harga turun. Pada tick BERSIH pertama yg tembus −12, SL nyala (nilai itu = −12.67/−12.16,
   makanya **trigger == trough**).
2. Setelah itu harga **lanjut jeblok** (ANSEM: harga ke −49.5%). Tapi `trough_pnl` **berhenti
   merekam** (beku di −12.67) karena tick berikutnya suspicious / posisi sudah masuk antrian tutup.
3. Penutupan **baru kelar belakangan** (deteksi → cooldown → LLM → relay-gagal → fallback → tx).
   Saat eksekusi benar-benar jadi, nilai sudah jauh lebih dalam → realisasi **−21.65 / −45.05**.

**Tipe gap per trade:**

- **ANSEM = gap-EKSEKUSI (latency), BUKAN gap-POLL.** Bukti: poll 3-detik JELAS menangkap
  harga sampai −49.5% (`price_trough_pct`), jadi cadence poll bukan biang. Yg bikin realisasi
  −21.65 vs trigger −12.67 adalah jarak waktu deteksi→eksekusi (harga lanjut turun di situ).
  Besarnya −21.65 **konsisten dgn mekanik LP single-side-below**: SOL kebeli token sepanjang
  range, harga akhir −49.5% → rugi efektif ≈ separuhnya (≈−21%). Jadi ini **devaluasi LP asli
  di harga (yg lebih dalam) saat eksekusi**, **bukan slippage swap**.
- **1B-SOL = gap-EKSEKUSI saat RUG.** Tak ada `price_trough` (record lama) jadi jalur intra-hidup
  tak kelihatan → besar gap-POLL murni **UNKNOWN**. Tapi realisasi −45 dgn trigger −12 cocok dgn
  token kolaps keras selama jendela latency. Sesi 2026-06-11 sudah menyimpulkan trade ini "rug
  saat eksekusi" ([[project-session-2026-06-11]]). → dominan **gap-EKSEKUSI/latency**.

> ⚠️ Temuan penting buat backtest: **`trough_pnl_pct` TIDAK bisa dipercaya sebagai "lantai"**
> drawdown — ia beku saat tick suspicious sementara harga terus turun. Pakai `price_trough_pct`
> (basis bin) sebagai ukuran excursion yg jujur, bukan `trough_pnl_pct`.

> Catatan ukuran: PnL polled = mark-to-market dari API tiap tick (`dlmm.js:1840`,
> `reportedPnlPct`). PnL realisasi tutup = dari **Meteora closed-PnL API** deposit→withdrawal
> (`dlmm.js:2465-2488`). Dua basis beda, dan keduanya beda waktu pengambilan.

---

## Q3 — JALUR EKSEKUSI CLOSE ✅

Saat `close_position` jalan (`dlmm.js:2070`):

1. **Coba relay LPAgent dulu** (`lpAgentRelayEnabled=true`, `dlmm.js:2087`). Order zap-out pakai
   **`slippageBps: 5000` (=50%!)** (`dlmm.js:2111`) + guard `maxSolLoss: 0.05`.
   → Per dossier/memory relay **MATI 114/114** ([[project-onboarding-dossier-2026-06-12]]).
   Tiap close = relay dicoba lalu **gagal**, baru fallback (`dlmm.js:2320-2324`). Ini **nambah
   latency timeout di setiap penutupan**.
2. **Fallback = close lokal** (`dlmm.js:2327-2399`): Step 1 klaim fee (tx terpisah,
   `dlmm.js:2335-2357`) → Step 2 `pool.removeLiquidity({bps:10000, shouldClaimAndClose})`
   (`dlmm.js:2378`) → tunggu 5s + loop verifikasi sampai 4×3s (`dlmm.js:2405-2422`).
3. **Realisasi PnL** diambil dari Meteora closed-PnL API, retry 6× @5s (`dlmm.js:2465-2488`).
4. **Autoswap base→SOL** terjadi SETELAH close, di post-hook executor (`executor.js:805-815`),
   pakai `swapToken` (`wallet.js:233`). Order Jupiter Swap-V2 di sini **tak kirim slippageBps
   eksplisit** (`wallet.js:262-274`) → pakai dynamic-slippage default Jupiter.

**Apakah swap sendiri bisa realisasi −45 karena slippage?** Sebagian besar **TIDAK** untuk angka
ini: −45/−21 sudah dijelaskan oleh devaluasi LP (Meteora closed-PnL = nilai token yg ditarik),
dan autoswap slippage adalah biaya TAMBAHAN di atas itu yg kemungkinan **tidak** masuk angka
Meteora. Apakah slippage swap menambah sedikit lagi di luar −45/−21 = **UNKNOWN** (tak ada log
per-swap). Intinya: biang utama = harga jeblok di jendela latency, **bukan** slippage swap.

**Re-fetch harga sebelum close?** Ya secara implisit — close re-fetch posisi (`getMyPositions
force`) & realisasi diukur post-withdraw dari API. Tidak ada "abort kalau harga sudah jeblok".

---

## Q4 — LEVER PERSEMPIT GAP ✅

| Lever | Sembuhin gap tipe apa | Ongkos | Risiko / catatan |
|---|---|---|---|
| **A. Close deterministik LLM-free di poller** (poller panggil `closePosition()` langsung saat STOP_LOSS, bukan `runManagementCycle`+LLM) | gap-EKSEKUSI/latency | **Murah**, LLM-free, infra sudah ada (`/close` buktinya, `index.js:3589`) | Hilangin LLM round-trip dari jalur SL. Risiko kecil; harus jaga idempotensi (jangan dobel-close) & tetap rekam performance. **Lever paling untung.** |
| **B. Matikan relay mati** (`lpAgentRelayEnabled=false`) | gap-EKSEKUSI/latency | **Murah**, 1 flag config | Relay 114/114 gagal → tiap close buang waktu timeout sebelum fallback. Matikan = langsung fallback. Kandidat di dossier. |
| **C. Buang/perkecil cooldown poller→close** (`index.js:1258-1265`) untuk SL/rug | gap-EKSEKUSI/latency | Murah | Cooldown 10 mnt bisa nunda close SL parah saat crash. Untuk exit darurat cooldown harusnya 0. (Gabung dgn lever A.) |
| **D. Poll lebih rapat saat dekat SL** (cth PnL<−8 → poll <3s) | gap-POLL | Murah-ish, LLM-free | **Manfaat RENDAH** di kasus ini: poll 3s SUDAH nangkap −49.5% (Q2). Bottleneck bukan cadence deteksi. |
| **E. SL lebih dini / exit-buffer** (SL −8) | kurangi MAGNITUDE, bukan mekanik gap | Murah | Sudah dianalisis & **ditolak**: −6 motong winner, SL −12 itu rug-gap lewat ambang ([[project-v2.1-exit-backtest]]). Tidak nutup gap, cuma majuin titik picu. |
| **F. Proteksi slippage / abort-swap** | (klaim) gap-EKSEKUSI-slippage | Murah | **Tidak relevan + bahaya**: rugi −45 ada di LP, bukan di swap; abort swap malah **nyangkut token rug** (lebih buruk). Tidak disarankan. |
| **G. Hindari di HULU**: exit-liquidity gate, hindari pool rug-prone, ceiling size | gap-INHEREN (rug) | Sedang | Untuk rug murni (1B), satu-satunya obat nyata. Sebagian sudah ada (`exitLiquidityCheck`, skip rug ≤−90%). |

---

## ⭐ VERDICT

**Gap ini PRIMER = EKSEKUSI/LATENCY, dan SEBAGIAN BESAR FIXABLE-MURAH — bukan poll-gap.**

- **Bukan poll-gap.** Poll 3 detik sudah menangkap harga jeblok penuh (ANSEM −49.5% terekam).
  Menambah frekuensi poll (lever D) **tidak** akan menolong. Cadence deteksi bukan biang.
- **Biang = jendela deteksi→eksekusi** yang panjang karena tiga hal yang **semuanya bisa
  dipangkas murah**: (1) penutupan SL lewat **LLM round-trip** padahal deteksinya sudah LLM-free;
  (2) **cooldown 10 menit** poller→management; (3) **relay mati** yang tetap dicoba (timeout)
  sebelum fallback. Lever **A + B + C** menyerang ketiganya, semua LLM-free / 1-flag.
- **Sisa yang INHEREN**: untuk rug sejati (1B, −45) yang kolaps puluhan persen dalam hitungan
  detik, gap residu tak bisa dihilangkan total lewat exit — hanya **dihindari di hulu** (lever G:
  exit-liquidity, pool-pick, ceiling size).

**Rekomendasi prioritas (kalau nanti mau dieksekusi — di luar lingkup recon ini):**
1. **A** — close deterministik LLM-free di jalur SL/rug (untung terbesar, infra sudah ada).
2. **B + C** — matikan relay mati + nol-kan cooldown khusus exit darurat (combo murah).
3. **G** — perketat hulu untuk rug yang tak bisa dihindari saat eksekusi.
4. Abaikan **D, E, F** (manfaat rendah / sudah ditolak / berbahaya).

> Catatan data: perbaiki juga `trough_pnl_pct` yang beku saat suspicious (`state.js:495`) bila mau
> pakai trough untuk tuning SL — saat ini ia under-state drawdown; `price_trough_pct` lebih jujur.

---

### Index bukti (file:line)
- Poll 3s & loop: `index.js:1233`, `1235-1286` · cron 10m: `index.js:1179`
- Deteksi SL LLM-free: `state.js:473`, `state.js:540` · `index.js:1362`, `1376`
- Poller MEMICU management (bukan close langsung): `index.js:1263`, `1276` · cooldown `1258-1260`/`1271-1273`
- Close via LLM: `index.js:571-602`, `591-597`
- Manual close langsung (bukti LLM-free feasible): `index.js:3589`, `3609`
- Trough beku saat suspicious: `state.js:495` · price_trough tanpa guard: `state.js:505-517` · suspicious set: `dlmm.js:1766`
- Close exec: relay `dlmm.js:2087`/slippage50% `2111` → fallback `2320-2399` · realisasi PnL `2465-2488`
- Autoswap post-close: `executor.js:805-815` · slippage swap default Jupiter: `wallet.js:262-274`
- Config: SL −10 now (−12 saat trade), mgmt 10m, poll 3s, relay ON (`user-config.json`)
