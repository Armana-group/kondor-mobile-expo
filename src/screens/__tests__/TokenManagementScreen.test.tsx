import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { layout } from '../../theme/layout';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockGoBack = jest.fn();
const mockInitialize = jest.fn(async () => undefined);
const mockSyncManagedTokens = jest.fn(async () => undefined);
const mockAddCustomToken = jest.fn();
const mockRemoveCustomToken = jest.fn();
const mockSetSystemTokenHidden = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
  }),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    address: '1MockAddress',
  }),
}));

jest.mock('../../stores/networkStore', () => ({
  useNetworkStore: (selector?: (state: { mode: 'mainnet'; hasHydrated: true }) => unknown) => {
    const state = {
      mode: 'mainnet' as const,
      hasHydrated: true as const,
    };

    return selector ? selector(state) : state;
  },
}));

jest.mock('../../stores/tokenStore', () => ({
  getExpectedTokenCacheKey: (networkMode: string, address: string) => `${networkMode}:${address}`,
  useTokenStore: () => ({
    allTokens: [
      {
        contractId: 'koin',
        symbol: 'KOIN',
        name: 'Koinos',
        decimals: 8,
        icon: '',
        balance: '1',
        isHidden: false,
        isCustom: false,
      },
      {
        contractId: 'vhp',
        symbol: 'VHP',
        name: 'Virtual Hash Power',
        decimals: 8,
        icon: '',
        balance: '2',
        isHidden: true,
        isCustom: false,
      },
      {
        contractId: 'custom',
        symbol: 'CUSTOM',
        name: 'Custom Token',
        decimals: 8,
        icon: '',
        balance: '3',
        isHidden: false,
        isCustom: true,
      },
    ],
    cacheKey: 'mainnet:1MockAddress',
    isLoading: false,
    isInitialized: true,
    initialize: mockInitialize,
    syncManagedTokens: mockSyncManagedTokens,
  }),
}));

jest.mock('../../stores/customTokenStore', () => ({
  useCustomTokenStore: () => ({
    addCustomToken: mockAddCustomToken,
    removeCustomToken: mockRemoveCustomToken,
    setSystemTokenHidden: mockSetSystemTokenHidden,
  }),
}));

function collectRenderedText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text)
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

describe('TokenManagementScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the shared settings layout rhythm for token management', async () => {
    const { TokenManagementScreen } = require('../TokenManagementScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<TokenManagementScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(renderer!.root.findByProps({ testID: 'app-header' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'token-management-summary-card' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'token-management-form-card' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'token-management-scroll' }).props.contentContainerStyle)
      .toEqual(expect.objectContaining({ paddingBottom: expect.any(Number) }));
    expect(renderer!.root.findByProps({ testID: 'token-management-scroll' }).props.contentContainerStyle.paddingBottom)
      .toBeGreaterThan(layout.screen.bottomPadding);
    expect(text).toEqual(expect.arrayContaining([
      'Manage Tokens',
      'Mainnet',
      'Visible',
      '2',
      'Hidden',
      '1',
      'Add Custom Token',
      'Add Token',
      'Tokens',
      'KOIN',
      'VHP',
    ]));
  });

  it('uses the shared header back action', async () => {
    const { TokenManagementScreen } = require('../TokenManagementScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<TokenManagementScreen />);
    });

    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Go back' }).props.onPress();
    });

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
