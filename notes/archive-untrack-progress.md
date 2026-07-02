# LANDMINE FIX — untrack lessons-archive

**Tujuan:** `lessons-archive-pre-mainzen_v2.json` (146830 byte, 84 record pra-baseline mainzen_v2)
masih di-track git. Tiap sync v3 / clone baru bisa "resurrect" arsip ini → ranjau. Untrack
biar berhenti nyebar, TANPA ngubah `/report all` di MAIN (file tetap utuh di disk).

Branch: `experimental`. MAIN. Display-path only. JANGAN restart (owner).

---

## FASE 0 — GUARD getArchivedPerformance (file-hilang)

**Status: SUDAH AMAN — nol edit.**

`getArchivedPerformance()` (lessons.js:904-913) sudah double-guard:
```js
export function getArchivedPerformance() {
  try {
    if (!fs.existsSync(ARCHIVE_FILE)) return [];   // file hilang → [] (clone baru aman)
    const d = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf8"));
    return Array.isArray(d) ? d : (d.performance || []);
  } catch (e) {
    log("lessons_error", `archive read failed: ${e.message}`);
    return [];                                      // baca gagal → [] (fail-open)
  }
}
```
- `existsSync` cek → file HILANG (clone yg gak warisin arsip) tetap return `[]`, BUKAN crash ENOENT.
- try-catch nutup JSON rusak / IO error.
- Konsumen `getLifetimePerformance()` (lessons.js:920-923) spread `[...getArchivedPerformance(), ...live]`
  → arsip absen = cuma pakai `live`. `/report all` di clone tanpa arsip = tampil data live saja, aman.

Jadi FASE 0 tak perlu patch. Sudah fail-open sejak ditulis.

---

## FASE 1 — UNTRACK + GITIGNORE

- `git rm --cached lessons-archive-pre-mainzen_v2.json` → `rm 'lessons-archive-pre-mainzen_v2.json'`
  (UNTRACK dari index; file FISIK tetap di disk, isi penuh).
- `.gitignore`: tambah `lessons-archive-pre-mainzen_v2.json` di blok "Runtime state" (setelah `lessons.json`).

Efek: git berhenti bawa file ini. Sync v3 berikutnya gak resurrect (main tree udah gak punya) +
clone baru gak warisin arsip. Landmine mati permanen.

---

## FASE 2 — VERIFIKASI + COMMIT

Verifikasi (semua PASS):
- `git ls-files | grep -i lessons-archive` → KOSONG (exit 1, no match). Untracked ✓
- `ls -la lessons-archive-pre-mainzen_v2.json` → 146830 byte, masih ADA di disk ✓
- `node --check lessons.js` → OK (logika `/report all` tak diubah) ✓
- `git status`: ` M .gitignore` + `D  lessons-archive-...json` (deletion staged) ✓

Commit: lihat hash di bawah.

v3: TAK perlu disentuh. Arsipnya di sana udah kosong + main untracked = aman.
Owner: TIDAK ADA restart yang dibutuhkan (perubahan git-tracking + display-guard, bukan runtime).
