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
const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

let mockNetworkState = {
  mode: 'mainnet',
  hasHydrated: false,
};

let mockTokenState = {
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
  cacheKey: `mainnet:${mockAddress}`,
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
    address: mockAddress,
    balance: '99.00000000',
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
  getScopedTokens: ({
    hasHydrated,
    networkMode,
    address,
    cacheKey,
    tokens,
  }: {
    hasHydrated: boolean;
    networkMode: 'mainnet' | 'harbinger';
    address: string | null | undefined;
    cacheKey: string | null;
    tokens: Array<unknown>;
  }) => {
    if (!hasHydrated || !address) {
      return [];
    }

    return cacheKey === `${networkMode}:${address}` ? tokens : [];
  },
  isTokenScopeLoading: ({
    hasHydrated,
    networkMode,
    address,
    cacheKey,
    isLoading,
  }: {
    hasHydrated: boolean;
    networkMode: 'mainnet' | 'harbinger';
    address: string | null | undefined;
    cacheKey: string | null;
    isLoading: boolean;
  }) => {
    if (!address) {
      return false;
    }

    if (!hasHydrated) {
      return true;
    }

    return isLoading || cacheKey !== `${networkMode}:${address}`;
  },
  useTokenStore: () => ({
    ...mockTokenState,
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

function collectRenderedText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAll((node) => String((node as TestRenderer.ReactTestInstance).type) === 'Text')
    .map((node) => {
      const children = Array.isArray(node.props.children)
        ? node.props.children
        : [node.props.children];
      return children
        .filter((child): child is string | number => typeof child === 'string' || typeof child === 'number')
        .join('');
    })
    .filter(Boolean);
}

describe('HomeScreen network initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: false,
    };
    mockTokenState = {
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
      cacheKey: `mainnet:${mockAddress}`,
    };
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
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

  it('hides stale balance and token data synchronously when the active scope changes', async () => {
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: true,
    };
    mockTokenState = {
      tokens: [
        {
          contractId: 'koin-contract',
          symbol: 'KOIN',
          name: 'Koinos',
          decimals: 8,
          icon: '',
          balance: '12.34000000',
          isLoading: false,
        },
      ],
      isLoading: false,
      cacheKey: `mainnet:${mockAddress}`,
    };

    const { HomeScreen } = require('../HomeScreen');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    expect(collectRenderedText(renderer!)).toEqual(
      expect.arrayContaining(['12.34 KOIN', '1'])
    );

    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: true,
    };

    await act(async () => {
      renderer!.update(<HomeScreen />);
    });

    const renderedText = collectRenderedText(renderer!);
    expect(renderedText).toContain('0.00 KOIN');
    expect(renderedText).toContain('Loading tokens...');
    expect(renderedText).not.toContain('12.34 KOIN');
    expect(renderedText).not.toContain('99.00 KOIN');
  });
});
