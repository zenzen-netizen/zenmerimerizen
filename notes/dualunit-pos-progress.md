# 🅵-D2 Dual-unit /positions & /pool + marker floating P&L — Progress

## FASE 0 — Setup
- [x] cd /home/ubuntu/meridianzen
- [x] git branch → experimental
- [x] git status → M notes/dualunit-status-progress.md (commit note update), 2 untracked notes, bersih
- [x] progress file created

## FASE 1 — RECON-CONFIRM (READ-ONLY)
- [ ] 1. format.js: fmtBoth, fmtBothSigned, fmtMoney, fmtMoneySigned ada
- [ ] 2. positions.js: buildView signature, return, render PnL+Value cocok
- [ ] 3. pool.js: buildView return + render PnL+Value cocok
- [ ] 4. cycle.js: baris PnL cocok
- [ ] 5. index.js: getSolMarketRegime import, handler /positions & /pool cocok

## FASE 2 — EDIT format.js (2 helper)
- [ ] Tambah fmtBothFromMode + pnlMark
- [ ] node --check

## FASE 3 — EDIT positions.js
- [ ] import + buildView signature + return + render PnL+Value
- [ ] node --check

## FASE 4 — EDIT pool.js
- [ ] import + render PnL+Value
- [ ] node --check

## FASE 5 — EDIT cycle.js (marker only)
- [ ] import + render PnL
- [ ] node --check

## FASE 6 — EDIT index.js (plumbing)
- [ ] handler /positions: fetch solPrice
- [ ] handler /pool: fetch solPrice + field solPrice
- [ ] node --check

## FASE 7 — VERIFIKASI + smoke-test (owner) — TUNGGU ZEN
Agent STOP. npm run test PASSED (exit 0). Diff --stat: 5 file target (+notes).
git diff review: cocok brief, nol money-logic kesenggol, NOL sentuh dlmm.js.

Instruksi untuk Zen:
1. pm2 restart meridian
2. Telegram /positions:
   - profit → 🟩 PnL: +X% · +$Y (≈◎Z) ; loss → 🟥 PnL: −X% · −$Y (≈◎Z)
   - 💵 Value: $Y (≈◎Z) · fees $F (fees 1-unit)
   - header range 🟢/🔴 tetap utuh; held/rent tetap ◎
3. Telegram /pool <n>: sama (PnL marker + dual, Value dual)
4. Tunggu/lihat pesan management cycle berikutnya: baris PnL diawali 🟩/🟥 (cuma %, no dual)
5. Cek nalar konversi: angka ◎ vs $ ~ sesuai harga SOL sekarang
6. Kalau Jupiter lagi down (solPrice null) → tampil 1-unit aja (tanpa ≈◎), marker tetap muncul
7. Kalau salah/error → lapor, kita revert/perbaiki

## FASE 8 — COMMIT (setelah owner OK)
- [ ] git add views/format.js views/positions.js views/pool.js views/cycle.js index.js notes/dualunit-pos-progress.md
- [ ] git commit -m "🅵 dual-unit /positions+/pool (Opsi 2) + marker floating P&L 🟩/🟥 (display-only)"
- [ ] JANGAN push kecuali Zen minta.