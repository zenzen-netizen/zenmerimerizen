# v3-recon-forensics — RECON FORENSIK (READ-ONLY TOTAL) · BOT v3

**Tanggal:** 2026-06-20 · **Target:** `/home/ubuntu/meridianzen2` (pm2 `meridian-v3`) · ref read-only: `/home/ubuntu/meridianzen` (main, pm2 `meridian`)
**Mode:** READ-ONLY TOTAL. **NOL** edit kode/config/data/wallet · **NOL** commit · **NOL** git op yg ngubah · **NOL** start/stop/restart bot. Satu-satunya tulis = file `.md` ini.
**Metode:** static read kode + parse read-only `lessons.json`/`state.json`/`sol-balance-history.json` (node `JSON.parse`, baca doang) + grep log file + `git ls-files` (read-only). **2 BOT UANG ASLI.**
**Bukti:** `file:line` / path. Ragu = **UNKNOWN** (tidak nebak).

> **TL;DR**
> 1. **GACHA ≠ warisan clone — REFUTED.** Record GACHA-SOL di v3 = trade v3 ASLI (`active_setup=mainzen_v3`, deploy 2026-06-15, +0.55%). Di main, "GACHA" cuma muncul sebagai *lesson/rule* lama (trade -53% beda param), **0 record performance**. Beda trade, nama pool sama. Lebih jauh: v3 lessons.json **0 record live era-lama** — tidak ada polusi history bot lain.
> 2. **Tracking-loss v3: insiden LAMPAU (06-17→06-19), TIDAK lagi terjadi** — tapi **akar-kode belum dibenerin (laten)**. 14 backfill, semua closed, terakhir 06-19T02:30; **nol** backfill setelah sync 06-20. Akar = **deploy non-atomik**: `Create tx` nyangkut on-chain, `Add liquidity tx` gagal → `trackPosition` di-skip. Pemicu = wallet kekurangan SOL sejak ~06-16. **v3-spesifik** (main 0 backfill selamanya).
> 3. **briefing.js: scope INKONSISTEN sama `/report`.** Briefing = **all-live "All-time"** (69 record, semua racikan campur), `/report` default = **racikan-scoped** (55 record). Label PnL/Net **sudah konsisten** (fix render-consistency masuk). Briefing **tidak punya** disclosure F5a. Rekomendasi: tampilkan dua blok (all-time + racikan) — fungsinya sudah ada, tinggal dipanggil.
> 4. **Higiene-clone:** hampir semua history-state **gitignored** (aman → fresh saat `git clone`). **Satu landmine:** `lessons-archive-pre-mainzen_v2.json` = history-state **git-TRACKED** (84 record lama) → ikut kebawa ke clone, wajib di-reset. Plus file identitas (ecosystem/package pm2/fill-env/backup) ikut tracked → wajib re-stamp.

Status fase: FASE 1 ✅ · FASE 2 ✅ · FASE 3 ✅ · FASE 4 ✅

---

## FASE 1 — GACHA = warisan? (data-lineage) ✅

### Grep "gacha" (case-insensitive)
| File | Hit | Di array apa | Isi |
|---|---|---|---|
| `meridianzen2/lessons.json` (v3) | **1** | `performance[]` | `pool_name: "GACHA-SOL"` (line 4912) — record trade |
| `meridianzen/lessons.json` (main) | **5** | `lessons[]` (rules) | self-tuned rules (line 62,69,99,125,151) yg *menyebut* GACHA-SOL loss -53% |
| main `performance[]` | **0** | — | **tidak ada** record performance GACHA di main |

### Record GACHA v3 (lessons.json:4909-4949, parse read-only)
```
pool_name   : GACHA-SOL          active_setup: mainzen_v3   profile: mainzen_v3   paper: (tidak ada → LIVE)
strategy/bin: spot / bin_step 125   volatility: 8.2402
deployed_at : 2026-06-15T15:20:32.785Z   closed_at: 2026-06-15T22:49:42.431Z
pnl         : +0.55%  / +$0.14    close_reason: "⚡ Trailing TP: Low yield fee/TVL 5.95% < min 6%"
```
GACHA yg disebut di main (rule line 62/99): `strategy=spot, bin_step=100, volatility=2.9359, PnL -53%`. → **param beda total** (binstep 100 vs 125, vol 2.94 vs 8.24, -53% vs +0.55%). **Dua trade GACHA-SOL yang berbeda**, kebetulan pool sama.

### ⭐ Verdict warisan
Syarat konfirmasi warisan ("GACHA di KEDUA file dgn timestamp TUA sebelum v3 dipisah") **TIDAK terpenuhi**:
- v3 dipisah/clone ~06-10 (mtime mayoritas file `Jun 10 11:54`), live-start 06-12.
- Record GACHA v3 = **2026-06-15** (SESUDAH split), `active_setup=mainzen_v3` (racikan v3 sendiri), LIVE.
- Di main GACHA bukan record performance, cuma lesson lama (rule text).

→ **GACHA di v3 = trade v3 ASLI, BUKAN warisan clone. Hipotesis warisan: REFUTED** (dengan bukti).

### KUANTIFIKASI polusi lessons.json v3 (parse 94 record performance)
Cross-tab paper/live × era (patokan v3 live-start `2026-06-12`):

| | pre-v3 (<06-12) | post-v3 (≥06-12) | total |
|---|---|---|---|
| **paper** (`paper:true`) | 21 | 4 | **25** |
| **live** (non-paper) | **0** | 69 | **69** |

Distribusi `active_setup` (94 record): `mainzen_v3` = 55 · `null` = 14 · `<undef>` = 25.
- 25 `<undef>` == 25 `paper:true` (dry-run testing v3 sendiri, ter-isolasi tag `paper`).
- 55 `mainzen_v3` + 14 `null` = 69 live (semua post-06-12).
- **`active_setup` mainzen_v2/mainzen_v2_1 (racikan main) = 0 di v3.**

**⭐ Hasil ukur polusi:** record live "era-lama / pra-v3" di v3 = **0** (`live × pre-v3 = 0`). Tidak ada record live bot lain yang nyemar v3. 21 record pre-v3 SEMUANYA paper (dry-run v3 sebelum live), ter-tag `paper:true` → otomatis dibuang dari semua view live (`getModePerformance`/`keepMode`, lessons.js:957-961). Satu-satunya "kotoran" di lessons.json v3 = **14 record `active_setup=null`** — itu **bukan warisan**, melainkan trade v3 sendiri yang kehilangan tag (FASE 2), tanggal 06-17→06-19.

> Catatan: `lessons[]` (rules) v3 = 39 (12 pre-v3 dari 06-10/06-11 = config-change setup v3 sendiri, earliest `2026-06-10T04:52`, **bukan** turunan main yg earliest `2026-06-03`). main `lessons[]` = 109.

**Konklusi FASE 1:** `/report all` v3 **tidak** tercemar history bot lain. Yang bikin `/report` default (racikan) ≠ all-live cuma 14 record null (kehilangan tag), bukan warisan clone.

---

## FASE 2 — Akar tracking-loss v3 (masih terjadi?) ✅

### Sinyal yang benar = NOTE "Backfilled from on-chain" (BUKAN tag null)
Note ini ditulis ke **state.json** (record posisi), bukan lessons.json — `ensureDeployedAt()` push `record.notes.push("Backfilled from on-chain — deploy metadata unknown")` (**state.js:199**). (Itu sebabnya grep lessons.json untuk "backfill" = kosong.) Sejak fix F5b (sync 06-20), backfill di-stamp `active_setup=config.activeSetup` (**state.js:196**, komentar :190-198) → backfill baru tidak lagi muncul sebagai `null`, jadi sinyal andal = **note**-nya.

### Timeline backfill (state.json: 14 note; agent log: `[STATE] Backfilled untracked`)
14 record di state.json punya note backfill, **semua `closed`, semua `active_setup=null`**, `deployed_at` (= waktu first-seen) **2026-06-17T17:20 → 2026-06-19T02:30**. Per hari (dari agent log):
```
06-17: 1   06-18: 11   06-19: 2   06-20: 0
```
- **Setelah sync 06-20: NOL backfill baru.** Note backfill terakhir = 06-19T02:30. → **tracking-loss TIDAK lagi terjadi** (insiden lampau 06-17→19).
- 14 backfill ini = persis 14 record `active_setup=null` di lessons.json (pool ANSEM/SOL, drooling/SOL, RIV/SOL×3, Jotchua/SOL, Islands/SOL, 滑る猫/SOL, Joby/SOL×2, Merlin/SOL, Vort/SOL, grail/SOL, FLKR/SOL). Konsisten.

### ⭐ AKAR (terbukti di log + kode)
Pola identik di **14/14** kasus (contoh `5yKY8B4i`, agent-2026-06-17.log:3401-3459; `7SzBYce1`, agent-2026-06-18.log:97-144):
```
[DEPLOY] Position: <addr>              ← bot mulai deploy
[DEPLOY] Create tx 1/1: <sig>          ← tx pembuatan posisi DIKIRIM
[DEPLOY_ERROR] Simulation failed ...    ← langkah liquidity gagal (InvalidBinArray 0x178b / insufficient lamports)
[AGENT] ⛔ NO DEPLOY                    ← bot SANGKA deploy gagal → trackPosition TIDAK dipanggil
... (cycle management berikut) ...
[POSITIONS] Found 1 pool(s) ...         ← posisi <addr> SUDAH ADA on-chain
[STATE] Backfilled untracked on-chain position <addr>  ← di-adopsi (active_setup=null pra-fix) → ditutup
```
Verifikasi: **0/14** pernah `[STATE] Tracked new position` (= trackPosition tidak pernah jalan untuk mereka). Total window 06-17→19: `Tracked new position` = 9 vs `DEPLOY_ERROR` = 25.

**Penyebab di kode (`tools/dlmm.js`):** deploy **non-atomik 2-tx** —
- `Create tx` di-log di **dlmm.js:1082**, `Add liquidity tx` di **dlmm.js:1098**, lalu `trackPosition({...})` di **dlmm.js:1120** — **hanya tercapai kalau KEDUA tx sukses**.
- Kalau add-liquidity throw → lompat ke catch `return { success:false, error }` (**dlmm.js:1189**), `trackPosition` **di-skip**. Tapi `Create tx` (1082) **sudah** bikin account posisi on-chain → posisi yatim (untracked) → cycle management adopsi via `ensureDeployedAt` (**state.js:171-202**, dipanggil dari `getMyPositions`).

**Pemicu (v3-spesifik, operasional):** wallet kekurangan SOL. `sol-balance-history.json`:
```
06-16: 0.0180  06-17: 0.0565  06-18: 0.0264  06-19: 0.0163  06-20: 0.0560 SOL
```
Jauh di bawah `deployAmount 0.35 + gasReserve`. Deploy 06-20 (9×) error `insufficient lamports 51518027, need 77777760` (agent-2026-06-20.log:64-77) — tapi gagal "bersih" (account create tidak nyangkut) → 0 orphan. Deploy 06-17/18 kena `InvalidBinArray` (range single-side lebar 98 bin) DI MANA create-tx nyangkut → orphan. pm2 error log v3 (`~/.pm2/logs/meridian-v3-error.log`) berhenti tumbuh 06-19T12:30 (entri terakhir = insufficient lamports), nol error sejak.

**Bukan state-reset:** grep boot/restart/reset marker di agent-2026-06-1[789].log = **nol**. Setiap orphan punya `[DEPLOY] Position:` mendahului → semuanya percobaan deploy, bukan posisi tracked yang hilang massal.

### Apakah akar sudah aman?
- **F5b (sync 06-20) TIDAK membenerin akar** — cuma mengubah cara backfill di-TAG (`active_setup=mainzen_v3` + note, bukan `null`). Mekanisme orphan (deploy non-atomik, trackPosition gated full-success) **masih ada di kode** (dlmm.js:1082-1189). Jadi **laten**: kalau create-tx nyangkut lagi sambil add-liquidity gagal, orphan terulang (kini ter-tag mainzen_v3+note, bukan null).
- Bukti tidak terulang 06-20: 9 deploy semuanya gagal-bersih (insufficient lamports), 0 backfill. Belum ada deploy sukses ter-track sejak **06-17T22:31** (`Tracked new position` terakhir).

### State.json sekarang & cross-check
- v3 state.json: **0 posisi open** (closed≠true), 97 total, `lastUpdated 2026-06-20T01:00:03`. Konsisten dgn deploy 3 hari semua gagal + wallet kering.
- ⚠️ **UNKNOWN:** kecocokan dgn `/positions` live / posisi on-chain nyata **tidak diverifikasi** — butuh invoke bot/RPC (dilarang read-only). State.json bilang 0 open; benar-tidaknya vs chain = UNKNOWN.
- **Cross-check main (konfirmasi v3-spesifik):** main state.json = 210 posisi, **backfill-note = 0**, open = 0. main lessons.json = 126 perf (93 `mainzen_v2` + 33 `mainzen_v2_1`), **`active_setup=null` = 0**, paper 0, slash-name 0. → insiden ini **v3-spesifik di DATA**; bug-nya **shared-code laten** (dlmm.js sama via sync) yang **belum pernah kepicu di main**. (Audit render-consistency FASE 0 mencatat main 116 live pada 06-20; kini 126 = main lanjut trading, tetap 0 null.)

**Konklusi FASE 2:** tracking-loss = insiden **lampau 06-17→06-19**, **tidak aktif** sekarang (0 backfill pasca-sync, 0 posisi open). **Akar = deploy non-atomik + trackPosition skip-on-error (dlmm.js:1082/1098/1120/1189)**, dipicu wallet kekurangan SOL sejak ~06-16 + InvalidBinArray. **Akar-kode belum dibenerin (laten)**; F5b cuma memperbaiki atribusi/tag.

---

## FASE 3 — Audit scoping briefing.js ✅

### Apa yang ditampilkan briefing & dari fungsi apa
| Briefing | Sumber data perf | Scope | Bukti |
|---|---|---|---|
| Daily `generateBriefing` (cron 01:00 + `/report` tanpa-arg? lihat bawah) | `lessonsData.performance.filter(keepMode)` inline | **all-live** (paper/live filter doang, **TIDAK** racikan) | briefing.js:280, 304-305 |
| → blok stats | `formatStatsBlock(statsAll, "All-time")` | label **"All-time"** | briefing.js:348 |
| Periodic `generatePeriodicBriefing` (week/month + `/report day\|week\|month`) | `performance.filter(keepMode)` inline window | **all-live** window, **TIDAK** racikan | briefing.js:402-403 |

`keepMode` di briefing = **paper vs live saja** (`isPaperMode()? p.paper : !p.paper`) — briefing.js:280, 402. **Tidak** memanggil `getModePerformance()`, **tidak** `getLifetimePerformance()`, **tidak** `keepActiveRacikan`. Jadi briefing = **CAMPUR semua racikan yang live** (55 `mainzen_v3` + 14 `null` = 69 record), bukan racikan-scoped.

Bandingkan `/report` (index.js):
- `/report` **default** → `getModePerformance()` = **racikan-scoped** (`keepActiveRacikan && !paper && !suspect_pnl`, lessons.js:957-966, 887-888) → 55 record. **+ disclosure** `racikanScopeDisclosure()` (index.js:334, 350, 272-278).
- `/report all` → `getLifetimePerformance()` = semua live + arsip (index.js:300).
- `/report week\|month\|day` → `generatePeriodicBriefing()` = **all-live** (index.js:283-285) → sama seperti briefing, **bukan** racikan-scoped (inkonsistensi internal /report sendiri).

Angka nyata (data sekarang, dari v3-report-audit.md + parse ulang): all-live 69 = **+$2.72** · `mainzen_v3` 55 = **+$4.56** · 14 null (di-drop racikan) = **−$1.84**.
→ Headline briefing (**+$2.72**) ≠ headline `/report` default (**+$4.56**). Briefing ≈ `/report all` (minus arsip), bukan `/report` default.

### Disclosure trade-dikecualikan (F5a)?
**TIDAK ADA di briefing.** `getExcludedRacikanStats()` (lessons.js:989) + `racikanScopeDisclosure()` (index.js:272) **cuma** dipasang di `/report` default (index.js:350), `/wallet`+`/status` TG (index.js:3604), CLI `/status` (index.js:4062) — **bukan** di briefing.js. (Lihat render-consistency-progress.md FASE 2.) Karena briefing menampilkan all-live, dia memang tidak "diam-diam buang" trade per-racikan; tapi dia juga tidak ngasih tahu bahwa angkanya beda-scope dari `/report`.

> Catatan tambahan: briefing **tidak** memfilter `suspect_pnl` (getModePerformance memfilter). Saat ini `suspect_pnl=0` di v3 → tanpa efek, tapi inkonsistensi laten.

### Label PnL/Net (fix render-consistency)?
**SUDAH konsisten** — fix masuk ke v3 (sync 06-20 13:41):
- briefing.js:340 = `💰 PnL:` (dulu "Net PnL"). ✓
- briefing.js:200 & :470 = eksplisit `PnL <x> − biaya <y> = <net>` (after-opex). ✓
- Vocab: **"PnL"** = realized dagang (after fee/IL, before opex) · **"Net"** = after opex (gas+LLM). Selaras dgn reports.js (headline `💰 PnL`) + pnl-tracker.js. (render-consistency-progress.md FASE 1, FASE 6 smoke test.)

### ⭐ VERDICT FASE 3
- **Label:** KONSISTEN (fix render-consistency terpasang di v3).
- **Scope:** **INKONSISTEN.** Briefing (daily & periodic) = **all-live "All-time"**, `/report` default = **racikan-scoped**. Dua angka headline beda ($2.72 vs $4.56) untuk data sekarang. Briefing setara `/report all` (tanpa arsip), bukan `/report`.
- **Disclosure:** briefing **tidak** punya F5a; `/report`/`/wallet`/`/status` punya.

### Rekomendasi "tampilkan keduanya (all-time + racikan)" — REKOMENDASI ONLY, NOL ubah
Semua bahan sudah ada di kode; tinggal dipanggil di briefing.js (additive display, nol ubah scoping/data):
1. Import `getModePerformance` (+ opsional `getExcludedRacikanStats`) ke briefing.js.
2. Di `generateBriefing` & `generatePeriodicBriefing`: di samping blok **All-time** (all-live, sekarang), tambah blok kedua **Racikan aktif** = `computeTradeStats(getModePerformance())` berlabel mis. `Racikan: ${config.activeSetup}`.
3. Tambah baris `racikanScopeDisclosure()` (index.js:272 — bisa di-extract ke shared, atau duplikasi kecil pakai `getExcludedRacikanStats`) supaya gap all-time↔racikan eksplisit & briefing reconcile dgn `/report`.
4. (Opsional) samakan `/report week\|month\|day` dengan kebijakan yang dipilih supaya tidak ada tier `/report` yang diam-diam beda-scope.
→ Hasil: briefing menampilkan **all-time + racikan + disclosure**, cocok dgn `/report`. Tidak ada perubahan data/scoping inti.

---

## FASE 4 — Fakta higiene-clone (pakai v3 sbg contoh) ✅

### Cross-ref `.gitignore` (v3 `.gitignore`) — tracked vs ignored (verifikasi `git ls-files`)
**Git-TRACKED** (ikut ke clone via `git clone`/`git checkout -- .`):
`*.js` semua kode · `*.md` (README/CLAUDE/SETTINGS/notes) · `package.json` · `package-lock.json` · `.env.example` · `user-config.example.json` · `gmgn-config.example.json` · `ecosystem.config.cjs` · `fill-env.sh` · `backup.sh` · **`lessons-archive-pre-mainzen_v2.json`** ⚠️

**Gitignored** (TIDAK ikut clone via git → fresh/absent; HANYA ikut kalau folder di-`cp -r`):
`node_modules/` · `.env`, `.env.*` (kec. `.env.example`), `.envrypt` · `user-config.json` · `gmgn-config.json` · `presets/` · `state.json` · `lessons.json` · `pool-memory.json` · `candidate-memory.json` · `decision-log.json` · `signal-weights.json` · `smart-wallets.json` · `token-blacklist.json` · `strategy-library.json` · `hivemind-cache.json` · `sol-balance-history.json` · `gas-log.json` · `llm-cost-log.json` · `logs/` · `docs/` · `context.md` · `test-*.js`

### ⭐ LANDMINE: `lessons-archive-pre-mainzen_v2.json` (history-state TAPI tracked)
- `git ls-files --error-unmatch` → **TRACKED**. Isi: **84 record** performance, `2026-06-03 → 2026-06-10`, `active_setup` semua `undefined` (era pra-mainzen_v2, sebelum baseline reset).
- Display-only: `getArchivedPerformance()` → `getLifetimePerformance()` (lessons.js:904-923) → muncul di **`/report all`**.
- **Karena tracked**, `git clone`/`git checkout origin/experimental -- .` **membawa 84 record lama ini ke bot baru** → `/report all` bot baru langsung tercemar history era lama. `.gitignore` tidak melindungi (sudah tracked). **Wajib di-reset manual** (kosongkan ke `[]` / `{"performance":[]}` atau hapus) saat clone fresh.

### Klasifikasi tiap file/dir (untuk prosedur higiene-clone)

**[KODE — COPY-dari-main]** (datang via git, identik main):
semua `*.js` (index.js, agent.js, lessons.js, state.js, reports.js, briefing.js, config.js, config-schema.js, prompt.js, telegram.js, `tools/*`, dst.) · `*.md` · `package-lock.json` · file `*.example.*` (`.env.example`, `user-config.example.json`, `gmgn-config.example.json`) · `scripts/`, `test/`.

**[IDENTITAS per-bot — SET-fresh / re-stamp setelah sync]** (tracked → main bakal nimpa, harus di-set ulang):
- `ecosystem.config.cjs` — `name: "meridian-v3"` (ecosystem.config.cjs:8) → app pm2 unik per bot (hindari pm2 collision).
- `package.json` — script `pm2:restart`/`pm2:logs` target `meridian-v3` (package.json:14-15). Field `name` = `dlmm-agent` (sama di semua, tidak perlu ubah).
- `fill-env.sh` — helper khusus per-bot (v3-only per memory).
- `backup.sh` — target backup per-bot (mis. `~/meridianzenN-backups/`).
> Landmine sync (dari [[meridian-v3-sync-procedure]]): `git checkout origin/experimental -- .` MENIMPA `ecosystem.config.cjs`+`package.json` dgn identitas main → **wajib** `git checkout experimental -- ecosystem.config.cjs package.json` (restore identitas) sesudahnya.

**[SECRET per-bot — SET-fresh, JANGAN copy dari bot lain]** (gitignored):
- `.env` — `WALLET_PRIVATE_KEY` (wallet BARU), `RPC_URL`, `TELEGRAM_BOT_TOKEN` (bot Telegram baru), `TELEGRAM_CHAT_ID`, `OPENROUTER_API_KEY`. (+ `.env.bak.*` jangan dibawa.)
- `gmgn-config.json` (opsional).

**[CONFIG per-bot — SET-fresh dari template]** (gitignored):
- `user-config.json` — buat dari `user-config.example.json` (jangan copy dari bot lain: ada `activeSetup`, mungkin secret, dan nilai `preset=mainzen_v3` basi — lihat v3-report-audit F1).
- `presets/` — 3 file v3 sekarang (`mainzen_v3.json`, `Zensmiv1.json`, `_backup.json`, semua `Jun 20 13:42`). **Snapshot penuh = mengandung API key + identitas + nilai `preset` basi.** Clone fresh: **mulai kosong** / racikan baru, JANGAN copy presets bot lain.

**[HISTORY-STATE — RESET-ke-kosong (HARUS kosong di clone fresh)]:**
- Gitignored (otomatis absent saat `git clone`, tinggal jangan `cp -r`): `state.json`, `lessons.json`, `pool-memory.json`, `candidate-memory.json`, `decision-log.json`, `signal-weights.json`, `sol-balance-history.json`, `gas-log.json`, `llm-cost-log.json`, `logs/`, (+ runtime: `strategy-library.json`, `token-blacklist.json`, `smart-wallets.json`, `hivemind-cache.json` — saat ini absent di v3, dibuat kosong saat jalan).
- ⚠️ **Tracked → harus reset eksplisit:** `lessons-archive-pre-mainzen_v2.json` (84 record) → kosongkan/hapus.

### ⭐ Ringkasan untuk prosedur (dipetakan saja, prosedur ditulis terpisah)
- **COPY-dari-main (git):** semua KODE + `*.md` + `*.example.*` + lockfile.
- **SET-fresh-per-bot:** `.env` (wallet/RPC/telegram/openrouter baru) · `user-config.json` (dari example) · `presets/` (kosong/baru) · re-stamp `ecosystem.config.cjs` + `package.json` (pm2 app unik) + `fill-env.sh` + `backup.sh` (path per-bot).
- **RESET-ke-kosong:** semua HISTORY-STATE gitignored = absent kalau pakai `git clone` (bukan `cp -r`); **plus reset `lessons-archive-pre-mainzen_v2.json` (tracked!)**.
- **Aturan emas:** clone via **`git clone`**, bukan `cp -r` folder (cp bawa SEMUA data gitignored = polusi penuh). Setelah git clone, satu-satunya history-state yang masih nyemar = `lessons-archive-pre-mainzen_v2.json` (tracked) → reset. Lalu re-stamp identitas + isi secret/config baru.

---

## RINGKASAN TEMUAN
1. **GACHA ≠ warisan (REFUTED).** Record v3 = trade asli 06-15 (`mainzen_v3`, +0.55%); di main cuma lesson lama (trade -53% beda param), 0 record perf. v3 lessons.json: **0 record live era-lama** → tidak ada polusi history bot lain. "Polusi" satu-satunya = 14 record `null` (kehilangan tag, bukan warisan).
2. **Tracking-loss = insiden lampau (06-17→06-19), tidak aktif sekarang** (0 backfill pasca sync 06-20, 0 posisi open). **Akar = deploy non-atomik**: `Create tx` nyangkut on-chain sementara `Add liquidity` gagal → `trackPosition` di-skip (dlmm.js:1082/1098/1120/1189). Pemicu = wallet kering (~0.02–0.06 SOL sejak 06-16) + InvalidBinArray. **v3-spesifik di data; bug shared-code laten** (main 0 backfill selamanya). **F5b tidak membenerin akar — cuma re-tag.**
3. **briefing.js scope inkonsisten dgn `/report`:** briefing = all-live "All-time" (campur racikan, 69 record), `/report` default = racikan-scoped (55). Label PnL/Net **sudah konsisten**; briefing **tanpa** disclosure F5a. Fungsi untuk "tampilkan keduanya" sudah ada (`getModePerformance`, `getExcludedRacikanStats`, `racikanScopeDisclosure`) — tinggal dipanggil.
4. **Higiene-clone:** mayoritas history-state gitignored (fresh saat `git clone`). **Landmine: `lessons-archive-pre-mainzen_v2.json` tracked (84 record)** → ikut clone, wajib reset. Identitas (ecosystem/package-pm2/fill-env/backup) tracked → wajib re-stamp. **Pakai `git clone`, bukan `cp -r`.**

## UNKNOWN (tidak dipaksakan)
- Kecocokan `state.json` (0 open) vs `/positions` live / posisi on-chain nyata — butuh invoke bot/RPC (dilarang). UNKNOWN.
- Apakah ada close di chain yang **tidak pernah** tercatat bot sama sekali (mis. saat downtime) — tidak bisa diverifikasi read-only. UNKNOWN (gap terpisah di luar 14 null).
- Apakah `lessons-archive` (84 record) mau dipertahankan untuk `/report all` atau dianggap polusi — keputusan owner; di sini cuma dipetakan sebagai history-state tracked.

## STOP — recon selesai. Read-only total; tidak ada yang diubah selain file `.md` ini.
