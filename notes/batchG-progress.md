# BATCH G — PROGRESS

> Workstream 🅴 — nuntasin JG-1, JG-2, JG-8, C8 dari `notes/message-coverage-audit.md`.
> Display-only. Builder di `views/cycle.js` (merge-safe); index.js cuma swap inline→1-baris.
> Branch `experimental`. Restart owner-only.

- [x] 1  buildCandidateList (views/cycle.js): tree, field-opsional, plain, scannable ✅ commit 1
- [ ] 2  T19 /screen → buildCandidateList + buildNoCandidates (no-result)
- [ ] 3  T20 /candidates cache → buildCandidateList (list) + jaga semantik cache-kosong
- [ ] 4  R9 REPL /candidates fetch → buildCandidateList + buildNoCandidates
- [ ] 5  Cycle trivial: JG-8 mgmt catch→cycleFail · C8 judul envelope→konstanta

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
