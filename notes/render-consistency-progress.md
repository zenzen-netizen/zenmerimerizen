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

## FASE 4 — F6/F7 kosmetik separator (DISPLAY) ⬜

- F7: slash→hyphen di backfill/fallback: dlmm.js:1741, dlmm.js:1782, pnl.js:216.
- F6: fallback `?/SOL` → `?-SOL` (ikut hyphen). Kosmetik, cuma posisi unresolved.

## FASE 5 — F5b STAMP backfill (RECORDING — hati-hati) ⬜

- ensureDeployedAt (state.js:183-188): tambah `active_setup: config.activeSetup`, `profile: config.profile`.
- PERTAHANKAN note "Backfilled from on-chain" (jujur: atribusi = ASUMSI racikan-saat-ini).
- config in-scope (state.js:14 import). Additive ke record backfill DOANG.

## FASE 6 — VERIFIKASI ⬜

- node --check semua file. diff --stat. recordPerformance/exit/screening/sizing NOL diubah.
- /report label PnL/Net + disclosure. notif==report. branch=experimental. restart pm2 meridian id0 --update-env.

---

## DEFERRED
- **F9-besar** (canonical PnL = Meteora-authoritative di RECORD) = keputusan terpisah (dampak learning/stats). Tahan.
