import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Switch, Text, TouchableOpacity } from 'react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockNavigation = {
  goBack: jest.fn(),
};

const mockApp = {
  id: 'fogata',
  name: 'Fogata',
  description: 'Test dApp',
  url: 'https://fogata.io',
  icon: 'https://fogata.io/icon.png',
  category: 'defi' as const,
  isCurated: true,
};

const mockAccount = {
  id: 'account-1',
  name: 'Primary',
  address: '1PrimaryAddress111111111111111111111111',
  derivationIndex: 0,
  isImported: false,
};

let mockPermissionSnapshot = {
  version: 1 as const,
  grants: {} as Record<string, unknown>,
};

const mockUpsertGrant = jest.fn();
const mockTouchGrant = jest.fn();
const mockRehydrate = jest.fn(async () => undefined);
const injectedScripts: string[] = [];

let latestWebViewProps: Record<string, any> | null = null;
let lastMessageSigningModalProps: Record<string, any> | null = null;
let mockNetworkState = {
  mode: 'mainnet',
  hasHydrated: true,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({
    params: {
      app: mockApp,
    },
  }),
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  const WebView = React.forwardRef((props: Record<string, any>, ref: any) => {
    latestWebViewProps = props;

    React.useImperativeHandle(ref, () => ({
      injectJavaScript: (script: string) => {
        injectedScripts.push(script);
      },
      reload: jest.fn(),
      goBack: jest.fn(),
      goForward: jest.fn(),
    }));

    return React.createElement(View, { testID: 'mock-webview' });
  });

  return { WebView };
});

jest.mock('koilib', () => ({
  Provider: class Provider {
    constructor(_rpcNodes: string[]) {}
  },
  Signer: class Signer {
    static fromWif(_privateKey: string) {
      return new Signer();
    }
  },
  Transaction: class Transaction {
    transaction: Record<string, unknown> = {};
    async prepare() {}
  },
}));

jest.mock('../../components/TransactionApprovalModal', () => ({
  TransactionApprovalModal: () => null,
}));

jest.mock('../../components/DAppMessageSigningModal', () => ({
  DAppMessageSigningModal: (props: Record<string, any>) => {
    lastMessageSigningModalProps = props;
    return null;
  },
}));

jest.mock('../../stores/networkStore', () => ({
  useNetworkStore: (selector?: (state: typeof mockNetworkState) => unknown) =>
    selector ? selector(mockNetworkState) : mockNetworkState,
  getActiveNetworkConfig: () => ({
    chainId: 'mainnet',
    name: 'Mainnet',
    rpcNodes: ['https://rpc.koinos.test'],
    koinContract: '15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL',
    explorer: {
      base: 'https://explorer.koinos.test',
      tx: '/tx/',
      address: '/address/',
      contract: '/contract/',
      block: '/block/',
    },
    rest: {
      history: 'https://rest.koinos.test/history',
      transaction: 'https://rest.koinos.test/tx',
    },
    freeManaSharer: '1FreeManaSharer',
    isTestnet: false,
  }),
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    accounts: [mockAccount],
    address: mockAccount.address,
    getActiveAccount: () => mockAccount,
    activeAccountId: mockAccount.id,
  }),
}));

jest.mock('../../stores/dappPermissionStore', () => {
  const useDAppPermissionStore = (selector?: (state: any) => unknown) => {
    const state = {
      hasHydrated: true,
      upsertGrant: mockUpsertGrant,
      touchGrantLastUsed: mockTouchGrant,
    };
    return selector ? selector(state) : state;
  };

  useDAppPermissionStore.persist = {
    rehydrate: mockRehydrate,
  };

  return {
    useDAppPermissionStore,
    getPermissionStoreSnapshot: () => mockPermissionSnapshot,
  };
});

function flushEffects() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getTextContent(node: TestRenderer.ReactTestInstance): string {
  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
  return children
    .filter((child): child is string | number => typeof child === 'string' || typeof child === 'number')
    .join('');
}

function findButtonByText(
  renderer: TestRenderer.ReactTestRenderer,
  label: string
): TestRenderer.ReactTestInstance {
  const button = renderer.root
    .findAllByType(TouchableOpacity)
    .find((node) => node.findAllByType(Text).some((textNode) => getTextContent(textNode) === label));

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

function parseInjectedResponses() {
  return injectedScripts
    .map((script) => {
      const match = script.match(
        /var resp = (.*?);\s*(?:if \(resp\.__kondorUint8ArrayResult\)|if \(window\.__kondorMobileResponse\))/s
      );
      if (!match) {
        return null;
      }

      const response = JSON.parse(match[1]);
      delete response.__kondorUint8ArrayResult;
      return response;
    })
    .filter(Boolean);
}

async function renderScreen() {
  const { DAppWebViewScreen } = require('../DAppWebViewScreen');
  let renderer: TestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(React.createElement(DAppWebViewScreen));
  });
  await flushEffects();

  return renderer!;
}

function emitGetAccounts() {
  return emitCommand('request-1', 'getAccounts', {});
}

function emitCommand(id: string, command: string, args: Record<string, unknown>) {
  if (!latestWebViewProps?.onMessage) {
    throw new Error('WebView onMessage handler missing');
  }

  return latestWebViewProps.onMessage({
    nativeEvent: {
      data: JSON.stringify({
        type: 'kondor',
        id,
        command,
        args,
      }),
    },
  });
}

function navigateWebView(url: string) {
  if (!latestWebViewProps?.onNavigationStateChange) {
    throw new Error('WebView onNavigationStateChange handler missing');
  }

  act(() => {
    latestWebViewProps!.onNavigationStateChange({
      url,
      canGoBack: false,
      canGoForward: false,
    });
  });
}

describe('DAppWebViewScreen provider sendTransaction guard', () => {
  it('rejects broadcasts unless the dApp explicitly requests a non-broadcast dry run', async () => {
    const mockSendTransaction = jest.fn(async () => ({ receipt: 'should-not-send' }));
    const { handleWebViewProviderSendTransaction } = require('../dappWebViewProviderGuards');

    await expect(
      handleWebViewProviderSendTransaction(
        { sendTransaction: mockSendTransaction },
        { transaction: { operations: [] } }
      )
    ).rejects.toThrow(/approval|required|unsupported/i);

    await expect(
      handleWebViewProviderSendTransaction(
        { sendTransaction: mockSendTransaction },
        { transaction: { operations: [] }, broadcast: true }
      )
    ).rejects.toThrow(/approval|required|unsupported/i);

    expect(mockSendTransaction).not.toHaveBeenCalled();

    mockSendTransaction.mockResolvedValueOnce({ receipt: 'dry-run' });

    await expect(
      handleWebViewProviderSendTransaction(
        { sendTransaction: mockSendTransaction },
        { transaction: { operations: [] }, broadcast: false }
      )
    ).resolves.toEqual({ receipt: 'dry-run' });

    expect(mockSendTransaction).toHaveBeenCalledTimes(1);
    expect(mockSendTransaction).toHaveBeenCalledWith({ operations: [] }, false);
  });
});

describe('DAppWebViewScreen generic RPC guards', () => {
  it('allows only safe read-only provider.call RPC methods', async () => {
    const mockCall = jest.fn(async () => ({ head_topology: { id: '0xabc' } }));
    const { handleWebViewProviderCall } = require('../dappWebViewProviderGuards');

    await expect(
      handleWebViewProviderCall(
        { call: mockCall },
        { method: 'chain.get_head_info', params: { payload: 'ok' } }
      )
    ).resolves.toEqual({ head_topology: { id: '0xabc' } });

    expect(mockCall).toHaveBeenCalledWith('chain.get_head_info', { payload: 'ok' });
  });

  it('rejects mutating provider.call RPC methods and never executes them', async () => {
    const mockCall = jest.fn(async () => ({ receipt: 'should-not-run' }));
    const { handleWebViewProviderCall } = require('../dappWebViewProviderGuards');

    await expect(
      handleWebViewProviderCall(
        { call: mockCall },
        { method: 'chain.submit_transaction', params: { transaction: { operations: [] } } }
      )
    ).rejects.toThrow(/read-only|approval|required|unsupported/i);

    expect(mockCall).not.toHaveBeenCalled();
  });

  it('rejects provider.submitBlock instead of executing it in the background', async () => {
    const mockSubmitBlock = jest.fn(async () => ({ receipt: 'should-not-run' }));
    const { handleWebViewProviderSubmitBlock } = require('../dappWebViewProviderGuards');

    await expect(
      handleWebViewProviderSubmitBlock({ submitBlock: mockSubmitBlock }, { block: { header: {} } })
    ).rejects.toThrow(/approval|required|unsupported/i);

    expect(mockSubmitBlock).not.toHaveBeenCalled();
  });
});

describe('DAppWebViewScreen getAccounts grants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockPermissionSnapshot = {
      version: 1,
      grants: {},
    };
    latestWebViewProps = null;
    lastMessageSigningModalProps = null;
    injectedScripts.length = 0;
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: true,
    };
  });

  it('touches an existing auto-connect grant and returns accounts', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_750_000_123_456);
    mockPermissionSnapshot = {
      version: 1,
      grants: {
        'https://fogata.io': {
          version: 1,
          origin: 'https://fogata.io',
          hostname: 'fogata.io',
          accounts: [mockAccount.address],
          capabilities: [{ method: 'getAccounts', caveats: [] }],
          lifetime: 'persistent',
          riskAtGrant: 'trusted',
          createdAt: 1_750_000_000_000,
          lastUsedAt: 1_750_000_000_000,
        },
      },
    };

    await renderScreen();

    await act(async () => {
      await emitGetAccounts();
    });
    await flushEffects();

    expect(mockTouchGrant).toHaveBeenCalledWith('https://fogata.io', 1_750_000_123_456);
    expect(mockUpsertGrant).not.toHaveBeenCalled();

    expect(parseInjectedResponses()).toEqual([
      {
        type: 'kondor-response',
        id: 'request-1',
        result: [
          {
            name: mockAccount.name,
            address: mockAccount.address,
            signers: [],
          },
        ],
      },
    ]);
  });

  it('stores a session grant when the user declines remember-site', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_750_000_223_456);

    const renderer = await renderScreen();

    act(() => {
      void emitGetAccounts();
    });
    await flushEffects();

    const rememberSwitch = renderer.root.findByType(Switch);
    act(() => {
      rememberSwitch.props.onValueChange(false);
    });

    await act(async () => {
      findButtonByText(renderer, 'Connect').props.onPress();
    });
    await flushEffects();

    expect(mockUpsertGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'https://fogata.io',
        lifetime: 'session',
        accounts: [mockAccount.address],
        createdAt: 1_750_000_223_456,
        lastUsedAt: 1_750_000_223_456,
      })
    );
    expect(mockTouchGrant).not.toHaveBeenCalled();

    expect(parseInjectedResponses()).toEqual([
      {
        type: 'kondor-response',
        id: 'request-1',
        result: [
          {
            name: mockAccount.name,
            address: mockAccount.address,
            signers: [],
          },
        ],
      },
    ]);
  });

  it('stores a persistent grant when remember-site stays enabled', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_750_000_323_456);

    const renderer = await renderScreen();

    act(() => {
      void emitGetAccounts();
    });
    await flushEffects();

    await act(async () => {
      findButtonByText(renderer, 'Connect').props.onPress();
    });
    await flushEffects();

    expect(mockUpsertGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'https://fogata.io',
        lifetime: 'persistent',
        accounts: [mockAccount.address],
        createdAt: 1_750_000_323_456,
        lastUsedAt: 1_750_000_323_456,
      })
    );
  });

  it('rejects a pending approval if the WebView navigates to a different origin before approval', async () => {
    const renderer = await renderScreen();

    act(() => {
      void emitGetAccounts();
    });
    await flushEffects();

    const staleConnect = findButtonByText(renderer, 'Connect').props.onPress;

    navigateWebView('https://evil.example/path');
    await flushEffects();

    expect(renderer.root.findAllByType(Switch)).toHaveLength(0);

    await act(async () => {
      staleConnect();
    });
    await flushEffects();

    expect(mockUpsertGrant).not.toHaveBeenCalled();
    expect(mockTouchGrant).not.toHaveBeenCalled();

    expect(parseInjectedResponses()).toEqual([
      {
        type: 'kondor-response',
        id: 'request-1',
        error: 'Navigation changed before account access was approved',
      },
    ]);
  });

  it('opens a signing modal for signer:signMessage and returns the approved signature', async () => {
    await renderScreen();

    act(() => {
      void emitCommand('sign-message-1', 'signer:signMessage', {
        signerAddress: mockAccount.address,
        message: 'hello from fogata',
      });
    });
    await flushEffects();

    expect(lastMessageSigningModalProps).toEqual(
      expect.objectContaining({
        visible: true,
        request: expect.objectContaining({
          signerAddress: mockAccount.address,
          kind: 'message',
          message: 'hello from fogata',
        }),
      })
    );

    act(() => {
      lastMessageSigningModalProps?.onApprove('signed-message-base64url');
    });
    await flushEffects();

    expect(parseInjectedResponses()).toEqual([
      {
        type: 'kondor-response',
        id: 'sign-message-1',
        result: 'signed-message-base64url',
      },
    ]);
  });

  it('rejects a pending signing approval if the WebView navigates away before approval', async () => {
    await renderScreen();

    act(() => {
      void emitCommand('sign-hash-1', 'signer:signHash', {
        signerAddress: mockAccount.address,
        hash: Array.from({ length: 32 }, (_, index) => index),
      });
    });
    await flushEffects();

    navigateWebView('https://evil.example/path');
    await flushEffects();

    act(() => {
      lastMessageSigningModalProps?.onApprove(new Uint8Array([1, 2, 3]));
    });
    await flushEffects();

    expect(parseInjectedResponses()).toEqual([
      {
        type: 'kondor-response',
        id: 'sign-hash-1',
        error: 'Navigation changed before signing was approved',
      },
    ]);
  });

  it('emits exactly one rejection response when the signing modal reject flow closes', async () => {
    await renderScreen();

    act(() => {
      void emitCommand('sign-message-2', 'signer:signMessage', {
        signerAddress: mockAccount.address,
        message: 'reject me once',
      });
    });
    await flushEffects();

    act(() => {
      lastMessageSigningModalProps?.onReject('User rejected the message signing request');
      lastMessageSigningModalProps?.onClose?.();
    });
    await flushEffects();

    expect(parseInjectedResponses()).toEqual([
      {
        type: 'kondor-response',
        id: 'sign-message-2',
        error: 'User rejected the message signing request',
      },
    ]);
  });
});
