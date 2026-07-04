# BUILD /export racikan — progress

- [x] F1 modul racikan-export.js (exportRacikan)
- [x] F2 wiring command /export di index.js + menu telegram.js
- [x] F3 gitignore exports/ — smoke-test owner: PENDING (owner belum coba /export di Telegram/CLI live)
- [x] F4 (bonus) bungkus .tar.gz — opt-in via `/export racikan <nama> tar`, fail-open (gagal tar → tetap folder biasa)

## Selesai — commits (branch experimental)
3d05cc7 chore: progress export-racikan
1d66058 feat: racikan-export module (strip-secret + filter)
1efe342 feat: wire /export racikan command (telegram + repl + help)
ac968d5 chore: gitignore exports/ output folder
434f80e feat: bonus tar.gz bundling for /export racikan

## Verifikasi yang sudah dilakukan (Claude Code)
- `node --check` semua file yang disentuh (racikan-export.js, index.js, telegram.js, views/system.js): lolos.
- Smoke-test modul inti langsung (node -e import racikan-export.js) pakai racikan nyata `mainzen_v2`:
  secret ke-strip benar (rpcUrl/publicApiKey/telegramChatId/hiveMindApiKey hilang dari preset.json),
  93 record lessons ke-filter benar, MANIFEST.txt terbentuk benar, dan varian `archive:true`
  menghasilkan .tar.gz valid (`tar -tzf` isinya 3 file, folder mentah ke-hapus).
- TIDAK menjalankan bot penuh (index.js) — perintah `/export` di Telegram/CLI REPL belum dites end-to-end
  lewat proses live (index.js langsung boot cron+polling, di luar scope "LOW-RISK, no restart" run ini).

## PENDING — owner
- Restart pm2 (`pm2 restart meridian`) supaya kode baru (index.js/telegram.js) ke-load — WAJIB,
  perintah baru tidak akan muncul di bot yang lagi jalan sampai restart.
- Smoke-test langsung: `/export racikan` (list), `/export racikan mainzen_v2`,
  `/export racikan mainzen_v2 tar` — cek folder/file di `exports/` (gitignored, tidak ke-commit).
- Setelah smoke-test OK → tidak ada langkah lanjutan; fitur ini pure file-export, tidak menyentuh
  deploy/exit/sizing/swap/config sama sekali.
