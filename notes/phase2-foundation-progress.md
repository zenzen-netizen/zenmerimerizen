# PHASE 2 FONDASI + PILOT — PROGRESS

Bot: MAIN (pm2 id 0 = meridian, /home/ubuntu/meridianzen, branch experimental, LOCAL = sumber kebenaran)
Workstream: 🅴 Telegram/CLI redesign + layer presentasi modular

- [x] 0  Verify env + progress file
- [x] 1  Indeks LENGKAP semua pesan Telegram (read-only) → telegram-message-index.md
- [ ] 2  Scaffold views/format.js + views/render.js (additive, node --check)
- [ ] 3  PILOT redesign /positions via views/ (nol detail hilang, diff minimal)

## Verifikasi FASE 1
- 35 pesan terindeks di notes/telegram-message-index.md (kat ①–⑬) + TABEL SCOPE checklist migrasi.
- Titik kirim dijaring: grep `sendMessage|sendHTML|sendMessageWithButtons|editMessage*|createLiveMessage|sendAndPin|answerCallbackQuery|notify*` di index.js(117)+telegram.js(27)+executor.js+dlmm.js+lessons.js.
- Temuan kunci: `*_usd` field = SOL saat solMode on (dlmm.js:2009-2035,1336) → swap simbol /positions sudah benar. notifyClose HARD-$ (telegram.js:605) = hotspot unit campur antar-pesan.

## Verifikasi FASE 0
- pwd = /home/ubuntu/meridianzen ✅
- git branch --show-current = experimental ✅
- pm2 id 0 = meridian, exec cwd = /home/ubuntu/meridianzen ✅ (id 1 = meridian-v3, bukan target)

Catatan/limit-recovery: <isi kalau perlu>
