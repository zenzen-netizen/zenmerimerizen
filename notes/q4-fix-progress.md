# Q4 DEFENSIVE FIX — silent-drop → RECORD + FLAG + ALERT + karantina

**Branch:** experimental · **Acuan:** notes/paper-recon.md Q4 (`lessons.js:175-184`).
**Sifat:** nyentuh `recordPerformance` BERSAMA (jalur LIVE). Reversible. Butuh restart pm2 utk aktif.

## Tujuan
Rug ≥90% ASLI tak pernah hilang diam-diam (silent-drop) → tetap DIREKAM. Tapi bad-data
artifact (mis. bacaan PnL salah-skala) tetap dikarantina dari auto-learning + stats sampai
operator verifikasi (rug asli vs bad-data).

## Keputusan desain (FASE 0)
Gate `suspiciousAbsurdClosedPnl` (initial≥$20 & pnl_pct≤−90 & reason TANPA "stop loss"):
- DULU: `log("lessons_warn", "Skipped absurd…"); return;` → record DIBUANG total.
- BARU: tandai `entry.suspect_pnl = true` + `entry.suspect_reason`, lalu RECORD seperti biasa.

**Flag `suspect_pnl` diperlakukan paralel dengan `paper`** — "data tak boleh dipercaya utk
keputusan live sampai diverifikasi". "pola sama kayak exclude paper" (kata tugas). Jadi
di-exclude di SEMUA konsumen auto-learning/sharing/stats yang sudah exclude paper:

| # | Lokasi | Aksi | Fase | Status |
|---|--------|------|------|--------|
| Gate | lessons.js:175-184 | `return` → flag + record | 1 | ✅ |
| Alert | lessons.js (di gate) | notif Telegram | 2 | ✅ |
| A | livePerf lessons.js | `&& !p.suspect_pnl` (evolve+Darwin) | 3 | ✅ |
| B | getModePerformance | `&& !p.suspect_pnl` (stats/report/briefing/profil) | 3 | ✅ |
| C | getPerformanceSummary | `&& !p.suspect_pnl` (/status + /evolve headline) | 3 | ✅ |
| D | pushHiveLesson guard | `&& !entry.suspect_pnl` (jangan broadcast bad-data) | 3 | ✅ |
| E | recordPoolDeploy guard | `&& !entry.suspect_pnl` (jangan bias screening live) | 3 | ✅ |
| F | pushHivePerfEvent guard | `&& !entry.suspect_pnl` | 3 | ✅ |
| G | derivLesson tag + getLessonsForPrompt | `lesson.suspect=true` + drop dari prompt | 3 | ✅ |
| H | /report default tier (index.js) | baris "⚠️ Suspect (perlu verifikasi): N" (sembunyi N=0) + helper `getSuspectCount()` | 3 | ✅ |

**Batas (sengaja TIDAK disentuh):** anti-flicker `dlmm.js:2414`, `getDeterministicCloseRule`
`index.js:1346`, perilaku record NON-suspect, eksekusi trade/exit/screening. Semua tambahan
`&& !…suspect_pnl` HANYA mempengaruhi record suspect (record normal byte-identik).

## Konteks runtime (utk smoke test aman)
- activeSetup = `mainzen_v2` → record uji pakai `active_setup:"mainzen_v2"`.
- `learning.evolveEnabled=false` (frozen) → auto-evolve TAK nulis user-config.json.
- `darwin.enabled=true` → recalculateWeights bisa nulis signal-weights.json di kelipatan-5.
- hive url TIDAK diset → push hive no-op.
- lessons.json / pool-memory.json / signal-weights.json / user-config.json = gitignored →
  smoke test WAJIB backup+restore manual keempatnya.

## Progres fase
- ✅ FASE 0 — recon + keputusan
- ✅ FASE 1 — RECORD + FLAG (gate buang→flag `suspect_pnl`; entry simpan flag+reason)
- ✅ FASE 2 — ALERT operator (notif Telegram fire-and-forget + fail-open di blok gate)
- ✅ FASE 3 — KARANTINA (A–H: filter livePerf/stats + guard hive/pool-memory + drop lesson prompt + /report suspect line)
- ✅ VERIFIKASI smoke + npm test

## Verifikasi (2026-06-16)
Smoke test (live mode, backup+restore semua runtime JSON, SHA1 cocok 100% sesudahnya):
- record kena gate (initial=$50, final=$2.5 → −95%, reason "OOR pumped exit"):
  - ✅ DIREKAM (bukan dibuang) + `suspect_pnl:true` + `suspect_reason` + pnl_pct=−95
  - ✅ alert path kepicu (log `[LESSONS_WARN] SUSPECT … recorded (NOT dropped)`)
  - ✅ lesson di-tag `[suspect]` (terlihat di log `New lesson [suspect]`)
  - ✅ DIKECUALIKAN dari `getModePerformance` (stats)
  - ✅ pool-memory HANYA terisi utk record NORMAL (suspect ter-skip — guard E)
  - ✅ `getSuspectCount()` +1
- record NORMAL (+6%): ✅ tak berubah, masuk stats, tanpa flag suspect.
- `npm test` (node --check semua .js): ✅ lulus. `git diff --stat`: index.js+lessons.js+nota.
- File runtime LIVE (lessons/pool-memory/signal-weights/user-config): ✅ utuh (SHA1 identik).

## PENDING (owner)
- ⚠️ **Restart pm2 `meridian` (id 0)** — proses online 4j masih pakai kode LAMA; fix baru aktif
  setelah `pm2 restart meridian --update-env`. (Tak auto-restart: bot trading LIVE.)
- `meridian-v3` (id 1 = meridianzen2, folder terpisah) TAK tersentuh; port terpisah bila diinginkan.
