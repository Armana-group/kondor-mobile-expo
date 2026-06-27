jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const AsyncStorage = require('@react-native-async-storage/async-storage');

async function loadNetworkStore() {
  jest.resetModules();
  const mod = require('../networkStore');
  await mod.useNetworkStore.persist.rehydrate();
  return mod;
}

describe('networkStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('defaults to mainnet', async () => {
    const { useNetworkStore, getActiveNetworkConfig } = await loadNetworkStore();

    expect(useNetworkStore.getState().mode).toBe('mainnet');
    expect(getActiveNetworkConfig().isTestnet).toBe(false);
  });

  it('persists Harbinger mode', async () => {
    const { useNetworkStore, setNetworkMode } = await loadNetworkStore();

    await setNetworkMode('harbinger');
    await useNetworkStore.persist.rehydrate();

    expect(useNetworkStore.getState().mode).toBe('harbinger');
  });

  it('normalizes invalid persisted values to mainnet', async () => {
    await AsyncStorage.setItem(
      'current_network',
      JSON.stringify({
        state: { mode: 'broken-network' },
        version: 0,
      })
    );

    const { useNetworkStore } = await loadNetworkStore();

    expect(useNetworkStore.getState().mode).toBe('mainnet');
  });

  it('exposes the required config shape', async () => {
    const { getActiveNetworkConfig } = await loadNetworkStore();

    expect(getActiveNetworkConfig()).toEqual(
      expect.objectContaining({
        chainId: expect.any(String),
        rpcNodes: expect.any(Array),
        koinContract: expect.any(String),
        explorer: expect.objectContaining({
          base: expect.any(String),
          tx: expect.any(String),
          address: expect.any(String),
          contract: expect.any(String),
          block: expect.any(String),
        }),
        rest: expect.objectContaining({
          history: expect.any(String),
          transaction: expect.any(String),
        }),
        freeManaSharer: expect.any(String),
        isTestnet: expect.any(Boolean),
      })
    );
  });

  it('uses the current Koinos Foundation testnet endpoint for Harbinger mode', async () => {
    const { getActiveNetworkConfig, setNetworkMode } = await loadNetworkStore();

    await setNetworkMode('harbinger');

    expect(getActiveNetworkConfig()).toEqual(
      expect.objectContaining({
        chainId: 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==',
        rpcNodes: ['https://testnet.koinosfoundation.org/jsonrpc'],
        rest: {
          history: 'https://testnet.koinosfoundation.org',
          transaction: 'https://testnet.koinosfoundation.org',
        },
      })
    );
  });
});
