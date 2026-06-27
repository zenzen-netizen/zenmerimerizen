# Peta Jalur Perubahan Config + Rekonstruksi Bug `screeningModel`

> READ-ONLY investigation, 2026-06-14. Tujuan: rancang **kekangan `update_config` yang presisi** (bukan blanket), berbasis bukti file:line + log. Tidak ada kode/config yang diubah.

---

## TL;DR (untuk yang buru-buru)

1. **Bug `screeningModel` BUKAN kasus "shown ≠ applied".** Log membuktikan yang ditampilkan di konfirmasi == yang ditulis (`minimax_m2_5` keduanya). Tidak ada jalur yang mem-parse-ulang value SETELAH konfirmasi untuk model id.
2. **Akar masalahnya di HULU:** LLM (general chat) yang **meng-garble** input user `"minimax m2.5"` → tool-arg `value:"minimax_m2_5"` (buang prefix `minimax/`, ganti spasi/titik jadi `_`). Lalu **tidak ada validasi format** sama sekali, jadi string rusak itu ditulis apa adanya. Konfirmasi cuma menggemakan nilai yang sudah rusak — dan tampilannya cukup mirip "minimax m2.5" sampai user menekan ✅ Ya.
3. **Kekangan yang tepat = validasi format per-key** (khususnya `*Model` harus `provider/slug`), bukan memperketat alur konfirmasi. Konfirmasinya sendiri sudah jujur.
4. Bonus temuan: **jalur otonom (SCREENER) TIDAK BISA nulis config** — `update_config` tidak ada di `SCREENER_TOOLS`, jadi instruksi prompt POST-DEPLOY INTERVAL (prompt.js:90-92) itu **mati/tak terjangkau**. Dan **CLI REPL chat (index.js:3366) melewati konfirmasi** (tidak wiring `onConfirmRequired`).

---

## #1 — Tabel Jalur Ubah Config (input → file)

Semua jalur LLM/menu akhirnya memanggil **satu** fungsi tulis: `update_config` di `tools/executor.js:298`. Dua auto-tuner internal menulis **langsung** ke file (bypass `update_config`).

| # | Jalur | Entry (file:line) | Parser value | Konfirmasi? | Validasi format? | Penulis akhir |
|---|-------|-------------------|--------------|-------------|------------------|---------------|
| **a** | `/setcfg <key> <value>` | index.js:2912 | `parseConfigValue` (index.js:1737) | **TIDAK** | TIDAK | `executeTool("update_config")` |
| **b** | Menu tombol `/settings` (toggle/step/set/cat) | `applySettingsMenuCallback` index.js:2255 → :2408 | clamp per-aksi (:2395-2400) + `normalizeMenuValue` (:2244) | **TIDAK** | sebagian (clamp numerik) | `executeTool("update_config")` |
| **b2** | `/settings` → input field (ketik angka/off) | `telegramHandler` `_pendingInput` index.js:2662-2691 | `Number()` / "off"/"null" saja | **TIDAK** | hanya "harus angka/off" | `executeTool("update_config")` |
| **c** | **Casual chat via Telegram** (GENERAL LLM) | index.js:3028 `agentLoop(... { interactive:true, onConfirmRequired:requestConfirmation })` | `coerceConfigValue` (executor.js:303) | **YA** (`requestConfirmation` index.js:1850) | **TIDAK** (cuma true/false/off/null/number) | `update_config` |
| **c2** | Casual chat via **CLI REPL** (GENERAL LLM) | index.js:3366 `agentLoop(... { interactive:true })` **tanpa** `onConfirmRequired` | `coerceConfigValue` | **TIDAK** ❌ inkonsistensi | TIDAK | `update_config` |
| **d** | **Siklus otonom** SCREENER/MANAGER (cron) | index.js:906 (SCREENER), :496/:1092 (MANAGER) — `agentLoop` tanpa `interactive` | — | N/A | — | **TAK TERJANGKAU**: `update_config` ∉ `SCREENER_TOOLS`/`MANAGER_TOOLS` (agent.js:7-8) → `getToolsForRole` (agent.js:72-74) membuangnya |
| **e** | `gasReserveAutoTune` (cron harian, sebelum briefing) | index.js:278 `maybeAutoTuneGasReserve` → :293 `persistConfigChange(...)` | — | TIDAK | bound internal (floor, ±20%) | **tulis langsung** ke user-config.json (bypass `update_config`) |
| **f** | `evolveThresholds` (tiap ≥5 close live) | lessons.js:402 → :491 `fs.writeFileSync` | — | TIDAK | bound internal | **tulis langsung** ke user-config.json (bypass `update_config`) |

### Catatan per jalur

- **Jalur d (otonom) itu de-facto MATI untuk tulis-config.** Prompt SCREENER butir 4 "POST-DEPLOY INTERVAL" (prompt.js:90-92) menyuruh model `update_config managementIntervalMin=N`, tapi tool itu di-filter keluar untuk role SCREENER. **Bukti empiris:** seluruh baris `[CONFIG] Agent self-tuned:` di log 06-12 & 06-13 berasal dari sumber manual (`/setcfg`, `Telegram settings menu`, dan satu casual-chat) — **nol** self-tune otonom. Jadi handling khusus `managementIntervalMin`/`screeningIntervalMin` di executor.js:700-704 (skip-lesson) itu vestigial.
- **Jalur e & f bypass `update_config`** sepenuhnya — mereka tidak lewat `CONFIG_MAP` maupun konfirmasi. Masing-masing terkunci ke key tertentu (e→`gasReserve`; f→`minFeeActiveTvlRatio`+`minOrganic`). Tidak menyentuh `*Model`. (Sudah terdokumen di audit 2026-06-13.)
- **Semua jalur LLM/menu/setcfg memakai parser value yang longgar.** `coerceConfigValue`/`parseConfigValue` cuma mengubah `"true"/"false"/"off"/"null"/angka`; **string lain diteruskan apa adanya** (executor.js:303-312). Tidak ada whitelist nilai per-key.

---

## #2 — Shown vs Applied (kunci misteri)

### Untuk kasus `screeningModel`: SHOWN == APPLIED (terbukti)

Log eksplisit menulis nilai "verify":
```
[2026-06-13T09:29:09.585Z] [CONFIG] update_config: config.llm.screeningModel
   minimax/minimax-m2.7 → minimax_m2_5 (verify: minimax_m2_5)
```
Action log mencatat **tool-arg yang masuk sudah rusak**:
```json
{"tool":"update_config","args":{"key":"screeningModel","value":"minimax_m2_5"}, ...}
```
`requestConfirmation` (index.js:1919-1922) membangun baris konfirmasi `screeningModel: minimax/minimax-m2.7 → minimax_m2_5` dari args yang **sama**. Lalu executor menulis nilai itu lewat `coerceConfigValue`, yang untuk string non-numerik/non-boolean **mengembalikan apa adanya** (executor.js:311) → tidak ada transformasi. **Tidak ada titik di mana value diregenerasi/diparse-ulang setelah user menekan Ya.** Jadi untuk model id, shown selalu == applied.

➡️ Artinya hipotesis "di konfirmasi bener, ke-tulis salah" **tidak akurat untuk kasus ini**. Yang lebih mungkin: yang ditampilkan (`minimax_m2_5`) **sudah** versi rusak, tapi secara visual mirip "minimax m2.5" (underscore vs spasi/titik gampang ketuker di HP), jadi user mengira benar lalu approve.

### TAPI ada celah laten shown ≠ applied (untuk key LAIN)

Desainnya punya **dua parser independen** untuk args yang sama: `requestConfirmation` (index.js:1859-1893, untuk DISPLAY) dan executor `update_config` (untuk APPLY). Komentar di kode (index.js:1858) sendiri mengakui "keep the two in sync" — artinya rawan divergen. Yang sudah berbeda hari ini:

| Sumber divergensi | requestConfirmation menampilkan | executor menulis | Dampak |
|---|---|---|---|
| **STRATEGY_BIN_KEYS** clamp (executor.js:545-551) `max(35, round(n))` | nilai mentah (mis. `binsBelow → 10`) | **35** (di-floor) | shown ≠ applied **nyata** |
| **timeframe auto-scale** (executor.js:595-603) | hanya baris `timeframe` | timeframe **+ `minFeeActiveTvlRatio` + `minVolume`** (di-scale) | ada key tertulis yg **tak pernah ditampilkan/dikonfirmasi** |
| **strategyLock invalid→default** (executor.js:621-627) | nilai invalid apa adanya | direset jadi `"default"` | shown ≠ applied |
| **ARRAY_KEYS** split (executor.js:542-544) | string koma `"trending,top"` | array `["trending","top"]` | kosmetik (nilai sama) |

➡️ Untuk **rancangan kekangan**: divergensi-divergensi ini perlu dirapikan kalau mau jaminan "shown==applied" total, **tapi tak satu pun** menyebabkan bug screeningModel. Prioritas tetap di **validasi format** (#3).

---

## #3 — Validasi Format: TIDAK ADA

- **Coercion only**: `coerceConfigValue` (executor.js:303-312) & `parseConfigValue` (index.js:1737) hanya menebak tipe (bool/null/number). String arbitrer **lolos verbatim**.
- **`CONFIG_MAP` (executor.js:319-498)** murni pemetaan `key → [section, field]`. **Nol validator per-key.** Tidak ada regex, enum, range, atau pengecekan `provider/slug` untuk `managementModel`/`screeningModel`/`generalModel`.
- **Skema tool (`definitions.js:393-430)** memberi daftar key valid, tapi untuk Models **tidak ada hint format maupun contoh** — model LLM tak punya rambu untuk memproduksi `minimax/minimax-m2.5` alih-alih `minimax_m2_5`.
- Validasi yang ADA, semuanya numerik/struktural, bukan format string:
  - clamp bin (executor.js:545-551, 635-644), `MIN_SAFE_BINS_BELOW`
  - `strategyLock` enum reset (executor.js:621-627) ← satu-satunya enum-guard yang ada
  - clamp menu step (index.js:2395-2400)

---

## #4 — Rekonstruksi Bug `screeningModel` (timeline)

Sumber: `logs/agent-2026-06-13.log:1543-1547` + `logs/actions-2026-06-13.jsonl:30-31`.

```
09:29:00.615  [TELEGRAM] Incoming: "screening model ubah ke minimax m2.5"
09:29:01.640  [AGENT] Step 1/20                          (role=GENERAL, generalModel)
              → LLM memanggil update_config dengan arg:
                {"key":"screeningModel","value":"minimax_m2_5"}   ← SUDAH rusak di sini
              → (Telegram path = wiring onConfirmRequired → prompt "⚠️ Update config?"
                 dikirim via sendMessageWithButtons; TIDAK ditulis ke log)
              → user menekan ✅ Ya (callback confirm:yes, juga tidak di-log)
09:29:09.585  [CONFIG] update_config: config.llm.screeningModel
                 minimax/minimax-m2.7 → minimax_m2_5 (verify: minimax_m2_5)
09:29:09.593  [LESSONS] [SELF-TUNED] Changed screeningModel=minimax_m2_5
09:29:11.164  [AGENT] Final answer: "I have updated the screening model to `minimax_m2_5`."
10:09:29.350  [CONFIG] update_config no-op — already at requested values: screeningModel
                 (user/LLM mencoba lagi, value sama persis → no-op)
```

**Siapa yang nulis:** jalur **c** (casual chat Telegram, GENERAL LLM, index.js:3028).
**Shown vs tertulis:** keduanya `minimax_m2_5` (lihat `(verify: ...)`), shown==applied.
**Garble terjadi di LLM**, bukan di kode tulis: user mengetik `minimax m2.5`, model mengubahnya jadi slug `minimax_m2_5` (buang provider `minimax/`, spasi+titik → `_`). Maksud benar kemungkinan `minimax/minimax-m2.5`.

**Kenapa lolos:** (1) tak ada validasi format model id; (2) konfirmasi menampilkan nilai rusak yang *terlihat mirip* maksud user; (3) `coerceConfigValue` meneruskan string apa adanya.

> Catatan: absennya baris log "Update config?" **bukan** bukti konfirmasi dilewati — `sendMessageWithButtons` (index.js:1923) & callback `confirm:yes` (index.js:2645-2658) memang tak menulis ke agent log. Jalur Telegram (3028) terbukti mem-wiring `onConfirmRequired`, jadi prompt PASTI muncul. (Bandingkan jalur **c2** CLI REPL yang justru TIDAK mem-wiring-nya.)

---

## #5 — Usulan Allowlist / Kekangan Per-Jalur (presisi, bukan blanket)

Prinsip: **jangan persempit alur konfirmasi** (sudah jujur). Tambahkan **lapisan validasi nilai** di titik tulis tunggal (`update_config`), plus rapikan inkonsistensi jalur.

### A. Validasi format per-key (paling berdampak — langsung mematikan bug ini)
Tambahkan validator opsional di `CONFIG_MAP`/sebelum `applied[...]=...` (executor.js:538-554). Key sensitif:

| Key | Aturan validasi yang disarankan | Kalau gagal |
|---|---|---|
| `managementModel`, `screeningModel`, `generalModel` | wajib match `^[a-z0-9-]+/[a-z0-9._-]+(:[a-z]+)?$` (pola `provider/slug[:tag]`) **ATAU** ada di daftar model yang diketahui | tolak → `{success:false, error:"model id harus format provider/slug, mis. minimax/minimax-m2.5"}`, **jangan tulis** |
| `stopLossPct`, `takeProfitPct`, `trailingTriggerPct`, `trailingDropPct` | numerik & dalam rentang waras (mis. 0–100), tolak negatif/teks | tolak |
| `deployAmountSol`, `maxDeployAmount`, `positionSizePct`, `gasReserve` | numerik > 0; `positionSizePct` ≤ 1; `deployAmountSol` ≤ `maxDeployAmount` | tolak / clamp + tampilkan |
| `strategy`, `strategyLock`, `screeningSource`, `pnlSource`, `gmgnFeeSource`, `discordSignalMode` | enum (sudah ada pola untuk strategyLock di :621-627; perluas) | reset/tolak |

> Untuk `*Model` sebaiknya **tolak (hard)**, bukan auto-koreksi — menebak "minimax_m2_5" → mana? ambigu. Lebih aman gagal + minta user/LLM kasih id valid.

### B. Allowlist per-jalur (siapa boleh ubah apa)

| Jalur | Key yang wajar | Catatan kekangan |
|---|---|---|
| **d. Otonom (SCREENER/MANAGER)** | hanya `managementIntervalMin` (kalau memang mau dihidupkan) | Saat ini **nol** (tool tak terjangkau). Kalau diinginkan: bikin tool sempit khusus `set_management_interval` dengan domain {3,5,10}, **bukan** `update_config` umum. Jangan beri akses `*Model`/sizing/SL ke role otonom. |
| **c. Casual chat (Telegram)** | banyak, TAPI lewat **validasi A** + konfirmasi (sudah ada) | Tambahan: untuk key di kelompok "sensitif" (`*Model`, `stopLossPct`, `deployAmountSol`, `maxDeployAmount`, `positionSizePct`, `maxPositions`) tampilkan **label peringtan** di prompt konfirmasi + tegaskan nilai final yang akan ditulis (post-coercion), supaya yang dilihat user = byte yang ditulis. |
| **c2. Casual chat (CLI REPL)** | sama seperti c | **FIX inkonsistensi**: wiring `onConfirmRequired` juga di index.js:3366 (atau sadar-terima bahwa REPL = operator lokal tepercaya). Minimal: validasi A tetap jalan karena lewat executor yang sama. |
| **a. `/setcfg`** & **b/b2. `/settings`** | penuh (operator manual) | Tetap lewat validasi A (executor sama). Manual = boleh, tapi format tetap dijaga agar tak nulis model id rusak diam-diam. |
| **e. gasReserveAutoTune** | hanya `gasReserve` | sudah terkunci; OK. |
| **f. evolveThresholds** | hanya `minFeeActiveTvlRatio`, `minOrganic` | sudah terkunci; OK. |

### C. Tandai key SENSITIF (butuh validasi ekstra)
`managementModel`, `screeningModel`, `generalModel` (format `provider/slug`), `stopLossPct`, `takeProfitPct`, `trailing*Pct`, `deployAmountSol`, `maxDeployAmount`, `positionSizePct`, `maxPositions`, `strategyLock`. Untuk ini: **validasi format/range + konfirmasi yang menampilkan nilai final pasca-coercion**.

### D. Beri rambu ke LLM (murah, melengkapi A)
Di `definitions.js` baris "Models:", tambahkan contoh format eksplisit: `managementModel/screeningModel/generalModel — HARUS "provider/slug", contoh "minimax/minimax-m2.5", "openrouter/healer-alpha". Jangan kirim nama yang di-slugify.` Mengurangi peluang LLM meng-garble di hulu (meski validasi A tetap jaring pengaman utama).

---

## Lampiran — Bukti file:line ringkas

- Penulis tunggal: `tools/executor.js:298` (`update_config`), `CONFIG_MAP` :319-498, coercion :303-312, tulis file :685.
- Konfirmasi: `agent.js:9` (`CHAT_CONFIRM_TOOLS`), gating :438-445; `index.js:1850` (`requestConfirmation`), baris display :1919-1922, callback :2645-2658.
- Role filter: `agent.js:7-8` (set), :72-74 (`getToolsForRole`). `update_config` cuma di GENERAL (`GENERAL_INTENT_ONLY_TOOLS` :13, intent `config` :38).
- Jalur: `/setcfg` index.js:2912; menu `applySettingsMenuCallback` :2255 (tulis :2408); input field :2662-2691; chat Telegram :3028; chat CLI :3366; otonom :496/:906/:1092.
- Auto-tuner langsung: `index.js:278` (gasReserve, `persistConfigChange` :293); `lessons.js:402` (`evolveThresholds`, write :491).
- Bukti bug: `logs/agent-2026-06-13.log:1543-1547`; `logs/actions-2026-06-13.jsonl:30-31`; prompt mati `prompt.js:90-92`.
</content>
</invoke>
