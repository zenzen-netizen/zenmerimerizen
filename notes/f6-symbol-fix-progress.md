# F6 — Resolusi simbol token "?" (DISPLAY-only)

**Branch:** experimental · **Scope:** render-only, additive, revertible · **JANGAN restart bot (owner).**
⚠️ DISPLAY field ONLY — NOL ubah trading/exit/screening/sizing/recordPerformance.

Shared-code (tools/pnl.js + tools/dlmm.js) → ikut ke v3 di sync berikutnya.

---

## FASE 0 — RECON ✅ (feasible, lanjut)

**Di mana "?" lahir (titik render nama posisi):**
- `tools/pnl.js:216` — jalur RPC **utama** (`computePositions`→`buildPosition`):
  `pair: tracked?.pool_name || (meteora ? \`${meteora.tokenX ?? "?"}-${meteora.tokenY ?? "SOL"}\` : "?-SOL")`.
  → "?" saat `tracked.pool_name` kosong **dan** `meteora.tokenX` null.
- `tools/dlmm.js:1822` — jalur **fallback** Meteora portfolio (`getMyPositions`):
  `pair: tracked?.pool_name || \`${pool.tokenX}-${pool.tokenY}\`` → "undefined-undefined" saat simbol null.
- `tools/dlmm.js:1781` — `ensureDeployedAt(... pool_name: \`${pool.tokenX}-${pool.tokenY}\`)` → **mem-persist** nama jelek ke state (record backfill baru saja; tak overwrite yg ada).
- `tools/dlmm.js` close RETURN (→ notif close, executor.js:802): 2362 / 2664 (`tracked.pool_name || poolMeta.name || null`) + 2695 (`poolMeta.name || null`).

**⭐ KENAPA "?":** simbol diambil dari **Meteora /pnl API** (`meteora.tokenX`, pnl.js) & **Meteora portfolio API** (`pool.tokenX`, dlmm.js). Saat API itu tak mengembalikan simbol (token baru/ilikuid / hiccup API), simbol = null → "?". Token-nya **biasanya punya** simbol di Jupiter — ini **fetch-gap**, bukan token tanpa simbol.

**MINT tersedia di semua titik render** (buat re-resolve):
- pnl.js: `f.baseMint` (dari on-chain `info.tokenX.mint.address`).
- dlmm.js fallback: `pool.tokenXMint` (1823).
- close: `closeBaseMint` (2274/2602) & `pool.lbPair.tokenXMint` (2699).

**Re-resolve ZERO-COST:** `getJupiterPrices()` (pnl.js:86) sudah memanggil
`https://datapi.jup.ag/v1/assets/search?query=<mints>` — endpoint yang **mengembalikan `symbol`** per aset
(konfirmasi token.js:47 `symbol: t.symbol`, screening.js:360). Tangkap `a.symbol` di panggilan yg sudah ada → peta `symbolByMint`, **tanpa call baru**.

**Verdict:** FEASIBLE. (a) re-resolve simbol dari mint (Jupiter, gratis) di jalur RPC utama; (b) fallback prefix-MINT (`GTAVi…-SOL`) di titik lain. Tak menyentuh trading/PnL.

---

## FASE 1 — IMPLEMENT [display-only] ✅

- ✅ Helper bersama di `tools/pnl.js` (export): `isUnresolvedName`, `mintPrefixPair`, `firstResolvedName`, `resolveDisplayPair` (pnl.js:60-103). Quote (tokenY) dipertahankan; cuma base (tokenX) yg di-heal.
- ✅ `getJupiterPrices` → `{ prices, symbols }` (tangkap `a.symbol`, **nol call baru** — endpoint sama), error-path & empty-path ikut return shape baru; caller `computePositions` di-destructure.
- ✅ `buildPosition(f, prices, symbols, …)` pakai `resolveDisplayPair(name, f.baseMint, symbols[f.baseMint])` (pnl.js:267) — **jalur RPC utama** (management cycle / `/positions` / `get_position_pnl`). Re-resolve LIVE tiap poll dari simbol Jupiter gratis.
- ✅ dlmm.js: import `resolveDisplayPair`+`firstResolvedName`; fallback path 1822 pakai `resolveDisplayPair(name, pool.tokenXMint)` (prefix-mint, tak ada Jupiter di sini).
- ✅ dlmm.js close RETURN (2362/2664 `firstResolvedName(tracked, poolMeta)` → 2695 `firstResolvedName(poolMeta)`) di-heal pakai mint → notif close. **recordPerformance/appendDecision args TAK disentuh** (cek diff: 2297/2333/2601/2637/2684 nol perubahan).
- ⏭️ **SKIP backfill 1781 (ensureDeployedAt → state.json):** sengaja. Mem-persist nama prefix-mint ("GTAVi…-SOL") bikin name kelihatan "resolved" → **mengunci** heal-simbol-live di jalur pnl.js (yg cuma jalan kalau name "?"/"undefined"). Biarkan state apa adanya supaya jalur utama heal tiap poll. (Task: "Ragu → SKIP".)

## FASE 2 — SMOKE ✅
- ✅ `node --check tools/pnl.js` & `tools/dlmm.js` → dua-duanya OK.
- ✅ Trace helper (7 kasus): good-name+symbol → **kept** (factory, tak di-override); "?-SOL"+symbol → "WIF-SOL"; "?-SOL" tanpa symbol → "GTAVi…-SOL"; "undefined-undefined" → "GTAVi…-SOL"; "?-USDC" → quote USDC dipertahankan; null+null → "?-SOL" (tak lebih buruk dari sekarang); good-name tanpa mint → kept. `firstResolvedName` pilih kandidat resolved.

## FASE 3 — VERIFIKASI ✅
- ✅ `git diff --stat`: pnl.js (+70/-15) + dlmm.js (10 baris). Diff **display-only** — cuma field `pair`/`pool_name` + plumbing simbol. NOL ubah pnl_usd/pnl_pct/bin/fee/exit/recordPerformance.
- ✅ branch=experimental. **TIDAK restart bot** (owner). Shared-code (pnl.js+dlmm.js) → ikut ke v3 di sync berikutnya.
- Commits: pnl.js (engine) + dlmm.js (wire) split per-topik.
