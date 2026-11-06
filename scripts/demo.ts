// Runs the full Hundi lifecycle on Whitechain Sepolia with real test USDT, including the
// failures the contracts must block, and writes the transaction links to docs/DEMO_RUN.md.
// Usage: pnpm demo [faceUsdt] [defaultFaceUsdt]
import { writeFileSync } from "node:fs";
import { erc20Abi, keccak256, parseUnits, stringToHex, type Hash } from "viem";
import { hundiAbi, registryAbi } from "../web/src/lib/abi.ts";
import { EXPLORER, USDT, address, confirm, fmt, publicClient, sleep, txLink, usdtBalance, wallet } from "./lib.ts";

const HUNDI = process.env.HUNDI as `0x${string}`;
const REGISTRY = process.env.REGISTRY as `0x${string}`;
const FACE = parseUnits(process.argv[2] ?? "5", 6);
const DEFAULT_FACE = parseUnits(process.argv[3] ?? "2", 6);
const DISCOUNT_BPS = 400;
const TENOR_SECONDS = 90n;
const FORCED_GAS = 400_000n;

const lines: string[] = [];
function record(step: string, hash: Hash, note = "") {
  const line = `- ${step}: [tx](${txLink(hash)})${note ? ` ${note}` : ""}`;
  lines.push(line);
  console.log(`${step}\n  ${txLink(hash)}${note ? `\n  ${note}` : ""}`);
}

async function send(role: string, step: string, functionName: string, args: unknown[], note = "") {
  const hash = await wallet(role).writeContract({ address: HUNDI, abi: hundiAbi, functionName, args } as never);
  if ((await confirm(hash)) !== "success") throw new Error(`${step} reverted: ${txLink(hash)}`);
  record(step, hash, note);
}

/** Submits a call that must fail, skipping gas estimation so the revert is visible on the explorer. */
async function sendExpectingRevert(role: string, step: string, functionName: string, args: unknown[], reason: string) {
  const hash = await wallet(role).writeContract({
    address: HUNDI,
    abi: hundiAbi,
    functionName,
    args,
    gas: FORCED_GAS,
  } as never);
  if ((await confirm(hash)) !== "reverted") throw new Error(`${step} should have reverted: ${txLink(hash)}`);
  record(step, hash, `**Reverted as intended: ${reason}**`);
}

async function approveUsdt(role: string, amount: bigint) {
  const hash = await wallet(role).writeContract({
    address: USDT,
    abi: erc20Abi,
    functionName: "approve",
    args: [HUNDI, amount],
  });
  await confirm(hash);
  return hash;
}

const invoiceId = async () =>
  publicClient.readContract({ address: HUNDI, abi: hundiAbi, functionName: "invoiceCount" });

const readDue = async (id: bigint) =>
  (await publicClient.readContract({ address: HUNDI, abi: hundiAbi, functionName: "getInvoice", args: [id] })).dueDate;

async function waitUntil(timestamp: bigint) {
  for (;;) {
    const { timestamp: now } = await publicClient.getBlock();
    if (now >= timestamp) return;
    await sleep(Number(timestamp - now) * 1000 + 1000);
  }
}

// Every run needs fresh references, because each can only be registered once.
const runId = Date.now().toString();
const irn = keccak256(stringToHex(`IRN-${runId}-A`));
const irnDefault = keccak256(stringToHex(`IRN-${runId}-B`));
const doc = keccak256(stringToHex("commercial-invoice.pdf"));

const investorA = address("INVESTOR_A");
const investorB = address("INVESTOR_B");
const outsider = address("OUTSIDER");

// --- Verifier -------------------------------------------------------------------------------
lines.push("## Verifier approves participants");
const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 3600);
for (const [role, roleBit, jurisdiction] of [
  ["EXPORTER", 1, "IN"],
  ["IMPORTER", 2, "AE"],
  ["INVESTOR_A", 4, "IN"],
  ["INVESTOR_B", 4, "SG"],
] as const) {
  const hash = await wallet("VERIFIER").writeContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "setParticipant",
    args: [address(role), roleBit, expiry, stringToHex(jurisdiction, { size: 2 })],
  });
  await confirm(hash);
  record(`Approve ${role}`, hash);
}

// --- Invoice 1: full lifecycle --------------------------------------------------------------
lines.push("", "## Invoice 1: issue to settlement");
const due = (await publicClient.getBlock()).timestamp + TENOR_SECONDS;
await send("EXPORTER", "Exporter issues the invoice", "issue", [address("IMPORTER"), FACE, due, DISCOUNT_BPS, irn, doc]);
const id = await invoiceId();

await sendExpectingRevert(
  "EXPORTER",
  "Exporter tries to issue the same invoice again (R2)",
  "issue",
  [address("IMPORTER"), FACE, due, DISCOUNT_BPS, irn, doc],
  "DuplicateInvoice",
);

await sendExpectingRevert(
  "INVESTOR_A",
  "Investor tries to fund before the importer confirms (R3)",
  "fund",
  [id, FACE],
  "NotAcknowledged",
);

await send("IMPORTER", "Importer acknowledges the invoice", "acknowledge", [id]);
record("Importer approves USDT for repayment on the due date", await approveUsdt("IMPORTER", FACE));

const unitsA = (FACE * 60n) / 100n;
const priceA = await publicClient.readContract({
  address: HUNDI,
  abi: hundiAbi,
  functionName: "quote",
  args: [id, unitsA],
});
await approveUsdt("INVESTOR_A", priceA);
const exporterBefore = await usdtBalance(address("EXPORTER"));
await send(
  "INVESTOR_A",
  "Investor A buys 60% at a 4% discount: units and USDT move in one transaction (R6)",
  "fund",
  [id, unitsA],
  `Pays ${fmt(priceA)} USDT for ${fmt(unitsA)} USDT of face value`,
);
console.log(`  Exporter received ${fmt((await usdtBalance(address("EXPORTER"))) - exporterBefore)} USDT`);

await sendExpectingRevert(
  "INVESTOR_A",
  "Investor A tries to transfer to an unverified wallet (R4)",
  "safeTransferFrom",
  [investorA, outsider, id, 1n, "0x"],
  "TransferNotAllowed",
);

const unitsToB = unitsA / 2n;
await send("INVESTOR_A", "Investor A sells half to verified Investor B", "safeTransferFrom", [
  investorA,
  investorB,
  id,
  unitsToB,
  "0x",
]);

console.log(`Waiting for the due date of invoice ${id}...`);
await waitUntil(await readDue(id));

await sendExpectingRevert(
  "INVESTOR_A",
  "Investor A tries to transfer after the due date (R5)",
  "safeTransferFrom",
  [investorA, investorB, id, 1n, "0x"],
  "PastDueDate",
);

const beforeA = await usdtBalance(investorA);
const beforeB = await usdtBalance(investorB);
await send("VERIFIER", "Keeper settles: USDT is pulled from the importer into the contract (R7)", "settle", [id]);
await send("VERIFIER", "Keeper distributes: holders are paid with no action from them", "distribute", [id, 0n, 10n]);
const paidA = (await usdtBalance(investorA)) - beforeA;
const paidB = (await usdtBalance(investorB)) - beforeB;
lines.push(`- Investor A received ${fmt(paidA)} USDT, Investor B received ${fmt(paidB)} USDT`);
console.log(`Investor A received ${fmt(paidA)} USDT, Investor B received ${fmt(paidB)} USDT`);

// --- Invoice 2: default ---------------------------------------------------------------------
lines.push("", "## Invoice 2: short payment and default");
const due2 = (await publicClient.getBlock()).timestamp + TENOR_SECONDS;
await send("EXPORTER", "Exporter issues a second invoice", "issue", [
  address("IMPORTER"),
  DEFAULT_FACE,
  due2,
  DISCOUNT_BPS,
  irnDefault,
  doc,
]);
const id2 = await invoiceId();
await send("IMPORTER", "Importer acknowledges the invoice", "acknowledge", [id2]);
record("Importer approves only half of what it owes", await approveUsdt("IMPORTER", DEFAULT_FACE / 2n));

const price2 = await publicClient.readContract({
  address: HUNDI,
  abi: hundiAbi,
  functionName: "quote",
  args: [id2, DEFAULT_FACE],
});
await approveUsdt("INVESTOR_B", price2);
await send("INVESTOR_B", "Investor B funds the whole invoice", "fund", [id2, DEFAULT_FACE]);

const grace = await publicClient.readContract({ address: HUNDI, abi: hundiAbi, functionName: "gracePeriod" });
console.log(`Waiting for the due date and grace period of invoice ${id2}...`);
await waitUntil((await readDue(id2)) + grace);

const beforeDefault = await usdtBalance(investorB);
await send("VERIFIER", "Keeper settles: short payment after grace marks it Defaulted", "settle", [id2]);
await send("VERIFIER", "Keeper distributes the partial recovery pro rata (R8)", "distribute", [id2, 0n, 10n]);
const recovered = (await usdtBalance(investorB)) - beforeDefault;
lines.push(`- Investor B recovered ${fmt(recovered)} of ${fmt(DEFAULT_FACE)} USDT`);
console.log(`Investor B recovered ${fmt(recovered)} of ${fmt(DEFAULT_FACE)} USDT`);

writeFileSync(
  "docs/DEMO_RUN.md",
  `# Lifecycle run on Whitechain Sepolia

Produced by \`scripts/demo.ts\` with the USDT at \`${USDT}\`.

- HundiInvoice: [${HUNDI}](${EXPLORER}/address/${HUNDI})
- ParticipantRegistry: [${REGISTRY}](${EXPLORER}/address/${REGISTRY})

${lines.join("\n")}
`,
);
console.log("Wrote docs/DEMO_RUN.md");
