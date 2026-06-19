/**
 * smoke-sizing-v2.1.js — OFFLINE smoke test of the "maximize" sizing money-logic.
 *
 * SAFETY: imports config.js (READ-ONLY load of user-config.json) and mutates the
 * IN-MEMORY config object only — writes NOTHING to disk, touches no live bot.
 * Verifies the FASE-1 sizing math + rent-aware balance check by hand-simulating a
 * full 2-position fill, before vs after.
 *
 * Run:  node scripts/smoke-sizing-v2.1.js
 */

import { config, computeDeployAmount } from "../config.js";

// ── mainzen_v2.1 sizing knobs (in-memory ONLY, not persisted) ───
config.management.sizingMode = "maximize";
config.management.rentPerPositionSol = 0.057;
config.management.gasReserve = 0.03;
config.management.deployAmountSol = 0.1; // → executor minDeploy floor = max(0.1, 0.1) = 0.1
config.risk.maxPositions = 2;
config.risk.maxDeployAmount = 10;

const GAS = config.management.gasReserve;
const RENT = config.management.rentPerPositionSol;
const MAXPOS = config.risk.maxPositions;
const MIN_DEPLOY = Math.max(0.1, config.management.deployAmountSol); // executor.js:1004

const r = (x, d = 4) => Number(x).toFixed(d);
let failures = 0;
const assert = (cond, msg) => {
  console.log(`   ${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failures++;
};

// Balance check mirror (executor.js): minRequired = amount + gas + rentReserve.
const balanceCheck = (wallet, amount) => {
  const minRequired = amount + GAS + RENT;
  return { ok: wallet >= minRequired, minRequired };
};

console.log("=== SMOKE: mainzen_v2.1 'maximize' sizing (offline, in-memory) ===");
console.log(`Knobs: sizingMode=maximize · gas=${GAS} · rent/pos=${RENT} · maxPositions=${MAXPOS} · minDeploy=${MIN_DEPLOY}\n`);

// ── Scenario from task: wallet 0.4, gas 0.03, rent 0.057×2 → each ~0.13 ──
let wallet = 0.4;
console.log(`Scenario: wallet ${wallet} SOL, open both positions.\n`);

// FIXED mode (factory formula) for contrast — slot-blind, ignores slotsRemaining.
config.management.sizingMode = "fixed";
const fixedS2 = computeDeployAmount(wallet, { slotsRemaining: 2 });
const fixedS1 = computeDeployAmount(wallet, { slotsRemaining: 1 });
console.log(`BEFORE (fixed formula): deploy = ${r(fixedS2)} SOL for slots-left 2 AND ${r(fixedS1)} for slots-left 1`);
console.log(`   → identical (slot-blind): no per-slot split, no rent reserve → 2nd pos can starve/fail.`);
config.management.sizingMode = "maximize";

console.log("\nAFTER (maximize/v2.1) — fill 2 slots from the CURRENT wallet each step:");

// Position 1 — slotsRemaining = 2
let slots = MAXPOS - 0;
const d1 = computeDeployAmount(wallet, { slotsRemaining: slots });
const c1 = balanceCheck(wallet, d1);
console.log(`\n Pos 1 (slots left ${slots}): wallet ${r(wallet)} → deploy ${r(d1)} SOL`);
assert(d1 >= MIN_DEPLOY, `deploy ${r(d1)} ≥ minDeploy ${MIN_DEPLOY} (executor floor)`);
assert(c1.ok, `balance check passes (need ${r(c1.minRequired)}, have ${r(wallet)})`);
wallet = wallet - d1 - RENT; // deploy leaves the liquidity + locks rent (gas spent ≈ 0 here)
console.log(`   wallet after = ${r(wallet)} (− deploy ${r(d1)} − rent ${RENT})`);

// Position 2 — slotsRemaining = 1, recompute from the reduced wallet
slots = MAXPOS - 1;
const d2 = computeDeployAmount(wallet, { slotsRemaining: slots });
const c2 = balanceCheck(wallet, d2);
console.log(`\n Pos 2 (slots left ${slots}): wallet ${r(wallet)} → deploy ${r(d2)} SOL`);
assert(d2 >= MIN_DEPLOY, `deploy ${r(d2)} ≥ minDeploy ${MIN_DEPLOY} (executor floor)`);
assert(c2.ok, `balance check passes (need ${r(c2.minRequired)}, have ${r(wallet)})`);
wallet = wallet - d2 - RENT;
console.log(`   wallet after = ${r(wallet)} (− deploy ${r(d2)} − rent ${RENT})`);

// ── Final assertions ──
console.log("\n── Result ──");
console.log(` Both positions deployed: ${r(d1)} + ${r(d2)} = ${r(d1 + d2)} SOL liquidity`);
console.log(` Rent locked (refundable): ${r(RENT * 2)} SOL`);
console.log(` Leftover wallet: ${r(wallet)} SOL  (target ≈ gasReserve ${GAS})`);
assert(Math.abs(d1 - 0.13) < 0.02 && Math.abs(d2 - 0.13) < 0.02, "each position ≈ 0.13 SOL (task target)");
assert(Math.abs(wallet - GAS) < 0.005, `leftover ≈ gasReserve (${r(wallet)} ≈ ${GAS})`);
assert(wallet >= 0, "wallet never goes negative (no failed/gas-eating deploy)");

// ── Edge: tiny wallet should NOT floor up to 0.13 and fail the balance check ──
console.log("\n── Edge: small wallet 0.25 (1 slot) ──");
config.risk.maxPositions = 1;
const small = computeDeployAmount(0.25, { slotsRemaining: 1 });
const cs = balanceCheck(0.25, small);
console.log(` deploy ${r(small)} SOL, balance need ${r(cs.minRequired)} (have 0.25)`);
assert(cs.ok, "small-wallet deploy still passes balance check (floored, never over-commits)");

console.log(`\n${failures === 0 ? "✅ SMOKE PASS — all assertions green" : `❌ SMOKE FAIL — ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
