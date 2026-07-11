# Audit F1 — Cron Orchestration + Entry + Race Guard
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: sedang — alasan: timer/scheduler mekanis-matematis, sedikit reasoning cross-file. Cron block + entry + race guard + ecosystem config.
> Cross-ref: F0 (peta), F2 (cycles isi), F3 (exits), F18 (poll trigger exit).

## Ringkasan eksekutif
1. Entry `index.js` → cek `isMain` (PM2 atau direct node index.js) → log startup + `ensureAgentId` + hive bootstrap. Cron di-start di bottom (TTY REPL dulu, non-TTY langsung).
2. PM2 = 1 entry script `index.js`, 2 app definitions: `meridian` (default) + `meridian-meridianzenbot3` (env `MERIDIAN_DATA_DIR` + `MERIDIAN_PROFILE` → profil keduanya).
3. 7 cron tasks: management, screening, health (hourly), daily briefing 01:00 UTC, briefing-watchdog tiap 6h, weekly Mon 01:30 UTC, monthly 1st 02:00 UTC. PnL poll = `setInterval` (bukan cron), default 3s.
4. 4 guard race: `_managementBusy` (skip overlap management), `_screeningBusy` (skip overlap screening), `_screeningLastTriggered` (cegah management spam screening), `_pollTriggeredAt` (cooldown poll→management non-emergency).
5. **Adaptive screening** opt-in: `shouldRunScheduledScreening` skip tick kalau sesi WIB "weak" + interval efektif belum lapse. Management + PnL poll tak pernah di-throttle. Event-driven screening (freed slot) bypass gate.

## Progress
- [x] Header + ringkasan
- [x] §A Peta file fase
- [x] §B Alur entry → cron → poll
- [x] §C Sinkron cron + guard
- [x] §D Logika kunci per fungsi
- [x] §E Temuan
- [x] §F Glosarium
- [x] §G Open-Q
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Jam digital banyak alarm*: bayangin jam meja punya 7 alarm sekaligus — tiap 10 menit, tiap 30 menit, tiap jam, jam 1 pagi, Senin jam 1:30, tanggal 1 jam 2 pagi, dan alarm diam tiap 3 detik. Saat alarm bunyi, dia bangunin siklus tertentu. Tiap alarm punya tugas sendiri, tak saling tumpang.
- *Kru teater pakai tanda "JANGAN GANGGU"*: tiap aktor yang lagi main di panggung gantung tanda "busy" di pintu kamar. Aktor lain yang lewat lihat tanda → mundur, nanti aja. Kalau semua sudah free → baru panggil. Kalau satu aktor ngerasa kebangetan darurat (api di panggung) → dia masuk paksa lewat jalur emergency, ikut pakai tanda busy sendiri biar tak diganggu.

**Di bot, ini = cron orchestration + race guard**: 7 cron task (node-cron) + 1 setInterval PnL poll + 4 flag busy (`_managementBusy`, `_screeningBusy`, `_pnlPollBusy`, `_screeningLastTriggered` cooldown) + 1 jalur emergency lever A (close paksa STOP_LOSS tanpa LLM, no cooldown).

**Posisi fase ini di alur bot**
F1 = fondasi timer. Sebelum `runManagementCycle` (F2) jalan, cron harus sudah register dulu lewat `startCronJobs`. Sebelum PnL poll cek exit (F18), `setInterval` harus sudah jalan. F1 datang PALING AWAL di boot sequence (setelah envcrypt + import). Tanpa F1, semua siklus mati — bot hidup tapi tidur. Lapisan 3 (Mesin trading) di peta F0.

**Langkah kerja F1**
1. PM2 boot → `node index.js` (atau REPL kalau TTY, atau `meridian start` lewat CLI).
2. `envcrypt.js` jalan duluan — decrypt `.env` (private key, API key).
3. Deteksi `isMain` (apakah ini entry script atau cuma di-import). Kalau entry → log startup + `ensureAgentId` + `bootstrapHiveMind` (fire-and-forget).
4. `startPolling` Telegram启动 — long-poll `getUpdates` 30s, dispatch fire-and-forget (tak block loop).
5. `startCronJobs` → register 7 cron: management (*/10m), screening (*/30m), health (tiap jam), briefing harian (01:00 UTC), watchdog (6h), weekly (Senin 01:30), monthly (tgl 1 02:00).
6. `setInterval` PnL poll tiap 3 detik → baca posisi on-chain + cek exit mekanis (STOP_LOSS / trailing / OOR / low-yield).
7. Tiap alarm bunyi → cek flag busy dulu (`_managementBusy` etc): kalau ada → skip tick, nanti alarm berikut; kalau free → jalanin cycle.
8. Kalau alarm emergency (STOP_LOSS di poll) → jalur lever A: close paksa, no LLM, no cooldown, hold flag busy sendiri.
9. Adaptive screening (opt-in): kalau sesi WIB lemah → screening cron skip tick, stretch ke interval atap. Management + poll tak pernah di-throttle.

**Output F1**: bot hidup dengan 8 alarm aktif, terjadwal, ada penjagaan anti-overlap. Mulai sini, dengan (F2) yang meng-ISI tiap cycle dan (F18) yang ngisi exit poll.

**Kalau F1 rusak / diskip**
Bot startup tapi tak ada alarm — `runManagementCycle` tak terbangun → SL tak ke-trigger, fee tak ditarik, OOR tak dideteksi, briefing tak kirim. Posisi biarkan terbuka tanpa pemantauan → bisa rugi tanpa ada yang tutup. Atau balik: race guard mati → dua cycle jalan bareng → double-deploy atau double-close → modal bocor on-chain. F1 = syarat semua F2+ jalan.

**Istilah yang muncul di fase ini**
- **cron** — node-cron scheduler yang bunyi tiap pattern `*/N * * * *` (menit/jam/hari/bulan/minggu). Bukan setInterval.
- **setInterval** — timer JS bawaan yang ulang tiap N ms. PnL poll pakai ini (3 detik), bukan cron, supaya lebih cepat dari ketelitian menit.
- **PM2 fork mode** — process manager; 1 process per app. `ecosystem.config.cjs` definisikan 2 app (`meridian` + `meridianzenbot3`) → 2 profil jalan dari repo sama.
- **race guard / busy flag** — tanda "JANGAN GANGGU" — `_managementBusy`, `_screeningBusy`, `_pnlPollBusy`. Skip tick kalau ada yang hold.
- **cooldown** — jeda minimum antar trigger serupa. `_pollTriggeredAt` = cooldown poll→management non-emergency.
- **adaptive screening** — gate opt-in (`schedule.adaptiveScreening`) yang stretch interval screening ke interval atap saat sesi WIB lemah. Cuma throttle cron screening; management + poll tak pernah di-throttle.
- **emergency lever A** — close paksa STOP_LOSS via `emergencyCloseDirect`, tanpa LLM, tanpa cooldown, hold `_managementBusy` sendiri. Darurat.
- **missed-briefing watchdog** — cron tiap 6h + startup cek → briefing tak skipped walau crash/restart.
- **isMain / isTTY** — flag deteksi: entry script vs di-import, mode interaktif vs PM2 direct.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A — PETA FILE FASE INI

| File | Baris | Peran |
|------|-------|-------|
| `index.js` | 3906 | Entry, imports, `isMain` startup block (80-96), `timers` object (104), race state vars (131-141), `startCronJobs` (1250-1407), `stopCronJobs` (465), `effectiveScreeningIntervalMin` (1175), `shouldRunScheduledScreening` (1188), REPL block (1583-1589), bottom entry TTY vs non-TTY (3893-3906) |
| `ecosystem.config.cjs` | 46 | PM2 2 app definitions: `meridian` + `meridian-meridianzenbot3` (后者 bawa env `MERIDIAN_DATA_DIR=profiles/meridianzenbot3` + `MERIDIAN_PROFILE`) |
| `telegram.js` | 622 | Polling loop `poll` (470-514) long-poll `getUpdates?timeout=30`, `dispatch` fire-and-forget (464-468), `startPolling` (556), `BOT_COMMANDS` register (516-540), `isAuthorizedIncomingMessage` (68-96) |
| `cli.js` | 354 | CLI entry `meridian start` → dynamic `import("./index.js")` → `startCronJobs()` (345-350) |
| `tools/executor.js` | — | `registerCronRestarter(fn)` (200) → dipanggil index.js:3510 untuk restart cron saat `update_config` ubah interval |

---

## §B — ALUR ENTRY → CRON → POLL

```
[PM2: pm2 start ecosystem.config.cjs]
   ├── app "meridian" (default)     → node index.js (cwd=repoRoot)
   └── app "meridian-meridianzenbot3" → node index.js +  env MERIDIAN_DATA_DIR=profiles/meridianzenbot3
                                        + MERIDIAN_PROFILE=meridianzenbot3

[index.js top-level]
   1. import "./envcrypt.js" (decrypt .env)                line 1
   2. imports 51 modul                                       line 2-78
   3. const isMain = pm_id != null || entry === indexPath    line 82-83
   4. if (isMain): log startup + ensureAgentId + hive bootstrap  line 85-96
   5. const timers = { managementLastRun, screeningLastRun: null }  line 104
   6. race state: _cronTasks, _managementBusy, _screeningBusy,
      _screeningLastTriggered, _pollTriggeredAt, _peakConfirmTimers,
      _trailingDropConfirmTimers                          line 131-141
   7. function decl: runManagementCycle, runScreeningCycle,
      getDeterministicCloseRule, startCronJobs, stopCronJobs, ...  line 471, 555, 1255, 1250, 465

[Bottom entry — line 3513-3906]
   const isTTY = process.stdin.isTTY                        line 1585 (deklar)
   branch A: isTTY → readline REPL (3513) + await user first command (start/pause/resume/etc) → set cronStarted=true + startPolling(telegramHandler)
   branch B: !isTTY (isMain) → startCronJobs() (3896) + maybeRunMissedBriefing (3897) + startPolling (3898) + runScreeningCycle() initial (3901)

[startCronJobs — line 1250]
   ├── stopCronJobs() dulu (clean slate)
   ├── cron mgmt:  */N * * * *   → if !_managementBusy: timers.mgmtLastRun=now; runManagementCycle()
   ├── cron screen: */N * * * *  → if shouldRunScheduledScreening(): runScreeningCycle()
   ├── cron health: 0 * * * *    → agentLoop("HEALTH CHECK", MANAGER)
   ├── cron briefing: 0 1 * * * (UTC) → runBriefing()
   ├── cron watchdog: 0 */6 * * * (UTC) → maybeRunMissedBriefing()
   ├── cron weekly:  30 1 * * 1 (UTC) → runPeriodicBriefing("week")
   ├── cron monthly: 0 2 1 * * (UTC) → runPeriodicBriefing("month")
   └── setInterval PnL poll tiap 3s (line 1309-1401)

[PnL poll — line 1309-1401]
   if (_managementBusy || _screeningBusy || _pnlPollBusy) return
   if getTrackedPositions(true).length === 0 return
   _pnlPollBusy = true
   result = getMyPositions({force:true, silent:true})
   for tiap posisi p:
      ├── queuePeakConfirmation (jaga trailing peak)
      ├── exit = updatePnlAndCheckExits(p.position, p, config.management)
      ├── if exit.action == STOP_LOSS  → emergencyCloseDirect(p) (lever A, LLM-free, NO cooldown)
      ├── if !exit.needs_confirmation  → emergencyCloseDirect(p) (LLM-free)
      ├── if exit.needs_confirmation (TRAILING_TP) → queueTrailingDropConfirmation + scheduleTrailingDropConfirmation
      ├── cooldown check: if sinceLastTrigger >= mgmtInterval cooldown → runManagementCycle({silent})
      └── getDeterministicCloseRule(p) → rule 1 (stop loss) → emergencyCloseDirect; rule != 1 → emergencyCloseDirect
   _pnlPollBusy = false

[Telegram poll — telegram.js:470]
   while _polling:
     fetch getUpdates?offset=_offset&timeout=30 (35s AbortSignal)
     for update:
       if callback_query → dispatch onMessage (fire-and-forget)
       if msg.text → isAuthorizedIncomingMessage? → dispatch onMessage
     error → sleep 5s + continue
```

---

## §C — SINKRON CRON + GUARD

| Pemanggil | Dipanggil | Trigger | Guard | Fail-mode |
|----------|-----------|---------|-------|-----------|
| PM2 `ecosystem.config.cjs` | `node index.js` | boot | `autorestart:true, max_restarts:10, min_uptime:10s` | crash → restart dgn delay 5s |
| `cli.js start` (345) | `startCronJobs` | user `meridian start` | — | — |
| index.js bottom entry TTY (3585+) | `startCronJobs` | user ketik `start` di REPL | `cronStarted` flag | — |
| index.js bottom non-TTY (3896) | `startCronJobs` | boot PM2 | `isMain && !isTTY` | — |
| `update_config` (executor.js) via `registerCronRestarter` (200) | `startCronJobs` ulang | interval changed | stopCronJobs dulu (1251) | interval tak berubah → tak restart |
| cron management (1253) | `runManagementCycle` | tiap N menit | `if _managementBusy return` (1254) | overlap skip |
| cron screening (1259) | `runScreeningCycle` | tiap N menit | `shouldRunScheduledScreening()` (1260) | adaptive skip + log |
| cron health (1267) | `agentLoop HEALTH CHECK MANAGER` | tiap jam | `if _managementBusy return` (1268) | — |
| cron briefing (1286) | `runBriefing` | 01:00 UTC | — (telegramEnabled check di dalam) | error log, tak stop |
| cron watchdog (1291) | `maybeRunMissedBriefing` | tiap 6h | `getLastBriefingDate`一圈 (387) | — |
| cron weekly/monthly | `runPeriodicBriefing` | Mon 01:30 / 1st 02:00 UTC | `getLastPeriodicBriefing(period)` dedup | — |
| `setInterval` PnL poll (1309) | `getMyPositions` + `updatePnlAndCheckExits` | tiap 3s | `_managementBusy OR _screeningBusy OR _pnlPollBusy` (1310) | `getMyPositions().catch(() => null)` silent |
| PnL poll emergency (1334) | `emergencyCloseDirect` | exit.action STOP_LOSS | `_managementBusy` held by emergency fn | fall back ke `runManagementCycle` bila gagal |
| PnL poll non-emergency confirm (1364) | `runManagementCycle({silent})` | exit.needs_confirmation | cooldown `_pollTriggeredAt` (1359) | — |
| telegram poll `dispatch` (telegram.js:464) | `onMessage` (telegramHandler index.js) | inbound msg/callback | `busy` guard di telegramHandler | fire-and-forget, tak block poll loop |

---

## §D — LOGIKA KUNCI PER FUNGSI

### `isMain` (index.js:80-83)
- Apa: deteksi entry vs di-import
- Kapan: module-load
- Output: boolean
- Bukti: `process.env.pm_id != null || entrypath === indexPath`

### `startCronJobs` (index.js:1250-1407)
- Apa: register 7 cron + 1 setInterval PnL poll
- Kapan: boot non-TTY, user `start` REPL, `update_config` interval change via restarter
- Output: `_cronTasks` array + interval ref attached `_pnlPollInterval`
- Sinkron: `stopCronJobs` dulu (1251). `registerCronRestarter` (executor.js:200) callback ke `() => { if (cronStarted) startCronJobs() }` (index.js:3510)
- Fail-mode: tiap cron task punya try/catch internal (`runScreeningCycle` etc), tak crash node-cron
- Bukti: line 1250-1407

### `stopCronJobs` (index.js:465-469)
- Apa: stop semua cron + clear setInterval
- Sinkron: `task.stop()` node-cron API + `clearInterval(_pnlPollInterval)`
- Bukti: 465

### `shouldRunScheduledScreening` (index.js:1188-1196)
- Apa: gate screening cron tick — adaptive throttle
- Kapan: cron screening tick (1260)
- Output: boolean (skip kalau weak session + eff interval belum lapse)
- Sinkron: baca `timers.screeningLastRun`, `config.schedule.adaptiveScreening`, `effectiveScreeningIntervalMin`, `currentWibSession().key`, `classifySession`
- Bukti: 1188-1196

### `effectiveScreeningIntervalMin` (index.js:1175-1180)
- Apa: eff interval = weak session ? ceil : floor
- Output: menit
- Fail-open: `!adaptiveScreening` → return base (floor)
- Bukti: 1175-1180

### `poll` Telegram (telegram.js:470-514)
- Apa: long-poll getUpdates 30s, dispatch fire-and-forget
- Kapan: `startPolling` (556) → `_polling=true; poll(onMessage)`
- Output: panggil `onMessage(msg)` via `dispatch` (tak await → tak block loop)
- Sinkron: `isAuthorizedIncomingMessage` filter chat_id + ALLOWED_USER_IDS
- Fail-mode: error → sleep 5s + continue (tak stop loop)
- Bukti: 470-514

### `isAuthorizedIncomingMessage` (telegram.js:68-96)
- Apa: filter inbound Telegram — chat_id match + (private OK / group perlu ALLOWED_USER_IDS)
- Output: boolean
- Sinkron: `chatId` dari resolveChatId (env atau user-config.json), `ALLOWED_USER_IDS` dari env `TELEGRAM_ALLOWED_USER_IDS`
- Bukti: 68-96
- **Catatan safety**: auto-registration dimatikan — kalau `chatId` tak set, semua msg ditolak + warning sekali

### PnL poll race guard (index.js:1309-1401)
- Apa: setInterval tiap 3s → update trailing + cek exit + trigger close
- Guard: `_pnlPollBusy` (skip overlap poll), `_managementBusy` (skip bila management jalan), `_screeningBusy` (skip bila screening jalan)
- Emergency path (STOP_LOSS / rule 1): `emergencyCloseDirect` **lever A** = LLM-free, NO cooldown, hold `_managementBusy` sendiri. Bila gagal → fallback `runManagementCycle({silent})` ASAP no cooldown
- Non-emergency confirm path: cooldown `_pollTriggeredAt` = `managementIntervalMin × 60s` (1359) → cegah poll spam management
- Bukti: 1309-1401, emergency comment 1198-1204

---

## §E — TEMUAN

### E.1 PM2 fork mode + 2 profil
- `ecosystem.config.cjs` definisikan 2 app: `meridian` (default env) + `meridian-meridianzenbot3` (env `MERIDIAN_DATA_DIR=profiles/meridianzenbot3`). Dua-duanya `exec_mode: fork`, `instances: 1`. Artinya: 2 instance terpisah profil dijalankan bareng dari repo sama (unknown apakah keduanya aktif saat ini — butuh `pm2 list` eksternal).
- Bukti: ecosystem.config.cjs:6-44

### E.2 Cron restart via update_config
- `registerCronRestarter` (executor.js:200) → callback di-index.js:3510 `() => { if (cronStarted) startCronJobs() }`. Jadi `update_config` yang ubah `managementIntervalMin`/`screeningIntervalMin` → trigger `stopCronJobs` + `startCronJobs` ulang. Tak perlu restart PM2.
- Bukti: index.js:3510, executor.js:200

### E.3 Race guard berlapis (4 level)
- `_managementBusy`, `_screeningBusy`, `_pnlPollBusy`, `_pollTriggeredAt` cooldown. **Emergency lever A (STOP_LOSS) bypass cooldown** tapi tetap hold `_managementBusy` sendiri → management cron skip (tak double-close).
- Bukti: 131-141, 1309-1401, comment 1198-1204

### E.4 Adaptive screening = screening-only, never throttles management/poll
- `shouldRunScheduledScreening` gate ONLY cron screening (1260). Management cron (1254) + PnL poll (1309) tak pernah cek gate ini.
- Event-driven screening (management cycle free-slot trigger, line 509 `runScreeningCycle`) bypass gate — `shouldRunScheduledScreening` tak dipanggil di path itu.
- Bukti: 1259-1265 vs 509

### E.5 Idle-screening cooldown experiment
- Saat management cycle nemu 0 posisi → trigger `runScreeningCycle` (509). Eksperimen `idleScreeningCooldown` (default OFF) bisa throttle ini biar tak LLM call tiap 10 menit saat long dry spell. Shares `_screeningLastTriggered` dengan scheduled screening → cron scheduled tetap jalan di bawah.
- Bukti: 488-506

### E.6 Briefing watchdog + missed-briefing pada startup
- Cron tiap 6h cek `maybeRunMissedBriefing` (1291). Startup juga langsung panggil (3897). Jadi briefing tak pernah skipped walau crash/restart.
- Bukti: 1291-1293, 3897

### E.7 Hive bootstrap fire-and-forget
- `bootstrapHiveMind().catch(...)` (94) + `startHiveMindBackgroundSync()` (95) → kalau hive gagal, hanya log warning, tak block startup. HiveMind optional.
- Bukti: 94-95

### E.8 Bot commands register tiap startPolling
- `startPolling` (telegram.js:556) → `registerCommands()` set `setMyCommands` Telegram API. Tiap restart re-register — idempoten.
- Bukti: telegram.js:542-554

### E.9 Telegram dispatch fire-and-forget = tak deadlock
- `dispatch` (telegram.js:464) = `Promise.resolve().then(onMessage)` tanpa await → poll loop tak block. Penting: handler bisa await user input (button confirm); kalau await di poll loop, polling tak bisa fetch button press yang sama → deadlock.
- Bukti: 462-468, comment 489

### E.10 CLI `meridian start` = cron start saja (no REPL)
- `cli.js start` (345) → dynamic import `index.js` → langsung `startCronJobs`. Tak start REPL, tak start polling telegram. Berbeda path dengan index.js entry non-TTY (yang juga startPolling + initial screening).
- Bukti: cli.js:345-350 vs index.js:3893-3905
- **UNKNOWN**: apakah `cli.js start` ini dipakai di produksi atau masih unused? Perlu cek npm scripts / pm2 config.

---

## §F — GLOSARIUM FASE

| Term | Def |
|------|-----|
| **cron** | node-cron scheduler — pattern `*/N * * * *` (menit jam hari bulan minggu) |
| **setInterval** | timer JS — ulang tiap N ms. PnL poll pakai ini (bukan cron) |
| **PM2 fork mode** | 1 process per app. `ecosystem.config.cjs` define apps |
| `MERIDIAN_DATA_DIR` | env override folder data per-profil (profil isolasi) |
| `MERIDIAN_PROFILE` | env label profil |
| **`_managementBusy`** | flag anti-overlap management cycle |
| **`_screeningBusy`** | flag anti-overlap screening cycle |
| **`_screeningLastTriggered`** | epoch ms — cegah management spam trigger screening |
| **`_pollTriggeredAt`** | epoch ms — cooldown poll-triggered management (non-emergency) |
| **`_pnlPollBusy`** | flag anti-overlap PnL poll |
| **Lever A / emergency close** | direct close STOP_LOSS tanpa LLM, no cooldown, hold `_managementBusy` |
| **adaptive screening** | opt-in `schedule.adaptiveScreening` — throttle scheduled screening saat WIB weak session |
| **missed briefing watchdog** | cron tiap 6h + startup cek → briefing tak skipped |
| `isMain` | flag ini module yang di-run (vs di-import) |
| `isTTY` | stdin TTY = interactive REPL, non-TTY = PM2 direct |

---

## §G — CROSS-REF + OPEN-Q

**Cross-ref:**
- F2 — isi `runManagementCycle` (471) + `runScreeningCycle` (555)
- F3 — `getDeterministicCloseRule` (1255) detail rules
- F8 — `update_config` trigger cron restart via `registerCronRestarter`
- F18 — `updatePnlAndCheckExits` (state.js:473) yang poll panggil tiap 3s
- F30 — telegram polling + handler detail

**Open-Q bawa ke F2/F3/F18:**
1. Saat management + screening cron tick bareng (misal 10+30 menit kelipatan), `_screeningBusy` / `_managementBusy` independence — siapa dulu? (F2 detail)
2. PnL poll 3s → `getMyPositions({force:true})` tiap 3s = heavy RPC load. Dapat throttle? (F11/F18)
3. Emergency lever A `emergencyCloseDirect` — di mana definisi? Apakah benar hold `_managementBusy` atau race dengan cron management? (F10 close detail)
4. `idleScreeningCooldown` saat 0 posisi → path ke `runScreeningCycle` ignore adaptive gate. Bisa double-call dari cron screening bareng? (F2)
5. Bot double-instance (meridian + meridianzenbot3) → 2 wallet berbeda? RPC sama? (butuh cek `.env` per-profil, F29)
6. `cli.js start` tanpa polling → jalur bagaimana user kontrol? (F30, atau emang tak dipakai produksi)

---

*F1 selesai 2026-07-06. Read-only. Kode/config tak diubah saat menyusun.*