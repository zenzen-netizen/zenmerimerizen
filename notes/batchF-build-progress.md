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
- [x] 2  Screening cycle: skip/no-candidates/no-deploy/funnel → tree (views/cycle.js), vocab 🚀/⛔ utuh
- [x] 3  Confirm-prompt: summarizeTradeAction + config-diff + edit confirmed/cancelled/expired → rapi
- [x] 4  Tool-line restyle DI telegram.js (toolLabel/summarizeToolResult/render), flow/depth utuh

---

## FASE 1 — Management cycle ✅
- `views/cycle.js` (BARU): `buildMgmtReport(positions, actionMap, cfg)` + `frameMgmtResult(content)`. Pure, plain-text, unit ikut solMode (fmtMoney). actionSummary dihitung di dalam helper.
- index.js: hapus `totalValue/totalUnclaimed/reportLines/needsAction/actionSummary` (562-586) → `mgmtReport = buildMgmtReport(positionData, actionMap, config)`; `cur` (584) DIPERTAHANKAN (dipakai blok prompt LLM :603). LLM result (:627) `mgmtReport += frameMgmtResult(content)`. No-pos #1/#2 dirapikan inline.
- Nol ubah: orkestrasi runManagementCycle, finalize, executeTool, note() #6.

## FASE 2 — Screening cycle ✅
- `views/cycle.js`: `cycleSkip`/`cycleFail` (footer 1-baris ⏭/⚠️), `buildNoCandidates({funnel,examples,thresholds})` (prioritas funnel>examples>thresholds, mirror lama), `buildLoneNoDeploy({candidateName,skipReason,funnel})` (vocab `⛔ NO DEPLOY` LITERAL).
- `views/format.js`: ICON additive `skip:⏭, pending:⏳, ok:✅, fail:❌` (pending/ok/fail utk FASE 4).
- index.js: #1/#2 → cycleSkip, #4/#5/#10 → cycleFail, #6 → buildNoCandidates (thresholds jadi array; `combinedExamples` DIPERTAHANKAN utk appendDecision:854), #7 → buildLoneNoDeploy. #3 (🧪 market regime) sengaja DIBIARKAN (sudah punya marker eksperimen, hindari double-emoji). #11 "(cycle ended without report)" tetap.
- Bukti guard anti-halu: regex `/🚀\s*DEPLOYED/i` (:1106) + `/⛔\s*NO DEPLOY/i` (:1113,:1119) + prompt vocab (:1037,:1071) + override (:1108,:1115) SEMUA utuh (grep). buildLoneNoDeploy output literal `⛔ NO DEPLOY`.
- Nol ubah: agentLoop, anti-halu override (#8b), funnelAppend (#9), report-LLM content.

## FASE 3 — Confirm-prompt ✅
- `views/cycle.js`: `summarizeTradeAction(toolName,args)` PINDAH dari index.js (pure/defensive, sub-baris jadi tree, header vocab 🚀/🔻/💰/🔁 utuh), `buildConfigDiff(entries)` (tree "key: current → val"), const `CONFIRM_OK/CONFIRM_NO/CONFIRM_EXPIRED` (netral utk trade & config; 2 string expired digabung jadi 1).
- index.js: hapus def lokal summarizeTradeAction (import dari cycle.js); call-site requestActionConfirmation tetap. Timeout trade (:2109) + config (:2194) → CONFIRM_EXPIRED; config prompt lines → buildConfigDiff; handler (:2928) confirmed/cancelled → CONFIRM_OK/CONFIRM_NO. Wrapper `⚠️ Konfirmasi aksi ini?` & `⚠️ Update config?` tetap.
- Nol ubah gate (garis merah #2): slot `_pendingConfirmation`, signature `JSON.stringify(args)`, timeout 30s, tombol confirm:yes/no, handler resolve, agent.js:450-457, CHAT_CONFIRM_TOOLS. Cuma teks.

## FASE 4 — Tool-line restyle (DI telegram.js) ✅
- telegram.js: `import { ICON } from "./views/format.js"` (format.js MURNI/nol-import → aman, sejajar import notifs.js yg sudah ada). Glyph stream: toolStart `ℹ️ …`→`⏳ …` (ICON.pending), toolFinish `✅/❌`→ICON.ok/ICON.fail. summarizeToolResult +2 case (check_smart_wallets_on_pool→"N smart wallets" via `in_pool.length`; get_active_bin→"bin X" via `binId` — dua-duanya bentuk hasil DIVERIFIKASI di src).
- toolLabel DIBIARKAN: sudah label manusiawi + fallback `name.replace(/_/g," ")` rapi; nambah entri = redundan.
- Bukti garis merah #1 (mekanisme live UTUH): diff telegram.js HANYA import + 2 summary case + 2 glyph (git diff). `_liveMessageDepth` ↑↓ (:408/434/448), scheduleFlush/flushNow/flushFinal/finalize/fail, upsertToolLine match `entry.includes(\` ${label}\`)` TAK tersentuh. Uji: start→finish update baris SAMA (2 tool → 2 baris, bukan 4). Format `${icon} ${label}${suffix}` struktur tetap → match valid.
