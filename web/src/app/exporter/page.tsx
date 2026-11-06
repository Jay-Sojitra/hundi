"use client";

import { useState } from "react";
import { isAddress, keccak256, stringToHex, toHex, zeroHash, type Address, type Hex } from "viem";
import { useAccount } from "wagmi";
import { Field, InvoiceTable, Notice, Page, RequireWallet, Section, TxResult } from "@/components/ui";
import { hundiAbi } from "@/lib/abi";
import { HUNDI, ROLE_EXPORTER } from "@/lib/config";
import { parseUsdt, usdt } from "@/lib/format";
import { useInvoices, useParticipant, useTx } from "@/lib/hooks";

const TENORS = [
  { label: "2 minutes (demo)", seconds: 120 },
  { label: "5 minutes (demo)", seconds: 300 },
  { label: "30 days", seconds: 30 * 86_400 },
  { label: "60 days", seconds: 60 * 86_400 },
  { label: "90 days", seconds: 90 * 86_400 },
];

function IssueForm() {
  const [debtor, setDebtor] = useState("");
  const [reference, setReference] = useState("");
  const [face, setFace] = useState("5");
  const [discount, setDiscount] = useState("4");
  const [tenor, setTenor] = useState(TENORS[0].seconds);
  const [docHash, setDocHash] = useState<Hex>(zeroHash);
  const [docName, setDocName] = useState("");
  const tx = useTx();

  const faceUnits = parseUsdt(face);
  const discountBps = Math.round(Number(discount) * 100);
  const valid =
    isAddress(debtor) && reference.trim() !== "" && faceUnits !== null && discountBps >= 0 && discountBps <= 5_000;
  const proceeds = faceUnits ? (faceUnits * BigInt(10_000 - discountBps)) / 10_000n : 0n;

  async function attach(file?: File) {
    if (!file) return;
    setDocHash(keccak256(toHex(new Uint8Array(await file.arrayBuffer()))));
    setDocName(file.name);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const dueDate = BigInt(Math.floor(Date.now() / 1000) + tenor);
    // The reference stays in the form after issuing: submitting it again shows rule R2 at work.
    tx.run([
      {
        address: HUNDI,
        abi: hundiAbi,
        functionName: "issue",
        args: [
          debtor as Address,
          faceUnits!,
          dueDate,
          discountBps,
          keccak256(stringToHex(reference.trim())),
          docHash,
        ],
      },
    ]);
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Importer's wallet" hint="Must be a verified importer. They confirm the invoice next.">
          <input
            className="input mono"
            value={debtor}
            onChange={(e) => setDebtor(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Invoice reference (GST e-invoice IRN)" hint="Only its hash goes on chain. Each reference can be used once, ever.">
          <input className="input mono" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="IRN-2026-000142" />
        </Field>
      </div>
      <Field label="Face value (USDT)">
        <input className="input mono" inputMode="decimal" value={face} onChange={(e) => setFace(e.target.value)} />
      </Field>
      <Field label="Discount you offer (%)" hint="50% at most">
        <input className="input mono" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
      </Field>
      <Field label="Due in">
        <select className="input" value={tenor} onChange={(e) => setTenor(Number(e.target.value))}>
          {TENORS.map((option) => (
            <option key={option.seconds} value={option.seconds}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Invoice document (optional)" hint={docName ? `Hashed ${docName}` : "Hashed in your browser. The file is never uploaded."}>
        <input className="input" type="file" onChange={(e) => attach(e.target.files?.[0])} />
      </Field>
      <div className="sm:col-span-2">
        {faceUnits && (
          <p className="mb-3 text-sm text-[var(--muted)]">
            If fully funded you receive <strong className="mono text-[var(--ink)]">{usdt(proceeds)} USDT</strong> now.
          </p>
        )}
        <button className="btn btn-accent" disabled={!valid || tx.state.status === "pending"}>
          Issue invoice
        </button>
        <TxResult state={tx.state} />
      </div>
    </form>
  );
}

export default function ExporterPage() {
  const { address } = useAccount();
  const { data: invoices } = useInvoices();
  const { data: participant } = useParticipant(address);
  const mine = (invoices ?? []).filter((invoice) => invoice.seller === address);
  const canIssue = participant?.active && participant.roles & ROLE_EXPORTER;

  return (
    <Page
      eyebrow="Exporter"
      title="Turn an unpaid invoice into USDT"
      intro="Issue the invoice, have your importer confirm it, and investors can buy it at your discount. You are paid in the same transaction as each purchase."
    >
      <RequireWallet>
        {participant && !canIssue && (
          <Notice tone="warn">This wallet is not a verified exporter, so the contract will refuse to issue.</Notice>
        )}
        <Section title="Issue an invoice">
          <IssueForm />
        </Section>
        <Section title="Your invoices">
          <InvoiceTable invoices={mine} empty="You haven't issued any invoices from this wallet." />
        </Section>
      </RequireWallet>
    </Page>
  );
}
