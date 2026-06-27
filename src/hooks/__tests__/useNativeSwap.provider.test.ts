describe('ensureProviderForActiveNetwork', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('reinitializes the provider when the stored chain does not match the active network', async () => {
    const provider = { rpcNodes: ['https://harbinger.example.com'] };
    const initialize = jest.fn(async () => undefined);
    const getState = jest
      .fn()
      .mockReturnValueOnce({
        provider: { rpcNodes: ['https://mainnet.example.com'] },
        isInitialized: true,
        networkChainId: 'mainnet-chain',
        initialize,
      })
      .mockReturnValueOnce({
        provider,
        isInitialized: true,
        networkChainId: 'harbinger-chain',
        initialize,
      });

    jest.doMock('../../stores/koinosStore', () => ({
      useKoinosStore: { getState },
    }));
    jest.doMock('../../stores/networkStore', () => ({
      getActiveNetworkConfig: () => ({
        chainId: 'harbinger-chain',
        isTestnet: true,
        name: 'Harbinger',
      }),
      useNetworkStore: jest.fn(),
    }));

    const { ensureProviderForActiveNetwork } = require('../useNativeSwap');

    await expect(ensureProviderForActiveNetwork()).resolves.toBe(provider);
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('initializes token state when the cached token scope is stale for the active network', async () => {
    const initialize = jest.fn(async () => undefined);

    jest.doMock('../../stores/koinosStore', () => ({
      useKoinosStore: {
        getState: () => ({
          provider: { rpcNodes: ['https://harbinger.example.com'] },
          isInitialized: true,
          networkChainId: 'harbinger-chain',
          initialize: jest.fn(async () => undefined),
        }),
      },
    }));
    jest.doMock('../../stores/tokenStore', () => ({
      useTokenStore: {
        getState: () => ({
          cacheKey: 'mainnet:1WalletAddress',
          isInitialized: true,
          initialize,
        }),
      },
    }));
    jest.doMock('../../stores/networkStore', () => ({
      getActiveNetworkConfig: () => ({
        chainId: 'harbinger-chain',
        isTestnet: true,
        name: 'Harbinger',
      }),
      useNetworkStore: jest.fn(),
    }));

    const { ensureSwapTokenScopeForActiveNetwork } = require('../useNativeSwap');

    await expect(ensureSwapTokenScopeForActiveNetwork('1WalletAddress')).resolves.toBeUndefined();
    expect(initialize).toHaveBeenCalledWith('1WalletAddress');
  });

  it('requests private-key access with native transaction authorization memory', async () => {
    const getPrivateKey = jest.fn(async () => 'private-key');

    jest.doMock('../../stores/walletStore', () => ({
      useWalletStore: {
        getState: () => ({
          getPrivateKey,
        }),
      },
    }));

    const { getPrivateKeyForNativeSwap } = require('../useNativeSwap');

    await expect(getPrivateKeyForNativeSwap()).resolves.toBe('private-key');
    expect(getPrivateKey).toHaveBeenCalledWith({
      allowTransactionAuthorizationMemory: true,
    });
  });
});
