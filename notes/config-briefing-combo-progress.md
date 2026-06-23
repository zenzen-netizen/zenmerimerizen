# CONFIG TREE + BRIEFING SCOPE — PROGRESS

Bot: MAIN (pm2 id 0 = meridian, /home/ubuntu/meridianzen, branch experimental, LOCAL = sumber kebenaran)
Workstream 🅴 — layer presentasi modular. Display-only, scoping-inti NOL ubah.

- [x] 1  /config: baris key sub-cluster → tree ├/└ (parity 166)
- [ ] 2  recon scope briefing (daily + periodik) — seksi + scope + lokasi analisis-dalam
- [ ] 3  /briefing → Opsi B (all-time=stats; racikan-aktif=stats+analisis-dalam; disclosure)
- [ ] 4  /briefing alltime → command BARU Opsi A (all-time JUGA dapat analisis-dalam)

## Catatan/limit-recovery

### FASE 1 ✅ (commit pending di bawah)
- Perubahan SUDAH ada di working tree (revisi kecil yang pending dari sesi lalu) di
  `renderSubclusterRows` (views/config.js:126-175).
- Jalur `marked=true` (view FUNGSI / default `/config`): induk (non-L4) kini pakai tree
  `├` (semua) / `└` (induk TERAKHIR di sub-cluster). Anak `↳` (L4) indent di bawah induk,
  marker ⚙️/🧩 tetap, TIDAK ikut hitungan ├/└ (anak hang di bawah induknya). Header
  sub-cluster (emoji+label) tetap. Divider ┈ dibatasi ke gaya lama (origin).
- Jalur `marked=false` (view ORIGIN / `/config origin`): SENGAJA tetap gaya lama (indent
  4-spasi, ↳ 6-spasi, divider ┈) — origin nesting 4-lapis pakai ┈+indent dalam, jadi tree
  dibatasi ke function-view biar nesting origin tak terganggu (brief membolehkan ini).
- PARITY (bukti `/tmp/parity-config.mjs`): KEY_ORIGIN=166.
  - function: 166 key-line, 152 `├/└` + 14 `↳` = 166, 0 orphan.
  - origin:   166 key-line, 14 `↳` (6-spasi), 0 orphan.
  - L4_CHILDREN=14 utuh. ORIGIN_NOTES inline via `note(k)` di kedua jalur.
- `node --check views/config.js` → OK.
