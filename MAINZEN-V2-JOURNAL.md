# MAINZEN_V2 — Journal & Review

> Jurnal hidup khusus preset **mainzen_v2** (scalp bid_ask, main bot LIVE). Tujuan: tiap recall "mainzen v2", langsung punya konteks + angka ter-window yang bener. Update tiap review berkala.
> Saudara doc: `MAINZEN-V3-WORKFLOW.md` (trend-rider, fork dry-run terpisah).

---

## 0. TL;DR (recall hook)

mainzen_v2 = **scalp bid_ask terkunci** + entry gate `supertrend_break` (5m+15m, requireAll) + stop ketat −12 + trailing 1.5/1. Filosofi: **menang solid, kalah receh** (lawan era spot yang "menang sering, kalah gede"). Per 2026-06-10, **43 trade post-lock, PF 5.08, net +$4.61, payoff 2.82** — sehat & konsisten. Live config ≈ identik preset (`presets/mainzen_v2.json`), tapi field `preset` ke-flag **"custom"** karena ada edit manual di atasnya.

---

## 1. Kapan v2 EFEKTIF mulai (PENTING untuk windowing)

**Start efektif = `2026-06-08T02:35:00Z` (09:35 WIB)** — saat `strategy` di-LOCK `spot → bid_ask` (keputusan inti v2: "lock bid_ask"). Sumber: jejak `[CONFIG] update_config` di `logs/agent-2026-06-08.log`.

**Validasi boundary (super bersih):**
- PRE-lock (< 06-08 02:35Z): 16 spot + 4 bid_ask (config goyang, flip-flop spot/bid_ask)
- POST-lock (≥ 06-08 02:35Z): **0 spot + 43 bid_ask** → 100% bid_ask murni

⚠️ **Cara pakai data:** hanya hitung kinerja v2 dari trade **POST-lock**. Trade PRE-lock boleh dipakai sebagai **pembanding**, tapi WAJIB ditandai terpisah (era spot/flux, bukan v2).

⚠️ **Caveat kejujuran:** v2 bukan config beku — masih ada tweak DI DALAM era-nya (06-09: multi-category merge `commit 5107beb`, mcap 250k→150k, organic 75→70; upstream merge `fdc0c45`). Jadi "v2-era" = era ber-evolusi, bukan satu snapshot. Perubahan besar berikutnya → tambahkan sub-window di sini.

---

## 2. Definisi kanonik (presets/mainzen_v2.json)

| Setting | Nilai | | Setting | Nilai |
|---|---|---|---|---|
| strategy | `bid_ask` | | stopLossPct | `-12` |
| takeProfitPct | `4` | | trailingTriggerPct / DropPct | `1.5` / `1` |
| minFeePerTvl24h | `6` | | minBinsBelow / max | `35` / `69` |
| minMcap / max | `150k` / `10M` | | minOrganic | `70` |
| screeningCategories | `trending+top+new` | | | |
| chartIndicators | `entryPreset=supertrend_break`, `intervals=[5m,15m]`, `requireAllIntervals=true`, `rejectAlreadyAtBottom=true`, `exitEnabled=false` (exit `rsi_reversal` inert) | | | |

Live config (`user-config.json`) ≈ identik. Field `preset="custom"` (bukan "mainzen_v2") karena edit manual — lihat §5.

---

## 3. Kinerja v2-ERA vs PRE-v2 (per 2026-06-10, n=63 total)

| Metrik | **V2-ERA** (post-lock, bid_ask) | PRE-v2 (flux, spot-heavy) |
|---|---|---|
| n | **43** | 20 |
| net | **+$4.61** | +$0.61 |
| ROI | +0.67% | +0.27% |
| Win rate | 63% (27W/15L) | **80%** (16W/4L) |
| **Profit Factor** | **5.08** | 1.44 |
| **payoff ratio** | **2.82** | 0.36 |
| expectancy/trade | +$0.110 | +$0.030 |
| avg win | $0.21 (+1.29%) | $0.13 (+1.06%) |
| avg loss | **−$0.08 (−0.46%)** | −$0.35 (−3.20%) |
| biggest loss | **−$0.47** | −$1.04 |
| maxDD | **$0.52** | $1.04 |
| avg hold | 59 min | 83 min |
| range-eff | 74% | 92% |

**Insight inti — v2 nuker profil risiko, bukan win-rate:**
PRE-v2 menang lebih sering (80%) tapi **payoff cuma 0.36** → menang receh, kalah gede (avg loss −3.2%, ekor −$1.04). Net nyaris nol. V2 win-rate turun (63%) TAPI **payoff 2.82 & PF 5.08** → menang 2.8× lebih besar dari kalah, ekor dipangkas (worst −$0.47). Net **7.5× lebih besar**. Inilah desain v2: **bid_ask (konsentrasi) + stop ketat −12 + entry gate supertrend** = "menang solid, kalah receh".

---

## 4. Anatomi v2-ERA (43 trade)

**Sumber exit (apa yang nutup posisi):**
| Jalur | Count | Net | Catatan |
|---|---|---|---|
| Trailing TP | 16 | **+$1.96** | Mesin profit utama — biarin winner lari lalu amanin |
| Rule 3 (pumped far above range) | 15 | +$0.75 | Exit paling sering; token kabur ke atas range (single-side-below) — "Skenario A" |
| Rule 2 (take profit +4%) | 4 | **+$1.80** | Sedikit tapi net gede |
| Rule 5 (low yield) | 7 | −$0.06 | Netral; recycle posisi flat |
| Test close | 1 | +$0.16 | Manual |

→ Profit datang dari **Trailing TP + Rule 2**. Rule 3 sering tapi cuma mildly positive.

**Per hari (WIB):** 06-08 +$0.85 (WR 86%) · 06-09 +$2.66 (WR 50%, PF 6.32) · 06-10 +$1.10 (WR 71%). Semua hari positif.

**Per narasi (siapa yang bawa cuan):**
| Narasi | n | Net | PF |
|---|---|---|---|
| animal | 8 | **+$1.58** | 15.36 |
| tech_utility | 15 | **+$1.61** | 6.19 |
| ai | 3 | +$0.59 | 100%WR |
| culture | 4 | $0.00 | 1.00 |
| **meme** | 6 | **−$0.39** | **0.26** |

→ **animal + tech_utility** = kuda beban. **meme** = satu-satunya yang drag (PF 0.26). Kandidat tuning: hati-hati narasi meme.

---

## 5. Masalah atribusi (kenapa preset="custom")

`/preset use mainzen_v2` swap seluruh file, TAPI begitu ada edit manual (`/setcfg`, `update_config`, menu `/settings`) field `preset` flip ke **"custom"**. Jadi "v2 live" sekarang = custom yang **kebetulan = nilai v2**. Selain itu, **NGGAK ADA** field preset tersimpan di record posisi (`lessons.json`/`state.json`) — atribusi historis cuma bisa lewat **timestamp** (lihat §1). Roadmap: simpan `active_preset` per-deploy + tampilkan di laporan/briefing → atribusi otomatis ke depan (lihat NEXT-SESSION).

---

## 6. Status measurement (window B)

Target: ~15–20 close di config stabil → konfirmasi PF tahan. **Sudah 43 trade post-lock, PF 5.08** (jauh > baseline lama 0.44). Sinyal positif & konsisten lintas window. Caveat: size kecil (avg win $0.21, posisi ~$14), jadi PF tinggi sebagian karena loss receh. **Lanjut amati** ekor (−12 stop) & apakah PF bertahan saat sample nambah.

---

## 7. Changelog jurnal

- **2026-06-10** — jurnal dibuat. Boundary v2 dipin di 06-08 02:35Z (bid_ask lock). Review interim n=43: PF 5.08, net +$4.61, payoff 2.82. Insight payoff-flip vs era spot. meme = narasi drag.
