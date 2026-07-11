# Audit F0 — Peta + Temuan Audit Lama + Glosarium
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: sedang — alasan: fase pondasi, cuma rangkum peta 6-lapisan + 2 audit lama + glosarium. Tak baca kode baru.
> Cross-ref: F1 (cron), F2 (cycles), F34 (INDEX).
> Sumber baca: `notes/peta-proyek.md`, `notes/roadmap.md`, `notes/onboarding-dossier.md`, `notes/audit-progress.md`, `notes/output-racikan-audit.md`, `CLAUDE.md`.

## Ringkasan eksekutif
1. Meridian = bot LP (penyedia likuiditas) otomatis di kolam Meteora Solana. Cron 2 siklus (manajemen 10m, screening 30m) + PnL poll 3s.
2. Otak hibrida: hard-rule mekanis NO-AI (SL/TP/OOR/low-yield di kode) + LLM (pilih kolam + eksekusi aksi yang sudah diputus mekanis).
3. 3 peran AI: SCREENER (cari+deploy), MANAGER (jaga+close), GENERAL (chat+manual). Tool gating `agent.js:6-8`.
4. 6 lapisan arsitektur: Tampilan / Kontrol / Mesin / Belajar / Data / Koneksi.
5. Audit lama sudah temukan bug + kontrak kunci: rent posisi tak dicadangkan, loop evolve campur 84 record lama, paper trading OFF + bug satuan, Discord listener OFF, racikan = snapshot sekali-muat.

## Progress
- [x] Header + ringkasan (2026-07-06)
- [x] §A Peta 6 lapisan
- [x] §B Alur 1 trade hulu→hilir
- [x] §C 3 peran AI
- [x] §D Temuan audit lama (ringkas)
- [x] §E Kontrak kunci
- [x] §F Glosarium istilah
- [x] §G Open-Q lintas-fase
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Denah rumah 6 ruangan*: sebelum masuk rumah, lihat denah dulu — mana kamar, dapur, ruang tamu, gudang. Tiap ruangan punya peran, pintunya saling nyambung. Meridian = rumah 6 lapisan (Tampilan, Kontrol, Mesin, Belajar, Data, Koneksi). Tiap lapisan punya file sendiri. Kita lewat pintu dari ruang ke ruang.
- *Pabrik 3 shift*: bahan baku (pool kandidat) masuk → diolah (screening → deploy → jaga → close) → jadi produk (fee / pengalaman) → disimpan ke arsip (`lessons.json`, `pool-memory.json`). Pabrik jalan 24 jam karena ada alarm tiap 3 detik / 10 menit / 30 menit yang bangunin shift berikutnya.

**Di bot, ini = peta + alur 1 trade**: cron → `runManagementCycle` → `runScreeningCycle` → deploy → poll PnL 3s → close → `recordPerformance` → `evolveThresholds` → Darwin → prompt berubah → cycle.

**Posisi fase ini di alur bot**
F0 = fase pertama, **BUKAN bagian dari alur eksekusi**. F0 = denah. Tidak dijalan tiap detik; dipakai jadi rujukan sebelum masuk F1–F33 (yang tiap fase bedah satu ruangan). Tanpa F0, audit fase lain lupa di mana pintu masuk / keluar ruangan itu. Semua §0 fase lain boleh cross-ref balik sini kalau sebut "lapisan" / "alur".

**Langkah kerja F0** (baca-dokumen + rangkum, bukan eksekusi bot)
1. Sumber baca: `peta-proyek.md`, `roadmap.md`, `audit-progress.md` (audit lama), `onboarding-dossier.md`, `output-racikan-audit.md`, `CLAUDE.md`.
2. Susun peta 6 lapisan + file inti tiap lapisan → §A.
3. Susun alur 1 trade dari hulu (cron) ke hilir (close → learn → evolve → Darwin → prompt berubah) → §B (ASCII diagram).
4. Ringkas 3 peran AI (SCREENER/MANAGER/GENERAL) + tool yang boleh dipakai tiap peran → §C.
5. Ringkas temuan audit lama: rent bug, evolve campur 84 record lama, paper OFF + bug satuan, Discord OFF → §D.
6. Susun kontrak kunci lintas-fase: hard-rule NO-AI, paper/live isolation, full-sync 6-surface, racikan = snapshot, race guard, fail-open experiment → §E.
7. Bangun glosarium istilah proyek → §F (pembaca balik sini pas bingung istilah di fase lain).
8. Tandai cross-ref awal + open-Q lintas-fase → §G, §H (pemicu pertanyaan untuk fase berikutnya).

**Output F0**: denah bot utuh (6 lapisan + alur 1 trade + 3 peran + kontrak + glosarium) yang fase F1+ lihat tiap butuh orientasi. **Tidak ada perubahan kode**, hanya catatan.

**Kalau F0 diskip / tak ada**
Pembaca masuk langsung F1 (cron) atau F9 (deploy) tanpa denah → bingung di mana file itu di peta besar, file mana bersebelahan, kenapa kontrak tertentu (mis. paper/live isolation) hidup di lima fase sekaligus. Audit jadi fragment — paham titik, lupa sambungan.

**Istilah yang muncul di fase ini** (akan dipakai ulang di banyak fase)
- **Lapisan** — kelompok file di bot dengan peran sama (Tampilan / Kontrol / Mesin / Belajar / Data / Koneksi). Bukan konsep resmi kode, cuma nama audit untuk navigasi.
- **Cron** — alarm internal yang bunyi tiap interval (10m / 30m / 3s), bangunin siklus.
- **siklus / cycle** — satu putaran kerja. Management cycle = jaga lapak buka; screening cycle = cari lapak baru.
- **deploy** — taruh modal jadi LP (penyedia likuiditas) di kolam Meteora.
- **close** — bongkar posisi LP, balik modal ke SOL.
- **OOR** (out-of-range) — harga token kabur dari rentang bin modal (fee berhenti, mulai IL).
- **hard-rule mekanis NO-AI** — SL/TP/close di kode, LLM tak boleh override.
- **paper/live isolation** — data sim kertas ditandai `paper:true` supaya tak kontaminasi data real di `evolveThresholds` / briefing / hive.
- **full-sync 6-surface** — config baru wajib muncul di 6 tempat (chat, /config, button menu, /help, definitions, settings guide); kalau enggak = bug siluman.
- **racikan / preset** — snapshot penuh `user-config.json` yang bisa di-muat ulang; behavior ikut, bukan aturan dipaksa.
- **rent posisi** — SOL terkunci di akun on-chain satu posisi (~0.057 SOL), refundable saat close. Bug: tak dihitung safety check → bisa makan gasReserve.
- **lessons.json** — arsip performa tiap close; `evolveThresholds` baca tiap 5 close LIVE untuk naik/turunkan threshold screening.
- **Darwin / signal-weights** — "seleksi alam" untuk sinyal screening yang terbukti prediktif → bobot naik → inject ke prompt.

*Lewati §0 kalau sudah paham fondasi. Isi teknis mulai §A.*

---

## §A — PETA 6 LAPISAN (dari peta-proyek.md)

| # | Lapisan | Isi (1-baris) | File inti |
|---|---------|---------------|-----------|
| 1 | **Tampilan & laporan** | Yang user LIHAT di Telegram/terminal | `telegram.js`, `briefing.js`, `guide.js`, `reports.js` (rakit-teks), `index.js` render |
| 2 | **Kontrol & perintah** | Cara user MENGENDALIKAN: polling + handler + tombol + REPL + CLI | `telegram.js` polling, `index.js` handler, `cli.js`, `preset.js`, `setup.js` |
| 3 | **Mesin trading** | Yang bot KERJAKAN: cron, screening, AI, eksekusi, exit mekanis, paper | `index.js` (cron+cycles), `agent.js`, `prompt.js`, `tools/dlmm.js`, `tools/executor.js`, `tools/screening.js`, `tools/gmgn.js`, indikator, `paper-trading.js`, `state.js` (exit) |
| 4 | **Belajar & pengukuran** | Bot ukur + belajar: PnL, performa, lessons, Darwin, memori, jurnal, biaya | `tools/pnl.js`, `pnl-tracker.js`, `lessons.js`, `signal-weights.js`, `pool-memory.js`, `decision-log.js`, `reports.js` (hitung), `gas-tracker.js`, `llm-cost-tracker.js` |
| 5 | **Data & setelan** | Yang bot SIMPAN + SETEL: config + memori di disk | `config.js` + `user-config.json`, `state.json`, `lessons.json`, `pool-memory.json`, `presets/*.json` + `preset-manager.js`, `strategy-library.json`, blacklists |
| 6 | **Koneksi luar/API** | Sambungan dunia luar: Solana RPC, Meteora, Jupiter, GMGN, OpenRouter, HiveMind, Telegram | `tools/dlmm.js`/`tools/pnl.js` (RPC+SDK), `tools/screening.js` (Meteora), `tools/wallet.js`/`token.js` (Jupiter), `tools/gmgn.js`, `tools/study.js` (LPAgent), `hivemind.js`, `telegram.js` (API) |

**File raksasa lintas-lapisan**: `index.js` 3906 baris (Lapisan 2+3+1+4), `tools/dlmm.js` 2786 baris (3+4+6). Edit titik rawan.

---

## §B — ALUR 1 TRADE HULU→HILIR

```
                    ┌── (cron manajemen 10m) ──┐
                    │                          │
[cron tick]         ▼                          │
runManagementCycle (index.js:339)              │
    │                                           │
    ├── getMyPositions({force:true}) ── dlmm.js │
    ├── tiap posisi: updatePnlAndCheckExits ── state.js:473-589
    │       └─ SL/trailing/OOR/low-yield (NO-AI hard rules)
    ├── getDeterministicCloseRule ── index.js:1255-1298
    ├── getIndicatorExitSignal (opt-in, OFF default)
    ├── IF ada aksi: LLM MANAGER → close_position / claim_fees
    │       └─ tools/executor.js:730 dispatch → safety check
    │       └─ tools/dlmm.js:1960 closePosition on-chain
    │       └─ tools/dlmm.js:2430 recordPerformance → lessons.json
    │       └─ auto-swap token sisa → SOL (executor.js:783)
    │       └─ notifyClose (telegram.js:597)
    └── IF slot kosong → picu runScreeningCycle
                    │
                    ▼
[cron tick / free-slot]                            ▼
runScreeningCycle (index.js:555)
    │
    ├── hard-guards: max-pos / SOL balance / market-regime (opt-in)
    ├── computeDeployAmount(saldo) ── config.js compounding
    ├── getTopCandidates ── tools/screening.js (Meteora API)
    │   └─ blockedLaunchpads enforced
    │   └─ indicator entry gate (screening.js:780, opt-in)
    ├── recon tiap kandidat: smart-wallets / narasi / token / momentum
    ├── kandidat + sinyal → prompt SCREENER
    ├── LLM SCREENER pilih 1 kolam / tolak semua
    ├── deploy_position → executor.js safety check (bin-step/max-pos/dup/single-side/SOL/range-floor)
    │       └─ tools/dlmm.js:645 deployPosition on-chain
    │       └─ state.js:140 trackPosition → state.json
    │       └─ executor.js:774 notifyDeploy
    │       └─ pool-memory.js:recordPoolDeploy
    └── race guard: _screeningLastTriggered / _screeningBusy (index.js:556-561)

[PnL poll 3s] setInterval (index.js:1126-1183)
    │
    ├── baca active bin on-chain via tools/pnl.js
    ├── updatePnlAndCheckExits → jika close terpicu → panggil runManagementCycle
    └── cek indikator exit (opt-in)
```

[Belajar after close]: tiap 5 close LIVE → `evolveThresholds` (lessons.js:253) mutasi `user-config.json` + Darwin `recalculateWeights` (recalcWeights:262) mutasi `signal-weights.json` → prompt berikutnya berubah → screening berikutnya adaptasi.

---

## §C — 3 PERAN AI

| Peran | Tujuan | Tool kunci | Kapan dipanggil |
|-------|--------|-----------|------------------|
| **SCREENER** | Cari + deploy posisi baru | `deploy_position`, `get_top_candidates`, `get_token_holders`, `check_smart_wallets_on_pool`, `get_time_profile` | Saat screening cycle ada kandidat |
| **MANAGER** | Jaga + tutup posisi | `close_position`, `claim_fees`, `swap_token`, `get_position_pnl`, `set_position_note` | Saat management cycle ada aksi (exit dipicu). Kalau semua STAY → "skipping LLM" (index.js:515) |
| **GENERAL** | Chat + manual | SEMUA tool | Saat user ketik perintah manual via Telegram/REPL |

Tool set didefinisikan di `agent.js:6-8`. General = semua. Skill: security — tool yang write on-chain wajib daftar WRITE_TOOLS (executor.js). Kalau tambah tool baru → wajib daftar ke role set relevan (CLAUDE.md "Adding a New Tool").

---

## §D — TEMUAN AUDIT LAMA (ringkas)

Sumber: `audit-progress.md` (v2.1 recon 2026-06-15) + `output-racikan-audit.md` (257 baris) + `onboarding-dossier.md` (498 baris).

### D.1 — Audit v2.1 recon (Fase 1+2+3)
- **Trade dicatat 2 tempat**: `state.json` saat buka (`trackPosition` state.js:140) + `lessons.json` `performance[]` saat tutup (`recordPerformance` lessons.js:147).
- **Penanda racikan** = field `active_setup` di-stamp dari `config.activeSetup` saat deploy (`state.js:151`).
- **Data live 2026-06-15**: 145 record = 84 `null` (lama pra-2026-06-10T14:26) + 61 `mainzen_v2`. 0 paper.
- **SALDO TERTAHAN (rent posisi)**: refundable ~0.057 SOL/posisi, **TIDAK dihitung di safety check** `executor.js:1016-1024` (cuma cek `amountY + gasReserve`). Bug modal → bisa gagal deploy ke-N maksimal / menggerus gasReserve.
- **TIDAK ditampilkan**: rent absence di `/positions`, `/pool`, `/wallet`, briefing.
- **Loop evolve + Darwin** pakai `livePerf` (`!p.paper`) → **TIDAK filter `active_setup`** → masih belajar dari 84 record lama campur 61 mainzen_v2. Relevan roadmap #1 (isolasi) + #4 (freeze evolve).
- **Display "By racikan"** (61 mainzen_v2) ≠ **"All-time stats"** (145) — beda basis → bisa misleading.

### D.2 — Onboarding dossier temuan
- **Paper trading** = subsistem nyata (`paper-trading.js` + cabang `tools/dlmm.js`), bukan sekadar DRY_RUN. **SAAT INI OFF di kedua instalasi** (repo live `DRY_RUN=false`; instance kembar `/home/ubuntu/meridianzen2` juga live non-paper). 0 record paper.
- **Audit paper**: entry & timing jujur (baca chain), tapi **fee & IL = ESTIMASI kasar** → bias optimis sistemik (fee proxy kebesaran, slippage tak dimodel). Paper bisa catat untung padahal rugi real. Bug satuan ~100× (Bab F/K.1).
- **Harga masuk & keluar EKSPLISIT TIDAK disimpan** di record performa. IL tak dipisah dari PnL.
- `darwinRecalcEvery` = **config MATI** — pemicu nyata konstanta `MIN_EVOLVE_POSITIONS=5` (dossier D.3/H.5).
- Record bencana (≤ −90%) **di-skip diam-diam** di `evolveThresholds` (data selalu "menang").
- Jam "in-range" bisa kelebihan hitung (paper close bug).
- `mainzen_v3.json` preset **tidak di repo ini** — ada di instance kembar `/home/ubuntu/meridianzen2/presets/`.
- PnL posisi terbuka: data on-chain asli + riwayat setoran API Meteora + harga Jupiter, di-poll tiap 3s.
- PnL posisi **tertutup**: dari API resmi Meteora `status=closed`; ada jalur cadangan (cache) kalau API telat → bisa angka 0/kurang akurat.

---

## §E — KONTRAK KUNCI (lintas-fase relevan)

| Kontrak | Inti | Audit di fase |
|---------|------|----------------|
| **Hard-rule mekanis NO-AI** | SL/TP/trailing/OOR/low-yield di KODE (`state.js:473-589`, `index.js:1255-1298`). LLM tak pernah mengevaluasi ulang — "Just execute" (index.js:506). | F3 (exits), F18 (updatePnlAndCheckExits) |
| **Paper/live isolation** | Tiap record paper ditandai `paper:true` → `getModePerformance`, `evolveThresholds`, `recalculateWeights`, briefing counts, hive sync SEMUA honor tag. Sim data tak kontam live. | F13, F19, F22, F32 |
| **full-sync 6-surface** | Config/feature baru wajib muncul di: (1) `CONFIG_MAP` (`/setcfg` chat), (2) `update_config` description (definitions), (3) `formatFullConfig` (`/config`), (4) `renderSettingsMenu` button menu, (5) `BOT_COMMANDS`/`/help`, (6) SETTINGS-GUIDE. Button menu = paling sering terlewat. | F8, F27, F28, F31 |
| **Racikan = snapshot sekali-muat** | `applyPreset` cuma swap `user-config.json` (preset-manager.js:133), tak restart. Config dibaca 1× saat startup → singleton live bisa dimutasi `update_config`. `activeSetup` tetap kerja tagging. **Bukan aturan terus-dipaksa.** | F20, F29 |
| **Race condition guard** | `_screeningLastTriggered` (index.js:556) + `_screeningBusy` cegah double-deploy dari concurrent screener + management cycle. | F1, F2 |
| **fail-open experiment** | Semua flag `config.experiments` default OFF. OFF = skip kode path (perilaku pabrik). Error di experiment tak boleh ganggu flow normal. | F27 |
| **Rent posisi bug** | Refundable ~0.057 SOL tak dicadangkan `executor.js:1016-1024` → makan gasReserve → max-pos bisa gagal. Inti roadmap #5. | F7, F9 |

---

## §F — GLOSARIUM ISTILAH PROYEK

| Term | Definisi |
|------|----------|
| **DLMM** | Dynamic Liquidity Market Maker — model AMM Meteora pakai bin diskret untuk likuiditas. |
| **LP / LPer** | Liquidity Provider — yang taruh modal di kolam untuk dapat fee swap. |
| **Deploy / position** | Taruh modal jadi penyedia likuiditas di kolam. Buka lapak LP. |
| **Bin** | Slot harga diskret di kolam DLMM. Modal di-sebar di rentang bin. |
| **bin_step** | Jarak harga antar bin (satuan basis point). Filter `[minBinStep, maxBinStep]` default 80-125. |
| **Range / in-range / OOR** | Rentang bin modal tempati. In-range = harga lewat di range (dapat fee). OOR (out-of-range) = harga kabur → fee berhenti, modal bisa IL. |
| **IL** | Impermanent Loss — rugi karena harga token geser dari ratio awal. Tak dipisah dari PnL di record. |
| **Fee / fee_active_tvl_ratio** | Komisi swap yang LP dapat. Ratio = fee / TVL aktif per periode. Salah satu gating utama. |
| **PnL** | Profit & Loss — untung/rugi. Terbuka: on-chain + Jupiter. Tutup: API Meteora closed. |
| **TVL** | Total Value Locked — total modal di kolam. |
| **Racikan / preset** | Snapshot penuh `user-config.json` → file `presets/<name>.json`. Bisa muat ulang. Aktif: `mainzen_v2`. |
| **active_setup** | Field di record posisi/performance → nama racikan aktif saat deploy. Tagging 2026-06-10T14:26+. |
| **strategyLock** | Kunci bentuk sebaran modal (terkunci `bid_ask`) secara mekanis — bukan cuma saran ke AI. |
| **gasReserve** | Cadangan SOL untuk biaya on-chain. Auto-tune `maybeAutoTuneGasReserve` (index.js:277). |
| **rent posisi** | SOL terkunci di akun posisi Meteora DLMM (~0.057 SOL/posisi). **Refundable** saat close. **Tak dicadangkan** oleh safety check modal. |
| **rent bin-array** | ~0.07143744 SOL/array, NON-REFUNDABLE. DiHINDARI total (`assertRangeDoesNotRequireBinArrayInitialization` dlmm.js:489). |
| **SL / TP / trailing** | Stop-Loss (default −12%), Take-Profit (default +4%), Trailing (1.5/1.0). Hard-rules mekanis. |
| **Low-yield exit** | Aturan tutup kalau fee yield < threshold terlalu lama. |
| **OOR wait** | Lama tunggu sebelum close OOR (`outOfRangeWaitMinutes` default 30). |
| **Darwin (signal-weights)** | "Seleksi alam" sinyal screening. Sinyal yang terbukti prediktif → bobot naik → inject ke prompt. |
| **HiveMind** | Sync kolektif optional (lessons/deploy ke server bersama). Env `HIVE_MIND_URL` + `HIVE_MIND_API_KEY`. Data paper tak ikut. |
| **GRUP 16 / experiments** | Blok eksperimen opt-in di `/config`. Semua default OFF. fail-open. Termasuk: exitLiquidityCheck, marketRegimeGate, candidateMomentum, convictionSizing, expectedYieldSignal, smartWalletMomentum, counterfactualReview, narrativeProfileSignal, paperTrading, usePaperHistoryWhenLive. |
| **Tim/WIB** | Waktu Indonesia Barat (UTC+7). Time-of-day profile pakai sesi WIB (dini/pagi/siang/sore/malam). |
| **briefing** | Laporan terjadwal ke Telegram: harian 01:00 UTC, mingguan Senin 01:30, bulanan tgl 1 02:00. Auto-pin. |
| **milestone learning report** | Laporan belajar tiap N close (default 10). Dipicu `maybeFireLearningReport` (index.js:207). |
| **Counterfactual skip-review** | Eksperimen: tracking pool yang dilewati tapi tak dimasuki → review 24h kemudian (yg got away vs good skip). |
| **Compounding deploy formula** | `computeDeployAmount`: `clamp(deployable × positionSizePct, deployAmountSol, maxDeployAmount)`. Modal naik bareng saldo. |
| **applyConvictionSizing** | Eksperimen: naik/turunkan deploy amount berdasarkan `conviction` (low/medium/high). Re-clamp ke `[deployAmountSol, maxDeployAmount]` biar tak breach min/max. |
| **DRY_RUN** | Skip semua on-chain tx (env flag). Paper trading = `DRY_RUN=true` AND `experiments.paperTrading=true`. |
| **Discord listener** | Kerangka sumber kandidat dari Discord (`fetchDiscordSignalCandidates` screening.js:186). **OFF** (`useDiscordSignals=false`). |

---

## §G — CROSS-REF FASE LAIN

- **F1** — cron + entry + poll 3s + race guard (fondasi timer semua siklus).
- **F2** — `runManagementCycle` + `runScreeningCycle` (isi 2 siklus).
- **F3** — `getDeterministicCloseRule` + `computeBinsBelow` (exit mekanis atas).
- **F18** — `updatePnlAndCheckExits` (exit mekanis di poll — jantung risk).
- **F9** — rent bug modal detail.
- **F20** — evolve cross-talk bug detail.
- **F21** — `darwinRecalcEvery` config mati + Darwin.
- **F13/F32** — paper isolation contract + bug satuan.
- **F34** — agregasi semua temuan di sini akhir.

---

## §H — OPEN-Q LINTAS-FASE

1. Cron management vs screening: kalau keduanya tick bersamaan, bagaimana urutan? (lihat F1/F2).
2. PnL poll 3s benar-benar trigger management cycle tiap detik? Load apa ke RPC? (F1/F2).
3. Rent bug: apakah konstanta rent eksplisit di Meteora SDK, atau murni empiris? (F9).
4. Evolve campur 84 record lama: masih relevan 2026-07-06 setelah mainzen_v2 jadi dominant? (F20 — cek ulang data live).
5. Darwin: `darwinRecalcEvery` benar-benar tak terbaca? atau ada fallback? (F21).
6. Paper bug satuan ~100×: di mana tepatnya di paper-trading.js? (F13/F32).
7. Discord listener OFF: kode kerangka masih lengkap, tinggal flip flag? (F33).
8. Instance kembar `meridianzen2` dengan `mainzen_v3` — apakah masuk scope audit ini? (di luar repo, tapi cross-referensi).

---

*F0 selesai 2026-07-06. Read-only. Kode/config tak diubah saat menyusun.*