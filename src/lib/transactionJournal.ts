import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TransactionJson } from 'koilib';
import type { AddPendingTransactionInput, PendingTransactionScope } from '../stores/transactionStore';

const JOURNAL_PREFIX = 'kondor-submission:';

export interface TransactionRecovery {
  transaction: TransactionJson;
  pending: AddPendingTransactionInput;
}

export interface TransactionJournalRecord {
  transaction: TransactionJson;
  pending: AddPendingTransactionInput;
  recovery?: Pick<TransactionJson, 'header' | 'operations'>;
  state: 'unknown' | 'submitted' | 'confirmed' | 'rejected' | 'cancelled';
}

let mutations: Promise<unknown> = Promise.resolve();

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutations.then(operation, operation);
  mutations = result.catch(() => undefined);
  return result;
}

function journalKey(record: Pick<TransactionJournalRecord, 'pending' | 'transaction'>): string {
  return JOURNAL_PREFIX + [record.pending.networkMode, record.pending.address, record.transaction.id]
    .map(value => encodeURIComponent(value!)).join(':');
}

async function readRecords(): Promise<TransactionJournalRecord[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(JOURNAL_PREFIX));
  const entries = await AsyncStorage.multiGet(keys);
  return entries.map(([key, value]) => {
    const record = value ? JSON.parse(value) as TransactionJournalRecord : null;
    if (!record?.transaction?.id || !record.pending?.address ||
        !['mainnet', 'harbinger'].includes(record.pending.networkMode) ||
        !['unknown', 'submitted', 'confirmed', 'rejected', 'cancelled'].includes(record.state) ||
        journalKey(record) !== key) {
      throw new Error('Transaction recovery data could not be read. Restore storage access before sending.');
    }
    return record;
  });
}

export async function readTransactionJournal(): Promise<TransactionJournalRecord[]> {
  await mutations;
  return readRecords();
}

export async function getTransactionRecovery(scope: PendingTransactionScope, id: string): Promise<TransactionRecovery | undefined> {
  const record = (await readTransactionJournal()).find(entry =>
    entry.pending.networkMode === scope.networkMode && entry.pending.address === scope.address &&
    entry.transaction.id === id && entry.state === 'unknown');
  if (!record?.recovery?.header || !record.recovery.operations?.length ||
      record.pending.source !== 'send') return undefined;
  const { header, operations } = record.recovery;
  if ((header.payee || header.payer) !== scope.address) return undefined;
  return { pending: record.pending, transaction: { id, header, operations } };
}

export function reserveTransactionSubmission(record: TransactionJournalRecord, retryOnly = false): Promise<TransactionJournalRecord | undefined> {
  return mutate(async () => {
    const existing = (await readRecords()).find(entry =>
      entry.pending.networkMode === record.pending.networkMode &&
      entry.pending.address === record.pending.address &&
      ((entry.transaction.id === record.transaction.id && entry.state !== 'cancelled') || entry.state === 'unknown'));
    if (existing) return existing;
    if (retryOnly) return undefined;
    // The submitted payload's signatures are never stored. Native recovery saves only the unsigned draft.
    await AsyncStorage.setItem(journalKey(record), JSON.stringify({ ...record, transaction: { id: record.transaction.id } }));
    return undefined;
  });
}

export function updateJournalState(record: TransactionJournalRecord, state: TransactionJournalRecord['state']): Promise<void> {
  return mutate(async () => {
    const value = await AsyncStorage.getItem(journalKey(record));
    if (!value) throw new Error('Transaction recovery record is missing');
    const current = JSON.parse(value) as TransactionJournalRecord;
    // Chain confirmation wins a race with the original submit response.
    if (current.state === 'confirmed') return;
    await AsyncStorage.setItem(journalKey(record), JSON.stringify({
      ...current, state, transaction: { id: current.transaction.id },
      recovery: state === 'unknown' ? current.recovery : undefined,
    }));
  });
}

export function settleJournalTransactions(scope: PendingTransactionScope, transactionIds: string[]): Promise<void> {
  return mutate(async () => {
    const ids = new Set(transactionIds);
    for (const record of await readRecords()) {
      if (record.pending.networkMode === scope.networkMode && record.pending.address === scope.address && ids.has(record.transaction.id!)) {
        await AsyncStorage.setItem(journalKey(record), JSON.stringify({
          ...record, state: 'confirmed', transaction: { id: record.transaction.id }, recovery: undefined,
        }));
      }
    }
  });
}

const reconciliations = new Map<string, Promise<string[]>>();

/** Query exact IDs, including operations absent from the account-history display. */
export function reconcileJournalTransactions(scope: PendingTransactionScope, provider: import('koilib').Provider): Promise<string[]> {
  const key = `${scope.networkMode}:${scope.address}`;
  const running = reconciliations.get(key);
  if (running) return running;
  const reconciliation = (async () => {
    const records = (await readTransactionJournal()).filter(record =>
      record.pending.networkMode === scope.networkMode && record.pending.address === scope.address &&
      (record.state === 'unknown' || record.state === 'submitted'));
    const confirmed: string[] = [];
    for (const record of records) {
      try {
        // Koilib verifies that the containing block is an ancestor of current head.
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            provider.wait(record.transaction.id!, 'byTransactionId', 1_000),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error('Transaction status read timed out')), 5_000);
            }),
          ]);
        } finally {
          if (timeout !== undefined) clearTimeout(timeout);
        }
        await settleJournalTransactions(scope, [record.transaction.id!]);
        confirmed.push(record.transaction.id!);
      } catch { /* A missing or unreadable transaction stays unresolved. */ }
    }
    return confirmed;
  })();
  reconciliations.set(key, reconciliation);
  void reconciliation.finally(() => reconciliations.delete(key)).catch(() => undefined);
  return reconciliation;
}
