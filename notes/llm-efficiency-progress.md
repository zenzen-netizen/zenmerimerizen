# LLM-EFFICIENCY — BUILD PROGRESS (quality-safe waste-trim)

> Sumber: [[notes/llm-cost-recon.md]] rekom #2/#4/#5. Branch `experimental`, BOT UTAMA
> `/home/ubuntu/meridianzen`. v2.1 LIVE. Per-fase commit, revertible. NOL sentuh
> model / pilih-pool / exit / sizing / hard-filter screening. Bukti = file:line.
> Mulai 2026-06-20.

## PRINSIP
- Hemat HANYA dari WASTE (frekuensi × token/call × call/cycle), bukan dumb-kan keputusan.
- Tiap fase revertible via git. FASE 2 butuh VALIDASI kualitas pasca-restart.

---

## FASE 1 — CONFIG + PROMPT (aman, no validasi) — ✅ DONE (commit + config applied)

### #2 adaptiveScreening ON ✅
- [x] `adaptiveScreening: true` + `maxScreeningIntervalMin: 60` di user-config.json (flat, baris 69-70).
  ⚠️ user-config.json **gitignored** (file runtime live) → applied ke disk live tapi TIDAK
  masuk git. Revert = edit balik 2 key / preset backup. Berlaku saat restart (config.js
  baca saat boot).
- Mekanisme (CONFIRMED bersih):
  - `effectiveScreeningIntervalMin()` (index.js:1179) → stretch ke ceiling 60 HANYA
    saat `classifySession(currentWibSession)` == "weak"; else floor 30.
  - `shouldRunScheduledScreening()` (index.js:1192) → gate cron tick; freed-slot/
    event-driven trigger BYPASS (panggil runScreeningCycle langsung).
  - Management & PnL-poll cadence TAK ke-throttle (cron terpisah, index.js:1265).
  - Config default: adaptiveScreening=false, maxScreeningIntervalMin=90 (config.js:283-284)
    → wajib set eksplisit di user-config.json.
- Konfirmasi jalan: pasca restart, cari log "Screening tick skipped — adaptive throttle"
  di sesi lemah.

### #5 prompt-nudge SCREENER ✅ (commit 60f419d)
- [x] Directive ditambah di index.js:1046 (setelah blok kandidat, sebelum STEPS): semua data
  kandidat SUDAH di blok → putuskan LANGSUNG, JANGAN panggil get_token_info/get_token_holders/
  get_token_narrative/check_smart_wallets_on_pool/get_active_bin/get_pool_memory. Nudge doang,
  nol hapus tool di fase ini.

---

## FASE 2 — TRIM TOOL-SCHEMA (kode, VALIDASI quality) — ✅ DONE (commit 941ca00)
- [x] Hapus dari `SCREENER_TOOLS` (agent.js:15) 6 tool (5 item) yg datanya pre-loaded:
  get_active_bin, check_smart_wallets_on_pool, get_token_holders, get_token_narrative,
  get_token_info, get_pool_memory. SCREENER_TOOLS internal-only (agent.js:86), nol dependency luar.
- [x] Cleanup instruksi basi: index.js:4013 manual deploy CLI REPL (role SCREENER) dulu
  "Call get_active_bin first then deploy_position" → "Call deploy_position (it reads the active
  bin itself)". `deployPosition` fetch active bin sendiri (dlmm.js:697) → trim aman, deploy normal.
- [x] CEK konsistensi prompt: prompt.js:191 PARALLEL FETCH RULE = branch GENERAL (prompt.js:175),
  bukan SCREENER → GENERAL tetap punya semua tool, AMAN. SCREENER system prompt (prompt.js:114-158)
  sudah bilang "All candidates pre-loaded, active_bin pre-fetched" — konsisten, nol instruksi basi.
- [x] Tool impls TETAP wired di GENERAL/manual (definitions.js + executor.js + MANAGER tak disentuh).
- Mapping pre-loaded (index.js candidateBlocks 922-1004):
  - active_bin → `active_bin:` (index.js:929,978/996)
  - smart_wallets → `smart_wallets:` (index.js:977/995)
  - narrative → `narrative_untrusted:` (index.js:982/1001)
  - audit top10/bots/fees/launchpad → `audit:` (index.js:992) [get_token_info/holders]
  - pool memory → `memory_untrusted:` (index.js:983/1002)
- ⚠️ VALIDASI pasca-restart 5-10 cycle: model tetap DEPLOY normal, pilih pool bagus,
  nggak garble, nggak nyari tool ilang. Degradasi → revert FASE 2 (git).

---

## FASE 3 — VERIFIKASI + RESTART — ✅ VERIFIED, ⚠️ RESTART PENDING (owner)
- [x] `node --check` index.js + agent.js + config.js → OK.
- [x] `git diff --stat 3fd6f19 HEAD` = agent.js (tool-list) + index.js (prompt) SAJA, 11+/2−.
  Config di user-config.json (gitignored, applied live, baris 69-70).
- [x] exit/sizing/screening-hard-filter/model **NOL** diubah (diff murni tool-set + teks prompt).
- [x] git branch=experimental; pm2 id0=meridian cwd /home/ubuntu/meridianzen online (BOT UTAMA cocok).
- [ ] ⚠️ **RESTART PENDING** — sengaja ditahan: saat audit ada **1 posisi terbuka OOR** peak ~2.84%
  (trailing-TP ARMED) + screening lagi **di-SKIP** (wallet 0.028 SOL, modal kurang). Restart
  SEKARANG = nol benefit (screening tak jalan) + risiko kecil delay exit saat boot. Rekom owner:
  `pm2 restart 0 --update-env` **saat flat** (posisi tertutup / wallet sudah cukup screening lagi).
- [ ] Pantau pasca-restart 5-10 cycle: biaya/cycle turun di llm-cost-log.json + SCREENER tetap
  DEPLOY normal (pilih pool bagus, no garble, no nyari tool ilang). Degradasi → revert FASE 2
  (git revert 941ca00). Cari log "Screening tick skipped — adaptive throttle" (konfirm #2 jalan).

---

## RINGKASAN COMMIT (branch experimental)
- `60f419d` perf(screening): #5 nudge SCREENER use pre-loaded recon (index.js)
- `941ca00` perf(screening): #4 trim 6 pre-loaded recon tools from SCREENER schema (agent.js + index.js CLI)
- #2 config (adaptiveScreening+ceiling 60) → user-config.json (gitignored, applied live, no commit)

---

## ITEM TERPISAH (BUKAN bagian build ini)
- #6 perluas direct-exec (Lever-A) ke trailing-TP/low-yield/claim → nyentuh jalur close,
  hati-hati, sekalian bagus buat filosofi gap-fix. ITEM TERPISAH.
- #3 frekuensi (screeningIntervalMin 30→45) → HOLD (ada trade-off peluang).
