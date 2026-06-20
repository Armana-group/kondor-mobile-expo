jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import type { ParsedTransaction } from '../../lib/transactionHistoryParser';
import {
  getScopedHistoryState,
  mergeConfirmedAndPendingTransactions,
} from '../useTransactionHistory';

const sampleTransaction: ParsedTransaction = {
  id: 'tx-1',
  type: 'receive',
  amount: '1',
  token: '1Token',
  tokenSymbol: 'KOIN',
  tokenDecimals: 8,
  from: '1From',
  to: '1To',
  timestamp: 123,
  status: 'confirmed',
  fee: '0',
  payer: '1Payer',
};

describe('getScopedHistoryState', () => {
  it('hides stale transactions and reports loading for a new scope until it settles', () => {
    expect(getScopedHistoryState({
      address: '1WalletAddress',
      historyScopeKey: 'harbinger:1WalletAddress',
      settledScopeKey: 'mainnet:1WalletAddress',
      transactions: [sampleTransaction],
      loading: false,
      refreshing: false,
      error: 'stale error',
    })).toEqual({
      transactions: [],
      loading: true,
      refreshing: false,
      error: null,
    });
  });

  it('returns settled transactions for the active scope', () => {
    expect(getScopedHistoryState({
      address: '1WalletAddress',
      historyScopeKey: 'harbinger:1WalletAddress',
      settledScopeKey: 'harbinger:1WalletAddress',
      transactions: [sampleTransaction],
      loading: false,
      refreshing: true,
      error: null,
    })).toEqual({
      transactions: [sampleTransaction],
      loading: false,
      refreshing: true,
      error: null,
    });
  });
});

describe('mergeConfirmedAndPendingTransactions', () => {
  it('keeps optimistic pending transactions ahead of older confirmed history', () => {
    const pending: ParsedTransaction = {
      ...sampleTransaction,
      id: 'tx-pending',
      type: 'send',
      status: 'pending',
      timestamp: 300,
    };
    const confirmed: ParsedTransaction = {
      ...sampleTransaction,
      id: 'tx-confirmed',
      status: 'confirmed',
      timestamp: 200,
    };

    expect(mergeConfirmedAndPendingTransactions([confirmed], [pending])).toEqual([
      pending,
      confirmed,
    ]);
  });

  it('drops optimistic entries once confirmed history includes the same chain transaction id', () => {
    const pending: ParsedTransaction = {
      ...sampleTransaction,
      id: 'tx-1',
      status: 'pending',
      timestamp: 400,
    };
    const confirmed: ParsedTransaction = {
      ...sampleTransaction,
      id: 'tx-1',
      status: 'confirmed',
      timestamp: 350,
    };

    expect(mergeConfirmedAndPendingTransactions([confirmed], [pending])).toEqual([
      confirmed,
    ]);
  });
});
