# TUTORIAL OPERASIONAL — Audit Mendalam Meridian

> Pendamping: `notes/PLAN-audit-meridian.md` (33 fase + kedalaman + template).
> Untuk: pemilik repo non-programmer. Step-by-step dari terminal → opencode → selesai 34 fase.

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Buku panduan mesin jahit tua + buku petugas*: mesin jahit 100-tahun dipakai tanpa buku panduan = pemilik tak tahu kenapa benang putus, kenapa jahitan miring. Saat waris, pemilik baru = non-mekanik. Buku petugas = step-by-step: (a) cara nyalakan mesin (terminal + opencode), (b) mode hemat-benang opsional (caveman), (c) pola jahitan standar (`mulai audit F<N>`), (d) kalau benang putus tengah jalan (`lanjut audit F<N>` resume from "## Progress"), (e) cek berapa pola selesai (`ringkasan progress audit`), (f) mesin diktirMessageType (subagent helper). Konsep sama: opencode = mesin, audit Meridian = pola, PLAN = blueprint mesin (di file PAN), TUTORIAL ini = buku petugas mesin.
- *GPS mobil rental di kota baru*: turis turun bandara, rental mobil, GPS bicara: "belok kiri 200m, lurus 1.2km, sampai tujuan". GPS tak menerangkan jalan raya dibangun tahun kapan (itu PLAN). GPS cuma: "buka opencode → ketik `caveman full` → ketik `mulai audit F0` → tunggu". Bila GPS mati tengah jalan, turis buka HISTORY trip (`## Progress` di note fase) → resume dari last-waypoint. Konsep sama: tiap perintah di sini = step kecil yang bisa dilakukan tanpa paham internals bot. Internal detail di note fase (`audit-F<N>-*.md`).

**Di bot, ini = buku petugas operasional audit dari terminal** (1-2 kalimat)
File ini BUKAN note fase. = cheat-sheet terminal: cara buka opencode, aktifkan caveman mode, mulai/resume fase, cek progress, subagent, toggle mode, stop. Pemilik non-programmer lakukan stepALA step dari §6.1 ke §6.11, tak perlu paham kode. Note fase (`notes/awam/audit-F<N>-*.md`) hasil tulis agent; pemilik baca setelah fase selesai.

**Posisi file ini di alur audit** (1 paragraf)
TUTORIAL = langkah #1 saat sudah di depan terminal (PLAN = baca sebelum/at waktu mule). Untuk pemilik non-programmer tak bisa lompat `opencode`+`mulai audit F0` — perlu setup, perlu tau caveman opsional, perlu tau interpretasi output 5 baris + Open-Q di akhir sesi. TUTORIAL lindungi semua titik itu. PLAN (lihat file segaris) = MENGAPA 33 fase + struktur; TUTORIAL = BAGAIMANA eksekusi.

**Langkah kerja pembaca** (5 nomor, pakai istilah teknis)
1. **§6.1 Setup sekali**: buka terminal → `cd /home/ubuntu/meridianzen` → `opencode`. (Opsional) `caveman full` utk hemat ~40-50% token.
2. **§6.2 Mulai F<N>**: ketik `mulai audit F<N>` (mis F0). Agent baca PLAN + note fase sebelumnya + file kunci codebase → tulis `notes/awam/audit-F<N>-*.md` incremental (Progress + Ringkasan + §0 + §A-§H).
3. **§6.3 Sesi putus/kena limit**: jangan panik; note ditulis incremental. Resume sesi baru: `cd ... && opencode` → ketik `lanjut audit F<N>` (baca Progress terakhir) atau `resume audit dari note F<N-1>` (kalau note F<N> kosong).
4. **§6.5 Tracking**: ketik `ringkasan progress audit` → agent baca semua note + PLAN → summary (done/progress/belum). Bingung urutan: `fase berikutnya audit apa?`.
5. **§6.7 Stop/pause permanen**: stop kapan saja — semua progress tersimpan di `notes/awam/audit-F*.md`. Buka kapan saja dengan `lanjut audit F<N>`.

**Output pemakaian TUTORIAL**: pemilik non-programmer mulai + resume + tracking audit Meridian tanpa perlu paham atau nulis kode. 34 note fase akhirnya = peta bot end-to-end (lihat PLAN BAGIAN 5 hasil akhir).

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
TUTORIAL statis — tak ada kode yang bisa rusak. Skip §6.1 = pemilik stuck di shell prompt tanpa opencode. Skip §6.3 = tenggelam bila kena limit (panik). Skip §6.5 = tak tau progress global (pemilik mustafa manual count note). `caveman full` skip = hemat tak aktif → output agent panjang (~40% lebih boros token) → kena limit lebih cepat di fase ⬛⬛.

**Istilah yang muncul di file ini** (bullet, cuma yang baru)
- **opencode** — CLI tool AI utk software engineering. Prompt → agent lakukan tugas.
- **caveman mode** — mode hemat token (agent balas pendek ~40-50%). Code/commit/security tetap normal English.
- **fase F<N>** — unit audit (1 sesi 30-90menit, output 1 note teknis + §0 awam). Nomor F = ID permanen cross-ref.
- **partial-resumable** — resume dari "## Progress" nota fase. Tak ulang dari awal.
- **subagent** — delegasi pencarian kode ke `cavecrew-investigator`/`explore` (compressed output ~60% hemat context). Main agent tetap Write note.
- **incremental save** — note fase ditulis per bagian; bila kena limit tengah sesi, bagian Yang sudah diketik aman disimpan.
- **cheat-sheet** — §6.8 table command. Print + tempel dekat monitor saat audit.

*Lewati §0 kalau sudah paham. Isi teknis mulai §6.1.*

---

## 6.1 — SETUP SEKALI

1. Buka terminal server:
```bash
cd /home/ubuntu/meridianzen
```

2. Jalankan opencode:
```bash
opencode
```

3. (Opsional, hemat ~40-50% token) Aktifkan caveman mode. Ketik di prompt opencode:
```
caveman full
```
Atau level lain: `lite` / `ultra` / `wenyan-full`. Stop: `normal mode` atau `stop caveman`.

Konfirmasi muncul: "Caveman mode ON. Full level. Ready."

Caveman = komunikasi agent jadi pendek. **Code, commit, security warning tetap normal English** (aturan skill) — jadi aman.

---

## 6.2 — MULAI FASE F<N>

Perintah standar:
```
mulai audit F<N>
```

Contoh: `mulai audit F0`. Agent akan kerjakan:

1. Baca `notes/PLAN-audit-meridian.md` untuk scope fase + kedalaman.
2. Baca `notes/audit-F<N-1>-*.md` (fase sebelumnya) buat cross-ref.
3. Baca file kunci fase (mis index.js baris 1046-1191 untuk F1).
4. Tulis `notes/audit-F<N>-<nama>.md` — **incremental**:
   - Outline + header ditulis dulu (bagian Progress + Ringkasan).
   - Tiap bagian (§A-§H) ditulis dan disimpan satu-satu supaya kena limit tetap aman.
5. Output ke chat: ringkasan 5 baris + Open-Q dari fase.

Tiap fase = 1 sesi (~30-90 menit, tergantung kedalaman).

---

## 6.3 — KENA LIMIT / SESI PUTUS TENGAH FASE

**Jangan panik.** Note fase ditulis incremental sebelum limit habis (lihat bagian "## Progress" di note).

Resume sesi baru:
```
cd /home/ubuntu/meridianzen && opencode
```
Ketik:
```
lanjut audit F<N>
```

Agent akan:
1. Baca `notes/audit-F<N>-*.md` → lihat "## Progress" terakhir (yang sudah `[x]`).
2. Lanjut dari bagian yang belum selesai `[ ]`.

Kalau note fase belum ada / kosong / hilang:
```
resume audit dari note F<N-1>
```
Agent baca note fase sebelumnya + outline F<N> dari plan + lanjut tulis.

---

## 6.4 — SUBAGENT / DELEGASI (untuk fase ⬛⬛)

Fase deep (⬛⬛ / ⬛) kadang banyak cari kode. Minta subagent compressed:
```
untuk fase ini pakai subagent compressed
```

Pilihan subagent (output caveman-compressed ~60% hemat context):
- `cavecrew-investigator` — locate code (cari X defined di mana, Y dipanggil di mana, list use Z).
- `explore` — fast code search medium-thoroughness.

Main agent (yang bisa Write) tetap kerja tulis note. Subagent cuma bantu cari bukti `file:line`.

Aturan delegasi:
- ✅ Delegate: "cari semua pemanggil `recordPerformance`, return file:line + konteks".
- ❌ Jangan delegate: tulis note fase (hanya main agent yang Write).

---

## 6.5 — TRACKING PROGRES

Cek status global kapan saja:
```
ringkasan progress audit
```

Agent baca semua `notes/audit-F*.md` + INDEX → summary: fase done / progress / belum mulai.

Setelah 33 fase selesai, agent generate `notes/audit-INDEX.md`:
- Daftar semua fase + cross-link.
- Ringkasan temuan global (bug, gap, kontrak kunci lintas-fase).
- Glosarium master semua istilah.
- Diagram alur master hulu→hilir 1 trade.

Bingung fase berikutnya:
```
fase berikutnya audit apa?
```
Agent baca plan + status progress → jawab.

---

## 6.6 — TOGGLE MODE

Mid-sesi hemat lebih kuat:
```
caveman ultra
```

Balik normal:
```
normal mode
```
atau
```
stop caveman
```

Aturan skill caveman: **code, commit, security warning, user confused → normal English otomatis**. Resume caveman setelah situasi selesai.

Cek real token savings sesi ini:
```
/caveman-stats
```

---

## 6.7 — STOP / PAUSE PERMANEN

Stop kapan saja — semua progress tersimpan di `notes/audit-F*.md`.

Buka kapan saja:
```bash
cd /home/ubuntu/meridianzen && opencode
```
Ketik:
```
lanjut audit F<N>
```
(baca `notes/audit-F<N>-*.md` → resume dari "## Progress").

---

## 6.8 — CHEAT-SHEET COMMAND

| Perintah | Aksi |
|----------|------|
| `mulai audit F<N>` | Mulai fase baru |
| `lanjut audit F<N>` | Resume fase tengah-putus |
| `resume audit dari note F<N-1>` | Resume kalau note F<N> hilang |
| `fase berikutnya audit apa?` | Tanya urutan |
| `ringkasan progress audit` | Status global semua fase |
| `untuk fase ini pakai subagent compressed` | Minta delegasi cavecrew-investigator/explore |
| `caveman full` / `lite` / `ultra` | Toggle hemat |
| `normal mode` / `stop caveman` | Balik normal |
| `/caveman-stats` | Cek real token savings |

---

## 6.9 — URUTAN EKSEKUSI (GELOMBANG)

Ikuti urutan gelombang di `notes/PLAN-audit-meridian.md` Bagian 3:

1. **Pondasi atas** F0 → F6 (paham arsitektur + otak AI + SOP)
2. **Safety + post-close** F7 → F8 (gerbang + full-sync surface)
3. **On-chain** F9 → F13 (deploy/close/positions/paper)
4. **Screening** F14 → F16 (Meteora + indicator + GMGN)
5. **State** F17 → F18 (registry + exit mekanis jantung risk)
6. **Learning** F19 → F23 (capture/evolve/Darwin/profile/memory)
7. **Analytics** F24 → F25 (stats + briefing + trackers)
8. **Config** F26 → F29 (core/experiments/update-config/preset-paths)
9. **Telegram** F30 → F31 (perintah + UI)
10. **Edge** F32 → F33 (paper full + hivemind/leaf)
11. **Index** F34 (ringkasan global + glosarium)

---

## 6.10 — KONEKSI KE PLANNING NOTE

Setiap kali bingung scope / kedalaman / cross-ref:
- Buka `notes/PLAN-audit-meridian.md` Bagian 3 (tabel 33 fase).
- Lihat baris F<N>: nama, file kunci, kedalaman, output note → tahu harus baca apa.

Setiap kali bingung cara mulai / resume:
- Buka file ini (TUTORIAL) di bagian relevan.

---

## 6.11 — NORMAL ENGLISH ZONE (auto-clarity)

Skill caveman auto-drop ke normal English kalau:
- Security warning (mis: ada operasi write/run bisa bahaya).
- Irreversible action (commit, push, mutasi data).
- User confused / explicit clarification.

Setelah zona selesai, caveman auto-resume. Tak perlu konfirmasi.

---

*File ini = tutorial operasional. Kode/config tak diubah saat menyusun.*