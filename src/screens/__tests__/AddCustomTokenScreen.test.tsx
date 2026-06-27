import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { layout } from '../../theme/layout';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockGoBack = jest.fn();
const mockInitialize = jest.fn(async () => undefined);
const mockSyncManagedTokens = jest.fn(async () => undefined);
const mockAddCustomToken = jest.fn();

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
        contractId: 'existing',
        symbol: 'KOIN',
        name: 'Koinos',
        decimals: 8,
        icon: '',
        balance: '1',
        isHidden: false,
        isCustom: false,
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

describe('AddCustomTokenScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the shared settings layout for the dedicated custom-token form', async () => {
    const { AddCustomTokenScreen } = require('../AddCustomTokenScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<AddCustomTokenScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(renderer!.root.findByProps({ testID: 'app-header' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'add-custom-token-form-card' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'add-custom-token-scroll' }).props.contentContainerStyle)
      .toEqual(expect.objectContaining({ paddingBottom: expect.any(Number) }));
    expect(renderer!.root.findByProps({ testID: 'add-custom-token-scroll' }).props.contentContainerStyle.paddingBottom)
      .toBeGreaterThan(layout.screen.bottomPadding);
    expect(text).toEqual(expect.arrayContaining([
      'Add Custom Token',
      'Mainnet',
      'Contract',
      'Symbol',
      'Name',
      'Decimals',
      'Icon URL (optional)',
      'Add Token',
    ]));
  });

  it('adds the custom token and returns to token management', async () => {
    const { AddCustomTokenScreen } = require('../AddCustomTokenScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<AddCustomTokenScreen />);
    });

    const [contractInput, symbolInput, nameInput, decimalsInput, iconInput] =
      renderer!.root.findAllByType(TextInput);

    await act(async () => {
      contractInput.props.onChangeText('  1Contract  ');
      symbolInput.props.onChangeText(' abc ');
      nameInput.props.onChangeText(' Alpha Beta ');
      decimalsInput.props.onChangeText('8');
      iconInput.props.onChangeText('   ');
    });

    await act(async () => {
      renderer!.root.findByType(TouchableOpacity).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddCustomToken).toHaveBeenCalledWith('mainnet', {
      contractId: '1Contract',
      symbol: 'ABC',
      name: 'Alpha Beta',
      decimals: 8,
      icon: undefined,
    });
    expect(mockSyncManagedTokens).toHaveBeenCalledWith('1MockAddress');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
