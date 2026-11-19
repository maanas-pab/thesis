"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-reads live prices on a timer while the tab is visible. */
export default function Live({ every = 20 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every * 1000);
    return () => clearInterval(timer);
  }, [router, every]);
  return null;
}
