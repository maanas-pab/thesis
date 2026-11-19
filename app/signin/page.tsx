"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { hasLocalAccount, signIn } from "@/lib/store";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState(false);
  useEffect(() => setLegacy(hasLocalAccount()), []);
  const ok = /^\S+@\S+\.\S+$/.test(email) && password.length >= (mode === "signup" ? 8 : 1);
  const signup = mode === "signup";

  return (
    <form
      className="signin"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok || busy) return;
        setBusy(true);
        setError(null);
        const err = await signIn(email.trim(), password, mode);
        setBusy(false);
        if (err) return setError(err);
        router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      }}
    >
      <span className="mark big rise" />
      <h1 className="rise" style={{ "--d": "60ms" } as React.CSSProperties}>
        {signup ? "Create your account." : "Sign in to Thesis."}
      </h1>
      <p className="rise" style={{ "--d": "140ms" } as React.CSSProperties}>
        {signup
          ? legacy
            ? "Your practice account on this device comes with you: cash, positions and history."
            : "You get $1,000 of practice money and a Solana devnet wallet. Your account follows you to any device."
          : "Welcome back. Your positions are where you left them."}
      </p>
      <input
        className="field rise"
        style={{ "--d": "220ms" } as React.CSSProperties}
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        aria-label="Email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="field rise"
        style={{ "--d": "250ms" } as React.CSSProperties}
        type="password"
        placeholder={signup ? "Password, 8 characters or more" : "Password"}
        autoComplete={signup ? "new-password" : "current-password"}
        aria-label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="err signin-err">{error}</p>}
      <button className="btn wide rise" style={{ "--d": "280ms" } as React.CSSProperties} disabled={!ok || busy} data-busy={busy}>
        <span className="btn-label">{busy ? (signup ? "Creating account" : "Signing in") : signup ? "Create account" : "Sign in"}</span> <span className="arrow">→</span>
      </button>
      <p className="signin-switch rise" style={{ "--d": "320ms" } as React.CSSProperties}>
        {signup ? "Already have an account?" : "New to Thesis?"}{" "}
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(signup ? "signin" : "signup");
            setError(null);
          }}
        >
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
      <p className="signin-fine">
        Practice money only. Thesis is a demo and doesn&rsquo;t take deposits. <Link href="/">Back to stories</Link>
      </p>
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
