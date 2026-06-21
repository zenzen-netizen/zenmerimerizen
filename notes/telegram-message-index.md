# INDEKS LENGKAP SEMUA PESAN TELEGRAM (FASE 1)

> READ-ONLY. Workstream 🅴 Phase 2. Disusun 2026-06-21 dari pembacaan LOCAL
> `index.js`, `telegram.js`, `tools/executor.js`, `tools/dlmm.js`, `lessons.js`.
> Tujuan: tiap titik kirim Telegram terindeks + field lengkap → jadi checklist
> migrasi ke layer `views/` (lihat TABEL SCOPE di akhir).
>
> **Konvensi:** entri yang outputnya sudah dibedah di `command-surface-inventory.md`
> dirujuk "lihat command-inventory §C" (RINGKAS). Notif otonom (cron) & pesan
> sistem yang BELUM kerinci ditulis DETAIL (semua field apa adanya).
>
> **Temuan unit uang penting (dipakai di Phase 2):** field `*_usd` di `getMyPositions`
> (`pnl_usd`, `total_value_usd`, `unclaimed_fees_usd`) ISInya nilai **SOL** saat
> `config.management.solMode` on (dlmm.js:2009-2035 & 1336 — `solMode ? p.pnlSol : p.pnlUsd`).
> Jadi swap simbol `cur = solMode ? "◎" : "$"` SUDAH benar (angka ikut mode). Rent/held
> selalu **SOL** (◎), independen solMode.

---

## Primitif kirim (semua pesan lewat sini) — `telegram.js`

| Fungsi | Baris | Fungsi |
|---|---|---|
| `sendMessage(text)` | 163 | teks polos, auto-split >4096 |
| `sendMessageWithButtons(text, kb)` | 173 | teks + inline keyboard |
| `sendHTML(html)` | 181 | parse_mode HTML, auto-split, fallback plain bila gagal |
| `editMessage(text, id)` | 224 | edit pesan |
| `editMessageWithButtons(text, id, kb)` | 232 | edit + keyboard (menu) |
| `answerCallbackQuery(id, text)` | 241 | jawab tombol (toast) |
| `pinMessage` / `unpinMessage` | 205 / 214 | pin briefing |
| `createLiveMessage(title, intro)` | 331 | pesan "hidup" (live edit tool-lines) — lihat ⑬ |
| `notifyDeploy(...)` | 575 | lihat ② |
| `notifyClose(...)` | 599 | lihat ④ |
| `notifySwap(...)` | 654 | lihat ③ |
| `notifyOutOfRange(...)` | 664 | lihat ③ |

`sendAndPinBriefing(briefing)` = wrapper di **index.js:190** (sendHTML + pin + unpin lama).

---

## ① SCREENING / CANDIDATES

### Screening cycle report (otonom cron + live)  ·  Kategori: ①+⑬
- Titik kirim   : `index.js:754` `createLiveMessage("🔍 Screening Cycle", "Scanning candidates...")`; finalize/`sendMessage` di `index.js:1161-1162`.
- Pemicu        : cron screening tick (`runScreeningCycle`) + trigger freed-slot (pasca-management).
- Sumber render  : inline `runScreeningCycle` (index.js:663-1169). Live-message tool-lines saat agent jalan; report final = `stripThink(screenReport)` (output LLM SCREENER) ATAU pesan skip.
- Field/detail  :
  - Judul live: `🔍 Screening Cycle` + intro `Scanning candidates...`.
  - Saat agent jalan: tool-lines live (⑬) per tool call SCREENER.
  - Report final: teks bebas LLM (alasan deploy / no-deploy), ATAU skip-message:
    - `Screening skipped — max positions reached (N/M).` (1679)
    - broke-skip (modal kurang, sizing-aware) — lihat index.js ~689+
    - market-regime gate skip (experiment)
  - Bila no live & telegramEnabled: `sendMessage("🔍 Screening Cycle\n\n<report>")`.
- Money-display? : TIDAK langsung (report LLM bisa sebut angka kandidat). Deploy-nya → ②.
- Catatan       : `silent:true` → tak kirim apa-apa (cuma return). Tanpa telegram → return saja.

### /screen (TG)  ·  Kategori: ①
- Titik kirim   : `index.js:3773` `sendMessage(await runDeterministicScreen(5))`.
- Sumber render  : lihat command-inventory §C (/screen → `runDeterministicScreen`).
- Money-display? : 🟡 (fee/aTVL, vol). Catatan: bukan mutasi.

### /candidates (TG cache)  ·  Kategori: ①
- Titik kirim   : `index.js:3781` `sendMessage(describeLatestCandidates(5))`.
- Sumber render  : lihat command-inventory §C (/candidates — TG=cache vs REPL=fetch, SEMANTIK BEDA §D-2).
- Money-display? : 🟡.

---

## ② DEPLOY NOTIF

### notifyDeploy (jalur utama tool deploy_position)  ·  Kategori: ②
- Titik kirim   : `telegram.js:596` `sendHTML(...)`; dipanggil dari `executor.js:797` (post-hook deploy_position) — jalur OTONOM (SCREENER cron) **dan** manual chat.
- Pemicu        : sukses `deploy_position`.
- Sumber render  : `notifyDeploy()` telegram.js:575-597.
- Field/detail  (semua baris):
  - `✅ <b>Deployed</b> <pair>` (escapeHtml).
  - `NOTIF_DIV` (separator).
  - `💵 Amount: <amountSol> SOL` + (bila ada racikan) `  ·  🗂️ <activeRacikan>`.
  - (opsional priceRange) `📐 Price range: <min> – <max>` (fmtP: <0.0001 → exp, else 6dp).
  - (opsional rangeCoverage) `↕️ Cover: <downside%> ↓ | <upside%> ↑ | <width%> total`.
  - (opsional binStep/baseFee) `🧱 Bin step <binStep>  ·  base fee <baseFee>%`.
  - `🆔 Position: <position[0:8]>...`.
  - `🔗 Tx: <tx[0:16]>...`.
- Money-display? : 🟡 (Amount SOL). Catatan: Amount selalu "SOL" literal (bukan solMode-aware).
- Catatan       : **guard** `if (hasActiveLiveMessage()) return;` → bila live-message screening aktif, notif deploy DI-SKIP (tool-line live yang nampilin).

### /deploy <n> (TG)  ·  Kategori: ②
- Titik kirim   : `index.js:3793` `sendMessage([...].join())`.
- Sumber render  : `deployLatestCandidate(idx)` → lihat command-inventory §C (/deploy).
- Field/detail  : `✅ Deployed <name> … Amount: X SOL … Range: …`.
- Money-display? : 🔴 (gerakin modal) + 🟡 nampilin amount.

---

## ③ MANAGEMENT-CYCLE (STAY / CLOSE / report + OOR + swap)

### Management cycle report (otonom cron + live)  ·  Kategori: ③+⑬
- Titik kirim   : `index.js:459` `createLiveMessage("🔄 Management Cycle", "Evaluating positions...")`; finalize/`sendMessage` `index.js:641-642`.
- Pemicu        : cron management tick (`runManagementCycle`).
- Sumber render  : inline (index.js ~440-660). Report = `stripThink(mgmtReport)` (output LLM MANAGER bila ada aksi) ATAU live-note.
- Field/detail  :
  - Judul live: `🔄 Management Cycle` + intro `Evaluating positions...`.
  - Bila semua STAY: live-note `No tool actions needed.` (index.js:624), report mungkin kosong.
  - Bila ada aksi: tool-lines live (⑬) + report LLM (`mgmtReport += content`).
  - Fallback non-live: `sendMessage("🔄 Management Cycle\n\n<report>")` (642).
  - Guard leak: finalize `(cycle ended without report)` bila report kosong tapi live ada (647).
- Money-display? : TIDAK langsung (report LLM bisa sebut PnL). Close → ④.
- Catatan       : `silent:true` → senyap. Setelah cycle → trigger screening bila slot bebas; `maybeFireLearningReport()` (→ ⑦).

### notifyOutOfRange (OOR alert)  ·  Kategori: ③
- Titik kirim   : `telegram.js:666` `sendHTML(...)`; dipanggil `index.js:651` (akhir management cycle, per posisi OOR ≥ `outOfRangeWaitMinutes`).
- Sumber render  : `notifyOutOfRange()` telegram.js:664-669.
- Field/detail  :
  - `⚠️ <b>Out of Range</b> <pair>` (escapeHtml).
  - `NOTIF_DIV`.
  - `⏱️ Been OOR for <minutesOOR> minutes`.
- Money-display? : TIDAK.
- Catatan       : guard `hasActiveLiveMessage()`. Hanya saat `!silent && telegramEnabled()`.

### notifySwap (swap base→SOL / manual swap_token)  ·  Kategori: ③
- Titik kirim   : `telegram.js:656` `sendHTML(...)`; dipanggil `executor.js:795` (post-hook swap_token).
- Sumber render  : `notifySwap()` telegram.js:654-662.
- Field/detail  :
  - `🔄 <b>Swapped</b> <inputSymbol> → <outputSymbol>` (escapeHtml; symbol = mint[0:8] atau "SOL").
  - `NOTIF_DIV`.
  - `💱 In: <amountIn>  ·  Out: <amountOut>`.
  - `🔗 Tx: <tx[0:16]>...`.
- Money-display? : 🟡 (amountIn/Out token).
- Catatan       : guard `hasActiveLiveMessage()`. Auto-swap pasca-close juga lewat sini (lihat index.js:1225-1233 emergency path + executor post-hook close).

---

## ④ CLOSE NOTIF (single + closeall)

### notifyClose (jalur utama tool close_position + PnL-poll emergency)  ·  Kategori: ④
- Titik kirim   : `telegram.js:651` `sendHTML(...)`. Dipanggil dari **dua** jalur:
  - `executor.js:802` (post-hook close_position — jalur OTONOM manager + manual).
  - `index.js:1240` (PnL-poll EMERGENCY close LLM-free — Lever A).
- Pemicu        : posisi ditutup (rule deterministik / LLM / emergency / manual).
- Sumber render  : `notifyClose()` telegram.js:599-652.
- Field/detail  (semua baris):
  - `🟢|🔴 <b>Closed</b> <pair>` (🟢 bila net≥0).
  - `NOTIF_DIV`.
  - `📊 Net PnL: <±$abs> (<±pct%>)` — $ & % SATU basis (total net, fee INCLUDED).
  - (bila feesUsd≠null) dekomposisi:
    - `   💎 Fee panen <±$fee>  ·  📈 Efek-harga <±$(net−fee)>`.
    - `   ⛽ Gas ~<gasSol 5dp> SOL (est, di luar PnL — dari wallet)`.
  - (bila peakPnlPct≥3 && give-back≥1) `📈 Give-back: peak +<peak%> → exit <exit%> (tinggal <Δ>pp di meja)`.
  - (bila reason ada "PnL -X%" & gap≥5pp) `⚠️ Trigger di <X%>, realisasi <Y%> — harga terus bergerak selama eksekusi close (gap <Δ>pp).`.
  - (bila reason) `📋 <b>Reason:</b> <reason[0:200]>`.
  - (bila lesson) `📚 <b>Lesson:</b> <i><lesson[0:300]></i>`.
- Money-display? : 🟡 **HARD `$`** — `usd(v)` formatter SELALU `$` (TIDAK ikut solMode). ⚠️ inkonsistensi vs /positions/etc yang solMode-aware. Catat buat migrasi.
- Catatan       : guard `hasActiveLiveMessage()`. pnlUsd dari `recorded_pnl_usd ?? pnl_usd` (F9-light: notif==report).

### /close <n> (TG)  ·  Kategori: ④
- Titik kirim   : `index.js:3703` `Closing <pair>...`; `index.js:3708` hasil.
- Sumber render  : inline (lihat command-inventory §C /close).
- Field/detail  : `Closing <pair>...` → `✅ Closed <pair>\nPnL: <cur><pnl_usd> | close txs: … (+claim txs)` ATAU `❌ Close failed: <json>`.
- Money-display? : 🔴+🟡. `cur = solMode ? "◎" : "$"` (solMode-aware di sini, beda dari notifyClose hard-$).

### /closeall (TG)  ·  Kategori: ④
- Titik kirim   : `index.js:3720` `Closing N position(s)...`; `index.js:3730` ringkasan.
- Sumber render  : inline (lihat command-inventory §C /closeall).
- Field/detail  : `Closing N position(s)...` → `Close-all finished.\n\n<pair: closed/failed per posisi>`.
- Money-display? : 🔴. Catatan: tiap posisi juga memicu notifyClose (④) lewat post-hook.

---

## ⑤ POSITION-VIEWS (/status /wallet /positions /pool)

> Semua sudah dibedah output EXACT di **command-inventory §C**. RINGKAS di sini.

### /status (TG)  ·  Kategori: ⑤
- Titik kirim   : `index.js:3605` `sendMessage(msg)`.
- Sumber render  : komposit `formatWalletStatus` + OpenRouter + All-time PnL + Learning + lessons + `formatPnlTracker` + disclosure. Lihat command-inventory §C (/status TG, baris 82-111).
- Money-display? : 🟡. ⚠️ quirk: `formatWalletStatus` HARD-`$`, sisanya solMode-aware → campur ◎/$ dalam 1 pesan.

### /wallet + /wallet trackstart (TG)  ·  Kategori: ⑤
- Titik kirim   : `index.js:3522-3543` (trackstart res), bagian /wallet di blok /status-family.
- Sumber render  : `formatWalletStatus` + OpenRouter + `formatSolTracker` (sol-tracker.js:170) + pnlTracker + disclosure. Lihat command-inventory §C.
- Field/detail  : trackstart: `✅ … diset ke <tgl>` / `📊 … dihapus` / `❌ <error>`.
- Money-display? : 🟡.

### /positions (TG) — **PILOT FASE 3**  ·  Kategori: ⑤
- Titik kirim   : `index.js:3661` `sendMessage("📊 Open Positions (N)\n━…\n<lines>\n<footer>")`. Kosong → `index.js:3627` `sendMessage("No open positions.")`.
- Sumber render  : INLINE `index.js:3624-3663`.
- Field/detail  (per posisi 3 baris + footer):
  - Baris 1: `<i+1>. <pair>  <state>` — state = `✅ in-range` / `⚠️ OOR <m>m`.
  - Baris 2: `   value <cur><total_value_usd> · PnL <±cur·abs (±pct%)> · fees <cur><unclaimed_fees_usd>`.
  - Baris 3: `   age <fmtAgeMin> · range <width> bins[ · 🔒 <rent.sol 3dp>◎[ (est)]][ · 💧 fee <feeDens%>]`.
  - Footer: `━…` + `🔒 Total tertahan ~<totalRent 3dp> SOL[ (sebagian est)] — refund saat close` + `/close <n> · /pool <n> · /set <n> <note>`.
  - fee-density (💧) = (collected+unclaimed)/value×100, hanya bila value>0 && fees>0. BUKAN APR.
  - `cur = solMode ? "◎" : "$"` (solMode-aware, angka sudah mode-correct).
- Money-display? : 🟡. **Target migrasi PILOT** (design tree, nol detail hilang + 💧 dipertahankan).

### /pool <n> (TG)  ·  Kategori: ⑤
- Titik kirim   : `index.js:3689` `sendMessage(lines.join("\n"))`.
- Sumber render  : inline `index.js:3666-3693` + `buildRangeEfficiencyLines` (index.js:1649). Lihat command-inventory §C (/pool).
- Field/detail  : pair, Pool addr, Position addr, "── Range efficiency ──" (range bins/active-bar/state/in-range approx), "── Value ──" (PnL%/fees/value), Age, rent, note.
- Money-display? : 🟡. Quirk: "In-range (approx)" over-state (OOR historis tak kecatat).

---

## ⑥ REPORT (/report semua varian)

### /report [all|setups|<racikan>|week|month|day] (TG)  ·  Kategori: ⑥
- Titik kirim   : `index.js:3510` `sendHTML(await buildReportForArg(...))`.
- Sumber render  : `buildReportForArg` (index.js:281) → reports.js (`buildTradeReport`/`buildReportForArg` tiering). Lihat command-inventory §C (/report).
- Field/detail  : stats (net/ROI, win-rate, profit-factor, payoff, expectancy, max-drawdown), verdict, trend, breakdown (strategy/session/narrative/close-rule/setup), quant-edge block (RR/break-even WR/EV-R), recs, disclosure racikan.
- Money-display? : 🟡 (banyak). Catatan: paling konsisten antar surface (HTML vs strip).
- Catatan       : milestone learning-report otonom → ⑦.

---

## ⑦ BRIEFING (harian / periodik / milestone / pinned)

### Daily briefing (otonom cron 01:00 UTC + watchdog)  ·  Kategori: ⑦
- Titik kirim   : `index.js:372` `sendAndPinBriefing(html)` → `index.js:190-191` `sendHTML` + pin.
- Sumber render  : `generateBriefing()` (briefing.js). Lihat CLAUDE.md "Trade Reports & Briefings".
- Field/detail  : 24h activity/perf, all-time stats+verdict, cleaned lessons, cost (LLM per-role + gas est + net-vs-cost), learning/time-profile/skip-review, recs.
- Money-display? : 🟡.

### Weekly/Monthly briefing (otonom cron Mon 01:30 / 1st 02:00)  ·  Kategori: ⑦
- Titik kirim   : `index.js:414` `sendAndPinBriefing(briefing)`.
- Sumber render  : `generatePeriodicBriefing()` (briefing.js).
- Field/detail  : windowed trade report + activity + window cost. Deduped per period key.
- Money-display? : 🟡.

### Milestone learning report (otonom, tiap N close)  ·  Kategori: ⑦
- Titik kirim   : `index.js:225` `sendHTML(report)`.
- Pemicu        : `maybeFireLearningReport()` (hook akhir runManagementCycle), tiap `reports.learningReportEvery` close.
- Sumber render  : `buildTradeReport` (reports.js).
- Money-display? : 🟡.

### /briefing (TG manual)  ·  Kategori: ⑦
- Titik kirim   : `index.js:3501` `sendAndPinBriefing(briefing)`; error `index.js:3503`.
- Sumber render  : `generateBriefing()`. Lihat command-inventory §C (/briefing).
- Money-display? : 🟡.

---

## ⑧ CONFIG / SETTINGS (/config /settings menu /setcfg /preset)

> Surface paling banyak titik kirim. Sebagian besar callback menu — lihat command-inventory §C.

### /config · /config core (TG)  ·  Kategori: ⑧
- Titik kirim   : `index.js:3613` `sendMessage(text === "/config core" ? formatCoreConfig() : formatFullConfig())`.
- Sumber render  : `formatFullConfig()` / `formatCoreConfig()` (index.js, kaskade 3-tingkat origin grouping). Lihat command-inventory §C.
- Money-display? : 🟠 (lever uang: deployAmount/sizing/SL-TP).

### /settings · /menu · /configmenu (TG, menu tombol)  ·  Kategori: ⑧
- Titik kirim   : `index.js:3480` `showSettingsMenu()`; render menu di `index.js:2997-2999` (`editMessageWithButtons`/`sendMessageWithButtons`); callback `cfg:*` di `index.js:3021-3178` (banyak `answerCallbackQuery` + `editMessage*`).
- Sumber render  : `renderSettingsMenu` + `applySettingsMenuCallback` (registry MENU_CONTROLS, paginasi).
- Field/detail  (callback notable):
  - `3030` `Enter new value for <key> (current: <val>):\nSend a number, or "off" to clear.`
  - `3035` `Settings menu closed.`
  - `3042` `sendMessage(formatFullConfig())` (tombol show full config).
  - `3058` `💾 Ketik nama preset untuk menyimpan config sekarang (huruf/angka/_/-, maks 40):`
  - `3074/3083/3104` `editMessageWithButtons` (preset ask/diff/rm pages).
  - `3114` `✅ Preset "<name>" di-load (<N> setting berubah). Rollback: /preset use <backup>`.
  - toast `answerCallbackQuery`: `Closed`/`Loaded <name>`/`Dihapus: <name>`/`Updated <key>`/`Config update failed`/`Invalid setting`/`Unknown action`/`categories: …`.
- Money-display? : 🟠.

### /setcfg <key> <value> (TG)  ·  Kategori: ⑧
- Titik kirim   : `index.js:3761` (gagal) / `index.js:3764` (sukses `✅ Updated <key> = <json>`).
- Sumber render  : inline → `executeTool("update_config", …)`. Lihat command-inventory §C.
- Money-display? : 🟠.

### update_config confirm (chat casual gate)  ·  Kategori: ⑧+⑫
- Titik kirim   : `index.js:2381` `sendMessageWithButtons("⚠️ Update config?\n<lines>", [Ya/Batal])`; expired `index.js:2373` editMessage; resolved `index.js:3425-3426`.
- Pemicu        : `update_config` via chat casual (requestConfigConfirmation).
- Field/detail  : `⚠️ Update config?` + daftar perubahan key=val; tombol ✅ Ya/❌ Batal; timeout `⏰ Expired — no changes made.`; konfirmasi `✅ Confirmed — updating...` / `❌ Cancelled — no changes made.`.
- Money-display? : 🟠.

### /preset [list|save|use|show|rm] (TG + REPL)  ·  Kategori: ⑧
- Titik kirim   : `index.js:3619` `sendMessage(res.text)`; apply note `index.js:3303` `sendMessage(note)` (viaTelegram).
- Sumber render  : `runPresetCommand` + `finishPresetApply`. Lihat command-inventory §C (paling KONSISTEN dua surface).
- Money-display? : 🟠 (preset = snapshot full config).

---

## ⑨ GUIDE

### /guide [arg] (TG + REPL)  ·  Kategori: ⑨
- Titik kirim   : `index.js:3485` `sendMessage(renderGuide(text.slice(6)))`.
- Sumber render  : `renderGuide` (guide.js). Lihat command-inventory §C (konsisten dua surface).
- Money-display? : TIDAK (dokumentasi).

### /help (TG)  ·  Kategori: ⑨/⑪
- Titik kirim   : `index.js:3518` `sendMessage(formatHelpText())`.
- Sumber render  : `formatHelpText()` (index.js:3182, statis). Lihat command-inventory §C.
- Money-display? : TIDAK. Catatan: REPL tak punya /help (banner beda, out-of-date) — gap §D-7.

---

## ⑩ HIVEMIND

### /hive · /hive pull (TG)  ·  Kategori: ⑩
- Titik kirim   : `index.js:3832` (disabled), `index.js:3842` (status), `index.js:3853` (error).
- Sumber render  : inline `index.js:3827-3855`.
- Field/detail  :
  - Disabled: `HiveMind: disabled\nAgent ID: <id>\nSet hiveMindApiKey to connect.`
  - Status: enabled/agentId/url/pull-mode/register/lessons/presets count (lihat command-inventory §C).
  - Error: `HiveMind error: <msg>`.
- Money-display? : TIDAK.

---

## ⑪ SISTEM / CONTROL (pause/resume, OpenRouter-low, queue, gas-tune, error/warning, suspect-alert)

### /pause · /resume (TG)  ·  Kategori: ⑪
- Titik kirim   : `index.js:3810` `⏸ Paused autonomous cycles. Telegram control still works. Use /resume to start again.`; `index.js:3820` `▶️ Autonomous cycles resumed.` / `index.js:3822` `Autonomous cycles are already running.`.
- Money-display? : TIDAK.

### /stop (TG) — ⚠️ GAP  ·  Kategori: ⑪
- Terdaftar di BOT_COMMANDS tapi TANPA handler → jatuh ke LLM (command-inventory §D-6). Tak ada titik kirim khusus.

### Queue penuh / queued (TG)  ·  Kategori: ⑪
- Titik kirim   : `index.js:3491` `⏳ Queued (<n> in queue): "<text[0:60]>"`; `index.js:3493` `Queue is full (5 messages). Wait for the agent to finish.`.
- Pemicu        : chat non-command saat agent sibuk (`_telegramQueue`).
- Money-display? : TIDAK.

### gasReserve auto-tune (otonom)  ·  Kategori: ⑪
- Titik kirim   : `index.js:402` `sendMessage("🪫 gasReserve auto-tuned: <cur> → <target> SOL (≈<buffer>d runway @ <dailyBurn> SOL/hari, dari gas nyata)")`.
- Pemicu        : auto-tune gasReserve dari gas nyata.
- Money-display? : 🟡 (SOL).

### OpenRouter saldo menipis (di dalam /status & /wallet)  ·  Kategori: ⑪
- Titik kirim   : bagian dari komposit /status (`index.js:3605`) & /wallet — baris `⚠️ Saldo OpenRouter menipis — pertimbangkan top up` (hanya bila <$5).
- Money-display? : 🟡 ($). Catatan: bukan pesan terpisah, baris dalam status.

### Suspect-PnL alert (otonom, lessons)  ·  Kategori: ⑪
- Titik kirim   : `lessons.js:205` `sendMessage(...)` (dynamic import telegram.js, fire-and-forget fail-open).
- Pemicu        : close ≤−90% non-stopLoss direkam → karantina, alert operator.
- Field/detail  : `⚠️ Close <pct>% (non-stopLoss) direkam SUSPECT — cek rug asli vs bad-data.\nPool: <name>\nAlasan close: <reason>\nDikarantina dari auto-learning + stats sampai diverifikasi.`.
- Money-display? : 🟡 (pct).

### Error/warning replies (tersebar)  ·  Kategori: ⑪
- Titik kirim   : pola `sendMessage(\`Error: ${e.message}\`)` di hampir tiap handler command (index.js:3503,3512,3539,3607,3662,3691,3712,3732,3747,3766,3775,3802,3853,3882) + `Settings error:` (3480), `Failed to update <key>.` (3465), `Invalid value "<text>" — must be a number or "off".` (3459), `Nama tidak valid …` (3440), `Gagal simpan: …` (3446), `Config update failed.\nUnknown: …` (3761).
- Sumber render  : inline per-handler.
- Money-display? : TIDAK (teks error).
- Catatan       : kandidat dipusatkan jadi 1 renderer error (Phase lanjut).

---

## ⑫ KONFIRMASI (confirm:yes/no deploy/close/swap)

### requestActionConfirmation (gate aksi-trade chat casual)  ·  Kategori: ⑫
- Titik kirim   : `index.js:2292` `sendMessageWithButtons("⚠️ Konfirmasi aksi ini?\n<summary>", [✅ Ya / ❌ Batal])`; expired `index.js:2288` editMessage `⏰ Expired — no action taken.`; resolved `index.js:3425-3426` (`✅ Confirmed — updating...` / `❌ Cancelled — no changes made.`).
- Pemicu        : tool WRITE (deploy/close/swap) via chat casual TG (`onConfirmRequired`).
- Sumber render  : `summarizeTradeAction(toolName, args)` (summary) inline.
- Field/detail  : `⚠️ Konfirmasi aksi ini?` + ringkasan aksi (tool + args ringkas); 2 tombol; timeout 30s; toast `Confirmed`/`Cancelled`/`Expired` (`answerCallbackQuery` 3425/3429).
- Money-display? : 🔴 (gate modal nyata). REPL tak ada (operator lokal tepercaya).

---

## ⑬ LIVE-PROGRESS (createLiveMessage tool-lines)

### Live tool-line stream (management / screening / chat LLM)  ·  Kategori: ⑬
- Titik kirim   : `telegram.js:331` `createLiveMessage`; dipakai `index.js:459` (management), `index.js:754` (screening), `index.js:3870` (chat LLM `createLiveMessage("🤖 Live Update", "Request: <text[0:240]>")`).
- Sumber render  : `createLiveMessage` internal `render()`/`upsertToolLine()` (telegram.js:331-400+). Struktur: `<title>\n\n<intro>\n\n<toolLines joined>\n\n<footer>` (slice 4096; final = `flushFinal` multi-chunk).
- Field/detail  :
  - title (`🔄 Management Cycle` / `🔍 Screening Cycle` / `🤖 Live Update`).
  - intro (`Evaluating positions...` / `Scanning candidates...` / `Request: <text>`).
  - toolLines: per tool call `<icon> <toolLabel> [suffix]` (upsert per tool, edit in-place tiap ~300ms).
  - footer: hasil akhir (finalize → `stripThink(report)` / content LLM).
  - finalize/flushFinal: split multi-chunk bila panjang.
- Money-display? : 🟡 (toolLine/footer bisa sebut angka via output tool).
- Catatan       : `hasActiveLiveMessage()` mematikan notifyDeploy/Close/Swap/OOR selama live aktif (anti-dobel). Typing-indicator leak-guard wajib finalize.

---

## TABEL SCOPE — checklist migrasi workstream 🅴

> Status migrasi: ⬜ belum · (akan jadi ✅ saat dipindah ke `views/`). PILOT FASE 3 = `/positions`.
> Kolom "Sumber detail": **§C** = sudah di command-inventory · **DETAIL** = baru kerinci di file ini.

| # | Pesan | Kat | Titik kirim (file:line) | Money | Sumber detail | Migrasi |
|---|---|---|---|---|---|---|
| 1 | Screening cycle report | ① | index.js:754,1162 | 🟡 | DETAIL | ⬜ |
| 2 | /screen | ① | index.js:3773 | 🟡 | §C | ⬜ |
| 3 | /candidates (cache) | ① | index.js:3781 | 🟡 | §C | ⬜ |
| 4 | notifyDeploy | ② | telegram.js:596 ← executor.js:797 | 🟡 | DETAIL | ⬜ |
| 5 | /deploy <n> | ② | index.js:3793 | 🔴🟡 | §C | ⬜ |
| 6 | Management cycle report | ③ | index.js:459,642 | 🟡 | DETAIL | ⬜ |
| 7 | notifyOutOfRange | ③ | telegram.js:666 ← index.js:651 | — | DETAIL | ⬜ |
| 8 | notifySwap | ③ | telegram.js:656 ← executor.js:795 | 🟡 | DETAIL | ⬜ |
| 9 | notifyClose | ④ | telegram.js:651 ← executor.js:802 / index.js:1240 | 🟡 | DETAIL | ⬜ |
| 10 | /close <n> | ④ | index.js:3703,3708 | 🔴🟡 | §C | ⬜ |
| 11 | /closeall | ④ | index.js:3720,3730 | 🔴 | §C | ⬜ |
| 12 | /status | ⑤ | index.js:3605 | 🟡 | §C | ⬜ |
| 13 | /wallet (+trackstart) | ⑤ | index.js:3528-3543,3581 | 🟡 | §C | ⬜ |
| 14 | **/positions** (PILOT) | ⑤ | index.js:3627,3661 | 🟡 | §C+DETAIL | ⬜→🛠 FASE 3 |
| 15 | /pool <n> | ⑤ | index.js:3689 | 🟡 | §C | ⬜ |
| 16 | /report (semua varian) | ⑥ | index.js:3510 | 🟡 | §C | ⬜ |
| 17 | Daily briefing | ⑦ | index.js:372 → 190 | 🟡 | §C | ⬜ |
| 18 | Weekly/Monthly briefing | ⑦ | index.js:414 | 🟡 | DETAIL | ⬜ |
| 19 | Milestone learning report | ⑦ | index.js:225 | 🟡 | DETAIL | ⬜ |
| 20 | /briefing | ⑦ | index.js:3501 | 🟡 | §C | ⬜ |
| 21 | /config · /config core | ⑧ | index.js:3613 | 🟠 | §C | ⬜ |
| 22 | /settings menu (+callbacks) | ⑧ | index.js:2997-3178,3480 | 🟠 | §C+DETAIL | ⬜ |
| 23 | /setcfg | ⑧ | index.js:3761,3764 | 🟠 | §C | ⬜ |
| 24 | update_config confirm | ⑧⑫ | index.js:2381,3425 | 🟠 | DETAIL | ⬜ |
| 25 | /preset | ⑧ | index.js:3619,3303 | 🟠 | §C | ⬜ |
| 26 | /guide | ⑨ | index.js:3485 | — | §C | ⬜ |
| 27 | /help | ⑨⑪ | index.js:3518 | — | §C | ⬜ |
| 28 | /hive · /hive pull | ⑩ | index.js:3832,3842,3853 | — | DETAIL | ⬜ |
| 29 | /pause · /resume | ⑪ | index.js:3810,3820,3822 | — | DETAIL | ⬜ |
| 30 | Queue full/queued | ⑪ | index.js:3491,3493 | — | DETAIL | ⬜ |
| 31 | gasReserve auto-tune | ⑪ | index.js:402 | 🟡 | DETAIL | ⬜ |
| 32 | Suspect-PnL alert | ⑪ | lessons.js:205 | 🟡 | DETAIL | ⬜ |
| 33 | Error/warning replies | ⑪ | tersebar (lihat ⑪) | — | DETAIL | ⬜ |
| 34 | requestActionConfirmation | ⑫ | index.js:2292,3425 | 🔴 | DETAIL | ⬜ |
| 35 | Live tool-line stream | ⑬ | telegram.js:331 ← index.js:459,754,3870 | 🟡 | DETAIL | ⬜ |

**Catatan migrasi (hotspot uang — dari command-inventory §E + temuan baru):**
- **#9 notifyClose HARD-`$`** vs #14/#15 solMode-aware → unit campur antar-pesan. Renderer wajib pusatkan unit (rule #3 governing).
- **#12 /status** campur ◎/$ dalam SATU pesan (formatWalletStatus hard-$, sisanya solMode-aware).
- **Held/rent selalu ◎** (SOL intrinsik) — JANGAN dikonversi ke $; bukan "value display".
- **#14 /positions** = PILOT: simbol sudah benar (data mode-correct), tinggal pindah render ke `views/` + jaga 💧 fee-density.
- `*_usd` field = SOL saat solMode on (dlmm.js:2009-2035) — view-model cukup bawa angka + simbol, JANGAN dobel-konversi.
