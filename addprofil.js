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
    `# ============================================================`,
    `# .env profil "${name}" — ISI MANUAL, JANGAN commit (gitignored).`,
    `# envcrypt-per-profil AKTIF: file ini auto-kebaca (commit ce37fa5).`,
    `# Field = cerminan .env bot 1 / .env.example dev. Isi yang perlu; kosong = aman.`,
    `# ============================================================`,
    ``,
    `# --- [WAJIB ISI] Identitas profil (HARUS beda dari profil lain) ---`,
    `WALLET_PRIVATE_KEY=`,
    `TELEGRAM_BOT_TOKEN=`,
    `TELEGRAM_CHAT_ID=`,
    `TELEGRAM_ALLOWED_USER_IDS=`,
    ``,
    `# --- LLM: 2 wadah. Isi key SENDIRI (JANGAN copas bot 1 → bikin 403). ---`,
    `# Wadah UTAMA (default provider OpenRouter):`,
    `OPENROUTER_API_KEY=`,
    `# Wadah FALLBACK (default provider OpenCode Zen):`,
    `LLM_FALLBACK_API_KEY=`,
    `LLM_FALLBACK_BASE_URL=https://opencode.ai/zen/v1`,
    `LLM_FALLBACK_MODEL=deepseek-v4-flash-free`,
    ``,
    `# --- RPC / infra (isi kalau mau sendiri; kosong = default kode) ---`,
    `RPC_URL=`,
    `HELIUS_API_KEY=`,
    ``,
    `# --- Opsional / sistem ---`,
    `LPAGENT_API_KEY=`,
    `LOG_LEVEL=info`,
    `ALLOW_SELF_UPDATE=false`,
    ``,
    `# --- Pagar paper: profil baru mulai PAPER. Ganti ke false pas siap live. ---`,
    `DRY_RUN=true`,
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
    `   CATATAN : .env AUTO-KEBACA per-profil (envcrypt-per-profil aktif; ce37fa5).`,
    `             WAJIB isi: WALLET_PRIVATE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.`,
    `             Kalau mau AI: isi OPENROUTER_API_KEY SENDIRI (jangan copas MAIN -> 403).`,
    `             Model LLM udah default gratis. Field lain kosong = fitur mati aman.`,
    `             Profil mulai DRY_RUN=true (paper). Ganti ke false pas siap live.`,
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
  // Default model = FREE (profil pakai key free-tier sendiri; nyaris nol biaya).
  // Nilai = model free yang bot 1 pakai sekarang; owner bebas ganti nanti.
  base.llmModel = "nvidia/nemotron-3-ultra-550b-a55b:free";
  base.screeningModel = "nvidia/nemotron-3-ultra-550b-a55b:free";
  base.managementModel = "nvidia/nemotron-3-ultra-550b-a55b:free";
  base.generalModel = "deepseek-v4-flash-free";
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
