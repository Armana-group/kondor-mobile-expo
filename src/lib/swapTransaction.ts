import { Provider, Signer, Transaction, type TransactionReceipt } from 'koilib';
import { KOINDX } from './constants';
import { encodeApproveArgs, encodeSwapTokensInArgs } from './koindxCodec';
import { dryRunRcLimit } from './manaEstimation';
import {
  assertProtectedMinOutput,
  resolveApproveContractId,
  type SwapToken,
} from './swapMath';
import type { SwapQuote } from './swapQuote';

const INSUFFICIENT_SWAP_MANA_MESSAGE =
  'Insufficient mana to pay for this swap. Wait for mana to recharge or add KOIN to this account, then try again.';

export type SwapExecutionStatus =
  | 'building'
  | 'estimating_mana'
  | 'signing'
  | 'broadcasting'
  | 'confirming'
  | 'confirmed';

export interface SwapExecutionResult {
  transactionId: string;
  blockHeight?: number;
  receipt: TransactionReceipt;
  confirmationPending?: boolean;
  confirmationError?: string;
}

export interface SwapTransactionParams {
  provider: Provider;
  signer: Signer;
  quote: SwapQuote;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  allTokens: SwapToken[];
  rcLimit?: number;
  maxRc?: number;
  availableRc?: number;
  receiverAddress?: string;
  onStatus?: (status: SwapExecutionStatus) => void;
  onBroadcast?: (details: { transactionId: string; timestamp: number }) => void;
}

function getRevertReason(receipt: Partial<TransactionReceipt>): string {
  if (receipt.logs?.length) {
    return receipt.logs.join('; ');
  }

  const errorMessage = (receipt as { error_message?: string }).error_message;
  if (errorMessage) {
    return errorMessage;
  }

  return 'Unknown error';
}

function stringifyError(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getReceiptRpcError(receipt: Partial<TransactionReceipt>): unknown {
  return (receipt as { rpc_error?: unknown }).rpc_error;
}

function isRpcDeadlineError(value: unknown): boolean {
  return /context deadline exceeded|transaction not mined after/i.test(stringifyError(value));
}

function isInsufficientRcError(value: unknown): boolean {
  return /payer does not have the rc to cover transaction rc limit|insufficient rc/i.test(
    stringifyError(value)
  );
}

function normalizeSwapExecutionError(error: unknown): unknown {
  if (isInsufficientRcError(error)) {
    return new Error(INSUFFICIENT_SWAP_MANA_MESSAGE);
  }
  return error;
}

function rpcDeadlineMessage(value: unknown): string {
  return stringifyError(value);
}

function pendingConfirmationResult(
  receipt: TransactionReceipt,
  error: unknown
): SwapExecutionResult {
  return {
    transactionId: receipt.id,
    receipt,
    confirmationPending: true,
    confirmationError: rpcDeadlineMessage(error),
  };
}

function positiveFloor(value: number | undefined): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }
  return Math.floor(numeric);
}

function swapDryRunRcLimit(params: SwapTransactionParams): number {
  const estimationLimit = dryRunRcLimit({
    maxRc: params.maxRc,
    availableRc: params.availableRc,
  });
  const availableRc = positiveFloor(params.availableRc);

  if (availableRc !== undefined && availableRc < estimationLimit) {
    return availableRc;
  }

  return estimationLimit;
}

function swapFinalRcLimit(rcUsed: number, availableRcValue: number | undefined): number {
  const bufferedRcLimit = Math.floor(rcUsed * 1.1);
  const availableRc = positiveFloor(availableRcValue);

  if (availableRc === undefined || bufferedRcLimit <= availableRc) {
    return bufferedRcLimit;
  }

  if (rcUsed < availableRc) {
    return availableRc;
  }

  throw new Error(INSUFFICIENT_SWAP_MANA_MESSAGE);
}

export async function buildSwapTransaction(params: SwapTransactionParams): Promise<Transaction> {
  assertProtectedMinOutput(params.quote.amountInBaseUnits, params.quote.amountOutMinBaseUnits);

  const senderAddress = params.signer.getAddress();
  const receiverAddress = params.receiverAddress ?? senderAddress;
  const approveContractId = resolveApproveContractId(params.quote.route[0], params.allTokens);
  const rcLimit = params.rcLimit;

  if (rcLimit === undefined) {
    throw new Error('rcLimit is required to build a swap transaction');
  }

  const tx = new Transaction({
    signer: params.signer,
    provider: params.provider,
    options: {
      payer: senderAddress,
      rcLimit,
    },
  });

  tx.transaction.header = {
    ...tx.transaction.header,
    payer: senderAddress,
    rc_limit: rcLimit,
  };
  delete tx.transaction.header.payee;

  await tx.pushOperation({
    call_contract: {
      contract_id: approveContractId,
      entry_point: KOINDX.ENTRY_POINTS.TOKEN_APPROVE,
      args: encodeApproveArgs(
        senderAddress,
        KOINDX.PERIPHERY_CONTRACT,
        params.quote.amountInBaseUnits
      ),
    },
  });

  await tx.pushOperation({
    call_contract: {
      contract_id: KOINDX.PERIPHERY_CONTRACT,
      entry_point: KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN,
      args: encodeSwapTokensInArgs({
        from: senderAddress,
        receiver: receiverAddress,
        amountIn: params.quote.amountInBaseUnits,
        amountOutMin: params.quote.amountOutMinBaseUnits,
        path: params.quote.route,
      }),
    },
  });

  return tx;
}

export async function executeSwapTransaction(
  params: SwapTransactionParams
): Promise<SwapExecutionResult> {
  const onStatus = params.onStatus;

  onStatus?.('building');
  const dryRunTx = await buildSwapTransaction({
    ...params,
    rcLimit: swapDryRunRcLimit(params),
  });

  onStatus?.('estimating_mana');
  let dryRunReceipt: TransactionReceipt;
  try {
    dryRunReceipt = await dryRunTx.send({ broadcast: false });
  } catch (error) {
    throw normalizeSwapExecutionError(error);
  }
  const dryRunRpcError = getReceiptRpcError(dryRunReceipt);
  if (dryRunRpcError && isInsufficientRcError(dryRunRpcError)) {
    throw new Error(INSUFFICIENT_SWAP_MANA_MESSAGE);
  }
  if (dryRunRpcError && isRpcDeadlineError(dryRunRpcError)) {
    throw new Error(
      `Koinos RPC timed out while simulating the swap. No transaction was submitted. Try again. ${rpcDeadlineMessage(dryRunRpcError)}`
    );
  }
  if (dryRunReceipt.reverted) {
    throw new Error(`Swap simulation failed: ${getRevertReason(dryRunReceipt)}`);
  }

  const rcUsed = Number(dryRunReceipt.rc_used);
  if (!Number.isFinite(rcUsed) || rcUsed <= 0) {
    throw new Error('Could not estimate swap transaction cost');
  }

  const finalRcLimit = swapFinalRcLimit(rcUsed, params.availableRc);

  onStatus?.('signing');
  const tx = await buildSwapTransaction({
    ...params,
    rcLimit: finalRcLimit,
  });
  await tx.prepare();
  await params.signer.signTransaction(tx.transaction);

  onStatus?.('broadcasting');
  let receipt: TransactionReceipt;
  try {
    receipt = await tx.send({ broadcast: true });
  } catch (error) {
    throw normalizeSwapExecutionError(error);
  }
  const broadcastRpcError = getReceiptRpcError(receipt);
  if (broadcastRpcError && isInsufficientRcError(broadcastRpcError)) {
    throw new Error(INSUFFICIENT_SWAP_MANA_MESSAGE);
  }
  if (broadcastRpcError && isRpcDeadlineError(broadcastRpcError)) {
    onStatus?.('confirming');
    return pendingConfirmationResult(receipt, broadcastRpcError);
  }
  if (receipt.reverted) {
    throw new Error(`Swap broadcast failed: ${getRevertReason(receipt)}`);
  }
  params.onBroadcast?.({
    transactionId: receipt.id,
    timestamp: Date.now(),
  });

  onStatus?.('confirming');
  let confirmation: Awaited<ReturnType<Transaction['wait']>>;
  try {
    confirmation = await tx.wait();
  } catch (error) {
    if (isRpcDeadlineError(error)) {
      return pendingConfirmationResult(receipt, error);
    }
    throw error;
  }

  onStatus?.('confirmed');
  return {
    transactionId: receipt.id,
    blockHeight: confirmation.blockNumber,
    receipt,
  };
}
