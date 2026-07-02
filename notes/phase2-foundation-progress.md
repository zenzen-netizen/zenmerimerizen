# PHASE 2 FONDASI + PILOT — PROGRESS

Bot: MAIN (pm2 id 0 = meridian, /home/ubuntu/meridianzen, branch experimental, LOCAL = sumber kebenaran)
Workstream: 🅴 Telegram/CLI redesign + layer presentasi modular

- [x] 0  Verify env + progress file
- [x] 1  Indeks LENGKAP semua pesan Telegram (read-only) → telegram-message-index.md
- [x] 2  Scaffold views/format.js + views/render.js (additive, node --check)
- [x] 3  PILOT redesign /positions via views/ (nol detail hilang, diff minimal)

## Verifikasi FASE 3 (PILOT /positions)
- views/positions.js: buildView(positions,cfg,rentMap)→view-model netral + telegram(vm)→tree HTML. Didaftarkan RENDERERS.positions (render.js).
- Wire index.js: 2 baris import (render, * as positionsView) + handler /positions (≈3624) ganti blok render inline → buildView+render+sendHTML. getMyPositions/early-return("No open positions.")/rentMap TAK diubah (cuma render).
- CROSS-CHECK NOL detail hilang (vs inline lama index.js:3624-3663) — SEMUA field kebawa:
  header(count) · per-pos: pair · state(IN/OOR+menit) · PnL(%+delta uang) · value · fees(unclaimed,?fallback) ·
  age(fmtAge mirror fmtAgeMin byte-identik) · bins(?fallback) · 💧 fee-density · 🔒 held(+est) ·
  footer total-held(+sebagian est, "refund saat close") · hint /close·/pool·/set. Ikon disegarkan (📊→💼,✅→🟢,⚠️→🔴,+⚡), NOL info hilang.
- Unit: fmtMoney pakai *_usd mode-correct (◎ saat solMode on, $ saat off); rent/held SELALU ◎ (SOL intrinsik) — sama dgn lama (`.toFixed(3)◎`).
- Smoke-test render (solMode on/off + plain REPL): output match mockup; fallback ?/(est) jalan; plain decode `<n>`. node --check index.js+views/* LULUS.
- git diff --stat FASE 3: index.js (−30/+8 = import+blok render saja), views/format.js (fmtSol toFixed padded), views/render.js (stripHtml decode entity), views/positions.js (baru). notes/logging-build-progress.md = M pra-sesi, BUKAN bagian FASE 3 (tak di-stage).
- ⚠️ Restart owner-only: tampilan /positions berubah → owner restart pm2 id0 (meridian) utk tes di Telegram. Claude Code TIDAK restart.

## Verifikasi FASE 2
- views/format.js: primitif round/curSym/fmtCur(sol,usd,solMode brief-locked)/fmtMoney/fmtMoneySigned/fmtSol/fmtPct/fmtAge(mirror fmtAgeMin)/SEP/ICON/numEmoji/header/tree/disclosure/esc.
- views/render.js: dispatcher render(view,target) → telegram(HTML) / plain(stripHtml); import positions.js (diisi FASE 3).
- node --check views/format.js views/render.js → LULUS. Belum di-wire ke index.js (tak ada yang manggil) → tanpa restart.

## Verifikasi FASE 1
- 35 pesan terindeks di notes/telegram-message-index.md (kat ①–⑬) + TABEL SCOPE checklist migrasi.
- Titik kirim dijaring: grep `sendMessage|sendHTML|sendMessageWithButtons|editMessage*|createLiveMessage|sendAndPin|answerCallbackQuery|notify*` di index.js(117)+telegram.js(27)+executor.js+dlmm.js+lessons.js.
- Temuan kunci: `*_usd` field = SOL saat solMode on (dlmm.js:2009-2035,1336) → swap simbol /positions sudah benar. notifyClose HARD-$ (telegram.js:605) = hotspot unit campur antar-pesan.

## Verifikasi FASE 0
- pwd = /home/ubuntu/meridianzen ✅
- git branch --show-current = experimental ✅
- pm2 id 0 = meridian, exec cwd = /home/ubuntu/meridianzen ✅ (id 1 = meridian-v3, bukan target)

Catatan/limit-recovery: <isi kalau perlu>
