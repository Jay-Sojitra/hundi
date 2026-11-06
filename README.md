# Hundi

**Onchain invoice financing on Whitechain.** An exporter sells an unpaid invoice to verified investors for USDT today. On the due date, the contract collects from the importer and pays whoever holds the invoice.

A hundi is the traditional Indian bill of exchange, a payment promise that merchants traded long before banks. Hundi keeps the idea and replaces trust in the paperwork with rules the contract enforces.

Built at ETHGlobal Mumbai 2026 for the Whitechain "Tokenize · Real World Finance" track.

## Why this needs onchain stablecoin settlement

A bank rail can't exchange a receivable for cash atomically, can't let every financier check one shared registry of already-financed invoices, and can't route the importer's repayment to whoever holds the claim on the due date. Here all three are one contract settled in USDT on Whitechain.

## The problem

An exporter ships goods and then waits 60 to 90 days to be paid. Invoice discounting exists, but it has two weaknesses:

1. **Double financing:** a seller can pledge one invoice to several financiers, who can't see each other's books.
2. **Settlement risk:** paying for the receivable and transferring it are separate steps, and repayment can be sent to the seller rather than to whoever now owns the claim.

## Deployed on Whitechain Sepolia (chain 1874)

<!-- deployment -->
Deployment pending.
<!-- /deployment -->

## Rules the contract enforces

Each rule has tests that expect the failure, in [contracts/test](contracts/test).

| # | Rule | Reverts with |
|---|---|---|
| R1 | Only a verified, unexpired exporter can issue, and the debtor must be a verified importer | `NotEligible` |
| R2 | An invoice reference (GST e-invoice IRN hash) can be registered once, ever, by anyone | `DuplicateInvoice` |
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

- **The verifier is one trusted admin.** Production needs a real KYB provider or onchain attestations.
- **IRN uniqueness is only as good as the input.** There is no live integration with India's invoice registration portal, so a seller could invent a reference. Importer acknowledgement is the check against that.
- **Repayment relies on a USDT allowance the importer can revoke,** which leads to the default path. There is no credit assessment, insurance or recourse to the exporter.
- **Short due dates and a 60-second grace period are for the demo.** Production would enforce a minimum tenor and a grace period of days.
- **The keeper runs on one machine.** Anyone can call the same functions, but nothing guarantees someone does.
- **Testnet only, not audited.** Selling receivables to investors and using stablecoins for trade settlement have legal and regulatory requirements in India and elsewhere that this project doesn't address.

## More

- [docs/PLAN.md](docs/PLAN.md): the build plan
- [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md): feedback on building on Whitechain
- [AI_USAGE.md](AI_USAGE.md): where AI tools were used
