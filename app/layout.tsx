import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Thesis",
  description: "Pick a story about the future, see what the market charges for it, and buy the whole basket in one tap.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className="banner">Demo mode. Live Gemini prices; buys are simulated in this browser.</div>
        <Nav />
        <main className="wrap">{children}</main>
        <Toaster position="top-center" theme="system" />
      </body>
    </html>
  );
}
