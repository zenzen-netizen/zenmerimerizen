# LLM-COST-RECON — Ke mana biaya LLM lari & WASTE yg bisa dipotong (BUKAN downgrade model)

> RECON OFFLINE, READ-ONLY. Nol edit/restart/commit. Branch `experimental`, BOT UTAMA
> `/home/ubuntu/meridianzen`. Bukti = `file:line`. Ragu = UNKNOWN. Tanggal 2026-06-20.
> Sumber data: `llm-cost-log.json` (real per-call cost, role-tagged; 2273 call, 12.8 hari, 2026-06-07→20).
> PRINSIP: JANGAN dumb-kan keputusan kritis (pilih pool/deploy). Hemat HANYA dari WASTE.

## TL;DR
**SCREENING = 88.6% biaya** ($3.54/$3.99). Model screening (`minimax-m2.7`) **sudah MURAH** ($0.278/Mtok) —
jadi lever-nya **bukan model**, tapi **frekuensi × token/panggilan × panggilan/cycle**. Arsitektur sudah
cukup hemat (pre-filter deterministik skip LLM saat penuh/broke/0-kandidat; management LLM cuma jalan kalau
ada aksi; data recon di-prefetch non-LLM). Total spend ~**$5-6/bulan** normal. WASTE nyata terbesar = **spike
sizing-stuck 06-18 ($0.72 vs $0.13 normal, ~5×)** yg **SUDAH di-fix (06-19) + live** (restart id0 selesai).
Lever hemat tambahan = **frekuensi (Q4)** + **trim tool-schema redundan** + **adaptiveScreening ON** — semua
TANPA nyentuh kualitas keputusan.

---

## Q1 — PETA BIAYA ✅ (real, dari llm-cost-log.json)

| Role | Model | %biaya | calls | $/call | tok/call | total |
|---|---|---|---|---|---|---|
| **SCREENER** | minimax-m2.7 (+ m2.5 lama) | **88.6%** | 1780 | $0.00199 | 8219 | **$3.54** |
| MANAGER | minimax-m2.5 | 8.3% | 448 | $0.00074 | 4566 | $0.33 |
| GENERAL (chat) | gemini-2.5-flash | 3.1% | 45 | $0.00273 | 10492 | $0.12 |

**Sumber DOMINAN = SCREENING.** Loop: `agentLoop` (agent.js:205,244) — tiap step = 1 LLM call dgn systemPrompt
+ history yg MEMBESAR (agent.js:337,486), cost di-rekam `recordLlmCost` (agent.js:273).
- **avg 2.78 call/cycle** (641 cycle, 1780 call). Distribusi: mayoritas 2 call (decide+format/deploy), tapi
  ekor panjang **4-12 call/cycle** (~135 cycle) = multi-step tool round-trip (tiap step kirim ulang ~8k token).
- **Rincian token/call SCREENER (~8200 tok):** systemPrompt ~1253 (incl lessons ~692) + **tool-schema ~3193**
  (dikirim TIAP step; `deploy_position` sendiri ~1097!) + candidate-blocks ~3200 + history.
- **Harga model (blended in+out):** m2.7 $0.278/Mtok, m2.5 $0.157/Mtok, gemini-flash $0.261/Mtok →
  **semua model MURAH**, tak ada model premium utk di-downgrade.
- Normal-day SCREENER ~$0.16/hari → **~$4.83/bulan**; all-role ~$5-6/bulan (spike 06-18 nambah episodik).

Bukti: model config flat user-config.json (`screeningModel=minimax/minimax-m2.7`, `managementModel=minimax/minimax-m2.5`,
`generalModel=google/gemini-2.5-flash`); `maxSteps=20`, `maxTokens=4096`; agent.js:205,244,263,273.

---

## Q2 — WASTE / panggilan nggak perlu ✅

**Pre-filter deterministik SEBELUM LLM — SUDAH ADA & bagus (nol LLM saat tak perlu):**
- Posisi penuh → skip, no LLM (index.js:677-688).
- Modal kurang (broke/sizing-aware) → skip, no LLM (index.js:703-715). *(= fix sizing-stuck, lihat bawah)*
- marketRegimeGate (OFF) → skip, no LLM (index.js:723-746).
- `getTopCandidates({limit:10})` (index.js:777) = candidate fetch + hard-filter (TVL/vol/organic/launchpad/
  indicator-entry) DULUAN; LLM cuma lihat ≤10 kandidat tersaring.
- **0 kandidat lolos → return TANPA agentLoop** (index.js:844-863). No LLM. ✅
- Recon kandidat (sw/narrative/tokenInfo/audit/active_bin/pool-memory) di-**prefetch non-LLM** & disuntik ke
  prompt (index.js:803-814, 916-922). LLM tak perlu panggil tool buat data ini.
- **Management LLM cuma jalan kalau ada aksi** (`if (actionPositions.length > 0)`, index.js:582-588); STAY →
  no LLM. Plus exit deterministik (STOP_LOSS) sudah LLM-free via poller (Lever A).

**WASTE yg TERSISA:**
1. **🔴 Spike sizing-stuck (terbesar, SUDAH FIX):** 2026-06-18 = **$0.72, 352 call** (vs ~$0.13/104 call
   normal, ~5×). = bug `maximize` perSlot<minDeploy → screening jalan-LLM berulang pdhl floor selalu tolak
   ([[project-sizing-stuck-fix]]). Fix broke-skip sizing-aware (index.js:703) sudah landed 06-19 + **live**
   (restart id0 selesai). → recur tercegah. **Hemat ~$0.6/episode** yg tadinya kebakar.
2. **🟡 Ekor multi-step (4-12 call/cycle):** ~135 cycle pakai ≥4 call; tiap step kirim-ulang ~8k token.
   Penyebab dugaan: model MASIH panggil tool recon (get_token_holders/narrative/info/smart_wallets/pool_memory)
   pdhl datanya SUDAH di candidate-block. Estimasi: turunin avg 2.78→~2.0 call/cycle ≈ **−28% call screening
   ≈ ~$1/bulan**. Quality-safe (data sudah ada).
3. **🟡 Tool-schema redundan (~3193 tok/call, dikirim tiap step):** 5 dari 13 tool SCREENER datanya sudah
   pre-loaded → `get_active_bin` (prompt eksplisit "no need to call", index.js:1049), `check_smart_wallets_on_pool`,
   `get_token_narrative`, `get_token_info`/`get_token_holders` (audit bot%/top10% sudah ada), `get_pool_memory`.
   Skema mereka ~1500+ tok kebuang tiap call. Trim → **~−18% token input ≈ ~$0.7/bulan** + ngurangin ekor #2.
4. **🟢 82% LLM-cycle no-deploy** (117 deploy / 641 cycle; decision-log: deploy 9 vs no_deploy 44 ≈ 17%).
   Ini **sebagian besar INHEREN** (harus evaluasi utk menolak), BUKAN waste murni — TAPI memberi tahu bahwa
   **frekuensi screening bisa diturunin** dgn opportunity-cost rendah (Q4).
5. **🟢 Eksekusi close deterministik non-emergency masih lewat LLM:** trailing-TP/low-yield/claim tetap
   route ke management-LLM (index.js:588,603) walau aturannya sudah deterministik. Lever A baru cover STOP_LOSS.
   Perluas direct-exec → potong sebagian MANAGER 8.3% (~$0.7/bulan). Minor.

---

## Q3 — OPSI TIERED (hemat tanpa dumb) ✅

**Decision-critical (WAJIB model bagus — JANGAN diutak):** evaluasi kandidat akhir + `deploy_position`
(index.js:1038 agentLoop SCREENER). **Catatan kunci: model screening sudah `minimax-m2.7` @ $0.278/Mtok =
SUDAH murah-tapi-kapabel.** Tak ada model premium utk di-downgrade → tiering model di jalur kritis **nihil
manfaat & berisiko**. Prinsip "jangan dumb" otomatis terpenuhi.

**Routine (boleh model murah/free) — tapi volumenya KECIL:**
- Data-gathering kandidat: **sudah non-LLM** (API Jupiter/Meteora/dlmm). Nol untung tiering.
- Step "format laporan DEPLOYED" pasca tool-return: murni format → boleh free model. Tapi cuma ~1 call/deploy
  (~18% cycle) → untung kecil, nambah kompleksitas. **Trade-off: tidak worth.**
- Eksekusi aksi management deterministik: bisa LLM-free total (Lever-A-style), **lebih baik daripada** pindah
  ke model murah.

**Free-tier (Gemini-free/OpenRouter-free) buat triage "ada kandidat layak nggak?":** secara teori bisa jadi
gerbang-1 murah sebelum eskalasi ke m2.7. **TAPI triage ITU keputusan kritis** (salah-tolak = kelewat pool) →
**melanggar prinsip, TRADE-OFF nyata, TIDAK disarankan.** Free model juga sering no-tool-call/garble
([[project-general-model-choice]], [[project-minimax-tool-dump-fix]]) → risiko reliabilitas.

**Verdict Q3:** arsitektur **sudah** misahin data-gathering (non-LLM) dari keputusan (1 call model murah).
Tiering nambah sedikit untung di jalur non-kritis kecil; jalur kritis **biarin** (sudah murah). Hemat nyata
ada di **token-trim + frekuensi**, bukan tiering model.

---

## Q4 — FREKUENSI ✅

- `screeningIntervalMin = 30` (48 tick/hari; aktual ~50 cycle/hari). `adaptiveScreening = OFF` (undefined),
  `maxScreeningIntervalMin = unset`. `maxPositions = 2`, avg-hold ~36m → slot sering kosong → screening sering jalan.
- **82% cycle no-deploy** → cycle marginal cuma ~18% peluang nemu deploy; cycle yg kelewat cuma nunda
  ~15-30m. Opportunity-cost rendah.
- **Lever frekuensi:**
  - `screeningIntervalMin 30→45`: ~−33% cycle screening → **~$1.3/bulan**. Trade-off RINGAN (lebih jarang
    nengok; tapi mostly no-deploy anyway). *Mostly* quality-safe.
  - `screeningIntervalMin 30→60`: ~−50% → **~$2/bulan**. Trade-off lebih besar (bisa kelewat pump cepat).
  - **`adaptiveScreening ON` + `maxScreeningIntervalMin 60`:** stretch interval HANYA di sesi historis lemah
    (lessons.js `shouldRunScheduledScreening`, CLAUDE.md), management/poll TAK ke-throttle, freed-slot tetap
    bypass. = hemat token TEPAT saat deploy paling tidak mungkin. **Quality-AWARE, paling aman dari semua
    lever frekuensi.** Config-only, fitur sudah ada.

---

## ⭐ REKOMENDASI (rekomendasi-only; apply = keputusan terpisah)

| # | Lever | Estimasi hemat | Jenis | Quality |
|---|---|---|---|---|
| 1 | **Sizing-stuck fix** (broke-skip) | ~$0.6/episode | SUDAH live | ✅ done |
| 2 | **adaptiveScreening ON + maxScreeningIntervalMin 60** | ~$0.6-1.2/bln | config-only | ✅ quality-SAFE (stretch sesi lemah saja) |
| 3 | **screeningIntervalMin 30→45** | ~$1.3/bln | config-only | 🟡 trade-off RINGAN (lebih jarang nengok) |
| 4 | **Trim tool-schema SCREENER redundan** (drop 5 tool yg datanya pre-loaded) | ~$0.7/bln + ekor #2 turun | kode (agent.js SCREENER_TOOLS) | 🟢 quality-safe in principle (data tetap di prompt) — validasi bbrp cycle |
| 5 | **Perkuat prompt "data pre-loaded, putuskan langsung, jgn panggil tool recon"** | ~$0.3-0.5/bln | prompt (index.js:1046) | 🟢 quality-safe |
| 6 | **Perluas direct-exec (Lever-A) ke trailing-TP/low-yield/claim** | ~$0.7/bln | kode | 🟢 quality-safe (aturan sudah deterministik) |

**JANGAN:** downgrade `screeningModel` (sudah murah $0.28/Mtok; downgrade = dumb keputusan kritis & untung
tipis). Free-tier buat triage kandidat (= keputusan kritis, melanggar prinsip).

**Catatan jujur:** spend absolut kecil (~$5-6/bln normal). Arsitektur sudah cost-hygienic. Lever paling
bernilai & aman = **#2 (adaptiveScreening)** + **#4/#5 (token-trim)**; #3 hemat lebih besar tapi ada
trade-off peluang. **Nol perubahan kode/config dibuat di recon ini.**
