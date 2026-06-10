#!/usr/bin/env bash
# Isi 4 rahasia ke .env tanpa nampilin nilainya (read -rs = silent; nilai
# dikirim ke node lewat ENV, bukan argv, jadi nggak muncul di `ps`/transcript).
# Jalankan di terminal SENDIRI:  bash /home/ubuntu/meridian-v3/fill-env.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "== Isi .env meridian-v3 (input rahasia TIDAK ditampilkan; Enter buat skip) =="
read -rsp "WALLET_PRIVATE_KEY (base58 / JSON array): " WPK; echo
read -rsp "TELEGRAM_BOT_TOKEN: " TBT; echo
read -rp  "TELEGRAM_CHAT_ID (bukan rahasia): " TCI
read -rsp "OPENROUTER_API_KEY: " ORK; echo

WPK="${WPK:-}" TBT="${TBT:-}" TCI="${TCI:-}" ORK="${ORK:-}" node -e '
const fs = require("fs");
let env = fs.readFileSync(".env", "utf8");
const set = (k, v) => {
  if (!v) return; // kosong = skip, biarin nilai lama
  const re = new RegExp("^" + k + "=.*$", "m");
  env = re.test(env) ? env.replace(re, k + "=" + v) : env + "\n" + k + "=" + v;
};
set("WALLET_PRIVATE_KEY", process.env.WPK);
set("TELEGRAM_BOT_TOKEN", process.env.TBT);
set("TELEGRAM_CHAT_ID", process.env.TCI);
set("OPENROUTER_API_KEY", process.env.ORK);
fs.writeFileSync(".env", env);
'

echo "== Cek (masked) =="
while IFS= read -r line; do
  case "$line" in
    WALLET_PRIVATE_KEY=*|TELEGRAM_BOT_TOKEN=*|OPENROUTER_API_KEY=*)
      k="${line%%=*}"; v="${line#*=}"
      if [ -z "$v" ] || [ "$v" = "REPLACE_ME" ]; then echo "  $k = ⛔ BELUM diisi"; else echo "  $k = ✓ terisi (${#v} char)"; fi ;;
    TELEGRAM_CHAT_ID=*|DRY_RUN=*) echo "  $line" ;;
  esac
done < .env
echo "Selesai. Start:  cd /home/ubuntu/meridian-v3 && npm run pm2:start"
