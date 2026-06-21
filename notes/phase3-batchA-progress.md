# PHASE 3 BATCH A — PROGRESS

Bot: MAIN (pm2 id 0 = meridian, /home/ubuntu/meridianzen, branch experimental, LOCAL = sumber kebenaran)
Workstream: 🅴 layer presentasi modular — lanjutan pilot /positions (e9bd6a3). Pola SAMA.
Brief: migrasi 3 position-view (⑤) ke views/ + FIX bug unit ◎/$-campur di /status (#12).

- [x] 0  env + progress file
- [x] 1  /status  → views/status.js  (FIX bug ◎/$ campur #12)
- [ ] 2  /wallet  → views/wallet.js
- [ ] 3  /pool    → views/pool.js

## FASE 1 — /status (DONE)
- views/format.js: + fmtWib (WIB UTC+7, deterministik) + ICON perf/brain/arrow.
- views/wallet.js: shared helpers walletBlockLines() + systemLines() (dipakai status & wallet; anti-divergen). buildView/telegram /wallet menyusul FASE 2.
- views/status.js: buildView(input)+telegram(vm). Section: 👛 Wallet → 📈 Performa → realized-tracker(embed) → 🧠 Insight → ⚙️ Sistem(dry-run/hive/OpenRouter) → hint /positions.
- index.js: + import statusView; + helper buildOpenRouterLines() (array, verbatim); handler shared `/wallet||/status` DIPECAH → blok `/status` (view baru) + blok `/wallet` (kode LAMA byte-identik, fix FASE 2). condenseRule/perf/lessons/tracker/disclosure tetap di-gather handler.
- FIX #12 terbukti smoke-test: mode ON semua ◎ (Saldo/per-slot/bebas/All-time), mode OFF semua $ (per-slot=◎×price), held tetap ◎, SOL-price tetap $.
- Cross-check §C(82-110) NOL hilang: Saldo(2 basis)·SOLprice·Posisi x/max·per-slot(+anotasi)·bebas(+anotasi)·held(+info,+est)·Dry-run·HiveMind·OpenRouter(+warn)·All-time PnL+ROI(+"61 closed")·Win/avg·last good/bad·realized 1D/7D/30D·disclosure·hint. node --check semua LULUS.

## Keputusan arsitektur (berlaku Batch A)
- Wallet block = RE-RENDER di views/ pakai fmtCur → FIX #12 (formatWalletStatus index.js:1681 hard-$).
  Amount SOL (deploy/slot, bebas) ikut solMode (convert ×sol_price saat mode $); HELD/RENT tetap ◎ (SOL intrinsik);
  SOL-price line tetap $ (memang harga USD).
- All-time PnL + learning + lessons (status only) = re-render; PnL pakai fmtMoneySigned solMode-aware (persis `cur` lama).
- OpenRouter line + formatPnlTracker + formatSolTracker + racikanScopeDisclosure = EMBED apa adanya (string pre-rendered).
  Alasan: USD/SOL by-design + logika rumit (OpenRouter 4 cabang) → embed = nol risiko regresi, sesuai instruksi brief
  "Realized PnL/Net pakai unit sumber datanya, $ apa adanya, jangan konversi paksa". Handler tetap gather; view = formatter murni (import format.js saja).
- Field brief KURANG → ditambah balik (governing #1, seperti 💧 di pilot):
  - /wallet: Dry-run + HiveMind (ada di formatWalletStatus lama, hilang di mockup brief) → DIKEMBALIKAN.
  - Annotasi dipertahankan: "(ukuran per posisi baru)", "(wallet − gasReserve <g>)", held "— sudah keluar wallet, balik saat close" (+ "(sebagian est)").
  - /pool: label "In-range (approx)" dipertahankan apa adanya (over-state utk posisi sering OOR-balik, §E-257).

Catatan/limit-recovery:
