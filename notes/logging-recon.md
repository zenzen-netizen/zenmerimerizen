# LOGGING-RECON — sinyal konsentrasi/umur: tersedia (fetched-but-discarded) vs perlu fetch baru

> RECON BACA-SAJA. Nol edit/restart/commit. Branch `experimental`. Bukti = `file:line`.
> Ragu = UNKNOWN. Tanggal 2026-06-19.
> Pertanyaan: sinyal bundler%/top10%/botHolders%/umur-token (+ lain) yg dipakai keputusan tapi TAK
> kerekam ke trade record — udah ke-fetch (tinggal stamp) atau harus fetch baru?

---

## Q1 — APA YG SUDAH DI-FETCH saat screening ✅

Pipeline screening (`runScreeningCycle`, index.js) menarik per-kandidat:
- **`getTokenInfo({query:mint})`** (`index.js:790`) → `ti` (`index.js:796`). Sumber = Jupiter/DATAPI
  `assets/search` (`token.js:36-38`). Field yg ADA di `ti` (`token.js:44-66`):
  `mcap, holders, organic_score, organic_label, launchpad, graduated, global_fees_sol`,
  `audit:{ mint_disabled, freeze_disabled, top_holders_pct, bot_holders_pct, dev_migrations }`,
  `stats_1h:{ price_change, net_buyers, ... }`.
- **`sw`** (smart wallets), **`n`** (narrative), **`mem`** (pool memory) — juga per-kandidat.
- **umur token** = `pool.token_age_hours` (`screening.js:827-828`, dari `token_x.created_at`,
  di-enrich kalau null `screening.js:325`). Ditampilkan ke LLM di blok kandidat (`index.js:975`).

**DIPAKAI keputusan tapi TAK disimpan ke trade record:**
- `ti.audit.bot_holders_pct` → FILTER hard (drop pool, `index.js:818-824`) + ditampilkan
  (`index.js:907`). **Tidak di-stamp.**
- `ti.audit.top_holders_pct` → ditampilkan (`index.js:908`), dipakai veto lone-candidate
  (`index.js:1536-1545`). **Tidak di-stamp.**
- `pool.token_age_hours` → ditampilkan ke LLM (`index.js:975`), filter min/maxTokenAgeHours
  (`screening.js:175-181`). **Tidak di-stamp.**
- Bonus `ti` lain (organic_label, graduated, mint/freeze_disabled, dev_migrations,
  stats_1h.price_change/net_buyers) — ditarik, sebagian ditampilkan, **tak di-stamp.**

Yg SUDAH di-stamp ke record (`state.js:104-107` + staging): entry_mcap/tvl/volume/holders,
organic_score, fee_tvl_ratio, volume, mcap, holder_count, smart_wallets_present,
narrative_quality, volatility (lihat `PERFORMANCE_SIGNAL_FIELDS` `dlmm.js:1332`, `lessons.js:21`).

## Q2 — SUMBER DATA ✅

| Sinyal | Sumber | Call sudah jalan di screening? | Ada di `detail` deploy (pool-discovery)? |
|---|---|---|---|
| top10% (`top_holders_pct`) | Jupiter `getTokenInfo.audit` (`token.js:61`) | ✅ YA (`index.js:790`) | ❌ tidak (detail pool-discovery tak punya audit) |
| botHolders% (`bot_holders_pct`) | Jupiter `getTokenInfo.audit` (`token.js:62`) | ✅ YA | ❌ tidak |
| umur token (age_hours) | pool-discovery `token_x.created_at` (`screening.js:135/827`) | ✅ YA (`pool.token_age_hours`) | ✅ **YA** — `detail.token_x.created_at` (same API, `executor.js:92`) |
| **bundler%** (`common_funder`/`funded_same_window`/`top_10_real_holders_pct`) | `getTokenHolders` (`token.js:88-149`) | ❌ **TIDAK** (bukan di auto-pipeline; hanya kalau LLM panggil `get_token_holders`) | ❌ tidak |

Deploy path fetch hanya pool-discovery `detail` (`executor.js:92` `fetchFreshPoolDetail` → endpoint
`/pools`), **tanpa** Jupiter audit. Jadi top10/bot% TAK ada di scope deploy kecuali (a) lewat
staging dari screening, atau (b) fetch getTokenInfo baru.

## Q3 — TEMPAT STAMP (additive murni?) ✅

Tiga jalur ke `signal_snapshot` (semua additive, **TANPA** ubah logika `recordPerformance`):

1. **Staging** (`signal-tracker.js`): `stageSignals(pool.pool, {...})` (`index.js:991-1003`,
   saat ini di dalam `if (config.darwin?.enabled)` — **darwin AKTIF**: `darwinEnabled:true`).
   Di-retrieve di deploy `getAndClearStagedSignals` (`dlmm.js:973-975`) → masuk `signal_snapshot`
   via `resolvePerformanceSignalSnapshot` (`dlmm.js:1345-1361`). **`ti` & `pool.token_age_hours`
   ADA DI SCOPE persis di call-site `index.js:993`** → tinggal tambah key. ➜ paling murah.
2. **`PERFORMANCE_SIGNAL_FIELDS`** (`dlmm.js:1332` + `lessons.js:21`): array nama field; nambah
   nama = field ikut terbawa dari staged & dari `tracked[field]` ke snapshot (loop fallback
   `dlmm.js:1355-1358`, `lessons.js:115-118`). Pure additive (nambah string ke array).
3. **entryMarketData** (`executor.js:187-192`) → `Object.assign(args, …)` (`executor.js:877`) →
   `deployPosition` → `trackPosition`. ⚠️ tapi `makePositionRecord` (`state.js:60-107`) pakai
   **whitelist field** — field baru lewat sini KE-DROP kecuali ditambah ke makePositionRecord juga
   (3 titik sentuh). Jadi untuk field baru, jalur **staging (no.1) lebih bersih** drpd entryMarketData.

**Konfirmasi additive murni:** YA. Nambah key ke objek staged + nambah string ke
PERFORMANCE_SIGNAL_FIELDS = nol perubahan logika recordPerformance. recordPerformance cuma
nge-spread `signal_snapshot` apa adanya.

## Q4 — KLASIFIKASI per field

| Field | Status | Alasan |
|---|---|---|
| **umur token** (`entry_age_hours`) | ✅ TERSEDIA (murah) | `pool.token_age_hours` di scope `index.js:993` (atau `detail.token_x.created_at` di deploy). Nol call baru. |
| **top10%** (`entry_top10_pct`) | ✅ TERSEDIA (murah) | `ti.audit.top_holders_pct` di scope `index.js:993`. getTokenInfo SUDAH dipanggil (`index.js:790`) — fetched-but-discarded. |
| **botHolders%** (`entry_bot_pct`) | ✅ TERSEDIA (murah) | `ti.audit.bot_holders_pct` di scope `index.js:993`. Idem. |
| bonus: organic_label, graduated, mint/freeze_disabled, dev_migrations, stats_1h.price_change/net_buyers | ✅ TERSEDIA (murah) | semua di `ti` (`token.js:44-72`), di scope `index.js:993`. Free stamp. |
| **bundler%** (common_funder/funded_same_window/top_10_real_holders) | 🟡 PERLU FETCH (berat) | hanya dari `getTokenHolders` (`token.js:88-149`): fetch 100 holders + assets/search + per-holder `pnl-positions` (N call). TIDAK di auto-pipeline. Mahal/lambat per-deploy. Tambahan: `maxBundlePct` key semi-mati ([[project-config-audit-2026-06-13]]) → sinyal ini gak di-enforce skrg. **Rekomendasi: skip**, pakai top10% sbg proxy konsentrasi. |

## RENCANA STAMP (kalau di-build nanti — DI LUAR lingkup recon)
Minimal, additive, ~2 edit kecil:
1. `index.js:993` (objek stageSignals) — tambah:
   `entry_top10_pct: ti?.audit?.top_holders_pct ?? null`,
   `entry_bot_pct: ti?.audit?.bot_holders_pct ?? null`,
   `entry_age_hours: pool.token_age_hours ?? null` (+ bonus ti fields kalau mau).
2. `dlmm.js:1332` & `lessons.js:21` (`PERFORMANCE_SIGNAL_FIELDS`) — tambah nama-nama field itu.
- (Opsi robust) keluarin staging dari `if (config.darwin?.enabled)` biar nge-stamp walau darwin off,
  pakai pola shadow-logging yg "selalu rekam" (`index.js:887-898`). Darwin skrg ON jadi tak wajib.
- Ongkos: **nol call baru** (data sudah ditarik). Bundler% (🟡) di-skip.
- Caveat: staging cuma cover jalur SCREENER→deploy (key per-pool, TTL 10m, `signal-tracker.js`).
  Deploy manual via chat tak lewat stageSignals → tak ter-stamp (sama batasan Darwin sekarang).
  Umur via `detail.token_x.created_at` bisa null di sebagian pool (perlu enrich) = UNKNOWN coverage;
  via `pool.token_age_hours` (staging) lebih andal karena sudah di-enrich (`screening.js:325`).

---

## ⭐ VERDICT
**MURAH (stamp-doang) untuk field bernilai-tinggi.** top10%, botHolders%, dan umur-token semuanya
**sudah di-fetch saat screening tapi dibuang** — tinggal di-stamp lewat staging yg infrastruktur-nya
SUDAH ADA & AKTIF (darwin ON). Nol call baru, nol ubah recordPerformance, ~2 edit additive.
**Hanya `bundler%` yang 🟡 perlu fetch baru** (getTokenHolders berat + sinyal-nya semi-mati) →
rekomendasi skip / pakai top10% sebagai proxy konsentrasi.

STOP — lapor, tunggu go untuk build.

### Index bukti
- candidate fetch: `index.js:784-796` (getTokenInfo `:790`, ti `:796`) · stageSignals `index.js:991-1003`
- getTokenInfo+audit: `token.js:36`, `:61-62` · getTokenHolders (bundler, berat): `token.js:88-149`
- umur: `screening.js:135`, `:827-828`, enrich `:325` · ditampilkan `index.js:975`
- filter pakai-tak-stamp: bot `index.js:818-824`, top10 lone-veto `index.js:1536-1545`
- deploy detail fetch: `executor.js:92`, validate `:105`, entryMarketData `:187-192`, assign `:877`
- snapshot: stage-retrieve `dlmm.js:973-975`, resolve `dlmm.js:1345-1361`, fields `dlmm.js:1332`/`lessons.js:21`
- record whitelist: `state.js:60-107` · darwinEnabled: true
