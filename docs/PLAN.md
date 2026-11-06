# Hundi: build plan

**Target:** Whitechain, "Tokenize · Real World Finance on Whitechain" ($2,500 first, $1,500 second)
**Deadline:** Saturday 7 Nov 2026, 09:00 IST. Late submissions are not accepted.
**Internal freeze:** code 07:30 IST, submit by 08:30 IST.

## 1. The idea

**Hundi lets an exporter sell an unpaid invoice to verified investors for USDT today. The contract then collects from the buyer on the due date and pays the investors.**

A hundi is the traditional Indian bill of exchange: a payment promise that merchants traded long before banks. This project applies the same idea with rules a contract enforces.

The problem: a small exporter ships goods, then waits 60 to 90 days to be paid. Invoice discounting exists, but it has two weaknesses that smart contracts address directly:

1. **Double financing.** A seller can pledge one invoice to several financiers, and the financiers can't see each other's books.
2. **Settlement risk.** Paying for the receivable and transferring it are separate steps, and repayment can be sent to the seller rather than to whoever now owns the claim.

## 2. Why this fits the track

| What the prize page asks for | How Hundi answers it |
|---|---|
| "Financing or selling an invoice belongs in Tokenize" | The core action is selling an invoice. Paying one is only the final step. |
| Real transfer rules enforced in the contract | Rules R1 to R8 below. Each one has a test that expects a revert. |
| Clear issuer, investor or business user | Exporter (issuer), Importer (debtor), Investor, plus a Verifier |
| At least one full lifecycle step | Issue → acknowledge → fund → transfer → settle → distribute, plus a default path |
| Every payment in USDT | Funding, repayment and distribution all use `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` |
| Won't place: a token with a mint button and no rules | Units can't exist until the debtor acknowledges, and can't move outside the allowlist |

**What should set it apart:** most invoice entries will stop at a token plus a discount. Hundi's demo shows a double-financing attempt reverting on the explorer, and shows investors being paid on the due date without doing anything.

## 3. Enforced rules

Each rule is one contract check, one failing-path test and, where marked, one demo moment.

| # | Rule | Revert | Demo |
|---|---|---|---|
| R1 | Only a verified, unexpired Exporter can issue, and the debtor must be a verified Importer | `NotEligible` | |
| R2 | An invoice reference (GST e-invoice IRN hash) can be registered once, ever | `DuplicateInvoice` | **Yes** |
| R3 | No units exist until the debtor acknowledges, so funding is impossible before that | `NotAcknowledged` | |
| R4 | Units can only be held by verified, unfrozen participants | `TransferNotAllowed` | **Yes** |
| R5 | Funding and transfers stop at the due date, which fixes who gets paid | `PastDueDate` | |
| R6 | Asset and USDT move in one transaction, or neither moves | atomic | **Yes** |
| R7 | Repayment goes only to the contract, never to the seller | by design | |
| R8 | Nothing is redeemable before settlement, and on a shortfall holders share recoveries pro rata | `NotSettled` | **Yes** |

## 4. Lifecycle

```
Verifier   approves Exporter, Importer, Investors (role, expiry, jurisdiction)
Exporter   issue(debtor, face, dueDate, discountBps, irnHash, docHash)     R1 R2
Importer   acknowledge(id) and approve USDT                                units minted to Exporter
Investor   fund(id, units) or fundWithPermit(...)                          R3 R5 R6
           USDT goes to Exporter and units go to Investor in one transaction
Investor   safeTransferFrom to another investor                            R4 R5
Anyone     settle(id) once now >= dueDate                                  pulls USDT from Importer
             full payment   -> Settled
             short payment  -> Defaulted once the grace period ends
Anyone     distribute(id, start, count)                                    pays holders, burns units
```

1 unit = 0.000001 USDT of face value (USDT has 6 decimals), so a unit redeems 1:1 when an invoice is paid in full. All units are minted to the Exporter on acknowledgement, and funding moves them to investors. The Exporter simply keeps any unfunded portion and is paid for it at settlement, so partial fills need no special handling.

**"Settlement happens automatically":** `settle` and `distribute` take no permissions. A small keeper script calls them after the due date, and anyone else can too, so investors receive USDT without acting.

## 5. Architecture

**Contracts** (Foundry, solc 0.8.30, `evm_version = prague`, OpenZeppelin 5)

- `ParticipantRegistry.sol`: KYB allowlist with role bitmask, expiry, jurisdiction and freeze, administered by a Verifier role
- `HundiInvoice.sol`: ERC-1155 where each token id is one invoice. It holds lifecycle state and funding, with all transfer rules in `_update`.
- On-chain holder set per invoice (`EnumerableSet`), so distribution needs no indexer. The docs say the public RPC is not sized for indexers (50 req/s).
- `trySafeTransfer` in `distribute`: this USDT has a blocklist, so one blocked holder must not stop everyone else being paid. That holder keeps their units and can redeem later.

**Frontend** (Next.js App Router, wagmi, viem, Tailwind, `whitechainSepolia` from `viem/chains`)

- `/verifier`, `/exporter`, `/importer`, `/investor`: one simple screen per party
- `/invoice/[id]`: public timeline where each step links to its explorer transaction

**Scripts**

- `script/Deploy.s.sol`: deploy and verify on Blockscout
- `scripts/demo.ts`: runs the entire lifecycle and prints explorer links. **This is the safety net:** if the UI slips, the track's qualifying transactions still exist.
- `scripts/keeper.ts`: polls for due invoices and calls `settle` and `distribute`

## 6. Schedule (IST)

| Time | Work | Done when |
|---|---|---|
| 03:30 to 04:00 | Wallets, WBT, USDT, Foundry scaffold | 4 funded wallets, `forge build` passes |
| 04:00 to 05:15 | Both contracts, rule by rule, with tests | R1 to R8 tests pass |
| 05:15 to 05:45 | Deploy, verify, run `demo.ts` | **Full lifecycle on chain, links in README. Track now qualifies.** |
| 05:45 to 07:15 | Frontend: four roles and the timeline | Lifecycle can be run from the browser |
| 07:15 to 07:30 | README, limitations, feedback file, AI usage | Every checklist item in section 7 is met |
| 07:30 to 08:15 | Record and upload the demo video | 2 to 4 minutes, at least 720p |
| 08:15 to 08:30 | Submit on the ETHGlobal dashboard | Confirmation visible |

**Cut in this order if late:** (1) `fundWithPermit`, (2) secondary transfer UI (keep the revert in the video through a script), (3) keeper (call `settle` by hand on camera), (4) Vercel deploy (run locally). **Never cut:** enforced rules, tests, verified contracts, a real USDT lifecycle.

## 7. Qualification checklist

- [ ] Contracts deployed on Whitechain Sepolia (1874) and verified on the explorer
- [ ] USDT payment in the main flow, explorer link in the README, using the prize-page address
- [ ] README line: why this needs onchain stablecoin settlement and what a regular rail can't do
- [ ] Public GitHub repo with steady progress; README covers setup, architecture, limitations
- [ ] 2 to 4 minute video showing every party
- [ ] `WHITECHAIN_FEEDBACK.md`: what worked, where we got stuck, what the docs were missing

ETHGlobal rules on the video: under 2 or over 4 minutes is rejected on upload, minimum 720p, no speeding up, no AI voiceover or text-to-speech, no phone recording. Select this prize in the last submission step.

**README line (draft):** A bank rail can't exchange a receivable for cash atomically, can't let every financier check a shared registry of already-financed invoices, and can't route the debtor's repayment to whoever holds the claim on the due date. Here all three are one contract, settled in USDT, with 1-second blocks.

## 8. Demo video (3:30)

| Time | Who | What |
|---|---|---|
| 0:00 | Narration | The problem: shipped goods, 90-day wait, and financiers who can't see each other |
| 0:25 | Verifier | Approves the exporter, importer and two investors |
| 0:45 | Exporter | Issues an invoice |
| 1:00 | Exporter | **Issues the same invoice again and it reverts** (R2) |
| 1:15 | Importer | Acknowledges and approves USDT |
| 1:35 | Investor A | **Funds at a discount. Show one transaction with both legs on the explorer** (R6) |
| 2:00 | Investor A | **Transfer to an unverified wallet reverts**, then to Investor B succeeds (R4) |
| 2:25 | Keeper | Due date passes, settlement and distribution run, and investor balances rise (no action from them) |
| 2:55 | Second invoice | Importer short-pays, invoice is marked Defaulted, holders recover pro rata (R8) |
| 3:15 | Close | Timeline page, verified contracts, and what mainnet would need |

Use short due dates (a few minutes) so the demo can show real maturity without a mocked clock.

## 9. Known limitations (to state in the README)

- The Verifier is a single trusted admin. Production needs a real KYB provider or on-chain attestations.
- IRN uniqueness is only as good as the input. There is no live integration with India's invoice registration portal, so a seller could invent a reference. Debtor acknowledgement is the check against that.
- Debtor repayment relies on a USDT allowance that can be revoked, which leads to the default path. There is no credit assessment or insurance.
- Short due dates are allowed for the demo. Production would enforce a minimum tenor.
- Testnet only and not audited. Selling receivables to investors, and using stablecoins for trade settlement, has legal and regulatory requirements in India and elsewhere that this project doesn't address.

## 10. Commit and authorship approach

- Commits are authored by the repo owner's own git identity.
- Commit only when a slice really works: one contract rule plus its test, one screen, one script. Real timestamps, with no backdating and no splitting of finished work to pad the history.
- ETHGlobal requires AI use to be documented in the submission, so `AI_USAGE.md` records which parts were AI-assisted and is kept current.
