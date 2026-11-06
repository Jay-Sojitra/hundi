# Recording the demo

Rules: 2 to 4 minutes, at least 720p, no speeding up, your own voice, no phone recording.

## Before you record

Import these test wallets into MetaMask. Their keys are in your local `.env`, which is not in the repo. Use a separate browser profile, and never add real funds to them.

| Name | Address | Holds |
|---|---|---|
| Verifier | `0xd831D6450B20bb6E673F869d8596fd7bC1c6cc99` | gas only |
| Exporter | `0xCF114f07C8fEf2Ec209C1BBb6A043CA6f7009249` | 0.54 USDT |
| Importer | `0x3e240e9fB560B0E79A9E32abd75c910C44657730` | 5 USDT |
| Investor A | `0x4B29076be9070dDa8C04C40Fc05029ef6B5fd8e9` | 2.88 USDT |
| Investor B | `0x8D15604806ec69Ca95a8a725E86258ce7bda34Bb` | 3.58 USDT |
| Unverified outsider | `0x2eE0363Db98E787502853253659167D0a2150a83` | gas only |

The first time you connect, the app asks MetaMask to add Whitechain Sepolia.

In a terminal, start the keeper from the repo root and leave it running:

```bash
pnpm keeper
```

Do one full rehearsal with real MetaMask prompts first, using face value 0.5 and a different invoice reference. The verifier has already approved the exporter, importer and both investors. A rehearsal moves USDT around, so send the importer back up to 5 USDT from the exporter before recording.

## Script (about 3:30)

Open https://hundi-lovat.vercel.app

| Time | Wallet | Do this | Say |
|---|---|---|---|
| 0:00 | none | Show the home page | An exporter ships goods and waits 90 days. Selling the invoice brings cash early, but financiers working separately may not see each other's books, so one invoice can be financed twice. |
| 0:25 | Verifier | Verifier screen: show the approved list. | Only verified parties can take part, and every rule checks this list on chain. |
| 0:45 | Exporter | Exporter screen. Importer's wallet, reference `IRN-2026-000142`, face 5, discount 4, due in 5 minutes. Issue. | The exporter registers the invoice. Only a hash goes on chain. |
| 1:00 | Exporter | Press Issue invoice again without changing anything. | Same invoice again: the contract refuses. Nobody financing through Hundi can be sold a duplicate. |
| 1:15 | Importer | Importer screen. Confirm the invoice, then Allow 5 USDT. | No units exist until the importer who owes the money confirms it. |
| 1:35 | Investor A | Investor screen. Buy face value 3, pay 2.88. Open the transaction on the explorer. | The exporter is paid now. USDT and units move in one transaction, so neither side can be left short. |
| 2:00 | Investor A | Under Your holdings, transfer 1 to the outsider: blocked. Then transfer 1 to Investor B: works. | Units can't leave the verified group. |
| 2:25 | none | Open the invoice page. Wait for the due date, or cut the recording and resume. Show the keeper terminal, the timeline and the investors' balances. | On the due date the keeper collects from the importer and pays every holder. They did nothing. Anyone can trigger this. |
| 2:55 | none | Open invoice No. 2 from the home page. | If the importer short-pays, the invoice defaults after a grace period, and holders share what was recovered, including later recoveries. |
| 3:15 | none | Show the verified contract on the explorer, and the README. | Everything settled in USDT on Whitechain. Testnet today: production needs real KYB and legal work. |

Use a 5 minute due date for the main run, so you have time for every step before it passes. Either wait on camera or cut the wait, but don't speed it up.

## Submit by 08:30 IST

On the ETHGlobal dashboard:

1. Add the title, description, repo link `https://github.com/Jay-Sojitra/hundi` and video.
2. Select the Whitechain "Tokenize · Real World Finance on Whitechain" prize on the last step.
3. Say where AI tools were used, as in `AI_USAGE.md`.
