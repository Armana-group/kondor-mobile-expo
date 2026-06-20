jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import type { ParsedTransaction } from '../../lib/transactionHistoryParser';
import { getScopedHistoryState } from '../useTransactionHistory';

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
