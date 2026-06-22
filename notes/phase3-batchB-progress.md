# PHASE 3 BATCH B — PROGRESS

Workstream 🅴 — Batch B (notif live). Bot MAIN (`pm2 id 0` = meridian, branch `experimental`).
Display-only, restart owner-only. Render notif → `views/notifs.js`; `telegram.js` jadi wrapper tipis.

- [x] 0  tuntasin 2dp fmtCur ($ branch) + literal Saldo wallet.js + re-verify msg ter-migrasi ✅
- [x] 1  recon EXACT notifyDeploy/OOR/Swap/Close (telegram.js) — semua field + baseline ✅
- [x] 2  notifyDeploy → views/notifs.js renderDeploy (tree, SEMUA field) ✅
- [x] 3  notifyOutOfRange + notifySwap → renderOOR + renderSwap (tree) ✅
- [ ] 4  notifyClose → renderClose (tree + fmtBoth $+◎, SEMUA field)

## Temuan kritis (pra-eksekusi, ngaruh ke FASE 4)
- **solMode MAIN = undefined → USD mode** ($).
- **notifyClose cuma terima SATU nilai uang mode-correct, BUKAN dua.** Caller executor.js:802 kirim
  `pnlUsd = result.recorded_pnl_usd ?? result.pnl_usd ?? 0` + `feesUsd = result.fees_earned_usd`. Di
  dlmm.js:2354-2369: `recorded_pnl_usd` = USD saat solMode off, `null` saat on (lalu fallback ke
  `pnl_usd` yg SOL). Jadi nilainya mode-correct (1 unit), **tak ada `sol_price`** di payload notif.
- ⇒ `fmtBoth($,◎)` butuh DUA nilai; cuma 1 tersedia. Nurunin unit kedua butuh `sol_price` → harus
  ubah executor.js:802 (DILARANG governing #3). Sesuai brief: "kalau cuma $ … tampilkan apa adanya +
  catat (jangan ngarang konversi)". → FASE 4: fix HARD-$ (mode-correct) PASTI; true 2-unit = perlu
  keputusan owner (lihat catatan FASE 4 nanti).

## FASE 0 — hasil
- `views/format.js` `fmtCur` cabang `$` → `.toFixed(2)` (◎ branch tetap round). `views/wallet.js`
  literal Saldo (dua occurrence: primary off + secondary on) `$` → `.toFixed(2)`.
- Re-verify: USD mode Saldo `$185.10` · per-slot `$75.00` · bebas `$155.10` (semua 2dp via fmtCur);
  solMode ON ◎-branch tak berubah (◎1.234/◎0.5/◎1.034), secondary $ ikut 2dp. node --check OK.
- Catatan: baris `SOL @ $<price>` (round) di luar enumerasi brief FASE 0 → dibiarkan (harga referensi).

## FASE 1 — recon EXACT (telegram.js:575-671), baseline /tmp/bl_{deploy,close,swap,oor}.txt
Guard semua: `if (hasActiveLiveMessage()) return;` (JANGAN diubah). Divider lama `NOTIF_DIV` = 16×`─`
(light) → diseragamkan ke `SEP` format.js 16×`━` (heavy). Header lama `<b>`→pakai `header()` (tanpa bold,
selaras semua view ter-migrasi) + ikon per brief. Inline HTML field (`<code>`/`<i>`/`<b>label`) DIPERTAHANKAN.

**notifyDeploy** (data: pair, amountSol, position, tx, priceRange?, rangeCoverage?, binStep?, baseFee?; racikan dari activeRacikan()):
1. `✅ <b>Deployed</b> <pair>` → ikon `🚀` (brief). 2. DIV. 3. `💵 Amount: <amountSol> SOL` + IF racikan `  ·  🗂️ <racikan>` (always).
4. IF priceRange: `📐 Price range: <fmtP(min)> – <fmtP(max)>` (fmtP: v<0.0001→toExponential(3) else toFixed(6)).
5. IF rangeCoverage: `↕️ Cover: <fmtPct(down)> ↓ | <fmtPct(up)> ↑ | <fmtPct(width)> total`.
6. IF binStep||baseFee: `🧱 Bin step <binStep??"?"> · base fee <baseFee!=null?baseFee+"%":"?">`.
7. `🆔 Position: <code><pos[0:8]>...</code>` (always). 8. `🔗 Tx: <code><tx[0:16]>...</code>` (always).

**notifyOutOfRange** (pair, minutesOOR): `⚠️ <b>Out of Range</b> <pair>`→ikon `🔴` + `⏱️ Been OOR for <minutesOOR> minutes`.
**notifySwap** (inputSymbol, outputSymbol, amountIn, amountOut, tx): `🔄 <b>Swapped</b> <in> → <out>` + `💱 In: <amountIn??"?"> · Out: <amountOut??"?">` + `🔗 Tx: <code><tx[0:16]>...</code>`.

**notifyClose** (pair, pnlUsd, pnlPct, peakPnlPct?, reason?, lesson?, feesUsd?) — HARD-$ hotspot:
1. `<🟢/🔴> <b>Closed</b> <pair>` (win=pnlUsd>=0). 2. DIV.
3. `📊 Net PnL: <usd(net)> (<±pct>%)` — `usd(v)`=`±$abs.toFixed(2)` **HARD-$**.
4. IF feesUsd!=null: `   💎 Fee panen <usd(fee)>  ·  📈 Efek-harga <usd(net-fee)>` + `   ⛽ Gas ~<gasSol.toFixed(5)> SOL (est, di luar PnL — dari wallet)` (gasSol=estimateGasSol close+claim+swap).
5. IF peak&pct finite & peak>=3 & (peak-pct)>=1: `📈 Give-back: peak +<peak>% → exit <±pct>% (tinggal <gb>pp di meja)`.
6. IF reason match /PnL (-?n)%/ & gap>=5: `⚠️ Trigger di <t>%, realisasi <pct>% — harga terus bergerak selama eksekusi close (gap <g>pp).`
7. IF reason: `📋 <b>Reason:</b> <esc(reason[0:200])>`. 8. IF lesson: `📚 <b>Lesson:</b> <i><esc(lesson[0:300])></i>`.
- **Sumber `$`**: semua dari `pnlUsd`/`feesUsd` (mode-correct 1-unit) — TAK ada nilai ◎/sol_price → `fmtBoth`
  butuh 2 nilai ⇒ blok di FASE 4 (lihat Temuan kritis). Gas SUDAH ◎/SOL (tanpa $, tak ada harga).

## FASE 2 — hasil
- `views/notifs.js` BARU: `renderDeploy(d)` pakai `header(ICON.deploy,...)`+`SEP`+`tree`; `pct2` lokal
  (Cover tanpa-+, mirror telegram.js fmtPct) + `fmtPrice` lokal. `telegram.js` `notifyDeploy` → wrapper
  tipis (guard → `renderDeploy({...data, racikan: activeRacikan()})` → sendHTML).
- Cross-check vs baseline: multiset token IDENTIK kecuali `<b>`/`</b>` (bold header sengaja dilepas via
  header primitive). SEMUA field/nilai ADA: pair, amount SOL, racikan, priceRange, Cover ↓↑|, binStep/
  baseFee, Position[0:8], Tx[0:16]. Kondisional-OFF OK (esc &→&amp;, baris opsional hilang, └ pindah).
- Intended diff: ✅→🚀, +" — ", DIV `─`16→SEP `━`16, tree ├/└, `  ·  `→` · `. node --check OK.

## FASE 3 — hasil
- `views/notifs.js` +`renderOOR(d)` (ikon 🔴, "Been OOR for N minutes" dipertahankan, ⏱️→ICON.time ⏱) +
  `renderSwap(d)` (ikon 🔄, In/Out + Tx, ?? "?" fallback). `telegram.js` notifySwap/notifyOutOfRange →
  wrapper tipis (guard tetap).
- Cross-check baseline: multiset token IDENTIK kecuali `<b>` (bold header sengaja). Data ADA: swap
  in→out/amountIn/amountOut/Tx[0:16]; OOR pair/minutesOOR. node --check OK.
- Intended: OOR ⚠️→🔴, ⏱️→⏱, +" — ", DIV→SEP16, tree ├/└, `  ·  `→` · `.

## Catatan/limit-recovery
(kosong)
