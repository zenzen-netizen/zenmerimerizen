# R-output — Progress (lapisan TAMPILAN, RENDER-ONLY)

> Branch `experimental`. RENDER-ONLY: nol perubahan logika trade/screening/exit/config/CONFIG_MAP.
> Acuan: `notes/output-racikan-audit.md`. Mulai 2026-06-15.
> Data live saat mulai: lessons.json `performance[]` = **66 record (semua mainzen_v2, paper=0)**;
> arsip `lessons-archive-pre-mainzen_v2.json` = **84 record** (pra-baseline, active_setup=null).
> `getModePerformance()` SUDAH ter-scope racikan aktif (mainzen_v2) → `/report` default = 66.

## Status fase
- ✅ FASE 1 — /report + briefing: metrik quant + tingkatan report + recs pinter
- ✅ FASE 2 — Info posisi + SALDO TERTAHAN + range-efficiency
- ✅ FASE 3 — Report per-racikan + wallet-tracker start-date
- ✅ FASE 4 — Polish notif
- ✅ RECON range-tracking (lapor saja)

## Catatan implementasi
- FASE 1: formatQuantBlock (reports.js) baru — RR, break-even WR, EV-R, cost-drag, sample-flag,
  recovery_needed. expectancy_pct + worst-trade$ + net-excl-worst di formatStatsBlock.
  Tiering /report: default=aktif (getModePerformance), `all`=lifetime (live+arsip), `<nama>`=racikan spesifik.
  Recs: gate anti-naif (winnersDipDeep → jangan perketat stopLoss; give-back→trailingTrigger; tail rug→screening).
  formatMovement (give-back + MAE) TERNYATA sudah dipanggil buildTradeReport → sudah tampil di /report.
  Commit: `21978a4` FASE 1.
- FASE 2: rent per-posisi (baca lamport akun posisi via getConnection, real; fallback estimasi 0.057),
  range-eff/in-range%/bins-past-edge di /pool & /positions, total tertahan + SOL bebas efektif di /wallet.
  Commit: `02775c8` FASE 2.
- FASE 3: report per-racikan PENUH (`/report setups` daftar; `/report <nama>` blok stats penuh);
  wallet SOL-tracker start-date (`/wallet trackstart [tgl]`) — RENDER/setelan tracker, bukan config trade.
  Commit: `2db86b1` FASE 3.
- FASE 4: notifDeploy/Close/Swap/OOR konsisten (header ───), notifClose tampil give-back (peak→exit).
  Commit: `2db86b1` (FASE 3+4 digabung 1 commit per topik notif terpisah → lihat git log).

## RECON range-tracking (lapor saja — JANGAN implementasi)

Pertanyaan: di lapisan pencatatan (close → lessons/state), field OOR apa yang UDAH kecatat vs BELUM?

### Yang SUDAH tercatat
- `out_of_range_since` (state.js:110, di-set saat OOR di state.js:527 / :203) — **satu timestamp spell OOR
  yang sedang berjalan saja**. Di-**reset ke null** setiap balik in-range (state.js:531-535 / :217).
- `minutesOutOfRange()` (state.js:227-232) — menit sejak `out_of_range_since` SEKARANG. Dipakai saat close
  (dlmm.js:1458/1537/2084/2334) → `minutes_in_range = minutesHeld − minutesOOR` (dlmm.js:1466/2160/2454)
  → `range_efficiency = minutes_in_range / minutes_held × 100` (lessons.js:170-171, dibulatkan :195).
- `price_peak_pct` / `price_trough_pct` (state.js:123-124, di-update :505-517) — excursion harga MENTAH vs
  entry dari gerak bin (`(1+binStep/1e4)^(binNow−binEntry)−1`). Menangkap **kedalaman % harga** di atas/bawah
  entry (dipakai MAE di reports.js), tapi **bukan** relatif ke tepi range.
- Live (belum dicatat ke record, tapi tersedia di getMyPositions): `lower_bin`, `upper_bin`, `active_bin`,
  `in_range` (boolean), `minutes_out_of_range`. Dari sini bisa diturunkan bins-past-edge live.

### Yang BELUM tercatat (gap untuk item lanjutan)
1. **Arah OOR (bawah vs atas) — TIDAK dipisah.** `in_range` cuma boolean; `out_of_range_since` tak simpan sisi.
   `price_trough/peak_pct` menyiratkan arah harga tapi tak diikat ke event keluar-range.
2. **Durasi per arah — TIDAK ada.** Hanya satu `out_of_range_since` bergulir yang di-null-kan tiap re-entry;
   tak ada akumulator menit-OOR-bawah vs menit-OOR-atas.
3. **Kedalaman tembus (berapa bin / % melewati tepi range) — TIDAK dicatat.** Live bisa dihitung
   (`active_bin − upper_bin` atau `lower_bin − active_bin`), tapi tak pernah dipersist ke record close.
   `price_peak/trough_pct` = excursion vs ENTRY, bukan vs tepi range.
4. **Jumlah event OOR (berapa kali keluar-masuk) — TIDAK dihitung.** Re-entry hanya null-kan timestamp;
   tak ada counter round-trip.
5. **⚠️ BIAS `range_efficiency`:** karena `minutesOOR` = spell OOR TERAKHIR saja (bukan kumulatif),
   posisi yang bolak-balik OOR lalu balik in-range saat close tercatat `minutesOOR=0` → `range_efficiency`
   bisa **dilaporkan 100% padahal pernah OOR berkali-kali**. range_efficiency cenderung **over-state**
   in-range untuk posisi yang OOR multi-spell. (Konsekuensi display; perbaikan = akumulasi OOR di state =
   di luar lingkup R-output.)

### Implikasi untuk item lanjutan
- Untuk "directional OOR analytics" perlu menambah di state.js: counter `oor_events`, akumulator
  `oor_minutes_below` / `oor_minutes_above`, dan kedalaman tembus max (`max_bins_past_edge` per sisi),
  lalu teruskan ke `recordPerformance`. Itu = perubahan lapisan pencatatan (BUKAN render) → fase terpisah.
</content>
</invoke>
