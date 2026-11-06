"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { getPublicClient, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import type { Abi, Address, Hash, Hex } from "viem";
import { hundiAbi, registryAbi } from "./abi";
import { DEPLOY_BLOCK, HUNDI, REGISTRY, USDT, chain, wagmiConfig } from "./config";
import { explainError, type TxFailure } from "./errors";

export const POLL_MS = 3_000;

export const Status = { Issued: 1, Acknowledged: 2, Rejected: 3, Settled: 4, Defaulted: 5 } as const;

export type InvoiceView = {
  id: bigint;
  seller: Address;
  debtor: Address;
  face: bigint;
  dueDate: bigint;
  discountBps: number;
  status: number;
  refHash: Hex;
  docHash: Hex;
  collected: bigint;
  sellerUnits: bigint;
};

function client() {
  return getPublicClient(wagmiConfig)!;
}

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<InvoiceView[]> => {
      const c = client();
      const count = await c.readContract({ address: HUNDI, abi: hundiAbi, functionName: "invoiceCount" });
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
      if (ids.length === 0) return [];
      const invoices = await c.multicall({
        allowFailure: false,
        contracts: ids.map((id) => ({ address: HUNDI, abi: hundiAbi, functionName: "getInvoice", args: [id] }) as const),
      });
      const extras = await c.multicall({
        allowFailure: false,
        contracts: ids.flatMap((id, i) => [
          { address: HUNDI, abi: hundiAbi, functionName: "collected", args: [id] } as const,
          { address: HUNDI, abi: hundiAbi, functionName: "balanceOf", args: [invoices[i].seller, id] } as const,
        ]),
      });
      return ids
        .map((id, i) => ({
          ...invoices[i],
          id,
          face: BigInt(invoices[i].face),
          dueDate: BigInt(invoices[i].dueDate),
          discountBps: Number(invoices[i].discountBps),
          status: Number(invoices[i].status),
          collected: extras[i * 2] as bigint,
          sellerUnits: extras[i * 2 + 1] as bigint,
        }))
        .reverse();
    },
  });
}

export function useParticipant(account?: Address) {
  return useQuery({
    queryKey: ["participant", account],
    enabled: !!account,
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const p = await client().readContract({
        address: REGISTRY,
        abi: registryAbi,
        functionName: "getParticipant",
        args: [account!],
      });
      const active = p.roles !== 0 && Number(p.expiresAt) > Date.now() / 1000 && !p.frozen;
      return { ...p, roles: Number(p.roles), expiresAt: BigInt(p.expiresAt), active };
    },
  });
}

export function useIsVerifier(account?: Address) {
  return useQuery({
    queryKey: ["isVerifier", account],
    enabled: !!account,
    queryFn: async () => {
      const c = client();
      const role = await c.readContract({ address: REGISTRY, abi: registryAbi, functionName: "VERIFIER_ROLE" });
      return c.readContract({
        address: REGISTRY,
        abi: registryAbi,
        functionName: "hasRole",
        args: [role, account!],
      });
    },
  });
}

/** Seconds since the epoch, updated every second. Null until mounted, so server and client match. */
export function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export type TxRequest = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

export type TxState =
  | { status: "idle" }
  | { status: "pending"; label?: string }
  | { status: "success"; hash: Hash }
  | { status: "error"; failure: TxFailure };

/**
 * Runs transactions in order. Each is simulated first, so a contract rule is shown to the user
 * as a clear message before their wallet asks them to sign anything.
 */
export function useTx() {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  async function run(requests: TxRequest[], labels: string[] = []) {
    try {
      let hash: Hash | undefined;
      for (const [index, request] of requests.entries()) {
        setState({ status: "pending", label: labels[index] });
        const params = { ...request, chainId: chain.id } as never;
        await client().simulateContract({ ...(params as object), account: address } as never);
        hash = await writeContract(wagmiConfig, params);
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
        if (receipt.status !== "success") throw new Error("The transaction reverted on chain.");
      }
      setState({ status: "success", hash: hash! });
      await queryClient.invalidateQueries();
      return hash;
    } catch (error) {
      setState({ status: "error", failure: explainError(error) });
      return undefined;
    }
  }

  return { state, run, reset: () => setState({ status: "idle" }) };
}

export const approveUsdt = (amount: bigint): TxRequest => ({
  address: USDT,
  abi: erc20,
  functionName: "approve",
  args: [HUNDI, amount],
});

export function useUsdt(account?: Address) {
  return useQuery({
    queryKey: ["usdt", account],
    enabled: !!account,
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const [balance, allowance] = await client().multicall({
        allowFailure: false,
        contracts: [
          { address: USDT, abi: erc20, functionName: "balanceOf", args: [account!] },
          { address: USDT, abi: erc20, functionName: "allowance", args: [account!, HUNDI] },
        ],
      });
      return { balance: balance as bigint, allowance: allowance as bigint };
    },
  });
}

export function useHolders(id: bigint) {
  return useQuery({
    queryKey: ["holders", id.toString()],
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const c = client();
      const holders = await c.readContract({ address: HUNDI, abi: hundiAbi, functionName: "holdersOf", args: [id] });
      if (holders.length === 0) return [];
      const values = await c.multicall({
        allowFailure: false,
        contracts: holders.flatMap((holder) => [
          { address: HUNDI, abi: hundiAbi, functionName: "balanceOf", args: [holder, id] } as const,
          { address: HUNDI, abi: hundiAbi, functionName: "claimable", args: [id, holder] } as const,
        ]),
      });
      return holders.map((holder, i) => ({
        holder,
        units: values[i * 2] as bigint,
        claimable: values[i * 2 + 1] as bigint,
      }));
    },
  });
}

export type TimelineEntry = { title: string; detail?: string; hash: Hash; blockNumber: bigint; logIndex: number };

export function useTimeline(id: bigint) {
  const c = usePublicClient();
  return useQuery({
    queryKey: ["timeline", id.toString()],
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<TimelineEntry[]> => {
      const logs = await c!.getContractEvents({
        address: HUNDI,
        abi: hundiAbi,
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      });
      const entries: TimelineEntry[] = [];
      for (const log of logs) {
        const args = log.args as Record<string, unknown>;
        if (args.id !== id) continue;
        const describe = describeEvent(log.eventName, args);
        if (!describe) continue;
        entries.push({
          ...describe,
          hash: log.transactionHash,
          blockNumber: log.blockNumber,
          logIndex: log.logIndex,
        });
      }
      // Funding also emits a transfer, already covered by its own entry.
      const fundingTxs = new Set(logs.filter((log) => log.eventName === "InvoiceFunded").map((log) => log.transactionHash));
      return entries.filter((entry) => !(entry.title === "Units moved" && fundingTxs.has(entry.hash)));
    },
  });
}

function describeEvent(name: string, a: Record<string, unknown>): { title: string; detail?: string } | null {
  const amount = (v: unknown) => `${Number(v as bigint) / 1e6} USDT`;
  const who = (v: unknown) => `${String(v).slice(0, 6)}…${String(v).slice(-4)}`;
  switch (name) {
    case "InvoiceIssued":
      return { title: "Exporter issued the invoice", detail: `${amount(a.face)} owed by ${who(a.debtor)}` };
    case "InvoiceAcknowledged":
      return { title: "Importer confirmed the invoice", detail: "Units minted to the exporter" };
    case "InvoiceRejected":
      return { title: "Importer rejected the invoice" };
    case "InvoiceFunded":
      return {
        title: "Investor funded, units and USDT swapped in one transaction",
        detail: `${who(a.investor)} paid ${amount(a.price)} for ${amount(a.units)} of face value`,
      };
    case "TransferSingle":
      // Only investor-to-investor moves. Mints, burns and funding have their own entries.
      return a.from === "0x0000000000000000000000000000000000000000" ||
        a.to === "0x0000000000000000000000000000000000000000"
        ? null
        : { title: "Units moved", detail: `${who(a.from)} → ${who(a.to)}, ${amount(a.value)} of face value` };
    case "InvoiceRepaid":
      return { title: "Repayment received by the contract", detail: `${amount(a.amount)} from ${who(a.payer)}` };
    case "InvoiceSettled":
      return { title: "Invoice settled in full" };
    case "InvoiceDefaulted":
      return { title: "Invoice defaulted after the grace period", detail: `${amount(a.totalCollected)} collected` };
    case "HolderPaid":
      return { title: "Holder paid", detail: `${who(a.holder)} received ${amount(a.amount)}` };
    default:
      return null;
  }
}

const erc20 = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
