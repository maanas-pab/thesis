"use client";
import { useSyncExternalStore } from "react";
import type { Alert, Closed, Order, Point, PoolHolding, Position } from "./types";

// Each user's practice account lives on the server (app/api/account) and is mirrored here.
export const START_CASH = 1000;
/** history is the account's total value over time, recorded while the app is open. */
export type Account = {
  email: string;
  wallet: string;
  cash: number;
  positions: Position[];
  history: Point[];
  alerts?: Alert[];
  orders?: Order[];
  closed?: Closed[];
  pools?: PoolHolding[];
  /** Devnet wallet secret key. Demo only: a real app would use an embedded wallet. */
  walletSecret?: number[];
};

/** Where the account lived before there were real accounts; imported on sign-up, then cleared. */
const LEGACY = "thesis.account.v2";
const listeners = new Set<() => void>();
/** undefined until the server answers, null when signed out. */
let snapshot: Account | null | undefined;
let version = 0;
let loading: Promise<void> | null = null;
let dirty = false;
let saving = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("thesis.account") : null;

function set(a: Account | null, v: number) {
  snapshot = a;
  version = v;
  listeners.forEach((l) => l());
}

function load() {
  if (loading) return loading;
  loading = fetch("/api/account", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) return set(null, 0);
      const j = await r.json();
      // Don't clobber edits made while this was in flight.
      if (!dirty && !saving) set(j.account, j.version);
    })
    .catch(() => {
      if (snapshot === undefined) set(null, 0);
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

function read(): Account | null {
  return snapshot ?? null;
}

/** Update the account here at once and save it to the server shortly after. */
function write(next: Account) {
  snapshot = next;
  listeners.forEach((l) => l());
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}

async function flush(leaving = false) {
  clearTimeout(timer);
  if (saving || !dirty || !snapshot) return;
  saving = true;
  dirty = false;
  const body = JSON.stringify({ account: snapshot, version });
  try {
    const r = await fetch("/api/account", { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: leaving && body.length < 60_000 });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      version = j.version;
      channel?.postMessage("saved");
    } else if (r.status === 409) {
      // Another tab or device saved first: theirs wins, and this one shows it.
      set(j.account, j.version);
    } else if (r.status === 401) {
      set(null, 0);
    } else {
      dirty = true;
    }
  } catch {
    dirty = true;
  } finally {
    saving = false;
    if (dirty) timer = setTimeout(flush, 3000);
  }
}

let wired = false;
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  channel?.addEventListener("message", () => !dirty && !saving && load());
  window.addEventListener("focus", () => !dirty && !saving && snapshot && load());
  window.addEventListener("pagehide", () => flush(true));
}

function subscribe(l: () => void) {
  listeners.add(l);
  wire();
  if (snapshot === undefined) load();
  return () => {
    listeners.delete(l);
  };
}

/** undefined while the account is loading, null when signed out. */
export function useAccount(): Account | null | undefined {
  return useSyncExternalStore(subscribe, () => snapshot, () => undefined);
}

/** Sign in or create an account. Returns an error to show, or null on success. */
export async function signIn(email: string, password: string, mode: "signin" | "signup"): Promise<string | null> {
  let local: unknown = null;
  try {
    local = mode === "signup" ? JSON.parse(localStorage.getItem(LEGACY) ?? "null") : null;
  } catch {}
  const r = await fetch(`/api/auth/${mode === "signup" ? "signup" : "login"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, local }),
  }).catch(() => null);
  if (!r) return "Couldn't reach the server. Check your connection.";
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return j.error ?? "Something went wrong.";
  try {
    if (mode === "signup") localStorage.removeItem(LEGACY);
  } catch {}
  dirty = false;
  set(j.account, j.version);
  channel?.postMessage("saved");
  return null;
}

/** Whether this browser has a practice account from before sign-in existed. */
export function hasLocalAccount() {
  try {
    return !!localStorage.getItem(LEGACY);
  } catch {
    return false;
  }
}

/** The account's devnet keypair, made now for accounts created before wallets were real. */
export async function walletKeypair() {
  const { Keypair } = await import("@solana/web3.js");
  const a = read();
  if (!a) return null;
  if (a.walletSecret) return Keypair.fromSecretKey(Uint8Array.from(a.walletSecret));
  const kp = Keypair.generate();
  write({ ...a, wallet: kp.publicKey.toBase58(), walletSecret: Array.from(kp.secretKey) });
  return kp;
}

/** Attach the minted token to a position once the chain confirms it. */
export function setChain(positionId: string, chain: NonNullable<Position["chain"]>) {
  const a = read();
  if (a) write({ ...a, positions: a.positions.map((p) => (p.id === positionId ? { ...p, chain } : p)) });
}
export async function signOut() {
  await flush();
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
  set(null, 0);
  channel?.postMessage("saved");
}

/** Returns the new position's id, or null when there isn't enough cash. */
export function buy(p: Omit<Position, "id" | "ts">) {
  const a = read();
  if (!a || a.cash < p.cost) return null;
  const id = crypto.randomUUID();
  write({ ...a, cash: a.cash - p.cost, positions: [{ ...p, id, ts: Date.now() }, ...a.positions] });
  return id;
}

/** Close a position, by selling at the bid or collecting a settled payout. */
export function sell(id: string, proceeds: number, how: Closed["how"] = "sold") {
  const a = read();
  const p = a?.positions.find((x) => x.id === id);
  if (!a || !p) return;
  const done: Closed = { id, storyName: p.storyName, kind: p.kind, cost: p.cost, proceeds, how, ts: Date.now() };
  write({ ...a, cash: a.cash + proceeds, positions: a.positions.filter((x) => x.id !== id), closed: [done, ...(a.closed ?? [])].slice(0, 100) });
}

const uid = () => crypto.randomUUID();

export function addAlert(x: Omit<Alert, "id" | "ts">) {
  const a = read();
  if (!a) return;
  write({ ...a, alerts: [...(a.alerts ?? []), { ...x, id: uid(), ts: Date.now() }] });
}
export function removeAlert(id: string) {
  const a = read();
  if (a) write({ ...a, alerts: (a.alerts ?? []).filter((x) => x.id !== id) });
}

/** Place a limit buy. The cash is set aside until it fills or is cancelled. */
export function placeOrder(x: Omit<Order, "id" | "ts">) {
  const a = read();
  if (!a || a.cash < x.dollars) return false;
  write({ ...a, cash: a.cash - x.dollars, orders: [...(a.orders ?? []), { ...x, id: uid(), ts: Date.now() }] });
  return true;
}
export function cancelOrder(id: string) {
  const a = read();
  const o = a?.orders?.find((x) => x.id === id);
  if (!a || !o) return;
  write({ ...a, cash: a.cash + o.dollars, orders: a.orders!.filter((x) => x.id !== id) });
}
/** Turn a resting order into a position. The cash was already set aside. */
export function fillOrder(id: string, p: Omit<Position, "id" | "ts">) {
  const a = read();
  if (!a?.orders?.some((x) => x.id === id)) return null;
  const pid = uid();
  write({ ...a, orders: a.orders.filter((x) => x.id !== id), positions: [{ ...p, id: pid, ts: Date.now() }, ...a.positions] });
  return pid;
}

/** Record the account's total value. Kept to one point a minute unless forced. */
export function snap(value: number, force = false) {
  const a = read();
  if (!a || !Number.isFinite(value)) return;
  const last = a.history[a.history.length - 1];
  if (!force && last && Date.now() - last.t < 55_000) return;
  write({ ...a, history: [...a.history, { t: Date.now(), v: value }].slice(-3000) });
}

// ---------- Tiered pools ----------

export function joinPool(h: Omit<PoolHolding, "ts">) {
  const a = read();
  if (!a || a.cash < h.amount) return false;
  write({ ...a, cash: a.cash - h.amount, pools: [{ ...h, ts: Date.now() }, ...(a.pools ?? [])] });
  return true;
}

export function setPoolTier(depositId: string, tier: PoolHolding["tier"]) {
  const a = read();
  if (a) write({ ...a, pools: (a.pools ?? []).map((h) => (h.depositId === depositId ? { ...h, tier } : h)) });
}

/** Money coming back from a pool: a withdrawal, a refund or a payout. Applied once. */
export function poolReturn(depositId: string, amount: number, how: NonNullable<PoolHolding["done"]>) {
  const a = read();
  const h = a?.pools?.find((x) => x.depositId === depositId);
  if (!a || !h || h.done) return false;
  write({
    ...a,
    cash: a.cash + amount,
    pools: a.pools!.map((x) => (x.depositId === depositId ? { ...x, done: how, payout: amount } : x)),
    closed: how === "collected" ? [{ id: depositId, storyName: `${h.storyName} pool`, kind: "whole" as const, cost: h.amount, proceeds: amount, how: "settled" as const, ts: Date.now() }, ...(a.closed ?? [])].slice(0, 100) : a.closed,
  });
  return true;
}
