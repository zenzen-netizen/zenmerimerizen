/**
 * racikan-export.js — export satu racikan (config preset + riwayat performa) jadi
 * bundel portable di `exports/racikan_<nama>_<stamp>/`, dengan semua secret di-strip.
 *
 * Pure file ops, no config.js import (pola sama dgn preset-manager.js) — supaya
 * ringan dan tetap bisa dipakai walau bot tidak jalan.
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { repoPath } from "./repo-root.js";
import { validName, presetExists, listPresets } from "./preset-manager.js";
import { getPerformanceForRacikan, listRacikanInPerformance } from "./lessons.js";

// Key rahasia yang WAJIB di-strip (case-insensitive pada NAMA key, nested juga).
const SECRET_KEYS = [
  "walletKey", "rpcUrl", "pnlRpcUrl", "llmApiKey", "openrouterApiKey",
  "publicApiKey", "gmgnApiKey", "hiveMindApiKey",
  "telegramBotToken", "telegramChatId", "telegramAllowedUserIds",
];
const SECRET_KEY_SET = new Set(SECRET_KEYS.map((k) => k.toLowerCase()));
// Backstop heuristik — over-strip lebih aman daripada bocor.
const SECRET_RE = /(privatekey|walletkey|apikey|secret|bottoken|rpcurl)$/i;

function isSecretKey(key) {
  const k = String(key);
  return SECRET_KEY_SET.has(k.toLowerCase()) || SECRET_RE.test(k);
}

/** Deep-clone `obj`, membuang key yang match SECRET_KEYS/regex di semua level
 *  (rekursif, termasuk nested object spt `gmgn`). Return { clean, stripped }. */
export function stripSecrets(obj) {
  const stripped = [];
  function walk(node) {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        if (isSecretKey(k)) { stripped.push(k); continue; }
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  }
  return { clean: walk(obj), stripped };
}

/** Racikan yang bisa diekspor: gabungan nama preset file + nama di riwayat performa. */
export function listExportableRacikan() {
  const fromPresets = listPresets().map((p) => p.name);
  const fromHistory = listRacikanInPerformance().map((r) => r.name);
  return [...new Set([...fromPresets, ...fromHistory])].sort();
}

/**
 * Ekspor 1 racikan → folder `exports/racikan_<nama>_<stamp>/` berisi preset.json
 * (secret di-strip, kalau file preset ada), lessons.json (riwayat racikan ini),
 * dan MANIFEST.txt. Racikan tanpa file preset tetap diekspor (riwayat saja).
 */
export function exportRacikan(name, { archive = false } = {}) {
  if (!validName(name)) throw new Error("nama tidak valid");

  const presetFile = repoPath("presets", `${name}.json`);
  let clean = null;
  let stripped = [];
  if (presetExists(name)) {
    const raw = JSON.parse(fs.readFileSync(presetFile, "utf8"));
    ({ clean, stripped } = stripSecrets(raw));
  }

  const records = getPerformanceForRacikan(name);

  const wibNow = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });
  const digits = wibNow.replace(/\D/g, "");
  const stamp = `${digits.slice(0, 8)}-${digits.slice(8, 14)}`;

  const outDir = repoPath("exports", `racikan_${name}_${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  if (clean != null) {
    fs.writeFileSync(path.join(outDir, "preset.json"), JSON.stringify(clean, null, 2));
  }
  fs.writeFileSync(path.join(outDir, "lessons.json"), JSON.stringify({ performance: records }, null, 2));

  const manifest = [
    `Racikan     : ${name}`,
    `Diekspor    : ${wibNow} WIB`,
    `Record      : ${records.length} trade`,
    `Preset      : ${clean != null ? "disertakan (secret di-strip)" : "TIDAK ADA — riwayat saja"}`,
    `Di-strip    : ${stripped.length ? stripped.join(", ") : "-"}`,
    `Cara pakai  : copy preset.json → presets/<name>.json di bot tujuan,`,
    `              lalu isi ULANG secret (rpcUrl/telegram/apikey) sesuai bot tujuan.`,
    `              lessons.json = riwayat racikan ini (referensi/pindah);`,
    `              JANGAN timpa lessons.json tujuan mentah-mentah (merge manual).`,
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "MANIFEST.txt"), `${manifest}\n`);

  // Bonus: bungkus folder jadi 1 file .tar.gz (lebih gampang dikirim) — opt-in,
  // folder mentah tetap default. Gagal tar (binary tak ada dll) → fail-open,
  // kembalikan folder biasa (tar bukan bagian inti export).
  if (archive) {
    const archivePath = `${outDir}.tar.gz`;
    try {
      execFileSync("tar", ["-czf", archivePath, "-C", path.dirname(outDir), path.basename(outDir)]);
      fs.rmSync(outDir, { recursive: true, force: true });
      return { name, outDir: archivePath, recordCount: records.length, strippedCount: stripped.length, hasPreset: clean != null, archived: true };
    } catch { /* fall through — keep the folder */ }
  }

  return { name, outDir, recordCount: records.length, strippedCount: stripped.length, hasPreset: clean != null, archived: false };
}
