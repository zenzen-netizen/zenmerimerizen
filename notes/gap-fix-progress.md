# GAP-FIX — PROGRESS (Lever B: skip relay LPAgent mati)

> Lanjutan dari `notes/gap-recon.md`. Branch `experimental`. Bukti = `file:line`. Ragu = UNKNOWN.
> Sesi baru → BACA file ini dulu. Lever A (close LLM-free + bypass cooldown) = brief TERPISAH berikutnya.

## Tujuan
Pangkas latency tiap close dgn skip relay LPAgent yang MATI (gagal 100%) → langsung fallback lokal.
TIDAK menyentuh exit-kriteria / screening / recordPerformance / sizing. Reversible.

---

## ✅ FASE 0 — KONFIRMASI RELAY MASIH MATI (read-only)
Dari `logs/*.log`:
- **188 event** `"Relay zap-out failed before submit; falling back to local close"`.
- **0 event** `"Relay closed at"` (sukses) → **relay TIDAK PERNAH sukses**.
- Pola error: `"Relay transaction contains direct SOL transfer from owner to …"` (ditolak guard
  `signAndSimulateRelayTransactions`) + kadang `upstream HTTP 429`.
- Circuit breaker buka tiap **2 gagal** (`dlmm.js:165` THRESHOLD=2) → skip 10m (`dlmm.js:164`) →
  **reset & retry** → gagal lagi. Siklus gagal abadi yg buang waktu tiap reset.
- Event terakhir: 2026-06-19 07:34 reset → masih jalur gagal.

→ **Relay tetap mati. LANJUT.** (Tidak ada sukses belakangan, tidak perlu STOP.)

## ✅ FASE 1 — SKIP RELAY (OPSI A: flag `lpAgentRelayEnabled=false`)

**Pilihan: OPSI A.** Alasan: `shouldUseLpAgentRelay()` (`dlmm.js:167`) **HANYA** dipanggil di
`closePosition()` (`dlmm.js:2087`) — satu-satunya consumer. Deploy-relay sudah hardcoded
`return false` (`shouldUseLpAgentRelayForDeploy`, `dlmm.js:201`). Tidak ada jalur lain yg pakai
relay → OPSI B (skip khusus exit darurat) tidak perlu; OPSI A lebih bersih & 1-flag reversible.

**Mekanik flag (`config.js:337`):** `lpAgentRelayEnabled: u.lpAgentRelayEnabled ?? false` —
**default sudah false**; relay nyala HANYA karena config eksplisit `true`.

**Kontrol-flow (verified `dlmm.js:2087-2331`):** `if (shouldUseLpAgentRelay()) { …relay… }` (2087-2325)
**tanpa `else`**; fallback di 2327+ jalan **tanpa syarat**. Flag off → `shouldUseLpAgentRelay()`
return false (`dlmm.js:168`) → seluruh blok relay di-skip → langsung fallback. Identik dgn perilaku
sekarang (yg selalu fallback), **minus** percobaan relay yg buang waktu. **Tidak ada kode diubah.**

**File diubah (semua gitignored — config lokal, lihat `.gitignore:11,15`):**
| File | Sebelum | Sesudah | Kenapa |
|---|---|---|---|
| `user-config.json:88` | true | **false** | fix runtime LIVE (berlaku setelah restart) |
| `presets/mainzen_v2_1.json:88` | true | **false** | racikan AKTIF — cegah revert saat `/preset use` |
| `presets/mainzen_v2.json:86` | true | **false** | robustness |
| `presets/mainzen.json:81` | true | **false** | robustness |
| `presets/bigcapagresif.json:81` | true | **false** | robustness |
| `presets/_backup.json:85` | true | **false** | robustness |

`user-config.example.json:96` **sudah** `false` (template — tidak diubah).
Semua file valid JSON (dicek `require()`), flag terbaca `false`.

**Commit:** config & preset gitignored → tidak masuk git. Artefak commit = file progress ini
(`notes/gap-fix-progress.md`). Perubahan runtime bersifat **lokal by design**.

## ✅ FASE 2 — VERIFIKASI
- **Jalur fallback UTUH** (code-review, bukan test live — `/close` = on-chain asli, tidak dipicu):
  klaim fee (`dlmm.js:2335-2357`) → removeLiquidity/closePosition (`dlmm.js:2376-2399`) →
  verifikasi (`dlmm.js:2405-2422`) → `recordClose` (`dlmm.js:2436`) → return pnl untuk
  recordPerformance (downstream di executor, tak tersentuh). Sama persis dgn yg sudah jalan 188×.
- **`/close <n>` manual** pakai `closePosition()` yg SAMA (`index.js:3589`) → ikut skip relay,
  tetap normal.
- git branch = `experimental` ✅ · pm2 id=0 `meridian` online, cwd=`/home/ubuntu/meridianzen` ✅
- ⚠️ **RESTART PENDING**: `pm2 restart 0 --update-env` (id0 meridian) biar `lpAgentRelayEnabled=false`
  aktif. Setelah restart, cek log close berikut: **NOL** baris `"Relay zap-out failed"` / `"circuit
  breaker"` → close langsung fallback (lebih cepat).

---

## CATATAN UNTUK SESI BERIKUT
- Setelah restart: konfirmasi log close pertama benar2 nol relay attempt.
- **Lever A** (brief terpisah): close SL/rug LLM-free langsung di poller + bypass cooldown 10m
  (`index.js:1258-1276`) — ini pemangkas latency terbesar; FASE ini (Lever B) baru buang relay mati.
