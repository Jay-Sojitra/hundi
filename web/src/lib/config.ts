import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { whitechainSepolia } from "viem/chains";
import type { Address } from "viem";

export const chain = whitechainSepolia;
export const HUNDI = process.env.NEXT_PUBLIC_HUNDI as Address;
export const REGISTRY = process.env.NEXT_PUBLIC_REGISTRY as Address;
export const USDT: Address = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
export const EXPLORER = "https://explorer.testnet.whitechain.io";
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");

export const ROLE_EXPORTER = 1;
export const ROLE_IMPORTER = 2;
export const ROLE_INVESTOR = 4;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? chain.rpcUrls.default.http[0]) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
