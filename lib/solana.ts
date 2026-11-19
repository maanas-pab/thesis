import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DATA_DIR } from "./data-dir";
import path from "node:path";
import { createBurnInstruction, createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import type { TrancheKind } from "./types";

/**
 * Story tokens on Solana devnet.
 *
 * One SPL mint per story side (Whole, Safe, Bold). The treasury key is the mint authority for
 * all of them and pays every fee, so buyers never need SOL. A buy mints tokens to the buyer's
 * wallet; a sell burns them, signed by the buyer, with the treasury paying the fee.
 *
 * The treasury key comes from SOLANA_TREASURY_SECRET (a JSON byte array) or a local file that
 * is created on first use and kept out of git.
 */
export const CLUSTER = "devnet";
export const DECIMALS = 6;
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DIR = DATA_DIR;
const KEY_FILE = path.join(DIR, "solana-treasury.json");
const MINT_FILE = path.join(DIR, "solana-mints.json");
const MIN_SOL = 0.01;

type Registry = Record<string, { mint: string; storyName: string; kind: TrancheKind; created: number }>;
const g = globalThis as unknown as { __sol?: { conn: Connection; treasury: Keypair; mints: Registry; busy: Map<string, Promise<PublicKey>> } };

function state() {
  if (g.__sol) return g.__sol;
  let treasury: Keypair;
  if (process.env.SOLANA_TREASURY_SECRET) treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.SOLANA_TREASURY_SECRET)));
  else if (existsSync(KEY_FILE)) treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEY_FILE, "utf8"))));
  else {
    treasury = Keypair.generate();
    mkdirSync(DIR, { recursive: true });
    writeFileSync(KEY_FILE, JSON.stringify(Array.from(treasury.secretKey)), { mode: 0o600 });
  }
  let mints: Registry = {};
  try {
    mints = JSON.parse(readFileSync(MINT_FILE, "utf8"));
  } catch {}
  g.__sol = { conn: new Connection(RPC, "confirmed"), treasury, mints, busy: new Map() };
  return g.__sol;
}

const saveMints = () => {
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(MINT_FILE, JSON.stringify(state().mints, null, 1));
  } catch {}
};

export const explorer = (kind: "address" | "tx", id: string) => `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER}`;

export async function status() {
  const { conn, treasury, mints } = state();
  const lamports = await conn.getBalance(treasury.publicKey).catch(() => null);
  const sol = lamports == null ? null : lamports / LAMPORTS_PER_SOL;
  return {
    cluster: CLUSTER,
    treasury: treasury.publicKey.toBase58(),
    sol,
    ready: sol != null && sol >= MIN_SOL,
    mints: Object.entries(mints).map(([key, m]) => ({ key, ...m, url: explorer("address", m.mint) })),
  };
}

/** The mint for one story side, created the first time anyone buys it. */
async function mintFor(storyId: string, kind: TrancheKind, storyName: string) {
  const s = state();
  const key = `${storyId}:${kind}`;
  if (s.mints[key]) return new PublicKey(s.mints[key].mint);
  // Two buys at once must not create two mints.
  let job = s.busy.get(key);
  if (!job) {
    job = createMint(s.conn, s.treasury, s.treasury.publicKey, null, DECIMALS).then((mint) => {
      s.mints[key] = { mint: mint.toBase58(), storyName, kind, created: Date.now() };
      saveMints();
      return mint;
    });
    s.busy.set(key, job);
    job.finally(() => s.busy.delete(key)).catch(() => {});
  }
  return job;
}

const toAmount = (units: number) => BigInt(Math.round(units * 10 ** DECIMALS));

// A light cap on how fast the treasury can be drained.
const recent: number[] = [];
function allow() {
  const now = Date.now();
  while (recent.length && now - recent[0] > 3_600_000) recent.shift();
  if (recent.length >= 300) return false;
  recent.push(now);
  return true;
}

export async function mintUnits(owner: string, storyId: string, kind: TrancheKind, storyName: string, units: number) {
  const st = await status();
  if (!st.ready) throw new Error(`The devnet treasury needs SOL. Send some to ${st.treasury} from faucet.solana.com.`);
  if (!allow()) throw new Error("Too many mints this hour.");
  if (!(units > 0 && units < 1e7)) throw new Error("Bad amount.");
  const s = state();
  const ownerKey = new PublicKey(owner);
  const mint = await mintFor(storyId, kind, storyName);
  const ata = await getOrCreateAssociatedTokenAccount(s.conn, s.treasury, mint, ownerKey);
  const sig = await mintTo(s.conn, s.treasury, mint, ata.address, s.treasury, toAmount(units));
  return { mint: mint.toBase58(), signature: sig, url: explorer("tx", sig) };
}

/**
 * A burn transaction for the owner to sign. The treasury pays the fee and signs that part now;
 * the owner's signature authorises the burn of their own tokens.
 */
export async function burnTx(owner: string, mint: string, units: number) {
  const s = state();
  const ownerKey = new PublicKey(owner);
  const mintKey = new PublicKey(mint);
  if (!Object.values(s.mints).some((m) => m.mint === mint)) throw new Error("Not a Thesis story token.");
  const ata = getAssociatedTokenAddressSync(mintKey, ownerKey);
  const tx = new Transaction().add(createBurnInstruction(ata, mintKey, ownerKey, toAmount(units)));
  tx.feePayer = s.treasury.publicKey;
  tx.recentBlockhash = (await s.conn.getLatestBlockhash()).blockhash;
  tx.partialSign(s.treasury);
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}

/** Send a transaction the owner has finished signing. Only burns of our own mints get here. */
export async function submit(base64: string) {
  const s = state();
  const tx = Transaction.from(Buffer.from(base64, "base64"));
  if (!tx.feePayer?.equals(s.treasury.publicKey)) throw new Error("Not a Thesis transaction.");
  const sig = await s.conn.sendRawTransaction(tx.serialize());
  await s.conn.confirmTransaction(sig, "confirmed");
  return { signature: sig, url: explorer("tx", sig) };
}
