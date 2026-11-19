"use client";
import { toast } from "sonner";
import { setChain, walletKeypair } from "./store";
import type { Position } from "./types";

/** Mint the devnet token for a new position. The buy itself never waits on this. */
export async function mintFor(positionId: string, p: Pick<Position, "storyId" | "storyName" | "kind" | "units">) {
  const kp = await walletKeypair();
  if (!kp) return;
  const res = await fetch("/api/chain/mint", {
    method: "POST",
    body: JSON.stringify({ owner: kp.publicKey.toBase58(), storyId: p.storyId, storyName: p.storyName, kind: p.kind, units: p.units }),
  }).catch(() => null);
  const out = res ? await res.json().catch(() => ({})) : {};
  if (!res?.ok || !out.mint) {
    toast.message("Recorded in the demo only", { description: out.error ?? "Solana devnet couldn't be reached." });
    return;
  }
  setChain(positionId, out);
  toast.success("Story token minted on Solana devnet", {
    description: `${p.units.toFixed(2)} tokens sent to your wallet.`,
    action: { label: "View", onClick: () => window.open(out.url, "_blank", "noopener") },
  });
}

/** Burn a closed position's tokens: the server builds and fee-pays, the wallet signs. */
export async function burnFor(p: Position) {
  if (!p.chain) return;
  const kp = await walletKeypair();
  if (!kp) return;
  const { Transaction } = await import("@solana/web3.js");
  const step1 = await fetch("/api/chain/burn", { method: "POST", body: JSON.stringify({ owner: kp.publicKey.toBase58(), mint: p.chain.mint, units: p.units }) })
    .then((r) => r.json())
    .catch(() => ({}));
  if (!step1.tx) return toast.message("Token not burned", { description: step1.error ?? "Solana devnet couldn't be reached." });
  const tx = Transaction.from(Buffer.from(step1.tx, "base64"));
  tx.partialSign(kp);
  const step2 = await fetch("/api/chain/burn", { method: "POST", body: JSON.stringify({ signed: tx.serialize().toString("base64") }) })
    .then((r) => r.json())
    .catch(() => ({}));
  if (!step2.signature) return toast.message("Token not burned", { description: step2.error ?? "The burn didn't confirm." });
  toast("Story token burned on devnet", { action: { label: "View", onClick: () => window.open(step2.url, "_blank", "noopener") } });
}
