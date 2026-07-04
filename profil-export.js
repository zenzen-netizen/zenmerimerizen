/**
 * profil-export.js — export SATU profil penuh (config + presets + semua data
 * learning/state) jadi bundel di `exports/profil_<label>_<stamp>/`.
 *
 * BEDA dgn racikan-export.js: ini backup FULL 1 profil APA ADANYA — secret TIDAK
 * di-strip (buat pindah rumah / disaster-recovery), jadi output WAJIB offline-only
 * (tiap file di-chmod 600). Pure file ops, no config.js import (ringan, tetap jalan
 * walau bot mati).
 *
 * Daftar file DATA mengikuti backup.sh (RED+YELLOW) MINUS .env / logs / archive.
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { paths } from "./paths.js";
import { repoPath } from "./repo-root.js";

// File DATA per-profil (pakai paths.X supaya ikut MERIDIAN_DATA_DIR kalau di-set).
const DATA_FILES = [
  paths.statePath, paths.lessonsPath, paths.poolMemoryPath, paths.candidateMemoryPath,
  paths.decisionLogPath, paths.signalWeightsPath, paths.llmCostLogPath, paths.smartWalletsPath,
  paths.tokenBlacklistPath, paths.strategyLibraryPath, paths.solBalanceHistoryPath,
  paths.hivemindCachePath, paths.gasLogPath, paths.gmgnConfigPath, paths.userConfigPath,
];
// File identitas proses (repo-level, sama utk semua profil di 1 repo).
const IDENTITY_FILES = [repoPath("ecosystem.config.cjs"), repoPath("package.json")];
// Folder preset (disalin rekursif).
const PRESETS_DIR = paths.presetsDir;   // per-profil: presets ikut data-dir (konsisten #3B)
// TIDAK disalin: .env (secret wallet — dibikin baru di rumah tujuan), logs/, archive.

/** Nama profil buat penamaan folder — env override → nama folder dataDir → "main". */
function label() {
  return process.env.MERIDIAN_PROFILE || path.basename(paths.dataDir) || "main";
}

/**
 * Ekspor 1 profil penuh ke exports/profil_<label>_<stamp>/. Semua file di-chmod 600.
 * @param {{ archive?: boolean }} [opts] archive=true → bungkus jadi 1 .tar.gz (opt-in).
 * @returns {{ label, outDir, copiedCount, copied: string[], skipped: string[], archived: boolean }}
 */
export function exportProfil({ archive = false } = {}) {
  const lbl = label();
  // Stamp WIB: sv-SE → "YYYY-MM-DD HH:MM:SS" → "YYYYMMDD-HHMMSS".
  const rawStamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });
  const stamp = rawStamp.replace(/[-:]/g, "").replace(" ", "-");
  const outDir = repoPath("exports", `profil_${lbl}_${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const copied = [];
  const skipped = [];

  for (const f of [...DATA_FILES, ...IDENTITY_FILES]) {
    const base = path.basename(f);
    if (fs.existsSync(f)) {
      const dest = path.join(outDir, base);
      fs.copyFileSync(f, dest);
      try { fs.chmodSync(dest, 0o600); } catch { /* best-effort */ }
      copied.push(base);
    } else {
      skipped.push(base);
    }
  }

  // presets/ — salin rekursif seluruh isi (Node 16.7+).
  if (fs.existsSync(PRESETS_DIR)) {
    const destPresets = path.join(outDir, "presets");
    fs.cpSync(PRESETS_DIR, destPresets, { recursive: true });
    let presetCount = 0;
    try {
      for (const entry of fs.readdirSync(destPresets)) {
        const p = path.join(destPresets, entry);
        if (fs.statSync(p).isFile()) { fs.chmodSync(p, 0o600); presetCount++; }
      }
    } catch { /* best-effort chmod */ }
    copied.push(`presets/ (${presetCount} file)`);
  }

  // RESTORE.txt — instruksi pasang di rumah baru (plain text).
  const restore = [
    `=== RESTORE PROFIL: ${lbl} ===`,
    `Diekspor : ${rawStamp} WIB`,
    `Isi      : config + presets + semua data learning/state 1 profil.`,
    ``,
    `⚠️  PAKET INI BERISI SECRET (rpcUrl, telegram, apikey) — SIMPAN OFFLINE.`,
    `    Jangan upload ke GitHub/cloud publik.`,
    ``,
    `CARA PASANG DI RUMAH BARU:`,
    `1. git pull kode Meridian (versi cocok) ke folder tujuan.`,
    `2. Copy semua file paket ini ke folder bot / folder data profil.`,
    `3. BIKIN .env BARU (paket ini TIDAK bawa .env). Minimal isi:`,
    `     WALLET_PRIVATE_KEY=...   (wallet profil ini)`,
    `     TELEGRAM_BOT_TOKEN=...   (dari BotFather)`,
    `     + env lain sesuai .env lama (LLM key dll).`,
    `4. (opsional) sesuaikan ecosystem.config.cjs (nama proses, MERIDIAN_DATA_DIR).`,
    `5. pm2 start ... → bot jalan dgn riwayat & config profil ini.`,
    ``,
    `Catatan: rpcUrl/telegramChatId/hiveMindApiKey/publicApiKey SUDAH termuat di`,
    `user-config.json (kamu pilih 'include'). Ganti kalau mau beda di rumah baru.`,
  ].join("\n");
  const restorePath = path.join(outDir, "RESTORE.txt");
  fs.writeFileSync(restorePath, `${restore}\n`);
  try { fs.chmodSync(restorePath, 0o600); } catch { /* best-effort */ }

  // Bonus: bungkus folder jadi 1 file .tar.gz (gampang dikirim/simpan) — opt-in.
  // Fail-open: `tar` tak ada / gagal → tetap kembalikan folder mentah (tar bukan inti).
  if (archive) {
    const archivePath = `${outDir}.tar.gz`;
    try {
      execFileSync("tar", ["-czf", archivePath, "-C", path.dirname(outDir), path.basename(outDir)]);
      try { fs.chmodSync(archivePath, 0o600); } catch { /* best-effort */ }
      fs.rmSync(outDir, { recursive: true, force: true });
      return { label: lbl, outDir: archivePath, copiedCount: copied.length, copied, skipped, archived: true };
    } catch { /* fall through — keep the folder */ }
  }

  return { label: lbl, outDir, copiedCount: copied.length, copied, skipped, archived: false };
}
