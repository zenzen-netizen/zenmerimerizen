# Casual-Chat Trade-Safety — Progress

> Tujuan: aksi-trade (deploy/close/claim/swap) lewat **casual chat / interaktif** WAJIB
> konfirmasi dulu; kalimat ambigu "ubah X" diarahkan ke **setelan** (update_config), bukan
> trade. Jalur **otonom** (SCREENER/MANAGER cron) TIDAK boleh ke-gate — harus tetap
> auto-trade. Branch: `experimental`.

## Checklist
- ✅ FASE 1 — Investigasi (read-only, no commit)
- ✅ FASE 2 — Fix: wajib konfirmasi aksi-trade di jalur interaktif (CHAT_CONFIRM_TOOLS + requestConfirmation) — COMMIT
- ✅ FASE 3 — Disambiguasi: prompt GENERAL + router role (kalimat "ubah X" → setelan) — COMMIT

### FASE 2 — DIKERJAKAN
- `agent.js:9` — `CHAT_CONFIRM_TOOLS` kini = `update_config` + 4 aksi-trade (deploy/close/claim/swap).
- `index.js` — `requestConfirmation` dipecah: kalau `toolName !== "update_config"` → cabang
  baru `requestActionConfirmation` (prompt aksi generik via `summarizeTradeAction`, single-flight
  + timeout 30s + callback `confirm:yes/no` yang sama). Tanpa ini, arg deploy bikin `effective`
  kosong → auto-confirm (lihat FASE 1.D).
- Gate tetap `interactive && onConfirmRequired` → hanya jalur Telegram (3434) kena; otonom aman.

---

## FASE 1 — TEMUAN (READ-ONLY)

### A. Tool yang bisa dipanggil role GENERAL (casual chat) — yang AKSI-TRADE ditandai 🔴

GENERAL memfilter tool lewat **intent-matching** (`getToolsForRole` + `INTENT_TOOLS`,
agent.js:32-87). Tool aksi-trade (gerak dana/posisi on-chain) yang terjangkau:

| Tool | Intent yang membuka | Di CHAT_CONFIRM_TOOLS? (SEBELUM fix) |
|------|---------------------|--------------------------------------|
| 🔴 `deploy_position` | `deploy` (+ router Telegram kirim frasa "deploy" ke role **SCREENER**) | ❌ TIDAK |
| 🔴 `close_position`  | `close` | ❌ TIDAK |
| 🔴 `claim_fees`      | `claim` | ❌ TIDAK |
| 🔴 `swap_token`      | `swap`, `close` | ❌ TIDAK |

Tool lain GENERAL = read-only (get_*, list_*, search_*) atau mutasi non-dana
(update_config, add_lesson, blacklist, dst). `update_config` **sudah** di CHAT_CONFIRM_TOOLS.

Catatan: keempat tool di atas = persis `ONCHAIN_WRITE_TOOLS` (agent.js:129). Tak ada tool
`rebalance` di codebase (close+open = dua aksi terpisah).

### B. Status konfirmasi (gating) SEBELUM fix

- `CHAT_CONFIRM_TOOLS = new Set(["update_config"])` (agent.js:9).
- Gate: agent.js:438 `if (interactive && onConfirmRequired && CHAT_CONFIRM_TOOLS.has(name))`.
- **Hipotesis TERKONFIRMASI:** ketiga/keempat tool aksi-trade **BELUM** di set itu →
  di jalur interaktif **langsung eksekusi tanpa prompt**. Hanya `update_config` yang gated.

### C. Jalur mana yang punya `onConfirmRequired` (interaktif) vs tidak (otonom)

| Jalur | Lokasi | interactive | onConfirmRequired | Kena gate? |
|-------|--------|-------------|-------------------|-----------|
| **Telegram casual chat** | index.js:3434 | ✅ true | ✅ `requestConfirmation` | **YA** — ini yang mau di-gate |
| Otonom SCREENER (cron) | index.js:906 | ❌ (default false) | ❌ (none) | TIDAK — tetap auto |
| Otonom MANAGER (cron) | index.js:496 | ❌ | ❌ | TIDAK — tetap auto |
| Otonom MANAGER health-check | index.js:1092 | ❌ | ❌ | TIDAK — tetap auto |
| CLI REPL free-chat | index.js:3778 | ✅ true | ❌ (sengaja, operator console) | TIDAK (by design) |
| CLI deploy "N"/"auto" | index.js:3574/3590 | ❌ | ❌ | TIDAK (perintah eksplisit operator) |

➡️ **Bukti pagar:** gate butuh `interactive && onConfirmRequired` keduanya true. Hanya jalur
Telegram chat (3434) yang memenuhi. Menambah tool ke CHAT_CONFIRM_TOOLS **hanya** menyentuh
jalur itu; otonom (496/906/1092) tak pernah pass `onConfirmRequired` → tak terpengaruh.

### D. Sub-temuan penting: `requestConfirmation` saat ini HANYA paham `update_config`

`requestConfirmation` (index.js:1956) memparse arg sebagai perubahan config (key/value/
section). Untuk arg deploy/close (pool_address, amount_y, position_address…) tidak ada key
config → `effective` kosong → **`return true` (auto-confirm!)**. Jadi sekadar menambah tool ke
CHAT_CONFIRM_TOOLS TIDAK cukup; `requestConfirmation` harus dibuat menangani aksi-trade dengan
prompt aksi generik. (Diperbaiki di FASE 2.)

### E. Akar "ubah deploy jadi 0.3" → bisa buka posisi

Router Telegram (index.js:3429-3431): frasa mengandung `\bdeploy\b` (tanpa close-intent) →
`agentRole = SCREENER`. Jadi **"ubah deploy jadi 0.3" salah-rute ke SCREENER**, yang TIDAK
punya `update_config` — model hanya bisa `deploy_position`/screening. Akibatnya niat "ubah
SETELAN deployAmount" bisa berubah jadi aksi deploy. (Diperbaiki di FASE 3: router + prompt.)

(Tidak ada commit di fase ini.)

---

## FASE 3 — DIKERJAKAN
- `index.js` router (telegramHandler ~3492): tambah guard `isSettingEdit`
  (ubah/ganti/naikin/turunin/set/atur/… EN+ID). Frasa ubah-setelan → `isDeployRequest=false`
  → role **GENERAL** (yang punya update_config), bukan SCREENER. Tes routing 9/9 lulus.
- `prompt.js` (GENERAL prompt): blok **INTENT DISAMBIGUATION** — "ubah/set/ganti/naikin/turunin
  <x>" = update_config (SETELAN), kata "deploy/amount/size" di frasa itu = nama setelan, bukan
  order; buka/tutup posisi hanya kalau jelas; ragu → tanya dulu.

## VERIFIKASI (lapor)
- **(b) interaktif:**
  - "ubah deploy jadi 0.3" → router=GENERAL; GENERAL punya update_config (config-intent) DAN
    deploy_position (deploy-intent), prompt mengarahkan ke update_config; kalau toh model coba
    deploy → gate FASE 2 minta konfirmasi → bisa Batal. (Defense-in-depth, BUKAN auto-buka.)
  - "buka posisi …" / "deploy 0.5 SOL into <pool>" → router=SCREENER; deploy_position kini di
    CHAT_CONFIRM_TOOLS → muncul prompt "⚠️ Konfirmasi aksi ini? 🚀 BUKA POSISI …" dulu.
- **(c) OTONOM tak terpengaruh (bukti):** gate `agent.js:443` butuh `interactive &&
  onConfirmRequired`. Tiga call otonom TIDAK pass keduanya:
  - SCREENER `index.js:906` opts = `{ allowNoToolFinal, onToolStart, onToolFinish }` (no interactive/onConfirmRequired)
  - MANAGER `index.js:496` opts = `{ onToolStart, onToolFinish }`
  - MANAGER health `index.js:1092` tanpa opts → `{}`
  → `interactive` default false → gate short-circuit → deploy/close jalan otomatis. Manajemen
  TURTLE-SOL (lewat MANAGER 496) tak tersentuh.
- **CLI REPL (`index.js:3778`)**: `interactive:true` tapi TANPA onConfirmRequired (operator
  console, by design) → gate juga tak fire di sini. Sesuai pagar (hanya jalur onConfirmRequired).
