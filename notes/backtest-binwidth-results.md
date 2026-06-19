# BACKTEST BIN-WIDTH / RANGE COVERAGE — HASIL (mainzen_v2, n=74)

**Tanggal:** 2026-06-16 · **Script:** `scripts/backtest-binwidth.js` (offline, READ-ONLY `lessons.json`).
**Sifat:** SIMULASI coverage — **BUKAN apply ke live**. Acuan: `notes/v2.1-testmethod-recon.md` (baris 91, Q4).
Reproduksi: `node scripts/backtest-binwidth.js`.

## ⚠️ CAVEAT WAJIB — LINGKUP
Backtest ini **HANYA sisi COVERAGE / OOR-risk**. Sisi **FEE** (range lebih sempit = fee per $ lebih
**padat** — yang justru inti racikan bid_ask) **TAK bisa di-replay** dari data ini → seluruh angka di sini
**INFORMASIONAL**. **Keputusan final lebar bin = konfirmasi live/paper**, bukan dari backtest ini.

## Dataset & geometri
Filter `!paper && !suspect_pnl && active_setup="mainzen_v2"` → n=**74** (1 record dibuang: `bin_step` null).
- **`bins_above=0` di 74/74** → racikan = **bid_ask single-side-BAWAH** murni (deposit SOL, beli pas turun).
- Excursion (`price_peak/trough_pct`, bin-quantized di `state.js:505-516`): **56/74** (18 record lama kosong).
- Geometri EKSAK: per gerak `k` bin → `price% = (1+step/1e4)^k − 1`. In-range `Δbin ∈ [−bins_below, +bins_above]`.
  - **OOR-atas** ⇔ peak `Δbin > bins_above` (=0 → naik ≥1 bin langsung keluar). edge_atas ≈ 0% (DI entry).
  - **OOR-bawah** ⇔ trough `Δbin > bins_below`. edge_bawah median ≈ −46% (dalam).

---

## FASE 1 — OOR ARAH + KEDALAMAN

| arah | n-cek | OOR | freq% | depth bins (med/avg) | depth % (med/avg) |
|---|---|---|---|---|---|
| **OOR-ATAS** | 56 | 50 | **89%** | 11 / 10.4 | **+11.6% / +11.4%** |
| **OOR-BAWAH** | 56 | 0 | **0%** | — | — |

**Asimetri ekstrem (inti temuan):**
- Tepi **ATAS ada DI entry** (edge_atas≈0%, krn `bins_above=0`) → harga naik ≥1 bin = langsung OOR-atas →
  **89%** trade tembus atas, median **11 bin / +11.6%** lewat tepi. Terdalam: Merlin-SOL +29.5% (26 bin).
- Tepi **BAWAH sangat dalam** (median edge −46%) → trough **tak pernah** menyentuhnya. Sanity: trade
  terdekat = BRIM-SOL trough −43.29% vs edge −49.7%, **sisa margin 6.4pp** → **0/56 OOR-bawah**.
- Artinya: **bins_below over-provisioned** (coverage-side; downside tak pernah habis), **tepi atas nol headroom**.

---

## FASE 2 — COVERAGE % + ⭐ MISSED-UPSIDE

**Coverage** (n=56 trade dgn peak & trough lengkap):
| kelas | n | % |
|---|---|---|
| DALAM range penuh | 6 | 11% |
| tembus ATAS saja | 50 | **89%** |
| tembus BAWAH saja | 0 | 0% |
| tembus DUA arah | 0 | 0% |

**⭐ MISSED-UPSIDE — "kita ninggalin berapa di meja karena single-side-bawah?"**
Pas pump, SOL kita idle di atas range (deket entry) → up-move TAK ke-capture. `missed% = peak% − edge_atas%` (≈peak penuh).

| himpunan | n | missed% median | avg | max | $ CEILING total | /trade |
|---|---|---|---|---|---|---|
| Exit "pumped far above range" | 32 | **+13.8%** | +14.6% | +29.5% | **~$67.83** | ~$2.02 |
| SEMUA breacher tepi-atas (apapun exit) | 50 | +11.6% | +11.4% | +29.5% | ~$82.54 | ~$1.71 |

**Baca:** net buku 74-trade = **−$8.43**; plafon upside kelewat ~**$68–83** → biaya **STRUKTURAL** single-side-bawah
(forfeit up-move) **jauh lebih besar** dari realisasi PnL. ⚠️ $ = **PLAFON** (butuh HOLD token + kena IL, **TAK
achievable** single-side); meng-capture-nya = **GANTI strategi** (dual-side), profil fee **TAK ter-replay**.

---

## FASE 3 — KANDIDAT LEBAR/BENTUK (coverage-side, arah doang)

⚠️ **FEE TAK TERHITUNG.** Tabel ini cuma trade-off OOR/coverage.

**(A) bins_below {lebih sempit ↔ lebih lebar}** — efek ke OOR-BAWAH (n=56). Tepi bawah = sisi "beli pas turun" (inti racikan).
| skala bb | bb median | OOR-bawah | freq% | depth-past bins (med/avg) |
|---|---|---|---|---|
| ×0.5 | 30 | 9 | **16%** | 4 / 6 |
| ×0.75 | 45 | 1 | 2% | 5 / 5 |
| **×1 (base)** | 60 | 0 | **0%** | — |
| ×1.25 | 75 | 0 | 0% | — |
| ×1.5 | 90 | 0 | 0% | — |

→ Ada **ruang menyempitkan** tepi bawah ke ~×0.75 (≈45 bin) dgn OOR-bawah tetap ~0 (2%); ×0.5 mulai gigit (16%).
**Menyempitkan = fee/$ lebih padat (TAK terhitung, justru lever utama)** — tapi backtest ini tak bisa memutuskannya.

**(B) tepi-ATAS lebih lebar / dual-side (bins_above>0)** — efek ke OOR-ATAS + upside ke-capture (n=56).
| bins_above | edge_atas% | OOR-atas | freq% | captured med% | missed med% |
|---|---|---|---|---|---|
| **0 (base)** | +0.0% | 50 | **89%** | +0.0% | +11.2% |
| 5 | +5.1% | 41 | 73% | +5.1% | +6.5% |
| 10 | +10.5% | 31 | 55% | +10.5% | +1.1% |
| 20 | +22.0% | 1 | 2% | +11.2% | +0.0% |
| 35 | +41.7% | 0 | 0% | +11.2% | +0.0% |

→ Tepi atas ~10–20 bin akan **menutup sebagian besar** pump (median captured naik ke +10.5…+11.2%, missed ~0).
⚠️ **TAPI `bins_above>0` = HOLD base token saat deploy** → BUKAN single-side-SOL lagi (safety check `executor.js`
**melarang** `bins_above>0` di single-side-SOL). Itu **GANTI STRATEGI** (bawa IL + profil fee beda), bukan tuning lebar.

---

## RINGKAS / REKOMENDASI (coverage-side — wajib konfirmasi fee live/paper)

| Temuan | Implikasi | Kepercayaan (coverage) |
|---|---|---|
| OOR-atas 89%, OOR-bawah 0% | Range super-asimetris: bawah over-lebar, atas nol headroom | Tinggi (geometri eksak) |
| Missed-upside median +11–14%/pump | Single-side-bawah **struktural** ninggalin up-move (plafon ~$68–83 vs net −$8.43) | Tinggi (excursion eksak) |
| bins_below bisa ~×0.75 tanpa OOR-bawah | Ruang **densify fee** dgn menyempitkan tepi bawah | **Coverage tinggi, FEE TAK terukur** → uji paper |
| Tepi atas lebar/dual-side menutup pump | Capture upside butuh **ganti ke dual-side** (IL + fee beda) | Coverage tinggi; bukan tuning, tapi keputusan strategi |

**Keputusan v2.1 (yg backtest INI dukung):**
1. **Tepi bawah jelas over-lebar** (0% OOR-bawah, ada margin ke ×0.75). Kandidat: turunkan `minBinsBelow`/`bins_below`
   moderat → fee/$ lebih padat. **TAPI** keuntungan = sisi FEE yg TAK ter-replay → **WAJIB konfirmasi paper/live**.
2. **Missed-upside besar = sifat single-side-bawah**, BUKAN bug lebar. Mau ambil up-move = pindah dual-side
   (keputusan strategi terpisah, bukan v2.1 width-tuning). Selama tetap single-side, terima trade-off ini.
3. **Jangan lebarkan tepi bawah** (×1.25/×1.5 nol manfaat coverage, modal makin encer + fee makin tipis).

**Batas (DI LUAR backtest ini):** efek FEE dari menyempitkan range = **paper/live**. screening-rug = paper.
Backtest ≠ apply live. Tak ada perubahan config/range/data yg dilakukan di sini.
