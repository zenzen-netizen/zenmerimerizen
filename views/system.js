/**
 * views/system.js — renderer pesan SISTEM/MISC (Phase 3 🅴, Batch E). Render-only.
 *
 * Kumpulan pesan kecil non-view-model yang sebelumnya inline di index.js:
 *   /help · /hive · /pause·/resume · queue-notice · error-reply.
 * Tiap fungsi murni (string in → string out), dipanggil 1-baris dari index.js
 * (pola sama dgn guide.js renderGuide). Plain text (no HTML) → dikirim via
 * sendMessage (auto-split @4096). NOL pengurangan detail: semua field/teks
 * versi lama dipertahankan, cuma dirapikan ke gaya tree (SEP + ├/└).
 */

import { SEP, tree } from "./format.js";

// ── /help ─────────────────────────────────────────────────────────────────────
// Daftar command bergrup. SEMUA baris dipertahankan verbatim (recon FASE 0 +
// tambahan /config origin dari FASE 2). 4 seksi, tiap seksi = header + tree.
export function renderHelp() {
  const groups = [
    ["📊 Laporan & Status", [
      "/status — wallet + positions snapshot",
      "/wallet — wallet, SOL bebas (cair) + real deploy/slot + rent tertahan + SOL tracker (1d/7d/30d)",
      "/wallet trackstart <YYYY-MM-DD|off> — anchor tracker SOL ke tanggal",
      "/positions — list open positions (+ rent tertahan)",
      "/pool <n> — detail 1 posisi (+ range-efficiency + rent)",
      "/briefing — morning briefing (auto-pinned)",
      "/report — racikan aktif · /report all = lifetime · /report setups · /report <racikan>",
      "/report [week|month|day] — digest periodik",
    ]],
    ["🛠️ Posisi & Deploy", [
      "/close <n> — close one position by index",
      "/closeall — close all open positions",
      "/set <n> <note> — set note/instruction on position",
      "/screen — refresh deterministic candidate list",
      "/candidates — show latest cached candidates",
      "/deploy <n> — deploy candidate by cached index",
    ]],
    ["⚙️ Konfigurasi", [
      "/config — config per-fungsi (praktis, + marker asal ⚙️/🧩)",
      "/config origin — config per-asal (⚙️ origin dev vs 🧩 add by zen)",
      "/config core — ringkasan key inti saja",
      "/settings — button menu for common config",
      "/setcfg <key> <value> — update persisted config",
      "/preset [list|save|use|show <nama>] — simpan/ganti profil config",
      "/guide [no|katakunci|all] — panduan setting",
    ]],
    ["🔧 Sistem", [
      "/hive — HiveMind sync status",
      "/hive pull — manual HiveMind pull now",
      "/pause — stop cron cycles",
      "/resume — start cron cycles again",
      "/stop — shut down agent",
      "/help — show this list",
    ]],
  ];
  const out = ["🤖 Meridian · Commands"];
  for (const [title, cmds] of groups) out.push(SEP, title, tree(cmds));
  return out.join("\n");
}
