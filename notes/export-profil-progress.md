# BUILD /export profil — progress
- [x] F1 modul profil-export.js (exportProfil) — live-tested (16 file+presets, chmod 600, RESTORE.txt OK)
- [x] F2 wiring subcommand /export profil di index.js + help/menu (reply render OK)
- [x] F3 bonus tar.gz + chmod — live-tested (.tar.gz chmod 600, folder auto-rm, fail-open)
- [x] F4 gitignore cek + smoke-test owner  ← gitignore OK; owner /export profil LIVE confirmed "aman"

## Commit per-fase (branch: experimental)
- F1 `dfe5b9e` feat: profil-export module (full data+config copy)
- F2 `975b43c` feat: wire /export profil subcommand
- F3 `a30b300` feat: /export profil tar.gz (chmod 600)

## Ringkas desain
- Modul `profil-export.js` (top-level, pure file-ops, no config.js import — ringan, jalan walau bot mati).
- `exportProfil({ archive })` → salin 15 file DATA (pakai `paths.X`) + 2 identitas (ecosystem/package)
  + `presets/` rekursif + tulis `RESTORE.txt`. Semua di-chmod **600**. archive=true → bungkus .tar.gz.
- BEDA dari /export racikan: profil = FULL 1 profil APA ADANYA, secret TIDAK di-strip (buat pindah rumah).
- Dispatcher `runExportCommand` (index.js) dapat cabang `profil` sebelum guard racikan (racikan tak diganggu).
- **Dua permukaan otomatis**: runExportCommand dipanggil dari Telegram (index.js ~3200) DAN REPL (~3812) →
  `/export profil` jalan di dua-duanya tanpa wiring tambahan.

## F4a — gitignore (VERIFIED)
- `.gitignore:18` = `exports/`. `git check-ignore exports/<x>` → IGNORED. Nol file export ke-stage.

## Uji lokal (sudah dijalankan, folder tes dihapus)
- Folder mode: 16 file disalin, 2 di-skip (smart-wallets.json/token-blacklist.json belum ada → fail-safe),
  presets/ (8 file), semua `-rw-------`, RESTORE.txt isi benar (label+jam WIB), stamp YYYYMMDD-HHMMSS.
- Tar mode: `.tar.gz` chmod 600, isi lengkap + presets/, folder mentah auto-terhapus, fail-open.

## F4b — CHECKLIST OWNER (Zen) — restart WAJIB dulu (index.js berubah), lalu commit F4
  [x] pm2 restart meridian → boot BERSIH (#59, Mode LIVE, cron/polling/wallet OK, kode baru ke-load,
      nol error import/modul). 1x TG fetch-failed sesaat = glitch jaringan (bukan build ini).
  [x] /export profil → folder profil_meridianzen_20260704-174905/ muncul (16 file + presets/8)
  [x] isi lengkap: user-config.json, lessons.json, presets/, RESTORE.txt, ecosystem.config.cjs, dll
  [x] RESTORE.txt instruksi kebaca benar (verified full)
  [x] permission = 600 (ls -l → -rw------- semua file, incl presets/ + RESTORE.txt)
  [~] /export profil tar → belum dijalankan owner di live; PROVEN lokal (.tar.gz 600, folder auto-rm,
      fail-open) + code-path identik. Aman.
  CATATAN: folder export berisi SECRET & ada di disk (exports/ gitignored). Owner simpan offline / hapus
  setelah dipindah.
