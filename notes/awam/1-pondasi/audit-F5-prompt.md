# Audit F5 — SOP Prompt + Racikan Injection
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: sedang — alasan: 3 jalur pembangunan prompt per-role (SCREENER/MANAGER/GENERAL) jelas; kontrak racikan file-only + byte-identik factory; eksperimen flag default OFF line-conditional. Density menengah.
> Cross-ref: F4 (agentLoop pasarang ctx + panggil), F22 (profile lessons), F27 (convictionSizing flag), F8 (update_config bentrokan).

## Ringkasan eksekutif (5 baris)
1. `buildSystemPrompt` (prompt.js:31-201) tiga cabang: MANAGER dedicated short-circuit (35-52, prompt mekanis tanpa SCREENER-weight block); SCREENER dedicated (114-158, candidate pre-loaded + hard-rule + racikanRules + experiment lines conditional); GENERAL/else pakai `basePrompt` (54-112) + tail per-role MANAGER-else/GENERAL (159-198).
2. `racikanRules(role)` (21-29): render `config.promptNotes[role]` array → block "RACIKAN RULES — carried by racikan <name>" — HARD di atas soft-guideline, kalah dari HARD RULE/mechanis safety. Empty notes → "" (factory byte-identik, CLAUDE.md kontrak). Aktif di SCREENER (141), MANAGER (50), GENERAL (197). Source label `activeSetup` opsional (24).
3. MANAGER-early (35-52) kompak: `portfolioCompact` + `mgmtConfig` (no screening/schedule) + BEHAVIORAL CORE 3 (PATIENCE/GAS/DATA-AUTONOMY) + racikanRules manager + lessons + timestamp. Tak ada NARRATIVE/CANDIDATES/HARD-RULE/PVP — posisi pre-loaded di goal. Comment 34: "leaner prompt — positions pre-loaded, not repeated".
4. Eksperimen prompt lines (SCREENER-only, gated `config.experiments.<flag>`): `timeProfile` (115 — selalu ON, bukan eksperimen), `narrativeProfile` (117 — `narrativeProfileSignal` flag default off), `convictionHint` (121-123 — `convictionSizing` flag, label ±N% re-clamp), `weightsSummary` (param `?? null`). Urutan urutan inject: racikan → NARRATIVE QUALITY → POOL MEMORY → DEPLOY RULES → timeProfile → narrativeProfile → convictionHint → weightsSummary → lessons → timestamp (line 157). Ternary concatenation — setiap block diawali `\n\n` bila non-null.
5. GENERAL/else (159-198, memakai `basePrompt`): INSTRUCTION CHECK (MANAGER-elif) atau user INSTRUCTION ambi/INTENT-DISAMBIG/PVP-RULE (else branch GENERAL). Override-params rule explicit (187), swap-after-close, parallel-fetch top-lpers/sw-precision. Eksperimen tak inject di GENERAL/else. `racikanRules("general")` di akhir else block (197).

## Progress
- [x] Baca prompt.js full (1-201)
- [x] Baca CLAUDE.md (racikan-prompt-notes, experiments, role-injektion)
- [x] Cross-ref F4 (caller agentLoop), F22 (lessons.js profile)
- [x] Tulis §A-§H
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *SOP harian 3 posisi kerja*: kasir dapat SOP "scanning barang, terima uang, kasih kembalian"; security dapat SOP "cek tas tamu, lalu lewatkan"; resepsionis dapat SOP "sapa tamu, tanya mau apa, arahkan". Tiap role dapat SOP yang berbeda — tak boleh tukar-menukar. SOP berisi: identitas role, aturan tegas (HARD RULE), aturan halus (racikan rules), data yang relevan (lessons, current portfolio), dan jam sekarang.
- *Buku menu yang bisa dimodifikasi per franchise*: tiap franchise (racikan) bisa tempel halaman "aturanku sendiri" — tapi aturan mekanis (cegah duplikat, max-pos, safety) tak bisa ditimpa. Di bot, ini = racikan `promptNotes` bisa kasih soft rules ke prompt SCREENER/MANAGER/GENERAL, tapi tak override safety checks F7.

**Di bot, ini = `buildSystemPrompt` + `racikanRules(role)`**: fungsi yang dirakit system prompt untuk tiap pemanggilan LLM (F4) — gabungkan role-SOP + racikan rules + lessons + context. Ada di `prompt.js:31-201`.

**Posisi fase ini di alur bot**
F5 = storyboard. Setiap `agentLoop` panggilan di F4 mula-mula telpon F5 buat bangun prompt. F5 ambil SOP role + lessons (F19/F22) + portfolio live → jadi 1 string "system prompt" selebar beberapa KB. Lapisan 3 (Mesin). Tanpa F5, F4 mengirim prompt kosong → LLM bingung "kamu siapa, kamu boleh apaan".

**Langkah kerja F5 — `buildSystemPrompt(role, params)` (prompt.js:31-201)**
1. Baca role. Branch ke 3 jalur: MANAGER (35-52), SCREENER (114-158), GENERAL/else (54-112 + tail 159-198).
2. **MANAGER dedicated short-circuit** (35-52) — paling kompak: portfolio compact + management config (no screening/config groundwater) + BEHAVIORAL CORE (PATIENCE / GAS-EFFICIENCY / DATA-AUTONOMY) + racikanRules manager + lessons + timestamp. Tak ada candidate/pool-memory (manager tak perlu pilih kolam). Posisi pre-loaded di goal block.
3. **SCREENER dedicated** (114-158) — paling tebal: racikanRules screener + NARRATIVE QUALITY + POOL MEMORY (history kolam yg sudah pernah dimasuki) + DEPLOY HARD RULES + timeProfile (selalu, bukan eksperimen) + narrativeProfile (opt-in) + convictionHint (opt-in) + weightsSummary (Darwin) + lessons + timestamp. Candidate pre-loaded di prompt block.
4. **GENERAL/else** (54-112 + tail) — pakai `basePrompt` lalu tail per-role: INSTRUCTION CHECK (kalau ada instruksi override dari user) / INTENT-DISAMBIG / PVP-RULE. Eksperimen tak inject di GENERAL. racikanRules general di akhir.
5. **`racikanRules(role)`** (21-29) — render `config.promptNotes[role]` jadi block "RACIKAN RULES — carried by racikan <name>". Hard di atas soft-guideline, kalah dari HARD RULE/mekanis safety F7. Empty promptNotes → "" (factory byte-identik — kontrak CLAUDE.md).
6. Inject experiment lines (SCREENER-only, gated by flag default OFF): `timeProfile` selalu ON, `narrativeProfile` opt-in, `convictionHint` opt-in (label ±N% re-clamp), `weightsSummary` (Darwin).
7. Suffix timestamp — supaya LLM tahu waktu WIB sekarang (kalau timeProfile cek sesi).

**Output F5**: string `system_prompt` siap dikirim OpenRouter (F4). Berisi: identity role, aturan mekanis, soft rules racikan, data lessons/portfolio/weights, eksperimen hints, timestamp. String selebar ~3-8 KB tergantung density data.

**Kalau F5 rusak / diskip**
LLM kirim tanpa SOP. SCREENER tak tahu aturan deploy (bin range, max-pos) → dipakai gas berlebihan. MANAGER tak tahu aturan claim → gagal fee. GENERAL tak tahu letak config → jawab asal. Racikan rules mati → behavior tak travel dengan preset (clone bot tak konsisten). TimeProfile mati → screening tetap jalan di sesiWIB lemah (rugi probability lebih besar). F5 = identitas + otak keputusan tiap panggilan LLM.

**Istilah yang muncul di fase ini**
- **buildSystemPrompt** — fungsi utama dirakit tiap pemanggilan LLM; 3 cabang per-role.
- **racikan / preset / `promptNotes`** — aturan soft yang dibawa file preset; render ke block `RACIKAN RULES`. Hard di atas soft-guideline, kalah dari HARD RULE mekanis (F7).
- **byte-identik factory** — bila `promptNotes` empty / flag eksperimen OFF → prompt byte-identik dengan baseline pabrik. Kontrak isolasi.
- **BEHAVIORAL CORE** — 3 rule perilaku boros LLM: PATIENCE (tak deploy kalau ragu), GAS-EFFICIENCY (klaim bila cukup), DATA-AUTONOMY (jangan nanya data yang bisa diambil sendiri).
- **HARD RULE** — aturan mekanis yang tak bisa ditimpa racikan atau LLM (deploy法规 bin_step/max-pos/dup/SOL/range-floor — F7).
- **timeProfile** — lessons ditampung per-sesi WIB (dini/pagi/siang/sore/malam); SCREENER prompt dapat 1 line status sesi sekarang. Selalu ON (bukan eksperimen).
- **narrativeProfile** — eksperimen: tag kolam per kategori narasi (meme/DeFi/AI dll), ambil dari lessons PnL per-kategori. Ot-in.
- **convictionHint** — eksperimen: prompt line bilang "conviction low/medium/high bisa sesuaikan amount, ±N% re-clamp". Ot-in `convictionSizing`.
- **weightsSummary** — `signal-weights` summary dari Darwin; inject SCREENER bila `darwin.enabled`. Bukan eksperimen tapi gate `darwin.enabled`.
- **PVP-RULE** — rule GENERAL: bila user ragu inten, jalur ini disambigu sebelum eksekusi.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| prompt.js:12-13 | imports | config, lessons profile fns |
| prompt.js:21-29 | `racikanRules(role)` | render promptNotes per-role jadi HARD block |
| prompt.js:31-201 | `buildSystemPrompt` | entry utama, tiga cabang |
| prompt.js:32 | `const s = config.screening` | (unused di deep selanjutnya — UNKNOWN, lihat Open-Q #4) |
| prompt.js:35-52 | MANAGER dedicated return | short-circuit render |
| prompt.js:42 | `portfolioCompact` | JSON.stringify(portfolio) 1-line |
| prompt.js:43 | `mgmtConfig` | JSON.stringify(config.management) |
| prompt.js:45-49 | BEHAVIORAL CORE (3 rule) | PATIENCE/GAS-EFFICIENCY/DATA-AUTONOMY |
| prompt.js:50 | racikan+lessons inject | inline template |
| prompt.js:54-112 | `basePrompt` (schaften) | struktur utama SCREENER/GENERAL/else |
| prompt.js:61-64 | CURRENT STATE block | portfolio+positions+memory+perf JSON pretty |
| prompt.js:66-70 | Config block | screening+management+schedule |
| prompt.js:72-75 | LESSONS block (conditional) | bila lessons non-null |
| prompt.js:77-80 | RECENT DECISIONS block | bila decisionSummary non-null |
| prompt.js:82-93 | BEHAVIORAL CORE (5 rule shared) | PATIENCE/GAS/DATA/POST-DEPLOY-INTERVAL/UNTRUSTED-DATA |
| prompt.js:95-110 | TIMEFRAME SCALING notes | tabel per-timeframe |
| prompt.js:114-158 | SCREENER dedicated return | candidate pre-loaded, hard-rule, deploy rules, eksperimen |
| prompt.js:115 | `timeProfile` | `getTimeProfileForPrompt()` — selalu jalan (NOT eksperimen) |
| prompt.js:117 | `narrativeProfile` | gated `narrativeProfileSignal` |
| prompt.js:121-123 | `convictionHint` | gated `convictionSizing`, label re-clamp |
| prompt.js:129 | anti-hallucination explicit | SCREENER-flag "MUST call actual tool" |
| prompt.js:131-133 | HARD RULE screen | `minTokenFeesSol` floor, `maxBotHoldersPct` |
| prompt.js:135-139 | RISK SIGNALS | `maxTop10Pct`/PVP/no-narative-no-sw/lone-candidate |
| prompt.js:141 | `racikanRules("screener")` inject | setelah RISK SIGNALS |
| prompt.js:142-145 | NARRATIVE QUALITY | GOOD/BAD heuristic |
| prompt.js:146 | POOL MEMORY | strong skip |
| prompt.js:148-155 | DEPLOY RULES | compounding, strategy lock/flexible, bins_below formula inline |
| prompt.js:153 | bins_below formula | inline render lo/hi/delta |
| prompt.js:157 | eksperimen + lessons + timestamp injection | multi ternary concat |
| prompt.js:159-174 | else-if MANAGER (fallback) | INSTRUCTION CHECK + BIAS-TO-HOLD + Decision Factors + no-get-top-candidates |
| prompt.js:176-198 | else GENERAL | INTENT-DISAMBIG + OVERRIDE-RULE + swap-after-close + parallel-fetch + top-lpers + PVP-RULE + racikanRules |
| prompt.js:186-189 | UNTRUSTED-SAFE-TEXT (general) | narrative/pool memory/notes adversarial |
| prompt.js:197 | racikan general inject di akhir else | sebelum closing |
| prompt.js:200 | closing | `+ "\nTimestamp: ...\n"` |

## §B. Alur render hulu→hilir (ASCII)

```
ENTER buildSystemPrompt(agentType, portfolio, positions, stateSummary, lessons, perfSummary, weightsSummary, decisionSummary)  [:31]
  │
  ├─ const s = config.screening                                                              [:32]
  │
  ├─ if agentType === "MANAGER":                                                              [:35]
  │     ├─ portfolioCompact = JSON.stringify(portfolio)                                          [:36]
  │     ├─ mgmtConfig = JSON.stringify(config.management)                                         [:37]
  │     ├─ return base factory (38-49) + racikanRules("manager") (50) + lessons + timestamp       [:38-51]
  │     └─ (early return — tak masuk basePrompt)
  │
  ├─ basePrompt = `You are autonomous DLMM LP on Solana. Role: ${agentType}` + CURRENT STATE + Config + Less + decisions + BEHAVIORAL CORE(5) + TIMEFRAME SCALING notes  [:54-112]
  │
  ├─ if agentType === "SCREENER":                                                              [:114]
  │     ├─ timeProfile = getTimeProfileForPrompt()                                               [:115]
  │     ├─ narrativeProfile = experiments.narrativeProfileSignal ? getNarrativeProfileForPrompt() : null  [:117]
  │     ├─ convictionHint = experiments.convictionSizing ? `CONVICTION SIZING ... ±N%` : null  [:121-123]
  │     └─ return factory SCREENER (124-129) + HARD RULE (131-133) + RISK SIGNALS (135-139)
  │              + racikanRules("screener") (141) + NARRATIVE QUALITY (142-145) + POOL MEMORY (146)
  │              + DEPLOY RULES (148-155) + timeProfile (157) + narrativeProfile + convictionHint + weightsSummary
  │              + lessons + Timestamp (157)
  │
  ├─ else if agentType === "MANAGER" (BACKUP — UNREACHABLE karena early return di 35)            [:159]
  │     └─ basePrompt += INSTRUCTION CHECK + BIAS-TO-HOLD + Decision Factors + no-screen-here + swap-after-close (160-174)
  │
  ├─ else GENERAL:                                                                              [:175]
  │     └─ basePrompt += user-instruction + INTENT-DISAMBIG + anti-hallucination + untrusted-data + OVERRIDE-RULE
  │            + swap-after-close + parallel-fetch + top-lpers + PVP-RULE + racikanRules("general") (176-197)
  │
  └─ return basePrompt + "\nTimestamp: ...\n"                                                   [:200]
```

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| F4 agent.js:238 | `buildSystemPrompt(agentType, portfolio, positions, stateSummary, lessons, perfSummary, weightsSummary, decisionSummary)` | tiap agentLoop call | 8 ctx obj | null ctx → collapse block di ternary |
| F4 agent.js:115 | `getTimeProfileForPrompt` (lessons.js, F22) | SCREENER render | profile string atau null | null → line skip |
| F4 agent.js:117 | `getNarrativeProfileForPrompt` (lessons.js, F22) | eksperimen ON | profile atau null | null → block skip |
| F4 prompt.js:21-29 | `config.promptNotes[role]` + `config.activeSetup` | tiap render | array notes, string name | malformed → [] (config.js normalize, F28) |
| config.js (normalize) | `normalizePromptNotes` | startup/reload | raw input | malformed → empty (fail-open) |

## §D. Logika kunci per fungsi

### `racikanRules(role)` (21-29)
- **Apa**: render `config.promptNotes[role]` array jadi HARD block "RACIKAN RULES".
- **Kapan**: tiap render (50/141/197).
- **Output**: string block atau "".
- **Sinkron**: `promptNotes[role] ?? []` (22); array; bila length=0 return ""; bila `config.activeSetup` terkait, label `— carried by racikan "<name>"` ditambah di header (24). Block has body `notes.map("- ${n}").join("\n")`.
- **Fail-mode**: missing → []; malformed → sudah dinormalisasi di config (F28). Empty → byte-identik factory (CLAUDE.md `petaProyek`).
- **Kontrak**: HARD di atas soft-guideline (kode kata: "RACIKAN RULES win"), KALAH dari HARD RULE + mechanical safety checks. Tidak pernah ke baris kode `prompt.js` lain — file-only via `presets/<name>.json` (CLAUDE.md:191).
- **Bukti**: prompt.js:21-29.

### `buildSystemPrompt` MANAGER early return (35-52)
- **Apa**: prompt kompak utk MANAGER cron (F2:605). Tak ada screening/candidate/weights — posisi pre-loaded di goal (`actionBlocks` di F2:593-603).
- **Kapan**: tiap MANAGEMENT cron tick bila `actionPositions>0`.
- **Output**: inline template. `mgmtConfig` 1-line JSON; positions tak direnda sini; portfolio compact.
- **Sinkron**: 3 BEHAVIORAL CORE (no POST-DEPLOY INTERVAL karena MANAGER tak deploy; no UNTRUSTED-DATA rule karena tak lihat candidate narrative).
- **Fail-mode**: `portfolio`/`config` undefined → `JSON.stringify(undefined)` → "undefined" literal string (silent corrupt prompt). Aman karena caller (agent.js:225) selalu pass object; risk bila bug upstream. Unknown detector.
- **Kontrak**: hard-rule close/claim di sini 3 CORE saja (PATIENCE/GAS/DATA). Mekanis rule bener cek di F3 (`getDeterministicCloseRule` di index.js), bukan di prompt.
- **Bukti**: 35-52.

### `buildSystemPrompt` SCREENER return (114-158)
- **Apa**: prompt SCREENER untuk screening cron (F2:1032). Candidate pre-loaded, HARD RULE, RISK SIGNALS, DEPLOY RULES, eksperimen inject.
- **Kapan**: tiap screening tick bila passing candidates ada.
- **Output**: inline template ~80 baris prompt.
- **Sinkron multi-source**:
  - `timeProfile` (115) — selalu jalan (NOT experiment, dari F22 hourly profile).
  - `narrativeProfile` (117) — `experiments.narrativeProfileSignal` flag default off → null → block skip.
  - `convictionHint` (121-123) — `experiments.convictionSizing` flag default off; bila ON render $\pm$ `convictionSizingMaxAdjustPct ?? 30`% label.
  - `weightsSummary` (param pass via 31, render di 157) — `?? null` null-skip; non-null → `"<weights>\nPrioritize candidates whose strongest attributes align with high-weight signals.\n"`.
  - `lessons` (param pass) — non-null → `LESSONS LEARNED:\n${lessons}\n` blok.
- **Fail-mode**: getTimeProfileForPrompt/null → skip. Eksperimen null → skip. produktivitas fail-open via ternary.
- **Kontrak HARD RULE** (131-133): `fees_sol < minTokenFeesSol → SKIP`, `bots > maxBotHoldersPct% → already hard-filtered before you see the candidate list`. Kontrak `minTokenFeesSol` mekanis enforced di screening.js (F14) jadi kalau model skip pun, executor tetap filter pool — prompt adalah SOP. `minBundlersPct`/`launchpad` tak disebut SCREENER prompt — enforced pre-LLM (F14).
- **Kontrak lone-candidate** (139): "Treat it as maybe nothing good enough" — passtra dengan F2:879 `getLoneCandidateSkipReason` (veto mekanis). Bila skip reason → pre-LLM skip; bila tidak → LLM lihat prompt ini judgment.
- **Kontrak racikan inject** (141): setelah RISK SIGNALS. Mantra CLAUDE.md `dua` lain.
- **Kontrak bins_below inline** (153): `round(lo + (vol/5)*(hi-lo)) clamped to [lo,hi]` — sinkron dengan `computeBinsBelow` di F3 (index.js:1572-1580). Prompt label konsisten dengan kode math.
- **Bukti**: 114-158.

### `buildSystemPrompt` GENERAL else (159-198)
- **Apa**: prompt untuk GENERAL manual chat (F30). Userрив ada autonomy, take action explicit instruction saja.
- **Kapan**: GENERAL agentLoop call (F30 chat).
- **Sinkron**: INTENT DISAMBIG Rule (180-182), anti-hallucination (184), UNTRUSTED-DATA (185), OVERRIDE-RULE user-exact (187), SWAP-AFTER-CLOSE (189), PARALLEL-FETCH (191), TOP LPERS (193), PVP (195), `racikanRules("general")` (197). Sortasi memuat explicit safety anti-3rd-party-content-attack.
- **Kontrak INTENT-DISAMBIG**: cegah "ubah deploy jadi 0.3" diterjemah deploy 0.3 SOL (line 180). Mitigasi prompt-injection via natural language ambiguous. Bila ambigu → ASK one clarifying question (182). Perlu verifikasi praktek LLM mematuhi (Open-Q #2).
- **Kontrak OVERRIDE**: user explicit params always win over lessons/preset default (187). Counterbalance RACIKAN RULES yang HARD di soft-guideline — bila user spesifik, override racikan pun.
- **Kontrak UNTRUSTED-DATA** (185): narrative/pool memory/notes adversarial. Kombinasi dengan `sanitizeUntrustedPromptText` di F2:976 (candidate block). Prompt berperingat, kode sanitasi.
- **Bukti**: 175-198.

### `else if (agentType === "MANAGER")` fallback (159-174)
- **Apa**: block INSTRUCTION CHECK + BIAS-TO-HOLD di `basePrompt` MANAGER-elif.
- **Kapan**: **TIDAK PERNAH DIPANGGIL** — MANAGER short-circuit di 35-52 early return, tak pernah masuk sini. Dead code path; UNKNOWN apakah intended sebagai doc / defense / belum refactored. Open-Q #1.
- **Output**: basePrompt += ... (tak return).
- **Bukti**: 159-174.

## §E. Temuan: kontrak, byte-identik, racikan isolation, gap

### E.1 — Racikan isolation file-only (ditegakkan)
- `racikanRules` render dari `config.promptNotes` — bila kosong → "" → byte-identik (29). Kode tak ada flag/racikan-name hardcode (CLAUDE.md:120 "Never hardcode racikan-specific prompt text in prompt.js"). Aman.
- Source label `— carried by racikan "<activeSetup>"` opsional (24), hanya bila `config.activeSetup` set. Tetap tak hardcoded nama — string dari config.
- Cross-fase: F28 (normalizePromptNotes) jamin input malformed → []; F29 (presets) bawa promptNotes file-level; F2/F4 tak sentuh.
- Bukti: 21-29.

### E.2 — Kontrak byte-identik saat flag OFF
- CLAUDE.md:127 janji experiment flags default OFF → factory byte-identik. Verify di sini:
  - `narrativeProfile` OFF → null → skip (117+157). OK.
  - `convictionHint` OFF → null → skip. OK.
  - `weightsSummary` param `?? null` → null skip. OK.
- TAPI `timeProfile` (115) **selalu ON** — bukan experiment. Prompt byte-identik saat adaptiveScreening + experiments all off, TAPI timeProfile block muncul selama lessons data ada. Kontrak CLAUDE.md eksplisit hanya utk `experiments` GRUP16 — `timeProfile` tidak masuk experiments (F22 internal feature). Sesuai kontrak (bukan exception). Open-Q #3 bawa ke F22.
- Bukti: 115, 117, 121-123, 157.

### E.3 — DUPLICITAS MANAGER branch
- Early return di 35-52 membentuk MANAGER dedicated compact. `else if (agentType === "MANAGER")` di 159-174 jadi **unreachable** karena early return. Block INSTRUCTION CHECK + BIAS-TO-HOLD mati.
- INSTRUCTION CHECK masih ditegakkan via prompt early-return? Tidak — early return (35-52) hanya 3 BEHAVIORAL CORE + racikan/lessons. Tidak ada INSTRUCTION CHECK rule.
- Mitigasi: instructions also handled mekanis di F3 priority (index.js:554 INSTRUCTION), jadi prompt-level tak wajib. Tapi instruction-rule tak terdokumentasi di prompt MANAGER → LLM tak sadar harus compare instruction-first. Open-Q #1 bawa verify dengan F2.
- Bukti: 35-52, 159-174.

### E.4 — PREEMPT warn `fees_sol` namun tidak semua gate SCREENER prompt
- Prompt ucap `fees_sol < minTokenFeesSol → SKIP` (132) dan `bots > maxBotHoldersPct% → already hard-filtered` (133). TAPI `minBundlersPct`/`maxTop10Pct` gejala dst tak semuanya di HARD RULE; `maxTop10Pct` muncul di RISK SIGNALS (136) sebagai guideline.
- `minMcap`/`maxMcap`/`maxTvl` tak di prompt. Enforced pre-LLM di screening (F14). Konsisten: hard gate di kode, soft di prompt hanya utk judgment call.
- Bukti: 131-139.

### E.5 — `s = config.screening` unused
- prompt.js:32 deklarasi `const s = config.screening` tak pernah dibaca. `config.screening.timeframe` (110), `config.screening.minTokenFeesSol` (132) pakai `config.screening` langsung. Dead var. Open-Q #4.
- Bukti: 32.

### E.6 — Eksperimen `convictionSizing` label sinkron
- Prompt label "(conviction) ±N% and ALWAYS within your min/max" (122) — sejajar dengan `applyConvictionSizing` di config.js re-clamp `[deployAmountSol, maxDeployAmount]` (CLAUDE.md:138). Inert bila off, applied bila on. Kontrak ditegakkan: prompt beri tahu model, kode mekanis re-clamp.
- Bukti: 121-123, cross-ref F27.

### E.7 — `decisionSummary` hanya render basePrompt
- Block RECENT DECISIONS (77-80) hanya muncul di `basePrompt` (SCREENER+GENERAL+else-if; bukan MANAGER-early). General asks "why did you deploy?" → rujukan keputusan draft. MANAGER cron tak butuh (tak decide why deploy).
- Sinkron: `getDecisionSummary` (decision-log.js F23) dipanggil F4:229 setiap call. Bila tak ada decisions recent → null → block skip. Fail-open.
- Bukti: 77-80.

## §F. Glosarium fase

- **buildSystemPrompt**: factory tiga-cabang render system prompt per role.
- **racikanRules(role)**: render promptNotes per-role jadi HARD block RACIKAN RULES.
- **HARD-block precedence**: RACIKAN RULES > soft guideline; < HARD RULE + mechanical safety.
- **byte-identik factory**: flag-experiments OFF → prompt tak ubah byte (selain `timeProfile` karena bukan experiments, dan lessons/weights bila data null).
- **timeProfile**: time-of-day profile (F22) — selalu jalan, BUKAN eksperimen.
- **narrativeProfile**: gated `experiments.narrativeProfileSignal`.
- **convictionHint**: gated `experiments.convictionSizing`.
- **INTENT-DISAMBIG**: prompt rule utk bedakan "ubah deploy jadi 0.3" (settings) vs "deploy 0.3" (trade).
- **OVERRIDE-RULE**: explicit user params override lessons/default.
- **UNTRUSTED-DATA**: narrative/pool memory dst tak bisa inject instruction.
- **PARALLEL-FETCH**: utk deploy manual, batch 4 recon tool sekali step.
- **POST-DEPLOY-INTERVAL**: SCREENER post-deploy auto-reconfig managementIntervalMin per vol.
- **MANAGER-early**: short-circuit prompt (35-52) utk cron compact.
- **MANAGER-elif backup (unreachable)**: INSTRUCTION CHECK block 159-174.

## §G. Open-Q (bawa ke F2/F6/F22/F28)

1. **[F2/F5 verify]** `else if (agentType === "MANAGER")` (159-174) unreachable karena early return (35). INSTRUCTION CHECK (163) tidak terdokumentasi di MANAGER-early prompt. Apakah INSTRUCTION tetap ditegakkan mekanis tanpa prompt SOP? Lihat F3 priority (index.js:554 `else if (p.instruction)`). Verify sinkron instruksi tak hilang.
2. **[F6]** Tool `update_config` schema — `convictionSizingMaxAdjustPct` kalau tak masuk Grup 8 (adjust) → tak bisa `/setcfg` modify. Cross-ref F6.
3. **[F22]** `getTimeProfileForPrompt` selalu ON (115). Apakah bisa di-toggle? CLAUDE.md:151 sebut time-profile SCREENER soft brake. Kontrak byte-identik tanpa eksperimen-off — valid? Bawa ke F22 reasoning.
4. **[F5死角]** `s = config.screening` (32) dead var. Cleanup? Aman dilewati.
5. **[F28]** `normalizePromptNotes` kontrak malformed → [] — apakah handle `promptNotes: "string"` non-array? Handle nested wrong-key object seperti `{SCREENER: [...], MANAGER: [...]}` (kapital)? Verify di F28.
6. **[F6]** `get_position_pnl` di schema MANAGER — apakah prompt MANAGER instruksi panggil utk compare instruction condition? Tidak eksplisit di early (35-52). Cross-F6+F3.
7. **[F30]** INTENT-DISAMBIG (180-182) prompt rule — verifikasiinten LLM mematuhi di manual GENERAL chat. Sample log? Open-Q utk F30.
8. **[F2-F5]** POST-DEPLOY-INTERVAL (89-92) prompt SCREENER menyuruh model `update_config management.managementIntervalMin`gotar opsete vol ke deploynya. Berarti SCREENER punya akses `update_config`? Bukan di `SCREENER_TOOLS` (F4:15). Siklus: SCREENER `-free` tak bisa update_config. Caput vrangin post-deploy automatic? Verify F6 tool filter + F7 executor write-gate. Open-Q.

## §H. Cross-ref fase lain

- **F4**: `agentLoop` (agent.js:238) memanggil `buildSystemPrompt`; ctx+lessons/weights/decision di-prepare upstream.
- **F22**: `getTimeProfileForPrompt` + `getNarrativeProfileForPrompt` + `getLessonsForPrompt` + `getPerformanceSummary` sumber data.
- **F27**: `convictionSizing` + `narrativeProfileSignal` flags eksperimen + `applyConvictionSizing` re-clamp mekanis (cross-F8 update_config path).
- **F28**: `update_config` mutasi `managementIntervalMin` (post-deploy SCREENER) → `reloadScreeningThresholds` re-baca runtime. SCREENER_TOOLS tak berisi `update_config` — potensial beda jalur (force cron? ADMIN chat?).
- **F6**: tool schema yang muncul di prompt SCREENER hanya `SCREENER_TOOLS` subset. `update_config` tak ada → POST-DEPLOY-INTERVAL prompt line misleading?
- **F8**: `update_config` full-sync 6-surface tidak sentuh prompt SOP ini — prompt terpisah, promptNotes lewat config snapshot.
- **F30**: GENERAL interactive path pakai prompt ini; INTENT-DISAMBIG/PVP-RULE/OVERRIDE-RULE khusus GENERAL.
- **F2**: SCREENER prompt di sini dirakit HASIL tergantung flag-experiment + timeProfile; F2:1032 panggil + anti-hallucination guard (F2:1120) parse output.

*F5 selesai 2026-07-06. Read-only. Kode/config tak diubah saat menyusun.*