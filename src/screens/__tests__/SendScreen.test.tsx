import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockGoBack = jest.fn();
const mockUpdateBalance = jest.fn();
const mockRefreshSingleBalance = jest.fn(async () => undefined);
const mockTransferToken = jest.fn();
const mockGetMana = jest.fn();
const mockGetBalance = jest.fn();
const mockRouteParams: { token?: { contractId: string; symbol: string } } = {};

const mockAddress = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
const recipientAddress = '14eKAYooeMEPi2G1hYxof7Ud8r7cRk67Q6';

let mockNetworkState = {
  mode: 'harbinger' as const,
  hasHydrated: true,
};

let mockTokenState = {
  tokens: [
    {
      contractId: 'mainnet-koin-contract',
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

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../components/ContactPicker', () => ({
  ContactPicker: () => null,
}));

jest.mock('../../components/QRScannerModal', () => ({
  QRScannerModal: () => null,
}));

jest.mock('../../lib/biometrics', () => ({
  requireBiometricAuth: jest.fn(async () => true),
}));

jest.mock('../../stores/networkStore', () => ({
  useNetworkStore: (selector?: (state: typeof mockNetworkState) => unknown) =>
    selector ? selector(mockNetworkState) : mockNetworkState,
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    balance: '99.00000000',
    address: mockAddress,
    updateBalance: mockUpdateBalance,
  }),
}));

jest.mock('../../stores/contactStore', () => ({
  useContactStore: () => ({
    getContactByAddress: () => null,
  }),
}));

jest.mock('../../stores/koinosStore', () => ({
  useKoinosStore: () => ({
    transfer: jest.fn(),
    transferToken: mockTransferToken,
    getMana: mockGetMana,
    getBalance: mockGetBalance,
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
    getTokenBySymbol: (symbol: string) =>
      mockTokenState.tokens.find((token) => token.symbol === symbol),
    refreshSingleBalance: mockRefreshSingleBalance,
  }),
}));

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

function findSendButton(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  const button = renderer.root
    .findAllByType(TouchableOpacity)
    .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === 'Send Transaction'));

  if (!button) {
    throw new Error('Send button not found');
  }

  return button;
}

describe('SendScreen balance scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: true,
    };
    mockTokenState = {
      tokens: [
        {
          contractId: 'mainnet-koin-contract',
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
    delete mockRouteParams.token;
  });

  it('suppresses stale token balances and disables sending while the active scope is loading', async () => {
    const { SendScreen } = require('../SendScreen');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SendScreen />);
    });

    const [recipientInput, amountInput] = renderer!.root.findAllByType(TextInput);

    await act(async () => {
      recipientInput.props.onChangeText(recipientAddress);
      amountInput.props.onChangeText('1');
    });

    const renderedText = collectRenderedText(renderer!);
    expect(renderedText).not.toContain('Available: 12.34 KOIN');

    const sendButton = findSendButton(renderer!);
    expect(sendButton.props.disabled).toBe(true);
  });
});
