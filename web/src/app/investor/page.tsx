"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address, type Hash } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { Addr, Due, Empty, Field, Notice, Page, RequireWallet, Section, Stamp, TxResult } from "@/components/ui";
import { hundiAbi } from "@/lib/abi";
import { HUNDI, ROLE_INVESTOR } from "@/lib/config";
import { parseUsdt, usdt } from "@/lib/format";
import { POLL_MS, Status, approveUsdt, useInvoices, useNow, useParticipant, useTx, useUsdt, type InvoiceView } from "@/lib/hooks";

function BuyCard({
  invoice,
  allowance,
  balance,
  eligible,
  onBought,
}: {
  invoice: InvoiceView;
  allowance: bigint;
  balance: bigint;
  eligible: boolean;
  onBought: (hash: Hash) => void;
}) {
  const [amount, setAmount] = useState("");
  const tx = useTx();
  const units = parseUsdt(amount);
  // Rounded up, matching the contract's quote().
  const price = units ? (units * BigInt(10_000 - invoice.discountBps) + 9_999n) / 10_000n : 0n;
  const tooMuch = units !== null && units > invoice.sellerUnits;
  const short = price > balance;

  async function buy() {
    const fund = { address: HUNDI, abi: hundiAbi, functionName: "fund", args: [invoice.id, units!] };
    const hash =
      allowance >= price
        ? await tx.run([fund], ["Buying units"])
        : await tx.run([approveUsdt(price), fund], ["Step 1 of 2: approving USDT", "Step 2 of 2: swapping USDT for units"]);
    if (hash) {
      setAmount("");
      onBought(hash);
    }
  }

  return (
    <div className="border-b border-[var(--line)] py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="link font-medium" href={`/invoice/${invoice.id}`}>
            Invoice No. {invoice.id.toString()}
          </Link>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Owed by <Addr value={invoice.debtor} /> · <Due invoice={invoice} />
          </p>
        </div>
        <div className="text-right">
          <p className="display text-2xl text-[var(--accent)]">{(invoice.discountBps / 100).toFixed(2)}% discount</p>
          <p className="mono text-sm">{usdt(invoice.sellerUnits)} USDT available</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label="Face value to buy (USDT)">
            <input className="input mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        <button className="btn-ghost" type="button" onClick={() => setAmount(String(Number(invoice.sellerUnits) / 1e6))}>
          Max
        </button>
        <button className="btn btn-accent" disabled={!units || tooMuch || short || tx.state.status === "pending"} onClick={buy}>
          {units ? `Pay ${usdt(price)} USDT` : "Buy"}
        </button>
      </div>
      {units && !tooMuch && !short && (
        <p className="mt-2 text-sm text-[var(--muted)]">
          You receive <strong className="mono text-[var(--ink)]">{usdt(units)} USDT</strong> on the due date, a gain of{" "}
          <strong className="mono text-[var(--good)]">{usdt(units - price)} USDT</strong>, if the importer pays in full.
        </p>
      )}
      {tooMuch && <p className="mt-2 text-sm text-[var(--bad)]">That is more than is available.</p>}
      {units && !tooMuch && short && <p className="mt-2 text-sm text-[var(--bad)]">Not enough USDT in this wallet.</p>}
      {!eligible && <p className="mt-2 text-sm text-[var(--muted)]">This wallet isn&apos;t a verified investor. Try it: the contract will refuse.</p>}
      <TxResult state={tx.state} />
    </div>
  );
}

function PositionRow({ invoice, units, claimable, owner }: { invoice: InvoiceView; units: bigint; claimable: bigint; owner: Address }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const send = useTx();
  const collect = useTx();
  const moveUnits = parseUsdt(amount);
  const open = invoice.status === Status.Acknowledged;

  return (
    <div className="border-b border-[var(--line)] py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="link font-medium" href={`/invoice/${invoice.id}`}>
            Invoice No. {invoice.id.toString()}
          </Link>
          <p className="mono mt-1 text-sm">
            You hold {usdt(units)} USDT of face value · <Due invoice={invoice} />
          </p>
        </div>
        <Stamp invoice={invoice} />
      </div>
      {claimable > 0n && (
        <div className="mt-3">
          <button
            className="btn"
            disabled={collect.state.status === "pending"}
            onClick={() => collect.run([{ address: HUNDI, abi: hundiAbi, functionName: "redeem", args: [invoice.id] }])}
          >
            Collect {usdt(claimable)} USDT now
          </button>
          <p className="mt-1 text-xs text-[var(--muted)]">Optional: the keeper pays this to you automatically.</p>
          <TxResult state={collect.state} />
        </div>
      )}
      {open && (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            send.run([
              {
                address: HUNDI,
                abi: hundiAbi,
                functionName: "safeTransferFrom",
                args: [owner, to as Address, invoice.id, moveUnits!, "0x"],
              },
            ]);
          }}
        >
          <div className="min-w-64 flex-1">
            <Field label="Transfer to">
              <input className="input mono" value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x…" spellCheck={false} />
            </Field>
          </div>
          <div className="w-36">
            <Field label="Face value (USDT)">
              <input className="input mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
          <button className="btn-ghost" disabled={!isAddress(to) || !moveUnits || send.state.status === "pending"}>
            Transfer
          </button>
        </form>
      )}
      <TxResult state={send.state} />
    </div>
  );
}

function Positions({ invoices, owner }: { invoices: InvoiceView[]; owner: Address }) {
  const client = usePublicClient();
  const { data } = useQuery({
    queryKey: ["positions", owner, invoices.length],
    refetchInterval: POLL_MS,
    enabled: invoices.length > 0,
    queryFn: async () => {
      const values = await client!.multicall({
        allowFailure: false,
        contracts: invoices.flatMap((invoice) => [
          { address: HUNDI, abi: hundiAbi, functionName: "balanceOf", args: [owner, invoice.id] } as const,
          { address: HUNDI, abi: hundiAbi, functionName: "claimable", args: [invoice.id, owner] } as const,
        ]),
      });
      return invoices
        .map((invoice, i) => ({ invoice, units: values[i * 2] as bigint, claimable: values[i * 2 + 1] as bigint }))
        .filter((position) => position.units > 0n);
    },
  });
  if (!data?.length) return <Empty>You don&apos;t hold any invoices yet.</Empty>;
  return data.map((position) => (
    <PositionRow key={position.invoice.id.toString()} {...position} owner={owner} />
  ));
}

export default function InvestorPage() {
  const { address } = useAccount();
  const { data: invoices } = useInvoices();
  const { data: wallet } = useUsdt(address);
  const { data: participant } = useParticipant(address);
  const now = useNow();
  // Kept here because a fully bought invoice disappears from the list, along with its card.
  const [lastPurchase, setLastPurchase] = useState<Hash>();
  const eligible = !!(participant?.active && participant.roles & ROLE_INVESTOR);
  const open = (invoices ?? []).filter(
    (invoice) =>
      invoice.status === Status.Acknowledged &&
      invoice.sellerUnits > 0n &&
      invoice.seller !== address &&
      (now === null || now < Number(invoice.dueDate)),
  );

  return (
    <Page
      eyebrow="Investor"
      title="Buy invoices at a discount"
      intro="Every invoice here has been confirmed by the importer who owes it. You pay less than face value now, and the contract pays you face value on the due date."
    >
      <RequireWallet>
        {wallet && (
          <Notice>
            Your wallet holds <strong className="mono">{usdt(wallet.balance)} USDT</strong>.
            {!eligible && " This wallet is not a verified investor."}
          </Notice>
        )}
        <Section title="Open for funding">
          {open.length === 0 ? (
            <Empty>No confirmed invoices are open right now.</Empty>
          ) : (
            open.map((invoice) => (
              <BuyCard
                key={invoice.id.toString()}
                invoice={invoice}
                allowance={wallet?.allowance ?? 0n}
                balance={wallet?.balance ?? 0n}
                eligible={eligible}
                onBought={setLastPurchase}
              />
            ))
          )}
          {lastPurchase && <TxResult state={{ status: "success", hash: lastPurchase }} />}
        </Section>
        <Section title="Your holdings">
          {address && <Positions invoices={invoices ?? []} owner={address} />}
        </Section>
      </RequireWallet>
    </Page>
  );
}
