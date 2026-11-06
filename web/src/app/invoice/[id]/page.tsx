"use client";

import { useParams } from "next/navigation";
import { Addr, Due, Empty, Page, Section, Stamp, TxResult } from "@/components/ui";
import { hundiAbi } from "@/lib/abi";
import { HUNDI } from "@/lib/config";
import { dateTime, txUrl, usdt } from "@/lib/format";
import { Status, useHolders, useInvoices, useNow, useTimeline, useTx } from "@/lib/hooks";
import { useAccount } from "wagmi";

export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : 0n;
  const { data: invoices, isLoading } = useInvoices();
  const { data: holders } = useHolders(id);
  const { data: timeline } = useTimeline(id);
  const { isConnected } = useAccount();
  const now = useNow();
  const settle = useTx();
  const distribute = useTx();
  const invoice = invoices?.find((item) => item.id === id);

  if (isLoading) return <Page eyebrow="Invoice" title={`No. ${params.id}`} intro="Reading the chain…"><></></Page>;
  if (!invoice) return <Page eyebrow="Invoice" title={`No. ${params.id}`} intro="This invoice doesn't exist."><></></Page>;

  const due = now !== null && now >= Number(invoice.dueDate);
  const canSettle = invoice.status === Status.Acknowledged && due;
  const owedToHolders = (holders ?? []).some((holder) => holder.claimable > 0n);
  const closed = invoice.status === Status.Settled || invoice.status === Status.Defaulted;

  return (
    <Page
      eyebrow={`Invoice No. ${invoice.id}`}
      title={`${usdt(invoice.face)} USDT`}
      intro={`Due ${dateTime(invoice.dueDate)}, offered at a ${(invoice.discountBps / 100).toFixed(2)}% discount.`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Stamp invoice={invoice} />
        <Due invoice={invoice} />
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[var(--muted)]">Exporter</dt>
          <dd><Addr value={invoice.seller} /></dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Importer</dt>
          <dd><Addr value={invoice.debtor} /></dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Collected</dt>
          <dd className="mono">{usdt(invoice.collected)} of {usdt(invoice.face)} USDT</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Not yet sold</dt>
          <dd className="mono">{usdt(invoice.sellerUnits)} USDT</dd>
        </div>
      </dl>

      {(canSettle || (closed && owedToHolders)) && (
        <Section title="Settlement" aside="Anyone can run this. The keeper normally does.">
          <div className="flex flex-wrap gap-2">
            {canSettle && (
              <button
                className="btn btn-accent"
                disabled={!isConnected || settle.state.status === "pending"}
                onClick={() => settle.run([{ address: HUNDI, abi: hundiAbi, functionName: "settle", args: [id] }])}
              >
                Collect from the importer
              </button>
            )}
            {closed && owedToHolders && (
              <button
                className="btn btn-accent"
                disabled={!isConnected || distribute.state.status === "pending"}
                onClick={() =>
                  distribute.run([
                    { address: HUNDI, abi: hundiAbi, functionName: "distribute", args: [id, 0n, BigInt(holders!.length)] },
                  ])
                }
              >
                Pay all holders
              </button>
            )}
          </div>
          {!isConnected && <p className="mt-2 text-sm text-[var(--muted)]">Connect a wallet to run this.</p>}
          <TxResult state={settle.state} />
          <TxResult state={distribute.state} />
        </Section>
      )}

      <Section title="Who holds this invoice">
        {!holders?.length ? (
          <Empty>{closed ? "Everyone has been paid in full." : "No units exist yet: the importer hasn't confirmed this invoice."}</Empty>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="ledger w-full min-w-[480px]">
              <thead>
                <tr>
                  <th>Holder</th>
                  <th className="text-right">Face value held</th>
                  <th className="text-right">Can collect now</th>
                </tr>
              </thead>
              <tbody>
                {holders.map((holder) => (
                  <tr key={holder.holder}>
                    <td>
                      <Addr value={holder.holder} />
                      {holder.holder === invoice.seller && <span className="ml-2 text-xs text-[var(--muted)]">Exporter</span>}
                    </td>
                    <td className="mono text-right">{usdt(holder.units)} USDT</td>
                    <td className="mono text-right">{usdt(holder.claimable)} USDT</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Onchain history" aside="Every step links to the explorer">
        {!timeline?.length ? (
          <Empty>Reading events…</Empty>
        ) : (
          <ol className="space-y-3">
            {timeline.map((entry) => (
              <li key={`${entry.hash}-${entry.logIndex}`} className="border-l-2 border-[var(--line)] pl-3">
                <p className="font-medium">{entry.title}</p>
                {entry.detail && <p className="text-sm text-[var(--muted)]">{entry.detail}</p>}
                <a className="link mono text-xs" href={txUrl(entry.hash)} target="_blank" rel="noreferrer">
                  {entry.hash.slice(0, 18)}…
                </a>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </Page>
  );
}
