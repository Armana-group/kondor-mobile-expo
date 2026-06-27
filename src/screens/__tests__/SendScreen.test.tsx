import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import type { BackupHealth } from '../../lib/backupHealth';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockUpdateBalance = jest.fn();
const mockRefreshSingleBalance = jest.fn(async () => undefined);
const mockInitializeTokens = jest.fn(async () => undefined);
const mockTransferToken = jest.fn();
const mockGetMana = jest.fn();
const mockGetBalance = jest.fn();
const mockAddPendingTransaction = jest.fn();
const mockIsSendConfirmationRequired = jest.fn(async () => true);
const mockResolveRecipient = jest.fn();
const mockShouldAuthenticateTransaction = jest.fn(async (_address: string) => true);
const mockRememberTransactionAuthorization = jest.fn(async (_address: string) => undefined);
const mockRouteParams: { token?: { contractId: string; symbol: string } } = {};
let mockContacts: Array<{ id: string; name: string; address: string; createdAt: number }> = [];

const mockAddress = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
const recipientAddress = '14eKAYooeMEPi2G1hYxof7Ud8r7cRk67Q6';

let mockNetworkState: { mode: 'harbinger' | 'mainnet'; hasHydrated: boolean } = {
  mode: 'harbinger',
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
  isInitialized: true,
  cacheKey: `mainnet:${mockAddress}`,
};

let mockBackupHealth: BackupHealth = {
  status: 'verified',
  provider: 'manual-file',
  lastCreatedAt: '2026-06-20T00:00:00.000Z',
  lastVerifiedAt: '2026-06-20T00:00:00.000Z',
  walletFingerprint: 'wallet-hash',
  accountSetHash: 'account-hash',
  failureReason: null,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: mockNavigate,
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

jest.mock('../../services/auth', () => ({
  isSendConfirmationRequired: () => mockIsSendConfirmationRequired(),
}));

jest.mock('../../services/transactionAuthorization', () => ({
  shouldAuthenticateTransaction: (address: string) => mockShouldAuthenticateTransaction(address),
  rememberTransactionAuthorization: (address: string) => mockRememberTransactionAuthorization(address),
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
    backupHealth: mockBackupHealth,
  }),
}));

jest.mock('../../stores/contactStore', () => ({
  useContactStore: () => ({
    contacts: mockContacts,
    getContactByAddress: (address: string) =>
      mockContacts.find((contact) => contact.address.toLowerCase() === address.toLowerCase()) || null,
  }),
}));

jest.mock('../../lib/recipient', () => ({
  resolveRecipient: (...args: unknown[]) => mockResolveRecipient(...args),
}));

jest.mock('../../stores/koinosStore', () => ({
  useKoinosStore: () => ({
    transfer: jest.fn(),
    transferToken: mockTransferToken,
    getMana: mockGetMana,
    getBalance: mockGetBalance,
  }),
}));

jest.mock('../../stores/transactionStore', () => ({
  useTransactionStore: {
    getState: () => ({
      addPendingTransaction: mockAddPendingTransaction,
    }),
  },
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

function findPressableByText(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const node = renderer.root.findAll((candidate) =>
    typeof candidate.props.onPress === 'function' &&
    candidate.findAllByType(Text).some((textNode) => textNode.props.children === label)
  )[0];

  if (!node) {
    throw new Error(`Pressable not found: ${label}`);
  }

  return node;
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
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSendConfirmationRequired.mockResolvedValue(true);
    mockShouldAuthenticateTransaction.mockResolvedValue(true);
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
      isInitialized: true,
      cacheKey: `mainnet:${mockAddress}`,
    };
    mockContacts = [];
    mockBackupHealth = {
      status: 'verified',
      provider: 'manual-file',
      lastCreatedAt: '2026-06-20T00:00:00.000Z',
      lastVerifiedAt: '2026-06-20T00:00:00.000Z',
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
      failureReason: null,
    };
    delete mockRouteParams.token;
    mockGetMana.mockResolvedValue({
      available: '1000000',
      max: '1000000',
      reserved: '0',
      availablePercentage: 100,
    });
    mockGetBalance.mockResolvedValue('98.00000000');
    mockResolveRecipient.mockImplementation(async (value: string) => {
      const input = value.trim();
      if (input === recipientAddress) {
        return {
          input,
          address: recipientAddress,
          source: 'address',
          label: 'Valid Koinos address',
        };
      }

      return null;
    });
  });

  afterAll(() => {
    alertSpy.mockRestore();
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

  it('initializes the active token scope on direct entry after a network change', async () => {
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
      isInitialized: true,
      cacheKey: `mainnet:${mockAddress}`,
    };

    const { SendScreen } = require('../SendScreen');

    await act(async () => {
      TestRenderer.create(<SendScreen />);
    });

    expect(mockInitializeTokens).toHaveBeenCalledWith(mockAddress);
  });

  it('shows a backup warning before sending from an unbacked wallet', async () => {
    mockBackupHealth = {
      status: 'none',
      provider: null,
      lastCreatedAt: null,
      lastVerifiedAt: null,
      walletFingerprint: null,
      accountSetHash: null,
      failureReason: null,
    };
    const { SendScreen } = require('../SendScreen');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SendScreen />);
    });

    expect(collectRenderedText(renderer!).join(' ')).toContain('Back up this wallet');

    await act(async () => {
      findPressableByText(renderer!, 'Back up this wallet').props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Settings', { screen: 'BackupRecovery' });
  });

  it('shows actionable compact copy for a stale backup before sending', async () => {
    mockBackupHealth = {
      status: 'stale',
      provider: 'manual-file',
      lastCreatedAt: '2026-06-20T00:00:00.000Z',
      lastVerifiedAt: '2026-06-19T00:00:00.000Z',
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
      failureReason: 'wallet changed after backup',
    };
    const { SendScreen } = require('../SendScreen');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SendScreen />);
    });

    const renderedText = collectRenderedText(renderer!).join(' ');
    expect(renderedText).toContain('Backup stale');
    expect(renderedText).toContain('Create a fresh encrypted backup before sending.');
  });

  it('adds a pending transaction as soon as broadcast is accepted, before transfer confirmation resolves', async () => {
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
      isInitialized: true,
      cacheKey: `harbinger:${mockAddress}`,
    };

    let resolveTransfer: ((value: string) => void) | null = null;
    mockTransferToken.mockImplementation(
      async (
        _contractId: string,
        _to: string,
        _amount: string,
        _decimals: number,
        options?: {
          onBroadcastAccepted?: (details: { transactionId: string; timestamp: number }) => void;
        }
      ) => {
        options?.onBroadcastAccepted?.({
          transactionId: '0xsend-accepted',
          timestamp: 123456,
        });

        return new Promise<string>((resolve) => {
          resolveTransfer = resolve;
        });
      }
    );

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

    await act(async () => {
      findSendButton(renderer!).props.onPress();
    });

    const confirmationButtons = alertSpy.mock.calls.at(-1)?.[2];
    const confirmButton = confirmationButtons?.find((button) => button.text === 'Send');

    expect(confirmButton?.onPress).toEqual(expect.any(Function));

    await act(async () => {
      void confirmButton?.onPress?.();
      await Promise.resolve();
    });

    const { requireBiometricAuth } = require('../../lib/biometrics');
    expect(requireBiometricAuth).toHaveBeenCalledWith('send this transaction');
    expect(mockRememberTransactionAuthorization).toHaveBeenCalledWith(mockAddress);
    expect(mockTransferToken).toHaveBeenCalledWith(
      'mainnet-koin-contract',
      recipientAddress,
      '1',
      8,
      expect.objectContaining({
        onBroadcastAccepted: expect.any(Function),
      })
    );
    expect(mockAddPendingTransaction).toHaveBeenCalledWith({
      address: mockAddress,
      networkMode: 'harbinger',
      chainTransactionId: '0xsend-accepted',
      source: 'send',
      transaction: {
        id: '0xsend-accepted',
        type: 'send',
        amount: '1',
        token: 'mainnet-koin-contract',
        tokenSymbol: 'KOIN',
        tokenDecimals: 8,
        tokenIcon: '',
        from: mockAddress,
        to: recipientAddress,
        timestamp: 123456,
        fee: '0',
        payer: mockAddress,
      },
    });
    expect(mockGoBack).not.toHaveBeenCalled();

    await act(async () => {
      resolveTransfer?.('0xsend-accepted');
      await Promise.resolve();
    });
  });

  it('resolves a nickname recipient and sends an optional memo', async () => {
    mockNetworkState = {
      mode: 'mainnet',
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
      isInitialized: true,
      cacheKey: `mainnet:${mockAddress}`,
    };
    mockResolveRecipient.mockResolvedValue({
      input: 'alice',
      address: recipientAddress,
      source: 'nickname',
      label: `@alice resolves to ${recipientAddress}`,
    });
    mockTransferToken.mockImplementation(
      async (
        _contractId: string,
        _to: string,
        _amount: string,
        _decimals: number,
        options?: {
          onBroadcastAccepted?: (details: { transactionId: string; timestamp: number }) => void;
        }
      ) => {
        options?.onBroadcastAccepted?.({
          transactionId: '0xsend-with-memo',
          timestamp: 123456,
        });
        return '0xsend-with-memo';
      }
    );

    const { SendScreen } = require('../SendScreen');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SendScreen />);
    });

    const [recipientInput, amountInput, memoInput] = renderer!.root.findAllByType(TextInput);

    await act(async () => {
      recipientInput.props.onChangeText('@alice');
      amountInput.props.onChangeText('1');
      memoInput.props.onChangeText('Invoice 42');
    });

    await act(async () => {
      findSendButton(renderer!).props.onPress();
      await Promise.resolve();
    });

    expect(mockResolveRecipient).toHaveBeenCalledWith('@alice', 'mainnet');
    const confirmationButtons = alertSpy.mock.calls.at(-1)?.[2];
    const confirmButton = confirmationButtons?.find((button) => button.text === 'Send');

    await act(async () => {
      await confirmButton?.onPress?.();
      await Promise.resolve();
    });

    expect(mockTransferToken).toHaveBeenCalledWith(
      'mainnet-koin-contract',
      recipientAddress,
      '1',
      8,
      expect.objectContaining({
        memo: 'Invoice 42',
        onBroadcastAccepted: expect.any(Function),
      })
    );
    expect(mockAddPendingTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({
          to: recipientAddress,
          memo: 'Invoice 42',
        }),
      })
    );
  });

  it('selects a saved recipient from inline chips', async () => {
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
      isInitialized: true,
      cacheKey: `harbinger:${mockAddress}`,
    };
    mockContacts = [
      {
        id: 'alice',
        name: 'Alice',
        address: recipientAddress,
        createdAt: 1,
      },
    ];

    const { SendScreen } = require('../SendScreen');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SendScreen />);
    });

    expect(collectRenderedText(renderer!).join(' ')).toContain('Saved recipients');

    await act(async () => {
      findPressableByText(renderer!, 'Alice').props.onPress();
    });

    const renderedText = collectRenderedText(renderer!).join(' ');
    expect(renderedText).toContain('Alice');
    expect(renderedText).toContain('14eKAY...67Q6');
  });

  it('skips biometric authentication for manual sends when confirmation is turned off', async () => {
    mockIsSendConfirmationRequired.mockResolvedValue(false);
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
      isInitialized: true,
      cacheKey: `harbinger:${mockAddress}`,
    };
    mockTransferToken.mockResolvedValue('0xsend-complete');

    const { SendScreen } = require('../SendScreen');
    const { requireBiometricAuth } = require('../../lib/biometrics');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SendScreen />);
    });

    expect(collectRenderedText(renderer!).join(' ')).toContain('Send biometrics are off');

    const [recipientInput, amountInput] = renderer!.root.findAllByType(TextInput);

    await act(async () => {
      recipientInput.props.onChangeText(recipientAddress);
      amountInput.props.onChangeText('1');
    });

    await act(async () => {
      findSendButton(renderer!).props.onPress();
    });

    const confirmationButtons = alertSpy.mock.calls.at(-1)?.[2];
    const confirmButton = confirmationButtons?.find((button) => button.text === 'Send');

    await act(async () => {
      await confirmButton?.onPress?.();
      await Promise.resolve();
    });

    expect(requireBiometricAuth).not.toHaveBeenCalled();
    expect(mockTransferToken).toHaveBeenCalledWith(
      'mainnet-koin-contract',
      recipientAddress,
      '1',
      8,
      expect.objectContaining({
        onBroadcastAccepted: expect.any(Function),
      })
    );
  });

  it('uses remembered manual transaction authorization while confirmation remains enabled', async () => {
    mockShouldAuthenticateTransaction.mockResolvedValue(false);
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
      isInitialized: true,
      cacheKey: `harbinger:${mockAddress}`,
    };
    mockTransferToken.mockResolvedValue('0xsend-complete');

    const { SendScreen } = require('../SendScreen');
    const { requireBiometricAuth } = require('../../lib/biometrics');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<SendScreen />);
    });

    const [recipientInput, amountInput] = renderer!.root.findAllByType(TextInput);

    await act(async () => {
      recipientInput.props.onChangeText(recipientAddress);
      amountInput.props.onChangeText('1');
    });

    await act(async () => {
      findSendButton(renderer!).props.onPress();
    });

    const confirmationButtons = alertSpy.mock.calls.at(-1)?.[2];
    const confirmButton = confirmationButtons?.find((button) => button.text === 'Send');

    await act(async () => {
      await confirmButton?.onPress?.();
      await Promise.resolve();
    });

    expect(mockShouldAuthenticateTransaction).toHaveBeenCalledWith(mockAddress);
    expect(requireBiometricAuth).not.toHaveBeenCalled();
    expect(mockTransferToken).toHaveBeenCalled();
  });
});
