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

  it('refuses to approve a session before the active network hydrates', async () => {
    const { useNetworkStore, useWalletConnectStore } = await loadStores();

    useNetworkStore.setState({ mode: 'harbinger', hasHydrated: false });

    const approveSession = jest.fn(async () => undefined);
    useWalletConnectStore.setState({
      _walletKit: {
        approveSession,
        getActiveSessions: () => ({}),
      },
      pendingProposal: {
        id: 55,
        params: {
          requiredNamespaces: {
            koinos: {
              chains: [],
              methods: [],
              events: [],
            },
          },
        },
        peerMeta: {
          name: 'Pending dApp',
          description: 'Pending approval',
          url: 'https://pending.example.com',
          icons: [],
        },
      },
    });

    await expect(
      useWalletConnectStore.getState().approveSession('1SessionAddress')
    ).rejects.toThrow(/finish loading/i);

    expect(approveSession).not.toHaveBeenCalled();
  });

  it('approves sessions with the hydrated active-network namespace', async () => {
    const {
      KOINOS_CHAIN_IDS,
      KOINOS_METHODS,
      useNetworkStore,
      useWalletConnectStore,
    } = await loadStores();
    const { buildApprovedNamespaces } = require('@walletconnect/utils');

    useNetworkStore.setState({ mode: 'harbinger', hasHydrated: true });

    const approveSession = jest.fn(async () => undefined);
    useWalletConnectStore.setState({
      _walletKit: {
        approveSession,
        getActiveSessions: () => ({}),
      },
      pendingProposal: {
        id: 77,
        params: {
          requiredNamespaces: {
            koinos: {
              chains: [KOINOS_CHAIN_IDS.Harbinger],
              methods: [],
              events: [],
            },
          },
        },
        peerMeta: {
          name: 'Harbinger dApp',
          description: 'Harbinger approval',
          url: 'https://harbinger.example.com',
          icons: [],
        },
      },
    });

    (buildApprovedNamespaces as jest.Mock).mockReturnValue({
      koinos: {
        chains: [KOINOS_CHAIN_IDS.Harbinger],
        accounts: [`${KOINOS_CHAIN_IDS.Harbinger}:1SessionAddress`],
      },
    });

    await useWalletConnectStore.getState().approveSession('1SessionAddress');

    expect(buildApprovedNamespaces).toHaveBeenCalledWith(
      expect.objectContaining({
        supportedNamespaces: {
          koinos: expect.objectContaining({
            chains: [KOINOS_CHAIN_IDS.Harbinger],
            accounts: [`${KOINOS_CHAIN_IDS.Harbinger}:1SessionAddress`],
            methods: expect.arrayContaining([
              KOINOS_METHODS.SignTransaction,
              KOINOS_METHODS.SignAndSendTransaction,
            ]),
          }),
        },
      })
    );
    const approvedMethods = (buildApprovedNamespaces as jest.Mock).mock.calls[0][0]
      .supportedNamespaces.koinos.methods;
    expect(approvedMethods).toEqual([
      KOINOS_METHODS.SignTransaction,
      KOINOS_METHODS.SignAndSendTransaction,
      KOINOS_METHODS.PrepareTransaction,
      KOINOS_METHODS.WaitForTransaction,
      KOINOS_METHODS.JsonRpcCall,
      KOINOS_METHODS.GetNonce,
      KOINOS_METHODS.GetNextNonce,
      KOINOS_METHODS.GetAccountRc,
      KOINOS_METHODS.GetTransactionsById,
      KOINOS_METHODS.GetBlocksById,
      KOINOS_METHODS.GetHeadInfo,
      KOINOS_METHODS.GetChainId,
      KOINOS_METHODS.GetBlocks,
      KOINOS_METHODS.GetBlock,
      KOINOS_METHODS.ReadContract,
    ]);
    expect(approvedMethods).not.toContain(KOINOS_METHODS.SignMessage);
    expect(approvedMethods).not.toContain(KOINOS_METHODS.SignHash);
    expect(approvedMethods).not.toContain(KOINOS_METHODS.SendTransaction);
    expect(approvedMethods).not.toContain(KOINOS_METHODS.SubmitBlock);
    expect(approveSession).toHaveBeenCalledWith({
      id: 77,
      namespaces: {
        koinos: {
          chains: [KOINOS_CHAIN_IDS.Harbinger],
          accounts: [`${KOINOS_CHAIN_IDS.Harbinger}:1SessionAddress`],
        },
      },
    });
  });
});
