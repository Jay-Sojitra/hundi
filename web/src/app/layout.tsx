import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Hundi: invoice finance on Whitechain",
  description: "Sell an unpaid invoice to verified investors for USDT today. Settlement is enforced onchain.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <Header />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-[var(--line)] px-5 py-4 text-center text-xs text-[var(--muted)]">
            Whitechain Sepolia testnet. Test tokens only, no monetary value.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
