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
      "/briefing — morning briefing (auto-pinned) · analisis-dalam fokus racikan aktif",
      "/briefing alltime — briefing dgn all-time JUGA dapat analisis-dalam (dua scope simetris)",
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
      "/export racikan [<nama>] — ekspor config+riwayat racikan (secret di-strip)",
      "/addprofil <nama> — scaffold profil baru (data-dir isolasi; secret+start manual)",
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

// ── /hive · /hive pull ────────────────────────────────────────────────────────
// d = { enabled, agentId, url?, pullMode?, register?, lessons?, presets?, manualPull? }.
// Data gathering tetap di index.js; di sini cuma komposisi pesan (tree-style).
// SEMUA field versi lama dipertahankan (recon FASE 0).
export function renderHive(d) {
  if (!d.enabled) {
    return [`🐝 HiveMind · ⚪ disabled`, tree([
      `Agent ID: ${d.agentId}`,
      "Set hiveMindApiKey to connect.",
    ])].join("\n");
  }
  // lessons/presets: array → jumlah, else "manual" (pull manual) atau 0 (sama logika lama).
  const count = (v) => (Array.isArray(v) ? v.length : (d.pullMode === "manual" ? "manual" : 0));
  return [`🐝 HiveMind · 🟢 enabled`, tree([
    `Agent ID: ${d.agentId}`,
    `URL: ${d.url}`,
    `Pull mode: ${d.pullMode}`,
    `Register: ${d.register ? "ok" : "warn"}`,
    `Shared lessons: ${count(d.lessons)}`,
    `Presets: ${count(d.presets)}`,
    d.manualPull ? "Manual pull: completed" : null,
  ])].join("\n");
}

// ── /pause · /resume ──────────────────────────────────────────────────────────
// Teks asli dipertahankan verbatim (satu-baris status — tree tak menambah info;
// dipusatkan di sini supaya index.js 1-baris & ikon konsisten).
export function renderPaused() {
  return "⏸ Paused autonomous cycles. Telegram control still works. Use /resume to start again.";
}
export function renderResumed() {
  return "▶️ Autonomous cycles resumed.";
}
export function renderAlreadyRunning() {
  return "Autonomous cycles are already running.";
}

// ── queue notice ──────────────────────────────────────────────────────────────
export function renderQueued(n, preview) {
  return `⏳ Queued (${n} in queue): "${preview}"`;
}
export function renderQueueFull() {
  return "Queue is full (5 messages). Wait for the agent to finish.";
}

// ── error-reply terpusat ──────────────────────────────────────────────────────
// Satu renderer error konsisten (ikon ⚠️ + label opsional). Menggantikan pola
// ad-hoc "Error: <msg>" / "HiveMind error: <msg>" di handler yang disentuh batch
// ini; tersedia untuk dipakai handler lain (sentralisasi penuh = follow-up).
export function renderError(msg, label = "Error") {
  return `⚠️ ${label}: ${msg}`;
}
