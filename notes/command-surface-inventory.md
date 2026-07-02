# Phase 1 — RECON / Inventaris Command × Surface

> READ-ONLY. Petakan tiap command × tiap surface (CLI REPL vs Telegram): output EXACT,
> detail, beda/gap, dan flag money-logic. Sekaligus **R-command-review** + dasar **parity** (Phase 4).
> Disusun 2026-06-21 dari pembacaan `index.js`, `pnl-tracker.js`, `sol-tracker.js`, `telegram.js`.

Istilah dua-lapis: **surface** = "permukaan"/pintu masuk (tempat user ngetik). Kita punya dua:
- **TG** = Telegram bot (chat). Handler: `telegramHandler(...)` di `index.js` ~3460–3888.
- **REPL** = konsol lokal (terminal tempat bot dijalankan, ngetik langsung). Handler: `rl.on("line", …)` `index.js` 4001–4238. (REPL = Read-Eval-Print-Loop = "ketik perintah → langsung dieksekusi".)

Sumber kebenaran menu TG = `BOT_COMMANDS` (`telegram.js:509`), didaftarkan via `setMyCommands` → ini yang muncul di tombol "/" Telegram.

**Sebelum dispatch slash-command, `telegramHandler` (3413–3478) handle 3 interaksi non-command** (penting buat money-logic & menu):
1. callback `confirm:yes|no` (3417) — **gate konfirmasi aksi modal-nyata** (deploy/close/swap via chat) → resolve `_pendingConfirmation`.
2. input teks `_pendingInput` (3434) — field input menu /settings: simpan preset (`presetSave`) atau nilai config numerik (`off|null|angka`) → `update_config`.
3. callback `cfg:*` (3471) — semua tombol menu /settings → `applySettingsMenuCallback`.
REPL tak punya padanan ini (operator lokal = tepercaya, tanpa confirm; menu /settings TG-only).

---

## A. Dua surface & titik dispatch

| | Telegram (TG) | CLI REPL |
|---|---|---|
| Handler | `telegramHandler` `index.js:~3460` | `rl.on("line")` `index.js:4001` |
| Cara non-command | jatuh ke LLM agent (GENERAL/SCREENER), `onConfirmRequired: requestConfirmation` AKTIF | jatuh ke LLM agent (GENERAL), **tanpa** onConfirmRequired (operator lokal = sudah tepercaya) |
| Antrian saat sibuk | ya — `_telegramQueue` (maks 5), balas "⏳ Queued" | tidak (serial via `runBusy`) |
| Entry deploy khas | `/deploy <n>`, atau chat "deploy …" → SCREENER | angka `1/2/3…`, `auto`, atau chat |
| Render | HTML (`sendHTML`) / teks (`sendMessage`, auto-split) | `console.log`, semua tag HTML di-strip `replace(/<[^>]*>/g,"")` |

**Catatan render krusial:** semua command "berbagi" (/report, /briefing) menghasilkan **HTML** di hulu. TG kirim apa adanya; REPL buang tag. Artinya **view-model harus netral-format** (Phase 2): satu sumber data → dua renderer (HTML untuk TG, plain untuk REPL). Sekarang format dijahit langsung di string → ini akar masalah yang mau dibetulin.

---

## B. Master matrix (presence per surface)

Legend: ✅ ada (handler khusus) · ➖ tidak ada · 🔶 ada tapi beda implementasi/output · 💬 hanya lewat LLM chat (tak ada handler)

| Command | TG | REPL | Money? | Catatan singkat |
|---|---|---|---|---|
| `/help` | ✅ | ➖ | 🟡 | REPL punya banner sendiri saat start (beda teks) |
| `/status` | ✅ kaya | 🔶 minim | 🟡 | **divergen besar** (lihat §D-1) |
| `/wallet` | ✅ | ➖ | 🟡 | REPL tak punya sama sekali |
| `/wallet trackstart <tgl>` | ✅ | ➖ | — | anchor SOL tracker |
| `/positions` | ✅ | ➖ | 🟡 | REPL: cuma ringkas di `/status` |
| `/pool <n>` | ✅ | ➖ | 🟡 | detail 1 posisi + range-eff + rent |
| `/briefing` | ✅ pin | 🔶 plain | 🟡 | sumber sama, delivery beda |
| `/report [arg]` | ✅ HTML | 🔶 plain | 🟡 | sumber sama (`buildReportForArg`) |
| `/config` `/config core` | ✅ | ➖ | 🟠 | nampilin lever uang |
| `/settings` `/menu` `/configmenu` | ✅ menu tombol | ➖ | 🟠 | edit config via tombol |
| `/setcfg <key> <val>` | ✅ | ➖ | 🟠 | tulis config (→ update_config) |
| `/preset […]` | ✅ | ✅ | 🟠 | sama-sama `runPresetCommand` (paling konsisten) |
| `/guide [arg]` | ✅ | ✅ | — | sama-sama `renderGuide` (konsisten) |
| `/screen` | ✅ | 🔶 | 🟡 | REPL pakai `/candidates` (fetch live) |
| `/candidates` | 🔶 cache | 🔶 fetch | 🟡 | **semantik beda** (lihat §D-2) |
| `/deploy <n>` | ✅ | 🔶 | 🔴 | REPL: angka `1/2/3…` |
| `/close <n>` | ✅ | 💬 | 🔴 | REPL hanya via chat LLM |
| `/closeall` | ✅ | 💬 | 🔴 | REPL hanya via chat LLM |
| `/set <n> <note>` | ✅ | ➖ | — | catatan posisi (bukan uang) |
| `/pause` `/resume` | ✅ | ➖ | — | REPL: cron auto-start saat boot |
| `/hive` `/hive pull` | ✅ | ➖ | — | status HiveMind |
| `/stop` | 💬 ⚠️ | ✅ | — | **TG: terdaftar di menu tapi TANPA handler → jatuh ke LLM** (gap/bug) |
| `/thresholds` | ➖ | ✅ | 🟠 | REPL-only; nampilin lever screening + perf |
| `/learn [addr]` | ➖ | ✅ | — | REPL-only; studi top LPer (LLM) |
| `/evolve` `/evolve force` | ➖ | ✅ | 🟠 | REPL-only; tulis threshold |
| angka `1/2/3…` | ➖ | ✅ | 🔴 | REPL-only; deploy ke pool cache ke-N |
| `auto` | ➖ | ✅ | 🔴 | REPL-only; agent pilih+deploy |
| `go` | ➖ | ✅ | — | REPL-only; start cron tanpa deploy |

Money flag: 🔴 gerakin modal nyata · 🟠 ubah perilaku-uang (config/threshold/sizing/preset) · 🟡 nampilin uang (wajib akurat, tak mutasi) · — netral.

---

## C. Per-command detail (output EXACT)

Angka contoh = rekonstruksi dari kode (bukan run live). Sumber formatter ditunjuk per item.

### /help — TG (`formatHelpText` index.js:3182)
Teks statis, verbatim (3 grup: 📊 LAPORAN & STATUS / 🛠️ POSISI & DEPLOY / ⚙️ KONFIGURASI / 🔧 SISTEM).
**Gap:** REPL tak punya `/help`; banner REPL (index.js:3982–3997) daftar command-nya **beda** (cuma: angka, auto, /status, /candidates, /briefing, /report, /guide, /learn, /thresholds, /evolve, /evolve force, /stop). Banner REPL ketinggalan zaman vs `formatHelpText` (tak nyebut /preset, dst).

### /status — TG (index.js:3545–3609)
Komposit: `formatWalletStatus` + saldo OpenRouter + "Use /positions…" + All-time PnL + Learning + last bad/good lesson + `formatPnlTracker` + `racikanScopeDisclosure`.
```
Wallet: 2.345 SOL ($528.12)
SOL price: $225.21
Open positions: 1/2
📦 Real deploy/slot: 0.412 SOL  (ukuran per posisi baru)
🟢 Bebas (cair): ~2.145 SOL  (wallet − gasReserve 0.2)
🔒 Tertahan (rent 1 posisi): ~0.057 SOL — info: sudah keluar wallet, balik saat close
Dry run: no
HiveMind: off
💳 OpenRouter saldo: $4.12 | hari ini $0.0731
⚠️ Saldo OpenRouter menipis — pertimbangkan top up        (hanya bila <$5)

Use /positions for the numbered list.

💰 All-time PnL: +$12.34 (+5.2%) over 61 closed
🧠 Learning: 64% win | avg PnL +1.8%
⚠️ <rule jelek terakhir, di-condense>
✅ <rule bagus terakhir, di-condense>

📊 Realized PnL & Net
━━━━━━━━━━━━━━━━━
1D  🟢 +$1.23 net  (PnL +$1.80 − biaya $0.57 · 3 tr)
…
ℹ️ Net = PnL − gas − LLM

⚠️ 3 trade live di luar racikan ini dikecualikan (PnL -$0.42) — /report all buat semua.
```
Currency simbol: `cur = config.management.solMode ? "◎" : "$"` dipakai di All-time PnL. **TAPI** `formatWalletStatus` selalu hard-`$` (tak ikut solMode) → inkonsistensi simbol di satu pesan.

### /status — REPL (index.js:4050–4065) 🔶 DIVERGEN
```
Wallet: 2.345 SOL  ($528.12)
Positions: 1
  TOKEN/SOL        in-range ✓  fees: $0.42

📊 Realized PnL & Net
━━━━━━━━━━━━━━━━━
…
⚠️ 3 trade live di luar racikan ini dikecualikan …
```
Beda dari TG: TANPA `formatWalletStatus` (jadi tak ada slot/deploy-per-slot/bebas/rent/dry-run/hive), tanpa OpenRouter, tanpa All-time PnL/learning/lessons, tanpa SOL price. Per-posisi pakai `fees: ◎/$` (ikut solMode) sedangkan TG /status pakai `$` di wallet-block. **→ #1 parity gap terbesar.**

### /wallet — TG only (index.js:3545, 3581–3584)
= `/status`-block (formatWalletStatus + OpenRouter) **+** `formatSolTracker` (1D/7D/30D + opsi SINCE) **+** pnlTracker + disclosure. **TANPA** All-time/learning/lessons (itu khusus /status).
`formatSolTracker` (sol-tracker.js:170):
```
📊 SOL Tracker · Now 2.345 SOL
━━━━━━━━━━━━━━━━━
1D  🔴 -0.120 SOL (-4.9%) ← 2.465 @ kemarin
7D  🟢 +0.300 SOL (+14.7%) ← 2.045 @ <tgl>
30D ⚪ (blm ada baseline)
ℹ️ saldo SOL mentah (termasuk deposit/tarik & modal di posisi) — buat PnL murni pakai /report
💡 set anchor: /wallet trackstart YYYY-MM-DD
```

### /wallet trackstart <YYYY-MM-DD|off> — TG only (index.js:3522–3543)
Set/lihat/hapus anchor "SINCE". Balasan: "✅ … diset ke <tgl>" / "📊 … dihapus" / "❌ <error>".

### /positions — TG only (index.js:3624–3663)
Per posisi 3 baris (pair+state, value+PnL+fees, age+range+rent+fee-density) + footer (total rent + hint `/close · /pool · /set`):
```
📊 Open Positions (1)
━━━━━━━━━━━━━━━━━
1. TOKEN/SOL  ⚠️ OOR 12m
   value $48.20 · PnL -$1.10 (-2.2%) · fees $0.42
   age 3.4h · range 70 bins · 🔒 0.057◎ · 💧 fee 0.87%
━━━━━━━━━━━━━━━━━
🔒 Total tertahan ~0.057 SOL — refund saat close
/close <n> · /pool <n> · /set <n> <note>
```
`cur` = solMode-aware. fee-density (💧) = (collected+unclaimed)/value × 100, **bukan** annualized (komentar kode: APR proper ada di /report). REPL: ➖ (tak ada list bernomor).

### /pool <n> — TG only (index.js:3666–3693)
`buildRangeEfficiencyLines(pos,tracked)` (index.js:1649) + value + rent + note:
```
1. TOKEN/SOL
Pool: <addr>
Position: <addr>
── Range efficiency ──
Range bins: 12345 → 12414 (70 bins · bin_step 100)
Active bin 12420: [████████████████████] 100% (75 dari bawah / -6 ke atas)
State: ⚠️ OOR 12m
In-range (approx): ~94% · in ~3.2h / OOR-spell 12m
── Value ──
PnL: -2.2% | fees: $0.42 | value $48.20
Age: 3.4h
🔒 Tertahan (rent): 0.0571 SOL — refund saat close
Note: <instruction kalau ada>
```
**Catat (recon `routput-progress.md`):** "In-range (approx)" = perkiraan dari current OOR-spell saja; arah/kedalaman/jumlah OOR historis TAK kecatat → over-state utk posisi yang sering kabur-balik. Flag buat Phase 2/3.

### /briefing — TG (3498–3505) pin · REPL (4068–4073) plain
Sumber sama `generateBriefing()` (HTML). TG `sendAndPinBriefing` (auto-pin, unpin lama). REPL strip tag + print.

### /report [all|setups|<racikan>|week|month|day] — TG (3508) HTML · REPL (4076) plain
Sumber sama `buildReportForArg` (index.js:281). Tiering: default=racikan aktif, `all`=lifetime, `setups`=daftar racikan, `<nama>`=per-racikan, `week|month|day`=digest. **Paling konsisten antar surface** (cuma beda HTML vs strip).

### /config · /config core — TG only (3612–3614)
`formatFullConfig()` (kaskade 3-tingkat, origin grouping) / `formatCoreConfig()`. Render-only; nampilin lever uang (deployAmount, sizing, SL/TP, dst). Boolean = 🟢/⚪.

### /settings /menu /configmenu — TG only (3479–3481)
`showSettingsMenu` → menu tombol (registry `MENU_CONTROLS`, paginasi, edit numeric inline / free-form lewat /setcfg). REPL ➖.

### /setcfg <key> <value> — TG only (3751–3768)
`parseConfigValue` → `executeTool("update_config", …)`. Sukses: "✅ Updated <key> = <json>". Gagal: "Config update failed. Unknown: …". Validasi format ada di `config-schema.js` (jalur ini ikut). 🟠.

### /preset [list|save|use|show|rm] — TG (3617) & REPL (4216) ✅ KONSISTEN
Sama-sama `runPresetCommand(argStr)` → `{text, applied}`; kalau applied → `finishPresetApply({viaTelegram})` (auto-backup + restart pm2). Satu-satunya command non-trivial yang identik dua surface.

### /screen — TG only (3771–3777) → `runDeterministicScreen(5)` (kirim hasil teks)
### /candidates — TG (3780) 🔶 vs REPL (4090) 🔶 — SEMANTIK BEDA
- **TG** `/candidates` = `describeLatestCandidates(5)` → baca **cache** `_latestCandidates` (kalau kosong: "No cached candidates yet. Run /screen first."). Format: list bernomor `1. NAME | fee/aTVL x% | vol $y | in-range z% | organic w`.
- **REPL** `/candidates` = **fetch LIVE** `getTopCandidates({limit:5})` + `setLatestCandidates` + `formatCandidates` → **tabel** ber-header (`# pool fee/aTVL vol in-range organic`, padding kolom).
→ Nama sama, perilaku + format beda. (TG `/screen` ≈ REPL `/candidates` dari sisi "fetch live".)

### /close <n> — TG only (3696–3713) 🔴
`closePosition({position_address})`. Sukses: "✅ Closed <pair>\nPnL: $X | close txs: … (+claim txs)". REPL: hanya via chat LLM (gated confirm).

### /closeall — TG only (3716–3734) 🔴
Loop `closePosition` semua posisi; ringkas "Close-all finished.\n<pair: closed/failed>". REPL ➖.

### /set <n> <note> — TG only (3737–3748)
`setPositionInstruction`. "✅ Note set for <pair>: …". Bukan uang.

### /deploy <n> — TG (3785–3804) 🔴 vs REPL angka (4006–4022) 🔴
- TG: `deployLatestCandidate(idx)` → "✅ Deployed <name> … Amount: X SOL … Range: …".
- REPL: ketik angka → `agentLoop("Deploy DEPLOY SOL into pool …", SCREENER)` → reply LLM. **Beda jalur** (TG = deterministik fungsi; REPL = via agent LLM).

### /pause /resume — TG only (3807–3825)
stop/startCronJobs. REPL: cron auto-start di boot (`launchCron`), `go` = start tanpa deploy.

### /hive · /hive pull — TG only (3827–3855)
Status HiveMind (enabled/agentId/url/pull-mode/register/lessons/presets count).

### /thresholds — REPL only (4101–4123) 🟠
Dump 10 lever screening + perf (win rate / avg PnL) atau "preset defaults". TG ➖.

### /learn [addr] — REPL only (4126–4172)
Studi top LPer via `agentLoop(GENERAL)` + `add_lesson`. TG ➖.

### /evolve · /evolve force — REPL only (4175–4213) 🟠
Gated `evolveEnabled` (FROZEN di mainzen_v2). Plain `/evolve` saat frozen → tolak + jelaskan; `/evolve force` = override tulis sekali. Butuh ≥5 closed. TG ➖.

### angka `1/2/3…` · `auto` · `go` — REPL only (4005–4045)
`1..N` = deploy ke `_latestCandidates[N-1]` via agent SCREENER 🔴. `auto` = agent pilih+deploy 🔴. `go` = start cron.

---

## D. Daftar GAP / divergensi (input Phase 4 parity)

1. **/status TG ≫ REPL** — REPL minim (no formatWalletStatus / OpenRouter / all-time / learning / SOL price). #1 prioritas parity.
2. **/candidates semantik beda** — TG=cache+list, REPL=fetch-live+tabel. Samakan: pisah "cache view" vs "fetch", samakan formatter.
3. **/wallet hanya TG** — REPL tak punya tracker SOL sama sekali.
4. **Command POSISI/DEPLOY hanya TG** — /positions, /pool, /close, /closeall, /set, /deploy, /screen tak ada di REPL (REPL pakai chat LLM untuk close, angka untuk deploy). Inkonsisten mental-model.
5. **Command LEARN hanya REPL** — /thresholds, /learn, /evolve tak ada di TG.
6. **/stop di TG tak ada handler** — terdaftar di `BOT_COMMANDS` tapi jatuh ke LLM. ⚠️ bug/gap.
7. **Banner REPL ≠ formatHelpText** — dua daftar command yang beda & banner REPL out-of-date.
8. **Kosakata "balance" vs "status"** — TIDAK ADA command `balance`; kedua surface pakai `/status` tapi maknanya divergen (lihat #1). Plan Phase 4 nyebut "cli balance vs tg status" → realitanya: REPL `/status` ≈ versi-miskin TG `/status`; tak ada alias `balance`/`/wallet` di REPL.
9. **HTML vs strip** — render dijahit di hulu (HTML). Perlu view-model netral + 2 renderer (Phase 2).

---

## E. Flag MONEY-LOGIC (ringkas)

- 🔴 **Gerakin modal nyata:** TG `/close`,`/closeall`,`/deploy`; REPL angka-pick, `auto`, chat "close/deploy". → wajib confirm-gate (TG: ada `requestConfirmation`; REPL: sengaja tanpa, operator lokal).
- 🟠 **Ubah perilaku-uang:** TG `/setcfg`,`/settings`,`/preset`; REPL `/evolve(force)`,`/preset`,`/thresholds`(view). Render harus jujur soal lever yang aktif (sizing/SL/TP/threshold).
- 🟡 **Nampilin uang (akurasi kritis):** TG `/status`,`/wallet`,`/positions`,`/pool`,`/report`,`/briefing`,`/config`; REPL `/status`,`/report`,`/briefing`,`/candidates`.

### Hotspot akurasi-tampilan-uang (kontrak Phase 2)
- **Simbol mata uang** `config.management.solMode ? "◎" : "$"` tersebar (/status,/positions,/pool,/close,REPL /status) — TAPI `formatWalletStatus` hard-`$`. → satu pesan bisa campur ◎ & $. Pusatkan di renderer.
- **Vocab PnL/Net** — `formatPnlTracker`: "Net = PnL − gas − LLM"; /positions & /pool pakai "PnL"; /status "All-time PnL". (Kerja F3 sebelumnya: PnL=dagang / Net=after-opex — lihat memory render-consistency.) Pastikan konsisten satu basis.
- **Rent "Tertahan (cair)"** — muncul di TG /wallet,/positions,/pool; TIDAK di REPL. `formatWalletStatus`: rent BUKAN dikurangi dari "Bebas" (sudah keluar wallet), cuma info. Jaga logika ini di view-model.
- **fee-density (💧)** — hanya /positions; "bukan APR". APR proper di /report. Jangan dobel-makna.
- **range-eff "In-range (approx)"** — over-state utk posisi sering OOR-balik (arah/depth/count tak kecatat). Label "approx" wajib dipertahankan.

---

## F. Status & langkah lanjut
- Phase 1 = file ini (inventaris + R-command-review + daftar gap). **DONE setelah review owner.**
- Phase 2 = dari §C (output EXACT) + §E (hotspot) → kontrak view-model + 2 renderer (HTML/plain).
- Daftar gap §D = checklist Phase 4 (parity).
