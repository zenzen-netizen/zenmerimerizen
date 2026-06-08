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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = path.join(__dirname, "presets");
const USER_CONFIG_PATH = path.join(__dirname, "user-config.json");
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

/** Flatten a config object to dotted keys, skipping internal/meta keys (`_*`). */
function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.startsWith("_")) continue;
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

/** Snapshot the current user-config.json into presets/<name>.json. */
export function savePreset(name) {
  if (!validName(name)) throw new Error(`invalid preset name "${name}"`);
  if (!fs.existsSync(USER_CONFIG_PATH)) throw new Error("user-config.json not found");
  ensureDir();
  const overwritten = fs.existsSync(presetPath(name));
  fs.copyFileSync(USER_CONFIG_PATH, presetPath(name));
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
  const content = fs.readFileSync(presetPath(name), "utf8");
  JSON.parse(content); // validate before touching anything
  let backupName = null;
  if (backup && fs.existsSync(USER_CONFIG_PATH)) {
    backupName = BACKUP_NAME;
    fs.copyFileSync(USER_CONFIG_PATH, presetPath(BACKUP_NAME));
  }
  fs.writeFileSync(USER_CONFIG_PATH, content);
  return { applied: true, name, backup: backupName };
}

export function deletePreset(name) {
  if (!presetExists(name)) throw new Error(`preset "${name}" not found`);
  fs.unlinkSync(presetPath(name));
  return { deleted: true, name };
}
