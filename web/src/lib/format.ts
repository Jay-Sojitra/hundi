import { formatUnits, parseUnits, type Address } from "viem";
import { EXPLORER } from "./config";

export const usdt = (amount: bigint) =>
  Number(formatUnits(amount, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export function parseUsdt(value: string): bigint | null {
  try {
    const amount = parseUnits(value.trim() || "0", 6);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}

export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: Address) => `${EXPLORER}/address/${address}`;

export function timeLeft(dueDate: bigint, now: number) {
  const seconds = Number(dueDate) - now;
  if (seconds <= 0) return "Due";
  if (seconds < 60) return `${seconds}s left`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s left`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h left`;
  return `${Math.floor(seconds / 86400)} days left`;
}

export const dateTime = (timestamp: bigint) =>
  new Date(Number(timestamp) * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
