# Dual-side FASE 2 — Progress (ULANG, versi aman — 2026-07-03)

Catatan: percobaan pertama (di bawah, INSIDEN) di-revert bersih — dikonfirmasi
`git status`/`git diff --stat` kosong sebelum mulai ulang. tools/dlmm.js awal
sesi ini identik commit 83d453f (state OLD, pre-transform).

[x] 1. Verifikasi branch (experimental) + node --check baseline
[x] 2. Sisipkan transform + gate 2 guard (1 str-replace)
[x] 3. node --check dlmm.js — SYNTAX OK
[x] 4. Verifikasi MATEMATIKA bins (skrip murni, NOL deploy) — binStep 50→28, 100→14, 125→11 bins_above @upside 15% (sesuai harapan, magnitude wajar)
[ ] 5. git diff --stat + commit

Aturan sesi ini: DILARANG panggil deployPosition/getMyPositions/apa pun yg
nyentuh wallet/network — verifikasi CUMA lewat hitung bins terpisah (pelajaran
dari insiden di bawah).

---

## (ARSIP) Percobaan pertama — DITAHAN lalu di-revert
[x] 1. Verifikasi branch + node --check baseline
[x] 2. Sisipkan blok transform dual-side + gate 2 guard (1 str-replace)
[x] 3. node --check dlmm.js
[!] 4. Dry-run test — INSIDEN: DRY_RUN ketimpa live .env (envcrypt override:true), REAL deploy 0.05 SOL kejadian tanpa sengaja. Transform juga TERBUKTI gak nyampe on-chain (lihat catatan di bawah). BELUM diverifikasi bersih.
[ ] 5. git diff --stat + commit — DITAHAN, nunggu keputusan owner soal posisi real yg kebuka + fix gap kode

## INSIDEN 2026-07-02T21:59Z — REAL deploy tak disengaja
Skrip tes awal (`node -e "process.env.DRY_RUN='true'; import('./config.js')..."`)
gagal duluan: `WALLET_PRIVATE_KEY not set` (env belum diload). Saya tambah
`import('./envcrypt.js')` di depan untuk load env — TAPI `envcrypt.js:123`
manggil `loadEnv()` yang jalanin `dotenv.config({ override: true })`, yang
NIMPA `process.env.DRY_RUN='true'` yang saya set duluan dengan nilai asli dari
`.env` file (bukan "true" di live). Akibatnya kode LOLOS dari guard DRY_RUN
(dlmm.js:794) dan jalan ke path LIVE beneran.

Hasil: 1 tx REAL terkirim, 0.05 SOL dipakai deploy ke pool
`CzfvGS7QmKsHdfoCQFZ7p3vUxzMAyaknipu3JjJncSXH` (yep-SOL). Posisi baru:
`5GXxE7A4WHT5pAEDHcYepSmbta14Mh4RagYfGP2f4ApU`. Tx sig:
`4FAJjWKqcDWsQ9XmCwmCidt7KiQYW7qit79HcP18UR3foseSZEM7PUrjszKkQnnCjD2wf6kJ1QmnDqdSKTXFzjzu`.
Sekarang ke-track di state.json (2 posisi open, tadinya 1).

## Temuan kedua — transform TIDAK nyampe on-chain
Blok yang saya sisipkan (OLD/NEW dari instruksi) menghitung `activeBinsAbove`
dengan benar (jadi 15 di kasus ini). TAPI kode konstruksi range asli di
dlmm.js:895 —
`const maxBinId = isSingleSidedSol ? activeBin.binId : activeBin.binId + activeBinsAbove;`
— masih cuma cek `isSingleSidedSol` (BUKAN `dualSide`), jadi tetap collapse ke
`maxBinId = activeBin.binId` walau dualSide true. Posisi real yang ke-deploy
di atas TERBUKTI single-side biasa (bin_range max == active bin, tanpa upper
range) meskipun `bins_above: 15` sempat ke-track di metadata (trackPosition
pakai variable `activeBinsAbove`, bukan `maxBinId` on-chain asli — jadi
metadata-nya juga menyesatkan). Ada minimal 1 gate lain (line ~784, jalur
paper-trading) dengan pola sama yang belum disentuh sama sekali.

Kesimpulan: instruksi asli cuma minta buka "2 guard" di satu blok OLD/NEW —
itu sudah dieksekusi persis sesuai instruksi. Tapi verifikasi dry-run (yang
juga diminta) membuktikan itu BELUM cukup untuk transform beneran nyampe ke
on-chain range. Ini scope gap di luar 1 str-replace yang diinstruksikan —
STOP, lapor ke owner, JANGAN nebak/perluas sendiri.
