# Dual-side FASE 1 — Progress

Tujuan: nambah 4 knob config baru (dualSideEnabled, dualSideTokenPct, dualSideUpsidePct,
dualSideStrategy) di blok `strategy` config.js. Semua default OFF/netral. Nol logika
deploy/close/dlmm.js disentuh. Perilaku bot HARUS byte-identical selama knob OFF.
Fase deploy (pakai knob ini) menyusul terpisah.

## Checklist

- [x] 1. Verifikasi branch=experimental + node --check baseline
- [x] 2. Tambah 4 knob di config.js (blok strategy)
- [x] 3. node --check config.js (harus lolos)
- [x] 4. Verifikasi knob kebaca (print via node)
- [x] 5. git diff --stat + commit (nunggu owner smoke-test)

## Catatan

- Branch: experimental, working tree bersih sebelum mulai, baseline node --check lolos.
- Knob ditambah tepat setelah `defaultBinsBelow: strategyDefaultBinsBelow,` di blok
  `strategy: {` — tidak ada baris lain yang dihapus/diubah.
- Default: dualSideEnabled=false, dualSideTokenPct=0.10, dualSideUpsidePct=15,
  dualSideStrategy="bid_ask". Gerbang utama (dualSideEnabled) default false → OFF berarti
  bot tetap single-side SOL seperti biasa, nol perubahan perilaku.
- NOL sentuh tools/dlmm.js atau logika deploy/close lain — cuma config.js + file progress ini.
- Restart bot = tanggung jawab owner, bukan Claude Code.

Status: ✅ Fase 1 selesai, knob OFF, node --check lolos, siap owner restart+smoke-test.
