# BATCH G — PROGRESS

> Workstream 🅴 — nuntasin JG-1, JG-2, JG-8, C8 dari `notes/message-coverage-audit.md`.
> Display-only. Builder di `views/cycle.js` (merge-safe); index.js cuma swap inline→1-baris.
> Branch `experimental`. Restart owner-only.

- [x] 1  buildCandidateList (views/cycle.js): tree, field-opsional, plain, scannable ✅ commit 1
- [x] 2  T19 /screen → buildCandidateList + buildNoCandidates (no-result) ✅ commit 2
- [x] 3  T20 /candidates cache → buildCandidateList (list) + jaga semantik cache-kosong ✅ commit 3
- [x] 4  R9 REPL /candidates fetch → buildCandidateList + buildNoCandidates ✅ commit 4
- [x] 5  Cycle trivial: JG-8 mgmt catch→cycleFail · C8 judul envelope→konstanta ✅ commit 5

---

## VERIFIKASI AKHIR (FASE selesai)
- `node --check` lulus tiap fase (views/cycle.js + index.js).
- JG-8: index.js:627 mgmt catch → `cycleFail(...)` (sama gaya screening catch 739/769/1138).
- C8: 4 titik (createLiveMessage 472/745 + sendMessage fallback 633/1145) pakai `CYCLE_TITLE.{mgmt,screen}`. Nol stray literal.
- Cycle otomatis (C3-C6 skip/fail/no-cand/lone) di runScreeningCycle TAK disentuh — masih builder cycle.js apa adanya.
- Render-ganda hilang: /screen (T19) + /candidates cache (T20) + REPL fetch (R9) semua via buildCandidateList; no-result via buildNoCandidates (sama gaya cycle). Cache-kosong tetap buildNoCache (distinct).

---

## Catatan desain (locked)
- **Unit kandidat ≠ solMode:** metrik kandidat (vol $, fee/aTVL %, organic, in-range %) = data POOL eksternal,
  BUKAN modal kita → sengaja TIDAK pakai `fmtCur`/`solMode`. Mirror display lama persis ($ vol, % fee).
  (`solMode` cuma relevan utk PnL/saldo/value kita — tak muncul di daftar kandidat.) Governing #1/#3 (no detail loss).
- **Semantik dijaga (governing #4):** `buildNoCache()` (cache-kosong, "belum pernah screen") ≠
  `buildNoCandidates()` (hasil-kosong, "sudah screen → 0 lolos"). Dua builder beda, sengaja.
- **`_latestCandidatesAt` = ISO string** (index.js:1592), bukan ms → buildCandidateList toleran string|ms (Date.parse).
- **vol → format `k`** ($45.2k) dari raw dollar (mirror R9 lama; T19/T20 raw→k = nilai sama, lebih scannable).

## Bukti per fase (diisi saat eksekusi)
