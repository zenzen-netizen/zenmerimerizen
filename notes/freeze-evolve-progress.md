# FREEZE EVOLVE — progress tracker

**Tujuan:** toggle `evolveEnabled` (boolean) buat MENGUNCI auto-evolve threshold
(`evolveThresholds` yg nulis `minFeeActiveTvlRatio` + `minOrganic` tiap 5 close), set
FROZEN sekarang biar baseline **mainzen_v2** bersih nggak drift otomatis pas tuning.
Reversible (balik toggle ke true). Branch: `experimental`.

**KESELAMATAN:** cuma nge-GATE auto-writer threshold. NOL sentuhan eksekusi
trade/exit/screening. Aman di-restart. Reversible.

---

## FASE 0 — KONFIRMASI (recon) ✅

### Chokepoint `evolveThresholds`
- **Definisi fungsi (writer murni):** `lessons.js:405` `export function evolveThresholds(perfData, config)`.
  Ini chokepoint yg dulu disentuh `keepActiveRacikan` (filter di `lessons.js:409`).
  Nulis ke `user-config.json` di `lessons.js:498` (`fs.writeFileSync`), apply ke live config
  `lessons.js:501-503` (`s.minFeeActiveTvlRatio` / `s.minOrganic`).
- **Pemicu AUTO (tiap 5 close):** `lessons.js:255-262` di dalam `recordPerformance()`.
  `const livePerf = …!p.paper && keepActiveRacikan(p)` → `if (livePerf.length % 5 === 0)` →
  `evolveThresholds(livePerf, config)` → kalau ada changes: `reloadScreeningThresholds()`.
  Blok Darwin (`config.darwin?.enabled`) ADA di bawahnya (`lessons.js:265-271`) — **toggle terpisah**.
- **Command MANUAL `/evolve`:** `index.js:4001` (REPL CLI saja — `rl.on("line")`).
  `evolveThresholds(lessonsData.performance, config)`. **TIDAK ada handler `/evolve` di Telegram**
  (grep `/evolve` cuma ketemu help `index.js:3823` + handler REPL `index.js:4001`).
  Jadi user Telegram TAK bisa memicu evolve manual; cuma operator CLI.

### Toggle/gate evolve — UDAH ADA belum?
- **BELUM ADA.** Tidak ada `evolveEnabled` / gate apa pun di jalur auto maupun manual.
  `darwinEnabled` ada toggle sendiri (`config.darwin.enabled`) — itu beda mekanisme (bobot sinyal),
  DI LUAR LINGKUP. → lanjut bikin toggle baru, tidak duplikat.

### Rencana implementasi
- **Section config:** `config.learning.evolveEnabled` (default `u.evolveEnabled ?? true` = perilaku
  SEKARANG tak berubah). Section baru `learning` → daftarkan di KNOWN_SECTIONS (executor.js + index.js).
- **Gate AUTO** di `lessons.js:255` (call-site, BUKAN di dalam `evolveThresholds`) supaya manual
  tetap bisa. `evolveEnabled===false` → skip auto-write + `log("evolve","frozen")`, JANGAN nulis config.
  Blok Darwin di bawah TIDAK disentuh (toggle sendiri).
- **MANUAL `/evolve`** (REPL): plain `/evolve` saat frozen → TOLAK + warning jelas + saran `/evolve force`.
  `/evolve force` → jalan paksa (override eksplisit operator) dgn banner ⚠️. Saat tidak frozen → seperti biasa.
- **FASE 2 register:** CONFIG_MAP (`evolveEnabled:["learning","evolveEnabled"]`), config-schema (`bool()`),
  rowMap display (dot 🟢/⚪), config-origin subgroup `zen-learning`, settingValue + MENU_CONTROLS (toggle),
  definitions.js (baris Learning), reloadScreeningThresholds (re-read), SETTINGS-GUIDE.md.
- **FASE 3:** `user-config.json` (racikan aktif = **mainzen_v2**) → `evolveEnabled:false`.

---

## FASE 1 — TAMBAH TOGGLE + GATE ✅
- `config.js`: section baru `config.learning = { evolveEnabled: u.evolveEnabled ?? true }`
  (default true = perilaku sekarang TAK berubah).
- `lessons.js:255` (call-site AUTO di `recordPerformance`): gate `config.learning?.evolveEnabled === false`
  → SKIP auto-write + `log("evolve","frozen … thresholds unchanged")`, JANGAN nulis user-config.
  `evolveThresholds()` sendiri TIDAK disentuh (tetap writer murni → manual tetap bisa). Blok Darwin
  di bawah TAK disentuh (toggle `darwinEnabled` sendiri).
- `index.js` REPL `/evolve`: plain `/evolve` saat frozen → TOLAK + warning + saran `/evolve force`.
  `/evolve force` → jalan paksa dgn banner ⚠️ OVERRIDE. Saat tidak frozen → seperti biasa.
  Help text REPL ditambah baris `/evolve force`.
- Syntax: `node -c` config.js + lessons.js + index.js → PASS.
- Commit: (lihat git log)

## FASE 2 — REGISTER (CONFIG_MAP + schema + display + /settings + docs) ✅
Full-sync semua permukaan:
- `tools/executor.js`: CONFIG_MAP `evolveEnabled:["learning","evolveEnabled"]` + KNOWN_SECTIONS +`"learning"`.
- `index.js`: KNOWN_SECTIONS (jalur konfirmasi) +`"learning"`.
- `config-schema.js`: `evolveEnabled: bool()` (satpam — terima true/false/off, tolak garbage).
- `index.js` rowMap (`/config`): baris `evolveEnabled` dgn dot 🟢/⚪ (via `fmt`) + tag BEKU/aktif.
- `config-origin.js`: subgroup baru `zen-learning` ("Learning/Evolve") + `KEY_SUBCLUSTER.evolveEnabled="learning"`
  + `SUB_CLUSTER_META.learning` (🧬 Auto-Evolve).
- `index.js`: `settingValue.evolveEnabled` + `MENU_CONTROLS.evolveEnabled` (toggle) + `MENU_GROUP_SHORT["zen-learning"]="🧬Learn"`.
  (`pageForKey` auto-derive → zen-learning).
- `tools/definitions.js`: baris `Learning: evolveEnabled (…)` di deskripsi update_config.
- `config.js` `reloadScreeningThresholds`: re-read `evolveEnabled` (hand-edit tanpa restart).
- `SETTINGS-GUIDE.md`: GRUP 18 baru — Learning/Auto-Evolve + entri `evolveEnabled` + analogi + beda-Darwin.
- `user-config.example.json`: `"evolveEnabled": true` (dokumentasi default).
- Test: `npm test` (test:syntax semua *.js) → EXIT 0. Smoke: schema=bool, subgroup keys ok, config.learning loads.
- Commit: (lihat git log)

## FASE 3 — SET FROZEN (user-config.json) ✅
- `user-config.json` (racikan aktif **mainzen_v2**): `"evolveEnabled": false`.
- ⚠️ `user-config.json` di-`.gitignore` (runtime/secret) → FASE 3 = perubahan FILE runtime, BUKAN commit.
  Default-nya didokumentasikan di `user-config.example.json` (committed, =true). Restore: balikkan ke `true`.
- Smoke: `config.learning.evolveEnabled=false` → gate "frozen? YES (auto-evolve SKIP)";
  `darwin.enabled=true` (tak tersentuh); `minFeeActiveTvlRatio=0.1` / `minOrganic=70` (tak berubah).

## VERIFIKASI ✅
- **Gate (false → auto-evolve skip):** `lessons.js:262` `if (config.learning?.evolveEnabled === false)`
  di call-site AUTO (`recordPerformance`, tiap 5 close) → `log("evolve","frozen … unchanged")`, TANPA tulis user-config.
  `evolveThresholds()` (writer murni, `lessons.js:405`) TIDAK disentuh → manual tetap bisa.
- **/config & /settings:** evolveEnabled muncul (rowMap `/config` sub-grup Learning/Evolve dgn dot 🟢/⚪;
  `/settings` → 🧬Learn → tombol toggle). Satpam `validateConfigValue("evolveEnabled", …)` terima true/false/off,
  tolak garbage (string non-coerce/angka). `coerceConfigValue` "true"/"false"→bool sebelum validasi (toggle aman).
- **user-config.json:** evolveEnabled=false ✅. **branch:** experimental ✅. **log per fase** ✅ (2 commit kode).
- **diff --stat:** 9 file kode/docs + progress (177++/10--). `npm test` (syntax semua *.js) EXIT 0.
- **pm2:** id 0 `meridian` = repo ini (`/home/ubuntu/meridianzen`) — JALAN 7 jam di KODE LAMA (belum ada gate).
  ⚠️ **RESTART PENDING (aksi owner):** gate baru aktif setelah `pm2 restart meridian --update-env`.
  Sampai restart, proses lama tak punya `config.learning` → auto-evolve masih bisa jalan di kode lama.
  Tidak di-restart otomatis (bot trading live = keputusan owner). id 1 `meridian-v3` (meridianzen2) = TERPISAH, tak disinkron.

**TEGAS:** Setelah pm2 di-restart, `minFeeActiveTvlRatio` & `minOrganic` TIDAK akan berubah otomatis lagi
(auto-evolve BEKU) sampai `evolveEnabled` di-`true`-kan lagi (chat/`/setcfg`/`/settings` → 🧬Learn, atau `/evolve force` 1×).
Darwin DI LUAR LINGKUP (toggle `darwinEnabled` sendiri, tetap true).
