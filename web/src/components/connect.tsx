"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { ROLE_EXPORTER, ROLE_IMPORTER, ROLE_INVESTOR, chain } from "@/lib/config";
import { short } from "@/lib/format";
import { useIsVerifier, useParticipant } from "@/lib/hooks";

function roleLabel(roles: number) {
  const names = [];
  if (roles & ROLE_EXPORTER) names.push("Exporter");
  if (roles & ROLE_IMPORTER) names.push("Importer");
  if (roles & ROLE_INVESTOR) names.push("Investor");
  return names.join(" & ");
}

export function WalletRole() {
  const { address } = useAccount();
  const { data: participant } = useParticipant(address);
  const { data: isVerifier } = useIsVerifier(address);
  if (isVerifier) return <span className="chip">Verifier</span>;
  if (!participant) return null;
  if (participant.frozen) return <span className="chip chip-bad">Frozen</span>;
  if (!participant.active) return <span className="chip chip-bad">Not verified</span>;
  return <span className="chip">{roleLabel(participant.roles)}</span>;
}

export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!mounted) return <button className="btn">Connect wallet</button>;

  if (!isConnected || !address) {
    const injected = connectors[0];
    return (
      <div className="flex flex-col items-end">
        <button className="btn" disabled={isPending} onClick={() => connect({ connector: injected })}>
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
        {error && <span className="mt-1 text-xs text-[var(--bad)]">{error.message.split(".")[0]}</span>}
      </div>
    );
  }

  if (chainId !== chain.id) {
    return (
      <button className="btn btn-warn" onClick={() => switchChain({ chainId: chain.id })}>
        Switch to {chain.name}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <WalletRole />
      <button className="btn-ghost mono text-sm" title="Disconnect" onClick={() => disconnect()}>
        {short(address)}
      </button>
    </div>
  );
}
