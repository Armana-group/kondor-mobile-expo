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
});
