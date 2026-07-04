/**
 * Config preset manager — save / load full `user-config.json` snapshots.
 *
 * A "config preset" is a complete snapshot of user-config.json stored in
 * `presets/<name>.json`. The bot only ever reads user-config.json at runtime;
 * presets are a shelf you copy from. `applyPreset` swaps the file (auto-backing
 * up the current one first) — a process restart is what actually re-derives the
 * live config, because env-level keys (DRY_RUN/wallet/RPC/model) are read once
 * at startup. See presets/README.md.
 *
 * Pure file ops, no config.js import (so the CLI `preset.js` stays light and
 * usable even when the bot isn't running).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { paths } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Sadar-profil: PRESETS_DIR & USER_CONFIG_PATH ikut data-dir profil aktif
// (via paths.js). Tanpa MERIDIAN_DATA_DIR → dataDir==REPO_ROOT → path IDENTIK
// dengan lokasi lama (paritas penuh buat bot single-profil sekarang).
const PRESETS_DIR = paths.presetsDir;
const USER_CONFIG_PATH = paths.userConfigPath;
const BACKUP_NAME = "_backup"; // auto-written before each apply, for rollback

const NAME_RE = /^[a-z0-9_-]+$/i;

function ensureDir() {
  if (!fs.existsSync(PRESETS_DIR)) fs.mkdirSync(PRESETS_DIR, { recursive: true });
}
function presetPath(name) {
  return path.join(PRESETS_DIR, `${name}.json`);
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function readCurrent() {
  try { return readJson(USER_CONFIG_PATH); } catch { return {}; }
}

// Top-level identity/meta keys that describe WHICH setup, not config values.
// Excluded from diffs so they never affect isCurrent / edited detection.
const META_KEYS = new Set(["preset", "activeSetup"]);

/** Flatten a config object to dotted keys, skipping internal/meta keys (`_*`, identity). */
function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.startsWith("_")) continue;
    if (!prefix && META_KEYS.has(k)) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

/** Diff two config objects → [{ key, from, to }] for keys whose value differs. */
export function diffConfigs(from, to) {
  const fa = flatten(from);
  const fb = flatten(to);
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  const diffs = [];
  for (const k of [...keys].sort()) {
    const a = fa[k];
    const b = fb[k];
    if (a !== b) diffs.push({ key: k, from: a === undefined ? "—" : a, to: b === undefined ? "—" : b });
  }
  return diffs;
}

export function validName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 40 && NAME_RE.test(name);
}

export function presetExists(name) {
  return validName(name) && fs.existsSync(presetPath(name));
}

/** List presets with a quick summary + whether each matches the live config. */
export function listPresets() {
  ensureDir();
  const current = readCurrent();
  const files = fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      const name = f.replace(/\.json$/, "");
      try {
        const data = readJson(path.join(PRESETS_DIR, f));
        return {
          name,
          dryRun: data.dryRun === true,
          keys: Object.keys(data).length,
          isCurrent: diffConfigs(current, data).length === 0,
          mtime: fs.statSync(path.join(PRESETS_DIR, f)).mtimeMs,
        };
      } catch {
        return { name, error: true };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Snapshot the current user-config.json into presets/<name>.json. Saving NAMES
 * the current config: stamps activeSetup=name on both the live config and the
 * snapshot, so "save mainzen_v4" means "I'm now running the racikan mainzen_v4".
 */
export function savePreset(name) {
  if (!validName(name)) throw new Error(`invalid preset name "${name}"`);
  if (!fs.existsSync(USER_CONFIG_PATH)) throw new Error("user-config.json not found");
  ensureDir();
  const overwritten = fs.existsSync(presetPath(name));
  const current = readCurrent();
  current.activeSetup = name;
  const serialized = JSON.stringify(current, null, 2);
  fs.writeFileSync(USER_CONFIG_PATH, serialized);
  fs.writeFileSync(presetPath(name), serialized);
  return { name, overwritten };
}

/** What would change (current → preset) if `name` were applied. */
export function getPresetDiff(name) {
  if (!presetExists(name)) throw new Error(`preset "${name}" not found`);
  return diffConfigs(readCurrent(), readJson(presetPath(name)));
}

/**
 * Load preset → user-config.json. Reads the preset content FIRST, then backs up
 * the current config to presets/_backup.json, then writes — so `applyPreset("_backup")`
 * rolls back cleanly even though the backup gets overwritten in the same call.
 * Does NOT restart the process; the caller decides how to apply (env-level keys
 * need a fresh process).
 */
export function applyPreset(name, { backup = true } = {}) {
  if (!presetExists(name)) throw new Error(`preset "${name}" not found`);
  const parsed = JSON.parse(fs.readFileSync(presetPath(name), "utf8")); // validate before touching anything
  // Stamp the loaded Racikan name so the live config self-identifies (the
  // snapshot's own activeSetup is irrelevant). _backup = internal rollback,
  // restore as-is so it keeps the prior identity.
  if (name !== BACKUP_NAME) parsed.activeSetup = name;
  let backupName = null;
  if (backup && fs.existsSync(USER_CONFIG_PATH)) {
    backupName = BACKUP_NAME;
    fs.copyFileSync(USER_CONFIG_PATH, presetPath(BACKUP_NAME));
  }
  fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(parsed, null, 2));
  return { applied: true, name, backup: backupName };
}

/**
 * Current "Racikan" status for display/attribution: which saved snapshot the
 * live config was loaded from, and whether it's since been hand-edited (live
 * config diverges from that snapshot). name=null → no Racikan (pure custom/wizard).
 */
export function getActiveSetupStatus() {
  const current = readCurrent();
  const name = current.activeSetup ?? null;
  if (!name || !presetExists(name)) return { name: name || null, edited: false, exists: false };
  const edited = diffConfigs(current, readJson(presetPath(name))).length > 0;
  return { name, edited, exists: true };
}

const PROFILE_LABELS = { degen: "🔥 Degen", moderate: "⚖️ Moderate", safe: "🛡️ Safe", custom: "✏️ Custom" };

/**
 * Canonical 🧬 Profil + 🗂️ Racikan identity block — single source of truth used
 * by /config, /settings, /report and briefings. Reads user-config.json directly
 * (no config.js import). Emoji-only, safe to drop into Telegram HTML as-is.
 * compact=true → one line; else two lines.
 */
export function formatIdentity({ compact = false } = {}) {
  const profile = readCurrent().preset || "moderate";
  const profLabel = PROFILE_LABELS[profile] || profile;
  const s = getActiveSetupStatus();
  const racikan = s.name
    ? `${s.name}${s.exists ? (s.edited ? " ✎ (ada edit manual)" : "") : " (file hilang)"}`
    : "— (belum load racikan)";
  return compact
    ? `🧬 Profil: ${profLabel} · 🗂️ Racikan: ${racikan}`
    : `🧬 Profil: ${profLabel}\n🗂️ Racikan: ${racikan}`;
}

export function deletePreset(name) {
  if (!presetExists(name)) throw new Error(`preset "${name}" not found`);
  fs.unlinkSync(presetPath(name));
  return { deleted: true, name };
}
