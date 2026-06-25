# /settings 2-MODE — PROGRESS

Brief: Batch D BUILD — Mode Campur (per-fungsi, default) + Mode Pisah (per-asal, ≈ skrg) + toggle + marker, ekstrak keyboard → `views/settings.js`. Display-only; mutasi/`update_config`/`_pendingInput`/clamp NOL ubah. Branch `experimental`.

- [x] 1  EKSTRAK builder keyboard → views/settings.js (Pisah BYTE-IDENTIK) ✅
- [x] 2  ADD Mode Campur (fn-landing + kontrol + marker + toggle + default=Campur) ✅
- [x] 3  return-after-edit sadar-mode (MENU_KEY_TO_FNGROUP) ✅
- [x] 4  (opsional) marker 🟠 money (MONEY_KEYS) ✅

## FASE 1 ✅ (commit berikut)
- `views/settings.js` (baru, 475 baris): 21 builder dipindah verbatim (settingValue, fmtSettingValue, settingButton, toggleButton, categoryButton, stepButtons, inputButton, MENU consts, chunkRows, cycleControl, findSubgroup, editableCountFor, settingsHeaderRows/GroupRows/ControlRows, formatSettingsLandingSummary, renderSettingsMain/Section/Group/Presets/Menu) + `initSettingsViews`.
- `index.js`: hapus 21 def (−472 baris), tambah named-import dari views + panggil `initSettingsViews({MENU_CONTROLS, buildConfigRowMap, renderSubclusterRows, subgroupDesc})` sesudah `returnTokenForKey`. MENU_CONTROLS/nav-maps/handler/state TETAP.
- **Bukti byte-identik:** `diff -B before after` (3 range bak vs body views, dinormalkan balik `export`/`_deps.`/`MENU_CONTROLS()`) = **ZERO non-blank diff**.
- **Smoke runtime:** 8 page Pisah render tanpa throw; `settingValue` baca config live.
- `node --check` index.js + views/settings.js OK. Nol dangling ref.

## FASE 2 ✅ (commit berikut)
- **config-origin.js:** tambah `id` slug ke 12 entri `FUNCTION_GROUPS` (sizing/screening/gmgn/exit/strategy/indik/jadwal/llm/darwin/reports/exp/infra). Additive, render-only — `views/config.js` cuma baca emoji/title/keys/gmgnDynamic, CORE_GROUPS tak kena (verified `id ∉ CORE_GROUPS`). Union FUNCTION_GROUPS == 166 (parity tetap).
- **views/settings.js:** `ORIGIN_MARK`(⚙️/🧩) + `MENU_FNGROUP_SHORT`(12 label pendek); `settingsControlRows(sg, {withOriginMarker})` (pfx="" → Pisah byte-identik, guard di build/toggle/input); `findFnGroup`/`campurHeaderRows`/`campurGroupRows`/`renderCampurLanding`/`renderCampurGroup` (reuse `settingsControlRows`+`editableCountFor`+`MAX_T3_ROWS`+`chunkRows`+`formatSettingsLandingSummary`+`_deps.renderSubclusterRows`); `settingsHeaderRows` prepend 1 baris toggle `🔀 Mode: Campur`→`cfg:page:fn-landing`; dispatch `renderSettingsMenu`: `fn-landing`→landing, `fn-*`→group (sebelum dev/zen/group).
- **index.js:** `showSettingsMenu` default `page="fn-landing"` → `/settings` mendarat di Campur. Handler/mutasi NOL ubah.
- **Token mode:** Campur = `cfg:page:fn-<id>` / `fn-<id>~hal` (terpanjang `fn-screening-gmgn`? → tidak, id=`gmgn`, jadi `cfg:page:fn-gmgn~6` ≈ 19 byte « 64). Pisah = `dev-*`/`zen-*`/`presets`. Callback EDIT (toggle/step/set/input/cat) TAK bawa mode.
- **Bukti Pisah byte-identik:** harness dump 8 page Pisah (main/dev/zen/dev-screening/dev-management/zen-gmgn/zen-gmgn~2/presets) before-vs-after = diff **PURELY ADDITIVE** (cuma 1 baris `🔀 Mode: Campur` di-prepend per page; nol `<`/`c`). Semua kontrol/callback_data/grup/paginasi identik.
- **Bukti Campur:** fn-landing = 12 tombol grup (✏N counts: Sizing✏12 Screen✏27 GMGN✏37 …) + toggle→Pisah; fn-screening = grup ▸ aktif + kontrol bermarker (🧩 zen); fn-sizing kontrol bermarker ⚙️ (dev); fn-gmgn = hint `⚪ nonaktif (source=meteora)`; fn-gmgn~2 paginasi (Hal 2/6, pager `cfg:page:fn-gmgn~1`/`~3`).
- **Parity key:** FUNCTION_GROUPS union == ORIGIN_SECTIONS union == **166** (set EQUAL, 0 beda); **0** key MENU_CONTROLS (140 entri) hilang dari Campur → semua kontrol editable kebawa di kedua mode.
- ⚠️ **Deviasi terhadap "Pisah byte-identik" FASE 2:** toggle 1 baris DITAMBAH ke `settingsHeaderRows` (semua page Pisah) supaya toggle **dua-arah** (DESAIN: "Mode Pisah … + tombol toggle"). Tanpa ini toggle satu-arah (Campur→Pisah, balik via /settings saja). Semua struktur Pisah lain byte-identik. Bila owner mau Pisah beku-total + toggle satu-arah, pindah toggle ke Campur-only.
- `node --check` config-origin.js + views/settings.js + index.js OK.

## FASE 3 ✅ (commit berikut)
- **index.js:** import `FUNCTION_GROUPS`; `MENU_KEY_TO_FNGROUP` (twin `MENU_KEY_TO_PAGE` — resep IDENTIK: tiap config-origin key → resolve via `MENU_CONTROLS[k].pageKeys/toggle/input` → settingValue key → fnGroup id, jadi beda-namespace dev/zen-vs-settingValue ke-handle sama); `returnTokenForKey` jadi **sadar-mode**: baca mode dari `_settingsView` — kalau `fn-*`/`fn-landing` → balik `fn-<group>` (pertahankan `~hal` bila grup sama), else perilaku Pisah lama. **Handler edit NOL ubah** — toggle/step/set sudah `page=returnTokenForKey(key)`, input pakai `returnTokenForKey(inputKey)` → dua-duanya otomatis sadar-mode.
- **cat handler:** SATU baris navigasi di-mode-kan: re-render `page:"zen-screening"` → `returnTokenForKey("screeningCategories")` (Pisah→`zen-screening` byte-identik krn 2-key tak terpaginasi; Campur→`fn-screening`). `executeTool`/clamp DI ATASnya tak disentuh. Tanpa ini toggle kategori di Campur loncat ke Pisah.
- **Bukti logika** (harness replika builder+returnTokenForKey, mock MENU_CONTROLS sv()-transform meniru gap namespace): domain match (166 key _PAGE ⊆ _FNGROUP); Pisah zen-gmgn→zen-gmgn, dev-management~2→~2; Campur fn-gmgn~2→fn-gmgn~2 (grup sama pertahankan hal), fn-exit edit stopLoss→fn-exit, fn-landing edit gmgn→fn-gmgn (masuk grup), fn-exit edit gmgn→fn-gmgn (lintas-grup drop hal), unknown→fn-sizing (fallback).
- `node --check` index.js OK.

## FASE 4 ✅ (commit berikut)
- **config-origin.js:** `MONEY_KEYS` (export, render-only) = **120 key** yang mengubah PERILAKU dagang (modal/gate/cooldown). Diturunkan per-fungsi: grup dagang penuh (sizing 12, screening 25 [−2 discord inert], gmgn 37, exit 19, strategy 5, indik 14) + subset eksperimen yang gerakkan keputusan (exp 8: exitLiquidity*, marketRegime*, conviction*, idleScreeningCooldown*). NON-money (0): jadwal/llm/darwin/reports/infra. solMode (infra) & discord excluded.
- **views/settings.js:** import `MONEY_KEYS`; di `settingsControlRows`, prefix label = `🟠 ` (money, KEDUA mode) + `⚙️/🧩` (origin, Campur saja). Non-money + Pisah → prefix "" → label byte-identik.
- **Bukti struktur Pisah UTUH:** diff callback_data semua 8 page Pisah (FASE-1 baseline vs sekarang) = **purely additive** — cuma `cfg:page:fn-landing` (toggle) per page; SEMUA callback_data kontrol/nav/pager byte-identik (nol `<`/ubah). 🟠 cuma nambah di TEKS label money key.
- **Bukti 🟠 tepat sasaran:** dev-llm (non-money) = 0 tombol 🟠; dev-management = money keys (maxPositions/maxDeployAmount/positionSizePct/minSolToOpen/…) ber-🟠.
- ⚠️ **Catatan:** 🟠 muncul di label tombol Pisah money key (sesuai FASE 4 "Campur & Pisah") — jadi Pisah byte-identik **struktur** (callback_data/urutan/paginasi) tapi TEKS label money key kini ber-🟠. 120/140 kontrol = money → di grup dagang hampir semua tombol 🟠 (signal level-GRUP: grup dagang all-orange vs jadwal/llm/darwin/reports/infra none). Commit terisolasi → revert 1 commit bila owner mau lebih bersih.
- `node --check` config-origin.js + views/settings.js OK.

---

## Arsitektur modul (locked dari recon)
- **views/settings.js** import: `config` (config.js, singleton live), `listPresets`/`getActiveSetupStatus` (preset-manager.js), `ORIGIN_SECTIONS`/`KEY_SUBCLUSTER`/`SUB_CLUSTER_META` (config-origin.js). Inject via `initSettingsViews({MENU_CONTROLS, buildConfigRowMap, renderSubclusterRows, subgroupDesc})`.
- **index.js TETAP:** `MENU_CONTROLS`, `MENU_KEY_TO_PAGE`, `pageForKey`, `returnTokenForKey`, `getConfigValue`, `normalizeMenuValue`, `showSettingsMenu`, `applySettingsMenuCallback`, `_settingsView`, `_pendingInput`. Import dari views: `settingValue`, `settingButton`, `fmtSettingValue`, `categoryButton`, `cycleControl` (untuk bangun MENU_CONTROLS), `renderSettingsMenu`, `initSettingsViews`.
- Bare-name call di index (handler/showSettingsMenu/getConfigValue/MENU_CONTROLS) tetap valid via named-import → nol ubah call-site.
- **Nol circular:** index→views satu arah; MENU_CONTROLS & helper index dialirkan ke views sbg DATA lewat init().
