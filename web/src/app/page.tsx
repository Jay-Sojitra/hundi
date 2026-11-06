"use client";

import Link from "next/link";
import { InvoiceTable, Section } from "@/components/ui";
import { useInvoices } from "@/lib/hooks";

const ROLES = [
  { href: "/exporter", name: "Exporter", text: "Issue an invoice and get paid in USDT today, at a discount you set." },
  { href: "/importer", name: "Importer", text: "Confirm a genuine invoice, and repay on the due date in one step." },
  { href: "/investor", name: "Investor", text: "Buy a discounted claim. You get paid in full, without doing anything." },
  { href: "/verifier", name: "Verifier", text: "Decide who may take part. Every rule checks this list." },
];

const RULES = [
  ["One invoice, one financing", "A reference can be registered once, ever. A second attempt reverts."],
  ["Debtor confirms first", "No units exist until the importer says the invoice is real."],
  ["Verified holders only", "Sending units to an unverified wallet reverts, even in a direct transfer."],
  ["Asset and cash together", "Units and USDT move in one transaction, or neither moves."],
  ["The due date fixes who gets paid", "Buying and transfers stop on the due date."],
  ["Fair shares on default", "Holders split whatever is recovered, including later recoveries."],
];

export default function Home() {
  const { data: invoices, isLoading, error } = useInvoices();

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <p className="eyebrow">Invoice finance, enforced onchain</p>
      <h1 className="display mt-3 max-w-3xl text-5xl leading-[1.08]">
        Shipped the goods? Get paid today, not in 90 days.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-[var(--muted)]">
        An exporter sells an unpaid invoice to verified investors for USDT. On the due date the contract collects from
        the importer and pays the investors. The rules live in the contract, not in anyone&apos;s back office.
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => (
          <Link key={role.href} href={role.href} className="panel block p-4 transition-colors hover:border-[var(--ink)]">
            <span className="display text-lg">{role.name}</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">{role.text}</span>
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <Section title="Invoice ledger" aside="Live from Whitechain Sepolia">
          {error ? (
            <p className="text-sm text-[var(--bad)]">Could not read the ledger: {error.message}</p>
          ) : isLoading ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">Reading the chain…</p>
          ) : (
            <InvoiceTable invoices={invoices ?? []} empty="No invoices yet. An exporter can issue the first one." />
          )}
        </Section>
      </div>

      <h2 className="display mt-12 text-2xl">What the contract refuses to do</h2>
      <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {RULES.map(([title, text]) => (
          <div key={title} className="border-t border-[var(--line)] pt-3">
            <dt className="font-medium">{title}</dt>
            <dd className="mt-1 text-sm text-[var(--muted)]">{text}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
