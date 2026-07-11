# Audit F3 — Aturan Exit Mekanis NO-AI
> Read-only. Bukti `file:line`. Resume: buka file ini.
> Kedalaman: sedang — exit rule mekanis-matematis, formula matematis.
> Cross-ref: F2 (cycles), F18 (updatePnlAndCheckExits poll), F15 (indicator gate), F11 (OOR time).

## Ringkasan eksekutif
1. `getDeterministicCloseRule` (index.js:1466-1509) — 5 rule NO-AI berurutan: rule 1 SL (`pnl <= stopLossPct`), rule 2 TP (`pnl >= takeProfitPct`), rule 3 pump-OOR (`active_bin > upper_bin + outOfRangeBinsToClose`), rule 4 OOR-time (`minutes_out_of_range >= outOfRangeWaitMinutes`), rule 5 low-yield (`fee_per_tvl_24h < minFeePerTvl24h AND age >= 60`). Return pertama menang; null = STAY. Bukti index.js:1480-1508.
2. `getIndicatorExitSignal` (index.js:1515-1528) — opt-in GANDA: `indicators.enabled AND indicators.exitEnabled` (default OFF, index.js:1516). Upgrade STAY/CLAIM → CLOSE; `confirmIndicatorPreset({mint,side:"exit"})` confirmed veto fail-SAFE (skip/error → null). HANYA dipanggil setelah deterministic rule (F2:566), takkan override SL/TP/OOR.
3. `computeBinsBelow` (index.js:1572-1580) — `round(minBinsBelow + (vol/5)*(maxBinsBelow-minBinsBelow))` clamp `[minBinsBelow,maxBinsBelow]`. Hard floor `MIN_SAFE_BINS_BELOW=35` (config.js:35). Vol tak-finite/<=0 → throw (refuse deploy). SCREENER entry-only, bukan exit.
4. `maybeAutoTuneGasReserve` (index.js:403-430) — opt-in `gasReserveAutoTune` (default false, config.js:240). Hitung `dailyBurn` dari `getGasStats(7d)` (≥8 sample), `target=max(floor,dailyBurn*bufferDays)`; delta <20% DAN <0.005 SOL → skip (anti-churn). Fail-open.
5. **Lever A emergency bypass**: `emergencyCloseDirect` (index.js:1207-1248) LLM-free, NO cooldown — poller SL/rule-1 lewat sini; hold `_managementBusy` sendiri (1212) → management cron skip (anti double-close). Gagal → fallback `runManagementCycle` ASAP (1341,1379). Bukti index.js:1211-1247.

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Palang kereta otomatis*: saat kereta mendekat (harga cekung/rugi melebihi batas, atau OOR terlalu lama, atau pump jauh), palang turun sendiri tanpa nanya ke saffir. Tak ada debこんにちは "kira-kira hari ini stop atau terus?" — palang cuma baca sensor (PnL, bin, jam). Kalau sensor rusak (`pnlSuspect`), palang SL/TP skip perlindungan diri, sensor OOR/yield tetap jalan.
- *Safety valve di panci tekan*: panci tekan punya katup yang melepaskan uap kalau tekanan terlalu tinggi (TP take profit) atau terlalu rendah darurat (SL rugi) — mekanis, tak diatur manusia tiap detik. Di bot, ini = `getDeterministicCloseRule`, dipanggil tiap poll 3 detik + tiap cron management 10 menit.

**Di bot, ini = 5 rule close mekanis NO-AI + opt-in indicator exit + auto-tune gas + lever A emergency**: kode murni yang tutup posisi tanpa mikir. SL paling darurat = lever A (close paksa bebas LLM, bebas cooldown).

**Posisi fase ini di alur bot**
F3 = palang pengaman. Pasang di `runManagementCycle` (F2) tiap cron tick + dipanggil ulang poller tiap 3 detik (F1) → kalau trigger, kirim ke F10 (close relay on-chain). F3 datang SETELAH F2 detect posisi + SEBELUM F10 eksekusi. Lapisan 3 (Mesin trading). Tanpa F3, LLM yang harus milih "tutup nggak ya?" tiap menit → bisa panic sell / hold bagus → rugi tak konsisten.

**Langkah kerja F3 — `getDeterministicCloseRule`**
1. Dipanggil dengan posisi `p` + config `management`. Cek `pnlSuspect` dulu (PnL corrupt?), supaya rule PnL-bisa gak salah baca.
2. **Rule 1 — SL**: bila `pnl_pct <= stopLossPct` (default -50%) → CLOSE, `rule=1` "stop loss". Return pertama menang.
3. **Rule 2 — TP**: bila `pnl_pct >= takeProfitPct` (default 5%) → CLOSE `rule=2` "take profit".
4. **Rule 3 — pump-OOR**: bila harga `active_bin > upper_bin + outOfRangeBinsToClose` (default 10 bin) → CLOSE `rule=3` "pumped far above range". Berdasar bin, bukan jam.
5. **Rule 4 — OOR-time**: bila `active_bin > upper_bin` DAN menit OOR ≥ `outOfRangeWaitMinutes` (default 30) → CLOSE `rule=4` "OOR".
6. **Rule 5 — low-yield**: bila `fee_per_tvl_24h < minFeePerTvl24h` (default 7) DAN age ≥ 60 menit → CLOSE `rule=5` "low yield". Rugi-fee-tapi-posisi-tua.
7. Semua rule null → return null = STAY (pertahankan).
8. Sinkron: F18 (`updatePnlAndCheckExits`) punya sinyal paralel STOP_LOSS / TRAILING_TP / OUT_OF_RANGE / LOW_YIELD yang juga bisa picu close via lever A poller — kedua lapis protektif.

**Langkah kerja F3 — `getIndicatorExitSignal`** (opt-in, default OFF)
1. Gate ganda: `indicators.enabled AND indicators.exitEnabled`. Cuma kalau dua-duanya on.
2. Panggil `confirmIndicatorPreset({mint, side:"exit"})` — chart-indicators cek exit-preset (RSI/Supertrend/Bollinger dll).
3. Kalau confirmed → upgrade STAY/CLAIM jadi CLOSE `rule="indicator"`. Kalau API skip/error → null (fail-SAFE, tak tutup).
4. Dipanggil SETELAH deterministic rule — jadi SL/TP/OOR/yield tetap dominan, indicator exit cuma booster.

**Langkah kerja F3 — `computeBinsBelow`** (SCREENER entry-only, bukan exit)
1. Rumus: `round(minBinsBelow + (vol/5) × (maxBinsBelow-minBinsBelow))`. Semakin volatilitas tinggi → bins_below makin lebar.
2. Clamp dua arah `[minBinsBelow=35, maxBinsBelow]` (hard floor MIN_SAFE_BINS_BELOW=35 di 4 lapisan).
3. Vol tak valid (NaN/≤0) → throw → deploy abort. Fail-SAFE menolak data corrupt.

**Langkah kerja F3 — `maybeAutoTuneGasReserve`** (opt-in, default OFF)
1. Bila `gasReserveAutoTune=ON` → ambil `getGasStats(7 hari)`.
2. Butuh ≥8 sampleTransaksi. Hitung `dailyBurn` rata-rata.
3. Target = `max(floor=0.03 SOL, dailyBurn × bufferDays=14)`.
4. Anti-churn: bila delta < 20% DAN < 0.005 SOL → skip (tak usah ubah config). Cegah toggle gas tiap hari.

**Output F3**: keputusan close / stay per posisi, dengan rule + reason. Close langsung lever A emergency (poller SL/rule 1) atau ke LLM MANAGER (mgmt cycle) → eksekusi F10. STAY → posisi tetap jaga.

**Kalau F3 rusak / diskip**
SL mati → rugi tak terbatas. TP mati → untung tak terkunci. OOR-time mati → modal bocor pelan-pelan (IL dalam). Low-yield mati → modal terkunci di pool yang tak produktif. Lever A mati → emergency SL harus nunggu LLM round-trip (5-30 detik) → SL late → rugi terkunci makin dalam. F3 = palang terakhir antara bot dan rugi runtuh.

**Istilah yang muncul di fase ini**
- **deterministic close rule** — 5 rule mekanis NO-AI; SL→TP→pump→OOR-time→low-yield; rule pertama menang.
- **pnlSuspect** — flag PnL corrupt; skip rule 1/2 (PnL-based), rule 3/4/5 (bin/OOR/yield) tetap jalan.
- **Lever A / `emergencyCloseDirect`** — close paksa STOP_LOSS, LLM-free, NO cooldown, hold `_managementBusy` sendiri; fallback ke `runManagementCycle` ASAP bila gagal.
- **opt-in indicator exit** — gate ganda `enabled && exitEnabled`; upgrade STAY/CLAIM→CLOSE; fail-SAFE (error→null).
- **MIN_SAFE_BINS_BELOW=35** — hard floor bins-below (range modal di bawah harga); enforced 4 lapisan (config.js init + reload + executor safety); vol invalid → throw → deploy abort.
- **gasReserveAutoTune** — opt-in auto-tune gas dari gas burn real 7 hari; cegah churn (Δ<20% AND <0.005 → skip); floor 0.03 SOL.
- **trailing TP/SL** — konfirmasi 15 detik untuk SL/TP, mencegah false trigger spike; F18 tangani via `queuePeakConfirmation` + `schedulePeakConfirmation`.
- **OOR atas vs bawah** — rule 3/4 cuma cek OOR atas (`active_bin > upper_bin`); OOR bawah ditangani F18 dua arah.
- **fail-SAFE exit** — kalau error → no close (tak nuke posisi paksa). Berkebalikan dengan fail-open experiment.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fungsi (file:line → peran)

| file:line | fungsi | peran |
|---|---|---|
| index.js:1198-1248 | `emergencyCloseDirect` | close LLM-free lever A; hold _managementBusy; auto-swap + notify; return {success,skipped,needFallback} |
| index.js:1318-1401 | PnL poller loop body | per posisi: peak-confirm → updatePnlAndCheckExits → SL emergency / non-emerg direct / cooldown mgmt → deterministic rule rerun (rule1 emergency) |
| index.js:1466-1509 | `getDeterministicCloseRule` | 5 rule mekanis prioritas: SL→TP→pump→OOR-time→low-yield, return pertama menang |
| index.js:1511-1528 | `getIndicatorExitSignal` | opt-in exit-preset indicator; upgrade STAY/CLAIM→CLOSE; fail-SAFE null |
| index.js:1572-1580 | `computeBinsBelow` | formula linear bins-below volatilitas, clamp, throw bila vol invalid |
| index.js:403-430 | `maybeAutoTuneGasReserve` | opt-in auto-tune gasReserve dari gas nyata 7d; anti-churn gate |
| state.js:550-597 | `updatePnlAndCheckExits` (F18) | signal exit alert: STOP_LOSS/TRAILING_TP/OUT_OF_RANGE/LOW_YIELD (overlap dg deterministic rule 1/4/5) |
| config.js:35 | `MIN_SAFE_BINS_BELOW` | hard floor 35 bins |
| config.js:220-257 | default threshold | outOfRangeBinsToClose=10, outOfRangeWaitMinutes=30, stopLossPct=-50, takeProfitPct=5, minFeePerTvl24h=7, trailingDropPct=1.5, gasReserveAutoTune=false, gasReserveBufferDays=14, gasReserveFloorSol=0.03 |
| config-schema.js:87-92 | validator | stopLossPct [-100,0], takeProfitPct [0,500], trailingDropPct [0,500] |

## §B. Alur: poll/cycle → rule evaluation → close

```
PnL POLL (setInterval 3s, index.js:1309)
  for p in positions (index.js:1316):
    ── peak-confirm layer (1318-1323): queuePeakConfirmation(p, pnl, {immediate}) bila !suspicious && shouldUsePnlRecheck
    ── exit-alert layer (1324): exit = updatePnlAndCheckExits(p.position, p, cfg.management)   ←F18
    │   ├─ STOP_LOSS (1333)        → emergencyCloseDirect(p, reason)               ← LEVER A no-cooldown
    │   │     success → break | needFallback → runManagementCycle ASAP (1341) | skipped → continue
    │   ├─ TRAILING_TP+needs_confirmation (1326) → queueTrailingDropConfirmation → continue (15s recheck)
    │   ├─ !needs_confirmation (1348) → emergencyCloseDirect(p, reason)            ← non-emerg LLM-free
    │   │     success → break | needFallback → runManagementCycle (1354) | skipped → continue
    │   └─ needs_confirmation + cooldown (1359-1364) → runManagementCycle({silent}) if sinceLastTrigger>=mgmtInterval
    ── deterministic layer (1370): closeRule = getDeterministicCloseRule(p, cfg)   ←F3 here
        ├─ rule === 1 (1373)      → emergencyCloseDirect(p, "stop loss")           ← LEVER A no-cooldown
        │     success → break | needFallback → runManagementCycle (1379) | skipped → continue
        └─ rule 2-5 (1385-1395)   → emergencyCloseDirect(p, reason)
              success → break | needFallback → runManagementCycle (1391) | skipped → continue

MANAGEMENT CRON (*/mgmtInterval, index.js:1253)
  for p in positions (index.js:547-577):
    ── exit-alert layer (531): exit = updatePnlAndCheckExits(...)   ←F18
    │     if TRAILING_TP+confirm → queue + continue (533-538)
    │     exitMap.set(position, exit.reason)
    ── deterministic layer (559): closeRule = getDeterministicCloseRule(p, cfg)
    ── indicator exit (566): indicatorExit = await getIndicatorExitSignal(p)   ←opt-in
    ── priority: exit-alert(if set) > instruction > closeRule > indicatorExit > claim(unclaimed_fees>=minClaim) > STAY
  filter actionPositions(!=STAY) → agentLoop(MANAGER)   ←LLM only bila ada aksi
```

## §C. Sinkron tabel

| Pemanggil | Dipanggil | Trigger | Gate | Fail-mode |
|---|---|---|---|---|
| PnL poll (index.js:1333,1349,1374,1386) | `emergencyCloseDirect` | exit.alert STOP_LOSS / !needs_confirmation / rule1 / rule2-5 | `_managementBusy` (emergency hold) | needFallback → runManagementCycle ASAP no-cooldown |
| PnL poll (index.js:1364) | `runManagementCycle({silent})` | exit needs_confirmation + cooldown lapse | `_pollTriggeredAt` cooldown mgmtInterval | `.catch` log |
| PnL poll (index.js:1324) | `updatePnlAndCheckExits` (state.js) | tiap tick per posisi | `pnl_pct_suspicious` skip anomaly | return null = no exit |
| mgmt cron (index.js:1253) | `runManagementCycle` | `*/mgmtInterval` | `if _managementBusy return` | skip overlap |
| mgmt cycle (index.js:531,559,566) | exit-alert / deterministic / indicator | per posisi in loop | exit→instruction→closeRule→indicator→claim priority | indicator fail-SAFE null |
| `getDeterministicCloseRule` | (pure) | tiap mgmt tick + poll tick | `pnlSuspect` skip rule 1/2 | null return = STAY |
| `getIndicatorExitSignal` | `confirmIndicatorPreset` (chart-indicators) | mgmt tick, opt-in | `indicators.enabled && exitEnabled` | catch → null (no close) |
| `maybeAutoTuneGasReserve` | `getGasStats(7d)` + `persistConfigChange` | (caller cron, post-cycle) | `gasReserveAutoTune`, ≥8 samples, Δ≥20%&≥0.005 | fail-open log |
| `computeBinsBelow` | (pure SCREENER) | deploy-time prompt build | `MIN_SAFE_BINS_BELOW=35` floor | throw → deploy abort |

## §D. Logika kunci per fungsi

### `getDeterministicCloseRule(p, managementConfig)` (index.js:1466-1509)
- **Apa**: 5 mekanis rule NO-AI; return pertama menang, null = STAY.
- **Kapan**: dipanggil poll per-tick (index.js:1370) + mgmt cycle per-posisi (index.js:559).
- **Output**: `{action:"CLOSE", rule:1-5, reason}` atau null.
- **Sinkron**: `pnlSuspect` (1468-1478) — true bila: `pnl_pct_suspicious` OR (`pnl<=-90` AND position masih nilai >0.01 USD). Suspect → skip rule 1/2 (PnL-based) tapi rule 3/4/5 (bin/OOR/yield) tetap jalan.
- **Bukti rule-by-rule**:
  - **Rule 1 — SL** (1480-1482): `!pnlSuspect && pnl_pct != null && pnl_pct <= stopLossPct` → `{rule:1, reason:"stop loss"}`. Default -50 (config.js:230).
  - **Rule 2 — TP** (1483-1485): `!pnlSuspect && pnl_pct != null && pnl_pct >= takeProfitPct` → `{rule:2, reason:"take profit"}`. Default 5 (config.js:231).
  - **Rule 3 — Pumped-far-OOR** (1486-1492): `active_bin != null && upper_bin != null && active_bin > upper_bin + outOfRangeBinsToClose` → `{rule:3, reason:"pumped far above range"}`. Default bins offset 10 (config.js:220). BIN-based, bukan waktu.
  - **Rule 4 — OOR-time** (1493-1500): `active_bin > upper_bin && (minutes_out_of_range ?? 0) >= outOfRangeWaitMinutes` → `{rule:4, reason:"OOR"}`. Default 30m (config.js:221). Cat: cek `active_bin > upper_bin` saja (rule 3 Sudara symmetr — pump atas; rule 4 OOR atas-saja bila di bawah? — UNKNOWN: rule 4 tak-cover OOR di bawah range; lihat Open-Q #2).
  - **Rule 5 — Low-yield** (1501-1507): `fee_per_tvl_24h != null && fee_per_tvl_24h < minFeePerTvl24h && (age_minutes ?? 0) >= 60` → `{rule:5, reason:"low yield"}`. Default 7 (config.js:232). Hard age floor 60m inline (konflik dengan config `minAgeBeforeYieldCheck`? — lihat Open-Q #4).
- **Fail-mode**: null return = STAY. `pnlSuspect` short-circuit rule 1/2 only — bin/OOR/yield tetap jalan (fail-tetap-protektif).

### `getIndicatorExitSignal(position)` (index.js:1515-1528)
- **Apa**: exit-preset indicator upgrade STAY/CLAIM → CLOSE. Opt-in default OFF.
- **Kapan**: mgmt cycle (index.js:566), SETELAH `getDeterministicCloseRule` — jadi SL/TP/OOR/yield tetap dominan.
- **Output**: `{action:"CLOSE", rule:"indicator", reason}` atau null.
- **Sinkron**: gate ganda `config.indicators.enabled && config.indicators.exitEnabled` (1516). `confirmIndicatorPreset({mint, side:"exit"})` — bila `confirmation.enabled && confirmed && !skipped` → CLOSE (1521). `skipped` (API down) → null (fail-SAFE = no close, CLAUDE.md:184).
- **Fail-mode**: catch → log "indicators_warn" + return null (1524-1526). Tidak upgrade, tidak nuke posisi.
- **Bukti**: index.js:1516-1528.

### `computeBinsBelow(volatility)` (index.js:1572-1580)
- **Apa**: rumus linear binsBelow dari volatilitas, dipakai SCREENER prompt (prompt.js:153) + deploy fallback (dlmm.js:677, executor.js).
- **Output**: integer bins-below clamp.
- **Formula**: `Math.max(lo, Math.min(hi, Math.round(lo + (vol/5)*(hi-lo))))` — `lo=minBinsBelow, hi=maxBinsBelow` (1577-1579). Clamp dua-arah.
- **Sinkron**: `lo` enforced `>= MIN_SAFE_BINS_BELOW=35` (config.js:43,47; reloadScreeningThresholds config.js:651). `hi` enforced `>= lo` (config.js:652). Vol tak-finite/<=0 → `throw` (1574-1576) → deploy abort (fail-SAFE menolak vol corrupt).
- **Default**: minBinsBelow default=35 (config.js:43), maxBinsBelow dari user-config (no builtin default — wajib set). Vol=0 atau NaN → throw.
- **Bukti**: index.js:1572-1580, config.js:35-47, prompt.js:153.

### `maybeAutoTuneGasReserve()` (index.js:403-430)
- **Apa**: auto-tune `gasReserve` dari REAL gas-burn 7d. Opt-in.
- **Kapan**: caller cron post-cycle (F2 hint). Gated `config.management.gasReserveAutoTune` (405). Default false (config.js:240).
- **Output**: `persistConfigChange("management","gasReserve","gasReserve",target)` (418). Side-effect: config live mutated + persisted.
- **Sinkron**: ambil `getGasStats(Date.now()-7d)` (407); `if !stats.hasData || stats.count<8` skip (408). `dailyBurn = stats.sol/spanDays` (411); `spanDays=min(7,max(1,...))`. `target=max(floor,dailyBurn*bufferDays)` (415). Anti-churn: `if |Δ|/max(current,0.001) < 0.2 OR |Δ| < 0.005` skip (417).
- **Fail-mode**: catch → log "cron_error" + fail-open (gasReserve tak diubah) (427-429).
- **Konfigurasi**: gasReserveBufferDays default 14, gasReserveFloorSol 0.03 (config.js:241-242).
- **Bukti**: index.js:403-430.

## §E. Temuan

### E.1 — Prioritas rule mekanis benar
- 5 rule return pertama menang (sequential fall-through, index.js:1480→1507). SL cek dulu → TP → pump → OOR-time → yield. Prioritas matematis paksa: SL takkan ditutup oleh TP toggle dll.
- `pnlSuspect` short-circuit rule 1/2 saja (PnL-based); bin/OOR/yield (rule 3/4/5) tetap jalan walau harga corrupt — protektif.

### E.2 — Lever A emergency bypass cooldown — koherensi dua jalur
- **Poller path**: STOP_LOSS (1333) + rule 1 (1373) → `emergencyCloseDirect` LLM-free, NO cooldown (1342,1380 fallback tanpa cek `_pollTriggeredAt`). Tepat: SL latency = rugi terkunci.
- **Mgmt path**: rule 1 → actionMap CLOSE → `agentLoop(MANAGER)` (605) → LLM `close_position`. Lebih lambat (LLM round-trip) tapi ◯ lebih konservatif. Catatan: SL dlm mgmt cycle bisa double-dipicu poller dulu (lever A) sebelum cron tick → mgmt cycle lihat posisi sudah closed → skip. Aman.
- Bukti: poll 1333-1345 vs mgmt 547-577; emergency comment 1198-1206.

### E.3 — Opt-in indicator exit ganda + prioritas lemah (per design)
- Gate ganda `enabled && exitEnabled` (1516) — dua flag menonaktifkan eksplisit. Default OFF → factory prompt byte-identik.
- Hanya upgrade STAY/CLAIM, BUKAN override SL/TP/OOR (urutan index.js:549-576). Fail-SAFE: error/skip → null. CLAUDE.md:183 benar.
- Implikasi: indicator exit takkan tutup posisi SL-late atau OOR-confirmed — deterministic rule menang oleh爱国.

### E.4 — Formula bins-below: clamp + hard floor + throw
- `MIN_SAFE_BINS_BELOW=35` enforced di 4 lapisan: config.js:47 (init), config.js:651 (reload), executor.js:563,656 (update_config), executor.js:916 (safety check deploy). Defense-in-depth.
- Vol invalid → throw (1574) → SCREENER/deploy abort, bukan default ke 0. Fail-SAFE menolak vol corrupt.
- Clamp dua-arah `Math.max(lo,Math.min(hi,...))`: bila vol besar (>5*(hi-lo)) → hi; bila kecil → lo. Linear, bukan tiered (CLAUDE.md:153).

### E.5 — Anti-churn gasReserve turun-naik kecil
- Gate `|Δ|/current < 0.2` DAN `|Δ| < 0.005` (417) — keduanya harus skip. Arti: bila target dekat current → no-op. Hanya regen bila delta material. Cegah toggling газ tiap hari.
- `count<8` (408) menjamin sample cukup sebelum melangkah. `floor=0.03` SOL bawah-tak-turun — takkan mati-mati kering.

### E.6 — Risk: rule 4 tak-cover OOR di bawah range
- Rule 4 (1493-1500): `active_bin > upper_bin`. OOR di **bawah** range (`active_bin < lower_bin`) — tak triggered rule 4. Rule 3 juga atas-saja (`active_bin > upper_bin + offset`).
- OOR di bawah hanya ke-trigger lewat `updatePnlAndCheckExits` F18 (`out_of_range_since` set dua arah di state.js:536-548, lalu cek minutesOOR di state.js:574-581 `OUT_OF_RANGE`). Jadi polصل: mgmt cycle lihat F18 OUT_OF_RANGE → close via LLM; poller lihat F18 OUT_OF_RANGE → `emergencyCloseDirect` (1348). Aman, tapi deterministic rule 4 di sini hanya atas-OOR — redundancy partial. Open-Q #2.

### E.7 — Low-yield age floor inline vs config
- Rule 5 hardcode `age_minutes >= 60` (1504). State.js F18 pakai `minAgeBeforeYieldCheck ?? 60` (586). Bila user set `minAgeBeforeYieldCheck=120` di config, F18 hormati tapi `getDeterministicCloseRule` rule 5 tak hormati (60 fixed). Inkonsistensi. Open-Q #4.

## §F. Glosarium fase
- **deterministic close rule** — 5 rule NO-AI mekanis; rule 1 SL, 2 TP, 3 pump-OOR-bins, 4 OOR-time, 5 low-yield.
- **pnlSuspect** — flag PnL corrupt (`pnl_pct_suspicious` OR p<=−90 dengan nilai tersisa); skip rule 1/2.
- **Lever A emergency** — `emergencyCloseDirect` LLM-free no-cooldown, hold `_managementBusy`, fallback mgmt ASAP bila gagal.
- **opt-in indicator exit** — gate ganda `indicators.enabled && exitEnabled`, upgrade STAY/CLAIM→CLOSE, fail-SAFE null.
- **MIN_SAFE_BINS_BELOW=35** — hard floor bins-below, multi-layer clamping.
- **binsBelow formula** — `round(lo + (vol/5)*(hi-lo))` clamp `[lo,hi]`, throw bila vol invalid.
- **gasReserveAutoTune** — opt-in auto-tune dari real gas-burn 7d, anti-churn gate (Δ≥20% & ≥0.005 SOL).
- **cooldown poll→mgmt** — `_pollTriggeredAt` cooldown `managementIntervalMin*60s` (non-emergency hanya).
- **OOR atas vs bawah** — rule 3/4 hanya atas; bawah lewat F18 OUT_OF_RANGE saja.
- **fail-SAFE exit** — error → no close (tak nuke posisi).

## §G. Open-Q (bawa ke F7/F9/F18/F15)

1. **[F18 verify]** `updatePnlAndCheckExits` (state.js:550-597) overlap dengan `getDeterministicCloseRule` rule 1/4/5 — logic sama (`stopLossPct`, `outOfRangeWaitMinutes`, `minFeePerTvl24h`) tapi beda path. Poller pakai F18 exit-alert dulu (1324), baru deterministic layer (1370) — bila F18 sudah return STOP_LOSS, deterministic rule 1 tak di-reach tapi lever A emergencyCloseDirect sama. Bisakah kedua lapis return berbeda verdict (F18 STOP_LOSS vs rule misal pump-OOR)? — konsumsi dua kali `getTrackedPosition`. Cross-ref F18.

2. **[F11]** Rule 4 `active_bin > upper_bin && minutes_out_of_range >= outOfRangeWaitMinutes` HANYA atas-OOR. OOR bawah (`active_bin < lower_bin`) tidak ke-trigger rule 4 maupun rule 3. Mitigasi lewat F18 `OUT_OF_RANGE` dua-arah (state.js:536-548 set `out_of_range_since` baik atas maupun bawah). Pertanyaan: menit OOR di state.js — dihitung dari `out_of_range_since` saja, atau ada reset saat back-in-range? Bukti state.js:536-548 ada reset (`pos.out_of_range_since = null` bila in_range). Cross-ref F11.

3. **[F15]** `confirmIndicatorPreset({side:"exit"})` beda preset dengan entry? CLAUDE.md:185 bilang `exitPreset` inert bila `exitEnabled=false`. Definisi 8 preset di chart-indicators.js — `side:"exit"` pilih preset mana? Bila user set `exitPreset=rsi_reversal` tapi entry=`supertrend_break`, apakah exit cek di preset berbeda? Cross-ref F15.

4. **[F7/F9]** Low-yield rule 5 hardcode `age_minutes >= 60` (index.js:1504) tapi F18 `minAgeBeforeYieldCheck ?? 60` (state.js:586). Bila user set `minAgeBeforeYieldCheck=120`, deterministic rule 5 tutup lebih cepat dari F18 LOW_YIELD. Sinkron-config bug? Cross-ref F7 config-schema, F9 sinkron.

5. **[F15]** Indicator exit hanya upgrade STAY/CLAIM (index.js:566). Tapi trigger point mgmt (566) — bila F18 exit-alert SUDAH set (531), atau closeRule SUDAH set (559), indicator exit (566) tak di-reach? Lihat prioritas 549-576: `if (exitMap.has) → CLOSE rule=exit` (549), baru `closeRule` (559), baru `indicatorExit` (566). Code-path: `else if (closeRule) ... else if (indicatorExit) ...`. Konfirmasi struktur if-else sudah benar (indicator exit takkan override deterministic). Cross-ref F15.

*F3 selesai 2026-07-06. Read-only. Kode/config tak diubah saat menyusun.*