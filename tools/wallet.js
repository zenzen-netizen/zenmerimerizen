import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
  Keypair,
} from "@solana/web3.js";
import bs58 from "bs58";
import { log } from "../logger.js";
import { config } from "../config.js";
import { trackTxGas } from "../gas-tracker.js";
import { recordSolBalance } from "../sol-tracker.js";

let _connection = null;
let _wallet = null;

function getConnection() {
  if (!_connection) _connection = new Connection(process.env.RPC_URL, "confirmed");
  return _connection;
}

function getWallet() {
  if (!_wallet) {
    if (!process.env.WALLET_PRIVATE_KEY) throw new Error("WALLET_PRIVATE_KEY not set");
    _wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));
  }
  return _wallet;
}

const JUPITER_PRICE_API = "https://api.jup.ag/price/v3";
const JUPITER_SWAP_V2_API = "https://api.jup.ag/swap/v2";
const DEFAULT_JUPITER_API_KEY = "b15d42e9-e0e4-4f90-a424-ae41ceeaa382";

function getJupiterApiKey() {
  return config.jupiter.apiKey || process.env.JUPITER_API_KEY || DEFAULT_JUPITER_API_KEY;
}

function getJupiterReferralParams() {
  const referralAccount = String(config.jupiter.referralAccount || "").trim();
  const referralFee = Number(config.jupiter.referralFeeBps || 0);
  if (!referralAccount || !Number.isFinite(referralFee) || referralFee <= 0) {
    return null;
  }
  if (referralFee < 50 || referralFee > 255) {
    log("swap_warn", `Ignoring Jupiter referral fee ${referralFee}; Ultra requires 50-255 bps`);
    return null;
  }
  try {
    new PublicKey(referralAccount);
  } catch {
    log("swap_warn", "Ignoring invalid Jupiter referral account");
    return null;
  }
  return { referralAccount, referralFee: Math.round(referralFee) };
}

/**
 * Get current wallet balances: SOL, USDC, and all SPL tokens using Helius Wallet API.
 * Returns USD-denominated values provided by Helius.
 */
export async function getWalletBalances() {
  let walletAddress;
  try {
    walletAddress = getWallet().publicKey.toString();
  } catch {
    return { wallet: null, sol: 0, sol_price: 0, sol_usd: 0, usdc: 0, tokens: [], total_usd: 0, error: "Wallet not configured" };
  }

  const HELIUS_KEY = process.env.HELIUS_API_KEY;
  if (!HELIUS_KEY) {
    log("wallet_error", "HELIUS_API_KEY not set in .env");
    return { wallet: walletAddress, sol: 0, sol_price: 0, sol_usd: 0, usdc: 0, tokens: [], total_usd: 0, error: "Helius API key missing" };
  }

  try {
    const url = `https://api.helius.xyz/v1/wallet/${walletAddress}/balances?api-key=${HELIUS_KEY}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      throw new Error(`Helius API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const balances = data.balances || [];

    // ─── Find SOL and USDC ────────────────────────────────────
    const solEntry = balances.find(b => b.mint === config.tokens.SOL || b.symbol === "SOL");
    const usdcEntry = balances.find(b => b.mint === config.tokens.USDC || b.symbol === "USDC");

    const solBalance = solEntry?.balance || 0;
    const solPrice = solEntry?.pricePerToken || 0;
    const solUsd = solEntry?.usdValue || 0;
    const usdcBalance = usdcEntry?.balance || 0;

    // Calendar-day SOL growth tracker (/wallet): set today's WIB opening
    // baseline on the first successful read of the day. Fail-open.
    recordSolBalance(Math.round(solBalance * 1e6) / 1e6);

    // ─── Map all tokens ───────────────────────────────────────
    const enrichedTokens = balances.map(b => ({
      mint: b.mint,
      symbol: b.symbol || b.mint.slice(0, 8),
      balance: b.balance,
      usd: b.usdValue ? Math.round(b.usdValue * 100) / 100 : null,
    }));

    return {
      wallet: walletAddress,
      sol: Math.round(solBalance * 1e6) / 1e6,
      sol_price: Math.round(solPrice * 100) / 100,
      sol_usd: Math.round(solUsd * 100) / 100,
      usdc: Math.round(usdcBalance * 100) / 100,
      tokens: enrichedTokens,
      total_usd: Math.round((data.totalUsdValue || 0) * 100) / 100,
    };
  } catch (error) {
    log("wallet_error", error.message);
    return {
      wallet: walletAddress,
      sol: 0,
      sol_price: 0,
      sol_usd: 0,
      usdc: 0,
      tokens: [],
      total_usd: 0,
      error: error.message,
    };
  }
}

/**
 * Swap tokens via Jupiter Swap API V2 (order → sign → execute).
 */
const SOL_MINT = "So11111111111111111111111111111111111111112";

const JUPITER_QUOTE_API = "https://api.jup.ag/swap/v1/quote";

// Read-only Jupiter quote — no signing, no tx. Returns the raw quote object.
async function jupiterQuote({ inputMint, outputMint, amount }) {
  const search = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    slippageBps: "50",
    restrictIntermediateTokens: "true",
  });
  const key = getJupiterApiKey();
  const res = await fetch(`${JUPITER_QUOTE_API}?${search.toString()}`, {
    headers: key ? { "x-api-key": key } : {},
  });
  if (!res.ok) throw new Error(`quote ${res.status}`);
  const q = await res.json();
  if (q.error || !q.outAmount) throw new Error(q.error || "no route");
  return q;
}

/**
 * Probe exit liquidity: how costly is it, right now, to round-trip `solNotional`
 * SOL through `baseMint` and back to SOL? Two read-only quotes — size in
 * (SOL→base) then sell back (base→SOL). The realized round-trip loss is
 * interpretation-free (no reliance on priceImpactPct semantics) and captures
 * impact in BOTH directions plus fees/spread — exactly the "easy in, hard out"
 * cost for thin memecoins.
 *
 * Returns { roundTripLossPct, impactPct, baseAmount, outSol }. Throws on no
 * route / bad input so callers can fail-open.
 */
export async function quoteSellPriceImpact({ baseMint, solNotional }) {
  if (!baseMint || normalizeMint(baseMint) === SOL_MINT) throw new Error("no base mint to probe");
  const solLamports = Math.floor(Number(solNotional) * 1e9);
  if (!Number.isFinite(solLamports) || solLamports <= 0) throw new Error("bad notional");

  // 1) Size: how much base does solNotional SOL buy?
  const buy = await jupiterQuote({ inputMint: SOL_MINT, outputMint: baseMint, amount: solLamports });
  const baseAmount = Number(buy.outAmount);
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) throw new Error("zero base out");

  // 2) Sell that base straight back to SOL.
  const sell = await jupiterQuote({ inputMint: baseMint, outputMint: SOL_MINT, amount: baseAmount });
  const outLamports = Number(sell.outAmount);
  const roundTripLossPct = ((solLamports - outLamports) / solLamports) * 100;
  const impactPct = Math.abs(Number(sell.priceImpactPct ?? 0)) * 100; // Jupiter returns a fraction

  return { roundTripLossPct, impactPct, baseAmount, outSol: outLamports / 1e9 };
}

/**
 * Read SOL's current price and 24h change from Jupiter Price v3 (read-only,
 * single GET). Used by the 🧪 market-regime gate to decide whether the market
 * is "risk-off" before screening for new positions. No history is stored —
 * the 24h change comes straight from the API.
 *
 * Returns { usdPrice, change24hPct, liquidity } on success, or null on any
 * error / missing field so callers can fail-open (never block on a hiccup).
 */
export async function getSolMarketRegime() {
  try {
    const key = getJupiterApiKey();
    const res = await fetch(`${JUPITER_PRICE_API}?ids=${SOL_MINT}`, {
      headers: key ? { "x-api-key": key } : {},
    });
    if (!res.ok) throw new Error(`price ${res.status}`);
    const data = await res.json();
    const entry = data?.[SOL_MINT];
    const change24hPct = Number(entry?.priceChange24h);
    if (!entry || !Number.isFinite(change24hPct)) return null;
    return {
      usdPrice: Number(entry.usdPrice) || null,
      change24hPct,
      liquidity: Number(entry.liquidity) || null,
    };
  } catch (e) {
    log("wallet_error", `getSolMarketRegime failed: ${e.message}`);
    return null;
  }
}

// Normalize any SOL-like address to the correct wrapped SOL mint
export function normalizeMint(mint) {
  if (!mint) return mint;
  const SOL_MINT = "So11111111111111111111111111111111111111112";
  if (
    mint === "SOL" || 
    mint === "native" || 
    /^So1+$/.test(mint) || 
    (mint.length >= 32 && mint.length <= 44 && mint.startsWith("So1") && mint !== SOL_MINT)
  ) {
    return SOL_MINT;
  }
  return mint;
}

export async function swapToken({
  input_mint,
  output_mint,
  amount,
}) {
  input_mint  = normalizeMint(input_mint);
  output_mint = normalizeMint(output_mint);

  if (process.env.DRY_RUN === "true") {
    return {
      dry_run: true,
      would_swap: { input_mint, output_mint, amount },
      message: "DRY RUN — no transaction sent",
    };
  }

  try {
    log("swap", `${amount} of ${input_mint} → ${output_mint}`);
    const wallet = getWallet();
    const connection = getConnection();

    // ─── Convert to smallest unit ──────────────────────────────
    let decimals = 9; // SOL default
    if (input_mint !== config.tokens.SOL) {
      const mintInfo = await connection.getParsedAccountInfo(new PublicKey(input_mint));
      decimals = mintInfo.value?.data?.parsed?.info?.decimals ?? 9;
    }
    const amountStr = Math.floor(amount * Math.pow(10, decimals)).toString();

    // ─── Get Swap V2 order (unsigned tx + requestId) ───────────
    const search = new URLSearchParams({
      inputMint: input_mint,
      outputMint: output_mint,
      amount: amountStr,
      taker: wallet.publicKey.toString(),
    });
    const referralParams = getJupiterReferralParams();
    if (referralParams) {
      search.set("referralAccount", referralParams.referralAccount);
      search.set("referralFee", String(referralParams.referralFee));
    }
    const orderUrl = `${JUPITER_SWAP_V2_API}/order?${search.toString()}`;
    const jupiterApiKey = getJupiterApiKey();

    const orderRes = await fetch(orderUrl, {
      headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {},
    });
    if (!orderRes.ok) {
      const body = await orderRes.text();
      throw new Error(`Swap V2 order failed: ${orderRes.status} ${body}`);
    }

    const order = await orderRes.json();
    if (order.errorCode || order.errorMessage) {
      throw new Error(`Swap V2 order error: ${order.errorMessage || order.errorCode}`);
    }

    const { transaction: unsignedTx, requestId } = order;

    // ─── Deserialize and sign ─────────────────────────────────
    const tx = VersionedTransaction.deserialize(Buffer.from(unsignedTx, "base64"));
    tx.sign([wallet]);
    const signedTx = Buffer.from(tx.serialize()).toString("base64");

    // ─── Execute ───────────────────────────────────────────────
    const execRes = await fetch(`${JUPITER_SWAP_V2_API}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}),
      },
      body: JSON.stringify({ signedTransaction: signedTx, requestId }),
    });
    if (!execRes.ok) {
      throw new Error(`Swap V2 execute failed: ${execRes.status} ${await execRes.text()}`);
    }

    const result = await execRes.json();
    if (result.status === "Failed") {
      throw new Error(`Swap failed on-chain: code=${result.code}`);
    }

    log("swap", `SUCCESS tx: ${result.signature}`);
    trackTxGas(getConnection(), result.signature, "swap"); // real gas capture, fail-open
    if (referralParams && order.feeBps !== referralParams.referralFee) {
      log(
        "swap_warn",
        `Jupiter referral fee requested ${referralParams.referralFee} bps but order applied ${order.feeBps ?? "unknown"} bps`,
      );
    }

    return {
      success: true,
      tx: result.signature,
      input_mint,
      output_mint,
      amount_in: result.inputAmountResult,
      amount_out: result.outputAmountResult,
      referral_account: referralParams?.referralAccount || null,
      referral_fee_bps_requested: referralParams?.referralFee || 0,
      fee_bps_applied: order.feeBps ?? null,
      fee_mint: order.feeMint ?? null,
    };
  } catch (error) {
    log("swap_error", error.message);
    return { success: false, error: error.message };
  }
}
