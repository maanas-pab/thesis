import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import type { Account } from "./store";

/**
 * Accounts, sessions and the saved practice account for each user.
 * Sessions are random tokens in an httpOnly cookie; only their hash is stored.
 */
const COOKIE = "thesis_session";
const DAYS = 30;
const START_CASH = 1000;
const MAX_DOC = 1_000_000;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const cleanEmail = (e: unknown) => String(e ?? "").trim().toLowerCase().slice(0, 200);
export const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---- Brute-force guard: 8 failed logins per email and address in 15 minutes. ----
const g = globalThis as unknown as { __loginFails?: Map<string, number[]> };
const fails: Map<string, number[]> = (g.__loginFails ??= new Map());
const WINDOW = 15 * 60_000;
export function tooManyFailures(key: string) {
  const recent = (fails.get(key) ?? []).filter((t) => Date.now() - t < WINDOW);
  fails.set(key, recent);
  return recent.length >= 8;
}
const failed = (key: string) => fails.set(key, [...(fails.get(key) ?? []), Date.now()]);

/** Reject cookie-authenticated writes that come from another site. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

async function newWallet() {
  const { Keypair } = await import("@solana/web3.js");
  const kp = Keypair.generate();
  return { wallet: kp.publicKey.toBase58(), walletSecret: Array.from(kp.secretKey) };
}

/** A fresh practice account, or the one this browser already had before accounts existed. */
async function startingDoc(email: string, local: unknown): Promise<Account> {
  const l = local as Partial<Account> | null;
  if (l && typeof l === "object" && typeof l.cash === "number" && Array.isArray(l.positions) && l.cash >= 0 && l.cash < 1e7) {
    const w = Array.isArray(l.walletSecret) && typeof l.wallet === "string" ? { wallet: l.wallet, walletSecret: l.walletSecret } : await newWallet();
    return { ...(l as Account), ...w, email };
  }
  return { email, ...(await newWallet()), cash: START_CASH, positions: [], history: [{ t: Date.now(), v: START_CASH }] };
}

export async function signUp(emailIn: unknown, password: unknown, local?: unknown) {
  const email = cleanEmail(emailIn);
  if (!emailOk(email)) return { error: "Enter a valid email." };
  const problem = passwordProblem(String(password ?? ""));
  if (problem) return { error: problem };
  if (db().prepare("select 1 from users where email = ?").get(email)) return { error: "There's already an account with that email. Sign in instead." };
  const id = randomUUID();
  const doc = await startingDoc(email, local);
  const now = Date.now();
  const d = db();
  d.exec("begin");
  try {
    d.prepare("insert into users (id, email, password, created_at) values (?, ?, ?, ?)").run(id, email, hashPassword(String(password)), now);
    d.prepare("insert into accounts (user_id, doc, version, updated_at) values (?, ?, 1, ?)").run(id, JSON.stringify(doc), now);
    d.exec("commit");
  } catch (e) {
    d.exec("rollback");
    throw e;
  }
  await startSession(id);
  return { account: doc, version: 1 };
}

export async function logIn(emailIn: unknown, password: unknown, ip: string) {
  const email = cleanEmail(emailIn);
  const key = `${ip}|${email}`;
  if (tooManyFailures(key)) return { error: "Too many tries. Wait 15 minutes and try again.", status: 429 };
  const row = db().prepare("select id, password from users where email = ?").get(email) as { id: string; password: string } | undefined;
  // Hash even when there's no such user, so timing doesn't reveal which emails exist.
  const ok = row ? verifyPassword(String(password ?? ""), row.password) : (verifyPassword("x", hashPassword("y")), false);
  if (!row || !ok) {
    failed(key);
    return { error: "That email and password don't match.", status: 401 };
  }
  await startSession(row.id);
  return { ...getAccount(row.id)!, status: 200 };
}

async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db().prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?, ?, ?, ?)").run(sha(token), userId, now, now + DAYS * 86_400_000);
  db().prepare("delete from sessions where expires_at < ?").run(now);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DAYS * 86_400 });
}

/** The signed-in user, or null. Renews the session when it's more than a day old. */
export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db().prepare("select s.user_id as id, u.email as email, s.expires_at as exp from sessions s join users u on u.id = s.user_id where s.token_hash = ?").get(sha(token)) as
    | { id: string; email: string; exp: number }
    | undefined;
  if (!row || row.exp < Date.now()) return null;
  if (row.exp - Date.now() < (DAYS - 1) * 86_400_000) db().prepare("update sessions set expires_at = ? where token_hash = ?").run(Date.now() + DAYS * 86_400_000, sha(token));
  return { id: row.id, email: row.email };
}

export async function logOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare("delete from sessions where token_hash = ?").run(sha(token));
  jar.delete(COOKIE);
}

export function getAccount(userId: string) {
  const row = db().prepare("select doc, version from accounts where user_id = ?").get(userId) as { doc: string; version: number } | undefined;
  return row ? { account: JSON.parse(row.doc) as Account, version: row.version } : null;
}

/**
 * Save the account if nobody saved over it since `base`; otherwise hand back what's stored.
 * Basic sanity checks keep a broken or hand-edited client from storing nonsense.
 */
export function saveAccount(userId: string, email: string, doc: unknown, base: number) {
  const a = doc as Account;
  if (!a || typeof a !== "object" || typeof a.cash !== "number" || !Number.isFinite(a.cash) || a.cash < -0.01 || !Array.isArray(a.positions) || !Array.isArray(a.history))
    return { error: "That account doesn't look right.", status: 400 as const };
  // The wallet is made once, on the server, and never changes after.
  const stored = getAccount(userId)?.account;
  const wallet = stored?.walletSecret ? { wallet: stored.wallet, walletSecret: stored.walletSecret } : {};
  const text = JSON.stringify({ ...a, ...wallet, email });
  if (text.length > MAX_DOC) return { error: "The account has grown too large to save.", status: 413 as const };
  const r = db().prepare("update accounts set doc = ?, version = version + 1, updated_at = ? where user_id = ? and version = ?").run(text, Date.now(), userId, base);
  if (Number(r.changes) === 1) return { version: base + 1, status: 200 as const };
  return { ...getAccount(userId)!, conflict: true, status: 409 as const };
}
