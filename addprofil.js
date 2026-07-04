/**
 * addprofil.js — scaffolder profil baru (sumbu ISOLASI: data-dir sendiri).
 *
 * BATAS JUJUR (terkunci): modul ini scaffold sisi DATA (folder + config awal +
 * presets/ kosong + template). Sisi RAHASIA (wallet, token BotFather) + `pm2 start`
 * = MANUAL — modul CUMA cetak langkahnya. Bot tak boleh bikin wallet/token sendiri.
 *
 * Pure file-ops. TIDAK menyentuh data/config/preset profil yang lagi jalan
 * (cuma bikin folder+file baru di profiles/<nama>/).
 */
import fs from "fs";
import path from "path";
import { repoPath } from "./repo-root.js";

const PROFILES_ROOT = repoPath("profiles");
const EXAMPLE_CONFIG = repoPath("user-config.example.json");
const NAME_RE = /^[a-z0-9_-]+$/i;

export function validProfilName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 32 && NAME_RE.test(name);
}

export function profilExists(name) {
  return validProfilName(name) && fs.existsSync(path.join(PROFILES_ROOT, name));
}

/** Daftar profil yang sudah ada (subfolder di profiles/). */
export function listProfil() {
  if (!fs.existsSync(PROFILES_ROOT)) return [];
  return fs.readdirSync(PROFILES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function envTemplate(name) {
  return [
    `# .env profil "${name}" — ISI MANUAL, JANGAN commit (gitignored).`,
    `# WAJIB beda dari profil lain: wallet & bot token nggak boleh sama (bentrok).`,
    ``,
    `WALLET_PRIVATE_KEY=`,
    `TELEGRAM_BOT_TOKEN=`,
    `TELEGRAM_CHAT_ID=`,
    `# opsional (kalau profil ini butuh key sendiri):`,
    `# RPC_URL=`,
    `# LLM_API_KEY=`,
    `# OPENROUTER_API_KEY=`,
    ``,
    `# CATATAN PENTING loading secret per-profil:`,
    `# envcrypt load .env dari ROOT repo (override:true), BUKAN folder profil ini.`,
    `# Jadi .env ini TIDAK auto-kebaca sampai envcrypt di-reroute per-profil.`,
    `# Sampai fitur itu ada, secret per-profil = manual owner (lihat RESTORE.txt).`,
    ``,
  ].join("\n");
}

function ecosystemSnippet(name) {
  // Routing only — TANPA secret (ecosystem.config.cjs git-tracked; secret nggak boleh masuk git).
  return [
    `// Tempel block ini ke array apps[] di ecosystem.config.cjs:`,
    `    {`,
    `      name: "meridian-${name}",`,
    `      script: path.join(repoRoot, "index.js"),`,
    `      cwd: repoRoot,`,
    `      interpreter: "node",`,
    `      instances: 1,`,
    `      exec_mode: "fork",`,
    `      autorestart: true,`,
    `      restart_delay: 5000,`,
    `      kill_timeout: 10000,`,
    `      max_restarts: 10,`,
    `      min_uptime: "10s",`,
    `      merge_logs: true,`,
    `      time: true,`,
    `      env: {`,
    `        NODE_ENV: "production",`,
    `        MERIDIAN_DATA_DIR: "profiles/${name}",`,
    `        MERIDIAN_PROFILE: "${name}",`,
    `      },`,
    `    },`,
  ].join("\n");
}

function restoreSteps(name) {
  return [
    `Profil "${name}" ter-scaffold di profiles/${name}/`,
    `Isi: user-config.json (template, dryRun=true) + presets/ (kosong) + .env.template + ECOSYSTEM-SNIPPET.txt`,
    ``,
    `LANGKAH MANUAL (OWNER — tidak bisa & tidak boleh otomatis):`,
    ``,
    `1. WALLET  : bikin wallet Solana BARU khusus profil ini. JANGAN pakai wallet profil lain.`,
    `2. TELEGRAM: bikin bot baru via @BotFather -> catat TOKEN + chat id kamu.`,
    `3. SECRET  : isi profiles/${name}/.env.template lalu rename -> .env`,
    `             WALLET_PRIVATE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (+ key lain kalau perlu).`,
    `   CATATAN : envcrypt saat ini load .env dari ROOT (override:true), BUKAN folder profil.`,
    `             .env profil ini BELUM auto-kebaca. Sampai envcrypt di-reroute per-profil`,
    `             (fitur terpisah, di luar /addprofil), owner handle secret manual:`,
    `             opsi sementara = jalanin profil ini di FOLDER TERPISAH (cara lama, folder-copy)`,
    `             ATAU tunggu fitur envcrypt-per-profil. /addprofil scaffold DATA-nya aja.`,
    `4. ECOSYSTEM: tempel isi ECOSYSTEM-SNIPPET.txt ke apps[] di ecosystem.config.cjs.`,
    `5. STRATEGI : edit profiles/${name}/user-config.json (dryRun masih true = aman, paper).`,
    `6. START (OWNER): pm2 start ecosystem.config.cjs --only meridian-${name}`,
    ``,
    `Data learning/state/lessons dibuat OTOMATIS di profiles/${name}/ saat proses start.`,
    `Preset/racikan profil ini tersimpan di profiles/${name}/presets/ (isolasi penuh).`,
  ].join("\n");
}

export function scaffoldProfil(name) {
  if (!validProfilName(name)) {
    throw new Error(`nama profil invalid "${name}" — pakai huruf/angka/_/- , maks 32 char`);
  }
  const dataDir = path.join(PROFILES_ROOT, name);
  if (fs.existsSync(dataDir)) {
    throw new Error(`profil "${name}" sudah ada (folder profiles/${name}) — batal, nggak nimpa`);
  }
  if (!fs.existsSync(EXAMPLE_CONFIG)) {
    throw new Error(`template user-config.example.json tidak ditemukan — batal`);
  }

  const created = [];
  // 1. data-dir + presets/ kosong
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "presets"), { recursive: true });
  created.push(`profiles/${name}/`, `profiles/${name}/presets/`);

  // 2. seed user-config.json dari template (example sudah blank-secret). Paksa dryRun=true (paper, aman).
  const base = JSON.parse(fs.readFileSync(EXAMPLE_CONFIG, "utf8"));
  base.dryRun = true;
  fs.writeFileSync(path.join(dataDir, "user-config.json"), JSON.stringify(base, null, 2));
  created.push(`profiles/${name}/user-config.json`);

  // 3. .env.template (slot secret kosong + caveat)
  fs.writeFileSync(path.join(dataDir, ".env.template"), envTemplate(name));
  created.push(`profiles/${name}/.env.template`);

  // 4. ecosystem snippet (routing only, NO secret)
  fs.writeFileSync(path.join(dataDir, "ECOSYSTEM-SNIPPET.txt"), ecosystemSnippet(name));
  created.push(`profiles/${name}/ECOSYSTEM-SNIPPET.txt`);

  // 5. RESTORE.txt (langkah manual)
  const steps = restoreSteps(name);
  fs.writeFileSync(path.join(dataDir, "RESTORE.txt"), steps);
  created.push(`profiles/${name}/RESTORE.txt`);

  return { name, dataDir, created, steps };
}
