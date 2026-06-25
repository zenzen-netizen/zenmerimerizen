# BATCH F RECON — cycle messages · confirm-gate · live tool-line (READ-ONLY)

**Bot:** MAIN (`pm2 id 0` = meridian, `/home/ubuntu/meridianzen`, branch `experimental`).
**Sifat:** READ-ONLY. Nol ubah kode, nol restart. Semua klaim ada bukti `file:line`.
**Scope:** ① Screening cycle (`runScreeningCycle` index.js:669-1177) · ③ Management cycle (`runManagementCycle` :453-667) · ⑫ Konfirmasi (`requestConfirmation`/`requestActionConfirmation`) · ⑬ Live tool-line (`createLiveMessage` telegram.js:332).

> **TL;DR verdict:** Redesign display **AMAN** untuk: judul/intro/status-note/funnel/skip-block/confirm-prompt (semua **TEKS-TETAP** deterministik JS). **JANGAN sentuh:** mekanisme `createLiveMessage` (streaming edit + `_liveMessageDepth` yang nge-gate notif) dan **logika gate** (`_pendingConfirmation` slot + agent.js:450-457). Format tool-line **bukan** di index.js — ada di **telegram.js** (`toolLabel`+`summarizeToolResult`), display-only, tak ada parser eksternal yg baca balik → aman direstyle DI telegram.js. Report LLM (`stripThink(screen/mgmtReport)` bagian `content`) = **teks-bebas**, cuma bisa dibingkai header, tak bisa di-template.

---

## A. Mekanisme live tool-line (⑬) — `createLiveMessage`

### A1. Definisi & return — `telegram.js:332`
`createLiveMessage(title, intro="Starting...")`:
- **Return** handle `{ toolStart, toolFinish, note, finalize, fail }` **atau `null`** kalau `!TOKEN || !chatId` (:333). Semua call-site pakai optional-chaining `liveMessage?.x()` → aman null.
- **State internal** (:336-345): `{ title, intro, toolLines[], footer, messageId, flushTimer, flushPromise, flushRequested }`.
- **`render()`** (:347-353): `[title, intro, toolLines.join("\n"), footer].filter→join("\n\n").slice(0,4096)`. Empat seksi, dipisah baris-kosong, dipotong 4096 (batas Telegram 1 pesan).
- **`_liveMessageDepth += 1`** saat create (:407), **−1** saat finalize/fail (:433/447). Dipakai `hasActiveLiveMessage()` (:250) → semua `notify*` (deploy/OOR/swap/close, :581-609) **di-skip selama live message aktif** (biar notif nggak numpuk di atas pesan streaming). **INI KENAPA RAWAN:** kalau finalize/fail nggak kepanggil, depth bocor → notif mati permanen + typing-indicator loop 4s bocor → 429 storm (komentar :650-652).

### A2. Update tiap tool-line — throttled edit
- **`scheduleFlush(delay=300)`** (:367-375): debounce 300ms. Kalau `flushTimer` udah ada → set `flushRequested=true` & return (nggak nambah timer). Else pasang `setTimeout(flushNow, 300)`.
- **`flushNow()`** (:355-365): `render()` → kalau belum ada `messageId` → `sendMessage` (pesan baru, simpan id); else `editMessage(text, messageId)` (edit in-place). **Ini titik streaming** — tiap tool event nge-edit pesan yg sama.
- **`upsertToolLine(name, icon, suffix)`** (:398-405): `label=toolLabel(name)`; cari baris existing via `entry.includes(\` ${label}\`)` → **update in-place** kalau ada (start→finish jadi 1 baris), else **push** baris baru. Lalu `scheduleFlush()`.
- **`toolStart(name)`** (:411) → `upsertToolLine(name,"ℹ️","...")` → baris `ℹ️ <label> ...`.
- **`toolFinish(name,result,success)`** (:414) → icon `✅/❌` + `summary=summarizeToolResult(name,result)` → baris `✅ <label> — <summary>`.
- **`note(text)`** (:419) → `state.intro = text` + scheduleFlush (ganti teks intro, mis. "No tool actions needed.").

### A3. Format tool-line — **SEMUA di telegram.js, bukan index.js**
- **`toolLabel(name)`** (:281-303): map nama-tool → label manusia (`get_token_info`→"get token info", dll). Fallback `name.replace(/_/g," ")`.
- **`summarizeToolResult(name,result)`** (:305-330): ringkasan per-tool (deploy→"position abc123...", close→"closed"/reason, update_config→applied keys, get_top_candidates→"N candidates", dll). Default→"done"/"failed".
- **index.js cuma kirim RAW** `(name, result, success)` (mgmt :623-624, screening :1116-1126, chat :3385-3386). **Nol format di index.js.** ⇒ Restyle tampilan tool-line = edit **telegram.js** saja. **Tak ada parser** yg baca balik `toolLines` (internal `.includes` match doang, :401) → bebas direstyle.

### A4. Finalize / fail
- **`finalize(finalText)`** (:423-436): clear flushTimer, tunggu flushPromise, `footer=finalText`, **`flushFinal()`** (:381-396 — `splitText` pecah ke MULTI pesan: chunk[0] edit in-place, sisanya `sendMessage` lanjutan; biar report panjang nggak kepotong 4096), lalu `_liveMessageDepth−1` + `typing.stop()`. **finalText = report cycle** (`stripThink(screen/mgmtReport)`).
- **`fail(errorText)`** (:437-450): `footer="❌ "+err`, `flushNow()` (single msg, slice 4096), depth−1, typing.stop. Dipakai chat path (:3393), BUKAN cycle (cycle pakai finalize utk semua jalur, incl error & "(cycle ended without report)").

### A5. Konfirmasi titik wiring
| Cycle | create | finalize sukses | finalize fallback |
|---|---|---|---|
| Management | :465 `("🔄 Management Cycle","Evaluating positions...")` | :647 `finalize(stripThink(mgmtReport))` | :653 `finalize("(cycle ended without report)")` |
| Screening | :760 `("🔍 Screening Cycle","Scanning candidates...")` | :1167 `finalize(stripThink(screenReport))` | :1171 `finalize("(cycle ended without report)")` |
| Chat (bukan scope) | :3382 `("🤖 Live Update", "Request: …")` | :3390 `finalize(stripThink(content))` | :3393 `fail(e.message)` |

Catatan: kalau `liveMessage` null (telegram off / silent) → fallback `sendMessage("🔄/🔍 …\n\n"+stripThink(report))` (mgmt :648, screening :1168).

---

## B. Screening cycle (①) — TEKS-TETAP vs OUTPUT-LLM

Semua keluaran user lewat satu var `screenReport` → `finalize(stripThink(screenReport))`. Judul/intro = fixed (A5). Klasifikasi tiap assignment:

| # | `file:line` | Isi | Jenis |
|---|---|---|---|
| 1 | :685 | `Screening skipped — max positions reached (n/m).` | **TEKS-TETAP** (template JS) |
| 2 | :712 | `Screening skipped — modal kurang (wallet … < ~… untuk 1 posisi…).` | **TEKS-TETAP** |
| 3 | :736 | `🧪 Screening skipped — market <risk-off…> (experimental gate).` | **TEKS-TETAP** |
| 4 | :755 | `Screening pre-check failed: <err>` | **TEKS-TETAP** |
| 5 | :785 | `Screening failed: <err>` | **TEKS-TETAP** |
| 6 | :857-861 | `No candidates available` (+ 3 varian: `funnelBlock` / `Filtered examples:\n- name: reason` / `(all filtered)\n<thresholds>`) | **TEKS-TETAP** (funnel & examples & thresholds semua JS deterministik) |
| 7 | :882-896 | Blok `⛔ NO DEPLOY` single-candidate (BEST/WHY SKIPPED/REJECTED + funnel) | **TEKS-TETAP** (array JS join; `skipReason`=`getLoneCandidateSkipReason` pure :1564) |
| 8 | :1044→:1131-1144 | **Report LLM utama** (`content`→`reportContent`→`screenReport`): narasi `🚀 DEPLOYED` / `⛔ NO DEPLOY` | **OUTPUT-LLM** (teks-bebas) ⚠️ |
| 8b | :1132-1142 | Override anti-halu (model nge-draft DEPLOYED tanpa deploy / tool-dump) → diganti string skip fixed | **TEKS-TETAP** (cuma saat override) |
| 9 | :1143-1144 | `funnelAppend` di-append ke report LLM (`\n─────────────\n<funnel>`) | **TEKS-TETAP** (buildGmgnFunnelReport :1546 pure) |
| 10 | :1162 | `Screening cycle failed: <err>` | **TEKS-TETAP** |
| 11 | :1171 | `(cycle ended without report)` | **TEKS-TETAP** |

**Catatan #8 (penting):** "format" `🚀 DEPLOYED`/`⛔ NO DEPLOY` (header MARKET/AUDIT/WHY THIS WON) **didefinisikan DI PROMPT** (:1063-1108) sbg instruksi ke LLM — **bukan template JS**. Jadi teks akhirnya milik model (bisa melenceng). **Tak bisa di-tree** secara andal tanpa mem-parse output model (rapuh, ke-couple). Sikap aman: biarkan teks-bebas, cuma dibingkai header live-message (yg udah ada: "🔍 Screening Cycle").

**Catatan:** `candidateBlocks` (:928-1038) = **INPUT prompt** ke LLM (bukan output ke user) → bukan target redesign display.

---

## C. Management cycle (③) — TEKS-TETAP vs OUTPUT-LLM

Satu var `mgmtReport` → `finalize(stripThink(mgmtReport))`. Judul/intro fixed (A5).

| # | `file:line` | Isi | Jenis |
|---|---|---|---|
| 1 | :486 | `No open positions. Idle screening on cooldown.` | **TEKS-TETAP** |
| 2 | :490 | `No open positions. Triggering screening cycle.` | **TEKS-TETAP** |
| 3 | :565-577 | `reportLines` per-posisi: `**pair** \| Age \| Val \| Unclaimed \| PnL \| Yield \| 🟢IN/🔴OOR \| status` (+Note/⚡Trailing/Rule/Claiming) | **TEKS-TETAP** (JS deterministik; unit `◎/$` via `solMode` :568-569) |
| 4 | :584-586 | `Summary: 💼 n positions \| <cur>val \| fees: <cur>x \| <actionSummary>` | **TEKS-TETAP** |
| 5 | :627 | `mgmtReport += "\n\n"+content` (hasil LLM, cuma kalau ada aksi) | **OUTPUT-LLM** (teks-bebas) ⚠️ |
| 6 | :630 | `note("No tool actions needed.")` (ganti intro, kalau semua STAY) | **TEKS-TETAP** |
| 7 | :642 | `Management cycle failed: <err>` | **TEKS-TETAP** |
| 8 | :653 | `(cycle ended without report)` | **TEKS-TETAP** |

**Catatan #5:** prompt LLM (:609-621) minta "brief one-line result per position" → teks-bebas model, ditempel di bawah scaffolding JS. Tak bisa di-template. `reportLines` (#3) + Summary (#4) = scaffolding JS yg **bisa di-tree** (header + tree per posisi), unit ikut `solMode` (samain dgn views/format.js `fmtCur`/fmtBoth — jangan hardcode `$`).

---

## D. Confirm-gate (⑫)

### D1. Dua jalur, satu slot
- **`requestConfirmation(toolName,args)`** (:2150) = entry `onConfirmRequired`. Kalau `toolName !== "update_config"` → delegasi ke **`requestActionConfirmation`** (:2118, trade). Kalau update_config → jalur diff-config (:2156-2236).
- Keduanya pakai **satu slot global `_pendingConfirmation`** (:1611) `{promise, resolve, timer, messageId, signature}`, single-flight (duplikat identik nempel ke promise sama; aksi beda saat ada pending → `false`, :2124-2126/:2209-2211), **timeout 30s** (:2133/:2218).

### D2. Display (prompt) — PISAH dari logika
- **Trade prompt:** `summarizeTradeAction(toolName,args)` (:2094-2112, **pure/defensive, never throws**): deploy→`🚀 BUKA POSISI`, close→`🔻 TUTUP POSISI`, claim→`💰 CLAIM FEES`, swap→`🔁 SWAP TOKEN`, else→JSON slice. Dikirim `⚠️ Konfirmasi aksi ini?\n<summary>` (:2139).
- **Config prompt:** inline `lines` (:2224-2227) `  key: current → val`, dikirim `⚠️ Update config?\n…` (:2228).
- **Tombol (fixed):** `confirm:yes` / `confirm:no` (:2141-2142, :2230-2231).
- **Edit pasca-aksi (fixed):** handler `✅ Confirmed — updating...` / `❌ Cancelled — no changes made.` (:2954); timeout `⏰ Expired…` (:2135/:2220).

### D3. Logika gate (JANGAN sentuh)
- **Slot/promise/timeout/signature** (index.js requestActionConfirmation/requestConfirmation) — orkestrasi stateful.
- **Keputusan** di **agent.js:450-457**: `if (interactive && onConfirmRequired && CHAT_CONFIRM_TOOLS.has(name))` → `confirmed = await onConfirmRequired(...)`; `if (!confirmed)` → return `{success:false, cancelled:true}` (tool **TIDAK** dieksekusi); else lanjut `executeTool`.
- **Handler callback** index.js:2945-2960: baca slot, `resolve(action==="yes")`, edit pesan.

### D4. Aksi yg lewat gate
`CHAT_CONFIRM_TOOLS` (agent.js:21) = **`update_config, deploy_position, close_position, claim_fees, swap_token`** (5 tool). Gate **HANYA** nyala di **jalur chat interaktif Telegram** (`onConfirmRequired: requestConfirmation` :3387). **TIDAK** di: siklus otonom screening/management (agentLoop tanpa onConfirmRequired) + CLI REPL (:3740-3741, sengaja — operator lokal). ⇒ deploy/close/claim/swap **otonom = tak ke-gate** (by design). Lihat [[project-casual-trade-confirm-gate]].

### D5. Verdict gate: **display BISA dirapikan tanpa nyentuh logika** ✅
`summarizeTradeAction` udah pure (gampang pindah ke `views/`); string prompt + edit-message = teks display murni; `signature` pakai `JSON.stringify(args)` (independen dari teks tampilan). Slot/timeout/promise/agent.js-check **tak bergantung** ke teks → restyle aman, **persis pola /settings** (display ⟂ mutasi).

---

## E. VERDICT — peta aman redesign + estimasi ekstrak

### E1. TEKS-TETAP (aman di-tree-style)
- **Screening:** semua skip/failed (#1-5,10,11), `No candidates available` (#6), blok `⛔ NO DEPLOY` single-cand (#7), funnel (`buildGmgnFunnelReport` :1546 pure), override anti-halu (#8b).
- **Management:** no-position msgs (#1,2), `reportLines` per-posisi (#3) + Summary (#4), `note` (#6), failed/empty (#7,8).
- **Confirm:** semua prompt (`summarizeTradeAction` + config lines) + edit confirmed/cancelled/expired.
- **Live frame:** judul "🔍/🔄", intro "Scanning…/Evaluating…", "(cycle ended without report)".

### E2. OUTPUT-LLM (teks-bebas — cuma dibingkai header, JANGAN di-template)
- Screening report `content` (#8, narasi 🚀/⛔ dari prompt :1063-1108).
- Management `content` (#5, "one-line result per position").
- ⇒ Redesign = bingkai header tree saja; isi biarkan apa adanya (model-owned). `stripThink` tetap dipertahankan (buang `<think>`).

### E3. `createLiveMessage` & finalize — bisa redesign display tanpa nyentuh mekanisme?
- **Format tool-line** (`toolLabel`/`summarizeToolResult`/`upsertToolLine`/`render`) = **di telegram.js, display-only, nol parser eksternal** → **AMAN** direstyle (mis. tree/ikon) **DI telegram.js**.
- **RAWAN (jangan utak-atik alurnya):** `_liveMessageDepth` ↑↓ (gate notif) — tiap jalur create **WAJIB** ketemu finalize/fail tepat sekali (leak = notif mati + 429). `scheduleFlush` 300ms debounce + `flushFinal` split-multi-message — logika streaming, jangan diubah. ⇒ Boleh ganti STRING/format yg di-render; **jangan** ubah kapan flush/finalize dipanggil atau depth di-update.

### E4. Estimasi jejak `index.js` + peluang ekstrak `views/`
- **Pure & gampang pindah ke `views/`:** `summarizeTradeAction` (:2094), `buildGmgnFunnelReport` (:1546), `getLoneCandidateSkipReason` (:1564). Builder report cycle (`reportLines`/Summary screening+mgmt) = pure atas data posisi → bisa diekstrak `views/cycle.js` (`buildMgmtReport(positionData, actionMap, cfg)` + `buildScreenSkip…`). **Tool-line format** → `views/`-style helper TAPI dipanggil DARI telegram.js (atau biarkan di telegram.js; sejajar pola notifs).
- **Tetap di index.js (stateful/glue):** `runScreeningCycle`/`runManagementCycle` (orkestrasi), `requestConfirmation`/`requestActionConfirmation` (slot), handler `confirm:` (:2945).
- **Tetap di telegram.js:** `createLiveMessage` (mekanisme streaming + depth).

### E5. Bagian yg **TIDAK aman** / usul batasi scope
- **Format report LLM (#8 screening / #5 mgmt):** JANGAN coba di-template/parse — ke-couple ke output model + ke 2 guard anti-halu (regex `🚀 DEPLOYED`/`⛔ NO DEPLOY` :1132/1139/1145). Kalau ubah teks "⛔ NO DEPLOY" jadi gaya lain, **cek dulu** regex guard itu (mereka match string literal). **Usul:** biarkan vocab `🚀 DEPLOYED`/`⛔ NO DEPLOY` apa adanya (header), cuma rapikan SCAFFOLDING tetap di sekitarnya.
- **Tool-line streaming + depth:** redesign STRING ya, ubah ALUR jangan.
- **Gate logic:** display ya, slot/timeout/agent.js-check jangan.

> **Rekomendasi build Batch F:** scope = (a) tree-style scaffolding TEKS-TETAP (skip/funnel/no-deploy-block/reportLines/Summary/confirm-prompt) lewat helper pure (ekstrak ke `views/cycle.js`), (b) restyle tool-line DI telegram.js, (c) bingkai header report LLM tanpa sentuh isinya. NOL ubah: `createLiveMessage` flow + `_liveMessageDepth`, slot konfirmasi + agent.js:450-457, regex guard anti-halu (atau update barengan kalau vocab digeser). Unit `◎/$` ikut `solMode` (pakai views/format.js, jangan hardcode `$`).

---

## Lampiran — peta file:line cepat
- Live: `createLiveMessage` telegram.js:332 · render :347 · flushNow :355 · scheduleFlush :367 · flushFinal :381 · upsertToolLine :398 · toolStart/Finish/note/finalize/fail :411-450 · `toolLabel` :281 · `summarizeToolResult` :305 · `_liveMessageDepth`/`hasActiveLiveMessage` :21/:250.
- Screening: `runScreeningCycle` :669 · guards :683-758 · live create :760 · candidate blocks (prompt input) :928-1038 · agentLoop :1044 · anti-halu :1132-1142 · funnelAppend :1143 · finalize :1167.
- Management: `runManagementCycle` :453 · live create :465 · no-pos :486-492 · reportLines :565 · Summary :585 · LLM :609-627 · note :630 · finalize :647.
- Confirm: `summarizeTradeAction` :2094 · `requestActionConfirmation` :2118 · `requestConfirmation` :2150 · slot `_pendingConfirmation` :1611 · handler :2945 · gate decision agent.js:450 · `CHAT_CONFIRM_TOOLS` agent.js:21 · wiring `onConfirmRequired` index.js:3387.
- Pure helpers: `buildGmgnFunnelReport` :1546 · `getLoneCandidateSkipReason` :1564 · `stripThink` :132.
