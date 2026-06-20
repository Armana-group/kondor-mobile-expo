import type { AddPendingTransactionInput } from '../transactionStore';

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const NOW = 1_750_000_000_000;
const STORAGE_KEY = 'transaction-store';

type TransactionStoreModule = typeof import('../transactionStore');

async function flushPersistedWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getAsyncStorage() {
  return require('@react-native-async-storage/async-storage');
}

async function loadStore(): Promise<TransactionStoreModule> {
  jest.resetModules();
  const mod = require('../transactionStore') as TransactionStoreModule;
  await mod.useTransactionStore.persist.rehydrate();
  return mod;
}

function createPersistedPendingRecord(overrides: Record<string, unknown> = {}) {
  return {
    localId: 'persisted-local-id',
    networkMode: 'mainnet',
    address: '1WalletAddress',
    chainTransactionId: '0xpersisted-chain-id',
    type: 'send',
    amount: '9.50',
    token: '1TokenContract',
    tokenSymbol: 'KOIN',
    tokenDecimals: 8,
    from: '1WalletAddress',
    to: '1PersistedRecipient',
    timestamp: NOW - 60_000,
    fee: '0',
    payer: '1WalletAddress',
    ...overrides,
  };
}

async function loadStoreWithPendingHydration(
  persistedValue?: string,
  options: { captureValueBeforeHydrationRelease?: boolean } = {}
) {
  jest.resetModules();
  const asyncStorage = getAsyncStorage();
  if (persistedValue != null) {
    await asyncStorage.setItem(STORAGE_KEY, persistedValue);
  }
  let releaseHydration: (() => void) | null = null;
  const hydrationGate = new Promise<void>((resolve) => {
    releaseHydration = resolve;
  });

  asyncStorage.getItem.mockImplementation(async (key: string, callback?: (error?: Error | null, value?: string | null) => void) => {
    const valueBeforeDelay = asyncStorage.__INTERNAL_MOCK_STORAGE__[key] ?? null;
    await hydrationGate;
    const value = options.captureValueBeforeHydrationRelease === false
      ? asyncStorage.__INTERNAL_MOCK_STORAGE__[key] ?? null
      : valueBeforeDelay;
    callback?.(null, value);
    return value;
  });

  const mod = require('../transactionStore') as TransactionStoreModule;

  return {
    mod,
    async finishHydration() {
      releaseHydration?.();
      await new Promise<void>((resolve) => {
        const unsubscribe = mod.useTransactionStore.persist.onFinishHydration(() => {
          unsubscribe();
          resolve();
        });
      });
      await flushPersistedWrites();
    },
  };
}

function createPendingInput(overrides: Partial<AddPendingTransactionInput> = {}): AddPendingTransactionInput {
  return {
    address: '1WalletAddress',
    networkMode: 'mainnet' as const,
    chainTransactionId: '0xchain-tx-1',
    transaction: {
      type: 'send' as const,
      amount: '1.25',
      token: '1TokenContract',
      tokenSymbol: 'KOIN',
      tokenDecimals: 8,
      from: '1WalletAddress',
      to: '1RecipientAddress',
      timestamp: NOW,
      fee: '0',
      payer: '1WalletAddress',
    },
    ...overrides,
  };
}

describe('transactionStore', () => {
  beforeEach(async () => {
    await getAsyncStorage().clear();
    jest.clearAllMocks();
  });

  it('adds a pending transaction and persists only non-sensitive metadata', async () => {
    const { useTransactionStore } = await loadStore();

    const unsafeInput: AddPendingTransactionInput & {
      signerPrivateKey: string;
      transaction: AddPendingTransactionInput['transaction'] & {
        rawTransaction: { signatures: string[] };
      };
    } = {
      ...createPendingInput(),
      transaction: {
        ...createPendingInput().transaction,
        rawTransaction: { signatures: ['secret-signature'] },
      },
      signerPrivateKey: 'super-secret-private-key',
    };

    const localId = useTransactionStore.getState().addPendingTransaction(unsafeInput);

    const pending = useTransactionStore.getState().getPendingTransactions({
      address: '1WalletAddress',
      networkMode: 'mainnet',
    });

    expect(localId).toEqual(expect.any(String));
    expect(pending).toEqual([
      expect.objectContaining({
        id: '0xchain-tx-1',
        status: 'pending',
        type: 'send',
        amount: '1.25',
      }),
    ]);

    await flushPersistedWrites();
    const stored = JSON.parse((await getAsyncStorage().getItem(STORAGE_KEY)) ?? '{}');
    const persisted = stored.state?.pendingTransactions ?? [];
    expect(persisted).toHaveLength(1);
    expect(JSON.stringify(persisted[0])).not.toContain('super-secret-private-key');
    expect(JSON.stringify(persisted[0])).not.toContain('secret-signature');
  });

  it('confirms a pending transaction by local id', async () => {
    const { useTransactionStore } = await loadStore();

    const localId = useTransactionStore.getState().addPendingTransaction(createPendingInput());
    useTransactionStore.getState().confirmPendingTransactionByLocalId(localId);

    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1WalletAddress',
      networkMode: 'mainnet',
    })).toEqual([]);
  });

  it('confirms a pending transaction by chain transaction id within its scope', async () => {
    const { useTransactionStore } = await loadStore();

    useTransactionStore.getState().addPendingTransaction(createPendingInput());
    useTransactionStore.getState().addPendingTransaction(createPendingInput({
      networkMode: 'harbinger',
      address: '1OtherAddress',
      transaction: {
        ...createPendingInput().transaction,
        to: '1OtherRecipient',
      },
    }));
    useTransactionStore.getState().confirmPendingTransactionByChainId(
      {
        address: '1WalletAddress',
        networkMode: 'mainnet',
      },
      '0xchain-tx-1'
    );

    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1WalletAddress',
      networkMode: 'mainnet',
    })).toEqual([]);
    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1OtherAddress',
      networkMode: 'harbinger',
    })).toEqual([
      expect.objectContaining({ id: '0xchain-tx-1' }),
    ]);
  });

  it('confirms pending transactions by chain transaction ids within their scope only', async () => {
    const { useTransactionStore } = await loadStore();

    useTransactionStore.getState().addPendingTransaction(createPendingInput({
      chainTransactionId: '0xbulk-shared',
    }));
    useTransactionStore.getState().addPendingTransaction(createPendingInput({
      address: '1OtherAddress',
      chainTransactionId: '0xbulk-shared',
      transaction: {
        ...createPendingInput().transaction,
        to: '1OtherRecipient',
      },
    }));
    useTransactionStore.getState().confirmPendingTransactionsByChainIds(
      {
        address: '1WalletAddress',
        networkMode: 'mainnet',
      },
      ['0xbulk-shared']
    );

    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1WalletAddress',
      networkMode: 'mainnet',
    })).toEqual([]);
    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1OtherAddress',
      networkMode: 'mainnet',
    })).toEqual([
      expect.objectContaining({ id: '0xbulk-shared' }),
    ]);
  });

  it('removes stale pending transactions without touching fresh ones', async () => {
    const { PENDING_TRANSACTION_STALE_MS, useTransactionStore } = await loadStore();

    useTransactionStore.getState().addPendingTransaction(createPendingInput({
      chainTransactionId: '0xstale',
      transaction: {
        ...createPendingInput().transaction,
        timestamp: NOW - PENDING_TRANSACTION_STALE_MS - 1,
      },
    }));
    useTransactionStore.getState().addPendingTransaction(createPendingInput({
      chainTransactionId: '0xfresh',
      transaction: {
        ...createPendingInput().transaction,
        timestamp: NOW,
      },
    }));

    useTransactionStore.getState().pruneStalePendingTransactions(NOW);

    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1WalletAddress',
      networkMode: 'mainnet',
    })).toEqual([
      expect.objectContaining({ id: '0xfresh' }),
    ]);
  });

  it('scopes pending transactions by network and address', async () => {
    const { useTransactionStore } = await loadStore();

    useTransactionStore.getState().addPendingTransaction(createPendingInput());
    useTransactionStore.getState().addPendingTransaction(createPendingInput({
      networkMode: 'harbinger',
      chainTransactionId: '0xharbinger',
    }));
    useTransactionStore.getState().addPendingTransaction(createPendingInput({
      address: '1OtherAddress',
      chainTransactionId: '0xother-address',
    }));

    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1WalletAddress',
      networkMode: 'mainnet',
    })).toEqual([
      expect.objectContaining({ id: '0xchain-tx-1' }),
    ]);
    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1WalletAddress',
      networkMode: 'harbinger',
    })).toEqual([
      expect.objectContaining({ id: '0xharbinger' }),
    ]);
    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1OtherAddress',
      networkMode: 'mainnet',
    })).toEqual([
      expect.objectContaining({ id: '0xother-address' }),
    ]);
  });

  it('preserves in-memory pending transactions that are added before hydration finishes', async () => {
    const persistedValue = JSON.stringify({
      state: {
        pendingTransactions: [
          createPersistedPendingRecord(),
        ],
      },
      version: 0,
    });

    const { mod, finishHydration } = await loadStoreWithPendingHydration(persistedValue);
    const { useTransactionStore } = mod;

    const localId = useTransactionStore.getState().addPendingTransaction(createPendingInput({
      chainTransactionId: '0xcurrent-chain-id',
      transaction: {
        ...createPendingInput().transaction,
        to: '1CurrentRecipient',
        timestamp: NOW,
      },
    }));

    expect(useTransactionStore.getState().hasHydrated).toBe(false);
    expect(useTransactionStore.getState().getPendingTransactions({
      address: '1WalletAddress',
      networkMode: 'mainnet',
    })).toEqual([
      expect.objectContaining({ id: '0xcurrent-chain-id' }),
    ]);

    await finishHydration();

    const pendingTransactions = useTransactionStore.getState().getPendingTransactions({
      address: '1WalletAddress',
      networkMode: 'mainnet',
    });

    expect(pendingTransactions).toEqual([
      expect.objectContaining({ id: '0xcurrent-chain-id' }),
      expect.objectContaining({ id: '0xpersisted-chain-id' }),
    ]);
    expect(useTransactionStore.getState().pendingTransactions.find(
      (transaction) => transaction.chainTransactionId === '0xcurrent-chain-id'
    )).toEqual(
      expect.objectContaining({ localId })
    );
  });

  it('preserves persisted rows in storage when a new pending transaction is added before hydration resolves', async () => {
    const persistedValue = JSON.stringify({
      state: {
        pendingTransactions: [
          createPersistedPendingRecord(),
        ],
      },
      version: 0,
    });

    const { mod, finishHydration } = await loadStoreWithPendingHydration(
      persistedValue,
      { captureValueBeforeHydrationRelease: false }
    );
    const { useTransactionStore } = mod;

    useTransactionStore.getState().addPendingTransaction(createPendingInput({
      chainTransactionId: '0xcurrent-chain-id',
      transaction: {
        ...createPendingInput().transaction,
        to: '1CurrentRecipient',
        timestamp: NOW,
      },
    }));

    await flushPersistedWrites();
    await finishHydration();

    const stored = JSON.parse((await getAsyncStorage().getItem(STORAGE_KEY)) ?? '{}');
    const persisted = stored.state?.pendingTransactions ?? [];

    expect(persisted).toEqual([
      expect.objectContaining({ chainTransactionId: '0xcurrent-chain-id' }),
      expect.objectContaining({ chainTransactionId: '0xpersisted-chain-id' }),
    ]);
  });
});
