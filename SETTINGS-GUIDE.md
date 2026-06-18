# Meridian — Panduan Setting Lengkap

> Referensi cepat untuk semua konfigurasi bot.
> Semua setting disimpan di `user-config.json` kecuali yang ditandai `.env`.
> Nilai "Sekarang" = konfigurasi aktif kamu per Juni 2026.

---

## Cara Ubah Setting

**Opsi 1 — Edit file langsung:**
```
nano user-config.json
```
Bot membaca ulang sebagian setting otomatis. Untuk perubahan jadwal/model/risk → restart bot.

**Opsi 2 — Lewat chat Telegram/REPL:**
```
set minOrganic to 80
update config maxPositions 3
ubah min age token ke 3 jam
```
LLM memanggil `update_config`, lalu bot kirim tombol konfirmasi **✅ Ya / ❌ Batal** (expired 30 detik). Setelah dikonfirmasi, perubahan berlaku langsung tanpa restart. Satu setting bisa dikirim sebagai pasangan `key`/`value` (mis. `key="minTokenAgeHours"`, `value="3"`) — ini yang dipakai model ringan; banyak setting sekaligus pakai objek `changes`.

**Opsi 3 — Lewat menu Telegram:**
Ketik `/settings` di Telegram → ada tombol untuk setting yang paling sering diubah.

**Opsi 4 — Ganti SEKALIGUS pakai preset:**
`/preset use <nama>` menukar seluruh `user-config.json` dengan profil tersimpan (mis. ganti dari profil `mainzen` ke `bigcapagresif` sekali jalan). Lihat **Config Presets** di bawah.

**Lihat config saat ini:**
- `/config` → tampilkan **seluruh** config runtime, dikelompokkan sama persis dengan grup di panduan ini (GRUP 1–15 + blok GMGN). Nilainya dibaca langsung dari config bot yang sedang jalan (real-time), bukan dari file panduan ini.
- `/status` → snapshot wallet + posisi + all-time PnL.

---

## Struktur File Konfigurasi

```
user-config.json     ← Semua setting perilaku bot (EDIT INI)
.env                 ← Kunci rahasia: wallet, API key, RPC
gmgn-config.json     ← Setting GMGN khusus (opsional)
config.js            ← Bot membaca semua file di atas (JANGAN EDIT)
```

---

## 🧬 Profil vs 🗂️ Racikan (dua konsep "preset" yang beda!)

Dulu kata "preset" dipakai untuk dua hal berbeda → bikin bingung. Sekarang dipisah jelas:

| | 🧬 **Profil** | 🗂️ **Racikan** |
|---|---|---|
| Apa | Arketipe/karakter dasar dari **wizard setup** | **Snapshot config penuh** yang kamu simpan sendiri |
| Nilai | `degen` / `moderate` / `safe` / `custom` | nama bebas: `mainzen`, `mainzen_v2`, `bigcapagresif`, … |
| Kapan di-set | Sekali, saat instalasi (`setup.js`) | Tiap kali `/preset save` atau `/preset use` |
| Sifat | **Statis** (cuma ganti kalau setup ulang) | **Dinamis** (ganti racikan kapan aja) |
| Field | `preset` di `user-config.json` | `activeSetup` (otomatis di-stamp) |

Keduanya **hidup bareng**: kamu bisa "Profil ⚖️ Moderate + lagi pakai Racikan `mainzen_v2`".
Beda lagi dari **indicator preset** (`entryPreset`/`exitPreset`) yang itu sinyal teknikal, bukan config utuh.

Cek dua-duanya: baris paling atas `/config` dan menu `/settings` nampilin:
```
🧬 Profil: ⚖️ Moderate
🗂️ Racikan: mainzen_v2 ✎ (ada edit manual)
```
Tanda **`✎ (ada edit manual)`** muncul kalau config live udah kamu obok-obok setelah load racikan —
jadi tahu "ini mainzen_v2 tapi udah nggak murni lagi". Tiap deploy/close juga di-stamp racikan-nya,
jadi `/report` punya breakdown **🗂️ By racikan** (atribusi performa per racikan) + notif deploy nampilin barisnya.

> Loading racikan via `/preset use mainzen_v2` otomatis nge-set `activeSetup="mainzen_v2"`.
> `/preset save mainzen_v4` = "namai config sekarang jadi mainzen_v4" (live `activeSetup` ikut ke-set).

---

## Config Presets / Racikan (Simpan & Ganti Config)

Sebuah **racikan (config preset)** = snapshot LENGKAP `user-config.json` yang disimpan di folder
`presets/<nama>.json`. Gunanya: simpan beberapa racikan bot lalu tukar cepat tanpa ngisi
ulang puluhan setting (mis. `mainzen` untuk small/mid degen vs `bigcapagresif` untuk
fee-farm pool besar). Folder `presets/` **local-only** (gitignore — berisi API key/identitas).

**Lewat Telegram / REPL — command `/preset`:**
| Command | Aksi |
|---------|------|
| `/preset list` | Daftar semua preset (● = cocok dengan config sekarang, 🧪 = dry-run) |
| `/preset save <nama>` | Simpan config saat ini jadi preset baru |
| `/preset show <nama>` | Lihat setting apa saja yang berubah kalau preset itu di-load |
| `/preset use <nama>` | Load preset → tulis ke `user-config.json` (auto-backup dulu) |
| `/preset rm <nama>` | Hapus preset |

**Lewat menu tombol:**
`/settings` → tombol **🗂️ Racikan**. Tiap racikan punya 3 tombol: **▶** load (konfirmasi → backup → restart), **🔍** lihat beda vs config sekarang, **🗑️** hapus (ada konfirmasi). Tombol **💾 Simpan config sekarang** di bawah → bot tanya nama → kesimpan jadi racikan baru. Jadi save + load + hapus semua bisa dari menu tanpa ngetik command (kecuali nama racikan saat save).

**Lewat terminal (bot boleh dalam keadaan mati):**
```
node preset.js list
node preset.js save mainzen
node preset.js show bigcapagresif
node preset.js use  bigcapagresif
```

**Penting soal restart:** `/preset use` selalu **backup** config lama dulu (`presets/_backup.json`
→ rollback: `/preset use _backup`), lalu menukar file. Mayoritas setting berlaku setelah
**restart proses** karena key level-env (`DRY_RUN`, wallet, RPC, model LLM) dibaca sekali saat
start — restart cron saja tidak cukup. Kalau bot jalan di bawah **pm2**, `/preset use` otomatis
restart (pm2 menghidupkan lagi); kalau tidak, jalankan `pm2 restart meridian` manual.

### `promptNotes` — instruksi prompt bawaan racikan

Racikan bisa membawa **"karakter" prompt-nya sendiri** lewat key `promptNotes` di file
`presets/<nama>.json`: array berisi kalimat instruksi bebas yang disuntikkan ke prompt
SCREENER sebagai blok **RACIKAN RULES** — instruksi keras, menang atas guideline soft
(tapi tidak pernah menimpa HARD RULE / safety check mekanis). Bentuk object
`{ "screener": [...], "manager": [...], "general": [...] }` bisa dipakai untuk per-role;
array polos = khusus SCREENER. Racikan tanpa `promptNotes` = prompt pabrik murni.

Gunanya: identitas/perilaku ngikut racikan, bukan kode — clone bot ke mana pun, load
racikan yang sama → perilaku sama persis. Edit hanya lewat **file preset** (bukan
`/setcfg`): tambah/ubah kalimat di `presets/<nama>.json` → `/preset use <nama>` → beres.
Contoh nyata: `mainzen_v3` membawa aturan "zero smart wallet = sinyal soft, bukan filter
keras" — dulu hardcoded di prompt.js, sekarang ikut racikan.

---

# GRUP 1 — RISIKO & MODAL

> Mengontrol berapa banyak SOL yang berani dipertaruhkan dan berapa posisi yang boleh buka.
> Di `config.js` masuk ke: `config.risk` dan `config.management`

---

### `dryRun`
| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `true` |
| **Format** | `true` atau `false` |
| **Opsi** | `true` = simulasi, tidak ada uang keluar. `false` = live trading nyata |
| **Catatan** | Selalu set `true` dulu saat testing konfigurasi baru |

---

### `maxPositions`
| | |
|---|---|
| **Nilai sekarang** | `2` |
| **Default** | `3` |
| **Format** | Angka bulat |
| **Opsi** | `1` – `10` |
| **Penjelasan** | Berapa posisi boleh buka bersamaan. Bot berhenti deploy kalau sudah penuh |

---

### `maxDeployAmount`
| | |
|---|---|
| **Nilai sekarang** | `50` |
| **Default** | `50` |
| **Format** | Angka desimal (SOL) |
| **Opsi** | `0.1` – `1000` |
| **Penjelasan** | Batas atas deploy per posisi dalam SOL. Tidak pernah melebihi ini meskipun wallet besar |

---

### `deployAmountSol`
| | |
|---|---|
| **Nilai sekarang** | `0.1` |
| **Default** | `0.5` |
| **Format** | Angka desimal (SOL) |
| **Opsi** | `0.05` – `maxDeployAmount` |
| **Penjelasan** | Jumlah minimum deploy. Kalau wallet kecil, ini yang dipakai. Kalau wallet besar, dihitung dari `positionSizePct` |

---

### `positionSizePct`
| | |
|---|---|
| **Nilai sekarang** | `0.35` |
| **Default** | `0.35` |
| **Format** | Desimal antara `0` dan `1` |
| **Opsi** | `0.05` – `0.95` |
| **Penjelasan** | 35% dari saldo yang tersedia per posisi. Rumus: `(saldo - gasReserve) × positionSizePct`, lalu diclamp ke `deployAmountSol`–`maxDeployAmount` |
| **Contoh** | Wallet 2 SOL, gasReserve 0.1 → deployable 1.9 SOL × 0.35 = 0.665 SOL |

---

### `minSolToOpen`
| | |
|---|---|
| **Nilai sekarang** | `0.15` |
| **Default** | `0.55` |
| **Format** | Angka desimal (SOL) |
| **Opsi** | `0.05` – `5.0` |
| **Penjelasan** | Saldo minimum sebelum bot boleh deploy. Kalau SOL di bawah ini, bot diam meski ada slot kosong |

---

### `gasReserve`
| | |
|---|---|
| **Nilai sekarang** | `0.1` |
| **Default** | `0.2` |
| **Format** | Angka desimal (SOL) |
| **Opsi** | `0.05` – `1.0` |
| **Penjelasan** | SOL yang selalu dikunci untuk gas biaya transaksi. Tidak pernah dipakai deploy |

---

### `sizingMode`
| | |
|---|---|
| **Default** | `fixed` |
| **Format** | Pilihan: `fixed` \| `maximize` |
| **Penjelasan** | Cara bot menghitung jumlah deploy. **`fixed` (pabrik)** = rumus lama `(saldo − gasReserve) × positionSizePct`, lalu diclamp ke `deployAmountSol`–`maxDeployAmount`. Buta jumlah-slot: tiap deploy ambil porsi yang sama, jadi posisi terakhir bisa kehabisan SOL. **`maximize`** = bagi saldo **rata ke sisa slot posisi** sambil mencadangkan gas + `rentPerPositionSol` per slot, lalu floor 3-desimal supaya tidak pernah over-commit. Rumus: `(saldo − gasReserve − rentPerPositionSol × sisa_slot) / sisa_slot`. Tujuannya: semua `maxPositions` slot bisa kebuka tanpa yang terakhir gagal gara-gara rent. Di mode `maximize`, floor `deployAmountSol` **sengaja dilewati** (boleh deploy < `deployAmountSol`), tapi gerbang minimum `max(0.1, deployAmountSol)` di executor tetap berlaku — jadi kalau pakai `maximize`, set `deployAmountSol` ≤ ukuran per-slot terkecil (mis. 0.1). |
| **Contoh** | Wallet 0.4, gas 0.03, rent 0.057, maxPositions 2 → tiap slot `(0.4 − 0.03 − 0.057×2)/2 = 0.128` SOL; dua-duanya kebuka, sisa ≈ gasReserve. |

---

### `rentPerPositionSol`
| | |
|---|---|
| **Default** | `0` |
| **Format** | Angka desimal (SOL) |
| **Opsi** | `0` – `1.0` (rent nyata Meteora positionV2 ≈ `0.057`) |
| **Penjelasan** | SOL yang terkunci sebagai *account rent* tiap posisi DLMM terbuka (balik lagi saat posisi ditutup / refundable). **`0` (pabrik)** = cek saldo & sizing **abaikan** rent (perilaku lama; rent diam-diam makan buffer gas, posisi ke-N bisa gagal). **`> 0`** (mis. `0.057`) = cek saldo pre-deploy mencadangkan rent **di atas** gas, DAN sizing `maximize` mencadangkan rent per slot. Memperbaiki audit `executor.js` (balance check dulu cuma `amount + gasReserve`). |

---

---

# GRUP 2 — ATURAN KELUAR POSISI (EXIT RULES)

> Ini dieksekusi OTOMATIS oleh kode, bukan LLM. LLM hanya dikonsultasi kalau kode sudah tandai posisi perlu tindakan.
> Di `config.js` masuk ke: `config.management`

---

## 🔻 Urutan Rule Close (cara bot mutusin tutup posisi)

Setiap siklus, kode (`getDeterministicCloseRule()`, bukan LLM) ngecek posisi **urut dari atas ke bawah — yang PERTAMA cocok langsung menang**, sisanya nggak dicek. Ada **5 rule bernomor** + 2 jalur tambahan. Tiap baris: **mekanisme teknis** (syarat persis + nilai live) lalu **arti awam**.

| # | Nama | Mekanisme teknis — syarat (nilai live) | Arti awam |
|---|------|----------------------------------------|-----------|
| **1** | stop loss | `pnl_pct ≤ stopLossPct` (**−12%**) | Rugi nyentuh −12% → potong, jangan makin dalam |
| **2** | take profit | `pnl_pct ≥ takeProfitPct` (**+4%**) | Untung nyentuh +4% → kunci hasilnya |
| **3** | pumped far above range | `active_bin > upper_bin + outOfRangeBinsToClose` (**+10 bin**) | Harga pump jauh **ke atas** atap range (>10 bin di atas). Token kabur ke atas, kita udah nggak narik fee → tutup & redeploy |
| **4** | OOR (out of range) | `active_bin > upper_bin` **DAN** keluar ≥ `outOfRangeWaitMinutes` (**30 mnt**) | Harga keluar range ke atas **dan nyangkut** di luar >30 menit → tutup |
| **5** | low yield | `fee_per_tvl_24h < minFeePerTvl24h` (**6%**) **DAN** umur ≥ **60 menit** | Posisi udah >1 jam tapi fee yang dihasilkan di bawah lantai 6% → recycle modal ke pool yang lebih produktif |

**Plus 2 jalur tambahan (BUKAN nomor):**

| Jalur | Mekanisme teknis | Arti awam |
|-------|------------------|-----------|
| **Trailing TP** | Mekanisme terpisah (`trailingTakeProfit`). Track **puncak** PnL; tutup kalau turun dari puncak. Live: arm di `trailingTriggerPct` (**+1.5%**), tutup kalau drop `trailingDropPct` (**1%**) dari puncak | "Biarin untung lari, tapi amanin kalau mulai balik" — kunci sebagian profit yang udah ngambang |
| **indicator** | Exit via `exitPreset`. **Hanya jalan kalau `indicators.exitEnabled` = ON** (sekarang **OFF**). Dicek **setelah** rule 1–5 → rule keselamatan selalu menang | Sinyal teknikal (mis. RSI balik arah) ikut mutusin keluar — opsional, default mati |

> ⚠️ **Catatan baca log.** Pesan close kadang nampilin konteks ekstra, contoh: `Rule 5: low yield | fee_per_tvl_24h=1.97% < minFeePerTvl24h=6%, pnl=-0.05%, oor_minutes=18`. Angka `pnl` & `oor_minutes` di situ cuma **info tambahan**, BUKAN syarat. Pemicu Rule 5 cuma dua: fee di bawah lantai **dan** umur ≥ 60 menit.

---

### `stopLossPct`
| | |
|---|---|
| **Nilai sekarang** | `-60` |
| **Default** | `-50` |
| **Format** | Angka negatif |
| **Opsi** | `-10` sampai `-95` |
| **Penjelasan** | Bot close otomatis kalau PnL turun sampai angka ini. `-60` = close kalau rugi 60% |
| **Catatan** | Makin kecil (misal `-80`) = makin toleran rugi sebelum cut loss |

---

### `takeProfitPct`
| | |
|---|---|
| **Nilai sekarang** | `4` |
| **Default** | `5` |
| **Format** | Angka positif |
| **Opsi** | `0.5` – `100` |
| **Penjelasan** | Bot close otomatis kalau PnL naik sampai angka ini. `4` = close kalau untung 4% |

---

### `trailingTakeProfit`
| | |
|---|---|
| **Nilai sekarang** | `true` |
| **Default** | `true` |
| **Format** | `true` atau `false` |
| **Penjelasan** | Aktifkan trailing take profit. Bot track puncak PnL lalu close kalau turun dari puncak |

---

### `trailingTriggerPct`
| | |
|---|---|
| **Nilai sekarang** | `2` |
| **Default** | `3` |
| **Format** | Angka positif |
| **Opsi** | `0.5` – `50` |
| **Penjelasan** | Trailing baru aktif setelah PnL mencapai angka ini. `2` = trailing aktif mulai PnL +2% |

---

### `trailingDropPct`
| | |
|---|---|
| **Nilai sekarang** | `1` |
| **Default** | `1.5` |
| **Format** | Angka positif |
| **Opsi** | `0.1` – `10` |
| **Penjelasan** | Kalau dari puncak PnL turun sebesar ini → close. `1` = tutup kalau turun 1% dari puncak |
| **Contoh** | Puncak PnL +6%, drop 1% → close di +5% |

---

### `pnlSanityMaxDiffPct`
| | |
|---|---|
| **Nilai sekarang** | `5` |
| **Default** | `5` |
| **Format** | Angka positif |
| **Opsi** | `1` – `20` |
| **Penjelasan** | Kalau angka PnL dari chain berbeda lebih dari X% vs hitungan lokal → data dianggap tidak valid, tidak trigger exit otomatis. Perlindungan dari data glitch |

---

---

# GRUP 3 — OUT OF RANGE (OOR)

> Posisi "OOR" = harga token sudah di luar range yang kamu pasang, artinya tidak ada fee yang masuk.
> Di `config.js` masuk ke: `config.management`

---

### `outOfRangeBinsToClose`
| | |
|---|---|
| **Nilai sekarang** | `10` |
| **Default** | `10` |
| **Format** | Angka bulat |
| **Opsi** | `1` – `50` |
| **Penjelasan** | Berapa bin di luar range baru dianggap "OOR serius". Di bawah angka ini diabaikan |

---

### `outOfRangeWaitMinutes`
| | |
|---|---|
| **Nilai sekarang** | `30` |
| **Default** | `30` |
| **Format** | Angka bulat (menit) |
| **Opsi** | `5` – `240` |
| **Penjelasan** | Tunggu X menit setelah OOR sebelum LLM diminta evaluasi apakah perlu close |

---

### `oorCooldownTriggerCount`
| | |
|---|---|
| **Nilai sekarang** | `3` |
| **Default** | `3` |
| **Format** | Angka bulat |
| **Opsi** | `1` – `10` |
| **Penjelasan** | Setelah pool yang sama kena OOR sebanyak X kali → masuk cooldown (bot tidak deploy ke sana lagi sementara) |

---

### `oorCooldownHours`
| | |
|---|---|
| **Nilai sekarang** | `12` |
| **Default** | `12` |
| **Format** | Angka bulat (jam) |
| **Opsi** | `1` – `168` (1 minggu) |
| **Penjelasan** | Berapa jam cooldown untuk pool yang sering OOR |

---

---

# GRUP 4 — YIELD CHECK (Cek Efisiensi)

> Bot cek apakah posisi masih menghasilkan fee yang cukup. Kalau tidak, LLM diminta evaluasi.
> Di `config.js` masuk ke: `config.management`

---

### `minFeePerTvl24h`
| | |
|---|---|
| **Nilai sekarang** | `10` |
| **Default** | `7` |
| **Format** | Angka desimal (persen) |
| **Opsi** | `0.5` – `50` |
| **Penjelasan** | Fee per 24 jam harus minimal X% dari nilai TVL posisi. `10` = posisi harus earn 10% per hari. Di bawah ini → LLM evaluasi |

---

### `minAgeBeforeYieldCheck`
| | |
|---|---|
| **Nilai sekarang** | `90` |
| **Default** | `60` |
| **Format** | Angka bulat (menit) |
| **Opsi** | `10` – `480` |
| **Penjelasan** | Jangan cek yield sebelum posisi berumur X menit. Beri waktu posisi baru untuk mulai earn |

---

### `minVolumeToRebalance`
| | |
|---|---|
| **Nilai sekarang** | `1000` |
| **Default** | `1000` |
| **Format** | Angka (USD) |
| **Opsi** | `100` – `10000000` |
| **Penjelasan** | Volume minimum pool agar posisi dianggap layak dipertahankan |

---

---

# GRUP 5 — CLAIM & COOLDOWN DEPLOY ULANG

> Di `config.js` masuk ke: `config.management`

---

### `minClaimAmount`
| | |
|---|---|
| **Nilai sekarang** | `5` |
| **Default** | `5` |
| **Format** | Angka desimal (USD) |
| **Opsi** | `0.1` – `1000` |
| **Penjelasan** | Klaim fee hanya kalau nilainya minimal $X. Hindari buang gas untuk klaim receh |

---

### `autoSwapAfterClaim`
| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Penjelasan** | `true` = otomatis swap token hasil klaim ke SOL setelah claim |

---

### `repeatDeployCooldownEnabled`
| | |
|---|---|
| **Nilai sekarang** | `true` (default) |
| **Default** | `true` |
| **Format** | `true` atau `false` |
| **Penjelasan** | Aktifkan proteksi agar bot tidak bolak-balik deploy di pool/token yang sama |

---

### `repeatDeployCooldownTriggerCount`
| | |
|---|---|
| **Nilai sekarang** | `3` (default) |
| **Default** | `3` |
| **Format** | Angka bulat |
| **Opsi** | `1` – `20` |
| **Penjelasan** | Setelah X kali deploy di pool/token yang sama → masuk cooldown |

---

### `repeatDeployCooldownHours`
| | |
|---|---|
| **Nilai sekarang** | `12` (default) |
| **Default** | `12` |
| **Format** | Angka bulat (jam) |
| **Opsi** | `1` – `168` |
| **Penjelasan** | Durasi cooldown sebelum boleh deploy lagi ke pool/token yang sama |

---

### `repeatDeployCooldownScope`
| | |
|---|---|
| **Nilai sekarang** | `"token"` (default) |
| **Default** | `"token"` |
| **Format** | String |
| **Opsi** | `"pool"` / `"token"` / `"both"` |
| **Penjelasan** | Cooldown berlaku per pool, per token, atau keduanya |

---

### `repeatDeployCooldownMinFeeEarnedPct`
| | |
|---|---|
| **Nilai sekarang** | `0` (default) |
| **Default** | `0` |
| **Format** | Angka 0–100 |
| **Penjelasan** | Cooldown hanya berlaku kalau fee yang sudah dihasilkan minimal X%. `0` = selalu berlaku |

---

---

# GRUP 6 — SCREENING (Filter Pencarian Pool)

> Semua filter ini bekerja SEBELUM LLM melihat data. Pool yang tidak lolos tidak pernah sampai ke LLM.
> Di `config.js` masuk ke: `config.screening`

---

### `screeningSource`
| | |
|---|---|
| **Nilai sekarang** | `"meteora"` (default) |
| **Default** | `"meteora"` |
| **Format** | String |
| **Opsi** | `"meteora"` atau `"gmgn"` |
| **Penjelasan** | Dari mana bot cari pool. `meteora` = API resmi Meteora. `gmgn` = platform GMGN (butuh API key di gmgn-config.json) |

> ⚠️ **Penting — blok GMGN itu kondisional.** Seluruh setting GMGN (semua yang muncul di blok `━ GMGN` pada `/config`: `interval`, `requireKol`, `maxBundlerRate`, `indicatorFilter`, `indicatorInterval`, `rules.*`, dll) **HANYA aktif saat `screeningSource = "gmgn"`**. Selama source = `"meteora"` (default sekarang), semua setting GMGN **diabaikan total** — boleh saja terisi, tapi tidak memengaruhi screening apa pun. Sebaliknya, filter GRUP 6 & 7 di atas adalah jalur **Meteora**. Detail lengkap + soal indikator: lihat bagian **CATATAN — GMGN & DUA SISTEM INDIKATOR** di bawah.

---

### `timeframe`
| | |
|---|---|
| **Nilai sekarang** | `"30m"` |
| **Default** | `"5m"` |
| **Format** | String |
| **Opsi** | `"1m"` `"5m"` `"15m"` `"30m"` `"1h"` `"4h"` `"1d"` |
| **Penjelasan** | Window waktu untuk hitung volume, fee, dan volatilitas. Lebih panjang = data lebih stabil tapi lambat tangkap momen |

---

### `category`
| | |
|---|---|
| **Nilai sekarang** | `"trending"` |
| **Default** | `"trending"` |
| **Format** | String |
| **Opsi** | `"trending"` `"new"` `"all"` |
| **Penjelasan** | Kategori pool yang dicari dari Meteora. Dipakai kalau `screeningCategories` kosong/null (perilaku factory satu-kategori). |

---

### `screeningCategories`
| | |
|---|---|
| **Nilai sekarang** | `["trending", "top", "new"]` |
| **Default** | `null` (= factory: pakai `category` saja) |
| **Format** | Array string. Atur lewat: file/preset (array JSON), `/setcfg screeningCategories trending,top,new` (string koma → otomatis jadi array; `off`/`null` = kosongkan), atau toggle ✅/⬜ per kategori di `/settings` → **Screen**. |
| **Opsi valid** | `"trending"` `"top"` `"new"` |
| **Penjelasan** | **Multi-category merge.** Ambil tiap kategori di daftar lalu gabung + dedupe by pool_address. Semua filter kualitas (mcap/organic/fee-tvl/dst) tetap sama, jadi ini **memperluas kolam kandidat tanpa menurunkan keketatan**. Catatan: di bawah filter ketat, ketiga kategori sering balikin set yang identik (merge jadi ~1.0×, inert) — manfaatnya muncul kalau gate dilonggarin atau regime market beda. `null`/`[]` → balik ke perilaku satu-kategori (`category`). Fail-open: kategori yang gagal fetch hanya menyumbang 0 pool, tidak menggagalkan cycle. |

---

### `minTvl` dan `maxTvl`
| | |
|---|---|
| **Nilai sekarang** | min `10000` / max `1500000` |
| **Default** | min `10000` / max `150000` |
| **Format** | Angka (USD) |
| **Opsi** | `minTvl`: `100`–`10000000` / `maxTvl`: `minTvl`–`100000000` |
| **Penjelasan** | Rentang TVL pool yang diterima. TVL terlalu kecil = tidak likuid. TVL terlalu besar = fee kecil relatif |

---

### `minVolume`
| | |
|---|---|
| **Nilai sekarang** | `1000` |
| **Default** | `500` |
| **Format** | Angka (USD) |
| **Opsi** | `10` – `10000000` |
| **Penjelasan** | Volume trading minimum dalam timeframe yang dipilih |

---

### `minFeeActiveTvlRatio`
| | |
|---|---|
| **Nilai sekarang** | `0.1` |
| **Default** | `0.05` |
| **Format** | Desimal |
| **Opsi** | `0.001` – `1.0` |
| **Penjelasan** | Rasio fee aktif dibagi TVL aktif. `0.1` = pool harus menghasilkan fee minimal 10% dari TVL aktifnya. Makin tinggi = seleksi lebih ketat |

---

### `minTokenFeesSol`
| | |
|---|---|
| **Nilai sekarang** | `30` |
| **Default** | `30` |
| **Format** | Angka (SOL) |
| **Opsi** | `0.1` – `10000` |
| **Penjelasan** | Total fee yang pernah dibayar ke pool secara kumulatif. Terlalu rendah = mungkin pool baru/bundled/scam |

---

### `minOrganic` dan `minQuoteOrganic`
| | |
|---|---|
| **Nilai sekarang** | `75` / `60` |
| **Default** | `60` / `60` |
| **Format** | Angka 0–100 |
| **Opsi** | `0` – `100` |
| **Penjelasan** | Skor keaslian volume. `100` = semua trading nyata oleh manusia. `0` = semua wash trade/bot. `minOrganic` untuk token utama, `minQuoteOrganic` untuk pasangan (SOL) |

---

### `minMcap` dan `maxMcap`
| | |
|---|---|
| **Nilai sekarang** | min `450000` / max `10000000` |
| **Default** | min `150000` / max `10000000` |
| **Format** | Angka (USD) |
| **Penjelasan** | Rentang market cap token. Terlalu kecil = moonshot berisiko tinggi. Terlalu besar = momentum mungkin sudah habis |

---

### `minHolders`
| | |
|---|---|
| **Nilai sekarang** | `500` |
| **Default** | `500` |
| **Format** | Angka bulat |
| **Opsi** | `10` – `1000000` |
| **Penjelasan** | Jumlah holder token minimum. Sedikit holder = terlalu terpusat, rawan dump |

---

### `minTokenAgeHours` dan `maxTokenAgeHours`
| | |
|---|---|
| **Nilai sekarang** | `7` / `150` |
| **Default** | `null` / `null` |
| **Format** | Angka (jam) atau `null` |
| **Opsi** | `null` (nonaktif) atau `0` – `8760` |
| **Penjelasan** | Filter umur token. `minTokenAgeHours: 7` = token harus minimal 7 jam (hindari rug baru). `maxTokenAgeHours: 150` = token tidak boleh lebih dari 150 jam (hindari yang sudah terlalu tua) |

---

### `athFilterPct`
| | |
|---|---|
| **Nilai sekarang** | `null` |
| **Default** | `null` |
| **Format** | Angka negatif atau `null` |
| **Opsi** | `null` (nonaktif) atau `-90` sampai `-1` |
| **Penjelasan** | Hanya deploy kalau harga token masih dalam X% dari ATH. `-20` = harga harus max 20% di bawah ATH. Berguna untuk hindari token yang sudah jauh crash |

---

### `minBinStep` dan `maxBinStep`
| | |
|---|---|
| **Nilai sekarang** | min `80` / max `100` |
| **Default** | min `80` / max `125` |
| **Format** | Angka bulat |
| **Opsi** | `1` – `500` |
| **Penjelasan** | Filter bin step pool. Bin step = ukuran pergerakan harga per bin. Lebih besar = range lebih lebar, fee lebih besar tapi posisi lebih cepat OOR di sideways |

---

### `excludeHighSupplyConcentration`
| | |
|---|---|
| **Nilai sekarang** | `true` |
| **Default** | `true` |
| **Format** | `true` atau `false` |
| **Penjelasan** | Skip token kalau supply sangat terkonsentrasi di sedikit wallet (risiko dump) |

---

---

# GRUP 7 — KEAMANAN TOKEN

> Di `config.js` masuk ke: `config.screening`

---

### `maxBundlePct`
| | |
|---|---|
| **Nilai sekarang** | `30` |
| **Default** | `30` |
| **Format** | Angka 0–100 |
| **Penjelasan** | Maksimal % token yang dipegang bundler (bot farm yang beli serentak). Di atas ini = skip |

---

### `maxBotHoldersPct`
| | |
|---|---|
| **Nilai sekarang** | `30` |
| **Default** | `30` |
| **Format** | Angka 0–100 |
| **Penjelasan** | Maksimal % alamat holder yang terdeteksi bot oleh Jupiter audit |

---

### `maxTop10Pct`
| | |
|---|---|
| **Nilai sekarang** | `60` |
| **Default** | `60` |
| **Format** | Angka 0–100 |
| **Penjelasan** | Maksimal % supply yang dipegang 10 holder terbesar. Makin kecil = lebih terdesentralisasi |

---

### `avoidPvpSymbols` dan `blockPvpSymbols`
| | |
|---|---|
| **Nilai sekarang** | `true` / `false` |
| **Default** | `true` / `false` |
| **Format** | `true` atau `false` |
| **Opsi avoidPvpSymbols** | `true` = LLM diberi tahu untuk berhati-hati, bisa override |
| **Opsi blockPvpSymbols** | `true` = hard block total, pool PvP tidak sampai ke LLM |

---

### `allowedLaunchpads` dan `blockedLaunchpads`
| | |
|---|---|
| **Nilai sekarang** | `[]` / `[]` |
| **Default** | `[]` / `[]` |
| **Format** | Array of string |
| **Contoh** | `["pump.fun", "letsbonk.fun"]` |
| **Penjelasan allowedLaunchpads** | `[]` = semua launchpad boleh. Kalau diisi, HANYA dari launchpad ini yang diterima |
| **Penjelasan blockedLaunchpads** | Launchpad yang diblacklist. Pool dari sini tidak akan dipertimbangkan |

---

---

# GRUP 8 — SINYAL TAMBAHAN

> Di `config.js` masuk ke: `config.screening`

---

### `useDiscordSignals` dan `discordSignalMode`
| | |
|---|---|
| **Nilai sekarang** | `true` / `"merge"` |
| **Default** | `false` / `"merge"` |
| **Format** | boolean / string |
| **Opsi discordSignalMode** | `"merge"` = gabung sinyal Discord + Meteora. `"only"` = hanya dari Discord |
| **Penjelasan** | Bot bisa gunakan sinyal dari channel Discord sebagai input tambahan screening |

---

---

# GRUP 9 — STRATEGI RANGE (BINS)

> Di `config.js` masuk ke: `config.strategy`

---

### `strategy`
| | |
|---|---|
| **Nilai sekarang** | `"bid_ask"` |
| **Default** | `"bid_ask"` |
| **Format** | String |
| **Opsi** | `"bid_ask"` / `"spot"` / `"curve"` |
| **Penjelasan** | Bentuk distribusi likuiditas di dalam range. `bid_ask` = likuiditas terkonsentrasi di kedua tepi (strategi paling umum untuk LP aktif) |

---

### `strategyLock`
| | |
|---|---|
| **Default** | `"default"` |
| **Format** | String |
| **Opsi** | `"default"` / `"spot"` / `"bid_ask"` / `"curve"` |
| **Penjelasan** | Gembok strategi. `default` = perilaku pabrik yang fleksibel: AI boleh memilih strategi per pool, dan `strategy` di atas hanya jadi nilai cadangan kalau AI tidak menyebut apa-apa. Selain `default` = **kunci mekanis**: SETIAP deploy dipaksa pakai strategi itu di level kode (executor), apa pun yang diminta AI atau chat manual — beda dengan instruksi prompt yang masih bisa "dilanggar" model. Ini cara resmi meniru lock bid_ask ala mainzen_v2. Mau deploy manual dengan strategi lain? Set dulu `strategyLock` ke `default`. |

---

### `minBinsBelow`, `maxBinsBelow`, `defaultBinsBelow`
| | |
|---|---|
| **Nilai sekarang** | `35` / `69` / `69` |
| **Default** | `35` / `69` / `69` |
| **Format** | Angka bulat |
| **Opsi minBinsBelow** | Minimal `35` (floor keras dikunci kode, tidak bisa di bawah ini) |
| **Opsi maxBinsBelow** | `minBinsBelow` – `200` |
| **Penjelasan** | Lebar range di bawah harga saat ini (sisi beli). Volatilitas tinggi → LLM pilih lebih banyak bins. `defaultBinsBelow` dipakai kalau volatilitas tidak bisa dihitung |

---

---

# GRUP 10 — JADWAL BOT

> Di `config.js` masuk ke: `config.schedule`

---

### `managementIntervalMin`
| | |
|---|---|
| **Nilai sekarang** | `10` |
| **Default** | `10` |
| **Format** | Angka bulat (menit) |
| **Opsi** | `1` – `60` |
| **Penjelasan** | Seberapa sering bot cek posisi aktif. Lebih kecil = lebih responsif tapi lebih banyak API call |

---

### `screeningIntervalMin`
| | |
|---|---|
| **Nilai sekarang** | `30` |
| **Default** | `30` |
| **Format** | Angka bulat (menit) |
| **Opsi** | `5` – `120` |
| **Penjelasan** | Seberapa sering bot cari pool baru. Terlalu sering = boros API, terlalu jarang = ketinggalan momentum |

---

### `adaptiveScreening`
| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Penjelasan** | `false` (manual) = interval screening tetap di `screeningIntervalMin`. `true` (auto) = interval melar otomatis saat sesi jam (WIB) yang secara historis kurang menguntungkan, untuk hemat token LLM, tapi bot tetap jalan 24 jam. `screeningIntervalMin` jadi batas tercepat (floor), `maxScreeningIntervalMin` batas terlambat (ceil) |
| **Catatan** | Hanya siklus SCREENING yang terpengaruh. Pengelolaan posisi (management) & pemantauan PnL tidak pernah diperlambat. Butuh minimal 8 data posisi tertutup per-sesi sebelum throttle aktif — sebelum itu jalan normal, jadi tidak menebak dari data tipis |

---

### `maxScreeningIntervalMin`
| | |
|---|---|
| **Nilai sekarang** | `90` |
| **Default** | `90` |
| **Format** | Angka bulat (menit) |
| **Opsi** | `screeningIntervalMin` – `360` |
| **Penjelasan** | Batas terlambat interval screening saat `adaptiveScreening: true`. Bot main di rentang [`screeningIntervalMin` … `maxScreeningIntervalMin`]. Tidak berpengaruh di mode manual |

> **Profil Jam Buka (Time-of-Day):** Bot mencatat jam BUKA tiap posisi (zona WIB/UTC+7) lalu mengelompokkannya jadi 5 sesi (dini/pagi/siang/sore/malam) untuk menganalisis kapan deploy paling cuan. Profil ini jadi: (1) dasar `adaptiveScreening`, dan (2) referensi lunak di screening — bukan filter keras, tidak pernah melangkahi aturan lain. Lihat lewat tool `get_time_profile` di chat, atau section **"Best Open Hours (WIB)"** di `/briefing` harian. Aktif setelah terkumpul ≥8 posisi per-sesi.

---

### `healthCheckIntervalMin`
| | |
|---|---|
| **Nilai sekarang** | `60` |
| **Default** | `60` |
| **Format** | Angka bulat (menit) |
| **Opsi** | `10` – `1440` |
| **Penjelasan** | Seberapa sering bot kirim laporan saldo & status ke Telegram |

---

---

# GRUP 11 — MODEL AI (LLM)

> Di `config.js` masuk ke: `config.llm`

---

### `managementModel`
| | |
|---|---|
| **Nilai sekarang** | `"minimax/minimax-m2.5"` |
| **Default** | `"minimax/minimax-m2.5"` |
| **Format** | String (nama model OpenRouter) |
| **Contoh** | `"minimax/minimax-m2.5"` `"minimax/minimax-m2.7"` `"anthropic/claude-haiku-4-5"` `"deepseek/deepseek-chat"` |
| **Penjelasan** | Model untuk siklus management (kelola posisi). Task terstruktur, bisa pakai model lebih hemat |

---

### `screeningModel`
| | |
|---|---|
| **Nilai sekarang** | `"minimax/minimax-m2.7"` |
| **Default** | `"minimax/minimax-m2.5"` |
| **Format** | String (nama model OpenRouter) |
| **Penjelasan** | Model untuk siklus screening (cari pool baru). Butuh reasoning lebih dalam, disarankan pakai model lebih kuat |

---

### `generalModel`
| | |
|---|---|
| **Nilai sekarang** | `"anthropic/claude-haiku-4-5"` |
| **Default** | `"minimax/minimax-m2.7"` |
| **Format** | String (nama model OpenRouter) |
| **Penjelasan** | Model untuk chat manual lewat Telegram atau REPL |

---

### `temperature`
| | |
|---|---|
| **Nilai sekarang** | `0.373` |
| **Default** | `0.373` |
| **Format** | Desimal `0.0` – `2.0` |
| **Opsi** | `0.0` = sangat deterministik/konsisten. `0.5–1.0` = seimbang. `1.0+` = lebih kreatif/berani tapi kurang konsisten |
| **Catatan** | Untuk trading bot, biasanya lebih baik di bawah 0.5 |

---

### `maxTokens`
| | |
|---|---|
| **Nilai sekarang** | `4096` |
| **Default** | `4096` |
| **Format** | Angka bulat |
| **Opsi** | Minimal `2048`. Maksimal tergantung model (biasanya `4096`–`32768`) |
| **Catatan** | Jangan set di bawah 2048, model free sering punya limit rendah yang bisa sebabkan respons kosong |

---

### `maxSteps`
| | |
|---|---|
| **Nilai sekarang** | `20` |
| **Default** | `20` |
| **Format** | Angka bulat |
| **Opsi** | `1` – `50` |
| **Penjelasan** | Maks berapa langkah (tool call) yang boleh dilakukan LLM dalam satu sesi. Mencegah loop tak berujung |

---

---

# GRUP 12 — DARWIN (Sistem Bobot Sinyal Otomatis)

> Sistem yang secara otomatis menaikkan bobot sinyal yang terbukti profit dan menurunkan yang rugi.
> Di `config.js` masuk ke: `config.darwin`

---

### `darwinEnabled`
| | |
|---|---|
| **Nilai sekarang** | `true` |
| **Default** | `true` |
| **Format** | `true` atau `false` |
| **Penjelasan** | Aktifkan sistem Darwin. Kalau dimatikan, semua sinyal bobotnya sama rata |

---

### `darwinWindowDays`
| | |
|---|---|
| **Nilai sekarang** | `60` |
| **Default** | `60` |
| **Format** | Angka bulat (hari) |
| **Opsi** | `7` – `365` |
| **Penjelasan** | Gunakan data berapa hari terakhir untuk hitung bobot sinyal |

---

### `darwinRecalcEvery`
| | |
|---|---|
| **Nilai sekarang** | `5` |
| **Default** | `5` |
| **Format** | Angka bulat |
| **Opsi** | `1` – `50` |
| **Penjelasan** | Hitung ulang bobot setiap X posisi ditutup |

---

### `darwinBoost` dan `darwinDecay`
| | |
|---|---|
| **Nilai sekarang** | `1.05` / `0.95` |
| **Default** | `1.05` / `0.95` |
| **Format** | Desimal |
| **Opsi boost** | `1.001` – `2.0` (harus lebih dari 1) |
| **Opsi decay** | `0.5` – `0.999` (harus kurang dari 1) |
| **Penjelasan** | Sinyal yang terbukti profit bobotnya dikali `boost` (+5%). Yang rugi dikali `decay` (-5%) |

---

### `darwinFloor` dan `darwinCeiling`
| | |
|---|---|
| **Nilai sekarang** | `0.3` / `2.5` |
| **Default** | `0.3` / `2.5` |
| **Format** | Desimal |
| **Opsi floor** | `0.01` – `1.0` |
| **Opsi ceiling** | `1.0` – `10.0` |
| **Penjelasan** | Batas bawah dan atas bobot sinyal. Sinyal tidak pernah benar-benar diabaikan (floor 0.3 = masih 30% bobot) |

---

### `darwinMinSamples`
| | |
|---|---|
| **Nilai sekarang** | `10` |
| **Default** | `10` |
| **Format** | Angka bulat |
| **Opsi** | `1` – `100` |
| **Penjelasan** | Darwin butuh minimal X data posisi tertutup sebelum mulai mengubah bobot |

---

---

# GRUP 13 — CHART INDICATORS

> Bekerja sebagai filter tambahan sebelum deploy. Kalau chart tidak cocok, LLM tidak akan deploy meskipun pool lolos screening.
> Di `config.js` masuk ke: `config.indicators`
> Di `user-config.json`: dalam objek `"chartIndicators": { ... }`

---

### `chartIndicators.enabled`
| | |
|---|---|
| **Nilai sekarang** | `true` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Penjelasan** | Aktifkan filter chart teknikal sebelum deploy |

---

### `chartIndicators.entryPreset` dan `exitPreset`
| | |
|---|---|
| **Nilai sekarang** | `"supertrend_break"` / `"rsi_reversal"` |
| **Default** | `"supertrend_break"` / `"supertrend_break"` |
| **Format** | String |
| **Opsi** | `"supertrend_break"` `"rsi_reversal"` `"bollinger_reversion"` `"rsi_plus_supertrend"` `"supertrend_or_rsi"` `"bb_plus_rsi"` `"fibo_reclaim"` `"fibo_reject"` `"supertrend_plus_smi"` |
| **Penjelasan** | Preset kondisi teknikal. `entryPreset` = gerbang timing saat MASUK (selalu aktif kalau `enabled=on`). `exitPreset` = sinyal saat KELUAR, tapi **baru berpengaruh kalau `exitEnabled=on`** (lihat di bawah). `supertrend_break` = harga baru breakout di atas supertrend. `supertrend_plus_smi` = supertrend bullish **DAN** sinyal SMI (Stochastic Momentum Index, dihitung client-side dari `candles[]`) — lihat 3 setelan `smiPdLookback` / `smiPaLookback` / `smiCrossWindow` di bawah |

---

### `chartIndicators.exitEnabled`
| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Penjelasan** | `false` (pabrik) = `exitPreset` tidak melakukan apa-apa; exit posisi murni diatur stop-loss / take-profit / trailing / yield-floor / OOR. `true` = sinyal `exitPreset` yang terkonfirmasi bisa **memicu penutupan posisi** (dicek setelah semua rule deterministik, jadi rule keselamatan selalu menang; hanya meng-upgrade posisi yang tadinya STAY/CLAIM). Gagal-aman: kalau API indikator error → tidak menutup |

---

### `chartIndicators.rsiLength`
| | |
|---|---|
| **Nilai sekarang** | `2` |
| **Default** | `2` |
| **Format** | Angka bulat |
| **Opsi** | `2` – `50` |
| **Penjelasan** | Periode RSI. Kecil (2–5) = sangat sensitif pergerakan pendek. Besar (14+) = sinyal lebih lambat tapi lebih stabil |

---

### `chartIndicators.intervals`
| | |
|---|---|
| **Nilai sekarang** | `["5_MINUTE"]` |
| **Default** | `["5_MINUTE"]` |
| **Format** | Array of string |
| **Opsi** | `"1_MINUTE"` `"5_MINUTE"` `"15_MINUTE"` `"1_HOUR"` `"4_HOUR"` `"1_DAY"` |
| **Contoh multi** | `["5_MINUTE", "15_MINUTE"]` |
| **Penjelasan** | Timeframe chart yang dianalisis. Bisa lebih dari satu |

---

### `chartIndicators.rsiOversold` dan `rsiOverbought`
| | |
|---|---|
| **Nilai sekarang** | `30` / `90` |
| **Default** | `30` / `80` |
| **Format** | Angka 0–100 |
| **Penjelasan** | RSI di bawah `rsiOversold` = oversold (peluang masuk). RSI di atas `rsiOverbought` = overbought (jangan masuk) |

---

### `chartIndicators.requireAllIntervals`
| | |
|---|---|
| **Nilai sekarang** | `true` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Penjelasan** | `false` = cukup 1 interval yang cocok. `true` = semua interval dalam daftar harus cocok (lebih ketat) |

---

### `chartIndicators.rejectAlreadyAtBottom`
| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Penjelasan** | Di-port dari logika GMGN `checkBounceSetup`. `false` (pabrik) = tidak ada efek. `true` = gerbang ENTRY (mode Meteora) **menolak** kandidat yang sudah terlanjur dump ke dasar — yaitu RSI < `rsiOversold` **dan** harga di bawah lower Bollinger Band. Alasannya: strategi single-side SOL di bin bawah harga butuh token masih punya ruang untuk turun MASUK ke range kita; kalau sudah di dasar, tidak ada ruang dump lagi → langsung mantul naik = OOR di atas range. Veto ini berlaku apa pun preset-nya |

---

### `chartIndicators.smiPdLookback`, `smiPaLookback`, `smiCrossWindow`
| | |
|---|---|
| **Nilai sekarang** | `5` / `3` / `3` |
| **Default** | `5` / `3` / `3` |
| **Format** | Angka bulat (jumlah candle) |
| **Berlaku saat** | **Hanya** kalau `entryPreset = "supertrend_plus_smi"`. Preset lain → ketiganya tidak terpakai (inert) |
| **Penjelasan** | Tiga jendela kebaruan (recency) untuk sinyal SMI. Matematika SMI-nya (lenK/lenD/lenE, midline, hitungan trigger fase PD/PA) **dikunci di `tools/smi.js`** — yang bisa di-tune cuma 3 jendela ini. Sinyal SMI terkonfirmasi kalau **PathA ATAU PathB**: <br>• **PathA** ("topping → roll over"): ada *cross-down* (SMI memotong ke bawah garis sinyal SMI-EMA, dengan SMI masih > 0) dalam **`smiCrossWindow`** candle terakhir, yang **didahului** oleh trigger fase **PD** (pre-distribution) dalam **`smiPdLookback`** candle SEBELUM cross-down itu. <br>• **PathB** ("sudah mulai akumulasi"): ada trigger fase **PA** (pre-accumulation) dalam **`smiPaLookback`** candle terakhir. <br>Angka lebih besar = jendela lebih longgar (lebih banyak setup lolos); lebih kecil = lebih ketat / lebih segar |

---

---

# GRUP 14 — KONEKSI & RELAY

> Di `config.js` masuk ke: `config.api`

---

### `lpAgentRelayEnabled`
| | |
|---|---|
| **Nilai sekarang** | `true` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Penjelasan** | Kirim transaksi lewat relay server AgentMeridian sebagai backup. Kalau relay gagal 2x berturut-turut, otomatis dilewati 10 menit (circuit breaker) |

---

### `agentId` dan `publicApiKey`
| | |
|---|---|
| **Format** | String |
| **Penjelasan** | ID dan kunci yang diberikan AgentMeridian saat registrasi. Jangan diubah manual |

---

### `solMode`
| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Penjelasan** | `true` = semua angka (PnL, saldo) ditampilkan dalam SOL bukan USD |

---

### `pnlSource`
| | |
|---|---|
| **Default** | `"rpc"` |
| **Format** | String |
| **Opsi** | `"rpc"` / `"meteora"` |
| **Penjelasan** | Sumber data nilai posisi & PnL (di `config.pnl`). `rpc` (default) = baca langsung on-chain lewat RPC publik + harga Jupiter + riwayat deposit Meteora — tanpa ketergantungan LPAgent/relay, jadi poller bisa jalan agresif. Kalau jalur RPC error, otomatis jatuh ke jalur API Meteora (fail-open). `meteora` = pakai jalur API Meteora saja |

---

### `pnlRpcUrl`
| | |
|---|---|
| **Default** | `"https://pump.helius-rpc.com"` |
| **Format** | String (URL) |
| **Penjelasan** | RPC endpoint khusus untuk pembacaan PnL (terpisah dari `RPC_URL` utama yang dipakai transaksi). Sengaja pakai RPC publik supaya polling rapat tidak menghabiskan kuota RPC utama. Bisa juga diset lewat env `PNL_RPC_URL` |

---

### `pnlPollIntervalSec`
| | |
|---|---|
| **Default** | `3` |
| **Format** | Angka (detik) |
| **Penjelasan** | Jarak antar tick PnL poller (pemantau trailing TP / SL / close rules di antara siklus management). Dulu fix 30 detik; sekarang bisa rapat (default 3 dtk) karena jalur RPC publik. Mengubah ini lewat `/setcfg` otomatis me-restart poller — tidak perlu restart bot |

---

### `pnlDepositCacheTtlSec`
| | |
|---|---|
| **Default** | `300` |
| **Format** | Angka (detik) |
| **Penjelasan** | Umur cache riwayat deposit (dari API Meteora `/pnl`) sebelum di-refresh. Cache juga di-invalidate otomatis kalau ada signature transaksi baru, jadi angka ini cuma batas atas. Makin kecil = makin sering hit API Meteora |

---

### `gmgnFeeSource`
| | |
|---|---|
| **Default** | `"gmgn"` |
| **Format** | String |
| **Opsi** | `"gmgn"` / `"jupiter"` |
| **Penjelasan** | Sumber data `global_fees_sol` (gerbang `minTokenFeesSol` di GRUP 6). `gmgn` = ambil `total_fee` dari GMGN (butuh `gmgnApiKey`; tanpa key otomatis jatuh ke Jupiter). `jupiter` = selalu pakai Jupiter. ⚠️ Beda dengan blok GMGN screening: setting ini **tetap bekerja walau `screeningSource = meteora`** |

---

---

# GRUP 15 — HIVEMIND (Kolektif)

> Di `config.js` masuk ke: `config.hiveMind`

---

### `hiveMindPullMode`
| | |
|---|---|
| **Nilai sekarang** | `"auto"` |
| **Default** | `"auto"` |
| **Format** | String |
| **Opsi** | `"auto"` / `"manual"` / `"off"` |
| **Penjelasan** | `auto` = otomatis tarik lessons dari komunitas. `manual` = hanya kalau diminta. `off` = nonaktifkan |

---

---

# GRUP 16 — EKSPERIMEN (Fitur Percobaan) 🧪

> Di config.js masuk ke: `config.experiments`
>
> **Semua fitur di grup ini DEFAULT OFF (`false`).** OFF = perilaku pabrik — kode fiturnya dilewati total, bot jalan persis seperti tanpa fitur ini. Nyalakan satu-satu buat eksperimen; matikan = balik normal. Di `/config` grup ini ditandai 🧪 biar gampang di-track mana yang masih percobaan.

---

### exitLiquidityCheck

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Sebelum deploy, bot "tes jual": pakai quote Jupiter (TANPA transaksi beneran) buat beli token seukuran posisi lalu jual balik ke SOL, terus ukur biaya **round-trip**-nya. Kalau biayanya di atas batas → pool di-skip karena likuiditas exit-nya jelek ("masuk gampang, keluar susah"). OFF = nggak ngetes (pabrik) |
| **Catatan** | Cuma jalan pas LIVE (di-skip saat `DRY_RUN`). Kalau quote-nya gagal/timeout, deploy tetap diizinkan (fail-open) — biar API hiccup nggak ngeblok semua deploy |

---

### exitLiquidityMaxSlippagePct

| | |
|---|---|
| **Nilai sekarang** | `10` |
| **Default** | `10` |
| **Format** | Angka positif (persen) |
| **Opsi** | `1` – `50` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Batas biaya round-trip dalam %. Diukur: `(SOL masuk − SOL keluar) / SOL masuk × 100`. Di atas batas ini → pool di-skip. Cuma kepakai kalau `exitLiquidityCheck = true` |
| **Tips** | Kalibrasi dari log `exitLiquidityCheck: round-trip X%`. Memecoin tipis bisa 15–30%. Mulai longgar (mis. `15`), perketat pelan-pelan sambil lihat log |

**Contoh nyalakan:**

```
set exitLiquidityCheck to true
set exitLiquidityMaxSlippagePct to 15
```

Matikan (balik pabrik): `set exitLiquidityCheck to false`

---

### marketRegimeGate

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Sebelum screening jalan, bot baca perubahan harga SOL 24 jam terakhir (Jupiter price, TANPA transaksi). Kalau SOL turun lebih dari batas → pasar dianggap "risk-off" dan **seluruh siklus screening di-skip** (nggak panggil LLM, nggak ada deploy baru). Ide: jangan buka posisi LP baru pas pasar lagi jeblok. OFF = nggak ngecek regime (pabrik) |
| **Catatan** | Berlaku untuk screening terjadwal **dan** yang dipicu slot kosong (freed-slot). Deploy manual lewat chat TIDAK digerbang (itu override-mu). Kalau fetch harga gagal, screening tetap jalan (fail-open). Berjalan juga saat `DRY_RUN` (read-only, biar bisa kelihatan efeknya) |

---

### marketRegimeMaxDrop24hPct

| | |
|---|---|
| **Nilai sekarang** | `8` |
| **Default** | `8` |
| **Format** | Angka positif (persen) |
| **Opsi** | `3` – `30` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Ambang penurunan SOL 24 jam. Kalau `priceChange24h` SOL lebih negatif dari `-batas%` → risk-off, screening di-skip. Cuma kepakai kalau `marketRegimeGate = true` |
| **Tips** | Kalibrasi dari log `marketRegimeGate: SOL X% (24h)`. `8` = cukup konservatif (skip cuma pas dump beneran). Turunin ke `5` kalau mau lebih hati-hati, naikin ke `12–15` kalau cuma mau hindari crash besar |

**Contoh nyalakan:**

```
set marketRegimeGate to true
set marketRegimeMaxDrop24hPct to 8
```

Matikan (balik pabrik): `set marketRegimeGate to false`

---

### candidateMomentum

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Tiap siklus screening, bot nyimpen snapshot TVL/volume/mcap tiap kandidat (di `candidate-memory.json`). Pas pool itu muncul lagi di siklus berikutnya, bot tambahin baris `momentum: tvl +18%, vol +40% (...)` di blok kandidat yang dibaca screener — nunjukin pool lagi naik daun atau lagi luntur. Sinyal **soft** (cuma bahan pertimbangan buat LLM, NGGAK nge-blok deploy). OFF = nggak nyimpen & nggak nambahin baris (pabrik) |
| **Catatan** | Momentum baru muncul kalau pool kelihatan ≥2 siklus (pertama kali = "first sighting"). File-nya dibatasi (8 snapshot/pool) & pool yang nggak kelihatan >24 jam dibuang otomatis, jadi nggak membengkak. Kalau snapshot gagal, screening tetap jalan (fail-open). Terpisah dari `pool-memory.json` (yang buat cooldown/riwayat deploy) |

**Contoh nyalakan:**

```
set candidateMomentum to true
```

Matikan (balik pabrik): `set candidateMomentum to false`

---

### narrativeProfileSignal

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Tiap deploy, screener nge-tag token ke salah satu **kategori narasi** (`animal`, `ai`, `political`, `celebrity`, `meme`, `culture`, `tech_utility`, `other`). Performa posisi yang udah ditutup di-bucket per kategori (mirip profil jam buka). Kalau flag ini ON, bot nyelipin satu baris hint ke prompt screener: narasi mana yang historisnya cuan vs zonk. Sinyal **soft** (cuma bahan pertimbangan, NGGAK nge-blok deploy & NGGAK nimpa hard rule). OFF = nggak ada hint di prompt (pabrik) |
| **Catatan** | Tag narasi dikumpulin **pasif** (selalu, walau flag OFF) biar datanya numpuk — jadi pas dinyalain udah ada sejarah. Hint baru muncul kalau ada ≥8 sampel per kategori (di bawah itu = netral). Lihat profil kapan aja lewat tool `get_narrative_profile`. Inert sampai data baru numpuk (sama seperti time-of-day dulu) |

**Contoh nyalakan:**

```
set narrativeProfileSignal to true
```

Matikan (balik pabrik): `set narrativeProfileSignal to false`

---

### expectedYieldSignal

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Nambahin satu baris `yield_to_me:` di tiap blok kandidat berisi perkiraan kasar **seberapa besar porsi kita di pool** (modal kita dalam USD ÷ TVL pool) dan **perkiraan fee yang kita tangkap per window** (modal × rasio fee/active-TVL). Tujuannya nerjemahin rasio fee yang abstrak jadi angka konkret di ukuran posisi kita sendiri. Sinyal **soft** (cuma bahan pertimbangan LLM, NGGAK nge-blok deploy). OFF = baris ini nggak muncul (pabrik) |
| **Catatan** | Ini **proxy**, bukan angka presisi — sengaja nggak ngitung di bin mana likuiditas terkonsentrasi (versi akurat butuh distribusi likuiditas per-bin dari SDK). Pakai data yang udah ada di siklus screening (harga SOL dari saldo wallet, TVL & rasio fee dari kandidat), jadi nggak ada panggilan API tambahan. Share pool juga jadi sinyal halus likuiditas: porsi gede = kita yang jadi likuiditasnya = lebih susah keluar. Kalau data kurang, baris-nya di-skip (fail-open) |

**Contoh nyalakan:**

```
set expectedYieldSignal to true
```

Matikan (balik pabrik): `set expectedYieldSignal to false`

---

### convictionSizing

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Bikin ukuran deploy ikut **keyakinan** screener pada setup itu: `high` → posisi lebih gede, `low` → lebih kecil, `medium` (atau kosong) → nggak berubah. Besarnya geseran dibatasi `convictionSizingMaxAdjustPct` (default ±30%). **PENTING:** hasilnya SELALU di-clamp ulang ke rentang min–max yang kamu set (`deployAmountSol` … `maxDeployAmount`), jadi **nggak akan pernah** nembus batas itu — keyakinan cuma nentuin posisi di DALAM pita min/max, bukan menggantikannya. OFF = ukuran deploy persis seperti biasa (pabrik) |
| **Catatan** | Ini **satu-satunya** eksperimen yang menggerakkan modal beneran, makanya pitanya sengaja sempit & di-clamp. Cek saldo & exit-liquidity tetap memvalidasi jumlah HASIL geseran (digeser dulu, baru dicek). Screener dikasih tahu lewat baris prompt (saat ON) buat ngisi `conviction` di `deploy_position`; kalau modelnya nggak ngisi → dianggap medium = nggak berubah. Param `conviction` di tool nganggur saat flag OFF |

**Contoh nyalakan:**

```
set convictionSizing to true
```

Atur besar geseran maksimal (mis. jadi ±20%): `set convictionSizingMaxAdjustPct to 20`

Matikan (balik pabrik): `set convictionSizing to false`

---

### counterfactualReview

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Belajar dari pool yang kita **lewatkan**. Pakai snapshot kandidat (yang sama dipakai `candidateMomentum`) buat ngebandingin mcap pool yang cuma kita lihat tapi NGGAK kita masuki — pas briefing harian, bot lapor: berapa pool yang kita skip terus malah naik (≥`counterfactualMinMcapGainPct`%, "yang lolos") vs berapa yang malah turun ("skip yang bener"). Ini cuma **bahan refleksi** di briefing — NGGAK nge-blok atau nge-ubah apa pun. OFF = nggak ada section ini (pabrik) |
| **Catatan** | Kalau dinyalain, snapshot kandidat tetap direkam walau `candidateMomentum` OFF. Horizonnya pendek (candidate-memory cuma simpan ~24 jam), jadi ini review skip RECENT, bukan jangka panjang. Pool dianggap "dimasuki" kalau ada di `pool-memory.json` (riwayat deploy). Fail-open (kalau error, briefing tetap jalan) |

**Contoh nyalakan:**

```
set counterfactualReview to true
```

Atur ambang "dianggap pop" (mis. 40%): `set counterfactualMinMcapGainPct to 40`

Matikan (balik pabrik): `set counterfactualReview to false`

---

### smartWalletMomentum

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Lacak **jumlah smart wallet** di tiap kandidat dari siklus ke siklus. Kalau berubah, bot nambahin baris `sw_momentum:` di blok kandidat: smart money lagi **masuk** (bullish) atau **keluar** (bearish), mis. `smart wallets entering (+2): 1→3 over 3 cycles`. Sinyal **soft** (bahan pertimbangan LLM, NGGAK nge-blok deploy) & **trusted** (hitungan kita sendiri, bukan teks eksternal). OFF = nggak nyimpen & nggak nambahin baris (pabrik) |
| **Catatan** | Baru muncul kalau pool kelihatan ≥2 siklus DAN jumlahnya berubah (kalau flat = nggak ada baris). Nebeng `candidate-memory.json` (buffer `sw_snaps`, 8/pool, ikut prune 24 jam bareng snapshot momentum). Kalau dinyalain, snapshot kandidat tetap direkam walau `candidateMomentum` OFF. Fail-open |

**Contoh nyalakan:**

```
set smartWalletMomentum to true
```

Matikan (balik pabrik): `set smartWalletMomentum to false`

---

### idleScreeningCooldown

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Status** | 🧪 EKSPERIMEN |
| **Penjelasan** | Ngerem screening saat **0 posisi**. Normalnya, pas lagi kosong (nggak ada posisi), tiap siklus management (default 10 menit) langsung memicu satu siklus screening penuh — termasuk panggilan LLM — walau hasilnya sering NO DEPLOY. Kalau dinyalain, pemicu screening saat-kosong itu dibatasi paling cepat tiap `idleScreeningCooldownMin` menit, jadi hemat biaya LLM pas pasar lagi sepi setup. Cron screening terjadwal tetap jalan di bawahnya (pakai stempel waktu yang sama). OFF = screening saat-kosong jalan tiap tick management (pabrik) |
| **Catatan** | Cuma ngerem pemicu saat **0 posisi**; manajemen posisi terbuka & deteksi slot kosong (freed-slot) NGGAK kena rem. Fail-open: kalau error, screening tetap dipicu (pabrik). Berbagi `_screeningLastTriggered` dengan screening terjadwal + freed-slot |

**Contoh nyalakan:**

```
set idleScreeningCooldown to true
```

Atur jeda (mis. tiap 30 menit): `set idleScreeningCooldownMin to 30`

Matikan (balik pabrik): `set idleScreeningCooldown to false`

---

### idleScreeningCooldownMin

| | |
|---|---|
| **Nilai sekarang** | `20` |
| **Default** | `20` |
| **Format** | angka (menit) |
| **Status** | 🧪 EKSPERIMEN (pendamping `idleScreeningCooldown`) |
| **Penjelasan** | Jeda minimum (menit) antar pemicu screening saat-kosong, **hanya kepakai kalau `idleScreeningCooldown = true`**. Mis. `20` = saat 0 posisi, screening dipicu paling cepat tiap 20 menit (bukan tiap 10 menit). `0` = praktis OFF (nggak ada jeda) |
| **Tips** | Jangan setel lebih lama dari masa berlaku sinyal entry-mu. Untuk SMI di candle 15m dengan `smiCrossWindow=5`, sinyal valid ~75 menit — jadi `20–45` aman; di atas ~60 mulai berisiko kelewat entry transien |

---

### paperTrading

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | on/off |
| **Status** | 🧪 EKSPERIMEN (khusus DRY-RUN) |
| **Penjelasan** | **Hanya berlaku saat `DRY_RUN=true`.** Normalnya di dry-run, begitu bot mau deploy dia cuma mengembalikan `would_deploy` lalu posisinya lenyap — nggak masuk `/positions`, nggak ada PnL, briefing kosong. Kalau dinyalain, would-deploy itu **dilacak sebagai posisi VIRTUAL** di `state.json` sehingga seluruh siklus jalan dalam simulasi: `/positions` keisi, notif Telegram deploy/close keluar dengan label 🧪, `getPositionPnl` mengembalikan PnL **SIMULASI**, aturan close (stopLoss/TP/OOR/yield) jalan, dan `recordPerformance` mengisi `lessons.json` + briefing. Gunanya: menilai perilaku ENTRY sebuah preset selama dry-run. **Akurasi:** timing entry + in-range/OOR = TEPAT (dibaca dari active bin on-chain); fee + IL = **perkiraan kasar**, BUKAN forecast profit. OFF = would-deploy lenyap seperti biasa (pabrik). Nggak ada efek saat live |
| **Cara pakai** | Nyalakan (di box dry-run): |

```
set paperTrading to true
```

Matikan (balik pabrik): `set paperTrading to false`

| **Catatan** | Mengabaikan konsentrasi likuiditas per-bin (versi akurat butuh bin-reserves SDK). Single-side SOL: kalau harga naik di atas entry, posisi tetap ~flat (SOL nggak pernah terisi jadi token) — itu memang benar secara mekanika DLMM, bukan bug. **Isolasi:** tiap catatan paper diberi tanda `paper`, dan semua jalur yang mempengaruhi live (evolusi threshold, bobot sinyal, lessons-ke-prompt, hive, pool-memory, statistik report/briefing) sekarang MENGABAIKAN catatan paper saat live — jadi kalau box ini di-flip ke live, data paper nggak mencemari keputusan maupun laporan. Saat dry-run, briefing/report justru menampilkan data paper (memang itu datanya), dengan label 🧪 simulasi |

---

### usePaperHistoryWhenLive

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | on/off |
| **Status** | 🧪 EKSPERIMEN (khusus LIVE — hanya dibaca saat `DRY_RUN` mati) |
| **Penjelasan** | Mengatur APAKAH riwayat paper-trading boleh dipakai sebagai rujukan saat bot sudah **live**. **OFF (pabrik)** = riwayat paper diabaikan total saat live; bot live seakan mulai dari nol (catatan paper tetap tersimpan, cuma tak dipakai). **ON** = pelajaran (lessons) hasil paper boleh muncul di prompt bot live sebagai **referensi lunak ber-stempel 🧪 dengan kredibilitas rendah** — TETAP dikecualikan dari evolusi threshold, bobot sinyal, statistik report/briefing, dan push hive. Jadi bot live bisa "mengingat" pelajaran dari masa dry-run tanpa mencemari jalur mekanis/laporan apa pun. Nggak ada efek saat masih dry-run (paper memang datanya) |
| **Cara pakai** | Nyalakan (nanti, setelah live, kalau mau): |

```
set usePaperHistoryWhenLive to true
```

Matikan (balik pabrik): `set usePaperHistoryWhenLive to false`

| **Catatan** | Kredibilitas paper: tinggi untuk disiplin entry/timing/in-range-OOR (dibaca dari chain), rendah untuk besaran PnL absolut. Karena itu bahkan saat ON, paper cuma jadi teks pertimbangan ber-label, bukan angka yang menggerakkan aturan otomatis |

---

# GRUP 17 — LAPORAN, GAS & ANALITIK (Reports)

> Sistem laporan performa & biaya. Semua laporan pakai satu mesin analitik (`reports.js`) jadi metriknya konsisten.

### Jenis laporan
- **Briefing Harian** — otomatis tiap 01:00 UTC (+ watchdog kalau bot sempat mati). Isi: aktivitas 24 jam, blok statistik all-time (profit factor, avg win vs avg loss, max drawdown, expectancy), **verdict** (baca singkat kesehatan trading), lessons (audit ubah-config dipisah), **biaya** (LLM per-role + gas + net-vs-semua-biaya), time profile, rekomendasi.
- **Briefing Weekly** — otomatis Senin 01:30 UTC. **Monthly** — tanggal 1 jam 02:00 UTC. Cakupan lebih luas (jendela 7d/30d) + tren + breakdown.
- **Learning Report (milestone)** — otomatis tiap kelipatan `learningReportEvery` posisi tutup (mis. 10, 20, 30…). Review mendalam: tren "N terakhir vs N sebelumnya", breakdown per strategy/sesi/narasi, movement PnL, rekomendasi.
- **`/report`** — minta laporan kapan saja. `/report` = all-time; `/report week` / `/report month` / `/report day` = per jendela waktu.

### Fitur otomatis
- **Auto-pin**: tiap briefing otomatis di-pin di Telegram, yang lama di-unpin (selalu yang terbaru nempel).
- **Cost per-role**: biaya LLM dipecah Screening / Management / General (presisi kalau modelnya beda).
- **Gas nyata**: bot mencatat fee transaksi asli (`gas-log.json`) → laporan pakai angka nyata (fallback estimasi sampai data terkumpul).
- **PnL movement**: tiap posisi dilacak peak & trough-nya → rekomendasi tweak `takeProfitPct` / trailing / `stopLossPct` (data mulai terkumpul untuk posisi yang dibuka setelah fitur ini aktif).

### learningReportEvery

| | |
|---|---|
| **Nilai sekarang** | `10` |
| **Default** | `10` |
| **Format** | angka (0 = matikan laporan milestone otomatis) |
| **Penjelasan** | Tiap berapa posisi tutup, Learning Report otomatis dikirim. `10` = tiap 10/20/30 close. `0` = matikan (tapi `/report` tetap jalan manual) |

**Contoh:** `set learningReportEvery to 20`

### learningReportTrendN

| | |
|---|---|
| **Nilai sekarang** | `10` |
| **Default** | `10` |
| **Format** | angka |
| **Penjelasan** | Berapa trade terakhir yang dibandingkan dengan N sebelumnya di bagian tren ("apakah edge membaik?") |

**Contoh:** `set learningReportTrendN to 15`

### gasReserveAutoTune

| | |
|---|---|
| **Nilai sekarang** | `false` |
| **Default** | `false` |
| **Format** | `true` atau `false` |
| **Penjelasan** | Kalau ON, tiap hari `gasReserve` disetel ulang otomatis dari gas NYATA yang terukur — simpan `gasReserveBufferDays` hari runway, tak pernah di bawah `gasReserveFloorSol`. OFF = `gasReserve` tetap persis seperti kamu set (pabrik) |
| **Catatan** | Hanya menyesuaikan kalau perubahannya berarti (>20% & >0.005 SOL) dan sudah ada ≥8 catatan gas. Karena gas Solana biasanya receh, efeknya cenderung **menurunkan** reserve → modal lebih banyak buat deploy. Fail-open |

**Contoh nyalakan:** `set gasReserveAutoTune to true`

### gasReserveBufferDays

| | |
|---|---|
| **Nilai sekarang** | `14` |
| **Default** | `14` |
| **Format** | angka (hari) |
| **Penjelasan** | Berapa hari runway gas yang dijaga saat auto-tune ON (target reserve = burn harian × hari ini) |

### gasReserveFloorSol

| | |
|---|---|
| **Nilai sekarang** | `0.03` |
| **Default** | `0.03` |
| **Format** | angka (SOL) |
| **Penjelasan** | Batas bawah `gasReserve` saat auto-tune ON — reserve tak akan pernah disetel di bawah ini (biar selalu ada gas buat transaksi) |

---

# GRUP 18 — LEARNING / AUTO-EVOLVE (Pembekuan Baseline)

> **Analogi:** bayangkan bot itu murid yang otomatis mengubah aturan-screening-nya sendiri tiap 5 trade tutup, berdasarkan menang/kalah terakhir. Kadang kamu lagi mau **menguji satu racikan apa adanya** (baseline bersih) — kamu tidak mau si murid diam-diam mengganti aturannya di tengah ujian. `evolveEnabled` itu **gembok** untuk proses itu.
>
> Yang dikunci: hanya **auto-evolve threshold** (`evolveThresholds`) yang menulis-ulang `minFeeActiveTvlRatio` + `minOrganic` tiap 5 posisi tutup. **Tidak** menyentuh eksekusi trade / exit / screening. Reversible — tinggal balik ke `true`.
>
> **Beda dengan Darwin (GRUP 12):** Darwin mengubah *bobot sinyal* screening; ini mengubah *angka threshold* screening. Dua mekanisme beda, dua toggle beda. `evolveEnabled` TIDAK mempengaruhi Darwin (dan sebaliknya).

### evolveEnabled

| | |
|---|---|
| **Nilai sekarang** | `false` (BEKU) |
| **Default** | `true` |
| **Format** | `true` atau `false` (atau `off`) |
| **Di `config.js`** | `config.learning.evolveEnabled` |
| **Penjelasan** | `true` = perilaku pabrik: tiap 5 posisi tutup (racikan aktif), bot boleh menaikkan `minFeeActiveTvlRatio` / `minOrganic` otomatis dari data menang-kalah. `false` = **FROZEN**: auto-tulis itu dilewati total (tidak ada tulisan ke `user-config.json`, threshold tetap persis seperti kamu set). Dipakai untuk menjaga baseline (mis. **mainzen_v2**) tetap bersih saat lagi di-tuning manual. |

**Contoh:** `set evolveEnabled to true` (buka kunci, balikkan auto-evolve), atau lewat `/settings` → **🧬Learn** → tombol *Auto-evolve threshold*.

**Override manual sekali jalan (CLI saja):** kalau frozen tapi operator tetap mau menjalankan evolve sekali, ketik `/evolve force` di REPL — ada banner ⚠️, threshold ditulis sekali itu, toggle tetap `false`. Plain `/evolve` saat frozen akan menolak + menjelaskan.

> Di `/settings` evolveEnabled ada di halaman **🧬Learn** (seksi 🧩 Add by Zen). Di `/config` muncul di sub-grup **Learning/Evolve** dengan titik 🟢 on / ⚪ off.

---

# CATATAN — GMGN & DUA SISTEM INDIKATOR

> Bagian ini menjawab kebingungan umum: "blok GMGN di `/config` itu semua kepakai atau tidak?"

### 1. Blok GMGN hanya jalan saat source = gmgn
Semua setting GMGN (yang muncul di blok `━ GMGN` pada `/config`, disimpan di `gmgn-config.json` / `config.gmgn`) **cuma dipakai kalau `screeningSource = "gmgn"`**. Pool GMGN ditemukan lewat jalur `discoverGmgnPools`, dan di situlah filter seperti `requireKol`, `minKolCount`, `maxBundlerRate`, `maxRugRatio`, `maxSniperCount`, dst diterapkan.

Saat `screeningSource = "meteora"` (default), jalur yang jalan adalah `discoverPools` (Meteora) + filter **GRUP 6 & 7**. **Tidak satu pun** setting GMGN ikut bekerja — nilainya tersimpan tapi tidur. Jadi tidak perlu pusing menyetel blok GMGN selama kamu pakai Meteora. Header blok di `/config` ikut menandai: `tidak aktif (source=meteora, blok ini diabaikan)` vs `AKTIF (source=gmgn)`.

### 2. Ada DUA sistem indikator yang berbeda — jangan tertukar

| | **GRUP 13 — `chartIndicators`** | **Indikator GMGN — `gmgn.indicatorFilter` + `rules.*`** |
|---|---|---|
| Disetel di | `config.indicators` (GRUP 13) | blok GMGN (`config.gmgn`) |
| Kapan jalan | Konfirmasi **setelah** discovery, jalur **UMUM** — berlaku di kedua source (meteora & gmgn) | **Saat** discovery GMGN — **hanya** source = gmgn |
| Gerbang on/off | `chartIndicators.enabled` | `gmgn.indicatorFilter` (default on; set off → seluruh `indicatorInterval` + `rules.*` GMGN dilewati) |
| Wajib? | Tidak — kalau `enabled = off`, tidak ada konfirmasi indikator sama sekali | Tidak — opsional, dan cuma relevan di mode gmgn |

**Ringkasnya:** setting indikator GMGN (`indicatorFilter`, `indicatorInterval`, `rules.requireBullishSupertrend`, dll) **tidak harus** kamu isi. Mereka hanya berpengaruh kalau (a) `screeningSource = gmgn` **dan** (b) `gmgn.indicatorFilter = on`. Untuk mode Meteora, yang menentukan konfirmasi indikator adalah **GRUP 13 chartIndicators**, bukan setting GMGN.

---

---

# SETTING DI FILE `.env` (Kunci Rahasia)

> File `.env` TIDAK boleh di-commit ke GitHub. Isi satu kali saat setup.

| Variable | Wajib | Penjelasan |
|----------|-------|------------|
| `WALLET_PRIVATE_KEY` | Ya | Private key wallet Solana. Format: Base58 string atau JSON array angka |
| `RPC_URL` | Ya | URL endpoint RPC Solana (Helius, QuickNode, dll) |
| `OPENROUTER_API_KEY` | Ya | API key OpenRouter untuk model AI |
| `TELEGRAM_BOT_TOKEN` | Tidak | Token bot dari @BotFather |
| `TELEGRAM_CHAT_ID` | Tidak | ID chat kamu (bisa dapat dari @userinfobot) |
| `LLM_BASE_URL` | Tidak | Override URL LLM (untuk LM Studio lokal: `http://localhost:1234/v1`) |
| `LLM_MODEL` | Tidak | Override model default via env |
| `DRY_RUN` | Tidak | `"true"` untuk mode simulasi |
| `HELIUS_API_KEY` | Tidak | Helius API key untuk data wallet lebih detail |

> Catatan: `rpcUrl`, `llmModel`, `llmBaseUrl`, `llmApiKey` juga bisa diset di `user-config.json`.
> Kalau ada di `.env`, `.env` menang (`.env` prioritas lebih tinggi).

---

---

# SETTING YANG DIKUNCI KODE (Tidak Bisa Diubah dari Config)

| Apa | Di file mana | Kenapa |
|-----|-------------|--------|
| Floor minimal bins = 35 | `config.js` baris 21 | Safety — range lebih sempit = risiko impermanent loss ekstrem |
| Jadwal briefing = jam 1 pagi UTC | `index.js` | Hardcoded cron |
| Delay konfirmasi trailing peak = 15 detik | `index.js` | Hardcoded, beri waktu sebelum trigger |
| Timeout relay = 8 detik | `tools/dlmm.js` | Circuit breaker timing |
| Cooldown relay gagal = 10 menit | `tools/dlmm.js` | Circuit breaker durasi |

---

---

# QUICK REFERENCE — Ubah Setting Via Telegram

Ketik langsung di chat Telegram bot kamu:

```
set stopLossPct to -55
set maxPositions to 3
set minOrganic to 70
set timeframe to 5m
set trailingTakeProfit to false
set adaptiveScreening to true
set maxScreeningIntervalMin to 120
update config deployAmountSol 0.2
```

> `adaptiveScreening` & `maxScreeningIntervalMin` juga ada tombolnya di `/settings` → halaman **screen**.

Bot kirim tombol konfirmasi ✅ Ya / ❌ Batal (expired 30 detik); setelah dikonfirmasi berlaku langsung tanpa restart.

**Lihat semua config:** ketik `/config` → seluruh setting dikelompokkan per grup (real-time dari bot). `/status` untuk wallet + posisi + all-time PnL.

---

*Terakhir diperbarui: 6 Juni 2026 | Branch: experimental*
