# PHASE 3 BATCH A — PROGRESS

Bot: MAIN (pm2 id 0 = meridian, /home/ubuntu/meridianzen, branch experimental, LOCAL = sumber kebenaran)
Workstream: 🅴 layer presentasi modular — lanjutan pilot /positions (e9bd6a3). Pola SAMA.
Brief: migrasi 3 position-view (⑤) ke views/ + FIX bug unit ◎/$-campur di /status (#12).

- [x] 0  env + progress file
- [ ] 1  /status  → views/status.js  (FIX bug ◎/$ campur #12)
- [ ] 2  /wallet  → views/wallet.js
- [ ] 3  /pool    → views/pool.js

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
