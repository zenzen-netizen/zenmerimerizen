# Audit Recon v2.1 — Data Racikan · Output · Loop Belajar

> READ-ONLY audit. Bukti `file:line`. Branch `experimental`. UNKNOWN = tak dipastikan dari kode.
> Disusun 2026-06-15. Sumber: pembacaan langsung kode + data live (lessons.json 145 record).

---

## 🧭 RINGKASAN EKSEKUTIF

**FASE 1 — Cara trade dicatat & penanda racikan**
- Trade dicatat 2 tempat: saat **buka** → `state.json` (`trackPosition` state.js:140), saat **tutup** →
  `lessons.json` `performance[]` (`recordPerformance` lessons.js:147). Dua jalur close (relay + public)
  sama-sama stamp identitas: `tools/dlmm.js:2150` & `:2444`.
- **Penanda racikan = field `active_setup`** (nama snapshot saat deploy) + `profile` (arketipe wizard).
  Di-stamp dari `config.activeSetup` saat deploy (`state.js:151`).
- Data live: **145 record total → 84 `active_setup=null` (lama, pra-2026-06-10T14:26) + 61 `mainzen_v2`**, 0 paper.
- **Pisah mainzen_v2 vs lama: BISA** lewat `active_setup`, tapi cuma maju dari 10 Jun. 84 record lama = `null`
  (tak terlacak racikannya; bisa juga dipisah temporal via `recorded_at`). Breakdown "By racikan" sudah
  otomatis buang `null` (`groupStats` skip falsy key, reports.js), TAPI stats headline + loop evolve TIDAK.
- **Hirarki racikan = snapshot sekali-muat, BUKAN aturan terus-dipaksa.** `applyPreset` cuma swap
  `user-config.json` (preset-manager.js:133), config dibaca sekali saat startup jadi singleton live.
  Tweak minor (`update_config`) tetap `activeSetup=mainzen_v2` (sesuai mau user). Tak ada "strategyLock"
  pengikat selain `promptNotes`.
- **Paket portabilitas (otak+identitas):** 13 file JSON + `.env`. Inti = `lessons.json` (otak),
  `user-config.json` (config+identitas+agentId+hasil-evolve), `signal-weights.json` (Darwin),
  `pool-memory.json`. Detail di FASE 1 §F.

**FASE 2 — Output & SALDO TERTAHAN**
- 12 permukaan output Telegram (briefing harian/periodik, /report, /wallet, /status, /positions, /pool,
  /config, 4 notif). Katalog + lokasi render di FASE 2 §A.
- **SALDO TERTAHAN = rent akun posisi Meteora DLMM (refundable saat close).** Akun posisi dibuat di
  `dlmm.js:1077` (`initializePositionAndAddLiquidityByStrategy`) / `:1046` (wide). **Nilai tak ada
  konstanta di kode** (ditentukan SDK) — empiris ~0.05–0.06 SOL/posisi (**UNKNOWN-exact dari kode**).
  Rent bin-array (0.07143744 SOL non-refundable) **DIHINDARI** total (`dlmm.js:489` tolak deploy).
- **Bug modal (inti roadmap #5):** cek saldo deploy `executor.js:1016-1024` cuma hitung `amountY +
  gasReserve` — **rent posisi TIDAK dicadangkan**, jadi makan `gasReserve` & bikin max-pos ke-N bisa gagal.
- **Rent TIDAK ditampilkan di mana pun** (tak ada field di record posisi, tak di /positions, /pool, /wallet).

**FASE 3 — Loop belajar vs display**
- Data sumber **sama** (`lessons.json performance[]`), tapi terbelah:
  - **MASUK LOOP (mengubah perilaku):** `evolveThresholds` (→ tulis balik `user-config.json`),
    Darwin `recalculateWeights` (→ `signal-weights.json` → prompt), `derivLesson` (→ prompt),
    `recordPoolDeploy` (→ pool-memory), time/narrative profile.
  - **DISPLAY-ONLY:** `formatStatsBlock`, `formatBreakdown`, `buildVerdict`, `buildRecommendations`
    (cuma teks saran, TIDAK auto-apply), `formatTrend`, `formatPnlTracker`, counterfactual skip-review.
- **Ketimpangan penting:** loop evolve/Darwin pakai `livePerf` (filter `!p.paper` saja) — **TIDAK filter
  `active_setup`**, jadi masih belajar dari 84 record lama campur 61 mainzen_v2. Relevan roadmap #1 (isolasi)
  + #4 (freeze evolve). Display "By racikan" (61) ≠ "All-time stats" (145) — beda basis.

---

## FASE 1 — RECON DATA + HIRARKI + PORTABILITAS RACIKAN

### §A. Di mana & bagaimana trade dicatat

**Saat BUKA (deploy):**
- `deployPosition` (tools/dlmm.js:645) → sukses → `trackPosition({...})` (dlmm.js:1095).
- `trackPosition` (state.js:140) → `makePositionRecord` (state.js:60) → tulis ke `state.json`
  `positions[<position_address>]`. Stamp identitas: `active_setup: fields.active_setup ?? config.activeSetup ?? null`
  + `profile: fields.profile ?? config.profile ?? null` (**state.js:151-152**).
- `deployed_at` dijaga agar tak ter-reset (state.js:145).

**Saat TUTUP (close):** dua jalur, dua-duanya panggil `recordPerformance`:
- Relay close: `tools/dlmm.js:2136` (stamp `active_setup: tracked.active_setup` @2150, `deployed_at` @2148).
- Public/agent close: `tools/dlmm.js:2430` (stamp @2444, `deployed_at` @2442).
- `recordPerformance(perf)` (lessons.js:147) → push 1 entry ke `lessons.json` `performance[]` (lessons.js:203).

### §B. Field tiap record performa (dari data live, record terbaru)
`position, pool, pool_name, base_mint, strategy, bin_range, bin_step, volatility, fee_tvl_ratio,
organic_score, amount_sol, deployed_at, narrative_category, active_setup, profile, shadow_signals,
peak_pnl_pct, trough_pnl_pct, price_peak_pct, price_trough_pct, fees_earned_usd, final_value_usd,
initial_value_usd, minutes_in_range, minutes_held, close_reason, signal_snapshot, entry_mcap/tvl/volume/holders,
exit_mcap/tvl/volume, pnl_usd, pnl_pct, range_efficiency, opened_at, closed_at, open_hour_wib, open_session, recorded_at`

**Timestamp:** `deployed_at`/`opened_at` (buka), `closed_at`==`recorded_at` (tutup), `open_hour_wib`+`open_session`
(WIB, untuk time-profile) — semua ISO string. Dihitung di lessons.js:186-201.
**Catatan:** record LAMA (84) field-nya lebih sedikit (tanpa `active_setup`/`profile`/`entry_*`/`open_session`/
`price_*`) — skema bertumbuh seiring fitur. Record tanpa `opened_at` (20 dari 145) dikecualikan dari time-profile.

### §C. Penanda racikan — ada / tidak
- **ADA: `active_setup`** (nama racikan snapshot saat deploy) + **`profile`** (degen/moderate/safe/custom).
- Distribusi live: `{"(null)":84, "mainzen_v2":61}`; `opened_at` ada di 125/145; paper=0.
- Stamp pertama: `recorded_at = 2026-06-10T14:26:43Z → mainzen_v2`. Record pertama keseluruhan
  `2026-06-03T17:17Z`, terakhir `2026-06-15T02:52Z`.

### §D. List racikan (folder `presets/`)
| File | Status |
|------|--------|
| `presets/mainzen_v2.json` | **AKTIF** (live `activeSetup`) |
| `presets/mainzen.json` | racikan lama (pendahulu) |
| `presets/bigcapagresif.json` | eksperimen bigcap — **ON HOLD** |
| `_backup.json` | dibuat otomatis tiap `applyPreset` (rollback) — belum ada saat ini |
- Non-racikan (dokumen): `presets/README.md`, `CHECKLIST-bigcap.md`, `ROADMAP-bigcap-experiment.md`.
- `user-config.json` live: **`preset=custom`, `activeSetup=mainzen_v2`, `dryRun=false` (LIVE)**.

### §E. Bisa pisahkan trade mainzen_v2 vs lama?
- **YA, via `active_setup`** — tapi hanya maju sejak 2026-06-10T14:26 (saat fitur stamp landing).
  84 record sebelum itu = `null` → racikan tak terlacak (kemungkinan config mirip mainzen tapi belum di-stamp).
- Alternatif: pisah **temporal** via `recorded_at`/`opened_at`.
- `groupStats` (reports.js, fungsi internal) **skip `null`** (`if (!k) continue`) → breakdown "🗂️ By racikan"
  otomatis cuma racikan ber-nama (mainzen_v2). **TAPI** stats headline + evolve + Darwin tetap pakai semua 145.

### §F. Siapa baca riwayat trade
- Getter: `getAllPerformance()` (lessons.js:823, raw semua), `getModePerformance()` (lessons.js:834,
  mode-scoped paper/live via filter `!p.paper`).
- Konsumen:
  - **reports.js** `computeTradeStats` (dipakai briefing + /report).
  - **briefing.js** harian/periodik (filter `keepMode`, briefing.js:279/303/390).
  - **index.js** milestone report (`getModePerformance` :212/:240), `/learn` (`evolveThresholds` :3812).
  - **lessons.js** `evolveThresholds` + signal-weights `recalculateWeights` (LOOP, `livePerf` :252-264).
  - **lessons.js** `getHourlyProfile`/`getNarrativeProfile` (time/narrative profile).
  - **pnl-tracker.js** `formatPnlTracker`.
  - Counterfactual skip-review **TIDAK** baca `performance[]` (baca `candidate-memory.json` + pool-memory).

### §G. Hirarki — seberapa "ngiket" racikan
- Racikan = **snapshot file** `user-config.json`. `applyPreset` (preset-manager.js:133) **cuma swap file**
  (backup dulu → `_backup.json`), **TIDAK restart**. `config.js` baca `user-config.json` **sekali saat startup**
  → objek `config` singleton (config.js:115 baca `activeSetup`).
- Jadi: **snapshot sekali-muat, bukan aturan terus-dipaksa.** Setelah dimuat, `config` objek live yang bisa
  dimutasi (`update_config` → tulis balik `user-config.json`, config.js:519), tapi stamp `activeSetup` tetap.
- `reloadScreeningThresholds()` (config.js:531) re-baca `user-config.json` (`promptNotes`+`activeSetup`) tanpa restart.
- **Alur kendali racikan → config → benteng:**
  - `config` → hard-guard screening (index.js: max-pos :569, SOL :583, market-regime :602).
  - `config` → safety-check deploy mekanis (executor.js:836-1038: bin step, max pos, dup pool/token, SOL balance,
    range floor `minBinsBelow≥35`, single-side).
  - `config.promptNotes` → `racikanRules(role)` (prompt.js) = blok **RACIKAN RULES** (instruksi keras, tapi
    DI BAWAH HARD RULE/safety mekanis). `config.activeSetup` → label "carried by racikan" (prompt.js:24).
- **Tak ada pengikat lain** selain `promptNotes`. `getActiveSetupStatus` (preset-manager.js:154) cuma TANDAI
  `edited` kalau live config beda dari snapshot — tweak minor tetap dihitung `mainzen_v2` (sesuai mau user).

### §H. Portabilitas — paket backup "otak + identitas" lengkap
Supaya reinstall = perilaku + kecerdasan SAMA, butuh:

| # | File | Isi / peran |
|---|------|-------------|
| 1 | `user-config.json` | Config LIVE + identitas (`preset`,`activeSetup`) + **`agentId`** (hivemind.js:97) + **hasil-evolve** (thresholds ditulis balik ke `config.screening`) |
| 2 | `presets/*.json` | Rak racikan (mainzen_v2, mainzen, bigcapagresif, _backup) |
| 3 | `gmgn-config.json` | Config jalur GMGN |
| 4 | **`lessons.json`** | **OTAK** — `performance[]` (145) + `lessons[]` |
| 5 | `signal-weights.json` | Bobot Darwin (di-inject ke prompt) |
| 6 | `pool-memory.json` | Riwayat + snapshot per-pool |
| 7 | `candidate-memory.json` | Momentum / sw / counterfactual |
| 8 | `state.json` | Registry posisi + event |
| 9 | `strategy-library.json` | Strategi LP tersimpan |
| 10 | `decision-log.json` | Audit keputusan |
| 11 | `gas-log.json`, `llm-cost-log.json`, `sol-balance-history.json` | Tracker biaya/saldo (histori akurat) |
| 12 | `hivemind-cache.json` | Cache hive |
| 13 | `smart-wallets.json`, `token-blacklist.json`, `dev-blocklist.json` | KOL/blacklist (dibuat saat first-write — **mungkin belum ada**) |
| — | `.env` (di luar git) | `WALLET_PRIVATE_KEY`, `RPC_URL`, `OPENROUTER_API_KEY`, `TELEGRAM_*`, `HIVE_MIND_*` |

> **Catatan portabilitas:** tak ada file "evolve-state" terpisah — hasil evolusi ditulis BALIK ke
> `user-config.json` (config.screening). Jadi `user-config.json` = config + identitas + agentId + memori-evolusi
> sekaligus. **agentId hidup di `user-config.json`** (bukan .env) — kalau mau identitas hive yang sama,
> file ini wajib ikut; kalau mau identitas baru, hapus `agentId` → hivemind.js:96 generate baru.

---

## FASE 2 — RECON OUTPUT INFO + SALDO TERTAHAN

### §A. Katalog SEMUA output Telegram

| # | Output | Trigger | Render (file:line) | Data ditampilkan |
|---|--------|---------|--------------------|------------------|
| 1 | **Morning Briefing** | cron 01:00 UTC + watchdog | `briefing.js:271` `generateBriefing` | identitas; activity (opened/closed 24h); perf 24h (net/fees/winrate); PnL tracker; all-time stats block; verdict; movement; lessons 24h + config-change count; open-pos count; feature status; cost (LLM per-role/gas/net−cost/gasReserve runway/OR saldo); learning; time-profile; skip-review; breakdown (strategy/racikan/session/narrative/close-rule); recommendations |
| 2 | **Weekly/Monthly briefing** | cron Mon 01:30 / 1st 02:00 UTC | `briefing.js:378` `generatePeriodicBriefing` | `buildTradeReport` (stats+verdict+trend+breakdown+rec) windowed + activity + cost window |
| 3 | **/report [day\|week\|month]** | Telegram :3205 / CLI :3703 | `reports.js buildTradeReport` | sama report lengkap; no-arg = all-time |
| 4 | **/wallet** | `index.js:3219` | `formatWalletStatus` (index.js:1414) | wallet SOL+$, SOL price, open-pos/maxPos, next deploy amount, dry-run, hive + OR saldo + SOL tracker (1d/7d/30d) + PnL tracker |
| 5 | **/status** | `index.js:3219` (share) | idem + blok ekstra :3249-3264 | + all-time PnL/ROI, learning (winrate/avg), lesson bad/good terakhir + PnL tracker |
| 6 | **/positions** | `index.js:3287` | inline :3292-3298 | per posisi: pair, value, PnL, unclaimed fees, age, ⚠️OOR |
| 7 | **/pool \<n>** | `index.js:3303` | inline :3310-3319 | detail: pool, position, range bin (lower→upper, active), PnL%, fees, value, age, in/OOR, note |
| 8 | **/config**, **/config core** | `index.js:3275` | `formatFullConfig`/`formatCoreConfig` | seluruh config (grup) / inti |
| 9 | **notifyDeploy** | saat deploy sukses (executor.js:793) | `telegram.js:571` | pair, amount SOL, **racikan**, price range, range cover (down/up/total), bin step, base fee, position, tx |
| 10 | **notifyClose** | saat close | `telegram.js:597` | pair, PnL $/%, fees (sudah termasuk PnL), warning gap trigger-vs-realisasi, reason, lesson |
| 11 | **notifySwap** | saat swap | `telegram.js:631` | in/out symbol, amount in/out, tx |
| 12 | **notifyOutOfRange** | saat OOR lewat threshold | `telegram.js:640` | pair, menit OOR |

> Briefing auto-pin via `sendAndPinBriefing`. `/learn`, `/screen`, `/candidates`, `/pause`, `/resume`,
> `/hive`, `/preset`, `/settings`, `/guide`, `/help`, `/closeall`, `/close <n>`, `/set <n>` = command lain (bukan laporan utama).

### §B. Metrik DIHITUNG vs DITAMPILKAN (gap = kandidat tambah)
`computeTradeStats` (reports.js:~100-155) menghitung: net, ROI, winrate, **profit_factor**, avg_win/loss
(%/usd), **payoff_ratio**, expectancy (usd & **pct**), biggest win/loss, fees, avg_hold, avg_range_efficiency,
**max_drawdown**, max_consecutive_losses, `movement` (excursion PnL), `price_movement` (peak/trough + **MAE
winner**), by_strategy/session/narrative/**setup**/close_rule.

`formatStatsBlock` (reports.js:240) MENAMPILKAN: net, ROI, fees, winrate, PF, expectancy_usd, avg win/loss,
payoff, max DD, worst streak, avg hold, in-range, best/worst.

**Gap (dihitung tapi tak/jarang tampil → kandidat metrik baru):**
- `expectancy_pct` (cuma `expectancy_usd` yang tampil).
- `price_movement` MAE/excursion — `formatMovement` ada & dipakai briefing, tapi **tidak** di /report ringkas.
- **SALDO TERTAHAN (rent) — TIDAK dihitung & TIDAK ditampilkan sama sekali** (lihat §C).
- **Per-racikan**: by_setup dihitung & dirender ("🗂️ By racikan", reports.js:271) tapi basisnya beda dari
  headline (61 vs 145) → bisa membingungkan; "report per-racikan penuh" (stats block per racikan) belum ada.

### §C. SALDO TERTAHAN saat buka posisi (rent)
**Apa & berapa:**
- Saat deploy, akun posisi Meteora DLMM dibuat (keypair `newPosition`, dlmm.js:1028) via
  `pool.initializePositionAndAddLiquidityByStrategy` (**dlmm.js:1077**, jalur ≤69 bin) atau
  `createExtendedEmptyPosition` (**dlmm.js:1046**, wide >69 bin). Akun ini butuh **rent-exempt** → **SOL
  terkunci di luar `deployAmount`**, **refundable saat close**.
- **Nilai: tak ada konstanta eksplisit di kode** (ditentukan SDK saat bangun tx). Empiris Meteora positionV2
  ≈ **0.05–0.06 SOL/posisi** → **UNKNOWN-exact dari kode** (jangan dipatok angka pasti tanpa ukur on-chain).
- Rent **bin-array** (`BIN_ARRAY_FEE` ≈ 0.07143744 SOL/array, **non-refundable**) + **bitmap ext**
  (≈ 0.01180416 SOL, non-refundable): **DIHINDARI total** — `assertRangeDoesNotRequireBinArrayInitialization`
  (**dlmm.js:489-540**) MENOLAK deploy ke range yang butuh init; `assertNoInitializeBinArrayInstructions`
  (dlmm.js:542) jaga ganda. Jadi bot **tidak bayar** rent non-refundable ini.
- Konfirmasi sifat refundable: `notes/onboarding-dossier.md:482` — "rent posisi refundable tidak dihitung
  sebagai gas".

**Di mana di kode + apakah ditampilkan:**
- **TIDAK diperhitungkan saat cek modal:** `executor.js:1016-1024` cek `balance.sol < amountY + gasReserve`
  saja → rent ~0.057 SOL **tidak dicadangkan**, ter-debit dari sisa (efektif makan `gasReserve`).
- **TIDAK ada field rent** di record posisi (`makePositionRecord` state.js:60 tak punya).
- **TIDAK ditampilkan**: tidak di /positions (:3292), /pool (:3310), /wallet (`formatWalletStatus` :1414), atau briefing.
- **Implikasi (inti roadmap #5):** karena rent tak dicadangkan, membuka posisi ke-N (mendekati `maxPositions`)
  bisa gagal / menggerus `gasReserve` di bawah target. "Optimasi deploy biar max-pos beneran kebuka" = cadangkan
  `N_slot × rent` saat hitung modal/gasReserve.

---

## FASE 3 — CEK LOOP BELAJAR

### §A. Data outcome → apa yang DIPELAJARI / DIUBAH (MASUK LOOP)
Semua dipicu di `recordPerformance` (lessons.js:147) setelah tiap close, sumber = `lessons.json performance[]`:

| Mekanisme | Pemicu (file:line) | Baca | Mengubah |
|-----------|--------------------|------|----------|
| **evolveThresholds** | lessons.js:253-259, tiap 5 close LIVE | `livePerf` (`!p.paper`) | `minFeeActiveTvlRatio` + `minOrganic` → **tulis balik `user-config.json`** (config.screening) via `reloadScreeningThresholds` |
| **Darwin recalculateWeights** | lessons.js:262-268 (jika `config.darwin.enabled`) | `livePerf` | bobot di **`signal-weights.json`** → di-inject ke prompt (`getWeightsSummary` agent.js:216) |
| **derivLesson** | lessons.js:208,288 | entry tunggal | tambah `lessons[]` → `getLessonsForPrompt` inject ke system prompt |
| **recordPoolDeploy** | lessons.js:223-247 (LIVE only) | entry | **`pool-memory.json`** (riwayat per-pool) → dibaca screening |
| **getHourlyProfile / getNarrativeProfile** | lessons.js (`getModePerformance`) | mode-perf | soft signal time/narrative di prompt + adaptive screening interval |
| **pushHiveLesson / pushHivePerformanceEvent** | lessons.js:217,273 (non-paper) | entry/lesson | sync ke hive eksternal (jika ON) |

Loop ringkas: **close → record performa → (tiap 5) evolve floor + Darwin bobot + (tiap close) lesson/pool-memory/
profile → ubah config.screening / signal-weights.json / prompt → screening & deploy berikutnya berubah.**

### §B. DISPLAY-ONLY (tidak mengubah perilaku)
Murni baca `performance[]` untuk ditampilkan, **tidak** mengubah config/bobot:
- `formatStatsBlock`, `formatBreakdown` (incl. by_racikan), `buildVerdict`, `formatTrend`, `formatMovement`,
  `formatPnlTracker` — semua di briefing/report.
- `buildRecommendations` (reports.js) — **cuma teks saran, TIDAK auto-apply** (beda dari evolve yang otomatis).
- **Counterfactual skip-review** (briefing.js:243) — display dari `candidate-memory.json`, **tidak** feed evolve.

### §C. Apakah yang ditampilkan = yang masuk loop?
**Sumber data sama** (`performance[]`), tapi **basis penyaring beda** → angka bisa tak konsisten:
- **Display "All-time stats"** = `getModePerformance()` = **semua 145** (live, non-paper).
- **Loop evolve + Darwin** = `livePerf` (`!p.paper`) = **juga 145** — **TIDAK** difilter `active_setup`.
  → **Loop masih belajar dari 84 record lama (null) campur 61 mainzen_v2.** (relevan roadmap #1 isolasi + #4 freeze)
- **Display "By racikan"** = `groupStats` skip `null` = **cuma 61 (mainzen_v2)**.
  → Jadi "By racikan" (61) **≠** "All-time stats" (145). Beda basis; perlu disamakan/diberi label saat redesign.
- Tidak ada paper saat ini (0), jadi pemisahan paper/live tak relevan untuk dataset sekarang — tapi guard-nya ada.

**Kesimpulan:** report/briefing = **display murni**; mesin yang benar-benar mengubah perilaku = `evolveThresholds`,
Darwin `recalculateWeights`, `derivLesson`/`getLessonsForPrompt`, `recordPoolDeploy`, profile. Untuk v2.1:
isolasi mainzen_v2 (filter `active_setup` di loop) + freeze evolve = ubah penyaring di lessons.js:252-264, BUKAN di display.
