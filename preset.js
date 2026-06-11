#!/usr/bin/env node
/**
 * Config preset CLI — manage full user-config.json snapshots from the terminal,
 * even when the bot isn't running.
 *
 *   node preset.js list
 *   node preset.js save <name>
 *   node preset.js use  <name>      # writes user-config.json (restart bot to apply)
 *   node preset.js show <name>      # diff vs current config
 *   node preset.js rm   <name>
 */

import {
  listPresets,
  savePreset,
  applyPreset,
  getPresetDiff,
  deletePreset,
  validName,
  presetExists,
  getActiveSetupStatus,
} from "./preset-manager.js";

const [, , sub = "list", name] = process.argv;
const out = (s) => console.log(s);
const die = (s) => { console.error(s); process.exit(1); };

try {
  switch (sub) {
    case "list":
    case "ls": {
      const ps = listPresets();
      if (!ps.length) { out("No presets yet. Save one: node preset.js save <name>"); break; }
      const st = getActiveSetupStatus();
      out(`Active racikan: ${st.name ? st.name + (st.edited ? " (edited)" : "") : "— (none)"}`);
      out("Config presets / racikan (* = matches current config):");
      for (const p of ps) {
        if (p.error) { out(`  ! ${p.name}  (unreadable)`); continue; }
        out(`  ${p.isCurrent ? "*" : " "} ${p.name}  (${p.dryRun ? "dry-run" : "live"}, ${p.keys} keys)`);
      }
      break;
    }
    case "save": {
      if (!validName(name)) die("Usage: node preset.js save <name>  (letters/digits/_/-, max 40)");
      const r = savePreset(name);
      out(`Saved current config -> presets/${name}.json${r.overwritten ? " (overwrote existing)" : ""}`);
      break;
    }
    case "show":
    case "diff": {
      if (!presetExists(name)) die(`Usage: node preset.js show <name>  (preset "${name ?? ""}" not found)`);
      const d = getPresetDiff(name);
      if (!d.length) { out(`"${name}" already matches the current config — nothing would change.`); break; }
      out(`Applying "${name}" would change ${d.length} setting(s):`);
      for (const x of d) out(`  ${x.key}: ${x.from} -> ${x.to}`);
      break;
    }
    case "use":
    case "load": {
      if (!presetExists(name)) die(`Usage: node preset.js use <name>  (preset "${name ?? ""}" not found)`);
      const r = applyPreset(name);
      out(`Loaded "${name}" -> user-config.json (backup: presets/${r.backup}.json)`);
      out("Restart the bot to apply fully:  pm2 restart meridian");
      break;
    }
    case "rm":
    case "delete":
    case "del": {
      if (!presetExists(name)) die(`Usage: node preset.js rm <name>  (preset "${name ?? ""}" not found)`);
      deletePreset(name);
      out(`Deleted presets/${name}.json`);
      break;
    }
    default:
      out("Usage: node preset.js [list | save <name> | use <name> | show <name> | rm <name>]");
  }
} catch (e) {
  die(`Error: ${e.message}`);
}
