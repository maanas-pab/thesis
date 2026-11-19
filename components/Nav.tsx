"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/lib/store";
import { usd } from "@/lib/math";

const LINKS = [
  { href: "/", label: "Stories" },
  { href: "/thesis", label: "Thesis" },
  { href: "/build", label: "Build" },
  { href: "/leaders", label: "Leaders" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/chain", label: "On chain" },
];

export default function Nav() {
  const path = usePathname();
  const account = useAccount();
  const cur = (href: string) => ((href === "/" ? path === "/" || path.startsWith("/s/") : path.startsWith(href)) ? "page" : undefined);
  return (
    <header className="nav">
      <div className="nav-in">
        <Link href="/" className="brand" aria-label="Thesis, home">
          <i className="mark" />
          Thesis
        </Link>
        <nav className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={cur(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav-acct">
          {account === undefined ? null : account ? (
            <Link href="/portfolio" className="cash">
              <span>Cash</span>
              {usd(account.cash)}
            </Link>
          ) : (
            <Link href="/signin" className="btn sm">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
