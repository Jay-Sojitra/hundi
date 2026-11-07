"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, stringToHex, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { Addr, Empty, Field, Notice, Page, RequireWallet, Section, TxResult } from "@/components/ui";
import { registryAbi } from "@/lib/abi";
import { REGISTRY, ROLE_EXPORTER, ROLE_IMPORTER, ROLE_INVESTOR } from "@/lib/config";
import { dateTime } from "@/lib/format";
import { POLL_MS, blockRangesSinceDeploy, useIsVerifier, useTx } from "@/lib/hooks";

const ROLES = [
  { bit: ROLE_EXPORTER, label: "Exporter" },
  { bit: ROLE_IMPORTER, label: "Importer" },
  { bit: ROLE_INVESTOR, label: "Investor" },
];

function ApproveForm() {
  const [account, setAccount] = useState("");
  const [roles, setRoles] = useState(ROLE_INVESTOR);
  const [jurisdiction, setJurisdiction] = useState("IN");
  const [days, setDays] = useState("90");
  const tx = useTx();

  const valid = isAddress(account) && roles > 0 && /^[A-Za-z]{2}$/.test(jurisdiction) && Number(days) > 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + Number(days) * 86_400);
    tx.run([
      {
        address: REGISTRY,
        abi: registryAbi,
        functionName: "setParticipant",
        args: [account as Address, roles, expiresAt, stringToHex(jurisdiction.toUpperCase(), { size: 2 })],
      },
    ]);
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Wallet address">
          <input
            className="input mono"
            value={account}
            onChange={(e) => setAccount(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
          />
        </Field>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium">May act as</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {ROLES.map((role) => (
            <label key={role.bit} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(roles & role.bit) !== 0}
                onChange={() => setRoles(roles ^ role.bit)}
              />
              {role.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Jurisdiction" hint="Two-letter country code">
        <input className="input" maxLength={2} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
      </Field>
      <Field label="Approval valid for (days)" hint="After this the wallet can no longer act or receive units">
        <input className="input" type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <button className="btn" disabled={!valid || tx.state.status === "pending"}>
          Approve participant
        </button>
        <TxResult state={tx.state} />
      </div>
    </form>
  );
}

function ParticipantRow({ account }: { account: Address }) {
  const client = usePublicClient();
  const tx = useTx();
  const { data } = useQuery({
    queryKey: ["participantRow", account],
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const p = await client!.readContract({
        address: REGISTRY,
        abi: registryAbi,
        functionName: "getParticipant",
        args: [account],
      });
      return { ...p, roles: Number(p.roles), expiresAt: BigInt(p.expiresAt) };
    },
  });
  if (!data) return null;
  const toggle = () =>
    tx.run([{ address: REGISTRY, abi: registryAbi, functionName: "setFrozen", args: [account, !data.frozen] }]);
  return (
    <tr>
      <td>
        <Addr value={account} />
      </td>
      <td>{ROLES.filter((r) => data.roles & r.bit).map((r) => r.label).join(", ")}</td>
      <td className="text-sm">{dateTime(data.expiresAt)}</td>
      <td>
        <button className="btn-ghost" disabled={tx.state.status === "pending"} onClick={toggle}>
          {data.frozen ? "Unfreeze" : "Freeze"}
        </button>
        <TxResult state={tx.state} />
      </td>
    </tr>
  );
}

function Participants() {
  const client = usePublicClient();
  const { data: accounts, isError } = useQuery({
    queryKey: ["participants"],
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const ranges = await blockRangesSinceDeploy(client!);
      const pages = await Promise.all(
        ranges.map((range) =>
          client!.getContractEvents({
            address: REGISTRY,
            abi: registryAbi,
            eventName: "ParticipantSet",
            ...range,
          }),
        ),
      );
      return [...new Set(pages.flat().map((log) => log.args.account as Address))];
    },
  });
  if (!accounts && isError) return <Notice tone="warn">Couldn&apos;t read the list from the chain. Retrying…</Notice>;
  if (!accounts) return <Empty>Reading the chain…</Empty>;
  if (!accounts.length) return <Empty>No participants approved yet.</Empty>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="ledger w-full min-w-[560px]">
        <thead>
          <tr>
            <th>Wallet</th>
            <th>Roles</th>
            <th>Valid until</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <ParticipantRow key={account} account={account} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VerifierPage() {
  const { address } = useAccount();
  const { data: isVerifier } = useIsVerifier(address);
  return (
    <Page
      eyebrow="Verifier"
      title="Who may take part"
      intro="Every transfer, purchase and invoice checks this list in the contract. Removing someone here takes effect immediately."
    >
      <RequireWallet>
        {isVerifier === false && <Notice tone="warn">This wallet is not the verifier. The contract will refuse changes.</Notice>}
        <Section title="Approve a participant">
          <ApproveForm />
        </Section>
        <Section title="Approved participants">
          <Participants />
        </Section>
      </RequireWallet>
    </Page>
  );
}
