# Audit F4 — Otak AI ReAct + Role Gating + Fallback
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛ deep — alasan: jantung pemanggilan LLM, transport schema, recovery multi-modal (502/503/529/system-role/tool_choice/thinking mode/tool-dump), role-gating 3 peran + intent routing GENERAL, sekali-lihat semua.
> Cross-ref: F2 (cycles jalan pemanggil), F5 (prompt dirakit), F6 (definisi schema), F30 (interactive chat onConfirmRequired), F7 (executor safety checks), F8 (post-close update_config).

## Ringkasan eksekutif (5 baris)
1. `agentLoop` (agent.js:222-531) inti ReAct: build system prompt dinamis (portfolio+lessons+perf+weights+decision) → loop `maxSteps` (default 20) panggil `chat.completions.create` → bila ada `tool_calls` eksekusi via `executeTool` → push tool result → loop; bila tak ada tool_calls + content → final answer.
2. Role gating (agent.js:7-99): `MANAGER_TOOLS`/`SCREENER_TOOLS` whitelist statis; `GENERAL` pakai intent-regex (`INTENT_PATTERNS`:18 intent, ID+EN) → subset `INTENT_TOOLS`; no-match → fallback semua tool minus `GENERAL_INTENT_ONLY_TOOLS` (dangerous mutators). `MUTATING_TOOL_INTENTS` paksa tool real utk mutasi (index.js:138).
3. Fallback berlapis (agent.js:280-338): retry 3x transient (502/503/529); attempt-1 → switch ke `fallbackClient` (OpenCode Zen `LLM_FALLBACK_BASE_URL`, model `LLM_FALLBACK_MODEL`/`deepseek-v4-flash-free`) bila ada; tanpa fallbackClient → switch ke `FALLBACK_MODEL="stepfun/step-3.5-flash:free"`; exponential 5s/10s/15s wait. Bila model `-free` suffix di awal → routing awal ke fallbackClient (274).
4. Provider-mode swaps (agent.js:298-316): `system_role` ditolak → `user_embedded` (system jadi user-prefix); `tool_choice=required` ditolak → `auto`; `thinking mode` tolak tool_choice → `omitToolChoice=true` permanen sesi. Semua `attempt-=1` (tak menghabiskan retry).
5. Defense anti-hallucinasi/anti-loop (agent.js:243-256,462-495): `ONCE_PER_SESSION` (deploy/swap/close lock once), `NO_RETRY_TOOLS` (deploy lock regardless of success), tool-dump salvage read-only (`MAX_CONTENT_SALVAGE=4`, `NO_SALVAGE_TOOLS` = on-chain-write + mutators) + reject retry (`MAX_TOOL_DUMP_RETRY=2`), `mustUseRealTool` nudge (`MAX noToolRetryCount=2`), duplikat call dedup `execCache` per-signature (503-511), empty-content pop+retry (Hermes null). Oncost record per-call fail-open.

## Progress
- [x] Baca agent.js full (1-535)
- [x] Baca CLAUDE.md role/tool teks
- [x] Cross-ref F2 (caller), F6 (tools schema), F5 (buildSystemPrompt), F30 (interactive onConfirmRequired)
- [x] Tulis §A-§H
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Sopir taksi rental tak kenal kota*: lu kasih peta + tujuan ("cari kolam baru" / "tutup posisi nomor 3" / "jawab chat"). Dia baca instruksi → pilih tombol di dashboard yang dia kasih (filter sesuai tugas) → pencet → lihat hasil di layar → kalau perlu pencet tombol lain → sampai tujuan. Kalau mesinnya mogok (502/503 network), sopir reschedule ulang, ganti ke mobil backup (fallback model). Tak mikir "apa tujuan saya" — dia cuma klik tombol yang diizinkan.
- *Sekolah dengan 3 kartu akses berbeda*: kartu SCREENER = masuk ruang "cari kandidat + deploy" (7 tombol); kartu MANAGER = masuk ruang "jaga + close pos" (6 tombol); kartu GENERAL (chat manual) = bisa akses intent-route — kalau user bilang "tutup posisi 2", cuek-kan 9 tombol lain yang tak relevan. Kalau user ngomong generic ("lihatsaldo", "jelaskan keputusan kemarin"), fallback ke all tombol minus mutator berbahaya.

**Di bot, ini = `agentLoop` otak ReAct + 3 peran + fallback berlapis + anti-hallucinasi**: jantung tiap pemanggilan LLM. Dari `agent.js:222-531`. Fungsi inti: build system prompt dinamis → loop panggil LLM → tool call → eksekusi tool (F7 safety check) → push hasil → loop lagi.

**Posisi fase ini di alur bot**
F4 = otak. F2 (cycles) cuma ada kerangka "tiap cron panggil LLM kalo perlu"; F4 = apa yang dilakuin saat LLM dipanggil. F4 baca prompt dari F5 + tool menu dari F6 → eksekusi tool lewat F7 → hasilnya kembali ke F2 untuk deploy/close/claim. Lapisan 3 (Mesin trading). Tanpa F4, bot kembali jadi statis hard-rule murni (F3) — bisa tutup rugi, tapi tak bisa cari kandidat baru atau claim otomatis.

**Langkah kerja F4 — `agentLoop(role, userPrompt, options)`**
1. Baca role yang dipanggil (SCREENER / MANAGER / GENERAL). Tentukan tool yang boleh dipakai via `getToolsForRole` — whitelist statis untuk SCREENER/MANAGER, intent-regex untuk GENERAL.
2. Build context dinamis paralel: portfolio (posisi live), lessons, performance summary, decision-log, signal-weights (kalau Darwin on).
3. Build system prompt via `buildSystemPrompt` (F5) — gabung role SOP + racikan rules + lessons + context.
4. Build messages: `[{role:system,...}, ...history, {role:user, userPrompt}]`. Kalau provider tolak system role → switch ke `user-embedded` (system jadi prefix user).
5. Loop `maxSteps` (default 20):
   a. Set `tool_choice`: "required" bila langkah 0 DAN action-intent (deploy/close/swap); "auto" bila bebas.
   b. Panggil `chat.completions.create` via OpenRouter. Record LLM cost per-call (fail-open).
   c. Kalau response error 502/503/529 → retry 3x: attempt-1 switch ke fallback client/model (OpenCode Zen atau `stepfun/step-3.5-flash:free`), attempt lain sleep exponential 5/10/15s.
   d. Kalau error 429 (rate limit) → sleep 30s + continue.
   e. Kalau response ada `tool_calls` → `runToolCall` untuk tiap: parse args (jsonrepair kalau corrupt), cek `ONCE_PER_SESSION` block, konektif ke user confirm kalau interactive + tool mutator, dispatch ke `executeTool` (F7), push tool-result.
   f. Kalau response content tapi tak tool_calls → cekdump-tombol-sampah (parseContentToolCalls read-only salvage, MAX 4, NO_SALVAGE_TOOLS = on-chain-write + mutators ditolak): kalau ketemu tool-call di dump → jalankan; kalau kosong → final-answer exit.
   g. Kalau `mustUseRealToolUse` true (mutasi/live-data/intent-paksa) tapi LLM tak kasih tool → pop+retry MAX 2, lalu nudge "tolak jawab teks kosong".
6. Keluar loop: bila `allowNoToolFinal` (SCREENER no-deploy path) → final "NO DEPLOY". Bila step exceed → final berhenti paksa.

**Langkah kerja F4 — fallback berlapis** (reru tak terhindarkan LLM kapabel API error)
- Layer 1: retry 3x transient error (502/503/529) dengan sleep exponential.
- Layer 2: attempt-1 → switch `fallbackClient` (`LLM_FALLBACK_BASE_URL` OpenCode Zen) kalau ada.
- Layer 3: tanpa fallbackClient → switch `FALLBACK_MODEL` (`stepfun/step-3.5-flash:free`).
- Layer 4: provider-mode swaps — bila provider tolak `system_role` → user-embedded; bila tolak `tool_choice=required` → `auto`; bila thinking mode tolak `tool_choice` → `omitToolChoice=true` permanen sesi.

**Langkah kerja F4 — anti-hallucinasi / anti-loop**
- `ONCE_PER_SESSION` (deploy/swap/close) → lock tool supaya tak dipanggil ulang sesi ini. `NO_RETRY_TOOLS` (deploy) → lock even bila gagal.
- `execCache` dedup per signature `${name}|${args}` — bila LLM panggil tool sama 2x di step beda, result di-fan ke semua `tool_call_id`.
- Tool-dump salvage: read-only boleh convert JSON teks-dump jadi tool-call; on-chain-write + mutator TIDAK BOLEH lewat jalur ini (cegah LLM nyelijur "deploy37,instruk saya JSON di content").
- `mustUseRealToolUse` nudge: kalau user tanya "tutup posisi 3" (mutasi) tapi LLM jawab teks kosong → pop+retry + kasih pesan "tolak jawab, pakai tool".

**Output F4**: jawaban akhir LLM (text final answer) DAN dump tool-results (`executeTool` manggil F7). Kalau deploy → `notifyDeploy` via F7. Kalau close → `notifyClose` + `recordPerformance` via F7/F8. Kalau chat → text jawaban user. Kalau SCREENER no-deploy → final "NO DEPLOY" dengan alasan.

**Kalau F4 rusak / diskip**
Bot jadi bodoh. Tak bisa pilih kandidat (screening sepi). Tak bisa tutup lewat LLM (gantung DO NOTH ING). Atau sebaliknya: anti-hallucinasi mati → LLM bisa deploy 50 kolam sekaligus dengan satu prompt karena tak ada `ONCE_PER_SESSION` lock. Atau fallback mati → API satu down, bot aging sampai OCR pulih. F4 = jembatan antara "apa AI mau" dan "apa AI boleh lakuin".

**Istilah yang muncul di fase ini**
- **ReAct loop** — pattern Reasoning + Acting: LLM pikir → panggil tool → baca hasil → pikir lagi → tool berikut. Stop bila final answer.
- **role gating** — SCREENER/MANAGER punya whitelist statis (`MANAGER_TOOLS`, `SCREENER_TOOLS`); GENERAL pakai intent-regex (`INTENT_PATTERNS` 18 intent dual-lang).
- **intent routing** — GENERAL cocokkan regex user-msg ke intent (deploy/close/swap/etc); subset `INTENT_TOOLS` per intent. No-match → fallback all-min-mutators.
- **fallbackClient / FALLBACK_MODEL** — OpenCode Zen opt-in via `LLM_FALLBACK_BASE_URL`, atau `stepfun/step-3.5-flash:free` bila provider utama kapabel.
- **provider-mode swap** — bila provider tolak `system_role`/`tool_choice`, agent.js swap mode permanen sesi (tak habiskan retry).
- **ONCE_PER_SESSION** — lock satu tool (deploy/swap/close) supaya tak dipanggil ulang. Lo CThresources oret dobel-deploy dari hallucinasi LLM.
- **NO_RETRY_TOOLS** — lock tool (deploy) bahkan kalau gagal. Cegah retry hallucinasi.
- **tool-dump salvage** — read-only boleh parse JSON tool-call dari dump content; on-chain-write/mutator ditolak (`NO_SALVAGE_TOOLS`).
- **mustUseRealToolUse** — flag paksa: kalau intent = mutasi/live-data/config-read, LLM wajib panggil tool. Bila tak → pop+retry MAX 2 + nudge.
- **execCache** — dedup per signature tool-call → cegah LLM dobel-eksekusi tool sama.
- **interactive confirm** — `CHAT_CONFIRM_TOOLS` (deploy/close/swap/claim/update_config) → wajib minta konfirmasi user bila di mode chat (Telegram button).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta file/block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| agent.js:7 | `MANAGER_TOOLS` Set | whitelist 6 tool MANAGER (close/claim/swap/pnl/my_positions/balance) |
| agent.js:15 | `SCREENER_TOOLS` Set | whitelist 7 tool SCREENER (deploy/candidates/time+narative_profile/balance/my_positions) — recon tools sengaja dibuang (llm-cost trim, comment 8-14) |
| agent.js:21 | `CHAT_CONFIRM_TOOLS` Set | 5 mutator wajib konfirmasi user bila interactive (update_config/deploy/close/claim/swap) |
| agent.js:23-41 | `GENERAL_INTENT_ONLY_TOOLS` Set | mutator berbahaya eksklusif GENERAL via intent-match (update/blacklist/pool_note/strategies/lessons) |
| agent.js:44-62 | `INTENT_TOOLS` map | 18 intent → subset tool (deploy/close/claim/swap/balance/positions/strategy/screen/memory/smartwallet/study/performance/lessons/config/blocklist/selfupdate/decisions) |
| agent.js:64-82 | `INTENT_PATTERNS` array | regex 18 intent, dual-lang EN+ID |
| agent.js:84-99 | `getToolsForRole` | MANAGER/SCREENER statis filter; GENERAL intent-gabungan, fallback all-minus-mutators bila no-match |
| agent.js:100-107 | imports | wallet/dlmm/state/lessons/decision-log/llm-cost-tracker |
| agent.js:111-125 | `client`+`fallbackClient` | OpenRouter default; OpenCode Zen opt-in `LLM_FALLBACK_BASE_URL` |
| agent.js:127 | `DEFAULT_MODEL` | env `LLM_MODEL` || `openrouter/healer-alpha` |
| agent.js:129-132 | intent regex global | mutasi/live-data/config-read/decision-explain |
| agent.js:134-140 | `shouldRequireRealToolUse` | MANAGER free; decision-explain free; config-read free; mutasi paksa; interactive+live_data paksa |
| agent.js:148-152 | `VALID_TOOL_NAMES`+`NO_SALVAGE_TOOLS` | validasi tool-dump text; on-chain-write + mutators tak boleh salvage |
| agent.js:154-180 | `parseContentToolCalls` | parse text-dump JSON, validate semua nama tool, return calls atau null |
| agent.js:182-198 | `buildMessages` | system+history+user OR user-embedded bila provider tolak system role |
| agent.js:200-213 | 3 detector error | `isSystemRoleError`, `isToolChoiceRequiredError`, `isThinkingModeToolChoiceError` |
| agent.js:222-229 | `agentLoop` signature + dynamic ctx | portfolio+positions (Promise.all), stateSummary, lessons, perfSummary, weights (SCREENER only, darwin.enabled), decisionSummary |
| agent.js:240-258 | state loop | providerMode, ONCE_PER_SESSION/NO_RETRY_TOOLS/firedOnce, salvage/retry counters, omitToolChoice, emptyStreak |
| agent.js:261-527 | main loop | per-step: build reqParams → retry 3x → push msg → salvage/path → final-or-exec tool → push tool results |
| agent.js:277-278 | `toolChoice` | step-0 + ACTION_INTENTS OR mustUseRealTool → "required", else "auto" |
| agent.js:280-338 | retry & failover | errCode 502/503/529: attempt-1 → fallbackClient OR FALLBACK_MODEL; else sleep (attempt+1)*5s |
| agent.js:282-296 | reqParams + cost record | temperature, max_tokens per role, usage.include=true; recordLlmCost fail-open |
| agent.js:344-363 | JSON args repair | `jsonrepair` sebelum push history (mencegah API reject next request) |
| agent.js:371-384 | salvage tool-dump | read-only dump → convert jadi `msg.tool_calls` synthetic (`salvage_<step>_<i>` id), clear content |
| agent.js:386-442 | no-tool path | empty pop+retry (Hermes null); tool-dump retry (MAX 2, reject canned message); mustUseRealTool retry (MAX 2); allowNoToolFinal exit (SCREENER ⛔ NO DEPLOY path) |
| agent.js:446-495 | `runToolCall` | parse args (jsonrepair fallback), ONCE_PER_SESSION block, interactive confirm, onToolStart/Finish hooks, executeTool dispatch, NO_RETRY_TOOLS lock |
| agent.js:502-513 | `execCache` dedup | signature `${name}|${args}` → Promise; fan result back to all tool_call_id |
| agent.js:514-526 | catch | 429 → sleep 30s continue; else throw |
| agent.js:533-535 | `sleep` helper | Promise setTimeout |

## §B. Alur agentLoop hulu→hilir (ASCII diagram)

```
ENTER agentLoop(goal, maxSteps=20, history=[], agentType, model, maxOutputTokens, options)
  │
  ├─ Promise.all([getWalletBalances, getMyPositions]) → portfolio + positions  [:225]
  ├─ getStateSummary + getLessonsForPrompt + getPerformanceSummary + getDecisionSummary
  ├─ SCREENER only: lazy import signal-weights, getWeightsSummary bila darwin.enabled  [:231-237]
  ├─ systemPrompt = buildSystemPrompt(...) (F5)                                          [:238]
  ├─ messages = buildMessages(system, history, goal, providerMode="system")                [:241]
  ├─ state: ONCE_PER_SESSION, NO_RETRY_TOOLS, firedOnce, mustUseRealTool, salvage/retry counters
  │
  ├─ for step in maxSteps:                                                                  [:261]
  │   ├─ activeModel = model || DEFAULT_MODEL                                                [:265]
  │   ├─ activeClient = (fallbackClient && model.endsWith("-free")) ? fallbackClient : client [:274-276]
  │   ├─ toolChoice = (step===0 AND (ACTION_INTENTS.test(goal) OR mustUseRealTool)) ? "required" : "auto" [:277-278]
  │   │
  │   ├─ for attempt in [0,1,2]:                                                            [:280-338]
  │   │   ├─ reqParams = {model, messages, tools: getToolsForRole, temperature, max_tokens, usage.include}
  │   │   │                max_tokens = maxOutputTokens ?? (GENERAL ? generalMaxTokens : maxTokens) [:287]
  │   │   ├─ if !omitToolChoice → reqParams.tool_choice = toolChoice                          [:290]
  │   │   ├─ response = await activeClient.chat.completions.create(reqParams)                 [:291]
  │   │   ├─ recordLlmCost fail-open                                                           [:293-296]
  │   │   ├─ catch handler (298-318):
  │   │   │     ├─ isSystemRoleError → providerMode="user_embedded", rebuild messages, attempt-=1, continue
  │   │   │     ├─ toolChoice=required rejected → toolChoice="auto", attempt-=1
  │   │   │     ├─ thinking mode reject tool_choice → omitToolChoice=true, attempt-=1
  │   │   │     └─ else throw
  │   │   ├─ if response.choices?.length → break
  │   │   └─ errCode 502/503/529 (317-337):
  │   │         ├─ attempt===1 && fallbackClient && activeClient!==fallbackClient → switch client+model LLM_FALLBACK_MODEL
  │   │         ├─ attempt===1 && usedModel!==FALLBACK_MODEL → switch FALLBACK_MODEL
  │   │         └─ else sleep (attempt+1)*5s
  │   │
  │   ├─ if !choices.length → throw "API returned no choices"                               [:340-343]
  │   ├─ msg = response.choices[0].message                                                  [:344]
  │   ├─ tool_calls JSON args repair via jsonrepair                                          [:347-363]
  │   ├─ messages.push(msg)                                                                   [:364]
  │   │
  │   ├─ SALVAGE: if !tool_calls && content && parseContentToolCalls                          [:371-384]
  │   │     └─ ifdumped && contentSalvageCount<4 && !dumped.some(NO_SALVAGE_TOOLS):
  │   │          msg.tool_calls = synthetic, msg.content="", salvaged++
  │   │
  │   ├─ if !tool_calls.length:                                                               [:387]
  │   │   ├─ if !content → pop + retry (Hermes null)                                          [:389-393]
  │   │   ├─ if parseContentToolCalls(content) → toolDumpRetry++, pop (398-416):
  │   │   │     ├─ if >=MAX_TOOL_DUMP_RETRY=2 → return canned "⛔ NO DEPLOY" or "couldn't complete"
  │   │   │     └─ else push system reminder, continue
  │   │   ├─ if mustUseRealTool && !sawToolCall && !allowNoToolFinal → noToolRetryCount++ (421-438):
  │   │   │     ├─ if >=2 → return "couldn't complete … no tool call made"
  │   │   │     └─ else pop + push reminder "use real tool"
  │   │   └─ else → "Final answer reached", return {content, userMessage: goal}                [:439-441]
  │   │
  │   ├─ sawToolCall = true                                                                    [:443]
  │   │
  │   ├─ runToolCall(toolCall) (446-495):
  │   │   ├─ parse args (jsonrepair fallback) → {} bila total fail
  │   │   ├─ if ONCE_PER_SESSION.has && firedOnce.has → blocked message + onToolFinish(success:false)
  │   │   ├─ if interactive && CHAT_CONFIRM_TOOLS.has → onConfirmRequired async → cancel possible
  │   │   ├─ onToolStart?.({name,args,step})
  │   │   ├─ result = executeTool(name, args)                                                  [:480]
  │   │   ├─ onToolFinish?.({name,args,result,success: !error&&!blocked,step})
  │   │   └─ lock: NO_RETRY_TOOLS add firedOnce regardless; ONCE_PER_SESSION add bila result.success===true
  │   │
  │   ├─ execCache dedup: signature → Promise, fan ke semua tool_call_id                        [:502-511]
  │   ├─ messages.push(...toolResults)                                                          [:513]
  │   │
  │   └─ catch (514-526):
  │         ├─ 429 → sleep 30s + continue
  │         └─ else throw
  │
  └─ return "Max steps reached … Review logs"                                                  [:530]
```

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| F2 runManagementCycle (index.js:605) | `agentLoop(MANAGER, maxSteps, 2048, {onToolStart,onToolFinish})` | actionPositions>0 | actionBlocks string + role = MANAGER | agent-loop fallback model; hook fires per-tool |
| F2 runScreeningCycle (index.js:1032) | `agentLoop(SCREENER, maxSteps, 2048, {allowNoToolFinal:true, onToolStart,onToolFinish})` | after recon+filter | candidateBlocks + strategyBlock + role = SCREENER | anti-hallucination guard (F2:1120) bila !deploySucceeded AND 🚀 DEPLOYED |
| F30 chat interactive (REPL/Telegram) | `agentLoop(GENERAL, ..., {interactive:true, onConfirmRequired})` | user message | goal text | 5 mutators ditahan utk confirm |
| agent.js:225 | getWalletBalances + getMyPositions | tiap agentLoop call | portfolio + positions | reject → null (fail-open buildPrompt tetap jalan) |
| agent.js:226 | getStateSummary | tiap call | state.json summary | reject → null |
| agent.js:227-229 | getLessonsForPrompt + getPerformanceSummary + getDecisionSummary | tiap call | string lines fail-open | null → "" |
| agent.js:233 | `getWeightsSummary` (signal-weights.js) | SCREENER + darwin.enabled | weights block | catch → null (signal-weights not critical) |
| agent.js:238 | `buildSystemPrompt` (prompt.js, F5) | tiap call | agentType + 7 ctx obj | prompt text |
| agent.js:285 | `getToolsForRole(agentType, goal)` (84-99) | tiap step | filter tool list | GENERAL no-match → all-minus-mutators |
| agent.js:291 | `activeClient.chat.completions.create` | tiap step attempt | model+messages+tools+temp+max_tokens+tool_choice+usage | retry 3x → fallback |
| agent.js:295 | `recordLlmCost` (llm-cost-tracker) | per call | {role, model, cost, tokens} | catch silent |
| agent.js:480 | `executeTool` (executor.js, F7) | per tool_call | (name, args) | result JSON string (error/blocked field) |
| agent.js:466,474,479,481 | onToolStart/onToolFinish hooks | per tool | {name,args,result,success,step} | caller-supplied, optional |

## §D. Logika kunci per fungsi

### `getToolsForRole(agentType, goal)` (agent.js:84-99)
- **Apa**: filter `tools` per role/intent.
- **Kapan**: tiap step loop (285).
- **Output**: array subset schema.
- **Sinkron**: MANAGER/SCREENER statis Set; GENERAL iterate `INTENT_PATTERNS` (18 intent) → union subset dari `INTENT_TOOLS`; bila no-match → `tools.filter(!GENERAL_INTENT_ONLY_TOOLS.has)`. Comment (96-97) "fall back to all tools" — minus dangerous mutators.
- **Fail-mode**: intent-gabung dict-key typo akan silent miss (regex no-match). Bila error di GENERAL → fallback all-minus-mutators redundan safety.
- **Kontrak ditegakkan**: SCREENER tak bisa `close_position` (Set limit); MANAGER tak bisa `deploy_position`; GENERAL akses penuh minus mutator-only (mutator butuh intent match).
- **Bukti**: agent.js:84-99, 7-41.

### `parseContentToolCalls(content)` (agent.js:154-180)
- **Apa**: deteksi model dump JSON tool-call di `content` (Hermes-style) → convert jadi tool_calls synthetic.
- **Kapan**: salvage (371) + reject (398).
- **Output**: array `{name, arguments}` atau null.
- **Sinkron**: strip 1 markdown fence; `JSON.parse` + `jsonrepair` fallback; validate semua nama ada di `VALID_TOOL_NAMES`; reject entry yg tak valid (return null = whole-dump reject).
- **Fail-mode**: parse fail → null (whole dump ignored → reject retry path).
- **Kontrak**: NEVER salvage `NO_SALVAGE_TOOLS` = `ONCHAIN_WRITE_TOOLS` (deploy/claim/close/swap) + `GENERAL_INTENT_ONLY_TOOLS` (mutators). Caller check di 374.
- **Bukti**: 154-180, 371-384.

### `shouldRequireRealToolUse(goal, agentType, interactive)` (agent.js:134-140)
- **Apa**: paksa tool real bila intent mutasi/live-data (cegah hallucinasi).
- **Kapan**: tiap call (249).
- **Output**: boolean.
- **Sinkron**: MANAGER free (semua cron action via tool MANAGER normal); decision-explain free (rik why); config-read free; mutasi always paksa; interactive + live_data paksa.
- **Fail-mode**: regex miss (misal typo) → false (lebih longgar, bukan blocking).
- **Kontrak**: prevents "invent deploy hasil dr memory"; SCREENER/MANAGER pakai `tool_choice=required` di step 0 juga (277-278).
- **Bukti**: 129-140, 249, 277-278.

### `agentLoop` main loop (agent.js:222-531)
- **Apa**: ReAct loop hingga maxSteps atau final.
- **Kapan**: dipanggil F2/F30.
- **Output**: `{content, userMessage}` atau canned skip/error string.
- **Sinkron**: maxOutputTokens null → per-role default (`generalMaxTokens` GENERAL, `maxTokens` else); usage.include=true → OpenRouter cost capture; retry 3x transient; provider-mode swap permanent (omitToolChoice sessi-penuh).
- **Fail-mode**: 
  - API retry exhausted → throw (caller catch di F2 cycle → `cycleFail`).
  - 429 → sleep 30s continue (loop tetap di step sama, tak mengambil step baru).
  - Tool exec error → result.error/blocked (executeTool return), tak throw; loop lanjut ke tool result push.
  - empty content → pop + retry (Hermes null); 4x empty streak akan tetap loop sampai maxSteps (no built-in cap explicit di emptyStreak — UNKNOWN, lihat Open-Q #3).
- **Kontrak kunci ditegakkan**:
  1. `ONCE_PER_SESSION` (deploy/swap/close) — cegah double-deploy same session.
  2. `NO_RETRY_TOOLS` (deploy) — lock regardless result, retry never benar.
  3. `CHAT_CONFIRM_TOOLS` interactive path — 5 mutator wajib konfirmasi user.
  4. `execCache` dedup — cegah 300+ identical calls (komentar 497-501).
  5. `mustUseRealTool` nudge twice → canned failure.
  6. `allowNoToolFinal` (SCREENER) — ⛔ NO DEPLOY path sah utk no-tool final (cegah infinite loop di skip).
- **Bukti**: 222-531.

### Retry & failover (agent.js:280-338)
- **Apa**: 3-attempt retry transient + provider fallback.
- **Kapan**: tiap step.
- **Output**: response atau throw.
- **Sinkron**: 
  - attempt-1 (kedua attempt) AND fallbackClient tersedia AND activeClient != fallbackClient → switch ke fallbackClient (model `LLM_FALLBACK_MODEL || "deepseek-v4-flash-free"`).
  - attempt-1 AND usedModel != `FALLBACK_MODEL` (stepfun free) → switch model saja (same client).
  - else sleep (attempt+1)*5000 ms.
- **Fail-mode**: 
  - Layered: 1st primary model → 2nd attempt stepfun/3.5-flash OR fallbackClient model → 3rd attempt sleep lagi.
  - Tidak ada retry penuh untuk 400 (bad request, real error) → break di 336 → throw "no choices".
  - System-role error / tool_choice rejection / thinking-mode → mode swap, attempt-=1 (tak deduct retry).
- **Kontrak**: cost record fail-open per-call — bila switch model di tengah, track cost per model tetap jalan (line 295 pakai `usedModel`).
- **Bukti**: 264-338, 514-526.

## §E. Temuan: race, defense, kontrak, gap

### E.1 — Role gating statis vs GENERAL intent
- MANAGER/SCREENER whitelist eksplisit (7-15); GENERAL pelo intent-routing (84-99). Tidak ada cara deploy dari SCREENER→close (Set filter tak intersect). Aman.
- SCREENER_TOOLS koment 8-14: 6 recon tools sengaja dibuang karena data sudah pre-loaded di candidate block (F2:916-1026). Konsekuensi: model tak bisa re-fetch mid-reasoning. Bila kandidat block missing field, model tak bisa recover via tool. Trade-off: hemat ~8k token vs recoverability. Fail-open utk recon bypass.
- Bukti: agent.js:7-15, comment 8-14.

### E.2 — Fallback client routing `-free` suffix
- agent.js:274: `useFallbackForModel = fallbackClient && model && model.endsWith("-free")`. Arti per-role model `*-free` (mis `openrouter/healer-alpha-free`) routed ke OpenCode Zen di awal, BUKAN cuma saat failover.
- Konsekuensi: free model melewati Zen walau OpenRouter up. Sesuai comment (117-118). Tapi bila `LLM_FALLBACK_BASE_URL` tak di-set, `-free` model tetap ke OpenRouter primary (no fallbackClient available).
- Bukti: 119-125, 274-276.

### E.3 — ONCE_PER_SESSION vs NO_RETRY split
- `ONCE_PER_SESSION` (deploy/swap/close) lock bila firedOnce — regardless of prior result. Tapi tambahan: close/swap lock bila `result.success === true` (492), jadi failed close bisa retry (genuine failure recoverable). Deploy lock regardless (NO_RETRY_TOOLS, 491).
- Asimetri: deploy "lock regardless of success" — retry deploy tak pernah benar (idempotent N/A, atau bisa double-position). close/swap success-only lock — bila tx failed boleh retry.
- Bukti: 245-247, 463-468, 491-492.

### E.4 — Interactive confirm + onConfirmRequired bypass
- agent.js:470-477: bila `interactive && onConfirmRequired && CHAT_CONFIRM_TOOLS.has(name)` → `await onConfirmRequired(name, args)`; bila cancel → cancelResult, onToolFinish(success:false), return JSON cancel.
- Cron loops (F2/F30 cron path) tak pass `interactive` → 5 mutators otomatis. Tepat: admin chat wajib confirm, bot autonomous jalan sendiri.
- `onConfirmRequired` impl di F30 (`requestConfirmation`, index.js:1807). Caller kontrak return boolean async.
- Bukti: 21, 470-477; cross-ref F30.

### E.5 — Tool-dump salvage cakupan
- Aman: `NO_SALVAGE_TOOLS = ONCHAIN_WRITE_TOOLS ∪ GENERAL_INTENT_ONLY_TOOLS` (152). On-chain writes (deploy/close/claim/swap) + mutators (update_config/blacklist/strategies/lessons/smart_wallets) tak bisa salvage dari text dump.
- Salvage budget `MAX_CONTENT_SALVAGE=4` — bila model dump 5x text-dump read-only, lima dump reject → `MAX_TOOL_DUMP_RETRY=2` return canned (402-409). Two-stage defense.
- `parseContentToolCalls` validate semua nama di dump → kalau 1 nama tak valid, whole dump reject (return null) → reject path. Strict, bukan best-effort.
- Bukti: 148-180, 371-416.

### E.6 — `mustUseRealTool` + `allowNoToolFinal` interaksi
- SCREENER cron pass `allowNoToolFinal:true` (F2:1032); `mustUseRealTool` cek di 421 `mustUseRealTool && !sawToolCall && !allowNoToolFinal` → SCREENER always skip nudge ini, lewat ke final-answer path. Tapi screening punya `toolChoice="required"` di step 0 (277-278 bila deploy intent) — paksa call tool step pertama.
- Path “⛔ NO DEPLOY” sah di screening (404). Caller (F2) parse: bila `!deploySucceeded AND /🚀 DEPLOYED/` → override ke NO DEPLOY (F2:1120). Defense berlapis.
- MANAGER `mustUseRealTool` false (MANAGER skip di 135) → final-answer gate tak paksa real-tool.
- Bukti: 421-438, F2:1032,1120.

### E.7 — Tool exec error tidak throw
- `executeTool` (executor.js, F7) return JSON `{error:..., success:false, blocked:true}`. Loop push ke messages sebagai tool result, model lihat sendiri gagal, bisa adjust.
- Exception: `429` sleep 30s continue (518). Other error throw → catch cron → `cycleFail` (F2:1148).
- Bukti: 480, 514-526.

### E.8 — emptyStreak tak dipakai
- agent.js:260 deklarasi `let emptyStreak = 0;` tapi tak pernah increment atau dibaca. Dead var. UNKNOWN apakah pernah dipakai lama, atau placeholder utk fitur future. Open-Q #3.
- Bukti: 260.

### E.9 — Race tools + history push order
- `messages.push(msg)` di 364 (assistant msg) → bila ada tool_calls, di 503-513 `Promise.all` eksekusi paralel, push results `messages.push(...toolResults)`. Order: assistant msg dulu, baru tool results (semua id). Konsisten dgn OpenAI API contract.
- Paralel tool exec: `runToolCall` masing-masing async; `execCache` dedup per-signature → identical calls fan ke all id. Bila model emiten 300 duplikat, eksekusi 1 actual call, 300 tool_call_id pakai result sama. Efisien + aman (tak double-write).
- Bukti: 364, 502-513.

### E.10 — Provider mode swap permanen
- `providerMode` swap (`system` → `user_embedded`) permanen utk sisa sesi (tak balik). `omitToolChoice` juga permanen. Konsekuensi: bila provider support system role sebagian besar request tapi reject di satu, sesi penuh ke user-embedded (lebih boros token, tetap jalan).
- Demikian pula tool_choice — bila thinking mode reject di awal, semua step pakai `auto`/implicit.
- Bukti: 240, 258, 298-316.

## §F. Glosarium fase

- **ReAct loop**: Reasoning+Acting — LLM pikir pakai tool, hasil tool kembali, LLM pikir lagi, hingga final text.
- **MANAGER_TOOLS/SCREENER_TOOLS**: Set whitelist statis per role (filter `tools` schema).
- **INTENT_TOOLS/INTENT_PATTERNS**: 18 intent EN+ID regex → subset tool utk GENERAL.
- **GENERAL_INTENT_ONLY_TOOLS**: mutator berbahaya eksklusif GENERAL via intent (tak join fallback).
- **CHAT_CONFIRM_TOOLS**: 5 mutator wajib user-confirm bila interactive (cron tak interactive).
- **ONCE_PER_SESSION**: deploy/swap/close lock sesi; swap/close lock-on-success, deploy lock-anyway.
- **NO_RETRY_TOOLS**: deploy lock regardless of result (retry deploy tak pernah benar).
- **firedOnce**: Set lock per agentLoop session (block 2nd identical call).
- **mustUseRealTool**: paksa tool real utk mutasi/live-data intent (cegah hallucinasi).
- **salvage**: parse tool-call text-dump read-only jadi tool_calls synthetic.
- **NO_SALVAGE_TOOLS**: on-chain-write + mutators tak boleh salvage (un-vetted plan).
- **tool_dump_retry**: model balik dump text padahal sudah ditolak (reject + nudge).
- **allowNoToolFinal**: SCREENER sah skip tanpa tool (⛔ NO DEPLOY path).
- **providerMode**: "system" (default) atau "user_embedded" bila provider tolak system role.
- **omitToolChoice**: permanen skip tool_choice param bila thinking mode reject.
- **execCache**: Map<signature, Promise> dedup identical tool calls per turn.
- **fallbackClient**: OpenCode Zen opt-in `LLM_FALLBACK_BASE_URL`; route `-free` model awal.
- **FALLBACK_MODEL**: `stepfun/step-3.5-flash:free` model swap di OpenRouter saat 502/503/529.
- **tool_choice=required**: step-0 paksa call tool utk ACTION_INTENTS.
- **ACTION_INTENTS**: regex trigger utk paksa tool_choice=required di step 0.
- **max_tokens**: per-role `generalMaxTokens` GENERAL, `maxTokens` else; opt override.

## §G. Open-Q (bawa ke F5/F6/F7/F30)

1. **[F6]** Tool count di `tools` array (definitions.js:1-1173). Berapa total tool? SCREENER_TOOLS filter (15) harus subset; MANAGER_TOOLS (7) harus subset; `INTENT_TOOLS[x]` semua harus subset. Verify CI apakah ada lint di repo utk validasi subset. Cross-ref F6.
2. **[F5]** `buildSystemPrompt(agentType, portfolio, positions, stateSummary, lessons, perfSummary, weightsSummary, decisionSummary)` — parameter 8 ditangani semua? Atau ada yang di-ignore utk role tertentu (MANAGER tak butuh weights, dst)? Cross-ref F5.
3. **[F2/F4 verify]** `emptyStreak` (agent.js:260) tak pernah dipakai. Dead var atau memory leak? Hapus? Aman kosong.
4. **[F30]** `requestConfirmation` (index.js:1807) return Promise<boolean> — bila user tak reply timeout, apa defaultnya? Cancel atau timeout error? Kontrak onConfirmRequired wajib eksplisit. Cross-ref F30.
5. **[F7]** `executeTool` safety checks bila tool = `deploy_position`: hooks onToolStart/onToolFinish fire BEFORE atau AFTER safety check? Komentar F2:1103 `deployAttempted=true` di onToolStart — bila safety reject, onToolFinish masih fire `success:false,blocked:true` (lihat 466 blocked path). Verify timeline lengkap di F7.
6. **[F5]** SCREENER prompt byte-identik saat GRUP16 experiment mats (CLAUDE.md:127). `weightsSummary` (231-237) bila darwin.enabled — blok prompt extra muncul. Berarti SCREENER prompt TIDAK byte-identik saat darwin on. CLAUDE.md kontrak hanya utk experiment flags default-off, bukan utk darwin. Konfirmasi di F5.
7. **[F6 verify]** `INTENT_TOOLS.strategy` (55) ada `update_strategy` beda `add_strategy`/`set_active_strategy` — apakah definisi tools/definitions.js konsisten (ada `update_strategy`? `delete_strategy`?). Verify F6.
8. **[F4死角]** `tool_choice="required"` di step 0 (277). Provider-tidak-support "required" → swap "auto" (305-310). Konsekuensi: paksa tool jadi tak terjamin utk provider aneh. Mitigasi: `mustUseRealTool` nudge 2x. Bisakah keduanya lewat — auto fallback 0 tool + nudge max 2 → return canned failure? Ya (425-430). Aman.
9. **[F7/F4死角]** `executeTool` error result tak throw. Tapi bila executor sendiri throw (bug internal, reference error), catch di 514? Validator: try di 280 melingkup `response = ... chat.completions.create` saja. Eksekusi tool dilakukan SETELAH `messages.push(msg)` di 364, di 503 `Promise.all(...map(runToolCall))`. Bila runToolCall throw, Promise.all reject, masuk catch 514 → throw ke caller (F2 cycle). Bukan fail-open. Open-Q: apakah ada runToolCall internal try? Tak ada (446-495). Open Q bawa ke F7.
10. **[F4死角]** `recordLlmCost` arg `cost: u.cost ?? u.total_cost ?? null`. Kalau `u.cost` 0 (free), `??` skip ke `u.total_cost` (jg 0), null. Tracker save cost=0 ssahusPage dipakai / skip? Cost-of-0 logika. Cross-ref F25 tracker.

## §H. Cross-ref fase lain

- **F2**: `agentLoop` dipanggil management 605 + screening 1032; `allowNoToolFinal` SCREENER; hooks pasang `deployAttempted`/`deploySucceeded`; anti-hallucination guard lihat F2:1120.
- **F5**: `buildSystemPrompt` dirakit di sini (238); ctx portfolio+lessons+weights+decision berasal lapisan ini.
- **F6**: `tools` array global di definitions.js; filter per-role subset.
- **F7**: `executeTool` dispatcher + safety checks; `runToolCall` tak punya internal try — open Q.
- **F8**: `update_config` masuk `CHAT_CONFIRM_TOOLS` + `GENERAL_INTENT_ONLY_TOOLS` — interactive wajib confirm + GENERAL-only.
- **F30**: interactive path pasang `onConfirmRequired`; cron path skip confirm.
- **F25**: `recordLlmCost` (295) kirim ke llm-cost-tracker; rolenya mapping ke screening/management/general.

*F4 selesai 2026-07-06. Read-only. Kode/config tak diubah saat menyusun.*