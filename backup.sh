#!/usr/bin/env bash
#
# backup.sh — Snapshot semua file 🔴 (rahasia) + 🟡 (state/learning) Meridian-v3
# ke satu .tar.gz bertimestamp. RE-RUNNABLE: jalankan kapanpun untuk dapat data terbaru.
#
#   ./backup.sh            -> tulis ke ~/meridian-v3-backups/
#   ./backup.sh /path/dir  -> tulis ke folder lain
#
# CATATAN KEAMANAN: arsip ini berisi .env + user-config.json (WALLET_PRIVATE_KEY,
# API keys, token Telegram). Simpan OFFLINE. JANGAN push ke GitHub / cloud publik.
#
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ="$(basename "$SRC")"
OUT_DIR="${1:-$HOME/${PROJ}-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$OUT_DIR/${PROJ}-backup-$STAMP.tar.gz"

# 🔴 Rahasia / identitas — TIDAK bisa dibuat ulang, mengandung secret
RED=(
  ".env"
  ".env.bak."*          # semua varian backup .env
  "user-config.json"
  "presets"             # folder snapshot config (berisi API keys)
)

# 🟡 State runtime & learning — tidak rahasia, tapi tak ternilai (hasil belajar bot)
YELLOW=(
  "state.json"
  "lessons.json"
  "pool-memory.json"
  "candidate-memory.json"
  "decision-log.json"
  "signal-weights.json"
  "llm-cost-log.json"
  "smart-wallets.json"
  "token-blacklist.json"
  "strategy-library.json"
  "sol-balance-history.json"
  "hivemind-cache.json"
  "gas-log.json"
  "gmgn-config.json"
)

mkdir -p "$OUT_DIR"
cd "$SRC"

# Kumpulkan hanya yang benar-benar ada (glob aman walau tak match)
shopt -s nullglob
INCLUDE=()
for pat in "${RED[@]}" "${YELLOW[@]}"; do
  for f in $pat; do
    [ -e "$f" ] && INCLUDE+=("$f")
  done
done
shopt -u nullglob

if [ ${#INCLUDE[@]} -eq 0 ]; then
  echo "⚠️  Tidak ada file yang cocok untuk di-backup. Batal."
  exit 1
fi

# Memory Claude Code untuk project ini (di luar folder repo) — ikut di-backup.
# Key folder = path project dgn '/' diganti '-' (skema .claude/projects).
MEM_KEY="$(printf '%s' "$SRC" | sed 's#/#-#g')"
MEM_REL=".claude/projects/$MEM_KEY/memory"
MEM_NOTE="(tak ada)"
TAR_EXTRA=()
if [ -d "$HOME/$MEM_REL" ]; then
  TAR_EXTRA=( -C "$HOME" "$MEM_REL" )
  MEM_NOTE="$MEM_REL"
fi

tar -czf "$ARCHIVE" "${INCLUDE[@]}" "${TAR_EXTRA[@]}"
chmod 600 "$ARCHIVE"   # rahasia -> hanya pemilik yang bisa baca

echo "✅ Backup dibuat:"
echo "   $ARCHIVE"
echo "   ($(du -h "$ARCHIVE" | cut -f1), $(printf '%s' "${#INCLUDE[@]}") file + memory)"
echo
echo "Isi:"
printf '   • %s\n' "${INCLUDE[@]}"
echo "   • [memory] $MEM_NOTE"
echo
echo "🔒 Berisi secret — simpan offline, jangan unggah ke repo/cloud publik."

# Sisakan 10 backup terbaru, sisanya dibuang (hemat disk)
ls -1t "$OUT_DIR/${PROJ}-backup-"*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
