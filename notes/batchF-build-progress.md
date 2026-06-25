# BATCH F — PROGRESS

Workstream 🅴 batch penutup. Bot MAIN (`pm2 id 0`, branch `experimental`). Display-only.
Peta `file:line` di `notes/batchF-recon.md`. Restart owner-only.

## 3 GARIS MERAH (tak boleh tersentuh)
1. `createLiveMessage` flow/depth (telegram.js): `_liveMessageDepth` ↑↓, `scheduleFlush`/`flushNow`/`flushFinal`/`finalize`/`fail`. Boleh ganti STRING yg di-render; JANGAN alur.
2. Gate konfirmasi: slot `_pendingConfirmation`, timeout 30s, signature, handler `confirm:`, agent.js:450-457, `CHAT_CONFIRM_TOOLS`. Cuma teks prompt.
3. Vocab anti-halu `🚀 DEPLOYED` / `⛔ NO DEPLOY` (regex literal index.js:1132/1139/1145). Pertahankan APA ADANYA.

## Catatan teknis
- Pesan siklus = PLAIN TEXT (live message pakai editMessage/sendMessage TANPA parse_mode). `views/cycle.js` output teks polos — TANPA tag HTML / `esc()`. Primitif tree/ICON/SEP/fmt* aman plain.
- Return value `runScreeningCycle`/`runManagementCycle` di-discard semua caller → user lihat HANYA via live message (finalize). Early-skip screening (#1-5) return SEBELUM live message dibuat → internal-only, tetap dirapikan utk konsistensi.

## Fase
- [x] 1  Management cycle: reportLines+Summary+no-pos → tree (views/cycle.js), report-LLM dibingkai
- [ ] 2  Screening cycle: skip/no-candidates/no-deploy/funnel → tree (views/cycle.js), vocab 🚀/⛔ utuh
- [ ] 3  Confirm-prompt: summarizeTradeAction + config-diff + edit confirmed/cancelled/expired → rapi
- [ ] 4  Tool-line restyle DI telegram.js (toolLabel/summarizeToolResult/render), flow/depth utuh

---

## FASE 1 — Management cycle ✅
- `views/cycle.js` (BARU): `buildMgmtReport(positions, actionMap, cfg)` + `frameMgmtResult(content)`. Pure, plain-text, unit ikut solMode (fmtMoney). actionSummary dihitung di dalam helper.
- index.js: hapus `totalValue/totalUnclaimed/reportLines/needsAction/actionSummary` (562-586) → `mgmtReport = buildMgmtReport(positionData, actionMap, config)`; `cur` (584) DIPERTAHANKAN (dipakai blok prompt LLM :603). LLM result (:627) `mgmtReport += frameMgmtResult(content)`. No-pos #1/#2 dirapikan inline.
- Nol ubah: orkestrasi runManagementCycle, finalize, executeTool, note() #6.
