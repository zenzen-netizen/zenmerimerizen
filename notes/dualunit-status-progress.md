# 🅵-D1 Dual-unit /status All-time PnL — Progress

## FASE 0 — Setup
- [x] cd /home/ubuntu/meridianzen
- [x] git branch → experimental
- [x] git status → 2 untracked (notes/roi-recon-*), bersih
- [x] progress file created

## FASE 1 — RECON-CONFIRM (READ-ONLY) ✅
- [x] 1. Baris target cocok — views/status.js:54 persis `${ICON.pnl} All-time: ${fmtMoneySigned(vm.perf.total_pnl_usd, solMode)}${roi ? ` (${roi})` : ""}`
- [x] 2. total_pnl_usd = USD asli — lessons.js:1015 `totalPnl = p.reduce((s, x) => s + x.pnl_usd, 0)`; line 1026 `total_pnl_usd: Math.round(totalPnl * 100) / 100`. Nol transform solMode.
- [x] 3. solMode = false (user-config.json:66). Mislabel TIDAK aktif sekarang; fix benar di dua mode.
- [x] 4. vm.solPrice tersedia — index.js:3062 `solPrice: wallet.sol_price` → buildView → spread ke vm (status.js:33). Dipakai di walletBlockLines (L43).
- Bonus: fmtBothSigned sudah ada di views/format.js:84. Tinggal tambah ke import.

## FASE 2 — EDIT (display-only) ✅
- [x] Tambah fmtBothSigned ke import (views/status.js:19)
- [x] Ganti baris All-time PnL → fmtBothSigned + fail-safe
- [x] node --check views/status.js → OK
- [x] git diff --stat → hanya views/status.js (1 file, +6/-2)
- [x] git diff review → cocok brief, baris Win/avg untouched

## FASE 3 — SMOKE-TEST (owner) — TUNGGU ZEN
Agent JANGAN restart. Instruksi untuk Zen:
1. `pm2 restart 0`
2. Telegram `/status` — lihat baris All-time:
   - solMode MATI (sekarang): harus `+$X.XX (≈◎Y.YYYY)` (atau `-...`)
   - solMode NYALA: harus `+◎Y.YYYY (≈$X.XX)` — BUKAN `◎X.XX`
3. ROI di kurung `(…)` tetap muncul, baris Win/avg nggak berubah.
4. Kalau salah/error → lapor, kita revert atau perbaiki.

## FASE 4 — COMMIT (setelah owner OK)
- [ ] git add views/status.js notes/dualunit-status-progress.md
- [ ] git commit -m "🅵 dual-unit /status All-time PnL + fix solMode mislabel (display-only)"
- [ ] Lapor diff final + hasil smoke-test + status solMode. JANGAN push kecuali Zen minta.