# TUTORIAL — meridian-zen-pack (versi bahasa awam)

> Panduan memahami rencana pemisahan custom bot jadi paket plug-n-play.
> Ditulis campur bahasa awam + istilah teknis tipis biar tetap paham subjek/objek.
> Pasangan: `PLAN.md` (versi teknis lengkap).

Dibuat: 2026-07-07

---

## Apa masalahnya sekarang?

Bot meridian-mu itu aslinya buatan developer lain: **yunus** (github `yunus-0x/meridian`).
Kamu fork (salin repo) lalu tambah banyak fitur custom sendiri.

Sekarang kondisi repo-mu:

| Istilah awam | Istilah teknis | Angka |
|---|---|---|
| Jumlah perubahan yang kamu tambah | commit custom | 516 |
| File baru buatanmu | file JS baru | 46 |
| File asli yunus yang kamu ubah | file core dimodifikasi | 27 |
| Baris kode tambahan di 6 file inti | insertions | +5735 |

Masalahnya: fitur custom-mu **menempel langsung** ke 27 file inti yunus. Istilahnya *static import* — kode custom ditulis menyatu dengan kode asli. Bukan plugin terpisah.

Akibatnya tiap yunus update:
- Kamu `git pull` dari upstream → konflik di 27 file
- Capek selesaikan konflik manual
- Riskan salah merge → bot rusak

## Apa goal-mu?

Pengen seperti **skill caveman** di opencode:
- Caveman skill = file terpisah (`SKILL.md`), tidak sentuh core opencode
- Tinggal taruh file → aktif. Hapus file → mati.

Target untuk meridian:
1. `git pull upstream main` → bot murni yunus, **zero custom** (vanilla)
2. Jalankan `./install.sh` → **SEMUA custom-mu aktif** (addprofil, envcrypt, paper-trading, /export racikan, /preset, views custom, telegram messages custom, briefings, learning, dll)
3. Jalankan `./uninstall.sh` → balik ke vanilla yunus

Jadi tiap yunus update: pull → install ulang → custom kembali tanpa pusing konflik 27 file.

## Kenapa tidak bisa langsung "copy folder custom"?

Karena meridian **tidak punya sistem plugin**. Berbeda dengan opencode yang sudah punya skill system built-in.

Di meridian sekarang, fitur custom-mu dipanggil langsung dari dalam kode inti. Contoh:

```js
// di index.js baris 46
import { isPaperMode } from "./paper-trading.js";
//           ^^^^^^^^^ custom-mu     ^^^^^^^^^^ dipanggil langsung
```

Kalau kamu copy folder custom ke vanilla yunus → file custom ada di sana, **TAPI tidak ada yang memanggilnya**. Bot jalan tanpa fitur custom. Harus ada "jembatan" yang menyambungkan.

## Solusi: bangun sistem plugin

Istilah teknisnya: **hook bus + plugin loader**.

Bayangkan hook bus seperti **stop kontak**:
- Stop kontak = tempat colokan (event)
- Plugin = alat elektronik (TV, kulkas, lampu) yang dicolok
- Core yunus = rumah yang sudah ada stop kontak-nya

Alurnya:
1. Bangun 1 stop kontak di rumah yunus (hook bus, file kecil ~30 baris)
2. Tiap custom-mu = alat yang punya steker (plugin self-register)
3. Core yunus di-patch di ~15-20 titik jadi "menyalakan stop kontak" (`bus.emit("event")`) saat sesuatu terjadi
4. Plugin dengar event itu (`bus.on("event", handler)`) → lakukan kerjaannya

Setelah jadi:
- Tambah custom = taruh file di `plugins/` → auto terdeteksi
- Hapus custom = hapus file → fitur mati sendiri
- Update custom = timpa file → fitur baru aktif
- Core yunus tetap bersih (cuma 15-20 titik anchor, bukan 27 file berubah total)

## Analogi sederhana

**Tanpa plugin system (sekarang):**
Rumah yunus. Kamu renov total: banging tembok, tanam kabel di dinding, pasang lampu custom di langit-langit. Tiap yunus renov rumahnya → kabel-mu kena, lampu-mu gampang rusak.

**Dengan plugin system (target):**
Rumah yunus tetap asli. Kamu pasang 1 stop kontak di dinding. Lampu custom-mu = colok ke stop kontak. Yunus renov → stop kontak tetap di tempat (cuma 1 titik), lampu tinggal colok ulang kalau perlu.

## Struktur paket custom-mu

Folder paket = repo terpisah `zenzen-netizen/meridian-zen-pack`. Isi:

```
meridian-zen-pack/
├── install.sh          ← script install (yang kamu jalankan)
├── uninstall.sh        ← script uninstall (balik vanilla)
├── manifest.json       ← daftar isi + titik tempel (peta integrasi)
├── README.md           ← dokumen cara pakai
├── lib/                ← otak paket (stop kontak + installer engine)
│   ├── bus.js          ← stop kontak (hook bus)
│   ├── loader.js       ← scanner plugin (auto-deteksi plugins/*.js)
│   └── patcher.js      ← mesin tempel kode ke core yunus
├── plugins/            ← semua custom-mu, 1 file = 1 fitur
│   ├── envcrypt.js
│   ├── paper-trading.js
│   ├── addprofil.js
│   ├── ... (total ~50 file)
├── views/              ← tampilan UI (telegram messages, /positions, /status)
│   ├── positions.js, status.js, settings.js, ... (13 file)
├── tools-extra/        ← tool baru untuk agent
│   ├── chart-indicators.js, gmgn.js, pnl.js, smi.js (4 file)
├── core-patches/       ← "steker" yang ditempel ke core yunus
│   ├── 01-hook-bus.patch
│   ├── 02-config-keys.patch
│   └── ... (total ~15-20 file patch)
├── scripts/            ← script standalone (backtest, smoke test)
└── tests/              ← verifikasi install jalan
    ├── smoke-test.js
    └── feature-checklist.md
```

## Istilah teknis tipis (glosarium)

| Istilah | Arti awam |
|---|---|
| **repo** | folder proyek di git (github) |
| **fork** | salin repo orang lain ke akunmu |
| **upstream** | repo asli (yunus-0x/meridian) |
| **origin** | fork-mu (zenzen-netizen/zenmerimerizen) |
| **commit** | snapshot perubahan tersimpan di git |
| **branch** | cabang pengembangan (`experimental`, `main`) |
| **merge** | gabung perubahan dari branch lain |
| **konflik merge** | saat 2 perubahan sentuh baris sama, git minta manusia pilih |
| **upstream drift** | repo-mu makin beda dari repo asli seiring waktu |
| **plugin** | modul terpisah yang bisa dipasang/lepas tanpa sentuh core |
| **hook bus** | sistem event: core teriak "event X terjadi", plugin dengar + respon |
| **anchor** | string teks di kode yang dipakai patcher sebagai titik tempel (bukan nomor baris) |
| **patch** | file berisi "tempel kode Y setelah string X di file Z" |
| **vanilla** | bot murni yunus, tanpa custom |
| **dry-run** | mode simulasi, tidak kirim transaksi on-chain |
| **SHA** | ID unik commit (hash), dipakai untuk lock versi |
| **idempotent** | jalankan 2x → hasil sama dengan 1x (tidak dobel) |

## Cara kerja install (goal akhir)

```bash
# 1. Ambil bot murni yunus
cd /path/to/meridian
git pull upstream main
# → bot vanilla, tanpa custom

# 2. Install paket custom-mu
/path/to/meridian-zen-pack/install.sh .
# → install.sh kerja:
#   a. verifikasi target = meridian (cek index.js, package.json)
#   b. verifikasi versi upstream cocok (cek SHA vs manifest)
#   c. copy plugins/ → meridian/plugins/
#   d. copy views/ → meridian/views/
#   e. copy tools-extra/ → meridian/tools/
#   f. apply core-patches/*.patch (tempel kode ke 15-20 titik di core)
#   g. backup file core asli ke backups/ (buat uninstall)
#   h. syntax check (node --check) semua file
#   i. report: 50 plugins OK, 18 patches OK, 0 fail

# 3. Jalankan bot — SEMUA custom aktif
node index.js
# → /addprofil jalan, /export racikan jalan, paper-trading jalan,
#   telegram messages custom, briefings custom, views custom — semua!
```

## Cara kerja uninstall

```bash
/path/to/meridian-zen-pack/uninstall.sh .
# → uninstall.sh kerja:
#   a. restore file core dari backups/ (kembali vanilla)
#   b. hapus plugins/, views/, tools-extra/ yang di-copy installer
#   c. verify: git diff upstream/main harus kosong (vanilla)
#   d. hapus backups/
```

## Workflow update yunus (Fase 3, ongoing)

Tiap yunus rilis update:

```bash
cd /path/to/meridian
git fetch upstream
git merge upstream/main           # bot murni versi baru
./meridian-zen-pack/install.sh .  # pasang custom ulang
```

Kemungkinan hasil:
- **Ideal:** semua patch OK, custom aktif. Selesai.
- **Anchor drift:** yunus ubah string anchor di 1-2 titik → installer report FAIL, kamu fix 1 titik itu (bukan 27 file). Rilis paket versi baru.
- **Konflik fitur:** yunus tambah fitur mirip custom-mu → installer detect duplikat → kamu putuskan pakai yang mana.

## Kenapa dibagi 3 fase?

Karena 516 commit + 27 file core = pekerjaan besar. Kalau sekali jalan = riskan rusak behavior.

**Fase 0 — Cleanup (5 menit)**
Bersihin working tree dulu biar audit akurat. Hapus notes lama, stash perubahan belum kelar, hapus file backup nyangkut.

**Fase 1 — Infra (2-3 hari)**
Bangun pondasi: hook bus, loader, patcher engine, installer skeleton. Salin 46 file custom ke paket. Hasil: 20% custom aktif (envcrypt, pondasi). Mayoritas fitur belum aktif karena call site belum di-inject. Expected — ini pondasi.

**Fase 2 — Ekstrak core (1-2 minggu)**
Pelan-pelan pindah custom dari 27 file inti ke plugin. Urutan: dari file paling kecil perubahannya (logger +4 baris) ke terbesar (index.js +3947 baris). Tiap file = commit terpisah + test boot. Hasil: 100% custom jadi plugin, core yunus bersih.

**Fase 3 — Maintenance (ongoing)**
Dokumen workflow update. Tiap yunus rilis: pull → install → cek. Rilis paket baru kalau anchor drift.

## Risiko (jujur)

| Risiko | Seberapa parah | Mitigasi |
|---|---|---|
| Yunus ubah string anchor (kode tempel tidak ketemu) | Rendah, isolasi 1 titik | Installer detect + warning, fix 1 titik bukan 27 file |
| Plugin asumsikan signature lama, yunus ubah signature | Sedang | Test checklist per rilis, lock ke 1 SHA |
| Yunus tambah fitur sama dengan custom-mu | Rendah | Installer detect duplikat via manifest |
| Refactor rusak behavior | Sedang | Ekstrak per-file, commit terpisah, smoke test tiap step |
| Hook bus butuh merge juga | Rendah | Hanya 1 patch (hook-bus), sisanya plugin drop-in |

## Yang harus kamu lakukan dulu (Step 0)

Sebelum eksekusi Fase 1, bersihin working tree:

```bash
cd /home/ubuntu/meridianzen

# 1. Commit hapus notes lama (data dokumen, bukan kode — aman)
git add notes/ && git commit -m "chore: prune progress notes (audit prep)"

# 2. Stash perubahan kode belum kelar (simpan sementara, tidak hilang)
git stash push -m "wip-agent-config-ecosystem" -- agent.js config.js ecosystem.config.cjs

# 3. Hapus file backup nyangkut
rm ecosystem.config.cjs.bak

# 4. Verify bersih
git status --short
# → harus kosong. Kalau ada output, cek apa yang tersisa.
```

Setelah bersih, semua custom ter-commit di branch `experimental`. Audit akurat. Fase 1 bisa mulai.

## Yang dibutuhkan dari kamu

- Akun github untuk buat repo baru `zenzen-netizen/meridian-zen-pack`
- Node 18+ (verifikasi: `node --version`)
- Clone fresh yunus untuk test: `git clone https://github.com/yunus-0x/meridian /tmp/test-fresh`
- Disk space ~50MB (paket + backups)

## Pertanyaan FAQ

**Q: Kalau yunus hapus fitur yang jadi anchor patch-mu, gimana?**
A: Installer detect anchor tidak ketemu → warning → exit. Kamu update patch paket ke versi yunus baru. 1 titik fix, bukan 27 file konflik.

**Q: Bisakah paket ini dipakai orang lain yang juga fork yunus?**
A: Bisa, selama upstream SHA cocok. Itu nilai tambah: paket-mu bisa jadi "distribution" custom meridian.

**Q: Kalau saya tambah custom baru setelah paket jadi, gimana?**
A: Tulis file baru di `plugins/my-new-feature.js`, daftarkan handler via `bus.on(...)`, jalankan `install.sh` ulang. Auto terdeteksi.

**Q: Apakah uninstall benar-benar balik vanilla?**
A: Ya, selama backup intak. Uninstaller restore file core dari `backups/`, hapus plugins/views/tools-extra yang di-copy installer. Verify via `git diff upstream/main` harus kosong.

**Q: Kenapa lock ke 1 SHA, bukan support range versi upstream?**
A: Karena anchor-based patch butuh string presisi. Tiap upstream SHA = 1 set anchor tested. Range support = effort test tiap kombinasi. Mending lock 1 SHA, rilis paket baru kalau yunus update.

**Q: Fase 1 saja cukup gak?**
A: Tidak. Fase 1 = pondasi + 20% fitur. Mayoritas custom (paper-trading, telegram commands, views, briefings) baru aktif setelah Fase 2 selesai. Kalau berhenti di Fase 1 = bot jalan tapi banyak fitur custom off.

**Q: Bisa rollback kalau Fase 2 macet di tengah?**
A: Bisa. Tiap file diekstrak terpisah + commit terpisah. Kalau macet di file ke-10, `git revert` commit itu, 9 file sebelumnya tetap jalan.

## Pasangan dokumen

- `PLAN.md` — rencana teknis lengkap (architect, hook bus design, patcher engine, manifest format, eksekusi sequence detail)
- `TUTORIAL.md` — file ini, bahasa awam

## Status

- [x] Audit divergensi
- [x] Klasifikasi modul
- [x] Pilih strategi (D bertahap)
- [x] Tulis PLAN + TUTORIAL
- [ ] Step 0: cleanup working tree
- [ ] Fase 1: bangun infra (2-3 hari)
- [ ] Fase 2: ekstrak core (1-2 minggu)
- [ ] Fase 3: maintenance workflow
