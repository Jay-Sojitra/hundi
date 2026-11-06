# Hundi

**Onchain invoice financing on Whitechain.** An exporter sells an unpaid invoice to verified investors for USDT today. On the due date, the contract collects from the importer and pays whoever holds the invoice.

A hundi is the traditional Indian bill of exchange, a payment promise that merchants traded long before banks. Hundi keeps the idea and enforces the transfer and settlement rules in a contract.

Built at ETHGlobal Mumbai 2026 for the Whitechain "Tokenize · Real World Finance" track.

## Why this needs onchain stablecoin settlement

A regular payment rail only moves money. It can't swap a receivable for cash in one atomic step, and it can't send the importer's repayment to whoever holds the claim on the due date. Here both happen in one contract, settled in USDT on Whitechain.

## The problem

An exporter ships goods and then waits 60 to 90 days to be paid. Selling the invoice at a discount to get cash early is established practice, and regulated platforms such as India's TReDS already connect sellers, buyers and financiers. Hundi doesn't replace them. It explores what a shared ledger can improve:

1. **Double financing:** financiers working separately may not see each other's books, so one invoice can be pledged twice. Everyone using Hundi checks one registry.
2. **Settlement risk:** when paying for an invoice and transferring it are separate steps, one can happen without the other, and repayment can reach the seller rather than whoever now owns the claim. Here the swap is atomic, and repayment only goes to the contract.
3. **Who can buy:** verified investors can buy part of an invoice and resell it, with the rules enforced on every transfer.

## Deployed on Whitechain Sepolia (chain 1874)

**Live app:** https://hundi-lovat.vercel.app

| Contract | Address (verified) |
|---|---|
| HundiInvoice | [`0xbEaC6bCec891bC4F04bBD5b686fB4E02e22a8F31`](https://explorer.testnet.whitechain.io/address/0xbEaC6bCec891bC4F04bBD5b686fB4E02e22a8F31) |
| ParticipantRegistry | [`0x7a4C69634E2FC1B17C3b3FF25e72bB8bb56e8484`](https://explorer.testnet.whitechain.io/address/0x7a4C69634E2FC1B17C3b3FF25e72bB8bb56e8484) |
| USDT (prize token, not ours) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |

**USDT settled in the main flow, on the explorer:**

- [Investor funds an invoice](https://explorer.testnet.whitechain.io/tx/0x67f4a4ae8422ba0d188e3324a6692b58dde32c415a3a3ea3b075ceec46fae2ae): 2.88 USDT to the exporter and 3.00 USDT of face value to the investor, in one transaction
- [Contract collects from the importer on the due date](https://explorer.testnet.whitechain.io/tx/0x23dc5327fb469500ec5897328154cccf78b3963e7e03a2bc53fefe652f97890c)
- [Holders are paid, with no action from them](https://explorer.testnet.whitechain.io/tx/0xa8402f266fdded41c10a3c8a9cca721f5c09f18015741ed5fb3287513cce7128)

**The contract refusing, on the explorer:**

- [Same invoice issued twice](https://explorer.testnet.whitechain.io/tx/0x2621b381494e09ee6d3eb6b487a9d66401632845847b8d02c4e90a1de1bf69c8): `DuplicateInvoice`
- [Funding before the importer confirms](https://explorer.testnet.whitechain.io/tx/0x808b0347f71be78d2650c298090ae1c91fef42dd468a84265e1d5529a2e537b3): `NotAcknowledged`
- [Transfer to an unverified wallet](https://explorer.testnet.whitechain.io/tx/0x3b2dbddd3bec61b72e12d126b20dfd62b983139812a8fcea15d2b43753af166e): `TransferNotAllowed`
- [Transfer after the due date](https://explorer.testnet.whitechain.io/tx/0x48207e689178cca31fb5c8c9093ea78659398d167163f70896bf4d0f0f759446): `PastDueDate`

The full run, including an invoice that defaults and pays out pro rata, is in [docs/DEMO_RUN.md](docs/DEMO_RUN.md).

## Rules the contract enforces

Each rule has tests that expect the failure, in [contracts/test](contracts/test).

| # | Rule | Reverts with |
|---|---|---|
| R1 | Only a verified, unexpired exporter can issue, and the debtor must be a verified importer | `NotEligible` |
| R2 | Within Hundi, an invoice reference (GST e-invoice IRN hash) can be registered once, ever, by anyone | `DuplicateInvoice` |
| R3 | No units exist until the importer acknowledges, so nothing can be funded before that | `NotAcknowledged` |
| R4 | Units can only be held by verified, unfrozen participants, including in direct and batch transfers | `TransferNotAllowed` |
| R5 | Buying and transfers stop on the due date, which fixes who gets paid | `PastDueDate` |
| R6 | Units and USDT move in one transaction, or neither moves | atomic |
| R7 | Repayment goes only to the contract, never to the seller | by design |
| R8 | Nothing is redeemable before settlement, and on a shortfall holders share recoveries pro rata | `NotSettled` |

## Lifecycle

```
Verifier   approves exporter, importer and investors (role, expiry, jurisdiction)
Exporter   issue(debtor, face, dueDate, discountBps, irnHash, docHash)
Importer   acknowledge(id), then approves USDT       units are minted to the exporter
Investor   fund(id, units) or fundWithPermit(...)    USDT to exporter, units to investor, one transaction
Investor   safeTransferFrom to another investor      only between verified participants
Anyone     settle(id) once the due date passes       pulls USDT from the importer into the contract
             paid in full    -> Settled
             short payment   -> Defaulted after the grace period
Anyone     distribute(id, start, count)              pays every holder, burns units once paid in full
```

One unit is a claim on 0.000001 USDT of face value, so a unit redeems 1:1 when an invoice is paid in full. All units are minted to the exporter on acknowledgement and funding moves them to investors, so partial fills need no special handling: the exporter is simply paid for what they kept.

`settle` and `distribute` need no permissions. `scripts/keeper.ts` calls them after the due date, so investors are paid without acting, and anyone else can call them if the keeper is down.

## Architecture

| Path | What it is |
|---|---|
| [contracts/src/ParticipantRegistry.sol](contracts/src/ParticipantRegistry.sol) | KYB allowlist: roles, expiry, jurisdiction, freeze |
| [contracts/src/HundiInvoice.sol](contracts/src/HundiInvoice.sol) | ERC-1155 where each token id is one invoice. Lifecycle, funding, settlement. All transfer rules sit in `_update`, so they can't be bypassed. |
| [web](web) | Next.js app with a screen per party and a public timeline per invoice |
| [scripts/demo.ts](scripts/demo.ts) | Runs the whole lifecycle on chain, including the failures, and writes [docs/DEMO_RUN.md](docs/DEMO_RUN.md) |
| [scripts/keeper.ts](scripts/keeper.ts) | Settles due invoices and pays holders |

Design decisions:

- **Holders are tracked on chain,** so distribution needs no indexer. The Whitechain docs say the public RPC isn't sized for indexers.
- **One bad wallet can't block a payout.** This USDT has a blocklist, so `distribute` skips a holder it can't pay. They keep their claim and can collect later.
- **A failed collection still reaches Defaulted.** `settle` doesn't revert if the importer's USDT can't be pulled, so an invoice can't be stuck open.
- **Recoveries stay fair after a default.** Units aren't burned until an invoice is paid in full, so a holder who collects early still shares in later recoveries.

## Setup

Requires Foundry, Node 22 or later, and pnpm.

```bash
git clone --recurse-submodules https://github.com/Jay-Sojitra/hundi.git
```

```bash
cd hundi && pnpm install
```

Run the tests. The fork tests run the lifecycle against the real USDT on Whitechain Sepolia.

```bash
cd contracts && forge test
```

```bash
FORK_TEST=true forge test --match-contract ForkTest
```

To deploy your own copy, copy `.env.example` to `.env` and add test wallets, then:

```bash
cd contracts && source ../.env && forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast
```

Put the printed addresses in `.env` as `HUNDI` and `REGISTRY`, and in `web/.env.local`:

```
NEXT_PUBLIC_HUNDI=0x...
NEXT_PUBLIC_REGISTRY=0x...
NEXT_PUBLIC_DEPLOY_BLOCK=<block of the deployment>
```

Then, from the repo root:

```bash
pnpm wallets
```

```bash
pnpm demo
```

```bash
pnpm keeper
```

```bash
pnpm --dir web dev
```

## Current limitations

- **Double financing is only blocked inside Hundi.** A seller could still finance the same invoice with a bank or another platform, which can't see this registry.
- **IRN uniqueness is only as good as the input.** There is no live integration with India's invoice registration portal, so a seller could invent a reference. Importer acknowledgement is the check against that.
- **Fake invoices are still possible.** An exporter and a friendly importer could both be verified and confirm an invoice for goods that never shipped. Nothing here checks that a real trade happened.
- **Nothing prices the risk.** Investors see a wallet address and a discount, with no credit information on the importer. There is also no insurance and no recourse to the exporter, so investors carry the default risk.
- **A token isn't a legal agreement.** Acknowledging on chain doesn't create an enforceable obligation by itself, and there is no assignment contract or dispute process after an invoice is confirmed. Recovering from an importer who refuses to pay would need a legal agreement behind this.
- **Importers have to pay onchain.** Repayment relies on the importer holding USDT and keeping an allowance it can revoke, which leads to the default path. Real companies pay through banks, so this is probably the biggest hurdle to adoption.
- **The verifier is one trusted admin.** Production needs a real KYB provider or onchain attestations.
- **Short due dates and a 60-second grace period are for the demo.** Production would enforce a minimum tenor and a grace period of days.
- **The web app uses approve then fund,** so a purchase takes two wallet prompts. `fundWithPermit` is deployed and tested against the real USDT, but isn't wired into the app yet.
- **The keeper runs on one machine.** Anyone can call the same functions, but nothing guarantees someone does.
- **Testnet only, not audited.** Selling receivables to investors and using stablecoins for trade settlement have legal and regulatory requirements in India and elsewhere, including rules on how export proceeds are received, that this project doesn't address.

## More

- [docs/PLAN.md](docs/PLAN.md): the build plan
- [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md): feedback on building on Whitechain
- [AI_USAGE.md](AI_USAGE.md): where AI tools were used
