# NEXT SESSION — langkah lanjut (sore 2026-06-09)

> Status masuk: **merge dev LIVE** (`fdc0c45`, pm2 restart #56, boot bersih).
> **v3 preset siap** (`presets/mainzen_v3.json`: spot, TP15, trailing 2.5/3.0, bins 100/90, stopLoss −12).
> Cleanup pagi selesai: scratch branch dihapus, workflow doc di-commit (`f1b7eb9`), LPAgent 401 didiagnosa.

Urutan prioritas di bawah. Pilih mana yang mau dibahas duluan pas balik.

---

## A. ✅ SELESAI (2026-06-10) — Validasi merge end-to-end
Jalur runtime ke-exercise nyata, field market terisi semua:
1. ✅ `state.json` (83 posisi): deploy terbaru `entry_mcap/entry_tvl/entry_volume/entry_holders` **terisi** (cth 2026-06-10T10:50 → mcap 7.18M, tvl 139k, vol 7.2k, holders 7999).
2. ✅ `lessons.json` (83 perf): close terbaru `entry_*` + `exit_mcap/exit_tvl/exit_volume` **terisi** (cth CQEYFv3K: entry mcap 7.18M → exit 7.73M).
3. ⚪ Hive push **N/A** — `HIVE_MIND_URL`/`API_KEY` tidak di-set di main `.env` → push memang di-skip (fitur opsional). Aktifkan dulu kalau mau diuji.
   ~~Kalau ada yg null → trace injeksi `entry_*` di `executor.js runSafetyChecks`.~~ (tidak perlu — semua terisi)

## B. 🟡 Measurement window (rejectAtBottom + instrumentasi baru)
- `rejectAlreadyAtBottom` ON sejak restart #49 (PF baseline **0.44**); restart #56 nambah data entry/exit.
- Langkah: tunggu **~15–20 closes / 3–7 hari** → `/report day` → bandingkan **PF**, **% "never green"** (falling-knife), **deploy frequency** (gate kelaperan?).
- BARU putusin: indicator Step 3 (`requireAllIntervals`) + GMGN paralel (pending dari [[screening edge audit]]).

## C. ✅ SELESAI (2026-06-10) — Fork v3 berdiri & jalan (DRY_RUN)
Fork mekanik **sudah dibuat & live** di `/home/ubuntu/meridian-v3`:
- ✅ Folder terpisah, ✅ **wallet terpisah** (`WALLET_PRIVATE_KEY` beda dari main — no collision), ✅ pm2 process terpisah (`meridian-v3`, online), ✅ **agentId terpisah** (`agt_1d9f2885cfe83abbf4d13aab`), ✅ `DRY_RUN=true`.
- ✅ Config ACTIVE = preset `mainzen_v3`: spot, trailing 2.5/3.0, TP15, stopLoss −12, bins 60/100, multi-cat (trending+top+new).
- ✅ Indicator: `entryPreset=supertrend_plus_smi` (SMI Pro), `requireAllIntervals=true`, `rejectAlreadyAtBottom=true`, interval 15m.
- **SISA (saat mau go-live nyata):** screen di pool high-vol uptrend (kelas PARQ) → matikan `DRY_RUN` → fund wallet v3 → ukur **payoff ratio + max-winner-captured + rasio Skenario A/B + kedalaman stopLoss −12 + range-eff 87–100%** (BUKAN WR/net jangka pendek). Kata user: bahas timing dulu pas mendekati final.

## D. ✅ SELESAI (2026-06-09, opsi B) — LPAgent 401
`LPAGENT_API_KEY` expired di-**comment** di `.env` (+ catatan cara re-enable), backup di `/home/ubuntu/meridian-backups/.env.bak-2026-06-09-lpagent`, restart #58 → key unset, 401 noise hilang. Relay (`agentmeridian.xyz`) tetap jadi jalur utama (key cuma fallback, README `# optional`). User input key baru manual kalau nanti ambil dari lpagent.io.

## E. ⚪ Roadmap dev (belum rilis — eksplorasi opsional)
- "Degen": server fetch pool tiap 10s + notify agent (volume + smart wallet deploy).
- "Stable": deploy hype-usdc/sol-usdc + auto-rebalance → nyambung [[bigcap plan]] (ON HOLD).

## F. 🔵 BACKLOG IDE (diskusi 2026-06-10 — belum dibangun)
### F1. Adaptive trailing (eksperimen GRUP 16, default OFF)
Ganti `trailingDropPct` statis jadi give-back DINAMIS. Konteks: angka drop tunggal salah di 2 ujung (ketat motong runner +11%, longgar ngasih balik di winner kecil). Asal dari bedah PARQ agent-1d8ac7 (+11.06%, trailing 12.56→10.22 ≈ 19% peak). Konfigurasi `adaptiveTrailingMode: off|peak|atr|hybrid`:
- **peak**: `drop ∝ peak%` (nol dependensi data).
- **atr**: `drop = k × ATR%` — **ATR feasible client-side** dari `payload.candles[]` (bikin `tools/atr.js` mirror `tools/smi.js`, no server change).
- **hybrid**: `clamp(max(k×ATR%, peakRatio×peak), floor, ceil)` ← kandidat.
Fail-open, full-sync, re-clamp ke [floor,ceil]. Dulu diparkir ("tidak diperlukan utk v3" — v3 approx statis 2.5/3.0). Lihat [[project-mainzen-v3-plan]].

### F2. Port sisa `indicatorRules` GMGN → Meteora entry
Cuma `rejectAlreadyAtBottom` (1 dari 5) yang udah diport. Aksi:
- **QUICK-WIN: nyalain `rejectAlreadyAtBottom`** di preset v2 & v3 (udah ada kodenya, default OFF) — lawan falling-knife (Magpie "never green" −12) + "no room to dump" single-side-below.
- **Port `maxRsi` (overbought-reject)** ke meteora entry = guard baru, sepasang sama rejectAtBottom ("tolak dua ujung"). Relevan khusus v3 (anti beli-pucuk → lawan leak Skenario A pump-langsung).
- Skip `requireBullishSupertrend`/`requireAboveSupertrend` (ketabrak preset ST) + `requireBbPosition` (niche).

---
**Rekomendasi urutan:** A ✅ & C ✅ beres (2026-06-10). Aktif berikutnya → **B** (measurement window: tunggu ~15–20 closes, `/report day`, bandingin PF 0.44) → lalu E/F sesuai mood. F2 quick-win (`rejectAlreadyAtBottom`) sudah kepasang di v3.
