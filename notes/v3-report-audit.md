# v3-report-audit — RECON/AUDIT (READ-ONLY) of Telegram report output (BOT v3)

**Date:** 2026-06-20 · **Branch:** `experimental` · **BOT v3:** `/home/ubuntu/meridianzen2`
**Mode:** READ-ONLY total. **Zero** edit / restart / commit / git op / config write. No bot touched.
**Method:** static read of code + read-only replay of pure helpers (`getActiveSetupStatus`, `getPnlTracker`
math) + read-only parse of `lessons.json` / `user-config.json` / `presets/*.json`.
**Evidence:** `file:line`. Uncertain = **UNKNOWN**.

> TL;DR — (Q1) Profil ≠ Racikan in code: **two separate fields** (`preset` → `config.profile`
> vs `activeSetup`). They print the same string only because the `preset` key holds a **racikan
> name** ("mainzen_v3") instead of an archetype → **DATA-v3**. (Q2) The "💰 Net $4.56" / "net $2.91"
> pair is **two different definitions of the word "net"** (label collision, KODE-SHARED) sitting on
> top of the real "geser": the report is **racikan-scoped** and **silently drops 14 recent live
> trades that lost their racikan tag** (−$1.84), so report = +$4.56 while all-live realized = +$2.72
> → **DATA-v3**. (Q3) `?/SOL` + `TOKEN/SOL` names + the null tags are all the **same root cause**:
> untracked on-chain positions backfilled by `ensureDeployedAt`. Details + categories below.

---

## Q1 — MODEL PROFIL vs RACIKAN — ✅

**In code, "profil" and "racikan" are SEPARATE fields/concepts — not the same.** Deliberately so.

### Which field each label renders from
Canonical identity block = `formatIdentity()` in **preset-manager.js:170-180** (single source for
`/config`, `/settings`, `/report`, briefings):

| Label in report | Source field | Evidence |
|---|---|---|
| `🧬 Profil: X` | `readCurrent().preset` → mapped via `PROFILE_LABELS` | preset-manager.js:171-172, 162 |
| `🗂️ Racikan: X` | `getActiveSetupStatus().name` = `current.activeSetup` | preset-manager.js:156, 173-176 |

`config.js:114` wires the same split: `profile: u.preset ?? "moderate"` and
`activeSetup: u.activeSetup ?? null`. The comment at **config.js:108-113** states it outright:
*"Two SEPARATE concepts (historically conflated under one 'preset' word)."*

- **profile** = wizard archetype (degen|moderate|safe|custom). Static character baseline picked at setup.
- **activeSetup** = the named saved snapshot ("Racikan") currently loaded via `/preset use`.

### Why BOTH currently print "mainzen_v3" (the bug the owner saw)
The live identity block renders (verified by read-only replay of `formatIdentity({compact:true})`):
```
🧬 Profil: mainzen_v3 · 🗂️ Racikan: mainzen_v3 ✎ (ada edit manual)
```
Because the data is stuck:
- `user-config.json`: `preset = "mainzen_v3"`, `activeSetup = "mainzen_v3"` (both literally that string).
- `PROFILE_LABELS` (preset-manager.js:162) only maps `degen/moderate/safe/custom`. "mainzen_v3" is
  **not** an archetype, so `profLabel = profile` falls through to the **raw string** → `🧬 Profil: mainzen_v3`.
- `activeSetup` happens to be the racikan named `mainzen_v3` → `🗂️ Racikan: mainzen_v3`.

So the redundancy is **NOT intentional** and the two labels are **NOT the same field** — they
coincidentally read the same string because the `preset` (profile) key holds a **racikan name**
instead of an archetype. Root cause is a stale data value, not a rendering bug: every snapshot
carries the bad value forward —
```
presets/mainzen_v3.json : preset=mainzen_v3   activeSetup=mainzen_v3
presets/Zensmiv1.json   : preset=mainzen_v3   activeSetup=Zensmiv1
presets/_backup.json    : preset=mainzen_v3   activeSetup=Zensmiv1
```
`applyPreset` swaps the **whole file** (only re-stamps `activeSetup`, preset-manager.js:139), so the
stale `preset:"mainzen_v3"` rides through every `/preset use` and can never self-correct. It almost
certainly originates from the old era when "preset" and "racikan" were one word (config.js:108).

### "✎ (ada edit manual)" flag — what triggers it
`formatIdentity` → `getActiveSetupStatus().edited` (preset-manager.js:158):
```
edited = diffConfigs(current, presetSnapshot).length > 0
```
i.e. the **live user-config.json diverges from the named snapshot** in any non-meta key.
`preset`/`activeSetup` are excluded from the diff (`META_KEYS`, preset-manager.js:41,48), so the stale
profile value does **not** trip it. Verified live: the flag IS on now, driven by exactly **one** key:
`lpAgentRelayEnabled: false → true` (live config vs `presets/mainzen_v3.json`). That is the flag
**working correctly** — config genuinely diverges from the snapshot (the lever-B relay flag).

### ⭐ Functional difference (for review-racikan): NOT full overlap
- **Racikan (`config.activeSetup`)** drives REAL behavior: scopes performance/learning
  (`keepActiveRacikan`, lessons.js:887-888), self-identifies in the prompt (prompt.js:24), scopes
  `/report` & briefings (lessons.js:957-966), carries `promptNotes`, and is the file actually loaded
  (all screening/risk/management values come from `presets/<name>.json`). It is the functional recipe identity.
- **Profil (`config.profile`)** is essentially a **passive attribution label**. Its only uses:
  stamped onto each position record (`profile`, state.js:152; carried into close records dlmm.js:2269,2564)
  and printed in the identity block. Grep shows **no behavioral gate** keyed on `config.profile`.

**Verdict Q1:** different concepts, correct code, **stale data**. Category **DATA-v3** (see F1).

---

## Q2 — RECONCILIATION: Net PnL report vs Meteora — ✅

Two distinct issues stacked on top of each other.

### (a) Why top "💰 Net: +$4.56" ≠ bottom "net $2.91" — the word "net" means two different things
| Line | Code | Meaning of its number |
|---|---|---|
| `💰 Net: +$4.56 \| 💎 fees $…` | **reports.js:275** (`st.net_pnl_usd`) | Σ per-trade `pnl_usd` = realized trading PnL, **after** pool fees + IL, **before** operating cost |
| `30D +$2.91 net (PnL $4.56 − biaya $1.65)` | **pnl-tracker.js:85** | same $4.56 relabeled **"PnL"**; **"net"** = $4.56 − opex (gas+LLM $1.65) = $2.91 |

`st.net_pnl_usd = r2(Σ pnl_usd)` (reports.js:38,140). `pnl-tracker` defines `net = realized − costUsd`
where `costUsd = gas + LLM` (pnl-tracker.js:61-63). So **$4.56 is the identical number in both**;
"net" is overloaded:
- reports.js "Net" = net-of-**trading**-cost (fees/IL already inside `pnl_usd`).
- pnl-tracker "net" = net-of-**operating**-cost (gas+LLM) on top.

Is the top "Net" label wrong? It is **not "gross"** (gross = winners-only, `gross_profit_usd`
reports.js:143). It is genuinely net of trading fees/IL. But **relative to the line right below it**,
the top "Net" is the **pre-opex (PnL)** figure — so the label is **misleading/inconsistent**, not
mathematically wrong. → Label collision. Category **KODE-SHARED** (F3).

### (b) Why $4.56 "geser" from Meteora — the real drift
**How per-trade PnL is recorded:** the close path fetches Meteora's authoritative closed PnL
(`posEntry.pnlUsd`) from `https://dlmm.datapi.meteora.ag/positions/{pool}/pnl?...status=closed`
(**dlmm.js:2473,2480,2491**) — but the record that feeds reports does **NOT** store that value.
`recordPerformance` **recomputes** it (**lessons.js:173**):
```
pnl_usd = (final_value_usd + fees_earned_usd) − initial_value_usd
```
from Meteora `allTimeWithdrawals/allTimeFees/allTimeDeposits` (dlmm.js:2483-2485). Verified against
all 94 records: stored `pnl_usd` == this recompute (rounding only). This is standard LP PnL and is
close to Meteora's own pnl per-record, so the recompute itself is **minor** drift (USD-valuation
timing / fee-inclusion semantics = DEFINISI-Meteora, see F4 note).

**The dominant geser is SCOPING.** `/report` + briefings + `/wallet` all read
`getModePerformance()` which is **racikan-scoped**: `keepActiveRacikan(p) && !p.paper && !p.suspect_pnl`
(**lessons.js:957-966, 887-888**). Read-only sum of `lessons.json`:

```
LIVE (non-paper, non-suspect)              n=69   Σ pnl_usd = +$2.72   ← ≈ what Meteora UI sums (all wallet closes)
  · active_setup = "mainzen_v3"            n=55   Σ = +$4.56   ← what the report prints (racikan-scoped)
  · active_setup = null   (recent trades)  n=14   Σ = −$1.84   ← SILENTLY DROPPED from the report
30D mainzen_v3 = +$4.56  (all 55 fall in 30D; live started 2026-06-12)
```

So the report shows **+$4.56** (only the `mainzen_v3`-tagged subset) while Meteora — which has no
racikan filter — reflects **≈ +$2.72** (all 69 closes). The exact gap **$4.56 − $2.72 = $1.84** is
the 14 recent, **mostly-losing** live trades that lost their racikan tag (F5). The report reads
**optimistic** vs Meteora because the dropped trades skew negative.

**Can it be explained? YES, fully.** The geser is: racikan-scoping (intended) × a tagging defect
(unintended, F5) + label overload (F3) + a small recompute-vs-authoritative definitional gap (F4 note).
Paper trades (n=25, the 2026-06-11 dry-run block) are excluded too — **correct**, Meteora never saw
them (no on-chain tx), so they are not a geser source.

> **UNKNOWN:** whether Meteora's wallet view also contains closes the bot never recorded at all
> (e.g. closed during downtime). Can't verify without querying the live Meteora API / wallet history.
> If so, that is an additional (separate) gap on top of the $1.84.

---

## Q3 — SCAN: other output anomalies (/wallet, /positions, /pool, close notif) — ✅

- **`/wallet` + `/status`** embed the same racikan-scoped `formatPnlTracker(getModePerformance())`
  block (index.js:3583, also :4040) → identical $4.56→$2.91 numbers as the report. Internally
  consistent; inherits F3/F4, no new anomaly.
- **`/positions`**: `pair = tracked?.pool_name || ${pool.tokenX}/${pool.tokenY}` (dlmm.js:1782) →
  untracked positions render slash / `?` names (F5/F6/F7).
- **`/pool`** / `getPoolMeta`: builds `data?.name || ${tokenX}-${tokenY}` (HYPHEN, dlmm.js:618). No
  new anomaly; this is the source of the older `TOKEN-SOL` names.
- **close notif** (`notifyClose`, telegram.js:599-625): headline `Net PnL` = `res.pnl_usd` =
  Meteora **authoritative** `pnlUsd` (dlmm.js:2491→2612), NOT the recorded recompute → the number
  flashed at close can differ slightly from the same trade in the later report (F9).

### Findings (each with category)

**F5 — 14 recent live trades carry `active_setup=null` + `TOKEN/SOL` names (≈2026-06-18→19).** ⭐ root
Timeline (read from lessons.json): every live close 2026-06-12→17 is `TOKEN-SOL` + `active_setup=mainzen_v3`;
from 2026-06-18T01:52 onward all are `TOKEN/SOL` + `active_setup=null` (e.g. `RIV/SOL`, `Joby/SOL`,
`滑る猫/SOL`, `Merlin/SOL`). Mechanism: these were **untracked** on-chain positions (absent from
state.json). `getMyPositions` backfills any observed-but-untracked position via
`ensureDeployedAt(pos, { pool_name: ${pool.tokenX}/${pool.tokenY} })` (**dlmm.js:1741**), which creates
a minimal record with **slash name + `active_setup` defaulting to null** (state.js:183-192, default
:82,101) and a note *"Backfilled from on-chain — deploy metadata unknown"* (state.js:189). Contrast a
normal tracked deploy: `trackPosition` stamps `active_setup: fields.active_setup ?? config.activeSetup`
(**state.js:151**) and uses the deploy-time hyphen name. So tracking was **lost** for these positions.
- Consequence: dropped from racikan report (F4), split out in "By racikan" breakdown (reports.js:391),
  shown with slash names.
- **Why was tracking lost?** = **UNKNOWN** — fits a state.json reset / restart around 2026-06-17/18 or
  positions adopted from on-chain after the registry was cleared; can't be proven read-only. (The
  paper→live cutover was 2026-06-12 per memory; the slash boundary is later, ≈06-18.)
- Category: **DATA-v3** (records already written; can't be retro-tagged safely). The underlying
  *mechanism* — `ensureDeployedAt` not stamping `config.activeSetup` — is **KODE-SHARED** and worth a
  main-side decision (F5b in recommendations).

**F6 — `?/SOL` (unresolved token symbol).** `get_position_pnl` fallback
**tools/pnl.js:216**: `tracked?.pool_name || (meteora ? ${meteora.tokenX ?? "?"}/${meteora.tokenY ?? "SOL"} : "?/SOL")`.
Same untracked-position fallback as F5; when even the symbol can't be resolved it prints `?`.
dlmm.js:1782 has the sibling `${pool.tokenX}/${pool.tokenY}` (→ `undefined/SOL` if unresolved).
Cosmetic, only on untracked/unresolved positions. Category: **KODE-SHARED** (symptom of F5).

**F7 — pool-name separator inconsistency `-` vs `/`.** Tracked = `TOKEN-SOL` (dlmm.js:618), untracked
backfill = `TOKEN/SOL` (dlmm.js:1741,1782; pnl.js:216). The same pool appears under both formats across
history (`drooling-SOL` vs `drooling/SOL`), which also cosmetically fragments by-pool/by-setup grouping.
Low severity. Category: **KODE-SHARED**.

**F8 — one all-zero close record.** `2026-06-17T17:20 'ANSEM/SOL'`: pnl=0, final=0, initial=0, fees=0,
`active_setup=null`. The Meteora closed-PnL API returned nothing and the cache fallback had initial=0
→ all zeros recorded (dlmm.js:2509-2527 fallback path). Counts as a $0 closed trade (inflates count by 1,
neutral on PnL). Category: **DATA-v3** (single bad record).

**F9 — close-notif PnL basis ≠ recorded PnL basis.** notif = Meteora authoritative `posEntry.pnlUsd`
(dlmm.js:2491,2612 → telegram.js:611); report = recompute `(final+fees)−initial` (lessons.js:173).
Per-trade these can diverge slightly → "the close popup number ≠ the report number." Category:
**KODE-SHARED / DEFINISI-Meteora**.

---

## Q4 — CATEGORY of every finding — ✅

| # | Finding | Category | Fix where |
|---|---|---|---|
| **F1** | Profil & Racikan both print `mainzen_v3` — `preset` key holds a racikan name, not an archetype; baked into all `presets/*.json`, propagates on every `/preset use` | **DATA-v3** | v3: edit `preset` value in `user-config.json` + `presets/*.json` |
| **F2** | `✎ (ada edit manual)` is ON (live vs snapshot differ by `lpAgentRelayEnabled false→true`) | **BUKAN-BUG** | none — flag working as designed |
| **F3** | Top `💰 Net $4.56` vs bottom `net $2.91`: word "net" overloaded (trading-net vs opex-net); same $4.56, math correct, label misleading | **KODE-SHARED** | main: rename reports.js:275 label (e.g. "PnL"/"Net (dagang)") then sync |
| **F4** | Report $4.56 geser from Meteora ≈$2.72: racikan-scoping drops untagged trades (+ minor recompute-vs-authoritative) | **DATA-v3** (scoping fed bad data) + **DEFINISI-Meteora** (recompute) | v3 data (F5) + accept/clarify recompute definition |
| **F5** | 14 recent live trades `active_setup=null` + slash names — untracked → `ensureDeployedAt` backfill, no racikan stamp | **DATA-v3** (records) / **KODE-SHARED** (mechanism) | v3: data; main: consider stamping activeSetup in backfill |
| **F6** | `?/SOL` unresolved-symbol name | **KODE-SHARED** | symptom of F5; cosmetic |
| **F7** | `-` vs `/` pool-name separator inconsistency | **KODE-SHARED** | main: unify separator, then sync |
| **F8** | One all-zero close record (settle failure) | **DATA-v3** | v3: optional filter/cleanup |
| **F9** | close-notif PnL (Meteora authoritative) ≠ recorded PnL (recompute) | **KODE-SHARED / DEFINISI-Meteora** | main: persist authoritative pnl OR document the split |

---

## Recommendations (NO changes made — owner/decision only)

1. **F1 (DATA-v3, highest signal/lowest risk):** the headline confusion is purely the `preset` value.
   Setting `preset` to a real archetype (e.g. `"custom"`) in `user-config.json` **and** in
   `presets/*.json` makes `🧬 Profil: ✏️ Custom` distinct from `🗂️ Racikan: mainzen_v3`. Data-only; no
   code change. (Verify it doesn't break any consumer first — grep confirmed `config.profile` is label-only.)
2. **F5 (the real geser):** decide what to do about the 14 null-tagged live trades. Options (owner's call):
   (a) leave as-is and read `/report all` for the true all-trade picture; (b) one-off retro-tag the
   2026-06-18→19 null records to `mainzen_v3` in `lessons.json` (they did run under it) so the racikan
   report stops dropping the losers; (c) **main-side** fix `ensureDeployedAt` to stamp
   `config.activeSetup`/`config.profile` on backfill (state.js:183-188) so a future tracking-loss can't
   orphan attribution — then sync to v3. Also investigate WHY tracking was lost ≈2026-06-18 (logs).
3. **F3 (KODE-SHARED):** rename the top report label from "Net" → "PnL" (or "Net dagang") at
   reports.js:275 so it doesn't clash with pnl-tracker's opex-net. Fix in **main**, then sync.
4. **F9 / F4-recompute (DEFINISI):** decide the single source of truth for per-trade PnL — either
   persist Meteora's authoritative `posEntry.pnlUsd` into the record (so report == Meteora == notif), or
   document that the report uses the deposit/withdrawal/fee recompute. Fix in **main**, then sync.
5. **F6/F7 (cosmetic, KODE-SHARED):** unify the pool-name separator and the `?`-symbol fallback in main.
6. Everything above is **read-only findings**; no edit/restart/commit performed. Most user-facing fixes
   are **DATA-v3** (touch v3 data only); the structural ones are **KODE-SHARED** → fix in main first,
   then sync to v3 per the established procedure.

## STOP — audit complete. Read-only total; nothing changed except this file.
