"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/lib/store";
import { usd } from "@/lib/math";

export default function Nav() {
  const path = usePathname();
  const account = useAccount();
  const cur = (href: string) => ((href === "/" ? path === "/" || path.startsWith("/s/") : path.startsWith(href)) ? "page" : undefined);
  return (
    <header className="nav">
      <div className="nav-in">
        <Link href="/" className="brand">
          <i />
          Thesis
        </Link>
        <nav className="nav-links">
          <Link href="/" aria-current={cur("/")}>
            Stories
          </Link>
          <Link href="/portfolio" aria-current={cur("/portfolio")}>
            Portfolio
          </Link>
        </nav>
        <div className="nav-acct">
          {account === undefined ? null : account ? (
            <span className="num muted">{usd(account.cash)}</span>
          ) : (
            <Link href="/signin" className="btn sm ghost">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
