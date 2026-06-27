jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const AsyncStorage = require('@react-native-async-storage/async-storage');

const NOW = 1_750_000_000_000;
const STORAGE_KEY = 'dapp-permission-store';

async function flushPersistedWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadStore() {
  const mod = require('../dappPermissionStore');
  await mod.useDAppPermissionStore.persist.rehydrate();
  return mod;
}

describe('dappPermissionStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    try {
      const { useDAppPermissionStore } = require('../dappPermissionStore');
      useDAppPermissionStore.setState({
        version: 1,
        grants: {},
        hasHydrated: false,
      });
    } catch {
      // Store not loaded yet in this test file.
    }
  });

  it('persists only persistent grants across rehydrate', async () => {
    const { useDAppPermissionStore } = await loadStore();

    useDAppPermissionStore.getState().upsertGrant({
      version: 1,
      origin: 'https://persistent.example',
      hostname: 'persistent.example',
      accounts: ['1walletAddrA'],
      capabilities: [{ method: 'getAccounts', caveats: [] }],
      lifetime: 'persistent',
      riskAtGrant: 'notice',
      createdAt: NOW,
      lastUsedAt: NOW,
    });

    useDAppPermissionStore.getState().upsertGrant({
      version: 1,
      origin: 'https://session.example',
      hostname: 'session.example',
      accounts: ['1walletAddrB'],
      capabilities: [{ method: 'getAccounts', caveats: [] }],
      lifetime: 'session',
      riskAtGrant: 'notice',
      createdAt: NOW,
      lastUsedAt: NOW,
    });

    await flushPersistedWrites();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}');
    const persistedGrants = stored.state?.grants ?? stored.grants ?? {};
    expect(Object.keys(persistedGrants)).toEqual([
      'https://persistent.example',
    ]);
  });

  it('drops malformed persisted grants during rehydrate', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          grants: {
            'https://evil.example': {
              version: 1,
              origin: 'https://evil.example',
              hostname: 'evil.example',
              accounts: ['1walletAddrA'],
              capabilities: [{ method: 'signer:signTransaction', caveats: [] }],
              lifetime: 'persistent',
              riskAtGrant: 'notice',
              createdAt: NOW,
              lastUsedAt: NOW,
            },
          },
        },
        version: 0,
      })
    );

    const { useDAppPermissionStore } = await loadStore();
    expect(useDAppPermissionStore.getState().grants).toEqual({});
  });

  it('touches persistent grants without persisting non-public fields', async () => {
    const { useDAppPermissionStore } = await loadStore();

    useDAppPermissionStore.getState().upsertGrant({
      version: 1,
      origin: 'https://persistent.example',
      hostname: 'persistent.example',
      accounts: ['1walletAddrA'],
      capabilities: [{ method: 'getAccounts', caveats: [] }],
      lifetime: 'persistent',
      riskAtGrant: 'notice',
      createdAt: NOW,
      lastUsedAt: NOW,
    });

    useDAppPermissionStore.getState().touchGrantLastUsed('https://persistent.example', NOW + 5000);

    await flushPersistedWrites();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}');
    const persistedGrant = stored.state?.grants?.['https://persistent.example'];

    expect(persistedGrant).toEqual({
      version: 1,
      origin: 'https://persistent.example',
      hostname: 'persistent.example',
      accounts: ['1walletAddrA'],
      capabilities: [{ method: 'getAccounts', caveats: [] }],
      lifetime: 'persistent',
      riskAtGrant: 'notice',
      createdAt: NOW,
      lastUsedAt: NOW + 5000,
    });
  });
});
