# BATCH D RECON — `/settings` (menu interaktif Telegram)

**Bot:** MAIN (`pm2 id 0` = meridian, `/home/ubuntu/meridianzen`, branch `experimental`)
**Sifat:** READ-ONLY. Nol ubah kode, nol restart. Semua klaim ada bukti `file:line`.
**TL;DR verdict:** Desain 2-mode **FEASIBLE & murah** — karena dua sumbu data (FUNGSI & ASAL) **sudah ada dua-duanya** di `config-origin.js`, dan "Mode Pisah" yang diminta brief ≈ **persis struktur `/settings` yang JALAN sekarang**. Yang benar-benar BARU cuma: lapisan navigasi Campur (per-fungsi) + tombol toggle mode + marker ⚙️/🧩 di tombol kontrol + return-after-edit yang sadar-mode. Mesin ubah-nilai TIDAK perlu disentuh.

> ⚠️ Koreksi asumsi brief: brief menulis seolah struktur `/settings` sekarang mungkin "flat". **Bukan.** `/settings` sekarang sudah **kaskade 3-tingkat (ASAL→grup→kontrol) + paginasi**, dikelompokkan **per-ASAL (dev/zen)**. Jadi "Mode Pisah" brief = yang sudah ada; "Mode Campur" = yang baru. Ini justru bikin kerjanya jauh lebih ringan.

---

## 1. Entry & struktur sekarang

**Entry command** — `index.js:3442`:
```
if (text === "/settings" || text === "/menu" || text === "/configmenu") { await showSettingsMenu()... }
```
- `showSettingsMenu({messageId, page})` `index.js:2994` → set `_settingsView = page` (`:2995`) lalu `renderSettingsMenu(page)` (`:2996`), kirim/`edit` pesan + keyboard.
- Dispatcher render: `renderSettingsMenu(page)` `index.js:2986`:
  - `main` → `renderSettingsMain()` (`:2870`)
  - `dev`/`zen` → `renderSettingsSection(base)` (`:2880`)
  - `presets` → `renderSettingsPresets()` (`:2949`)
  - selain itu (token grup, mis. `dev-management`, `zen-gmgn~2`) → `renderSettingsGroup(page)` (`:2900`)

**Susunan = kaskade DRILL-IN 3 tingkat + PAGINASI** (bukan flat):
- **T1 header** `settingsHeaderRows()` `index.js:2780` — SELALU tampil: 2 tombol ASAL (`⚙️ Origin Dev` / `🧩 Add by Zen`, dari `ORIGIN_SECTIONS`), baris `🗂️ Racikan` + `📋 Config penuh`, baris `🔄 Refresh` + `❌ Close`. Aktif ditandai `▸`.
- **T2 grup** `settingsGroupRows()` `index.js:2799` — muncul saat satu ASAL aktif & TETAP terlihat saat grup dibuka. Nama pendek (`MENU_GROUP_SHORT` `:2436`), 2/baris, tiap tombol bertanda `✏N` (jumlah editable) atau `👁` (lihat-saja). Aktif `▸`.
- **T3 kontrol** `settingsControlRows()` `index.js:2813` — daftar tombol editable utk satu grup, **dibucket per sub-cluster** (header noop per cluster bila grup >1 cluster), tombol single dipasang 2/baris. Dipaginasi `MAX_T3_ROWS = 8` (`index.js:2446`) — T1+T2 tetap terlihat lintas halaman; pager `‹ Hal x/y ›` di `renderSettingsGroup` `:2919`.
- **Landing** (`renderSettingsMain`): body = ringkasan config-inti (`formatSettingsLandingSummary` `:2849`) + 2 tombol ASAL.

**Berapa setting diekspos:** bukan subset core — **hampir seluruh permukaan**. Tombol editable = **137 kontrol** (entri di `MENU_CONTROLS` `index.js:2485-2722`; cocok dgn catatan memori "82→137"). Total key config ≈166 (`buildConfigRowMap` `:1751`); sisanya yang tak ada di `MENU_CONTROLS` tampil **read-only** di body grup (via `renderSubclusterRows`), tetap kelihatan tapi tanpa tombol.

**Tombol non-setting:** `📋 Config penuh` → `cfg:show` (`:2790`, handler `:3039` kirim `formatFullConfig()`); `🗂️ Racikan` → `cfg:page:presets` (`:2789`); `🔄 Refresh` → `cfg:page:<token>` (`:2792`); `❌ Close` → `cfg:close` (`:2792`, handler `:3034`). Plus halaman Racikan punya tombol load/diff/hapus/simpan (`renderSettingsPresets` `:2967-2974`).

---

## 2. Skema callback

**Namespace tunggal `cfg:*`.** Router: `index.js:3434`
```
if (msg?.isCallback && text.startsWith("cfg:")) { await applySettingsMenuCallback(msg); }
```
Handler: `applySettingsMenuCallback(msg)` `index.js:3015`. Parse: `data.split(":")`, `action = parts[1]` (`:3017-3018`).

**Bentuk callback_data yang dipakai:**
| Pola | Arti | Dibangun di | Handler |
|------|------|-------------|---------|
| `cfg:page:<token>` | drill ke seksi/grup/halaman | `:2783,2789,2792,2805,2921-2923` | `:3046` |
| `cfg:toggle:<key>` | flip boolean | `toggleButton` `:2404` | `:3147` |
| `cfg:step:<key>:<delta>` | +/- numerik | `stepButtons` `:2419-2421` | `:3149` |
| `cfg:set:<key>:<val>` | set enum/opsi | `cycleControl`/`build` `:2464` dst | `:3163` |
| `cfg:input:<key>` | minta ketik nilai | `inputButton` `:2428` | `:3025` |
| `cfg:cat:<cat>` | toggle kategori screening | `categoryButton` `:2412` | `:3123` |
| `cfg:preset:<sub>[:<name>]` | racikan (ask/go/diff/rmask/rmgo/save) | `:2970-2974` dst | `:3052` |
| `cfg:show` / `cfg:close` / `cfg:noop` | config penuh / tutup / dummy | `:2790,2792,2420` | `:3039/3034/3021` |

**Byte budget (limit Telegram 64 byte/callback_data):** terpanjang yang ADA sekarang = **48 byte** — `cfg:set:indicatorEntryPreset:supertrend_plus_smi`. Sisa headroom **16 byte**. `cfg:input:repeatDeployCooldownMinFeeEarnedPct` = 45 byte. Token `cfg:page:zen-experiments~2` = 26 byte. **Banyak ruang sisa** untuk encode dimensi mode.

> Catatan kunci utk desain: **callback EDIT (toggle/step/set/input/cat) TIDAK membawa page/mode** — cuma `key`. Posisi "balik ke mana" dipulihkan via `returnTokenForKey(key)` (`:2752`) yang baca `pageForKey(key)` + suffix `~hal` dari **`_settingsView`** (`:1608`, variabel modul). Jadi sistem sekarang **sudah pakai state modul**, bukan murni stateless.

---

## 3. Fungsi render

Semua **inline di `index.js`** (bukan di `views/`). Reusable & axis-agnostic sebagian:
- `settingButton(label,data)` `:2399` — primitif tombol.
- `fmtSettingValue(v)` `:2393` — boolean→🟢/⚪, array→csv.
- `toggleButton` `:2403`, `categoryButton` `:2409`, `stepButtons` `:2415`, `inputButton` `:2425`, `cycleControl` `:2457`.
- `settingsHeaderRows` (T1) `:2780`, `settingsGroupRows` (T2) `:2799`, `settingsControlRows` (T3) `:2813`.
- `renderSettingsMain` `:2870`, `renderSettingsSection` `:2880`, `renderSettingsGroup` `:2900`, `renderSettingsPresets` `:2949`, `renderSettingsMenu` `:2986`, `showSettingsMenu` `:2994`.

**Reusability penting:** `settingsControlRows(sg)` `:2813` cuma butuh `sg.keys` (array key config-origin) — **axis-agnostic**. Sebuah `FUNCTION_GROUPS` entry juga punya `.keys`. Artinya builder kontrol T3 **bisa langsung dipakai ulang** untuk grup-fungsi tanpa ubah. Sama: body grup `renderSubclusterRows(keys, rowMap)` `index.js:1978` juga cuma butuh array `keys` → reusable lintas sumbu.

**`views/config.js`** `:37/41` = renderer **teks** `/config` saja (mode `origin`/`function`), TIDAK membangun inline-keyboard. Jadi belum ada keyboard-builder di `views/`; semua keyboard `/settings` masih di index.js. (Peluang ekstraksi → `views/settings.js` saat build.)

---

## 4. Logika ubah-nilai (PISAH dari render — KONFIRMASI ✅)

Alur saat tombol setting ditekan (semua di `applySettingsMenuCallback`):
- **toggle** `:3147` → `value = !settingValue(key)`.
- **step** `:3149-3162` → `current+delta`, dgn clamp khusus per-key (maxPositions, rsiLength, dst).
- **set** `:3163` → `normalizeMenuValue(key, val)` (`:3004`, handle `indicatorIntervals`/KOL-list/`parseConfigValue`).
- **cat** `:3123` → utak-atik array kategori.
- Semua bermuara ke **`executeTool("update_config", {changes:{[key]:value}})`** `:3170` → lalu `showSettingsMenu({messageId, page: returnTokenForKey(key)})` `:3178-3180` (re-render in-place).

**`_pendingInput`** (`:1606`, `{key,page,menuMsgId}`): jalur "ketik nilai":
1. Tombol `cfg:input:<key>` → set `_pendingInput`, kirim prompt "Enter new value…" (`:3025-3032`).
2. Pesan teks berikut (bukan command, bukan callback) ditangkap di `:3397`; parse number/`off`; panggil `update_config` (`:3426`); re-render `showSettingsMenu({page})` (`:3431`). Catatan: input field **numeric-only** (`Number(text)`/`off`) — string bebas (mis. model) sengaja read-only (`MENU_CONTROLS` komentar `:2552`).

**Konfirmasi pemisahan render vs logika-ubah-nilai:** ✅ **terpisah bersih.** Render (`renderSettings*`, `settings*Rows`) tak menyentuh config; mutasi 100% lewat `update_config`. Redesign display-only (struktur/label/marker/navigasi) bisa **murni** sentuh tingkat render + token `cfg:page:*` + `returnTokenForKey`, **tanpa** mengubah toggle/step/set/input/cat handler maupun `executeTool`.

---

## 5. Data origin (REUSE — jangan bikin baru)

Semua sudah ada di **`config-origin.js`** (RENDER-ONLY, pure data, import nol):
- `ORIGIN_SECTIONS` `config-origin.js:20` — sumbu **ASAL** (dev/zen) → subgroups → keys. **= basis "Mode Pisah".** Sudah dipakai T1/T2 sekarang.
- `FUNCTION_GROUPS` `config-origin.js:433` — sumbu **FUNGSI** (12 grup: Sizing&Posisi, Screening, Screening-GMGN, Exit&Management, Strategy&Range, Indikator, Jadwal, LLM, Darwin, Reports&Learning, Eksperimen, Sistem/Infra). **= basis "Mode Campur".** Sudah dipakai `/config` default (`formatFunctionConfig` `index.js:2057`).
- `KEY_ORIGIN` `config-origin.js:536` — `key → "dev"|"zen"`, diturunkan dari `ORIGIN_SECTIONS`. **Persis utk marker ⚙️/🧩** di tombol Campur. Sudah dipakai function-view `/config`.
- `KEY_SUBCLUSTER` `:278` + `SUB_CLUSTER_META` `:216` + `L4_CHILDREN` `:369` — taksonomi sub-cluster (dipakai `settingsControlRows` & `renderSubclusterRows`; cross-origin, jadi twin dev+zen mencampur dalam satu cluster).

**Verdict reuse:** marker dan kedua sumbu grup **100% sudah tersedia** — desain tinggal "memilih sumbu". Tidak perlu data origin baru.

---

## 6. Money-behavior 🟠 (penanda visual saja — logika TIDAK disentuh)

Setting yang mengubah perilaku trading (kandidat tanda 🟠):
- **Master:** `dryRun`.
- **Sizing/modal:** `deployAmountSol`, `maxDeployAmount`, `positionSizePct`, `minSolToOpen`, `maxPositions`, `sizingMode`, `rentPerPositionSol`, `gasReserve`/`gasReserveFloorSol`/`gasReserveAutoTune`/`gasReserveBufferDays`, `convictionSizing`(+`…MaxAdjustPct`).
- **Exit/close paksa:** `stopLossPct`, `takeProfitPct`, `trailingTakeProfit`/`trailingTriggerPct`/`trailingDropPct`, `outOfRangeWaitMinutes`/`outOfRangeBinsToClose`, `oorCooldownTriggerCount`/`oorCooldownHours`, `minFeePerTvl24h`, `minAgeBeforeYieldCheck`, `minVolumeToRebalance`, `minClaimAmount`, `autoSwapAfterClaim`.
- **Entry/gate deploy:** semua filter screening (`min/maxTvl`, `minVolume`, `min/maxMcap`, `minHolders`, `minOrganic`/`minQuoteOrganic`, `minFeeActiveTvlRatio`, `minTokenFeesSol`, `min/maxBinStep`, `min/maxTokenAgeHours`, `excludeHighSupplyConcentration`, `maxBotHoldersPct`, `maxTop10Pct`, `avoid/blockPvpSymbols`, `allowed/blockedLaunchpads`, `timeframe`, `category`), `screeningSource`, seluruh blok `gmgn.*`, indikator gate (`enabled`, `entryPreset`, `exitEnabled`, `exitPreset`, `rejectAlreadyAtBottom`, RSI/SMI/intervals), `strategy`/`strategyLock`/`min/max/defaultBinsBelow`.
- **Cooldown/eksperimen yang gerakkan keputusan:** `repeatDeployCooldown*`, `idleScreeningCooldown(+Min)`, `marketRegimeGate`(+pct), `exitLiquidityCheck`(+slippage).

**BUKAN money (display/infra/meta — tak perlu 🟠):** `solMode`, semua `pnl*`, `gmgnFeeSource`, `hiveMind*`, `agentId`/`publicApiKey`, `lpAgentRelayEnabled` (relay eksekusi, tapi infra), `managementModel`/`screeningModel`/`generalModel`/`temperature`/`maxTokens`/`maxSteps`/`generalMaxTokens`, interval jadwal (`managementIntervalMin`/`screeningIntervalMin`/`healthCheckIntervalMin`/`adaptiveScreening`/`maxScreeningIntervalMin` — frekuensi, bukan keputusan), `darwin*` (bobot sinyal, soft), `learningReportEvery`/`learningReportTrendN`, `evolveEnabled`, sinyal soft eksperimen (`candidateMomentum`, `smartWalletMomentum`, `expectedYieldSignal`, `narrativeProfileSignal`, `counterfactualReview`(+pct)), `paperTrading`/`usePaperHistoryWhenLive` (sim).

> Catatan: ada data origin (⚙️/🧩) TAPI **belum ada** flag money/safety. Penanda 🟠 perlu **set/peta baru kecil** (mis. `MONEY_KEYS = Set<…>` di config-origin.js) — render-only, satu sumber. Ini satu-satunya "data baru" yang poin 6 minta.

---

## 7. Batas teknis (tombol/halaman)

- **Limit keras Telegram:** ≤100 tombol/pesan, praktis ≤8 tombol/baris. Bukan kendala.
- **Limit terpasang sekarang:** `MAX_T3_ROWS = 8` baris kontrol/halaman (`index.js:2446`), sisanya paginasi (`renderSettingsGroup` `:2914-2925`). T1 (3 baris) + T2 (chunk 2/baris, `chunkRows` `:2447`) selalu di atas.
- **Readability:** grup terbesar **Screening-GMGN (38 key)** & **Screening (27 key)** — dengan header sub-cluster + pasangan 2/baris ini jauh di atas 8 baris → **WAJIB tetap dipaginasi**. Mode Campur (grup-fungsi) punya grup gede yang sama (Screening, Screening-GMGN, Exit&Management, Indikator) → **Campur juga butuh drill+paginasi**, bukan satu pesan datar. Untungnya pager + `MAX_T3_ROWS` **sudah ada dan reusable**.
- Kesimpulan: Campur **tidak bisa** murni "satu layar penuh tombol" — pakai pola drill (landing grup-fungsi → kontrol grup terpaginasi) yang identik dengan T2→T3 sekarang.

---

## VERDICT VALIDASI DESAIN 2-MODE

### Feasible? **YA — high confidence, jejak kecil.**
Karena dua sumbu data + marker sudah ada, dan mesin edit terpisah bersih dari render.

### Reuse vs Baru

**REUSE (≈80% pekerjaan sudah jadi):**
- **Mode Pisah ≈ struktur sekarang apa adanya** — `ORIGIN_SECTIONS` + `settingsHeaderRows`/`settingsGroupRows`/`renderSettingsSection`/`renderSettingsGroup`. (3-tingkat: ASAL→grup→kontrol.)
- `settingsControlRows(sg)` & `renderSubclusterRows(keys)` — axis-agnostic, pakai langsung utk grup-fungsi (cukup beri objek `{title, keys, desc}` dari `FUNCTION_GROUPS`).
- `FUNCTION_GROUPS` (data Campur), `KEY_ORIGIN` (marker), `KEY_SUBCLUSTER`/`SUB_CLUSTER_META`/`L4_CHILDREN` (sub-cluster).
- Skema callback `cfg:*` + seluruh handler edit (toggle/step/set/input/cat) + `executeTool("update_config")` + `_pendingInput` — **tak disentuh**.
- Paginasi (`chunkRows`, `MAX_T3_ROWS`, pager) + `_settingsView` + pola `returnTokenForKey`.

**BARU (kecil & terlokalisir):**
1. **Navigasi Campur:** `findFnGroup(id)` + render landing-fungsi (12 tombol grup-fungsi + toggle mode) + render grup-fungsi (reuse `settingsControlRows`). Bisa juga `renderSettingsGroup` di-parametrize sumbu (`findSubgroup` → cek `FUNCTION_GROUPS` juga).
2. **Tombol toggle mode** `🔀 Mode: …` di T1 (campur↔pisah).
3. **Marker ⚙️/🧩 di tombol kontrol (Campur):** beri param opsional `withOriginMarker` ke `settingsControlRows`; prepend `KEY_ORIGIN[k]` emoji ke label (key config-origin `k` ada di scope). (Origin view tak perlu marker → sumbu = grupnya.)
4. **Return-after-edit sadar-mode:** `MENU_KEY_TO_FNGROUP` (paralel `MENU_KEY_TO_PAGE` `:2727`, dibangun dari `FUNCTION_GROUPS`) + `returnTokenForKey` baca mode dari `_settingsView`.
5. **(poin 6)** `MONEY_KEYS` set + prepend 🟠 (opsional, render-only).
6. **Label pendek grup-fungsi** (`MENU_FNGROUP_SHORT`) analog `MENU_GROUP_SHORT` `:2436`.

### callback_data cukup utk encode mode?
**Cukup, dengan kelonggaran besar.** Rekomendasi: **encode mode di TOKEN halaman saja** (`cfg:page:<token>`), pakai prefiks slug, mis. `fn-screening~2` (Campur) vs `dev-screening~2` (Pisah). Token Campur terpanjang ~`cfg:page:fn-screening-gmgn~2` ≈ 30 byte « 64. **Callback EDIT TIDAK perlu bawa mode** (honor "logika ubah-nilai tak disentuh") — mode dipulihkan dari `_settingsView` saat `returnTokenForKey`.

⚠️ **Klarifikasi vs brief "tanpa state persisten":** Murni-stateless **tidak mungkin tanpa mengubah callback edit**, karena callback edit memang tak membawa page (begitu juga sistem SEKARANG — sudah andalkan `_settingsView`). Jadi simpan **mode di `_settingsView`** (1 variabel modul, sesuai arsitektur sekarang) = pilihan paling murah & konsisten. Kalau owner mau strict-stateless, alternatifnya encode mode ke SEMUA callback edit (mis. `cfg:toggle:KEY:f`), masih muat (≤50 byte) tapi menyentuh builder edit → tidak disarankan untuk redesign display-only.

### Bagian desain yang TIDAK pas + usul alternatif
- **"Mode Pisah = 2 tingkat (ASAL→setting flat + Back)"** seperti tulisan brief **tidak praktis**: dev ≈80 key, zen ≈80 key → flat = paginasi raksasa. **Usul: pakai Pisah = 3-tingkat yang SUDAH ADA** (ASAL→grup→kontrol). Ini sudah persis "pisah by origin", lebih enak dibaca, dan reuse 100%. (Tombol "Back" eksplisit pun tak perlu — T1/T2 selalu tampil, tap seksi/grup lain langsung pindah.)
- **"Mode Campur satu layar penuh tombol"** tidak muat (lihat poin 7). **Usul: Campur = landing 12 tombol grup-fungsi → tap → kontrol grup terpaginasi** (mirror T2→T3). Marker ⚙️/🧩 muncul di level KONTROL (tombol setting), bukan di tombol grup-fungsi (grup campur lintas-asal).
- **Default mode:** brief minta Campur jadi default. Sekarang default = landing-ASAL (`renderSettingsMain`). Tinggal alihkan `showSettingsMenu()` tanpa-arg → landing-Campur. Trivial.

### Risiko / ketergantungan
- **Rendah.** Tak ada perubahan jalur mutasi/`update_config` → nol risiko ke trading.
- Jaga **parity key**: `FUNCTION_GROUPS` sudah dijamin union==166 (komentar `config-origin.js:419-432`); pastikan `MENU_KEY_TO_FNGROUP` fallback aman (analog `pageForKey` default `dev-management` `:2746`).
- Hati-hati beda **key config-origin** (`enabled`, `gmgn.minMcap`) vs **key settingValue** (`chartIndicatorsEnabled`, `gmgnMinMcap`): `MENU_KEY_TO_FNGROUP` harus dibangun seperti `MENU_KEY_TO_PAGE` (`:2727-2740`) — resolve via `MENU_CONTROLS[k].pageKeys/toggle/input`.
- **Estimasi jejak `index.js`:** ~80–140 baris tambahan bila inline; **lebih baik ekstrak keyboard-builder ke `views/settings.js`** (sejalan workstream 🅴 — `views/config.js` sudah jadi contoh untuk teks; keyboard belum diekstrak). Builder murni (return rows[]) → mudah dipindah; index.js sisakan glue `showSettingsMenu`/handler.

---

## Lampiran — peta file:line cepat
- Entry `/settings`: `index.js:3442` · router callback `cfg:`: `:3434` · handler `applySettingsMenuCallback`: `:3015`
- State: `_settingsView` `:1608`, `_pendingInput` `:1606`
- Render: main `:2870`, section `:2880`, group `:2900`, presets `:2949`, dispatch `:2986`, show `:2994`
- Keyboard rows: T1 `:2780`, T2 `:2799`, T3 `:2813` · primitif `:2399` · pagination `MAX_T3_ROWS` `:2446`/`chunkRows` `:2447`
- Registry: `MENU_CONTROLS` `:2485-2722` (137) · `MENU_KEY_TO_PAGE` `:2727` · `pageForKey` `:2745` · `returnTokenForKey` `:2752`
- Edit handlers: toggle `:3147`, step `:3149`, set `:3163`, cat `:3123`, input prompt `:3025`, input apply `:3397`
- Data (reuse): `config-origin.js` — `ORIGIN_SECTIONS:20`, `FUNCTION_GROUPS:433`, `KEY_ORIGIN:536`, `KEY_SUBCLUSTER:278`, `SUB_CLUSTER_META:216`, `L4_CHILDREN:369`, `CORE_GROUPS:381`
- Body shared: `renderSubclusterRows` `index.js:1978`, `subgroupDesc` `:2009`, `buildConfigRowMap` `:1751`
- Teks view `/config` (bukan keyboard): `views/config.js:37/41`
