"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { signIn } from "@/lib/store";

function Form() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const ok = /^\S+@\S+\.\S+$/.test(email);
  return (
    <form
      className="signin"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        signIn(email.trim());
        router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      }}
    >
      <h1>Sign in</h1>
      <p>Just your email. A wallet is made for you, with $1,000 of practice money.</p>
      <input
        className="field"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="btn wide" disabled={!ok}>
        Continue
      </button>
    </form>
  );
}

export default function SignIn() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
