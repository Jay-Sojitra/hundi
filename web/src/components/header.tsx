"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./connect";

const LINKS = [
  { href: "/verifier", label: "Verifier" },
  { href: "/exporter", label: "Exporter" },
  { href: "/importer", label: "Importer" },
  { href: "/investor", label: "Investor" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="border-b border-[var(--line)] bg-[var(--paper)]">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3">
        <Link href="/" className="display text-2xl tracking-tight">
          Hundi
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Roles">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`rounded px-3 py-1.5 ${pathname === link.href ? "bg-[var(--ink)] text-[var(--paper)]" : "hover:bg-[var(--line)]"}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <ConnectButton />
      </div>
    </header>
  );
}
