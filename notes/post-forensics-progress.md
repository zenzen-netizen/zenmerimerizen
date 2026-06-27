# post-forensics-progress — AKSI gabungan pasca-recon

**Tanggal:** 2026-06-20 · Sumber: `meridianzen2/notes/v3-recon-forensics.md`
**Guard folder (KETAT):** FASE 1 & 3 → tulis HANYA `/home/ubuntu/meridianzen` (MAIN) · FASE 2 → tulis HANYA `/home/ubuntu/meridianzen2` (v3). **2 BOT UANG ASLI.** NOL ubah money-logic. JANGAN restart bot.
**Lokasi output .md:** kedua file (`post-forensics-progress.md` + `clone-hygiene-procedure.md`) di MAIN/notes/ (FASE 1&3 dominan, doc FASE 3 = MAIN). Perubahan SUBSTANTIF FASE 2 (data arsip) HANYA di v3.

Legend: ⬜ belum · 🟦 in-progress · ✅ selesai · ⏭️ skip

---

## FASE 1 — MAIN briefing scope-fix [DISPLAY] ✅
**File:** `/home/ubuntu/meridianzen/briefing.js` (MAIN). Additive display ONLY. **Commit `5a4efb2`.**
Konteks: briefing all-live "All-time" (campur racikan) ≠ `/report` default (racikan-scoped getModePerformance), tanpa disclosure.

- ✅ import `getModePerformance, getExcludedRacikanStats` (briefing.js:4).
- ✅ helper `racikanScopeDisclosure()` (briefing.js, mirror index.js:272-278, pakai `money`).
- ✅ `generateBriefing`: `statsRacikan = computeTradeStats(getModePerformance())` + label `Racikan: ${config.activeSetup}`; blok kedua + disclosure disisipkan setelah blok All-time; label All-time → **"All-time (semua racikan)"**.
- ✅ `generatePeriodicBriefing`: blok racikan-scoped windowed (`getModePerformance().filter(window)`) + disclosure ke `parts`; `statsLabel` → **"Last Nd (semua racikan)"**.
- ✅ Item opsional `/report day|week|month` label scope → **otomatis ke-cover** (routing-nya ke `generatePeriodicBriefing`).
- ✅ `node --check briefing.js` OK. diff = +30/-3, 1 file. Money-logic NOL (getModePerformance cuma DIPANGGIL, bukan diubah; recordPerformance/keepActiveRacikan/exit/screening/sizing TIDAK di diff).
- ⏳ **RESTART MAIN = OWNER** (`pm2 restart meridian --update-env`). Kode baru belum ke-load.

## FASE 2 — v3 reset arsip warisan [DATA] ✅
**File:** `/home/ubuntu/meridianzen2/lessons-archive-pre-mainzen_v2.json` (v3) — ITU SAJA. **Commit `4a297c0` (v3).**
- ✅ Backup: `/home/ubuntu/backups/lessons-archive-pre-mainzen_v2.json.bak.20260620-192049` (146830 B, recoverable).
- ✅ Ringkasan isi (read-only): **84 record**, `2026-06-03 → 2026-06-10`, pnl% −53…+5.5, pools: three/grail/Magpie/Goblin/GACHA/HeavyPulp/SQUIRE/GYM-SOL. **GACHA-SOL −53% ADA** (1 record) = trade warisan yg dirujuk self-tuned-rules main → ini "warisan" yg owner curigai (beda dari GACHA +0.55% di lessons.json v3 yg asli v3).
- ✅ Struktur asli = OBJECT `{archived_at,reason,active_racikan_at_archive,count,performance}` → reset ke shape sama: `performance:[]`, `count:0`, metadata+note dipertahankan. `getArchivedPerformance` (lessons.js:904-913) baca `d.performance||[]` → `[]`, tidak crash.
- ✅ Verify: `/report all` v3 (getLifetimePerformance) sekarang = **69 record** (arsip 0 + live 69) = **v3-only**; GACHA −53% **hilang** dari lifetime. lessons.json/state/presets **NOL** disentuh. No restart (display-only data).

## FASE 3 — MAIN doc higiene-clone [DOC] ✅
**File:** `/home/ubuntu/meridianzen/notes/clone-hygiene-procedure.md` (MAIN).
- ✅ Prosedur step-by-step: aturan emas (`git clone` bukan `cp -r`, clone dari LOCAL main, wallet BARU, pm2 unik) · langkah 0-7 · ⚠️ landmine arsip tracked (langkah 2) · SET-fresh secret/config · RE-STAMP identitas · history-state auto-fresh · checklist verifikasi.

## FASE 4 — VERIFIKASI ✅
- ✅ MAIN `git diff` working-tree bersih pasca-commit; perubahan = `briefing.js` (commit 5a4efb2) + `notes/post-forensics-progress.md` + `notes/clone-hygiene-procedure.md`. **money-logic NOL.**
- ✅ v3 perubahan = `lessons-archive-pre-mainzen_v2.json` (commit 4a297c0) DOANG; `lessons.json`/`state.json`/`presets/` NOL.
- ⏳ RESTART: owner restart MAIN (briefing-fix). v3 tidak perlu restart. **Tidak ada bot di-restart oleh aku.**

## RE-VERIFIKASI sesi 2026-06-21 ✅ (read-only, NOL tulis kode/data, NOL restart)
Sesi baru baca progress → konfirmasi semua fase MASIH utuh di repo (bukan cuma klaim di notes):
- ✅ FASE 1: commit `5a4efb2` ada di `experimental`; `git show --stat` = **briefing.js doang, +30/-3**; grep diff money-logic (recordPerformance/keepActiveRacikan/evolveThresholds/exit/screening/sizing/deploy) = **NIHIL**. Import resolve: `getModePerformance` (lessons.js:957) + `getExcludedRacikanStats` (lessons.js:989) **ada** → restart owner tidak akan crash. `racikanScopeDisclosure` briefing.js mirror index.js:272. `node --check briefing.js` OK.
- ✅ FASE 2: commit `4a297c0` ada di v3 `experimental` (1 file: lessons-archive). Backup penuh **146830 B** masih di `/home/ubuntu/backups/...20260620-192049` (revertible). Arsip live parse → `performance:[] count:0`; `getArchivedPerformance` (lessons.js:904) baca `Array.isArray(d)?d:(d.performance||[])` → `[]` (no crash); `getLifetimePerformance` = arsip[] + live = v3-only.
- ✅ FASE 3: `notes/clone-hygiene-procedure.md` ada & lengkap (aturan emas, langkah 0–7, landmine arsip tracked, set-fresh, re-stamp, checklist).
- ✅ FASE 4 guard: MAIN working-tree = cuma untracked `notes/*.md` (+ NEXT-SESSION/backup.sh untracked, 1 note modified) — NOL kode tracked pending. v3 working-tree = cuma untracked `notes/*.md`; `lessons.json`/`state.json`/`presets/` **NOL**. **Tidak ada bot di-restart.**
