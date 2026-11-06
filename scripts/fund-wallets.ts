// Splits WBT (for gas) and USDT from the deployer wallet across the demo wallets.
// Usage: pnpm wallets [usdtPerInvestor] [usdtForImporter]
import { erc20Abi, formatEther, parseEther, parseUnits } from "viem";
import { USDT, address, confirm, fmt, publicClient, usdtBalance, wallet } from "./lib.ts";

const perInvestor = parseUnits(process.argv[2] ?? "3", 6);
const forImporter = parseUnits(process.argv[3] ?? "6", 6);
const GAS_TOP_UP = parseEther("0.02");

const funder = wallet("VERIFIER");
const roles = ["EXPORTER", "IMPORTER", "INVESTOR_A", "INVESTOR_B", "OUTSIDER"];

for (const role of roles) {
  const to = address(role);
  if ((await publicClient.getBalance({ address: to })) < GAS_TOP_UP / 2n) {
    await confirm(await funder.sendTransaction({ to, value: GAS_TOP_UP }));
  }
}

const targets: [string, bigint][] = [
  ["IMPORTER", forImporter],
  ["INVESTOR_A", perInvestor],
  ["INVESTOR_B", perInvestor],
];
for (const [role, target] of targets) {
  const to = address(role);
  const current = await usdtBalance(to);
  if (current < target) {
    const hash = await funder.writeContract({
      address: USDT,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, target - current],
    });
    await confirm(hash);
  }
}

for (const role of ["VERIFIER", ...roles]) {
  const who = address(role);
  const wbt = await publicClient.getBalance({ address: who });
  console.log(role.padEnd(11), who, `${formatEther(wbt)} WBT`, `${fmt(await usdtBalance(who))} USDT`);
}
