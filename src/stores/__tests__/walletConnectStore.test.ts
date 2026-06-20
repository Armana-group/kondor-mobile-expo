jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockGetSdkError = jest.fn((code: string) => ({
  code,
  message: code,
}));

jest.mock('@walletconnect/core', () => ({
  Core: jest.fn(),
}));

jest.mock('@reown/walletkit', () => ({
  WalletKit: {
    init: jest.fn(),
  },
}));

jest.mock('@walletconnect/utils', () => ({
  buildApprovedNamespaces: jest.fn(),
  getSdkError: (code: string) => mockGetSdkError(code),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');

function createSession(topic: string, chainId: string, address = '1SessionAddress') {
  return {
    topic,
    expiry: Math.floor(Date.now() / 1000) + 3600,
    peer: {
      metadata: {
        name: `dApp ${topic}`,
        description: `${topic} description`,
        url: `https://${topic}.example.com`,
        icons: [`https://${topic}.example.com/icon.png`],
      },
    },
    namespaces: {
      koinos: {
        chains: [chainId],
        accounts: [`${chainId}:${address}`],
      },
    },
  };
}

async function loadStores() {
  jest.resetModules();
  const networkStore = require('../networkStore');
  const walletConnectStore = require('../walletConnectStore');
  await networkStore.useNetworkStore.persist.rehydrate();
  await walletConnectStore.useWalletConnectStore.persist.rehydrate();
  return {
    ...networkStore,
    ...walletConnectStore,
  };
}

describe('walletConnectStore network reconciliation', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('defers session-topic validation until the network store hydrates', async () => {
    const {
      KOINOS_CHAIN_IDS,
      WALLETCONNECT_NETWORK_NOT_READY_ERROR,
      useNetworkStore,
      useWalletConnectStore,
    } = await loadStores();

    useNetworkStore.setState({ mode: 'harbinger', hasHydrated: false });

    useWalletConnectStore.setState({
      _walletKit: {
        getActiveSessions: () => ({
          'mainnet-topic': createSession('mainnet-topic', KOINOS_CHAIN_IDS.Mainnet),
        }),
      },
      initialized: true,
    });

    expect(
      useWalletConnectStore.getState().getSessionTopicValidationForActiveNetwork('mainnet-topic')
    ).toEqual({
      status: 'defer',
      message: WALLETCONNECT_NETWORK_NOT_READY_ERROR,
    });
  });

  it('disconnects sessions that no longer match the active network and clears stale pending state', async () => {
    const {
      KOINOS_CHAIN_IDS,
      useNetworkStore,
      useWalletConnectStore,
    } = await loadStores();

    useNetworkStore.setState({ mode: 'harbinger', hasHydrated: true });

    const activeSessions: Record<string, any> = {
      'mainnet-topic': createSession('mainnet-topic', KOINOS_CHAIN_IDS.Mainnet),
      'harbinger-topic': createSession('harbinger-topic', KOINOS_CHAIN_IDS.Harbinger),
    };

    const disconnectSession = jest.fn(async ({ topic }: { topic: string }) => {
      delete activeSessions[topic];
    });

    useWalletConnectStore.setState({
      _walletKit: {
        getActiveSessions: () => activeSessions,
        disconnectSession,
      },
      initialized: true,
      pendingRequest: {
        id: 1,
        topic: 'mainnet-topic',
        method: 'koinos_getHeadInfo',
        params: {},
        peerMeta: {
          name: 'Mismatch dApp',
          url: 'https://mismatch.example.com',
        },
      },
      pendingTransaction: {
        id: 2,
        topic: 'mainnet-topic',
        method: 'koinos_signTransaction',
        transaction: { operations: [] },
        signerAddress: '1SignerAddress',
        peerMeta: {
          name: 'Mismatch dApp',
          url: 'https://mismatch.example.com',
        },
      },
    });

    await useWalletConnectStore.getState().reconcileSessionsForActiveNetwork();

    expect(disconnectSession).toHaveBeenCalledTimes(1);
    expect(disconnectSession).toHaveBeenCalledWith({
      topic: 'mainnet-topic',
      reason: {
        code: 'USER_DISCONNECTED',
        message: 'USER_DISCONNECTED',
      },
    });
    expect(useWalletConnectStore.getState().sessions).toEqual([
      expect.objectContaining({
        topic: 'harbinger-topic',
        chains: [KOINOS_CHAIN_IDS.Harbinger],
      }),
    ]);
    expect(useWalletConnectStore.getState().pendingRequest).toBeNull();
    expect(useWalletConnectStore.getState().pendingTransaction).toBeNull();
  });
});
