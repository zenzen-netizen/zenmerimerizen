# addprofil #3B — progress
✅ Fase 0  Persiapan + baseline node --check + match-OLD konfirmasi
✅ Fase 1  paths.js: tambah presetsDir                        [c6f0270]
✅ Fase 2  preset-manager.js: reroute PRESETS_DIR+USER_CONFIG [89e3728]
✅ Fase 3  profil-export.js:29 konsistensi presets            [54e2bba]
✅ CHECKPOINT — owner restart #61 + /preset + /config LOLOS (tanda ✎ ada-edit-manual jalan → diff PRESETS_DIR vs USER_CONFIG lewat reroute OK)
   parity Fase 2: presetsDir & userConfig == lokasi root lama (env kosong) → OK
   listPresets() runtime: _backup,bigcapagresif,mainzen,mainzen_v2,mainzen_v2_1 OK
✅ Fase 4  .gitignore profiles/ + addprofil.js modul baru     [312bae6]
✅ Fase 5  wiring /addprofil di index.js                      [bd2f508]
⬜ Fase 6  smoke-test /addprofil (owner)                      [—]
   local smoke-test scaffoldProfil("_smoketest"): 6 item, dup-guard OK, dryRun=true,
   presets/ kosong, RESTORE.txt lengkap, profiles/ gitignored → PASS (folder dihapus)

## Commits (branch experimental, belum di-push)
c6f0270 paths presetsDir · 89e3728 preset-manager reroute · 54e2bba profil-export
312bae6 addprofil modul+gitignore · bd2f508 wiring index.js
⬜ Fase 4  .gitignore profiles/ + addprofil.js modul baru     [commit]
⬜ Fase 5  wiring /addprofil di index.js                      [commit]
⬜ Fase 6  smoke-test /addprofil (owner)                      [—]

## Catatan match-OLD (Fase 0, konfirmasi)
- branch=experimental ✓
- preset-manager.js:15-17 imports + :19-21 const → cocok persis
- paths.js:12-14 (export const paths = { dataDir, userConfigPath,) → gmgnConfigPath @15
- profil-export.js:29 = const PRESETS_DIR = repoPath("presets"); ✓
  - repoPath MASIH dipakai di :27 (IDENTITY_FILES) → import repoPath JANGAN dihapus
- .gitignore: presets/ @15, exports/ @18; profiles/ belum ada → sisip setelah presets/
- node --check paths/preset-manager/profil-export/index → ALL OK
