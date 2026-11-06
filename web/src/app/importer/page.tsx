"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Due, Empty, Notice, Page, RequireWallet, Section, Stamp, TxResult } from "@/components/ui";
import { hundiAbi } from "@/lib/abi";
import { HUNDI } from "@/lib/config";
import { usdt } from "@/lib/format";
import { Status, approveUsdt, useInvoices, useTx, useUsdt, type InvoiceView } from "@/lib/hooks";

function InvoiceRow({ invoice, allowance }: { invoice: InvoiceView; allowance: bigint }) {
  const tx = useTx();
  const busy = tx.state.status === "pending";
  const owed = invoice.face - invoice.collected;
  const act = (functionName: string, args: readonly unknown[]) =>
    tx.run([{ address: HUNDI, abi: hundiAbi, functionName, args }]);

  return (
    <div className="border-b border-[var(--line)] py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="link font-medium" href={`/invoice/${invoice.id}`}>
            Invoice No. {invoice.id.toString()}
          </Link>
          <p className="mono mt-1 text-sm">
            {usdt(invoice.face)} USDT · <Due invoice={invoice} />
          </p>
        </div>
        <Stamp invoice={invoice} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {invoice.status === Status.Issued && (
          <>
            <button className="btn btn-accent" disabled={busy} onClick={() => act("acknowledge", [invoice.id])}>
              Confirm invoice is genuine
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => act("reject", [invoice.id])}>
              Reject
            </button>
          </>
        )}
        {invoice.status === Status.Acknowledged && (
          <>
            {allowance < owed && (
              <button className="btn btn-accent" disabled={busy} onClick={() => tx.run([approveUsdt(owed)])}>
                Allow {usdt(owed)} USDT for the due date
              </button>
            )}
            <button
              className="btn-ghost"
              disabled={busy || allowance < owed}
              onClick={() => act("repay", [invoice.id, owed])}
            >
              Repay now
            </button>
          </>
        )}
        {invoice.status === Status.Defaulted && owed > 0n && (
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              tx.run(
                [approveUsdt(owed), { address: HUNDI, abi: hundiAbi, functionName: "repay", args: [invoice.id, owed] }],
                ["Approving USDT", "Paying the balance"],
              )
            }
          >
            Pay remaining {usdt(owed)} USDT
          </button>
        )}
      </div>
      {invoice.status === Status.Acknowledged && allowance >= owed && (
        <p className="mt-2 text-sm text-[var(--good)]">Ready: USDT will be collected automatically on the due date.</p>
      )}
      <TxResult state={tx.state} />
    </div>
  );
}

export default function ImporterPage() {
  const { address } = useAccount();
  const { data: invoices } = useInvoices();
  const { data: wallet } = useUsdt(address);
  const mine = (invoices ?? []).filter((invoice) => invoice.debtor === address);

  return (
    <Page
      eyebrow="Importer"
      title="Invoices you owe"
      intro="Confirm the invoices you recognise. Your payment terms don't change: you pay the face value on the due date, and the contract routes it to whoever holds the invoice."
    >
      <RequireWallet>
        {wallet && (
          <Notice>
            Your wallet holds <strong className="mono">{usdt(wallet.balance)} USDT</strong>. Approved for collection:{" "}
            <strong className="mono">{usdt(wallet.allowance)} USDT</strong>.
          </Notice>
        )}
        <Section title="Awaiting you">
          {mine.length === 0 ? (
            <Empty>No invoices name this wallet as the importer.</Empty>
          ) : (
            mine.map((invoice) => (
              <InvoiceRow key={invoice.id.toString()} invoice={invoice} allowance={wallet?.allowance ?? 0n} />
            ))
          )}
        </Section>
      </RequireWallet>
    </Page>
  );
}
