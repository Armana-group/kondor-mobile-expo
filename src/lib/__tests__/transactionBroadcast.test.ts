import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, type TransactionJson } from 'koilib';
import { submitTransactionOnce, TransactionOutcomeUnknownError } from '../transactionBroadcast';
import { getTransactionRecovery, readTransactionJournal, settleJournalTransactions } from '../transactionJournal';
import { MAINNET, TESTNET } from '../constants';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const signed: TransactionJson = {
  id: '0xtransaction',
  header: { chain_id: MAINNET.chainId, payer: 'sender', nonce: 'nonce', rc_limit: '100', operation_merkle_root: 'root' },
  operations: [],
  signatures: ['signature'],
};
const pending = {
  address: 'sender', networkMode: 'mainnet' as const, source: 'send' as const,
  transaction: { type: 'send' as const, amount: '1', token: 'token', tokenSymbol: 'KOIN', tokenDecimals: 8,
    from: 'sender', to: 'recipient', timestamp: 1, fee: '0', payer: 'sender' },
};
const provider = { rpcNodes: ['https://node.one', 'https://node.two'], currentNodeId: 0 } as any;
const receipt = { id: signed.id, payer: 'sender', rc_limit: '100', rc_used: '50', reverted: false };
const accepted = () => ({ ok: true, status: 200, text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { receipt } }) }) as Response;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

it('durably records the exact ID without signed bytes before one pinned submission', async () => {
  const fetchImpl = jest.fn(async (_url: unknown, _options: any) => {
    const journal = await readTransactionJournal();
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ state: 'unknown', transaction: { id: signed.id }, pending: { chainTransactionId: signed.id } });
    expect(journal[0].transaction).toEqual({ id: signed.id });
    const stored = await AsyncStorage.multiGet(await AsyncStorage.getAllKeys());
    expect(JSON.stringify(stored)).not.toContain('signatures');
    return accepted();
  });
  await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl })).resolves.toEqual(receipt);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith('https://node.one', expect.objectContaining({ method: 'POST' }));
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).params).toEqual({ transaction: signed, broadcast: true });
  expect((await readTransactionJournal())[0].state).toBe('submitted');
});

it('keeps a lost response recoverable and blocks a fresh same-account send after restart', async () => {
  const fetchImpl = jest.fn(async () => { throw new Error('connection lost'); });
  await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  const journal = await readTransactionJournal();
  expect(journal[0].transaction).toEqual({ id: signed.id });
  await expect(submitTransactionOnce({ provider, transaction: { ...signed, id: '0xnew' }, pending, fetchImpl })).rejects.toMatchObject({ transactionId: signed.id });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('does not dispatch a concurrent copy of the same transaction', async () => {
  const fetchImpl = jest.fn(async () => accepted());
  const results = await Promise.allSettled([
    submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl }),
    submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl }),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

async function reviewedTransaction() {
  return Transaction.prepareTransaction({
    header: {
      chain_id: MAINNET.chainId,
      payer: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
      nonce: 'KAE=',
      rc_limit: '100',
    },
    operations: [{ call_contract: {
      contract_id: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
      entry_point: 0x27f576ca,
      args: 'AA',
    } }],
    signatures: ['signature'],
  });
}

it.each(['before', 'after'])('handles a restart after the connection drops %s the node receives the transaction', async (when) => {
  const transaction = await reviewedTransaction();
  const scope = { ...pending, address: transaction.header!.payer! };
  const nodeTransactions = new Set<string>();
  const fetchImpl = jest.fn(async (_url: unknown, options?: RequestInit) => {
    const transactionId = JSON.parse(String(options?.body)).params.transaction.id;
    const firstAttempt = fetchImpl.mock.calls.length === 1;
    if (firstAttempt && when === 'before') throw new Error('Connection failed before delivery');
    if (nodeTransactions.has(transactionId)) return { ...accepted(), text: async () => JSON.stringify({
      jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'duplicate transaction' },
    }) } as Response;
    nodeTransactions.add(transactionId);
    if (firstAttempt) throw new Error('Response lost after delivery');
    return {
      ...accepted(),
      text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: {
        receipt: { ...receipt, id: transaction.id, payer: transaction.header!.payer },
      } }),
    } as Response;
  });
  await expect(submitTransactionOnce({ provider, transaction, pending: scope, fetchImpl }))
    .rejects.toMatchObject({ transactionId: transaction.id });

  await jest.isolateModulesAsync(async () => {
    jest.doMock('@react-native-async-storage/async-storage', () => AsyncStorage);
    const { submitTransactionOnce: submitAfterRestart } = require('../transactionBroadcast');
    const { getTransactionRecovery, reconcileJournalTransactions } = require('../transactionJournal');
    const recovery = await getTransactionRecovery(scope, transaction.id);
    expect(recovery?.transaction).toEqual({
      id: transaction.id, header: transaction.header, operations: transaction.operations,
    });
    expect(await getTransactionRecovery(pending, transaction.id)).toBeUndefined();
    expect(await getTransactionRecovery({ ...scope, networkMode: 'harbinger' }, transaction.id)).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const retry = submitAfterRestart({
      provider, transaction: { ...recovery.transaction, signatures: ['fresh signature'] },
      pending: recovery.pending, fetchImpl, retryOnly: true,
    });
    if (when === 'before') {
      await expect(retry).resolves.toMatchObject({ id: transaction.id });
    } else {
      await expect(retry).rejects.toMatchObject({ transactionId: transaction.id });
      expect((await readTransactionJournal())[0].state).toBe('unknown');
      const wait = jest.fn(async () => ({ blockId: 'confirmed-block', blockNumber: 123 }));
      await expect(reconcileJournalTransactions(scope, { wait })).resolves.toEqual([transaction.id]);
    }
    expect(await getTransactionRecovery(scope, transaction.id)).toBeUndefined();
  });

  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect([...nodeTransactions]).toEqual([transaction.id]);
  expect((await readTransactionJournal())[0]).toMatchObject({ state: when === 'before' ? 'submitted' : 'confirmed' });
  expect((await readTransactionJournal())[0].recovery).toBeUndefined();
});

it.each(['dapp', 'walletconnect'] as const)('keeps %s submissions eligible for status checks without storing a replay draft', async source => {
  const transaction = await reviewedTransaction();
  const pendingRequest = { ...pending, address: transaction.header!.payer!, source };
  const fetchImpl = jest.fn(async () => { throw new Error('lost response'); });
  await expect(submitTransactionOnce({ provider, transaction, pending: pendingRequest, fetchImpl }))
    .rejects.toMatchObject({ transactionId: transaction.id });
  expect(await getTransactionRecovery(pendingRequest, transaction.id!)).toBeUndefined();
  expect((await readTransactionJournal())[0]).toMatchObject({ state: 'unknown', transaction: { id: transaction.id } });
  expect((await readTransactionJournal())[0].recovery).toBeUndefined();
});

it('never turns an Activity retry into a new submission if the journal record is missing', async () => {
  const transaction = await reviewedTransaction();
  const fetchImpl = jest.fn(async () => accepted());
  await expect(submitTransactionOnce({ provider, transaction, pending, fetchImpl, retryOnly: true }))
    .rejects.toThrow('no longer available to retry');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await readTransactionJournal()).toEqual([]);
});

it('does not clear the original uncertainty when the exact retry is rejected', async () => {
  const transaction = await reviewedTransaction();
  const fetchImpl = jest.fn(async () => {
    if (fetchImpl.mock.calls.length === 1) throw new Error('lost response');
    return { ...accepted(), text: async () => JSON.stringify({
      jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'invalid nonce' },
    }) } as Response;
  });
  await expect(submitTransactionOnce({ provider, transaction, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  await expect(submitTransactionOnce({ provider, transaction, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect((await readTransactionJournal())[0].state).toBe('unknown');
});

it.each(['header', 'operations'])('blocks changed %s carrying the unresolved transaction ID', async (part) => {
  const transaction = await reviewedTransaction();
  const fetchImpl = jest.fn(async () => { throw new Error('lost response'); });
  await expect(submitTransactionOnce({ provider, transaction, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  const modified = part === 'header'
    ? { ...transaction, header: { ...transaction.header, rc_limit: '101' } }
    : { ...transaction, operations: [] };
  await expect(submitTransactionOnce({ provider, transaction: modified, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect((await readTransactionJournal())[0].state).toBe('unknown');
});

it('keeps the original record when retry approval changes before submission', async () => {
  const transaction = await reviewedTransaction();
  const fetchImpl = jest.fn(async () => { throw new Error('lost response'); });
  await expect(submitTransactionOnce({ provider, transaction, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  const assertCurrent = jest.fn().mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error('Approval cancelled'); });
  const onRejected = jest.fn();
  await expect(submitTransactionOnce({ provider, transaction, pending, fetchImpl, assertCurrent, onRejected })).rejects.toThrow('Approval cancelled');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(onRejected).not.toHaveBeenCalled();
  expect((await readTransactionJournal())[0].state).toBe('unknown');
});

it('fails before submission when durable storage fails', async () => {
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
  const fetchImpl = jest.fn(async () => accepted());
  await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl })).rejects.toThrow('disk full');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('treats malformed and mismatched responses as unknown without a retry', async () => {
  const fetchImpl = jest.fn(async () => ({ ...accepted(), text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { receipt: { ...receipt, id: 'other' } } }) }) as Response);
  await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('blocks wrong-network payloads before storage or submission', async () => {
  const fetchImpl = jest.fn(async () => accepted());
  await expect(submitTransactionOnce({ provider, transaction: signed, pending: { ...pending, networkMode: 'harbinger' }, fetchImpl })).rejects.toThrow('network');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await readTransactionJournal()).toHaveLength(0);
});

it('releases an unknown scope only when that account and network confirm its ID', async () => {
  const fetchImpl = jest.fn(async () => { throw new Error('lost'); });
  await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  await settleJournalTransactions({ address: 'other', networkMode: 'mainnet' }, [signed.id!]);
  expect((await readTransactionJournal())[0].state).toBe('unknown');
  await settleJournalTransactions(pending, [signed.id!]);
  expect((await readTransactionJournal())[0].state).toBe('confirmed');
});

it('allows a different network while the same account has an unknown mainnet send', async () => {
  const fetchImpl = jest.fn(async () => { throw new Error('lost'); });
  await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  await expect(submitTransactionOnce({ provider, transaction: { ...signed, id: 'testnet', header: { ...signed.header, chain_id: TESTNET.chainId } }, pending: { ...pending, networkMode: 'harbinger' }, fetchImpl })).rejects.toMatchObject({ transactionId: 'testnet' });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it('cancels safely when authority changes during the durable write', async () => {
  const assertCurrent = jest.fn().mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error('cancelled'); });
  const fetchImpl = jest.fn(async () => accepted());
  await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl, assertCurrent })).rejects.toThrow('cancelled');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect((await readTransactionJournal())[0].state).toBe('cancelled');
  expect((await readTransactionJournal())[0].transaction.signatures).toBeUndefined();
});

it('releases a deterministic rejection without leaving an unknown account block', async () => {
  const onRejected = jest.fn();
  const fetchImpl = jest.fn(async () => ({ ...accepted(), text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'payer does not have the rc to cover transaction rc limit' } }) }) as Response);
  await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl, onRejected })).rejects.toThrow('rejected');
  expect((await readTransactionJournal())[0]).toMatchObject({ state: 'rejected', transaction: { id: signed.id } });
  expect((await readTransactionJournal())[0].transaction.signatures).toBeUndefined();
  expect(onRejected).toHaveBeenCalledTimes(1);
  await expect(submitTransactionOnce({ provider, transaction: { ...signed, id: 'new' }, pending, fetchImpl })).rejects.toThrow('rejected');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it('preserves ambiguity for deadline and duplicate-transaction errors', async () => {
  for (const message of ['rpc failed, context deadline exceeded', 'duplicate transaction']) {
    await AsyncStorage.clear();
    const fetchImpl = jest.fn(async () => ({ ...accepted(), text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32603, message } }) }) as Response);
    await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
    expect((await readTransactionJournal())[0].state).toBe('unknown');
  }
});

it('reconciles exact pending IDs even when they are absent from parsed account history', async () => {
  const { reconcileJournalTransactions } = require('../transactionJournal');
  const fetchImpl = jest.fn(async () => { throw new Error('lost response'); });
  await expect(submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  const wait = jest.fn(async () => ({ blockId: 'confirmed-block', blockNumber: 123 }));
  expect(await reconcileJournalTransactions({ ...pending, address: 'other' }, { wait })).toEqual([]);
  expect(wait).not.toHaveBeenCalled();
  expect(await reconcileJournalTransactions(pending, { wait })).toEqual([signed.id]);
  expect(wait).toHaveBeenCalledWith(signed.id, 'byTransactionId', 1000);
  expect((await readTransactionJournal())[0].state).toBe('confirmed');
});

it('stops waiting at the deadline even if the transport ignores abort', async () => {
  jest.useFakeTimers();
  const fetchImpl = jest.fn(() => new Promise<Response>(() => {}));
  const outcome = submitTransactionOnce({ provider, transaction: signed, pending, fetchImpl });
  const assertion = expect(outcome).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  await jest.advanceTimersByTimeAsync(15_001);
  await assertion;
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect((await readTransactionJournal())[0].state).toBe('unknown');
  jest.useRealTimers();
});


it('releases a stalled reconciliation so a later refresh can confirm the transaction', async () => {
  const { reconcileJournalTransactions } = require('../transactionJournal');
  await expect(submitTransactionOnce({ provider, transaction: signed, pending,
    fetchImpl: jest.fn(async () => { throw new Error('lost response'); }),
  })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  jest.useFakeTimers();
  try {
    const stalled = reconcileJournalTransactions(pending, { wait: () => new Promise(() => {}) });
    await jest.advanceTimersByTimeAsync(5_001);
    expect(await stalled).toEqual([]);
    expect((await readTransactionJournal())[0].state).toBe('unknown');
    const wait = jest.fn(async () => ({ blockId: 'confirmed-block', blockNumber: 123 }));
    expect(await reconcileJournalTransactions(pending, { wait })).toEqual([signed.id]);
    expect(wait).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
