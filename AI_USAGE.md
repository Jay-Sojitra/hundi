# AI tool usage

ETHGlobal asks teams to document where and how AI tools were used.

**Tool:** Claude Code

| Area | Files | How AI was used |
|---|---|---|
| Research and planning | `docs/PLAN.md` | Read the prize page, rules and Whitechain docs, inspected the USDT contract on chain, drafted the plan |
| Smart contracts | `contracts/src/*` | Generated, then tested |
| Tests | `contracts/test/*` | Generated |
| Scripts | `scripts/*` | Generated |
| Frontend | `web/src/*` | Generated from the scaffold, except `web/src/lib/abi.ts`, which is exported from the compiled contracts |
| Docs | `README.md`, `WHITECHAIN_FEEDBACK.md` | Drafted from what was found during the build |

## Team contribution

Jay Sojitra chose the track and the invoice-financing direction, approved the plan, and directed the build.

Jay also:

- Obtained the testnet WBT and USDT used for the deployment and demo, and decided when to deploy.
- Ran the flow on the live app with real wallets. This exposed a bug where the approved list came back empty once the chain passed the RPC's 10,000-block log limit, which was then fixed.
- Questioned whether same-day payment is realistic. That led to reviewing how invoice discounting works in practice, removing overstated claims from the app and README, and listing the project's limits.
