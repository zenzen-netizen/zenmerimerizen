# Dual-side FASE 3a — Progress (2026-07-03)

Wiring sisi token dual-side di JALUR RELAY saja (`shouldUseLpAgentRelayForDeploy()`
order body, `tools/dlmm.js` ~line 935-953). Jalur lokal (fallback B) TIDAK
disentuh — itu Fase 4.

[x] 1. Verifikasi branch (experimental) + node --check baseline + dualSide/dualSideTokenPct in-scope (line 745/746/749, dari fase 2)
[x] 2. Fix percentX (relay order, line 947): `finalAmountX > 0 && finalAmountY > 0 ? 0.5 : 0` → `dualSide ? dualSideTokenPct : (...)`
[x] 3. Fix strategy (relay order, line 943): `activeStrategy === "spot" ? "Spot" : "BidAsk"` → `dualSide ? (config.strategy.dualSideStrategy === "spot" ? "Spot" : "BidAsk") : (...)`
[x] 4. node --check — SYNTAX OK
[ ] 5. git diff --stat + commit

Kedua OLD string dikonfirmasi cocok TEPAT 1 tempat sebelum diedit (grep).
Konteks dicek manual: keduanya di dalam blok `if (shouldUseLpAgentRelayForDeploy())`
→ body POST `/execution/zap-in/order`, bukan jalur lokal.

Default OFF (`dualSideEnabled=false`) → `dualSide` selalu false → kedua
ekspresi jatuh ke cabang lama, byte-identical. Relay sendiri saat ini OFF
di produksi (`lpAgentRelayEnabled=false`, lihat [[project-gap-fix-phase1-relay]])
→ dobel inert: bahkan kalau dualSideEnabled dinyalain, kode ini belum akan
jalan sampai relay juga dinyalain lagi.
