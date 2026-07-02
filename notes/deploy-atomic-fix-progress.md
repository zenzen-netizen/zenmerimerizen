# deploy-atomic-fix-progress — orphan saat Create-sukses + Add-gagal

**Tanggal:** 2026-06-21 · **2 BOT UANG ASLI.** MONEY-LOGIC (jalur deploy) — additive ONLY di jalur GAGAL.
**Guard:** FASE 0-3 → tulis HANYA `/home/ubuntu/meridianzen` (MAIN). FASE 4 → tulis HANYA `/home/ubuntu/meridianzen2` (v3). JANGAN restart bot (owner sendiri).
Legend: ⬜ belum · 🟦 in-progress · ✅ selesai · ⏭️ skip · ⛔ stop

---

## FASE 0 — RECON-KONFIRMASI fix-point [MAIN, baca] ✅ — CLEAR TO PROCEED (bukan STOP)
File: `tools/dlmm.js`, fungsi `deployPosition` (dlmm.js:649-1191).

**Alur dikonfirmasi — orphan HANYA di WIDE-RANGE path (>69 bins):**
- Wide-range: Phase 1 **Create** empty position `createExtendedEmptyPosition` (loop dlmm.js:1078-1083) → Phase 2 **Add liquidity** `addLiquidityByStrategyChunkable` (loop 1095-1099). DUA grup tx terpisah → Create sukses + Add gagal = posisi yatim on-chain (rent ke-lock), `trackPosition` (1120) DI-SKIP, `catch` (1187) return `{success:false}`.
- Standard path (≤69 bins, dlmm.js:1102 `initializePositionAndAddLiquidityByStrategy`) = SATU tx atomik → gagal = nggak ada posisi dibuat → **nggak ada orphan**. Fix TIDAK menyentuh path ini.

**STOP-conditions semua CLEAR:**
- ✅ Alamat tersedia di catch: `newPosition = Keypair.generate()` (dlmm.js:1053) di LUAR `try` (1060) → in-scope di catch (1187).
- ✅ Bisa tau "Create sukses": tambah flag `positionCreated`, set `true` di dalam loop Create wide-range (setelah 1082). Standard path nggak set → catch nggak track (benar, atomik).
- ✅ Idempotensi (nggak double-adopt): `trackPosition` di-key by address + protect `deployed_at` (state.js:142-145); `ensureDeployedAt` early-return kalau udah tracked (state.js:176-183). Backfill on-chain nanti (dlmm.js:1741 panggil `ensureDeployedAt`) lihat posisi udah tracked → skip. NOL double.
- ✅ Semua var di catch in-scope (verified): param `pool_address`(650)/`pool_name`(660)/`bin_step`(661) + body `activeStrategy`(675)/`activeBinsBelow`(676)/`activeBinsAbove`(677)/`finalAmountY`(727)/`finalAmountX`(728)/`activeBin`(697)/`minBinId`(877)/`maxBinId`(878).
- ✅ Note jujur: `makePositionRecord` (state.js:60) nggak punya param `note` (init `notes:[]`); diff harus dlmm.js-only → pakai `setPositionInstruction` (state.js:307) yg udah ada → set `instruction` (transparan: muncul "Note:" di /positions + prompt manager, index.js:566/3688) + nge-nudge manager nutup → recover rent.

**Pilihan diambil: A (track-on-failure)**, wide-range only, dibungkus inner try/catch = fail-safe (error apa pun NGGAK pernah halangi return `{success:false}`).

## FASE 1 — IMPLEMENT [MAIN] ✅ — **commit `380207c`** (tools/dlmm.js only, +40/-0, additive)
Pilihan A (track-on-failure), wide-range path only. Empat suntikan, semua additive:
1. import `setPositionInstruction` (dlmm.js:27).
2. `let positionCreated = false;` sebelum `try` (dlmm.js:~1061) — in-scope di try & catch.
3. `positionCreated = true;` di dalam loop Create wide-range setelah `sendTxTracked` sukses (dlmm.js:~1089) — akun posisi ada on-chain sejak create tx pertama.
4. Di `catch` (dlmm.js:~1199): kalau `positionCreated` → `trackPosition(orphanAddr,{pool,pool_name,strategy,bin_range,bin_step,amount_sol,amount_x,active_bin})` + `setPositionInstruction(orphanAddr,"incomplete deploy — liquidity add failed; close to recover rent")` + log. Dibungkus inner try/catch → NGGAK pernah halangi `return {success:false}`.
Success-path (trackPosition 1120) NOL diubah. exit/screening/sizing-amount/recordPerformance NOL.

## FASE 2 — SMOKE/LOGIC TEST [MAIN] ✅ (nol live)
- ✅ `node --check tools/dlmm.js` OK.
- ✅ diff --stat = **tools/dlmm.js doang** (+40/-0). (notes/logging-build-progress.md di working-tree = modif PRA-tugas dari sesi lalu, BUKAN aku, TIDAK di-commit.)
- ✅ Trace logika:
  - Wide create-ok + add-gagal → `positionCreated=true` → catch track 1× + instruction. ✅
  - Wide create-tx-pertama throw → `positionCreated` masih false (di-set SETELAH sendTxTracked) → NGGAK track. ✅
  - Wide create-tx2 gagal (tx1 ok) → `positionCreated=true` → track (akun ada). ✅
  - Standard (≤69 bins, atomik) gagal → flag nggak pernah di-set → NGGAK track. ✅
  - Success → trackPosition 1120 1×, catch nggak masuk → NOL double-track. ✅
  - Idempotensi: backfill `ensureDeployedAt` (dlmm.js:1741) early-return krn udah tracked → NOL double-adopt. ✅

## FASE 3 — VERIFIKASI [MAIN] ✅
- ✅ branch `experimental`; HEAD `380207c` = tools/dlmm.js only, +40/-0. working-tree: NOL perubahan kode lain (cuma `M notes/logging-build-progress.md` pra-tugas + untracked notes). money-logic-di-luar-orphan = **NOL**.

## FASE 4 — set sizingMode v3 → maximize [v3] ✅ — **TIDAK ADA WRITE (sudah maximize)**
BACA `meridianzen2/user-config.json` (gitignored):
- `sizingMode` = **"maximize"** (user-config.json:125) — **SUDAH** maximize → tidak perlu ubah. Juga sudah "maximize" di `presets/mainzen_v3.json:125` (match: true). NOL file v3 disentuh.
- Valid: config-schema.js:102 `enumOf("fixed","maximize")`; di-load ke `config.management.sizingMode` (config.js:248), dipakai adaptive-slot di config.js:522.
- Field sizing terkait (top-level user-config.json): deployAmountSol=0.35, maxPositions=1, minSolToOpen=0.15, maxDeployAmount=10, gasReserve=0.02, positionSizePct=0.33. activeSetup="mainzen_v3".
- Efek: maximize aktif saat v3 jalan; wallet v3 kering sekarang → nggak ngefek alokasi langsung sampai ada modal.

## FASE 5 — STOP + LAPOR ✅
- MAIN: deploy orphan-fix di commit `380207c` (revertible: `git revert 380207c`). Butuh restart MAIN buat aktif — **owner**.
- v3: sizingMode sudah "maximize", nol perubahan. Restart owner (kalau perlu reload) — sizingMode udah kebaca.
- **NOL bot di-restart oleh aku.**
