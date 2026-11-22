import { Transaction, type Provider, type TransactionJson, type TransactionReceipt } from 'koilib';
import type { AddPendingTransactionInput } from '../stores/transactionStore';
import { MAINNET, TESTNET } from './constants';
import { getTransactionRecovery, reserveTransactionSubmission, updateJournalState, type TransactionJournalRecord } from './transactionJournal';

export class TransactionOutcomeUnknownError extends Error {
  constructor(public readonly transactionId: string) {
    super(`Transaction ${transactionId} may have been submitted. Check Activity first. If it’s still unconfirmed, review the same transaction again. Kondor only retries the original transaction ID.`);
    this.name = 'TransactionOutcomeUnknownError';
  }
}

export interface SubmitTransactionOnceParams {
  provider: Provider;
  transaction: TransactionJson;
  pending: AddPendingTransactionInput;
  onPersisted?: (pending: AddPendingTransactionInput) => void;
  onRejected?: (pending: AddPendingTransactionInput) => void;
  fetchImpl?: typeof fetch;
  assertCurrent?: () => void;
  retryOnly?: boolean;
}

function isDefinitiveRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !Number.isInteger((error as { code?: unknown }).code)) return false;
  const text = JSON.stringify(error).slice(0, 8192).toLowerCase();
  if (/timeout|timed out|deadline|connection|socket|reset|eof|rate.?limit|unavailable|gateway|duplicate|already/.test(text)) return false;
  return /insufficient (?:rc|resource credits)|payer does not have the rc|invalid (?:nonce|signature|transaction)|transaction (?:reverted|failed validation)|malformed transaction|rc limit (?:exceeded|too low)/.test(text);
}

const activeSubmissions = new Map<string, string>();

/** Submit once per approval. A new approval may retry an unresolved transaction with the same canonical ID. */
export async function submitTransactionOnce(params: SubmitTransactionOnceParams): Promise<TransactionReceipt> {
  const { transaction, pending } = params;
  const scope = `${pending.networkMode}:${pending.address}`;
  const activeId = activeSubmissions.get(scope);
  if (activeId) throw new TransactionOutcomeUnknownError(activeId);
  activeSubmissions.set(scope, transaction.id ?? scope);
  try {
    return await submitApprovedTransaction(params);
  } finally {
    activeSubmissions.delete(scope);
  }
}

async function submitApprovedTransaction({ provider, transaction, pending, onPersisted, onRejected, fetchImpl = fetch, assertCurrent, retryOnly = false }: SubmitTransactionOnceParams): Promise<TransactionReceipt> {
  const network = pending.networkMode === 'harbinger' ? TESTNET : MAINNET;
  if (transaction.header?.chain_id !== network.chainId) throw new Error('Transaction network does not match the selected network');
  if (!transaction.id || !transaction.header?.payer || !transaction.header.nonce || !transaction.signatures?.length) {
    throw new Error('Only a complete signed transaction can be submitted');
  }
  const rpcUrl = provider.rpcNodes[provider.currentNodeId ?? 0];
  if (!rpcUrl) throw new Error('No RPC node is available');
  const signed = JSON.parse(JSON.stringify({ id: transaction.id, header: transaction.header, operations: transaction.operations, signatures: transaction.signatures })) as TransactionJson;
  const canRecover = pending.source === 'send' &&
    signed.signatures?.length === 1 && !!signed.operations?.length &&
    (signed.header?.payee || signed.header?.payer) === pending.address;
  const record: TransactionJournalRecord = {
    transaction: { id: signed.id },
    pending: { ...pending, submissionTracked: true, chainTransactionId: signed.id, transaction: { ...pending.transaction, id: signed.id } },
    state: 'unknown',
    recovery: canRecover ? { header: signed.header, operations: signed.operations } : undefined,
  };
  assertCurrent?.();
  const existing = await reserveTransactionSubmission(record, retryOnly);
  const isRetry = existing?.state === 'unknown' && existing.transaction.id === signed.id;
  if (retryOnly && (!isRetry || !canRecover)) throw new Error('This transaction is no longer available to retry. Refresh Activity.');
  if (existing && !isRetry) throw new TransactionOutcomeUnknownError(existing.transaction.id!);
  if (isRetry) {
    // Derive the ID from the reviewed header and operations. A supplied ID by itself
    // is not evidence that the authorization matches the original transaction.
    const canonical = await Transaction.prepareTransaction({
      header: { ...signed.header },
      operations: signed.operations,
    });
    if (canonical.id !== signed.id ||
        canonical.header?.operation_merkle_root !== signed.header?.operation_merkle_root) {
      throw new TransactionOutcomeUnknownError(existing.transaction.id!);
    }
  }
  if (retryOnly && !await getTransactionRecovery(pending, signed.id!)) {
    throw new Error('This transaction is no longer available to retry. Refresh Activity.');
  }
  try {
    assertCurrent?.();
    if (!isRetry) onPersisted?.(record.pending);
    assertCurrent?.();
  } catch (error) {
    if (!isRetry) {
      await updateJournalState(record, 'cancelled');
      onRejected?.(record.pending);
    }
    throw error;
  }
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new TransactionOutcomeUnknownError(signed.id!));
    }, 15_000);
  });
  try {
    const response = await Promise.race([fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'chain.submit_transaction', params: { transaction: signed, broadcast: true } }),
      signal: controller.signal,
    }), deadline]);
    if (!response.ok) throw new TransactionOutcomeUnknownError(signed.id!);
    const body = await Promise.race([response.text(), deadline]);
    if (body.length > 1_048_576) throw new TransactionOutcomeUnknownError(signed.id!);
    const envelope = JSON.parse(body);
    const receipt = envelope.result?.receipt;
    if (envelope.jsonrpc === '2.0' && envelope.id === 1 && !envelope.result && isDefinitiveRejection(envelope.error)) {
      if (isRetry) throw new TransactionOutcomeUnknownError(signed.id!);
      await updateJournalState(record, 'rejected');
      onRejected?.(record.pending);
      throw new TransactionRejectedError(signed.id!);
    }
    if (envelope.jsonrpc !== '2.0' || envelope.id !== 1 || envelope.error ||
        !receipt || receipt.id !== signed.id || typeof receipt.reverted !== 'boolean' ||
        receipt.payer !== signed.header!.payer || receipt.rpc_error) {
      throw new TransactionOutcomeUnknownError(signed.id!);
    }
    if (receipt.reverted) {
      if (isRetry) throw new TransactionOutcomeUnknownError(signed.id!);
      await updateJournalState(record, 'rejected');
      onRejected?.(record.pending);
      throw new TransactionRejectedError(signed.id!);
    }
    await updateJournalState(record, 'submitted');
    return receipt as TransactionReceipt;
  } catch (error) {
    if (error instanceof TransactionRejectedError) throw error;
    throw new TransactionOutcomeUnknownError(signed.id!);
  } finally {
    clearTimeout(timeout!);
  }
}

export class TransactionRejectedError extends Error {
  constructor(public readonly transactionId: string) {
    super(`Transaction ${transactionId} was rejected by the network.`);
    this.name = 'TransactionRejectedError';
  }
}
