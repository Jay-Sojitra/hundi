import { BaseError, ContractFunctionRevertedError } from "viem";

/** What each contract rule means to the person who just ran into it. */
const RULES: Record<string, { rule?: string; message: string }> = {
  DuplicateInvoice: {
    rule: "R2",
    message: "This invoice reference is already registered, and each reference can only be used once.",
  },
  NotEligible: { rule: "R1", message: "This wallet isn't verified for that role, or its approval has expired." },
  NotAcknowledged: { rule: "R3", message: "This invoice is not open: the importer has to confirm it first." },
  TransferNotAllowed: { rule: "R4", message: "Units can only be held by verified, unfrozen participants." },
  PastDueDate: { rule: "R5", message: "The due date has passed, so units can no longer be bought or moved." },
  NotSettled: { rule: "R8", message: "Nothing can be collected until the invoice has settled or defaulted." },
  NotDue: { message: "This invoice isn't due yet." },
  NothingToClaim: { message: "There is nothing to collect right now." },
  NotDebtor: { message: "Only the importer named on the invoice can do this." },
  InsufficientUnits: { message: "That is more than the exporter has left to sell." },
  InvalidInvoice: { message: "Check the invoice details: amount, due date and discount (50% at most)." },
  WrongStatus: { message: "This invoice is no longer at the right stage for that action." },
  AccessControlUnauthorizedAccount: { message: "Only the verifier wallet can do this." },
  InvalidParticipant: { message: "Check the address, roles and validity period." },
};

export type TxFailure = { rule?: string; name?: string; message: string; blockedByContract: boolean };

export function explainError(error: unknown): TxFailure {
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      const name = reverted.data.errorName;
      const known = RULES[name];
      return {
        name,
        rule: known?.rule,
        message: known?.message ?? `The contract refused this: ${name}.`,
        blockedByContract: true,
      };
    }
    if (error.walk((e) => (e as { code?: number }).code === 4001) || /rejected|denied/i.test(error.message)) {
      return { message: "You cancelled this in your wallet.", blockedByContract: false };
    }
    if (/transfer amount exceeds|exceeds balance|exceeds allowance/i.test(error.message)) {
      return { message: "Not enough USDT in this wallet.", blockedByContract: false };
    }
    return { message: error.shortMessage, blockedByContract: false };
  }
  return { message: (error as Error)?.message ?? "Something went wrong.", blockedByContract: false };
}
