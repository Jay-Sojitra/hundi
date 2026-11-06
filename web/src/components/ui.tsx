"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import type { InvoiceView, TxState } from "@/lib/hooks";
import { Status, useNow } from "@/lib/hooks";
import { addressUrl, short, timeLeft, txUrl, usdt } from "@/lib/format";
import { ConnectButton } from "./connect";

export function Page({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display mt-2 text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">{intro}</p>
      <div className="mt-8 space-y-8">{children}</div>
    </main>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-5 py-3">
        <h2 className="display text-xl">{title}</h2>
        {aside && <div className="text-sm text-[var(--muted)]">{aside}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--muted)]">{children}</p>;
}

/** Shows the wallet prompt until connected. */
export function RequireWallet({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  if (isConnected) return <>{children}</>;
  return (
    <div className="panel flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-[var(--muted)]">Connect a wallet to use this screen.</p>
      <ConnectButton />
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return <div className={`notice ${tone === "warn" ? "notice-warn" : ""}`}>{children}</div>;
}

export function TxResult({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  if (state.status === "pending") {
    return <p className="mt-3 text-sm text-[var(--muted)]">{state.label ?? "Waiting for the transaction"}…</p>;
  }
  if (state.status === "success") {
    return (
      <p className="mt-3 text-sm text-[var(--good)]">
        Confirmed on chain.{" "}
        <a className="link" href={txUrl(state.hash)} target="_blank" rel="noreferrer">
          View transaction
        </a>
      </p>
    );
  }
  const { failure } = state;
  return (
    <div className={`mt-3 text-sm ${failure.blockedByContract ? "blocked" : "text-[var(--bad)]"}`} role="alert">
      {failure.blockedByContract && (
        <p className="font-semibold">
          Blocked by the contract{failure.rule ? ` · Rule ${failure.rule}` : ""}
          {failure.name ? ` · ${failure.name}` : ""}
        </p>
      )}
      <p>{failure.message}</p>
    </div>
  );
}

export function Addr({ value }: { value: `0x${string}` }) {
  return (
    <a className="mono link" href={addressUrl(value)} target="_blank" rel="noreferrer">
      {short(value)}
    </a>
  );
}

const STAMPS: Record<string, string> = {
  "Awaiting importer": "stamp-neutral",
  "Open for funding": "stamp-accent",
  "Fully funded": "stamp-accent",
  "Due, awaiting settlement": "stamp-warn",
  Rejected: "stamp-bad",
  Settled: "stamp-good",
  Defaulted: "stamp-bad",
};

export function stageOf(invoice: InvoiceView, now: number | null) {
  switch (invoice.status) {
    case Status.Issued:
      return "Awaiting importer";
    case Status.Rejected:
      return "Rejected";
    case Status.Settled:
      return "Settled";
    case Status.Defaulted:
      return "Defaulted";
    default:
      if (now !== null && now >= Number(invoice.dueDate)) return "Due, awaiting settlement";
      return invoice.sellerUnits === 0n ? "Fully funded" : "Open for funding";
  }
}

export function Stamp({ invoice }: { invoice: InvoiceView }) {
  const now = useNow();
  const stage = stageOf(invoice, now);
  return <span className={`stamp ${STAMPS[stage]}`}>{stage}</span>;
}

export function Due({ invoice }: { invoice: InvoiceView }) {
  const now = useNow();
  return <span className="mono text-sm">{now === null ? "" : timeLeft(invoice.dueDate, now)}</span>;
}

export function InvoiceTable({ invoices, empty }: { invoices: InvoiceView[]; empty: string }) {
  if (invoices.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="ledger w-full min-w-[640px]">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Exporter</th>
            <th>Importer</th>
            <th className="text-right">Face value</th>
            <th>Due</th>
            <th>Stage</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id.toString()}>
              <td>
                <Link className="link font-medium" href={`/invoice/${invoice.id}`}>
                  No. {invoice.id.toString()}
                </Link>
              </td>
              <td>
                <Addr value={invoice.seller} />
              </td>
              <td>
                <Addr value={invoice.debtor} />
              </td>
              <td className="mono text-right">{usdt(invoice.face)} USDT</td>
              <td>
                <Due invoice={invoice} />
              </td>
              <td>
                <Stamp invoice={invoice} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
