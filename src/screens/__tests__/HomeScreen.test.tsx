import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockNavigate = jest.fn();
const mockUpdateBalance = jest.fn();
const mockRefreshBalances = jest.fn(async () => undefined);
const mockInitializeTokens = jest.fn(async () => undefined);
const mockResetTokens = jest.fn();
const mockInitializeKoinos = jest.fn(async () => undefined);
const mockResetKoinos = jest.fn();
const mockGetBalance = jest.fn(async () => '42.00000000');
const mockGetMana = jest.fn(async () => ({
  current: '0',
  reserved: '0',
  available: '0',
  max: '0',
  percentage: 0,
  availablePercentage: 50,
}));

let mockNetworkState = {
  mode: 'mainnet',
  hasHydrated: false,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../components/AccountSwitcher', () => ({
  AccountSwitcher: () => null,
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    balance: '0',
    updateBalance: mockUpdateBalance,
    accounts: [{ id: 'account-1', name: 'Primary', isImported: false }],
    getActiveAccount: () => ({ id: 'account-1', name: 'Primary', isImported: false }),
  }),
}));

jest.mock('../../stores/koinosStore', () => ({
  useKoinosStore: () => ({
    getBalance: mockGetBalance,
    getMana: mockGetMana,
    initialize: mockInitializeKoinos,
    reset: mockResetKoinos,
  }),
}));

jest.mock('../../stores/tokenStore', () => ({
  useTokenStore: () => ({
    tokens: [
      {
        contractId: 'koin-contract',
        symbol: 'KOIN',
        name: 'Koinos',
        decimals: 8,
        icon: '',
        balance: '0',
        isLoading: false,
      },
    ],
    isLoading: false,
    initialize: mockInitializeTokens,
    refreshBalances: mockRefreshBalances,
    reset: mockResetTokens,
  }),
}));

jest.mock('../../stores/networkStore', () => ({
  useNetworkStore: (selector?: (state: typeof mockNetworkState) => unknown) =>
    selector ? selector(mockNetworkState) : mockNetworkState,
}));

function flushEffects() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('HomeScreen network initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: false,
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('waits for hydration and reinitializes when the active network changes', async () => {
    const { HomeScreen } = require('../HomeScreen');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<HomeScreen />);
    });
    await flushEffects();

    expect(mockInitializeKoinos).not.toHaveBeenCalled();
    expect(mockInitializeTokens).not.toHaveBeenCalled();

    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: true,
    };

    await act(async () => {
      renderer!.update(<HomeScreen />);
    });
    await flushEffects();

    expect(mockResetKoinos).toHaveBeenCalledTimes(1);
    expect(mockResetTokens).toHaveBeenCalledTimes(1);
    expect(mockInitializeKoinos).toHaveBeenCalledTimes(1);
    expect(mockInitializeTokens).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(mockRefreshBalances).toHaveBeenCalledTimes(1);
    expect(mockUpdateBalance).toHaveBeenLastCalledWith('42.00000000');

    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: true,
    };

    await act(async () => {
      renderer!.update(<HomeScreen />);
    });
    await flushEffects();

    expect(mockResetKoinos).toHaveBeenCalledTimes(2);
    expect(mockResetTokens).toHaveBeenCalledTimes(2);
    expect(mockInitializeKoinos).toHaveBeenCalledTimes(2);
    expect(mockInitializeTokens).toHaveBeenCalledTimes(2);
    expect(mockRefreshBalances).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer!.unmount();
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
  });
});
