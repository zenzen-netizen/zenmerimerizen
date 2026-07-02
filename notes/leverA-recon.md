# LEVER A — RECON (rute exit DARURAT poller → close LANGSUNG, LLM-free)

> RECON BACA-SAJA. Nol edit/restart/commit. Branch `experimental`. Bukti = `file:line`.
> Ragu = UNKNOWN. Tanggal 2026-06-19. Lanjutan [[project-gap-recon-2026-06-19]] +
> [[project-gap-fix-phase1-relay]] (FASE 1 relay sudah LIVE, pm2 restart ↺24).
> ⚠️ Ini RECON saja — STOP di akhir, tunggu go untuk build.

Tujuan Lever A: saat poller deteksi exit DARURAT (stop-loss / crash), tutup posisi **langsung**
(panggil `closePosition` tanpa lewat `runManagementCycle`+LLM), supaya sidestep round-trip LLM +
cooldown 10m — pemangkas latency terbesar dari recon gap.

---

## Q1 — JALUR `/close <n>` & rantai ke recordPerformance ✅

`/close <n>` (`index.js:3581-3599`) → `closePosition({position_address})` **langsung**
(`index.js:3589`), TANPA lewat executor/LLM.

**Temuan kunci: `closePosition` (dlmm.js) self-contained — recording ADA DI DALAMNYA**, bukan
di pemanggil:
- `tracked = getTrackedPosition()` (`dlmm.js:2080`)
- `recordClose()` (`dlmm.js:2436` fallback / `2187` relay) → tandai state closed
- **`recordPerformance()`** (`dlmm.js:2541` fallback / `2246` relay / `1591` paper) → lessons.json
- `appendDecision({type:"close"})` (`dlmm.js:2576`)
- Semua dalam guard `if (tracked)`.

`recordPerformance` cuma 1 definisi (`lessons.js:147`) → identik untuk SEMUA pemanggil.

(a) **recordPerformance/lessons**: ditangani closePosition sendiri ✅ → `/close` & poller-direct
    DAPAT recording GRATIS.
(b) **update state (set aktif)**: `recordClose` (`state.js:262`) set `pos.closed=true` (TIDAK
    dihapus, cuma di-flag). `getTrackedPositions(true)` (`state.js:420-423`) lalu exclude yg closed.
(c) **idempotent? TIDAK.** `getTrackedPosition` (`state.js:429`) return posisi **tanpa filter
    closed**, dan closePosition **tak punya guard `if(tracked.closed) return`**. Panggil 2× →
    `recordClose` aman (re-flag), tapi `recordPerformance` bisa **jalan 2× → dobel record/lesson**.
    → butuh guard double-close (Q2).

**Yang `/close` / closePosition-langsung TIDAK lakukan** (cuma ada di executor post-hook
`executor.js:798-821`): `notifyClose` Telegram (`:799`), **auto-swap base→SOL** (`:805-817`),
pool-note low-yield (`:801-803`). Tidak ada `swapToken` di dalam closePosition (dicek 2070-2610).
→ implikasi build di Q6.

Rantai lengkap:
```
/close n (index.js:3589) ─┐
LLM close_position ───────┤→ closePosition (dlmm.js:2070)
poller-direct (rencana) ──┘     ├ recordClose (state.js:262)
                                ├ recordPerformance (lessons.js:147)  ← recording di sini
                                └ appendDecision
LLM path SAJA + ekstra: executor post-hook (executor.js:798-821): notifyClose + autoswap base→SOL
```

## Q2 — DOUBLE-CLOSE ✅

**Guard yg ADA sekarang:** cuma flag busy global, TIDAK ada lock per-posisi (`grep` nol hit).
- Poller: skip kalau `_managementBusy || _screeningBusy || _pnlPollBusy` (`index.js:1236`); set
  `_pnlPollBusy=true` selama iterasi (`index.js:1238`, reset finally `1284`).
- Management cron: `runManagementCycle` guard `if(_managementBusy) return` (`index.js:431`); cron
  tick juga cek `_managementBusy` (`index.js:1180`).

**LUBANG:** `runManagementCycle` **TIDAK cek `_pnlPollBusy`** (`index.js:431`). Jadi kalau poller
lagi melakukan direct-close (in-flight, pegang `_pnlPollBusy`), management cron (tiap 10m) bisa
fire, `runManagementCycle` jalan (karena `_managementBusy` masih false), `getMyPositions(force)`
— kalau close belum confirmed on-chain → posisi masih kelihatan open → bikin aksi CLOSE → LLM →
`closePosition` SAMA lagi → **DOUBLE CLOSE + dobel recordPerformance**.

**Mitigasi (build):** selama direct-close, **set `_managementBusy=true`** (reset di `finally`) +
biarkan `_pnlPollBusy` ketahan (sudah otomatis karena di-`await` dalam loop). Dua lock ini bikin
poller & mgmt cron sama-sama mundur. `_managementBusy` module-scope (`index.js:108`) → bisa
di-set dari poller. Alternatif lebih bedah: Set `_closingInFlight` per-posisi yg dicek di poller
DAN runManagementCycle (lebih banyak sentuhan). Rekomendasi: pakai `_managementBusy` (minimal).

## Q3 — RECORDING di jalur langsung ✅

`recordPerformance` dipanggil **oleh `closePosition` sendiri** (Q1) — BUKAN executor/caller. Jadi
poller-direct `closePosition()` **otomatis** jalanin `recordPerformance` + `recordClose` +
`appendDecision`. **suspect_pnl handling (q4-fix) ikut**: logika `shouldRejectClosedPnl`
(`dlmm.js:2448-2455`) + flag suspect ada DI DALAM closePosition → jalan utk semua pemanggil.
Jadi Lever A **tidak menghilangkan record apa pun**. (Catatan: `recordPerformance` lakukan fetch
Meteora closed-PnL retry ≤6×5s → direct-close bisa makan ~30s; lock ketahan selama itu — sama
seperti perilaku skrg saat management nutup.)

## Q4 — COOLDOWN INDEPENDEN ✅

Cooldown 10m = `Date.now() − _pollTriggeredAt >= managementIntervalMin` (`index.js:1258-1260`,
`1271-1273`) — dicek HANYA sebelum poller memicu `runManagementCycle`, dan `_pollTriggeredAt`
di-set HANYA saat poller memicu management (`index.js:1261`, `1274`). Direct `closePosition()`
**tidak menyentuh `_pollTriggeredAt` dan tidak lewat trigger management** → **sidestep cooldown
otomatis**, tanpa gate lain. (Tidak ada gate cooldown kedua di jalur closePosition.) ✅

## Q5 — SCOPE TRIGGER (tipe exit yg dideteksi poller) ✅

Poller (`index.js:1242-1281`) deteksi via 2 fungsi:

**A. `updatePnlAndCheckExits` (`state.js:473`)** return `{action, reason}`:
| action | line | darurat? |
|---|---|---|
| `STOP_LOSS` (pnl ≤ stopLossPct) | `state.js:540-545` | **YA** |
| `TRAILING_TP` (needs_confirmation) | `state.js:548-559` | tidak (profit) |
| confirmed_trailing (recheck) | `state.js:479-486` | tidak |
| `OUT_OF_RANGE` (≥ wait menit) | `state.js:563-571` | tidak |
| `LOW_YIELD` | `state.js:576-585` | tidak |

**B. `getDeterministicCloseRule` (`index.js:1362`)** return `{action:"CLOSE", rule, reason}`:
| rule | line | darurat? |
|---|---|---|
| 1 stop loss (pnl ≤ stopLossPct) | `index.js:1376` | **YA** |
| 2 take profit | `index.js:1379` | tidak |
| 3 pumped far above range | `index.js:1382-1387` | tidak (pump, bukan rug) |
| 4 OOR | `index.js:1389-1395` | tidak |
| 5 low yield | `index.js:1397-1402` | tidak |

**"Rug/katastrofik"**: TIDAK ada rule rug terpisah — crash ditangkap oleh **stop-loss** (pnl ≤
stopLossPct, skrg **−10** di mainzen_v2_1). ⚠️ Ada guard suspect: pnl ≤ −90 dgn sisa value →
dianggap suspect → PnL rules **di-skip** (`index.js:1364-1374`, `state.js:540` `!pnl_pct_suspicious`).
Jadi rug ekstrem yg langsung baca −95% MUNGKIN tak ke-trigger SL (ini perilaku skrg; **JANGAN
diubah** di Lever A — itu exit-criteria, di luar lingkup). Lever A cuma percepat close utk SL yg
MEMANG nyala (kasus ANSEM/1B: nyala di −12 lalu jatuh lebih dalam).

**Rekomendasi scope: rute LANGSUNG HANYA untuk emergency = STOP_LOSS (`state.js:540`) + rule 1
(`index.js:1376`).** TP/trailing/OOR/low-yield → tetap jalur lama (cooldown→runManagementCycle).
Minim perubahan, risiko rendah.

## Q6 — RENCANA BUILD (konkret) ✅

**Lokasi sisip:** poller loop `index.js:1235-1286`, dua titik:
1. cabang exit `updatePnlAndCheckExits` (`index.js:1250-1268`) — kalau `exit.action==="STOP_LOSS"`.
2. cabang `getDeterministicCloseRule` (`index.js:1269-1280`) — kalau `closeRule.rule===1`.

**Helper baru `emergencyCloseDirect(p, reason)`** (di index.js), dipanggil dari kedua cabang
menggantikan blok cooldown→runManagementCycle **khusus saat darurat** (non-darurat tetap jalur lama):
```
async function emergencyCloseDirect(p, reason) {
  if (_managementBusy) return false;          // hormati lock mgmt
  _managementBusy = true;                      // blokir mgmt cron selama in-flight (Q2)
  try {
    log("state", `[PnL poll] EMERGENCY direct close: ${p.pair} — ${reason}`);
    const res = await closePosition({ position_address: p.position, reason });
    if (res?.success) {
      // (opsi) auto-swap base→SOL + notifyClose — replikasi executor post-hook (Q1)
    } else {
      log("cron_warn", `Emergency direct close gagal, fallback ke management: ${res?.error}`);
      // fallback: pakai jalur lama (trigger runManagementCycle) supaya LLM coba
    }
    return !!res?.success;
  } catch (e) { log("cron_error", `Emergency direct close error: ${e.message}`); return false; }
  finally { _managementBusy = false; }
}
```
Di poller: untuk darurat → `await emergencyCloseDirect(p, exit.reason)` lalu `break`
(skip cek cooldown). Untuk non-darurat → biarkan blok cooldown→runManagementCycle apa adanya.

**Reuse recording+idempotensi:** dapat gratis (closePosition self-contained, Q1/Q3) + guard
double-close via `_managementBusy` (Q2).

**Keputusan yg perlu di-review SEBELUM build:**
- **D1 — autoswap base→SOL?** closePosition-langsung TAK swap (Q1). Opsi: (i) replikasi
  `executor.js:805-817` di helper (recover dust rug + bersihin wallet), atau (ii) skip seperti
  `/close` skrg (terima sisa token rug di wallet). Rekomendasi: (i), tapi tetap fail-open.
- **D2 — notifyClose Telegram?** `notifyClose` BELUM di-import di index.js (perlu tambah import
  dari telegram.js). Tanpa ini, close darurat tak ada notif (jalur lama dpt notif via mgmt msg).
  Rekomendasi: import + panggil.
- **D3 — fallback kalau direct-close gagal:** jatuhkan ke jalur lama (trigger runManagementCycle)
  supaya LLM tetap coba — jangan diam.

---

## DAFTAR RISIKO (sisa)
1. **Double-close window** — diatasi `_managementBusy` (Q2); kalau tidak, dobel recordPerformance.
2. **Lock ketahan ~30s** saat close (Meteora PnL retry, Q3) → posisi LAIN tak dikelola sebentar.
   Sama dgn perilaku skrg (mgmt busy saat nutup). Risiko: 2 rug bersamaan, yg kedua nunggu.
3. **Autoswap hilang** kalau D1 skip → token rug nyangkut di wallet (dampak PnL ~nol, tapi kotor).
4. **Suspect-pnl rug** (pnl≤−90) tetap TAK ketutup (perilaku skrg, di luar lingkup) — Lever A tak
   memperbaiki ini; cuma percepat SL yg sudah nyala.
5. **Money path** — closePosition = uang asorli, susah dites. Mitigasi test: DRY_RUN (closePosition
   dry-run return tanpa tx, `dlmm.js:2072`), atau test 1 posisi kecil manual, atau /close jalur sama.
6. **Hanya percepat, bukan hilangkan gap** — sisa gap saat eksekusi (tx confirm) tetap inheren utk
   rug super-cepat; Lever A buang LLM+cooldown, bukan waktu konfirmasi on-chain.

---

## ⭐ KESIMPULAN RECON
Lever A **FEASIBLE & relatif aman**: recording+suspect-handling ikut gratis (closePosition
self-contained), cooldown ke-sidestep otomatis, scope darurat sempit (SL + rule 1). **Satu-satunya
guard wajib** = cegah double-close (`_managementBusy` selama in-flight). Dua keputusan minor
(autoswap, notify) perlu diputuskan. Tidak menyentuh exit-criteria/screening/sizing/recordPerformance.

**STOP — tunggu review & go sebelum build.**

### Index bukti (file:line)
- /close: `index.js:3581-3599`, call `:3589`
- closePosition self-contained: `dlmm.js:2070`, recordClose `:2436`/`:2187`, recordPerformance `:2541`/`:2246`/`:1591`, appendDecision `:2576`; no swap di dalam (2070-2610)
- recordPerformance def: `lessons.js:147` · suspect handling `dlmm.js:2448-2455`
- executor post-hook (notify+autoswap+pool-note): `executor.js:798-821`
- recordClose: `state.js:262` · getTrackedPosition (no closed filter): `state.js:429` · getTrackedPositions(true): `state.js:420-423`
- poller: `index.js:1235-1286`, busy guard `:1236`, cooldown `:1258-1265`/`:1271-1278`
- updatePnlAndCheckExits: `state.js:473`; STOP_LOSS `:540`; trailing `:548`; OOR `:563`; low-yield `:576`
- getDeterministicCloseRule: `index.js:1362`; rule1 SL `:1376`; suspect guard `:1364-1374`
- locks: `_managementBusy` `index.js:108`/guard `:431`; `_pnlPollBusy` `index.js:1234`
- closePosition imported in index.js: `:8` · notifyClose NOT imported (perlu tambah)
