# render-consistency-progress — BOT UTAMA (/home/ubuntu/meridianzen)

**Tujuan:** rapiin output report/Telegram + recording biar konsisten + akurat.
Sumber: `meridianzen2/notes/v3-report-audit.md` kategori **KODE-SHARED**.
**Branch:** `experimental`. Per-fase, commit, revertible. Mostly DISPLAY (aman), satu RECORDING (hati-hati).
**JANGAN** ubah logika recordPerformance/exit/screening/sizing — cuma additive/label/display.
Bukti = `file:line`. Ragu = UNKNOWN. Butuh restart `pm2 meridian id0 --update-env`.

⚠️ BOT UTAMA, bukan v3. v2.1 LIVE — biarin jalan.

Legend: ⬜ belum · 🟦 in-progress · ✅ selesai

---

## FASE 0 — RECON (read-only) ✅

**Pertanyaan: MAIN juga kena F5 (silent-drop trade) kayak v3?**

**JAWAB: TIDAK.** lessons.json main = **116 record live**, semua ter-tag, semua hyphen:
- `active_setup`: **93 mainzen_v2** (Σ −$11.20) + **23 mainzen_v2_1** (Σ +$1.51). **0 record null.**
- Nama pool: **116 hyphen, 0 slash.**
- Note "Backfilled from on-chain": **0 record.**
- paper: 0 · suspect_pnl: 0.

→ Bot MAIN **tidak** diam-diam ngedrop trade karena tag-loss (beda dari v3 yg punya 14 null `TOKEN/SOL`).
  Datanya bersih. Mekanisme `ensureDeployedAt` yg bikin orphan **masih ada di kode** (belum pernah kepicu di
  main) → tetap layak di-stamp defensif (FASE 5).

**Konsekuensi penting buat eval v2.1 jujur:**
- `config.activeSetup = mainzen_v2_1`, `config.profile/preset = custom`. solMode = **undefined (USD mode)**.
- `/report` default = racikan-scoped (`getModePerformance`, lessons.js:957-966 → `keepActiveRacikan` :887-888).
- Jadi `/report` SEKARANG nampilin **cuma mainzen_v2_1 (n=23, +$1.51)** dan **diam-diam buang 93 trade
  mainzen_v2 (−$11.20)**. Ini by-design (isolasi per-racikan) TAPI tanpa disclosure → FASE 2 wajib biar jujur.

---

## FASE 1 — F3 LABEL "Net" → "PnL" (DISPLAY) ✅

Vocab final: **"PnL"** = realized dagang (after fee/IL, before opex) · **"Net"** = after opex (gas+LLM).
"net" pnl-tracker (pnl-tracker.js:9,63,85) sudah BENAR (after opex) — **JANGAN sentuh.**

Target rename (semua tempat label `net_pnl_usd` / trading-PnL-24h sbg "Net" → "PnL"):
- reports.js:275 `💰 Net:` → `💰 PnL:` (headline formatStatsBlock; dipakai /report + briefing)
- reports.js:413 trend `  Net:` → `  PnL:`
- reports.js:448/558/560/562/564 prose verdict/rec "net $X" → "PnL $X" (konsistensi penuh)
- briefing.js:340 `💰 Net PnL:` → `💰 PnL:` (24h trading PnL; di atas pnl-tracker yg pakai "PnL")
- briefing.js:200/470 baris "Net − semua/biaya": label hasil = Net (after opex, BENAR); prefix angka
  awal jadi "PnL <x> − biaya <y> = <net>" biar eksplisit.
- index.js:3574 sudah "All-time PnL" (OK, no change). telegram.js notif label ditangani FASE 3-scope (value).

**DONE:** reports.js 275/413/448/558/560/562/564 → "PnL"; briefing.js 340 → "💰 PnL:"; briefing.js 200/470
baris after-opex sekarang eksplisit `PnL <x> − biaya <y> = <net>`. Sisa "Net" = after-opex (BENAR) +
telegram.js:611 notif (self-contained, di luar scope FASE 1). node --check OK. Commit: FASE 1.

## FASE 2 — F5a DISCLOSE trade ke-drop (DISPLAY, jujur) ✅

**DONE:** `getExcludedRacikanStats()` (lessons.js, setelah getSuspectCount) + formatter
`racikanScopeDisclosure()` (index.js) → wired /report default, /wallet+/status TG (3583), CLI /status (4040).
Live now: `⚠️ 93 trade live di luar racikan ini dikecualikan (PnL -$11.20) — /report all buat semua`
(racikan aktif v2.1 n=23 +$1.51 vs 93 v2 −$11.20 yg tadinya diam-diam ke-buang). Nol ubah scoping/data. node --check OK.


- Helper baru `getExcludedRacikanStats()` (lessons.js): live (non-paper,non-suspect) yg `!keepActiveRacikan`
  → {count, net_usd}. Paper mode → {0,0}.
- Baris disclosure plain-text (aman HTML+plain): `⚠️ N trade live di luar racikan ini dikecualikan
  (PnL ±$X) — /report all buat semua`.
- Pasang di: /report default tier (index.js ~333), /wallet+/status TG (index.js ~3583), CLI /status (~4040).
- Nol ubah scoping/data.

## FASE 3 — F9-light: notif close == report (DISPLAY) ✅

**DONE:** field additive `recorded_pnl_usd/pct = (final+fees)−initial` (= persis yg recordPerformance simpan)
di DUA jalur close (dlmm.js relay + local return). solMode → null (fallback ke pnl_usd SOL). notif pakai
`recorded_pnl_usd ?? pnl_usd` di TIGA call: executor.js:799 (LLM/`/close`), index.js:1238 (Lever A emergency).
Canonical pnl_usd & recordPerformance NOL diubah. node --check OK.


- notif (telegram.js:611 via executor.js:799 → result.pnl_usd) pakai Meteora authoritative `pnlUsd`;
  record (lessons.js:173) = recompute `(final+fees)−initial`. → popup ≠ report.
- FIX additive: di DUA jalur close (dlmm.js relay ~2309-2326 & local ~2604-2619) tambah field
  `recorded_pnl_usd`/`recorded_pnl_pct` = recompute (USD mode; solMode→null fallback). executor.js:799
  notif pakai `result.recorded_pnl_usd ?? result.pnl_usd`. **JANGAN ubah canonical pnl_usd / recordPerformance.**

## FASE 4 — F6/F7 kosmetik separator (DISPLAY) ✅

**DONE:** slash→hyphen di SEMUA jalur: dlmm.js:1741 (backfill), dlmm.js:1782 (pair fallback),
dlmm.js:791 (paper notify displayName), pnl.js:216 (pair fallback + F6 `?/SOL`→`?-SOL`). Canonical
dlmm.js:618 sudah hyphen. node --check OK.


- F7: slash→hyphen di backfill/fallback: dlmm.js:1741, dlmm.js:1782, pnl.js:216.
- F6: fallback `?/SOL` → `?-SOL` (ikut hyphen). Kosmetik, cuma posisi unresolved.

## FASE 5 — F5b STAMP backfill (RECORDING — hati-hati) ✅

**DONE:** ensureDeployedAt (state.js) sekarang stamp `active_setup: config.activeSetup`,
`profile: config.profile` ke record backfill (config in-scope :14). Note "Backfilled from on-chain"
DIPERTAHANKAN (jujur: atribusi = ASUMSI racikan-saat-ini, queryable nanti). Komentar trackPosition
yg usang ("backfills stay null") dibetulin. Additive ke record backfill DOANG — trackPosition normal /
recordPerformance / filter learning NOL disentuh. node --check OK.
**Catatan masa depan:** kalau purity Darwin/evolve mau dijaga, record backfilled bisa di-exclude via
note "Backfilled from on-chain" (BUKAN sekarang).


- ensureDeployedAt (state.js:183-188): tambah `active_setup: config.activeSetup`, `profile: config.profile`.
- PERTAHANKAN note "Backfilled from on-chain" (jujur: atribusi = ASUMSI racikan-saat-ini).
- config in-scope (state.js:14 import). Additive ke record backfill DOANG.

## FASE 6 — VERIFIKASI ✅

- **node --check** semua 8 file changed: OK.
- **diff --stat** (vs 9facff5): briefing 6, index 28, lessons 17, reports 14, state 12, dlmm 24, executor 5, pnl 2
  = 88+/20−. Cuma DISPLAY + state.js backfill (FASE 5).
- **recordPerformance/exit/screening/sizing NOL diubah** — diff lessons.js cuma helper baru; diff dlmm.js cuma
  3 separator + 2 blok return additive (recordPerformance inputs / shouldRejectClosedPnl / exit-rule TAK ada di diff).
- **Render smoke test** (data nyata, racikan aktif mainzen_v2_1):
  - headline `💰 PnL: +$1.51` (dulu "Net"), trend `PnL: +$0.21 → +$0.92`, pnl-tracker `net (PnL +$X − biaya $Y)`
    → "PnL" = dagang, "net" = after-opex, **KONSISTEN**.
  - disclosure: `⚠️ 93 trade live di luar racikan ini dikecualikan (PnL -$11.20) — /report all buat semua`.
  - tail line: `tanpa itu PnL +$1.91` (follow-up F3).
- **branch** = experimental ✓. **pm2 id 0** = `meridian`, cwd `/home/ubuntu/meridianzen` (bot UTAMA) ✓;
  id 1 = `meridian-v3` (TAK disentuh).
- **⚠️ RESTART PENDING (owner):** `pm2 restart 0 --update-env` (atau `pm2 restart meridian --update-env`).
  Kode baru belum ke-load — bot masih jalan kode lama. (Aku tak auto-restart bot LIVE; itu keputusan owner.)
- **TES manual setelah restart:** `/report` (cek label PnL + baris disclosure), `/wallet`/`/status` (disclosure),
  dan deploy/close berikut → cek popup notif == angka di /report.

---

## DEFERRED
- **F9-besar** (canonical PnL = Meteora-authoritative di RECORD) = keputusan terpisah (dampak learning/stats). Tahan.
