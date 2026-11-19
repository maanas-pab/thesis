"use client";
import { useEffect } from "react";

/**
 * Page-wide scroll effects, kept in one place:
 * - writes the scroll offset to --sy on <html>, which parallax layers read in CSS;
 * - reveals anything marked .reveal once its top comes into view.
 * Reveals are checked straight from layout on every scroll, resize and DOM change rather than with an
 * IntersectionObserver, so a section can never get stuck hidden. Reduced motion skips both.
 */
export default function Scroll() {
  useEffect(() => {
    const root = document.documentElement;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const reveal = () => {
      const edge = window.innerHeight * 0.94;
      document.querySelectorAll<HTMLElement>(".reveal:not([data-in])").forEach((el) => {
        if (still || el.getBoundingClientRect().top < edge) el.dataset.in = "";
      });
    };

    let frame = 0;
    const write = () => {
      frame = 0;
      root.style.setProperty("--sy", String(Math.max(0, window.scrollY)));
    };
    const onScroll = () => {
      reveal();
      if (!still && !frame) frame = requestAnimationFrame(write);
    };

    write();
    reveal();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // A soft spotlight follows the pointer across cards.
    const spot = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.<HTMLElement>(".card, .hero-card, .tile, .srow, .tile-s");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", spot, { passive: true });

    // New pages and late-loading sections bring new .reveal elements.
    const mo = new MutationObserver(reveal);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", spot);
      cancelAnimationFrame(frame);
      mo.disconnect();
    };
  }, []);
  return null;
}
