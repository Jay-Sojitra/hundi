# Whitechain feedback

Running notes from building Hundi on Whitechain Sepolia. Updated as we go.

## What worked

- Network details were easy to find, and the chain responded straight away on the public RPC.
- The docs publish `llms-full.txt`, which made it fast to search the whole documentation.
- The Foundry guide worked as written. `forge script --verify --verifier blockscout` verified both contracts on the first try, including the constructor arguments.
- `whitechainSepolia` in `viem/chains` worked out of the box, including Multicall3 for batched reads.
- 1-second blocks make a multi-party flow feel instant, which helps both the demo and the product.
- Forking the chain with Anvil worked well, so we could test against the real USDT before spending any testnet WBT.
- The verified `TetherTokenV2` supports `permit` and EIP-3009, and our contracts worked with it without changes.

## Where we got stuck

- **Getting test USDT.** The prize page requires `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, but the faucet only gives WBT. We found no documented way to get this USDT and had to read the explorer to discover a WWBT/USDT pool at `0x5645101Ca8d2F7BaBC27b10359555767a1BdF999`.

- **The faucet limit shapes how you build.** One drip of 0.5 WBT has to cover deployment, gas for every party in a multi-wallet demo, and any swap into USDT. We tested on a fork first largely to avoid wasting it.
- **A confusing error for an unfunded wallet.** Sending from a wallet with no WBT returns `gas required exceeds allowance (0)` from `eth_estimateGas`. It looks like a contract revert. Mentioning it in a troubleshooting page would save time.

## What the docs were missing

- **Two different "USDT" contracts.** The official token list names `0xaa7962d073935D387e8d442DA1D7149C81388f46` as USDT (the contract reports `USDT.e`). The prize address is not on that list, so a builder following the docs would pay in the wrong token and fail qualification.
- **No token details for the prize USDT.** Its decimals and its support for `permit` and EIP-3009 only came from reading the verified implementation (`TetherTokenV2`). These features are useful to builders and deserve a mention.
- **Faucet limits are described two ways.** The docs say one claim per 24-hour window, while the faucet homepage says "One faucet drip per GitHub account".
