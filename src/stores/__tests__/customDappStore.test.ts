jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createEmptyCustomDappState,
  useCustomDappStore,
} from '../customDappStore';

describe('customDappStore', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useCustomDappStore.setState(createEmptyCustomDappState(), false);
  });

  it('adds custom dApps with normalized metadata', () => {
    const result = useCustomDappStore.getState().addCustomDapp({
      name: '  Fogata  ',
      url: 'https://fogata.io/swap ',
      category: 'defi',
      iconUrl: ' https://fogata.io/favicon.ico ',
    });

    expect(result.ok).toBe(true);
    expect(useCustomDappStore.getState().customDapps).toEqual([
      expect.objectContaining({
        name: 'Fogata',
        url: 'https://fogata.io/swap',
        category: 'defi',
        icon: 'https://fogata.io/favicon.ico',
        isCurated: false,
      }),
    ]);
  });

  it('rejects insecure or invalid custom dApp URLs', () => {
    const result = useCustomDappStore.getState().addCustomDapp({
      name: 'Local',
      url: 'http://example.com',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/https/i),
    });
    expect(useCustomDappStore.getState().customDapps).toEqual([]);
  });

  it('prevents duplicate custom dApp URLs', () => {
    const state = useCustomDappStore.getState();

    expect(state.addCustomDapp({
      name: 'Fogata',
      url: 'https://fogata.io',
    }).ok).toBe(true);

    expect(state.addCustomDapp({
      name: 'Fogata Again',
      url: 'https://fogata.io/',
    })).toEqual({
      ok: false,
      error: 'This app URL is already saved.',
    });
  });

  it('allows the same custom dApp host on different ports', () => {
    const state = useCustomDappStore.getState();

    expect(state.addCustomDapp({
      name: 'Local App',
      url: 'https://example.com:8443',
    }).ok).toBe(true);

    expect(state.addCustomDapp({
      name: 'Local App Alt',
      url: 'https://example.com:9443',
    }).ok).toBe(true);

    expect(state.getCustomDapps()).toHaveLength(2);
  });

  it('updates and removes saved custom dApps', () => {
    const state = useCustomDappStore.getState();
    const result = state.addCustomDapp({
      name: 'Fogata',
      url: 'https://fogata.io',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    state.updateCustomDapp(result.dapp.id, {
      name: 'Fogata Swap',
      category: 'defi',
    });

    expect(state.getCustomDapps()).toEqual([
      expect.objectContaining({
        id: result.dapp.id,
        name: 'Fogata Swap',
        category: 'defi',
      }),
    ]);

    state.removeCustomDapp(result.dapp.id);

    expect(state.getCustomDapps()).toEqual([]);
  });
});
