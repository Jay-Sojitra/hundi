import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { whitechainSepolia } from "viem/chains";

export const EXPLORER = "https://explorer.testnet.whitechain.io";
export const USDT = process.env.USDT as Hex;
export const chain = whitechainSepolia;

const transport = http(process.env.RPC_URL);
export const publicClient = createPublicClient({ chain, transport });

export function wallet(role: string) {
  const account = privateKeyToAccount(process.env[`${role}_KEY`] as Hex);
  return createWalletClient({ account, chain, transport });
}

export const address = (role: string) => process.env[`${role}_ADDRESS`] as Hex;
export const txLink = (hash: Hash) => `${EXPLORER}/tx/${hash}`;
export const usdtBalance = (who: Hex) =>
  publicClient.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [who] });
export const fmt = (amount: bigint) => formatUnits(amount, 6);
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for a transaction and reports whether it succeeded. */
export async function confirm(hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.status;
}
