# clone-hygiene-procedure — bikin BOT baru dari MAIN tanpa warisin history

**Tujuan:** clone bot Meridian baru (mis. bot #4/#5) dari MAIN (`~/meridianzen`) supaya jalan kode terbaru
TAPI **nol warisan**: nol history/state/secret/identitas bot lain. **2 BOT UANG ASLI** — wallet & pm2 salah = duit/proses bentrok.
**Sumber:** `meridianzen2/notes/v3-recon-forensics.md` (FASE 4) + `[[meridian-v3-sync-procedure]]` + `[[meridian-data-files-to-preserve]]`.
**Bukti basis:** klasifikasi file diverifikasi via `git ls-files` di `~/meridianzen2` (2026-06-20).

Notasi: `<N>` = nomor bot baru (mis. 4). `~/meridianzenN` = folder bot baru. `meridian-vN` = nama pm2 baru.

---

## ⭐ ATURAN EMAS
1. **`git clone`, BUKAN `cp -r`.** `cp -r` ngebawa SEMUA file gitignored (state.json, lessons.json, .env, presets/, logs/, pool-memory, dst.) = **polusi penuh + bocor wallet bot lama**. `git clone` cuma bawa file ter-track = hampir bersih.
2. **Clone dari LOCAL `~/meridianzen`, bukan GitHub.** GitHub `origin` ketinggalan (~50 commit); logic terbaru ada LOKAL di `~/meridianzen` (lihat [[meridian-v3-sync-procedure]]). Clone GitHub = kode basi.
3. **Wallet bot baru WAJIB wallet BARU.** Jangan pernah pakai `WALLET_PRIVATE_KEY` bot lain (dua bot satu wallet = saling tutup posisi / rusak akuntansi).
4. **pm2 name WAJIB unik.** `meridian` (main) / `meridian-v3` (v3) sudah dipakai → pakai `meridian-v<N>`. Nama dobel = pm2 collision (lihat landmine sync).

---

## LANGKAH

### 0. Pra-clone (sekali)
- Tentukan: `<N>`, folder `~/meridianzenN`, pm2 name `meridian-v<N>`, wallet BARU (private key + address), Telegram bot+chat BARU, OpenRouter key (boleh sama/baru), RPC URL.

### 1. Clone kode dari MAIN (git → cuma file ter-track)
```bash
git clone /home/ubuntu/meridianzen /home/ubuntu/meridianzenN
cd /home/ubuntu/meridianzenN
git checkout experimental          # branch logic terbaru; verify: git rev-parse --abbrev-ref HEAD
git remote remove origin           # opsional: putus dari path lokal main biar gak salah pull
npm install                        # node_modules gitignored → harus diinstall ulang (jalankan postinstall patch-anchor)
```
**Auto ke-COPY (benar, biarin):** semua `*.js` (index/agent/lessons/state/reports/briefing/config/tools/* dst.), `*.md` (README/CLAUDE/SETTINGS/notes), `*.example.*` (`.env.example`, `user-config.example.json`, `gmgn-config.example.json`), `package-lock.json`, `scripts/`, `test/`.

### 2. ⚠️ LANDMINE — kosongkan arsip warisan (TRACKED history-state)
`lessons-archive-pre-mainzen_v2.json` **ter-track git** → ikut ke clone bawa **84 record era lama** (muncul di `/report all` sebagai history palsu, termasuk GACHA-SOL -53%). `.gitignore` TIDAK melindungi (sudah tracked). **Wajib reset:**
```bash
cat > /home/ubuntu/meridianzenN/lessons-archive-pre-mainzen_v2.json <<'JSON'
{ "archived_at": null, "reason": "fresh clone — no inherited archive", "active_racikan_at_archive": null, "count": 0, "performance": [] }
JSON
```
(Bentuk valid; `getArchivedPerformance` lessons.js:904-913 baca `d.performance || []` → `[]`. Bisa juga isi `[]` doang.)

### 3. SET-fresh per-bot — SECRET (gitignored; bikin baru, JANGAN copy bot lain)
- **`.env`** (dari `.env.example`): `WALLET_PRIVATE_KEY` = **wallet BARU**, `RPC_URL`, `TELEGRAM_BOT_TOKEN` = bot BARU, `TELEGRAM_CHAT_ID`, `OPENROUTER_API_KEY`. (`fill-env.sh` bisa bantu isi — lihat langkah 5.) Jangan bawa `.env.bak.*`.
- **`gmgn-config.json`** (opsional) — bikin dari `gmgn-config.example.json` kalau dipakai.

### 4. SET-fresh per-bot — CONFIG (gitignored)
- **`user-config.json`** dari `user-config.example.json`. ⚠️ set `preset` = archetype nyata (mis. `"custom"`), JANGAN nilai basi `"mainzen_v3"` (lihat v3-report-audit F1 — bikin `🧬 Profil` salah-label). Set `activeSetup` ke racikan bot baru (atau null awalnya).
- **`presets/`** (gitignored, TIDAK ke-clone) — **mulai kosong** atau bikin racikan BARU. **JANGAN copy `presets/*.json` bot lain**: snapshot penuh = mengandung API key + identitas + nilai `preset` basi.

### 5. RE-STAMP identitas per-bot (file TRACKED — isi-nya identitas bot SUMBER, wajib ganti)
- **`ecosystem.config.cjs`** → `name: "meridian-v<N>"` (sekarang ke-clone = `"meridian"` dari main). Wajib unik.
- **`package.json`** → script `pm2:restart`/`pm2:logs` target `meridian-v<N>` (field `name:"dlmm-agent"` boleh tetap, sama di semua bot).
- **`fill-env.sh`** → sesuaikan path/identitas kalau ada referensi spesifik bot.
- **`backup.sh`** → target backup per-bot (mis. `~/meridianzenN-backups/`); bikin folder + cron-nya kalau perlu.
> Landmine sync masa depan: saat sinkron kode dari main (`git checkout origin/experimental -- .`), 4 file ini **ke-timpa** identitas main → SELALU restore: `git checkout experimental -- ecosystem.config.cjs package.json` (+ fill-env/backup manual). Lihat [[meridian-v3-sync-procedure]].

### 6. HISTORY-STATE — sudah auto-fresh (gitignored, TIDAK ke-clone)
File ini **otomatis absent** setelah `git clone` (dibuat kosong oleh bot saat jalan). **Jangan** copy dari bot lain:
`state.json` · `lessons.json` · `pool-memory.json` · `candidate-memory.json` · `decision-log.json` · `signal-weights.json` · `sol-balance-history.json` · `gas-log.json` · `llm-cost-log.json` · `strategy-library.json` · `token-blacklist.json` · `smart-wallets.json` · `hivemind-cache.json` · `logs/`.
→ Satu-satunya history-state yang TIDAK auto-fresh = arsip di langkah 2 (tracked) — itu sebabnya langkah 2 wajib.

### 7. Start (owner)
```bash
cd /home/ubuntu/meridianzenN && npm run pm2:start     # = pm2 start ecosystem.config.cjs (name meridian-v<N>)
pm2 logs meridian-v<N> --lines 50                      # pantau boot
pm2 save                                                # persist daftar pm2
```
(Disarankan tes `DRY_RUN=true node index.js` dulu sebelum live.)

---

## ✅ CHECKLIST VERIFIKASI (sebelum anggap bersih)
- [ ] `git rev-parse --abbrev-ref HEAD` = `experimental` (kode terbaru).
- [ ] `pm2 ls` → `meridian-v<N>` unik, TIDAK bentrok `meridian`/`meridian-v3`.
- [ ] **Wallet BARU**: address di `.env` ≠ wallet bot lain (cek balance address baru, bukan re-use).
- [ ] `lessons-archive-pre-mainzen_v2.json` → `performance: []`, `count: 0` (langkah 2).
- [ ] `/report all` di bot baru = **0 trade** (atau cuma trade-nya sendiri) — TIDAK ada history bot lain / GACHA -53%.
- [ ] `/report` (default) = racikan bot baru sendiri; `🗂️ Racikan` benar, `🧬 Profil` bukan nilai basi.
- [ ] `state.json` open positions = 0 (fresh) dan cocok on-chain wallet baru (kosong di awal).
- [ ] `.env`, `user-config.json`, `presets/` = punya bot baru, NOL secret/preset bot lain.
- [ ] Telegram bot/chat = baru (notif gak nyampur ke chat bot lain).

## Catatan
- Reset arsip warisan di v3 sudah dilakukan (2026-06-20, backup di `/home/ubuntu/backups/`). Bukti & latar belakang: `meridianzen2/notes/v3-recon-forensics.md`.
- Pertimbangan struktural (di luar prosedur ini): bikin `lessons-archive-pre-mainzen_v2.json` **gitignored** di main supaya clone berikut gak kena landmine langkah 2 — keputusan owner (arsip jadi murni per-bot, gak ke-track).
