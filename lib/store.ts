"use client";
import { useSyncExternalStore } from "react";
import type { Position } from "./types";

// Demo mode: everything lives in this browser. No wallet, tokens or orders yet.
export type Account = { email: string; wallet: string; cash: number; positions: Position[] };

const KEY = "thesis.account.v1";
const listeners = new Set<() => void>();
let snapshot: Account | null | undefined;

function read(): Account | null {
  if (snapshot !== undefined) return snapshot;
  try {
    snapshot = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    snapshot = null;
  }
  return snapshot ?? null;
}

function write(next: Account | null) {
  snapshot = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = undefined;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** undefined while the page is still loading, null when signed out. */
export function useAccount(): Account | null | undefined {
  return useSyncExternalStore(subscribe, read, () => undefined);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function signIn(email: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(44));
  const wallet = Array.from(bytes, (b) => B58[b % B58.length]).join("");
  write({ email, wallet, cash: 1000, positions: [] });
}
export const signOut = () => write(null);

export function buy(p: Omit<Position, "id" | "ts">) {
  const a = read();
  if (!a || a.cash < p.cost) return false;
  write({
    ...a,
    cash: a.cash - p.cost,
    positions: [{ ...p, id: crypto.randomUUID(), ts: Date.now() }, ...a.positions],
  });
  return true;
}

export function sell(id: string, proceeds: number) {
  const a = read();
  if (!a) return;
  write({ ...a, cash: a.cash + proceeds, positions: a.positions.filter((p) => p.id !== id) });
}
