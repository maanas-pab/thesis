import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import { Toaster } from "sonner";
import Nav from "@/components/Nav";
import Scroll from "@/components/Scroll";
import Tape from "@/components/Tape";
import Tracker from "@/components/Tracker";
import "./globals.css";

const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const sans = Instrument_Sans({ variable: "--font-sans", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Thesis",
  description: "Pick a story about the future, see what the market charges for it, and buy the whole basket in one tap.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <Nav />
        <Tape />
        <main className="wrap">{children}</main>
        <footer className="foot">
          <div className="foot-in">
            <span className="foot-brand">
              <i className="mark" />
              Thesis
            </span>
            <span>Demo edition. Live Gemini prices, practice money, story tokens on Solana devnet.</span>
          </div>
        </footer>
        <Scroll />
        <Tracker />
        <Toaster position="top-center" theme="system" />
      </body>
    </html>
  );
}
