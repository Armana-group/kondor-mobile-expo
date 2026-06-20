jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParsedTransaction } from '../../lib/transactionHistoryParser';
import type { PendingTransactionRecord } from '../../stores/transactionStore';

type NetworkState = {
  mode: 'mainnet' | 'harbinger';
  hasHydrated: boolean;
};

type WalletState = {
  address: string | null;
};

let mockNetworkState: NetworkState = {
  mode: 'mainnet',
  hasHydrated: true,
};

let mockWalletState: WalletState = {
  address: '1WalletAddress',
};

const mockFetchTransactionTimestamps = jest.fn();
const mockGetTokenByContractId = jest.fn();
const mockParseHistoryTransaction = jest.fn(
  (rawTransaction: { parsedTransaction?: ParsedTransaction | null }) => (
    rawTransaction.parsedTransaction ?? null
  )
);

jest.mock('../../stores/networkStore', () => {
  const useNetworkStore = (selector?: (state: NetworkState) => unknown) => (
    selector ? selector(mockNetworkState) : mockNetworkState
  );

  (useNetworkStore as typeof useNetworkStore & { getState: () => NetworkState }).getState = () => (
    mockNetworkState
  );

  return {
    getActiveNetworkConfig: () => ({
      rest: {
        history: 'https://history.kondor.test',
        transaction: 'https://transaction.kondor.test',
      },
    }),
    useNetworkStore,
  };
});

jest.mock('../../stores/walletStore', () => {
  const useWalletStore = (selector?: (state: WalletState) => unknown) => (
    selector ? selector(mockWalletState) : mockWalletState
  );

  (useWalletStore as typeof useWalletStore & { getState: () => WalletState }).getState = () => (
    mockWalletState
  );

  return { useWalletStore };
});

jest.mock('../../stores/tokenStore', () => ({
  useTokenStore: () => ({
    getTokenByContractId: mockGetTokenByContractId,
  }),
}));

jest.mock('../../lib/logger', () => ({
  txLogger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../lib/txHistory', () => ({
  fetchTransactionTimestamps: mockFetchTransactionTimestamps,
}));

jest.mock('../../lib/transactionHistoryParser', () => ({
  parseHistoryTransaction: mockParseHistoryTransaction,
}));

const {
  PENDING_TRANSACTION_STALE_MS,
  useTransactionStore,
} = require('../../stores/transactionStore') as typeof import('../../stores/transactionStore');

const {
  getScopedHistoryState,
  mergeConfirmedAndPendingTransactions,
  useTransactionHistory,
} = require('../useTransactionHistory') as typeof import('../useTransactionHistory');

function HookHarness() {
  const { transactions, loading } = useTransactionHistory();

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Text,
      { testID: 'transactions' },
      transactions.map((transaction) => `${transaction.id}:${transaction.status}`).join(',')
    ),
    React.createElement(Text, { testID: 'loading' }, loading ? 'loading' : 'idle')
  );
}

function getTextById(renderer: TestRenderer.ReactTestRenderer, testID: string): string {
  const node = renderer.root.findByProps({ testID });
  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
  return children.join('');
}

function getMountedRenderer(renderer: TestRenderer.ReactTestRenderer | null): TestRenderer.ReactTestRenderer {
  if (!renderer) {
    throw new Error('Hook renderer was not mounted');
  }

  return renderer;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitForAssertion(assertion: () => void, attempts = 25) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushEffects();
    }
  }

  throw lastError;
}

function createPendingRecord(overrides: Partial<PendingTransactionRecord> = {}): PendingTransactionRecord {
  return {
    localId: 'pending-local-id',
    networkMode: 'mainnet',
    address: '1WalletAddress',
    chainTransactionId: '0xconfirmed-chain-id',
    type: 'send',
    amount: '1',
    token: '1Token',
    tokenSymbol: 'KOIN',
    tokenDecimals: 8,
    from: '1WalletAddress',
    to: '1RecipientAddress',
    timestamp: Date.now(),
    fee: '0',
    payer: '1WalletAddress',
    ...overrides,
  };
}

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

describe('useTransactionHistory hydration reconciliation', () => {
  let renderer: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockNetworkState = { mode: 'mainnet', hasHydrated: true };
    mockWalletState = { address: '1WalletAddress' };
    mockFetchTransactionTimestamps.mockResolvedValue(new Map());
    mockGetTokenByContractId.mockReturnValue(undefined);
    mockParseHistoryTransaction.mockImplementation(
      (rawTransaction: { parsedTransaction?: ParsedTransaction | null }) => (
        rawTransaction.parsedTransaction ?? null
      )
    );
    await AsyncStorage.clear();
    useTransactionStore.setState({
      pendingTransactions: [],
      hasHydrated: false,
    });
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
      renderer = null;
    }
  });

  it('removes hydrated pending rows that are already confirmed in the settled history without another refresh', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          parsedTransaction: {
            ...sampleTransaction,
            id: '0xconfirmed-chain-id',
            timestamp: 500,
          },
        },
      ],
    });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(HookHarness));
    });
    await flushEffects();
    const mountedRenderer = getMountedRenderer(renderer);

    await waitForAssertion(() => {
      expect(getTextById(mountedRenderer, 'loading')).toBe('idle');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      useTransactionStore.setState({
        pendingTransactions: [createPendingRecord()],
        hasHydrated: true,
      });
    });
    await flushEffects();

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(useTransactionStore.getState().pendingTransactions).toEqual([]);
      expect(getTextById(mountedRenderer, 'transactions')).not.toContain(':pending');
    });
  });

  it('prunes stale hydrated pending rows after the first history fetch settles', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    global.fetch = fetchMock as typeof fetch;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(HookHarness));
    });
    await flushEffects();
    const mountedRenderer = getMountedRenderer(renderer);

    await waitForAssertion(() => {
      expect(getTextById(mountedRenderer, 'loading')).toBe('idle');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      useTransactionStore.setState({
        pendingTransactions: [
          createPendingRecord({
            chainTransactionId: '0xstale-chain-id',
            timestamp: Date.now() - PENDING_TRANSACTION_STALE_MS - 1_000,
          }),
        ],
        hasHydrated: true,
      });
    });
    await flushEffects();

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(useTransactionStore.getState().pendingTransactions).toEqual([]);
      expect(getTextById(mountedRenderer, 'transactions')).toBe('');
    });
  });
});

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
