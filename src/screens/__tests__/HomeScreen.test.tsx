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
const mockGetPortfolioValue = jest.fn<
  Promise<{
    totalUsd: number | null;
    pricedTokenCount: number;
    pricesByContractId: Record<string, number>;
    unavailableContractIds: string[];
  }>,
  [unknown]
>(async () => ({
  totalUsd: null,
  pricedTokenCount: 0,
  pricesByContractId: {},
  unavailableContractIds: [],
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

jest.mock('../../stores/koinosStore', () => {
  const useKoinosStore = () => ({
    provider: {},
    getBalance: mockGetBalance,
    getMana: mockGetMana,
    initialize: mockInitializeKoinos,
    reset: mockResetKoinos,
  });

  (useKoinosStore as any).getState = () => ({
    provider: {},
  });

  return { useKoinosStore };
});

jest.mock('../../lib/tokenPrices', () => ({
  tokenPriceService: {
    getPortfolioValue: (args: unknown) => mockGetPortfolioValue(args),
  },
}));

jest.mock('../../stores/tokenStore', () => {
  const getScopedTokens = ({
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
  };

  const isTokenScopeLoading = ({
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
  };

  const useTokenStore = () => ({
    ...mockTokenState,
    initialize: mockInitializeTokens,
    refreshBalances: mockRefreshBalances,
    reset: mockResetTokens,
  });

  (useTokenStore as any).getState = () => ({
    ...mockTokenState,
  });

  return {
    getScopedTokens,
    isTokenScopeLoading,
    useTokenStore,
  };
});

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
    mockGetPortfolioValue.mockResolvedValue({
      totalUsd: null,
      pricedTokenCount: 0,
      pricesByContractId: {},
      unavailableContractIds: [],
    });
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

  it('ignores stale mana responses from the previous network scope', async () => {
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: true,
    };

    let resolveStaleMana: ((value: {
      current: string;
      reserved: string;
      available: string;
      max: string;
      percentage: number;
      availablePercentage: number;
    }) => void) | null = null;

    const staleManaPromise = new Promise<{
      current: string;
      reserved: string;
      available: string;
      max: string;
      percentage: number;
      availablePercentage: number;
    }>((resolve) => {
      resolveStaleMana = resolve;
    });

    mockGetMana
      .mockImplementationOnce(() => staleManaPromise)
      .mockResolvedValueOnce({
        current: '0',
        reserved: '0',
        available: '0',
        max: '0',
        percentage: 0,
        availablePercentage: 70,
      });

    const { HomeScreen } = require('../HomeScreen');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<HomeScreen />);
    });
    await flushEffects();
    await flushEffects();

    expect(mockGetMana).toHaveBeenCalledTimes(1);

    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: true,
    };
    mockTokenState = {
      ...mockTokenState,
      cacheKey: `harbinger:${mockAddress}`,
    };

    await act(async () => {
      renderer!.update(<HomeScreen />);
    });
    await flushEffects();

    expect(collectRenderedText(renderer!)).toContain('70.0%');

    await act(async () => {
      resolveStaleMana?.({
        current: '0',
        reserved: '0',
        available: '0',
        max: '0',
        percentage: 0,
        availablePercentage: 12.5,
      });
      await Promise.resolve();
    });
    await flushEffects();

    const renderedText = collectRenderedText(renderer!);
    expect(renderedText).toContain('70.0%');
    expect(renderedText).not.toContain('12.5%');
  });

  it('shows portfolio USD only when price data is available', async () => {
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
    mockGetPortfolioValue.mockResolvedValue({
      totalUsd: 3.14,
      pricedTokenCount: 1,
      pricesByContractId: { 'koin-contract': 0.2544 },
      unavailableContractIds: [],
    });

    const { HomeScreen } = require('../HomeScreen');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<HomeScreen />);
    });
    await flushEffects();

    expect(collectRenderedText(renderer!).join(' ')).toContain('$3.14');

    await act(async () => {
      renderer!.unmount();
    });

    mockGetPortfolioValue.mockResolvedValue({
      totalUsd: null,
      pricedTokenCount: 0,
      pricesByContractId: {},
      unavailableContractIds: [],
    });

    await act(async () => {
      renderer = TestRenderer.create(<HomeScreen />);
    });
    await flushEffects();

    const renderedText = collectRenderedText(renderer!).join(' ');
    expect(renderedText).not.toContain('$0.00');
  });
});
