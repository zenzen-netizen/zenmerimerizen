# Audit F22 — Profile + lesson prompt (mandatory deep) — mode-scoped lesson/profile injection ke prompt
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: satu-satunya chokepoint mode-scoped read untuk SEMUA consumer user-facing (`getModePerformance` lessons.js:963 `isPaperMode ? paper : !paper` + `keepActiveRacikan` + `!suspect_pnl` → /report, milestone, briefings, getHourlyProfile, getNarrativeProfile, getPerformanceSummary); 2 profile system paralel (Time-of-day WIB 5-session `getHourlyProfile`/`classifySession`/`getTimeProfileForPrompt` + Narrative 8-category `getNarrativeProfile`/`classifyNarrative`/`getNarrativeProfileForPrompt`), kedua-duanya soft-signal SCREENER-only NEVER override hard rules; `getLessonsForPrompt` 3-tier injection (Pinned/Role-matched/Recent) + paper filter (`!isPaperMode && !usePaperHistoryWhenLive → !l.paper`) + suspect filter (`!l.suspect`) + 3-cap (SCREENER/MANAGER 5/6/10 vs GENERAL 10/15/35) + outcome-priority sort + HIVEMIND section via `getSharedLessonsForPrompt`; prompt.js interpolation SCREENER-only (`timeProfile` selalu ON :115, `narrativeProfile` gated `experiments.narrativeProfileSignal` :117); agent.js consumer tunggal `:227` (semua 3 role lewat sini); tool handler `get_time_profile`/`get_narrative_profile` (executor.js:258-259 SCREENER+GENERAL); **paper/live isolation kontrak kunci lintas-fase** — F13 sediakan tag, F19 honor di record stamp, F22 honor di read chokepoint + prompt filter.
> Cross-ref: F19 (recordPerformance paper:true tag + suspect_pnl stamp + keepActiveRacikan chokepoint + 7 consumer honor tag), F13 (paper/live isolation contract — F13 tag sediakan, F22 konsumen read), F20 (evolveThresholds summary lesson push 560 → feed getLessonsForPrompt), F21 (Darwin getWeightsSummary SCREENER-only prompt injection paralel), F5 (prompt.js buildSystemPrompt SCREENER block + racikanRules + weightsSummary), F4 (agent.js agentLoop consumer tunggal + role gating), F25 (briefing getModePerformance + getHourlyProfile + paper_ prefix detection), F24 (reports.js computeTradeStats + classifySession/ classifyNarrative weak-bucket recs), F26 (config.activeSetup racikan isolation + config.experiments narrativeProfileSignal/usePaperHistoryWhenLive), F8 (full-sync 6-surface — narrativeProfileSignal + usePaperHistoryWhenLive ter-registered CONFIG_MAP executor.js:488/498), F29 (preset applyPreset swap file → activeSetup berubah → getModePerformance re-scope otomatis).

## Ringkasan eksekutif (5 baris)
1. **1 chokepoint mode-scoped read + 2 profile system + 1 lesson injection + 1 prompt consumer**. `getModePerformance()` `lessons.js:963-973` = satu-satunya chokepoint read untuk SEMUA user-facing consumer: `isPaperMode() ? all.filter(p.paper) : all.filter(p => !p.paper)` (964-967) lalu `.filter(p => keepActiveRacikan(p) && !p.suspect_pnl)` (972). `keepActiveRacikan(p)` `:893-895` = `(p?.active_setup ?? null) === (config.activeSetup ?? null)` — future-proof, switching racikan auto-isolates. Dipakai: `getHourlyProfile` (1050), `getNarrativeProfile` (1155), `getPerformanceSummary` (1012 — pakai filter identik inline), `getExcludedRacikanStats` (998 — kebalikan racikan), `getSuspectCount` (984 — kebalikan suspect), briefing.js (246/337/453), reports.js (496/501), index.js milestone (238/352/3175/3212/3695). `getLifetimePerformance` `:926` + `getPerformanceForRacikan` `:936` + `listRacikanInPerformance` `:945` = bypass getModePerformance (display-only tier `/report all` + `/report <racikan>` + `/report setups`) — ketiganya `!p.paper` hard, tak racikan-scoped (kecuali getPerformanceForRacikan by-name).
2. **2 profile system paralel, kedua soft-signal SCREENER-only NEVER override hard rules**. (a) **Time-of-day WIB**: `getHourlyProfile` `:1046-1093` bucket 5 session (`dini 00-06/pagi 06-11/siang 11-15/sore 15-19/malam 19-24`, `SESSIONS :51-57`), per-session `count/win_rate_pct/avg_pnl_pct/avg_hold_min`, overall win-rate + avg-hold, `MIN_SESSION_SAMPLES=8` (`:60`). `classifySession` `:1109-1116` → `weak | ok | insufficient` (weak = win-rate ≥15pp under overall AND avg PnL negatif). `getTimeProfileForPrompt` `:1123-1141` satu-baris note SCREENER (current session + verdict + hold time), null bila <8 sampel. (b) **Narrative 8-category**: `getNarrativeProfile` `:1153-1192` bucket `NARRATIVE_CATEGORIES` `:66` = `[animal,ai,political,celebrity,meme,culture,tech_utility,other]`, per-category `count/win_rate_pct/avg_pnl_pct` sort desc by avg-pnl, `MIN_NARRATIVE_SAMPLES=8` (`:69`). `classifyNarrative` `:1200-1207` mirror classifySession. `getNarrativeProfileForPrompt` `:1215-1229` best+worst+overall line, null bila <8 sampel-tagged. Kedua profile baca `getModePerformance()` (mode-scoped + racikan-scoped + !suspect) lalu filter tambahan (`open_session && isFiniteNum(pnl_pct)` / `NARRATIVE_CATEGORIES.includes(p.narrative_category) && isFiniteNum(p.pnl_pct)`).
3. **`getLessonsForPrompt` 3-tier + 3-cap + paper/suspect filter**. `:754-830`. Filter pra-tier: `!isPaperMode && !usePaperHistoryWhenLive → !l.paper` (765-766), `!l.suspect` (770, both mode). Cap per-role: `isAutoCycle = SCREENER||MANAGER` → PINNED_CAP=5, ROLE_CAP=6, RECENT_CAP=10; GENERAL → 10/15/35 (`:775-777`). Tier 1 Pinned: `l.pinned && (!l.role || l.role===agentType || GENERAL)` `:784-787`. Tier 2 Role-matched: `roleOk && tagOk` via `ROLE_TAGS` `:737-741` (SCREENER 10 tag screening/narrative/strategy/..., MANAGER 10 tag management/risk/oor/..., GENERAL []) `:793-803`. Tier 3 Recent fill: sort `created_at` desc, slice remaining budget `:809-814`. Outcome-priority sort `:779` `{bad:0,poor:1,failed:1,good:2,worked:2,manual:1,neutral:3,evolution:2}`. HIVEMIND section via `getSharedLessonsForPrompt` `:817-820` (hivemind.js:152, returns null bila HIVE_MIND_URL absent). Format `fmt` `:832-839`: `[OUTCOME] [date] rule` dengan prefix `📌 ` pinned + `🧪 ` paper. Return string gabungan 4 section atau null bila kosong.
4. **Prompt injection SCREENER-only, 2 gated + 1 always-ON**. prompt.js `buildSystemPrompt` `:31`. MANAGER prompt singkat `:35-52` — lessons di-inject `:50` tanpa timeProfile/narrativeProfile/weightsSummary (MANAGER tak lihat profile — correct, profile = screening-side signal). SCREENER block `:114-158`: `timeProfile = getTimeProfileForPrompt()` `:115` **selalu ON** (NOT eksperimen — soft brake CLAUDE.md:261), `narrativeProfile = config.experiments?.narrativeProfileSignal ? getNarrativeProfileForPrompt() : null` `:117` (gated eksperimen default OFF), `convictionHint` `:121` (gated eksperimen lain), `weightsSummary` `:157` (gated `darwin.enabled`, F21). Interpolasi `${timeProfile ? ... : ""}${narrativeProfile ? ... : ""}${convictionHint ? ... : ""}${weightsSummary ? ... : ""}${lessons ? ... : ""}` `:157` — null → skip. GENERAL block `:175-197`: hanya `racikanRules("general")`, tak inject timeProfile/narrative/weights (correct). agent.js consumer tunggal `:227` `getLessonsForPrompt({agentType})` + `:228` `getPerformanceSummary()` + `:229` `getDecisionSummary()` + `:230-237` `weightsSummary` (SCREENER-only) → `buildSystemPrompt` `:238`. index.js `runScreeningCycle :1028` juga call `getWeightsSummary()` terpisah (gated `darwin.enabled`) — tapi TIDAK call getLessonsForPrompt di sana (injection cuma via agent.js agentLoop).
5. **Live saat audit: 365 record (272 mainzen_v2_1 + 93 mainzen_v2), 0 paper, 0 suspect, 149 lessons (4 evolution)**. activeSetup=`mainzen_v2_1` → getModePerformance return 272 record (filter racikan aktif). Session distribution (semua ≥8 sampel): malam 82, dini 81, pagi 84, siang 59, sore 59 → `getTimeProfileForPrompt` AKTIF (current session selalu punya stats). Narrative distribution: 294 record tagged, 6 category ≥8 sampel (meme 119/tech_utility 58/animal 47/culture 32/ai 15/other 13), 2 category <8 (political 3/celebrity 4) → `getNarrativeProfileForPrompt` AKTIF bila flag ON (6 category qualify). **3 record orphan category** (`game` 1 + `game_utility` 2, mainzen_v2_1, deployed 2026-06-23/26, FARM-SOL + VALORA-SOL) — di luar `NARRATIVE_CATEGORIES` enum + definitions.js:200 enum identik — SCREENER emit out-of-enum value, executor tak validate enum strictly, silently dropped dari `getNarrativeProfile` (filter `NARRATIVE_CATEGORIES.includes`). experiments saat audit: `narrativeProfileSignal=undefined` (OFF) → narrative line NOT di-inject; `usePaperHistoryWhenLive=undefined` (OFF) → paper lessons filtered (0 paper lessons anyway). `learning={}` (evolveEnabled unset → default); `darwin=undefined` (default true via config.js:318).

## Progress
- [x] Spec F22 baca PLAN-audit-meridian.md Bagian 3 line 115
- [x] Cross-ref F19 (recordPerformance paper tag + keepActiveRacikan + 7 consumer honor), F13 (isolation contract), F20 (summary lesson feed), F21 (weightsSummary paralel), F5 (prompt.js buildSystemPrompt), F4 (agent.js consumer), F25 (briefing consumer), F24 (reports.js weak-bucket recs), F26 (config.activeSetup + experiments), F8 (full-sync CONFIG_MAP)
- [x] Baca lessons.js 1-100 (SESSIONS/MIN_SESSION_SAMPLES/MIN_NARRATIVE_SAMPLES/NARRATIVE_CATEGORIES/currentWibSession/sessionLabel/wibHour/sessionForHour)
- [x] Baca lessons.js 570-584 (isFiniteNum/avg/clamp helpers)
- [x] Baca lessons.js 730-741 (ROLE_TAGS 3-role map)
- [x] Baca lessons.js 754-839 (getLessonsForPrompt 3-tier + fmt)
- [x] Baca lessons.js 880-1035 (keepActiveRacikan + getAllPerformance + getArchivedPerformance + getLifetimePerformance + getPerformanceForRacikan + listRacikanInPerformance + getModePerformance + getSuspectCount + getExcludedRacikanStats + getPerformanceSummary)
- [x] Baca lessons.js 1040-1229 (getHourlyProfile + fmtHoldMin + classifySession + getTimeProfileForPrompt + getNarrativeProfile + classifyNarrative + getNarrativeProfileForPrompt)
- [x] Baca prompt.js full 1-201 (buildSystemPrompt 3-role + racikanRules + SCREENER injection 115/117/157 + MANAGER singkat + GENERAL block)
- [x] Baca agent.js 100-130 (imports) + 215-264 (agentLoop consumer 227-238)
- [x] Baca index.js 1015-1054 (runScreeningCycle weightsSummary :1028 — TIDAK call getLessonsForPrompt di sini)
- [x] Baca executor.js 250-269 (get_time_profile/get_narrative_profile tool handler) + 488/498 (CONFIG_MAP experiments narrativeProfileSignal/usePaperHistoryWhenLive)
- [x] Baca definitions.js 195-211 (narrative_category enum identik NARRATIVE_CATEGORIES)
- [x] Baca reports.js 490-519 (weak session/narrative recs via classifySession/classifyNarrative)
- [x] Baca briefing.js 240-264 (buildTimeProfileSection getHourlyProfile + shrink-rank K=5) + 445-459 (paper_ prefix detection + getModePerformance window)
- [x] Verifikasi live lessons.json: 365 record (272 mainzen_v2_1 + 93 mainzen_v2), 0 paper, 0 suspect, session distribution (5/5 ≥8), category distribution (6/8 ≥8), 3 orphan category (game/game_utility), 149 lessons (4 evolution)
- [x] Verifikasi user-config.json live: activeSetup=mainzen_v2_1, learning={}, darwin=undefined, narrativeProfileSignal=undefined (OFF), usePaperHistoryWhenLive=undefined (OFF)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Pelatih yang baca buku catatan pertandingan lalu coret papan strategi sebelum match*: tiap 5 pertandingan, asisten kumpulin hasil (menang/kalah, jam main, lawan tipe apa). Pelatih baca buku dua bab: (a) bab "Jam Main" — kalau main malam win-rate 40% vs overall 55%, pelatih coret papan "jaga ekstra kalau match malam, skip kalau lawan marginal". (b) bab "Tipe Lawan" — kalau vs tipe `meme` avg PnL +3%, vs `political` −8%, pelatih coret "favorit `meme`, ketat vs `political`". Coretan = soft reminder, BUKAN aturan taktik (pemain tetap main skema training). Konsep sama: getHourlyProfile + getNarrativeProfile = dua bab buku catatan, getTimeProfileForPrompt + getNarrativeProfileForPrompt = coretan papan, prompt SCREENER = papan strategi, hard rules = skema training (tak teroverride coretan).
- *Editor resep restaurant yang filter ulasan per-sesi + per-tag*: restaurant punya 365 ulasan tamu (mainzen_v2_1). Editor BUKAN baca semua ulasan campur — dia filter: (a) hanya tamu dinner saat ini (mode = dinner service, bukan brunch lama), (b) hanya tamu reservasi nama "mainzen_v2_1" (racikan aktif, bukan tamu racikan lama mainzen_v2), (c) exclude ulasan "suspect" (pelayan lapor data rusak, belum verifikasi). Setelah filter → 272 ulasan bersih. Editor baru susun dua laporan: per-jam-makan (lunch/dinner/supper) + per-tag-menu (meme/ai/political). Laporan = soft hint ke chef: "malam kurang performa, jangan over-promo". Chef tetap ikut resep utama (hard rule). Konsep sama: getModePerformance = filter 3-lapis (paper/live + racikan + suspect), getHourlyProfile/getNarrativeProfile = dua laporan terpisah, prompt injection = hint ke SCREENER, hard rules tak tersentuh.

**Di bot, ini = mode-scoped performance read + 2 profile system + lesson injection ke prompt** (1-2 kalimat)
`getModePerformance()` `lessons.js:963` = satu-satunya chokepoint read untuk SEMUA consumer user-facing — filter 3-lapis (paper/live + active-racikan + !suspect). Dari sini lahir 2 profile (`getHourlyProfile` WIB 5-session + `getNarrativeProfile` 8-category) yang render soft-signal note ke prompt SCREENER via `getTimeProfileForPrompt`/`getNarrativeProfileForPrompt`. `getLessonsForPrompt` `:754` = lesson injection 3-tier (Pinned/Role-matched/Recent) + 3-cap per-role — baca `lessons.json.lessons[]` (diisi recordPerformance F19 + evolve summary F20), filter paper/suspect, inject ke prompt semua role via agent.js:227.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F19 (recordPerformance push entry + lesson + signal_snapshot), SETELAH F20 (evolveThresholds push summary lesson ke lessons[]), SETELAH F21 (Darwin recalcWeights + getWeightsSummary). Sebelum F5 (prompt.js interpolation), F4 (agent.js agentLoop consumer), F25 (briefing display), F24 (reports.js recs). F22 = JANTUNG mode-scoped read + prompt feeder: tiap consumer user-facing (report/briefing/milestone/profile/lesson-prompt) BACA via getModePerformance, tiap prompt build (agent.js:227 → buildSystemPrompt) INJECT lessons + profile. Tanpa F22, paper data bisa kontaminasi live stats, racikan lama campur racikan aktif, suspect bad-data steer prompt, SCREENER buta waktu-tipe tanpa data historis. F22 = lapisan "baca bersih +Inject soft" di atas data F19.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Consumer read trigger**: `agentLoop` `agent.js:222` dipanggil (SCREENER/MANAGER/GENERAL) → `getLessonsForPrompt({agentType})` `:227` + `getPerformanceSummary()` `:228` + `getDecisionSummary()` `:229`. Atau consumer lain: briefing.js (246/337/453), reports.js (496/501), index.js milestone (238/352/3175/3212/3695), `/report`/`/status`/`/evolve` via getModePerformance/getPerformanceSummary.
2. **getModePerformance filter 3-lapis** `:963-973`: load `lessons.json.performance[]` → `isPaperMode() ? paper : !paper` (964-967) → `.filter(keepActiveRacikan && !p.suspect_pnl)` (972). Return array bersih.
3. **getLessonsForPrompt filter pra-tier** `:760-771`: load `lessons.json.lessons[]` → `!isPaperMode && !usePaperHistoryWhenLive → !l.paper` (765-766) → `!l.suspect` (770, both mode). Empty → return null.
4. **Cap determine** `:774-777`: `isAutoCycle = SCREENER||MANAGER` → `PINNED_CAP=5, ROLE_CAP=6, RECENT_CAP=10`; GENERAL → `10/15/35`.
5. **Tier 1 Pinned** `:784-787`: `l.pinned && (!l.role || l.role===agentType || GENERAL)`, sort byPriority (outcome priority map), slice PINNED_CAP. `usedIds` Set track.
6. **Tier 2 Role-matched** `:792-803`: `roleOk` (no role / match / GENERAL) AND `tagOk` (`ROLE_TAGS[agentType]` includes lesson tag OR lesson no tags). `ROLE_TAGS` `:737-741`: SCREENER 10 tag, MANAGER 10 tag, GENERAL []. Sort byPriority, slice ROLE_CAP. Add to usedIds.
7. **Tier 3 Recent fill** `:808-814`: `remainingBudget = RECENT_CAP - pinned - roleMatched`. Bila >0 → filter `!usedIds`, sort `created_at` desc, slice remainingBudget.
8. **HIVEMIND section** `:817-820`: `getSharedLessonsForPrompt({agentType, maxLessons: isAutoCycle?4:6})` (hivemind.js:152). Returns null bila HIVE_MIND_URL absent (factory). Add to sections.
9. **Format + return** `:823-829`: sections = `[── PINNED ──, ── <ROLE> ──, ── RECENT ──, ── HIVEMIND ──]` (skip empty). `fmt` `:832-839`: `${pin}${sim}[OUTCOME] [date] rule`. Return joined string or null.
10. **Profile read (SCREENER-only path)**: prompt.js `buildSystemPrompt` `:114` SCREENER block → `timeProfile = getTimeProfileForPrompt()` `:115` (always ON) → `getHourlyProfile()` `:1046` → `getModePerformance().filter(open_session && isFiniteNum(pnl_pct))` `:1050` → bucket 5 session → overall + per-session stats → return null bila `total_with_open_time < MIN_SESSION_SAMPLES=8` `:1125` → else current session verdict line. `narrativeProfile` `:117` gated `experiments.narrativeProfileSignal` → bila ON `getNarrativeProfileForPrompt()` `:1215` → `getNarrativeProfile()` `:1153` → `getModePerformance().filter(NARRATIVE_CATEGORIES.includes(p.narrative_category) && isFiniteNum(pnl_pct))` `:1155-1156` → bucket 8 category → null bila `total_with_category < MIN_NARRATIVE_SAMPLES=8` `:1217` or no category ≥8 `:1220` → else best+worst+overall line.
11. **Build system prompt** `agent.js:238`: `buildSystemPrompt(agentType, portfolio, positions, stateSummary, lessons, perfSummary, weightsSummary, decisionSummary)` → prompt.js:31 → MANAGER singkat (lessons only) / SCREENER block (timeProfile+narrativeProfile+convictionHint+weightsSummary+lessons) / GENERAL block (racikanRules only, no profile).
12. **LLM consume**: system prompt + user goal → OpenAI/OpenRouter/fallback → tool calls atau final text. Lessons + profile mengaruhi KEPUTUSAN soft (skip marginal candidate di weak session, favor strong narrative), NEVER override HARD RULE (`fees_sol < minTokenFeesSol → SKIP` executor.js, bin_step range, maxPositions, dll).
13. **Downstream after close**: recordPerformance (F19) push entry + lesson → next `getModePerformance`/`getLessonsForPrompt` cycle lihat data baru → profile/lesson evolve. Tiap 5 close LIVE → evolveThresholds (F20) push summary lesson `outcome:"manual" tags:["evolution","config_change"]` → masuk Tier 2/3 getLessonsForPrompt → inject prompt. Darwin (F21) recalc weights → getWeightsSummary SCREENER injection paralel.

**Output getModePerformance/getLessonsForPrompt**: array performance bersih / string lessons terformat. Side-effect: null (pure read, tak mutate file). Trigger ke fase berikut: consumer (agent.js prompt build, briefing/reports/index display) baca hasil → render prompt/stats.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
`getModePerformance` throw → consumer catch? briefing.js:246 tak visible try-catch (fail-open via `if (!prof || prof.total_with_open_time < prof.min_samples) return null` di `buildTimeProfileSection`), reports.js:495-504 wrap `try { } catch { /* fail-open */ }`, agent.js:227 tak visible try-catch (kalau throw → agentLoop crash → caller catch di runManagementCycle/runScreeningCycle). `lessons.json` corrupt → `load()` parse-fail return default `{lessons:[],performance:[]}` (lessons.js:106-119 fail-open) → semua consumer return null/empty → prompt kosong lessons/profile (factory). `getLessonsForPrompt` filter paper salah → paper kontaminasi live prompt: bila `isPaperMode()` true padahal live (DRY_RUN leak), paper lessons masuk prompt → SCREENER steer berdasar sim data (cross-mode bug — F13 mitigation). `narrativeProfileSignal` ON tapi `narrative_category` enum tak sync (definitions.js vs NARRATIVE_CATEGORIES lessons.js) → SCREENER emit out-of-enum → record tagged invalid → silently dropped dari profile (LIVE temuan: 3 record `game`/`game_utility`).

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **getModePerformance** — mode-scoped read chokepoint `lessons.js:963`. `isPaperMode ? paper : !paper` + `keepActiveRacikan` + `!suspect_pnl`. Dipakai semua consumer user-facing.
- **keepActiveRacikan** — `(p?.active_setup ?? null) === (config.activeSetup ?? null)` `:893`. Isolasi per-racikan, future-proof (switching activeSetup auto re-scope).
- **getLifetimePerformance** — `/report all` tier, archive+live `!paper`, NOT racikan-scoped (display-only mixed).
- **getPerformanceForRacikan** — `/report <racikan>` tier, `!paper` + `active_setup===name` by-name (bukan active).
- **listRacikanInPerformance** — distinct racikan names di live perf (untuk `/report setups`), skip paper.
- **getExcludedRacikanStats** — disclosure stats: live closed HELD OUT getModePerformance purely by racikan-scoping (different active_setup). `{count, net_usd}`. Display-only anti silent-hide.
- **getSuspectCount** — suspect (≤−90% non-stopLoss) closed count in current mode+racikan. Drives `/report ⚠️ Suspect` line.
- **getHourlyProfile** — time-of-day WIB 5-session bucket `:1046`. Per-session `count/win_rate_pct/avg_pnl_pct/avg_hold_min`. Source: getModePerformance + `open_session && isFiniteNum(pnl_pct)`.
- **SESSIONS** — 5 coarse bucket WIB `:51-57`: dini 00-06, pagi 06-11, siang 11-15, sore 15-19, malam 19-24. Coarse bukan 24-jam (sparse data stabil).
- **MIN_SESSION_SAMPLES** — konstanta 8 `:60`. Gate sebelum session steer prompt/interval. <8 = neutral.
- **classifySession** — `weak | ok | insufficient` `:1109`. weak = win-rate ≥15pp under overall AND avg PnL negatif.
- **getTimeProfileForPrompt** — 1-line SCREENER note `:1123`. Current session + verdict + hold time. Null bila <8. ALWAYS ON (not experiment).
- **getNarrativeProfile** — 8-category bucket `:1153`. Per-category `count/win_rate_pct/avg_pnl_pct` sort desc. Source: getModePerformance + `NARRATIVE_CATEGORIES.includes && isFiniteNum(pnl_pct)`.
- **NARRATIVE_CATEGORIES** — 8 enum `:66` = `[animal,ai,political,celebrity,meme,culture,tech_utility,other]`. KEEP IN SYNC dengan definitions.js:200 enum.
- **MIN_NARRATIVE_SAMPLES** — konstanta 8 `:69`. Mirror MIN_SESSION_SAMPLES.
- **classifyNarrative** — `weak | ok | insufficient` `:1200`. Mirror classifySession.
- **getNarrativeProfileForPrompt** — best+worst+overall SCREENER line `:1215`. Null bila <8 atau no category ≥8. Gated `experiments.narrativeProfileSignal`.
- **getLessonsForPrompt** — 3-tier lesson injection `:754`. Pinned/Role-matched/Recent + 3-cap per-role + paper/suspect filter. Return string atau null.
- **ROLE_TAGS** — map role→tag list `:737`. SCREENER 10 tag, MANAGER 10 tag, GENERAL []. Drives Tier 2 role-matching.
- **outcomePriority** — sort map `:779` `{bad:0,poor:1,failed:1,good:2,worked:2,manual:1,neutral:3,evolution:2}`. Drives Tier 1+2 priority.
- **PINNED_CAP/ROLE_CAP/RECENT_CAP** — lesson cap per-role `:775-777`. SCREENER/MANAGER 5/6/10, GENERAL 10/15/35.
- **usePaperHistoryWhenLive** — LIVE-only opt-in experiment. ON → paper lessons inject dgn 🧪 flag, excluded evolve/weights/reports/hive. OFF (factory) → `!l.paper` filter.
- **narrativeProfileSignal** — experiment flag gating narrative prompt line. OFF (factory) → line skip, tagging tetap collected passively.
- **paper_ prefix detection** — briefing.js:445 `String(p.position||"").startsWith("paper_")` — state.json rows carry no paper flag, detect via id prefix. Cross-store isolation (state.json vs lessons.json performance).
- **shrink-rank K=5** — briefing.js:258 fair-rank session PnL: `(avg×count + K×globalAvg)/(count+K)`. 2-sample 100% tak outrank well-sampled solid.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A — Peta file fase ini

| File | Peran | Baris kunci |
|------|-------|-------------|
| `lessons.js` (1229) | **Funnel utama**: getModePerformance chokepoint + 2 profile system + getLessonsForPrompt 3-tier + keepActiveRacikan + suspect/racikan disclosure + getPerformanceSummary | 51-69 SESSIONS/NARRATIVE_CATEGORIES/MIN_*; 86-93 currentWibSession/sessionLabel; 574 isFiniteNum; 737-741 ROLE_TAGS; 754-830 getLessonsForPrompt; 832-839 fmt; 893-895 keepActiveRacikan; 899-901 getAllPerformance; 910-919 getArchivedPerformance; 926-929 getLifetimePerformance; 936-942 getPerformanceForRacikan; 945-954 listRacikanInPerformance; 963-973 getModePerformance; 981-985 getSuspectCount; 995-1002 getExcludedRacikanStats; 1007-1035 getPerformanceSummary; 1046-1093 getHourlyProfile; 1096-1099 fmtHoldMin; 1109-1116 classifySession; 1123-1141 getTimeProfileForPrompt; 1153-1192 getNarrativeProfile; 1200-1207 classifyNarrative; 1215-1229 getNarrativeProfileForPrompt |
| `prompt.js` (201) | **Prompt builder**: buildSystemPrompt 3-role + racikanRules + SCREENER injection (timeProfile always + narrativeProfile gated + weightsSummary gated + convictionHint gated) + MANAGER singkat + GENERAL block | 13 import getTimeProfileForPrompt/getNarrativeProfileForPrompt; 21-29 racikanRules; 31 buildSystemPrompt; 35-52 MANAGER; 114-158 SCREENER; 115 timeProfile; 117 narrativeProfile gated; 121-123 convictionHint; 157 interpolation; 159-174 MANAGER basePrompt extension; 175-197 GENERAL; 200 basePrompt timestamp |
| `agent.js` (535) | **Consumer tunggal**: agentLoop `:222` call getLessonsForPrompt + getPerformanceSummary + getDecisionSummary + weightsSummary (SCREENER) → buildSystemPrompt | 105 import getLessonsForPrompt/getPerformanceSummary; 227-229 lessons/perf/decision; 230-237 weightsSummary SCREENER-only dynamic import; 238 buildSystemPrompt |
| `index.js` (3906) | **runScreeningCycle weightsSummary** + milestone/report consumer | 238 milestone getModePerformance; 352 /report default; 1028 runScreeningCycle weightsSummary (TIDAK call getLessonsForPrompt di sini); 3175/3212/3695 pnlBlock formatPnlTracker getModePerformance |
| `tools/executor.js` (1104) | **Tool handler** get_time_profile/get_narrative_profile + CONFIG_MAP experiments | 14 import getHourlyProfile/getNarrativeProfile; 258 get_time_profile; 259 get_narrative_profile; 488 narrativeProfileSignal CONFIG_MAP; 498 usePaperHistoryWhenLive CONFIG_MAP |
| `tools/definitions.js` (1173) | **Tool schema** narrative_category enum + experiment flag list | 197-202 narrative_category enum (8 cat, KEEP IN SYNC NARRATIVE_CATEGORIES); 412 Experiments description list |
| `briefing.js` (557) | **Display consumer** + paper_ prefix detection | 5 import getHourlyProfile/getModePerformance/getExcludedRacikanStats; 246 buildTimeProfileSection getHourlyProfile; 337 generateBriefing getModePerformance; 445-447 paper_ prefix detection (state.json vs lessons.json); 453 racikanWindowPerf getModePerformance |
| `reports.js` (642) | **Stats + recs consumer** classifySession/classifyNarrative weak-bucket | 16 import getHourlyProfile/classifySession/getNarrativeProfile/classifyNarrative/sessionLabel; 496 getHourlyProfile weak sessions; 501 getNarrativeProfile weak narratives |
| `paper-trading.js` (216) | **isPaperMode** definition (dipakai getModePerformance 963 + getLessonsForPrompt 765) | 20 isPaperMode = `experiments.paperTrading && DRY_RUN` |
| `hivemind.js` (367) | **getSharedLessonsForPrompt** HIVEMIND section | 152 getSharedLessonsForPrompt (returns null bila HIVE_MIND_URL absent) |
| `config.js` (666) | **config.activeSetup** + config.experiments + config.darwin defaults | activeSetup re-baca reloadScreeningThresholds (F28); experiments default {}; darwin default enabled=true (F21) |

---

## §B — Alur data hulu→hilir

```
[close position] ──F19──> recordPerformance (lessons.js:156)
    │
    ├─ push performance[] (228)  + lesson (250)         [paper:true stamp, suspect_pnl stamp]
    ├─ F20 evolveThresholds (253) → push summary lesson (560)  [outcome:"manual", tags:["evolution","config_change"]]
    └─ F21 Darwin recalc (317) → signal-weights.json mutate

[consumer read trigger]
    │
    ├── agent.js:227 agentLoop ──────────────────> getLessonsForPrompt({agentType})
    │                                                   │
    │                                                   ├─ load() lessons.json
    │                                                   ├─ filter !paper (unless usePaperHistoryWhenLive) :765
    │                                                   ├─ filter !suspect :770
    │                                                   ├─ Tier 1 Pinned (5/10)            :784
    │                                                   ├─ Tier 2 Role-matched (6/15)      :792 (ROLE_TAGS)
    │                                                   ├─ Tier 3 Recent fill (10/35)      :808
    │                                                   ├─ HIVEMIND getSharedLessonsForPrompt :817
    │                                                   └─ return string or null
    │
    ├── agent.js:228 ────────────────────────────> getPerformanceSummary()
    │                                                   │
    │                                                   ├─ load() performance[]
    │                                                   ├─ filter keepActiveRacikan && !suspect_pnl :1012
    │                                                   └─ return {total_positions_closed, total_pnl_usd, roi_pct, avg_pnl_pct, win_rate_pct, total_lessons}
    │
    ├── prompt.js:115 SCREENER ──────────────────> getTimeProfileForPrompt()
    │                                                   │
    │                                                   ├─ getHourlyProfile() :1046
    │                                                   │     ├─ getModePerformance() :963
    │                                                   │     │     ├─ load() performance[]
    │                                                   │     │     ├─ isPaperMode ? paper : !paper :964-967
    │                                                   │     │     └─ keepActiveRacikan && !suspect_pnl :972
    │                                                   │     ├─ filter open_session && isFiniteNum(pnl_pct) :1050
    │                                                   │     ├─ bucket 5 SESSIONS (count/win_rate/avg_pnl/avg_hold)
    │                                                   │     └─ return {total_with_open_time, overall_win_rate_pct, sessions[]}
    │                                                   ├─ currentWibSession() :1127
    │                                                   ├─ classifySession(cur.key) :1133 → weak|ok|insufficient
    │                                                   └─ return 1-line note or null
    │
    ├── prompt.js:117 SCREENER (gated experiments.narrativeProfileSignal)
    │                                             └─> getNarrativeProfileForPrompt()
    │                                                   │
    │                                                   ├─ getNarrativeProfile() :1153
    │                                                   │     ├─ getModePerformance() :963
    │                                                   │     ├─ filter NARRATIVE_CATEGORIES.includes(p.narrative_category) && isFiniteNum(p.pnl_pct) :1155-1156
    │                                                   │     ├─ bucket 8 category (count/win_rate/avg_pnl) sort desc
    │                                                   │     └─ return {total_with_category, overall_win_rate_pct, categories[]}
    │                                                   ├─ filter count >= MIN_NARRATIVE_SAMPLES=8 :1219
    │                                                   └─ return best+worst+overall line or null
    │
    ├── agent.js:230-237 SCREENER (gated darwin.enabled) ─> getWeightsSummary() [F21]
    │
    └── consumer lain (bypass agent.js):
          ├─ briefing.js:246  buildTimeProfileSection → getHourlyProfile (shrink-rank K=5 display)
          ├─ briefing.js:337  generateBriefing → getModePerformance (24h trade-stats)
          ├─ briefing.js:453  racikanWindowPerf → getModePerformance (window filter)
          ├─ reports.js:496   weak sessions recs → getHourlyProfile + classifySession
          ├─ reports.js:501   weak narratives recs → getNarrativeProfile + classifyNarrative
          ├─ index.js:238     milestone → getModePerformance (mode-scoped)
          ├─ index.js:352     /report default → getModePerformance (active racikan)
          ├─ index.js:3175/3212/3695  pnlBlock → getModePerformance (formatPnlTracker)
          ├─ executor.js:258  get_time_profile tool → getHourlyProfile (SCREENER+GENERAL)
          └─ executor.js:259  get_narrative_profile tool → getNarrativeProfile (SCREENER+GENERAL)

[prompt build] ───────────────────────────────> buildSystemPrompt (prompt.js:31)
    │
    ├─ MANAGER (35-52): lessons only, NO profile, NO weights
    ├─ SCREENER (114-158): timeProfile (always) + narrativeProfile (gated) + convictionHint (gated) + weightsSummary (gated) + lessons + racikanRules("screener")
    └─ GENERAL (175-197): racikanRules("general") only, NO profile, NO weights

[LLM] → tool calls (deploy/close/claim/swap) atau final text
    │
    └─ soft signal influence: skip marginal di weak session, favor strong narrative, prioritas high-weight signal
       NEVER override HARD RULE (fees_sol, bin_step, maxPositions, single-side, range-floor, SOL balance)
```

---

## §C — Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| agent.js:227 | getLessonsForPrompt (lessons.js:754) | agentLoop tiap call (3 role) | `{agentType}` → string lessons or null | load() fail → default {} → return null (empty lessons) |
| agent.js:228 | getPerformanceSummary (lessons.js:1007) | agentLoop tiap call | — → summary obj or null | empty perf → return null |
| agent.js:230-237 | getWeightsSummary (signal-weights.js:299) [F21] | agentLoop SCREENER only | `config.darwin?.enabled` → string | try-catch `/* signal-weights not critical */` → null |
| prompt.js:115 | getTimeProfileForPrompt (lessons.js:1123) | buildSystemPrompt SCREENER | — → 1-line note or null | null → line skip (ternary) |
| prompt.js:117 | getNarrativeProfileForPrompt (lessons.js:1215) | buildSystemPrompt SCREENER gated flag | — → 1-line note or null | null → line skip (ternary) |
| prompt.js:157 | (interpolation) | buildSystemPrompt SCREENER | timeProfile/narrativeProfile/convictionHint/weightsSummary/lessons strings | null → skip |
| executor.js:258 | getHourlyProfile (lessons.js:1046) | tool `get_time_profile` (SCREENER+GENERAL) | — → profile obj | fail-open (returns obj with 0s) |
| executor.js:259 | getNarrativeProfile (lessons.js:1153) | tool `get_narrative_profile` (SCREENER+GENERAL) | — → profile obj | fail-open |
| lessons.js:1050 | getModePerformance (lessons.js:963) | getHourlyProfile body | — → perf array | load() fail → [] |
| lessons.js:1155 | getModePerformance (lessons.js:963) | getNarrativeProfile body | — → perf array | load() fail → [] |
| lessons.js:1012 | (inline filter keepActiveRacikan && !suspect_pnl) | getPerformanceSummary body | — → perf array | load() fail → [] |
| lessons.js:817 | getSharedLessonsForPrompt (hivemind.js:152) | getLessonsForPrompt Tier HIVEMIND | `{agentType, maxLessons}` → string or null | HIVE_MIND_URL absent → null |
| briefing.js:246 | getHourlyProfile (lessons.js:1046) | buildTimeProfileSection daily/periodic | — → profile obj | null → section skip |
| briefing.js:337 | getModePerformance (lessons.js:963) | generateBriefing daily | — → perf array | load() fail → [] |
| briefing.js:453 | getModePerformance (lessons.js:963) | periodic window perf | — → perf array (window filter) | load() fail → [] |
| reports.js:496 | getHourlyProfile + classifySession (lessons.js:1046/1109) | buildRecommendations weak-session recs | — → weak session labels | try-catch fail-open `/* fail-open */` |
| reports.js:501 | getNarrativeProfile + classifyNarrative (lessons.js:1153/1200) | buildRecommendations weak-narrative recs | — → weak narrative labels | try-catch fail-open |
| index.js:238 | getModePerformance (lessons.js:963) | milestone learning report | — → perf array | load() fail → [] |
| index.js:352 | getModePerformance (lessons.js:963) | `/report` default tier | — → perf array | load() fail → [] |
| index.js:3175/3212/3695 | getModePerformance (lessons.js:963) | `/wallet`/`/status`/`/report` pnlBlock | — → perf array (formatPnlTracker) | load() fail → [] |
| index.js:1028 | getWeightsSummary (signal-weights.js:299) [F21] | runScreeningCycle pre-deploy | `config.darwin?.enabled` → string | null → skip |
| lessons.js:1127 | currentWibSession (lessons.js:86) | getTimeProfileForPrompt | `date=new Date()` → session obj | — |
| lessons.js:1110/1201 | getHourlyProfile / getNarrativeProfile | classifySession / classifyNarrative | — → profile obj | recursive (memoize potential, UNKNOWN) |

---

## §D — Logika kunci per fungsi

### `getModePerformance()` (lessons.js:963-973) — mode-scoped read chokepoint
- **Apa**: return performance[] terfilter 3-lapis (paper/live + active-racikan + !suspect).
- **Kapan dipicu**: setiap consumer user-facing baca closed-position perf (agent.js prompt build via getPerformanceSummary, briefing, reports, index milestone/report/wallet/status, tool get_time_profile/get_narrative_profile via getHourlyProfile/getNarrativeProfile).
- **Output**: array performance records (0+ rows).
- **Sinkron**: single source of truth utk semua user-facing read. `getAllPerformance` `:899` = RAW (no filter, archival/debug). `getLifetimePerformance` `:926` = archive + live `!paper` (NOT racikan-scoped, `/report all`). `getPerformanceForRacikan` `:936` = `!paper` + `active_setup===name` by-name (`/report <racikan>`). `listRacikanInPerformance` `:945` = distinct racikan names (skip paper, `/report setups`).
- **Fail-mode**: `load()` parse-fail → default `{performance:[]}` (106-119) → return []. `isPaperMode()` leak (DRY_RUN true padahal live) → paper records masuk — mitigated by paper-trading.js `isPaperMode = experiments.paperTrading && DRY_RUN` (both must be true).
- **Bukti**: lessons.js:963-973; isPaperMode paper-trading.js:20; keepActiveRacikan :893-895.

### `keepActiveRacikan(p)` (lessons.js:893-895) — racikan isolation predicate
- **Apa**: `(p?.active_setup ?? null) === (config.activeSetup ?? null)`.
- **Kapan dipicu**: getModePerformance (972), getExcludedRacikanStats (998 kebalikan), getPerformanceSummary (1012 inline), recordPerformance livePerf filter (298, F19), evolveThresholds chokepoint (462, F20).
- **Output**: boolean.
- **Sinkron**: `config.activeSetup` re-baca `reloadScreeningThresholds` (config.js, F28) — switching racikan via preset `applyPreset` (F29) auto re-scope getModePerformance tanpa restart.
- **Fail-mode**: `p.active_setup` undefined → null. `config.activeSetup` undefined → null. null===null → true (record tanpa racikan match racikan-aktif-tanpa-nama). Future-proof: record lama pra-tagging (84 archive) `active_setup=null` match `config.activeSetup=null` — tapi archive di file terpisah (lessons-archive.json), tak masuk `load().performance` jadi tak affect.
- **Bukti**: lessons.js:893-895.

### `getLessonsForPrompt({agentType, maxLessons})` (lessons.js:754-830) — 3-tier lesson injection
- **Apa**: return string lessons terformat 3-tier (Pinned/Role-matched/Recent) + HIVEMIND section, filter paper/suspect, cap per-role.
- **Kapan dipicu**: agent.js:227 agentLoop (semua 3 role).
- **Output**: string gabungan 4 section (`── PINNED ──`, `── <ROLE> ──`, `── RECENT ──`, `── HIVEMIND ──`) atau null bila empty.
- **Sinkron**: baca `lessons.json.lessons[]` (diisi recordPerformance :250, evolveThresholds :560 summary lesson, addLesson tool manual, hive sync). `ROLE_TAGS` `:737-741` drives Tier 2. `outcomePriority` `:779` drives Tier 1+2 sort. `fmt` `:832-839` render `[OUTCOME] [date] rule` + `📌 `/`🧪 ` prefix.
- **Fail-mode**: load() fail → default `{lessons:[]}` → return null. Empty after filter → return null. Paper leak (`isPaperMode` true padahal live) → paper lessons masuk prompt (cross-mode, F13 mitigation).
- **Bukti**: lessons.js:754-830; filter paper :765-766, suspect :770; cap :775-777; Tier 1 :784-787, Tier 2 :792-803, Tier 3 :808-814; HIVEMIND :817-820; fmt :832-839.

### `getHourlyProfile()` (lessons.js:1046-1093) — WIB 5-session bucket
- **Apa**: bucket closed-position by open_session WIB, per-session `count/win_rate_pct/avg_pnl_pct/avg_hold_min` + overall.
- **Kapan dipicu**: getTimeProfileForPrompt (1124), classifySession (1110), tool get_time_profile (executor.js:258), briefing.js buildTimeProfileSection (246), reports.js weak-session recs (496).
- **Output**: obj `{timezone, min_samples, total_with_open_time, overall_win_rate_pct, overall_avg_hold_min, sessions[]}`.
- **Sinkron**: source = `getModePerformance().filter(open_session && isFiniteNum(pnl_pct))` (1050). `SESSIONS` `:51-57` 5 bucket. `MIN_SESSION_SAMPLES=8` `:60` gate (di consumer, bukan di sini).
- **Fail-mode**: getModePerformance fail → []. Record tanpa `open_session` (pra-tagging) → skip filter. `minutes_held` non-finite → holdCount=0, avg_hold_min=null.
- **Bukti**: lessons.js:1046-1093.

### `classifySession(sessionKey)` (lessons.js:1109-1116)
- **Apa**: `weak | ok | insufficient`. weak = win-rate ≥15pp under overall AND avg PnL negatif.
- **Kapan dipicu**: getTimeProfileForPrompt (1133), reports.js:497 weak-session recs.
- **Output**: string enum.
- **Sinkron**: call getHourlyProfile (1110) — recursive read (no memoize, UNKNOWN cost).
- **Fail-mode**: overall_win_rate null → insufficient. session count <8 → insufficient.
- **Bukti**: lessons.js:1109-1116.

### `getTimeProfileForPrompt()` (lessons.js:1123-1141) — SCREENER soft brake 1-line
- **Apa**: 1-line note current session + verdict + hold time. Null bila <8 total atau current session <8.
- **Kapan dipicu**: prompt.js:115 buildSystemPrompt SCREENER (ALWAYS ON, NOT eksperimen).
- **Output**: string 1-line or null.
- **Sinkron**: getHourlyProfile (1124) + currentWibSession (1127) + classifySession (1133). currentWibSession = `(new Date().getUTCHours() + 7) % 24` → sessionForHour.
- **Fail-mode**: <8 → return "no historical edge yet, judge on pool merits" line (bukan null — tetap inject info kecil). current session <8 → line "only N past deploys". null hanya bila total <8.
- **Bukti**: lessons.js:1123-1141; CLAUDE.md:261 soft brake contract.

### `getNarrativeProfile()` (lessons.js:1153-1192) — 8-category bucket
- **Apa**: bucket closed-position by `narrative_category`, per-category `count/win_rate_pct/avg_pnl_pct` sort desc by avg-pnl.
- **Kapan dipicu**: getNarrativeProfileForPrompt (1216), classifyNarrative (1201), tool get_narrative_profile (executor.js:259), reports.js:501 weak-narrative recs.
- **Output**: obj `{min_samples, total_with_category, overall_win_rate_pct, categories[]}`.
- **Sinkron**: source = `getModePerformance().filter(NARRATIVE_CATEGORIES.includes(p.narrative_category) && isFiniteNum(p.pnl_pct))` (1155-1156). `NARRATIVE_CATEGORIES` `:66` 8 enum, KEEP IN SYNC definitions.js:200. `MIN_NARRATIVE_SAMPLES=8` `:69` gate (di consumer).
- **Fail-mode**: getModePerformance fail → []. Record `narrative_category` out-of-enum → filtered out (SILENT drop — LIVE temuan: 3 record `game`/`game_utility`). Record tanpa category → filtered out.
- **Bukti**: lessons.js:1153-1192; NARRATIVE_CATEGORIES :66; orphan live evidence: FARM-SOL 2026-06-23 game, VALORA-SOL 2026-06-26 game_utility ×2.

### `classifyNarrative(category)` (lessons.js:1200-1207)
- **Apa**: mirror classifySession utk narrative. `weak | ok | insufficient`.
- **Kapan dipicu**: reports.js:502 weak-narrative recs.
- **Output**: string enum.
- **Sinkron**: call getNarrativeProfile (1201) — recursive read.
- **Fail-mode**: overall null → insufficient. category count <8 → insufficient.
- **Bukti**: lessons.js:1200-1207.

### `getNarrativeProfileForPrompt()` (lessons.js:1215-1229) — SCREENER soft hint 1-line
- **Apa**: best+worst+overall line. Null bila <8 total atau no category ≥8 sampel.
- **Kapan dipicu**: prompt.js:117 buildSystemPrompt SCREENER GATED `experiments.narrativeProfileSignal`.
- **Output**: string 1-line or null.
- **Sinkron**: getNarrativeProfile (1216). Filter `count >= MIN_NARRATIVE_SAMPLES=8` (1219). best=ranked[0], worst=ranked[last].
- **Fail-mode**: <8 total → null. All category <8 → null. Eksperimen OFF (factory) → prompt.js:117 null → skip line. Tagging tetap collected passively (294/365 live records tagged).
- **Bukti**: lessons.js:1215-1229; prompt.js:117 gated; CLAUDE.md:115 contract.

### `getExcludedRacikanStats()` (lessons.js:995-1002) — disclosure anti silent-hide
- **Apa**: return `{count, net_usd}` live closed HELD OUT getModePerformance purely by racikan-scoping (different active_setup).
- **Kapan dipicu**: `/report` + `/wallet` disclosure line.
- **Output**: obj `{count, net_usd}` or `{0,0}` paper mode.
- **Sinkron**: kebalikan `keepActiveRacikan` — `!p.paper && !p.suspect_pnl && !keepActiveRacikan(p)` (998).
- **Fail-mode**: paper mode → return {0,0} (nothing live to disclose while dry-running).
- **Bukti**: lessons.js:995-1002.

### `getSuspectCount()` (lessons.js:981-985)
- **Apa**: count suspect (≤−90% non-stopLoss) closed in current mode+racikan. Drives `/report ⚠️ Suspect` line.
- **Kapan dipicu**: `/report` suspect disclosure.
- **Output**: integer.
- **Sinkron**: `isPaperMode ? paper : !paper` + `keepActiveRacikan && p.suspect_pnl` (984). Kebalikan getModePerformance suspect filter.
- **Fail-mode**: 0 bila none (caller hide line).
- **Bukti**: lessons.js:981-985.

### `getPerformanceSummary()` (lessons.js:1007-1035)
- **Apa**: return summary obj `{total_positions_closed, total_pnl_usd, total_invested_usd, roi_pct, avg_pnl_pct, avg_range_efficiency_pct, win_rate_pct, total_lessons}`.
- **Kapan dipicu**: agent.js:228 agentLoop (semua role), `/status`/`/evolve` headline.
- **Output**: summary obj or null (empty perf).
- **Sinkron**: inline filter `keepActiveRacikan && !suspect_pnl` (1012) — NOT via getModePerformance (slight duplication, same logic, no paper filter here). `total_lessons` = `data.lessons.length` (RAW count, no paper/suspect filter — UNKNOWN intentional or gap).
- **Fail-mode**: empty → return null.
- **Bukti**: lessons.js:1007-1035.

### `racikanRules(role)` (prompt.js:21-29) — racikan-borne prompt rules
- **Apa**: render `RACIKAN RULES` block dari `config.promptNotes[role]` array. No notes → "".
- **Kapan dipicu**: buildSystemPrompt MANAGER (:50), SCREENER (:141), GENERAL (:197).
- **Output**: string block or "".
- **Sinkron**: `config.promptNotes` di-set dari user-config.json, re-baca `reloadScreeningThresholds` (F28). Per-role object `{screener, manager, general}` or plain array (legacy = SCREENER). Normalized `normalizePromptNotes` config.js.
- **Fail-mode**: malformed → empty (fail-open). HARD instructions beat soft guidelines, NEVER override HARD RULE/mechanical safety.
- **Bukti**: prompt.js:21-29; CLAUDE.md Racikan Prompt Notes section.

---

## §E — Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — Orphan narrative_category (P3, silent data drop)
3 record live mainzen_v2_1 punya `narrative_category` di luar `NARRATIVE_CATEGORIES` enum: `game` (FARM-SOL 2026-06-23) + `game_utility` (VALORA-SOL 2026-06-26 ×2). definitions.js:200 enum identik `NARRATIVE_CATEGORIES` (`[animal,ai,political,celebrity,meme,culture,tech_utility,other]`) — `game`/`game_utility` TIDAK ada. SCREENER emit out-of-enum value, executor tak validate enum strictly (no schema validator), record tagged invalid. `getNarrativeProfile` filter `NARRATIVE_CATEGORIES.includes(p.narrative_category)` `:1156` SILENTLY drop 3 record (1% dari 294 tagged). Operator tak visible. **Severity P3** — 1% data loss, tak affect headline (sample size masih besar). Fix candidate: enum validation di executor deploy_position, atau expand `NARRATIVE_CATEGORIES` + definitions enum sinkron (kalau `game`/`game_utility` memang valid).

### E.2 — getPerformanceSummary tak filter paper (P3, minor isolation gap)
`getPerformanceSummary` `:1012` filter inline `keepActiveRacikan && !suspect_pnl` — TIDAK filter paper. Bila `isPaperMode()` false (live) tapi ada paper record di lessons.json (sisa dry-run lama), paper record MASUK summary headline `agent.js:228` → perfSummary di prompt semua role. Beda dengan `getModePerformance` yang filter `isPaperMode ? paper : !paper`. **Severity P3** — live saat audit 0 paper record (F19 temuan), jadi tak affect sekarang. TAPI bila operator flip DRY_RUN false setelah paper session, paper record bisa leak ke headline perfSummary. Mitigation: `getPerformanceSummary` sebaiknya pakai `getModePerformance()` bukan inline filter (konsisten isolation). Cross-ref F13/F19 isolation contract.

### E.3 — getPerformanceSummary `total_lessons` RAW count (P3, display noise)
`:1033` `total_lessons: data.lessons.length` — RAW count lesson termasuk paper + suspect + evolution tag. Padahal `getLessonsForPrompt` filter paper/suspect sebelum inject. Headline `/status`/`/evolve` bisa show "149 lessons" tapi yang masuk prompt cuma ~21 (cap SCREENER) setelah filter. **Severity P3** — display-only noise, tak affect prompt. Fix candidate: `data.lessons.filter(l => !l.paper && !l.suspect).length` utk konsistensi.

### E.4 — MIN_SESSION_SAMPLES / MIN_NARRATIVE_SAMPLES hardcoded (P3, tak tunable)
Kedua konstanta `:60`/`:69` = 8, TIDAK di CONFIG_MAP executor.js, TIDAK di `formatFullConfig`/`/settings`. Operator tak bisa tune tanpa edit lessons.js + restart. CLAUDE.md sebut `MIN_SESSION_SAMPLES` tanpa config path. **Severity P3** — konstanta stabil, tuning jarang butuh. TAPI full-sync 6-surface rule: config-ish key wajib 6 surface. Konstanta = vaccination exception (kode-level, bukan config). Worth documenting di SETTINGS-GUIDE kalau ingin expose. Cross-ref F8 full-sync checklist.

### E.5 — classifySession/classifyNarrative recursive read (P3, perf cost UNKNOWN)
`:1110` call `getHourlyProfile()` (yang call `getModePerformance` → `load()` fs.readFileSync). `:1201` call `getNarrativeProfile()` (sama). `getTimeProfileForPrompt` `:1124` call `getHourlyProfile` lagi. reports.js:496-501 call keduanya + classifySession/classifyNarrative per category.UNKNOWN berapa kali `load()` dipanggil per `/report` run. **Severity P3** — `load()` sync fs read, cache di memory? Cek lessons.js:106-119 — `load()` baca file tiap call, no cache. 365 records × multiple call = small cost tapi tak nol. Fix candidate: memoize per-process atau cache invalidation on `save()`. Cross-ref F19 load() chokepoint.

### E.6 — getTimeProfileForPrompt ALWAYS ON (kontrak, NOT bug)
prompt.js:115 `getTimeProfileForPrompt()` selalu di-call SCREENER block, TIDAK gated eksperimen. CLAUDE.md:261 sebut "soft brake SCREENER prompt". F5 Open-Q #3 tanya: bisakah di-toggle? Jawaban F22: TIDAK ada config knob utk OFF. `getTimeProfileForPrompt` return null bila <8 sampel (factory fail-safe), tapi bila ≥8 sampel → line selalu inject. Operator tak bisa disable. **Kontrak byte-identik tanpa eksperimen-off = VALID** (sesuai CLAUDE.md:261 — soft brake, NEVER override hard rules). Bila ingin opt-in: jadikan eksperimen `timeProfileSignal` default ON (inverted convention — perlu kontrak baru). **Severity P4** — design decision, bukan bug.

### E.7 — narrativeProfileSignal full-sync OK (kontrak terpenuhi)
`narrativeProfileSignal` + `usePaperHistoryWhenLive` keduanya ter-registered CONFIG_MAP executor.js:488/498 (`/setcfg`), definitions.js:412 (Experiments description list), `formatFullConfig`/`/settings` (per F8). Full-sync 6-surface terpenuhi. **Kontrak terpenuhi**. Cross-ref F8.

### E.8 — paper/live isolation kontrak terpenuhi di F22 (kontrak kunci)
`getModePerformance` `:963` `isPaperMode ? paper : !paper` + `getLessonsForPrompt` `:765` `!isPaperMode && !usePaperHistoryWhenLive → !l.paper`. 2 chokepoint read honor tag. Live saat audit: 0 paper record → filter no-op sekarang, tapi kontrak jalan bila paper data muncul. `usePaperHistoryWhenLive` opt-in LIVE-only: ON → paper lessons inject dgn 🧪 flag (`fmt` `:836`), STILL excluded dari getModePerformance/evolve/weights/reports/hive (tag isolation regardless). **Kontrak terpenuhi**. Cross-ref F13/F19.

### E.9 — racikan isolation kontrak terpenuhi (kontrak kunci)
`keepActiveRacikan` `:893` `(p?.active_setup ?? null) === (config.activeSetup ?? null)` di getModePerformance (972) + getExcludedRacikanStats (998) + getPerformanceSummary (1012 inline) + recordPerformance livePerf (298, F19) + evolveThresholds chokepoint (462, F20). Future-proof: switching `config.activeSetup` via preset `applyPreset` (F29) auto re-scope. Archive (84 record pra-tagging) di file terpisah `lessons-archive.json`, tak masuk `load().performance` → tak affect. **Kontrak terpenuhi**. Cross-ref F20 (84 record lama archive bug — resolved via archive file split, F19/F20 verification).

### E.10 — summary lesson prompt bloat RESOLVED (F20 Open-Q #12)
F20 Open-Q #12: "getLessonsForPrompt cap/dedupe summary lesson `outcome:"manual"`? Bila 271 close → ~54 evolve → ~54 summary lesson di prompt." F22 verifikasi: live lessons.json 149 lessons, 4 evolution-tagged (bukan 54). Cap SCREENER RECENT_CAP=10 → max 10 recent lesson masuk prompt (including evolution). Tier 2 ROLE_CAP=6 berdasar tag `["evolution","config_change"]` — UNKNOWN apakah ROLE_TAGS SCREENER includes "evolution". Cek `:738`: SCREENER tags = `[screening,narrative,strategy,deployment,token,volume,entry,bundler,holders,organic]` — TIDAK ada "evolution"/"config_change". Jadi evolution summary lesson masuk Tier 3 Recent fill (sort by created_at desc, slice 10). Bila 4 evolution + 6 lesson lain lebih recent → 4 evolution masuk prompt. Bila 54 evolution (F20 fear) → hanya 10 most-recent masuk (cap active). **Cap terpenuhi, bloat mitigated**. F20 Open-Q #12 RESOLVED.

### E.11 — HIVEMIND section isolation (kontrak terpenuhi)
`getSharedLessonsForPrompt` hivemind.js:152 return null bila `HIVE_MIND_URL` absent (factory). `getLessonsForPrompt` `:817-820` call hanya bila `selected.length > 0 || shared`. HIVEMIND section render di `:827`. Hive lessons di-tag paper/suspect? UNKNOWN — cross-ref F33 hivemind isolation. F19 sebut hive `!entry.paper` (257) + hive event skip (328). `getSharedLessonsForPrompt` source = hive server (external), filter unknown. **Severity P3** — bila hive return paper/suspect lesson, F22 tak re-filter (hivemind.js:152 unknown). Cross-ref F33.

### E.12 — getLifetimePerformance NOT racikan-scoped (kontrak, display-only)
`:926` archive + live `!paper`, NOT filter `keepActiveRacikan`. Dipakai `/report all` tier. CLAUDE.md sebut "mixed settings — explicitly NOT racikan-isolated". Display-only (mixed racikan record, tak affect evolve/weights). **Kontrak intentional** — operator lihat all-time跨racikan perf. Cross-ref F17 (active_setup tagging), F20 (archive 84 record).

---

## §F — Glosarium istilah fase

- **getModePerformance** — mode-scoped read chokepoint `lessons.js:963`. `isPaperMode ? paper : !paper` + `keepActiveRacikan` + `!suspect_pnl`. Dipakai semua consumer user-facing.
- **keepActiveRacikan** — `(p?.active_setup ?? null) === (config.activeSetup ?? null)` `:893`. Racikan isolation predicate, future-proof.
- **getAllPerformance** — RAW array no filter `:899`. Archival/debug only.
- **getArchivedPerformance** — pre-baseline 84 record archive `:910`. Display-only, fail-open.
- **getLifetimePerformance** — archive + live `!paper` `:926`. `/report all` tier, NOT racikan-scoped (mixed settings display).
- **getPerformanceForRacikan** — `!paper` + `active_setup===name` by-name `:936`. `/report <racikan>` tier.
- **listRacikanInPerformance** — distinct racikan names (skip paper) `:945`. `/report setups`.
- **getExcludedRacikanStats** — `{count, net_usd}` live closed HELD OUT by racikan-scoping `:995`. Disclosure anti silent-hide.
- **getSuspectCount** — suspect (≤−90% non-stopLoss) count in mode+racikan `:981`. `/report ⚠️ Suspect` line.
- **getPerformanceSummary** — summary obj utk prompt `/status`/`/evolve` `:1007`. Inline filter (NOT via getModePerformance — minor gap E.2).
- **getHourlyProfile** — WIB 5-session bucket `:1046`. Soft-signal SCREENER.
- **SESSIONS** — 5 coarse WIB bucket `:51-57`: dini/pagi/siang/sore/malam. Coarse bukan 24-jam (sparse stabil).
- **MIN_SESSION_SAMPLES** — konstanta 8 `:60`. Gate session steer. Hardcoded (E.4).
- **classifySession** — `weak | ok | insufficient` `:1109`. weak = win-rate ≥15pp under overall AND avg PnL negatif.
- **getTimeProfileForPrompt** — 1-line SCREENER soft brake `:1123`. ALWAYS ON (E.6). Null bila <8.
- **getNarrativeProfile** — 8-category bucket `:1153`. Soft-signal SCREENER.
- **NARRATIVE_CATEGORIES** — 8 enum `:66` = `[animal,ai,political,celebrity,meme,culture,tech_utility,other]`. KEEP IN SYNC definitions.js:200.
- **MIN_NARRATIVE_SAMPLES** — konstanta 8 `:69`. Gate category steer. Hardcoded (E.4).
- **classifyNarrative** — `weak | ok | insufficient` `:1200`. Mirror classifySession.
- **getNarrativeProfileForPrompt** — best+worst+overall SCREENER line `:1215`. Gated `experiments.narrativeProfileSignal`. Null bila <8.
- **getLessonsForPrompt** — 3-tier lesson injection `:754`. Pinned/Role-matched/Recent + HIVEMIND. Filter paper/suspect. 3-cap per-role.
- **ROLE_TAGS** — map role→tag list `:737`. SCREENER 10 tag, MANAGER 10 tag, GENERAL []. Tier 2 role-matching.
- **outcomePriority** — sort map `:779` `{bad:0,poor:1,failed:1,good:2,worked:2,manual:1,neutral:3,evolution:2}`. Tier 1+2 priority.
- **PINNED_CAP/ROLE_CAP/RECENT_CAP** — lesson cap per-role `:775-777`. SCREENER/MANAGER 5/6/10, GENERAL 10/15/35.
- **fmt** — lesson formatter `:832`. `[OUTCOME] [date] rule` + `📌 `/`🧪 ` prefix.
- **usePaperHistoryWhenLive** — LIVE-only opt-in `experiments.usePaperHistoryWhenLive`. ON → paper lessons inject 🧪, excluded evolve/weights/reports/hive. OFF (factory) → `!l.paper` filter.
- **narrativeProfileSignal** — experiment flag `experiments.narrativeProfileSignal`. OFF (factory) → narrative line skip, tagging passive.
- **paper_ prefix detection** — briefing.js:445 `String(p.position||"").startsWith("paper_")`. state.json rows no paper flag, detect via id. Cross-store isolation.
- **shrink-rank K=5** — briefing.js:258 fair-rank session PnL `(avg×count + K×globalAvg)/(count+K)`. Anti small-sample outlier rank.
- **currentWibSession** — `(UTC + 7) % 24` → sessionForHour `:86`. Session aktif sekarang.
- **sessionLabel** — display label "siang" → "11–15 siang" `:91`.
- **wibHour** — hour 0-23 WIB dari ISO ts `:72`. null bila unparseable.

---

## §G — Link fase lain (cross-ref)

- **F19**: recordPerformance push entry + lesson + signal_snapshot → FEED getLessonsForPrompt + getModePerformance. F19 sediakan data, F22 konsumen read + filter. 7 consumer honor paper:true tag (F22 verifikasi: getModePerformance :967 + getLessonsForPrompt :766). Suspect_pnl stamp (F19) honor di :972 + :770. keepActiveRacikan chokepoint (F19 :298 livePerf) honor di F22 :972 + :1012 + :998.
- **F13**: paper/live isolation contract. F13 tag sediakan (recordPerformance :228 `...perf` spread), F22 honor di read chokepoint. usePaperHistoryWhenLive opt-in (F13 spec) implement di F22 :765-766 + fmt :836 🧪 flag. paper_ prefix detection (F22 briefing consumer, F13 spec).
- **F20**: evolveThresholds push summary lesson :560 → feed getLessonsForPrompt (F22 Tier 3 Recent). F20 Open-Q #12 (summary bloat) RESOLVED di F22 E.10 (cap 10, only 4 evolution live). keepActiveRacikan chokepoint (F20 :462) shared dengan F22.
- **F21**: Darwin getWeightsSummary SCREENER injection paralel dengan F22 profile injection. Both di prompt.js:157 interpolation. Both gated `config.darwin?.enabled`/`experiments.narrativeProfileSignal`. Darwin independent dari evolveEnabled (F20), narrativeProfileSignal independent dari Darwin.
- **F5**: prompt.js buildSystemPrompt. F5 detail SCREENER block structure, F22 detail profile/lesson source + filter logic. timeProfile :115 always ON (F5 Open-Q #3 → F22 E.6 jawab). racikanRules :141 (F5 sebut, F22 detail racikan-borne).
- **F4**: agent.js agentLoop consumer tunggal `:227-238`. F4 detail role gating + fallback, F22 detail getLessonsForPrompt/getPerformanceSummary/weightsSummary source.
- **F25**: briefing consumer. getHourlyProfile (buildTimeProfileSection :246, shrink-rank K=5), getModePerformance (:337/453), paper_ prefix detection (:445). F25 detail display layer, F22 detail source + filter.
- **F24**: reports.js computeTradeStats + classifySession/classifyNarrative weak-bucket recs (`:496-504`). F24 detail stats engine, F22 detail classifier source.
- **F26**: config.activeSetup (racikan isolation driver), config.experiments (narrativeProfileSignal/usePaperHistoryWhenLive), config.darwin (getWeightsSummary gate). F26 detail config defaults, F22 detail consumer read.
- **F8**: full-sync 6-surface. narrativeProfileSignal + usePaperHistoryWhenLive ter-registered CONFIG_MAP (executor.js:488/498), definitions.js:412, formatFullConfig/settings-guide (per F8). F22 konfirmasi surface terpenuhi (E.7). MIN_SESSION_SAMPLES/MIN_NARRATIVE_SAMPLES = vaccination exception (konstanta, E.4).
- **F29**: preset applyPreset swap user-config.json → `config.activeSetup` re-baca `reloadScreeningThresholds` (F28) → getModePerformance re-scope otomatis. F22 keepActiveRacikan future-proof (no restart needed).
- **F17**: state.js trackPosition + active_setup tagging :151. F17 detail record shape, F22 detail consumer read filter by active_setup.
- **F33**: hivemind getSharedLessonsForPrompt :152. F22 sebut HIVEMIND section, F33 detail isolation (hive lessons paper/suspect filter unknown — E.11).

---

## §H — Open-Q (bawa ke fase lain)

1. **[F24/F33]** `getSharedLessonsForPrompt` (hivemind.js:152) filter paper/suspect lesson? Bila hive return paper/suspect, F22 tak re-filter (E.11). Hive server-side filter unknown — F33 verifikasi.
2. **[F24]** `classifySession`/`classifyNarrative` recursive call `getHourlyProfile`/`getNarrativeProfile` tiap invoke — `load()` sync fs read tiap call, no cache (E.5). Berapa kali `load()` dipanggil per `/report` run? F24 verifikasi cost + memoize candidate.
3. **[F26/F8]** `MIN_SESSION_SAMPLES`/`MIN_NARRATIVE_SAMPLES` hardcoded 8 (E.4). Worth expose as config key? Full-sync 6-surface cost vs benefit (konstanta stabil, tuning jarang). F26 config-core decision.
4. **[F13/F19]** `getPerformanceSummary` :1012 inline filter tak paper (E.2). Bila operator flip DRY_RUN false setelah paper session, paper record leak ke headline. F13/F19 mitigation: sebaiknya pakai getModePerformance() bukan inline. Severity P3 sekarang (0 paper live), P2 potential post-flip.
5. **[F5/E.6]** `getTimeProfileForPrompt` ALWAYS ON (E.6). Bila ingin opt-in: jadikan eksperimen `timeProfileSignal` default ON (inverted convention). Design decision — perlu kontrak baru utk "default-ON experiment". F5/F8 config-design.
6. **[F19/E.3]** `getPerformanceSummary` `total_lessons` RAW count (E.3). Display noise — `data.lessons.length` vs filtered count. F19/F24 fix candidate: filter paper/suspect utk konsistensi.
7. **[F15/E.1]** Orphan narrative_category 3 record (game/game_utility, E.1). Fix candidate: enum validation di executor deploy_position. F15 (executor safety) atau F6 (definitions schema) scope. Severity P3 (1% data loss).
8. **[F33]** Hive lesson push (F19 :257) skip paper, tapi `getSharedLessonsForPrompt` (hive server fetch) filter unknown. Bila hive server return paper lesson → F22 inject ke prompt (cross-mode). F33 hivemind isolation detail.
9. **[F24]** `getModePerformance` cost: `load()` sync read tiap call. 365 records × multiple consumer per `/report`/briefing run. Memoize candidate (cache invalidation on `save()`). F24 stats-engine perf review.
10. **[F26]** `config.activeSetup` null vs undefined: `keepActiveRacikan` `?? null` normalize both. Archive record `active_setup=null` match `config.activeSetup=null` — tapi archive di file terpisah, tak affect. Record lama pra-tagging (pre-2026-06-10) di `load().performance`? F19 sebut 84 record di archive (split 2026-06-15), `load().performance` = 365 (post-baseline). F26/F17 verifikasi archive split boundary.

---

*F22 selesai 2026-07-07. Read-only. Kode/config tak diubah saat menyusun.*
