// Settles invoices once they are due and pays out holders, so investors don't have to act.
// settle and distribute take no permissions: this wallet has no special rights.
// Usage: pnpm keeper [--once]
import { hundiAbi } from "../web/src/lib/abi.ts";
import { confirm, publicClient, sleep, txLink, wallet } from "./lib.ts";

const HUNDI = process.env.HUNDI as `0x${string}`;
const ACKNOWLEDGED = 2;
const SETTLED = 4;
const DEFAULTED = 5;
const POLL_MS = 5_000;

const keeper = wallet("VERIFIER");
const read = <T>(functionName: string, args: unknown[] = []) =>
  publicClient.readContract({ address: HUNDI, abi: hundiAbi, functionName, args } as never) as Promise<T>;

export async function runOnce(log: (line: string) => void = console.log) {
  const count = await read<bigint>("invoiceCount");
  const { timestamp: now } = await publicClient.getBlock();

  for (let id = 1n; id <= count; id++) {
    const invoice = await read<{ status: number; dueDate: bigint }>("getInvoice", [id]);
    let status = invoice.status;

    if (status === ACKNOWLEDGED && now >= invoice.dueDate) {
      const hash = await keeper.writeContract({ address: HUNDI, abi: hundiAbi, functionName: "settle", args: [id] });
      await confirm(hash);
      log(`Invoice ${id}: settle ${txLink(hash)}`);
      status = (await read<{ status: number }>("getInvoice", [id])).status;
    }

    if (status === SETTLED || status === DEFAULTED) {
      const holders = await read<`0x${string}`[]>("holdersOf", [id]);
      const owed = await Promise.all(holders.map((holder) => read<bigint>("claimable", [id, holder])));
      if (owed.some((amount) => amount > 0n)) {
        const hash = await keeper.writeContract({
          address: HUNDI,
          abi: hundiAbi,
          functionName: "distribute",
          args: [id, 0n, BigInt(holders.length)],
        });
        await confirm(hash);
        log(`Invoice ${id}: distribute ${txLink(hash)}`);
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const once = process.argv.includes("--once");
  console.log(`Keeper watching ${HUNDI}`);
  do {
    try {
      await runOnce();
    } catch (error) {
      console.error("Keeper pass failed, will retry:", (error as Error).message);
    }
    if (!once) await sleep(POLL_MS);
  } while (!once);
}
