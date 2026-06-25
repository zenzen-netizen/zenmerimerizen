# /settings 2-MODE — PROGRESS

Brief: Batch D BUILD — Mode Campur (per-fungsi, default) + Mode Pisah (per-asal, ≈ skrg) + toggle + marker, ekstrak keyboard → `views/settings.js`. Display-only; mutasi/`update_config`/`_pendingInput`/clamp NOL ubah. Branch `experimental`.

- [x] 1  EKSTRAK builder keyboard → views/settings.js (Pisah BYTE-IDENTIK) ✅
- [ ] 2  ADD Mode Campur (fn-landing + kontrol + marker + toggle + default=Campur)
- [ ] 3  return-after-edit sadar-mode (MENU_KEY_TO_FNGROUP)
- [ ] 4  (opsional) marker 🟠 money (MONEY_KEYS)

## FASE 1 ✅ (commit berikut)
- `views/settings.js` (baru, 475 baris): 21 builder dipindah verbatim (settingValue, fmtSettingValue, settingButton, toggleButton, categoryButton, stepButtons, inputButton, MENU consts, chunkRows, cycleControl, findSubgroup, editableCountFor, settingsHeaderRows/GroupRows/ControlRows, formatSettingsLandingSummary, renderSettingsMain/Section/Group/Presets/Menu) + `initSettingsViews`.
- `index.js`: hapus 21 def (−472 baris), tambah named-import dari views + panggil `initSettingsViews({MENU_CONTROLS, buildConfigRowMap, renderSubclusterRows, subgroupDesc})` sesudah `returnTokenForKey`. MENU_CONTROLS/nav-maps/handler/state TETAP.
- **Bukti byte-identik:** `diff -B before after` (3 range bak vs body views, dinormalkan balik `export`/`_deps.`/`MENU_CONTROLS()`) = **ZERO non-blank diff**.
- **Smoke runtime:** 8 page Pisah render tanpa throw; `settingValue` baca config live.
- `node --check` index.js + views/settings.js OK. Nol dangling ref.

---

## Arsitektur modul (locked dari recon)
- **views/settings.js** import: `config` (config.js, singleton live), `listPresets`/`getActiveSetupStatus` (preset-manager.js), `ORIGIN_SECTIONS`/`KEY_SUBCLUSTER`/`SUB_CLUSTER_META` (config-origin.js). Inject via `initSettingsViews({MENU_CONTROLS, buildConfigRowMap, renderSubclusterRows, subgroupDesc})`.
- **index.js TETAP:** `MENU_CONTROLS`, `MENU_KEY_TO_PAGE`, `pageForKey`, `returnTokenForKey`, `getConfigValue`, `normalizeMenuValue`, `showSettingsMenu`, `applySettingsMenuCallback`, `_settingsView`, `_pendingInput`. Import dari views: `settingValue`, `settingButton`, `fmtSettingValue`, `categoryButton`, `cycleControl` (untuk bangun MENU_CONTROLS), `renderSettingsMenu`, `initSettingsViews`.
- Bare-name call di index (handler/showSettingsMenu/getConfigValue/MENU_CONTROLS) tetap valid via named-import → nol ubah call-site.
- **Nol circular:** index→views satu arah; MENU_CONTROLS & helper index dialirkan ke views sbg DATA lewat init().
