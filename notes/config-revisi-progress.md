# REVISI /config — PROGRESS

Owner feedback atas Batch E FASE 1: `/config` default JANGAN flat 12-grup. Mau **grup + sub-cluster
(L3) + anak ↳ (L4) dipertahankan** (kayak view origin), TAPI di dalam tiap sub-cluster **key dev & zen
DICAMPUR + tiap key dikasih marker ⚙️/🧩**. Yang dibuang HANYA split L1 `⚙️ ORIGIN DEV`/`🧩 ADD BY ZEN`.
Bot MAIN (`pm2 id 0`, branch experimental). `/config origin` + tombol /settings "Config penuh" TAK diubah.

- [x] 0  recon merge-map: pasangan (origin,subgroup) → grup fungsi + sub-cluster/anak per grup ✅
- [x] 1  renderFunction v2: grup → sub-cluster → key dev/zen dicampur + marker; parity 166 ✅

---

## FASE 0 — Recon merge-map (READ-ONLY) ✅

### Mekanisme yang DIPAKAI ULANG (rule #2 — nol taksonomi baru)
- `KEY_SUBCLUSTER` (config-origin.js:278-364) sudah **lintas-asal**: key dev & zen yang sekonsep
  dipetakan ke **sub-cluster id yang SAMA** (mis. `sizing`: deployAmountSol/positionSizePct/minSolToOpen
  [dev] + sizingMode/rentPerPositionSol [zen]; `gas`: gasReserve [dev] + gasReserveAutoTune/Buffer/Floor
  [zen]; `gen`: temperature/maxTokens/maxSteps [dev] + generalMaxTokens [zen]). GMGN punya cluster
  ber-prefix `gmgn-*` (tak tabrakan twin screening).
- ⇒ Cukup oper **daftar key gabungan per grup fungsi** ke `renderSubclusterRows` (yang sudah bucket
  by sub-cluster + indent L4 ↳ + tampil L3 bila >1 cluster). Hasilnya dev+zen **otomatis tercampur**
  dalam satu sub-cluster. Tambah cuma **marker** (`KEY_ORIGIN[k]` → ⚙️/🧩) di depan label.
- **Coverage cek (node):** 166 key, **0 jatuh ke `_misc`** (semua punya sub-cluster). Aman.

### Merge-map FINAL (grup fungsi → sub-cluster [count], dev+zen dicampur)
| ▸ Grup | sub-cluster (L3) |
|---|---|
| 📊 Sizing & Posisi | ⚖️ Risiko(3) · 💰 Sizing(5) · ⛽ Gas(4) |
| 🔍 Screening | 🔎 Sumber(1) · 🪟 Jendela&Kategori(3) · 📏 Ukuran(6) · ⭐ Kualitas(4) · 🪜 Bin-step(2) · ⏳ Usia(2) · 🛡 Keamanan(7) · 💬 Discord(2) |
| 🔎 Screening-GMGN | 🔍 Discovery(5) · 📏 Ukuran(6) · ⏳ Usia(2) · 💵 Fee(1) · 👑 KOL(7) · 🛡 Keamanan(8) · 📊 Indikator(2) · 📐 Aturan Indikator(6) |
| 🚪 Exit & Management | 🛡 Exit SL/TP(2) · 📉 Trailing(3,+2↳) · 📤 OOR(2) · ❄️ OOR Cooldown(2) · 🌾 Yield(3) · 🧾 Claim(2) · 🔁 Re-deploy Cooldown(5,+4↳) |
| 📐 Strategy & Range | 📐 Strategi(2) · 🪜 Lebar Range bins(3) |
| 📊 Indikator | 📊 Inti(6) · 📈 RSI(3) · 🚪 Gerbang Exit(1) · 🚧 Veto Entry(1) · 〰️ SMI(3) |
| ⏱ Jadwal | ⏱ Jadwal(5) — 1 cluster → flat |
| 🧠 LLM | 🧠 Model(3) · 🎛 Param Generasi(4) |
| 🧬 Darwin | 🧬 Darwin(8,+7↳) — 1 cluster → flat |
| 📑 Reports & Learning | 📑 Reports(2) · 🧬 Auto-Evolve(1) |
| 🧪 Eksperimen | 🧪 Experiments(16) — 1 cluster → flat |
| 🌐 Sistem/Infra | 🌐 Meridian/API(2) · 🐝 HiveMind(4) · 📡 PnL(5) · 💵 Fee Source(1) · 🖥 Display(1) |
| 🧬 Racikan/Identitas | identity block (formatIdentityLines) |

### Keputusan FASE 0 (perlu diterapkan di FASE 1)
1. **`dryRun` PINDAH ke Sizing & Posisi** (cluster `risk`/Risiko). DI FASE 1-lama dryRun nyangkut di
   Sistem → bikin sub-cluster **Risiko KEPECAH** (maxPositions/maxDeployAmount di Sizing, dryRun di
   Sistem). Faithful = satukan: Risiko = {dryRun, maxPositions, maxDeployAmount}. Sistem/Infra jadi
   bersih (Meridian/Hive/PnL/Fee/Display, nol Risiko).
2. **Rename grup "Exit & Trailing" → "Exit & Management"** (istilah owner).
3. `solMode` tetap di Sistem/Infra (cluster `display` → 🖥 Display).
4. GMGN tetap **grup sendiri tepat di bawah Screening** (honor "di bawah Screening"; 37 key + 8
   sub-cluster sendiri terlalu besar buat dinested jadi 1 sub-cluster di Screening). Hint aktif/nonaktif
   di header grup (gmgnDynamic).
5. **Gaya sub-cluster = "kayak lama"**: header `┈` + indent 4-spasi (reuse renderSubclusterRows), BUKAN
   ├/└ per-key. Mockup owner pakai ├/└ tapi teks brief bilang "kayak lama" + reuse renderSubclusterRows
   → ambil gaya lama; mudah di-swap ke ├/└ kalau owner mau.
6. Detail dipertahankan: 166 key · L3 sub-cluster · 14 anak ↳ · ORIGIN_NOTES inline · identity ·
   safety-net orphan. Satu-satunya yang dibuang = pemisah L1 DEV/ZEN.

## FASE 1 — hasil ✅
- **config-origin.js** FUNCTION_GROUPS: `dryRun` pindah ke Sizing & Posisi (depan, sebelum maxPositions
  → Risiko utuh {dryRun,maxPositions,maxDeployAmount}); `dryRun` dibuang dari Sistem/Infra; rename grup
  "Exit & Trailing"→"Exit & Management"; komentar di-update (sub-cluster dipertahankan + campur). `solMode`
  tetap di Sistem (Display).
- **views/config.js**: `renderSubclusterRows` +param `marked` (true → sisip `MARK[KEY_ORIGIN[k]]` ⚙️/🧩 di
  depan label, juga di anak ↳; false → tanpa marker). `renderFunction` v2: iterasi 12 grup fungsi → tiap
  grup `renderSubclusterRows(g.keys,rowMap,true)` (sub-cluster L3 + anak ↳ L4 muncul, dev+zen tercampur,
  marker per-key) + header `▸ <emoji> <title>` + GMGN hint. Orphan-net + identity + legenda (+↳) tetap.
  `treeRows` flat lama DIHAPUS (tak dipakai lagi). renderOrigin TAK diubah (marked default false).
- **Parity node-check**: 166 unik · 0 hilang · 0 dobel · 0 unknown · marker 94⚙️+72🧩 (semua 166 baris
  ber-marker, incl 14 anak ↳ `↳ ⚙️ trailingTriggerPct`) · 0 key ke _misc. Render uji: 12 grup ▸, sub-cluster
  ┈ + anak ↳ muncul, dev/zen tercampur dalam cluster (cek Sizing: dryRun/maxPositions⚙️ + sizingMode/
  rentPerPositionSol🧩), ORIGIN_NOTES inline (minSolToOpen) kebawa, GMGN hint aktif/nonaktif, Sistem bersih
  (Display=solMode, nol Risiko nyasar). 6222 char → ~2 chunk auto-split.
- **`/config origin` + tombol /settings "Config penuh" TAK berubah**: render origin = 166 baris, **0 marker,
  masih Zen-first + L1 DEV/ZEN split** (dispatch test). `/config` = L1 split dibuang. node --check index/
  config-origin/config OK. NOL ubah-nilai-logic, NOL engine/money/tools.

## Catatan/limit-recovery
(kosong — FASE 0–1 tuntas tanpa limit)
