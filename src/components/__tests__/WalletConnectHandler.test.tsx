import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MAINNET, TESTNET } from '../../lib/constants';

const mockMainnetConfig = MAINNET;
const mockTestnetConfig = TESTNET;
const mockProvider = jest.fn();
const mockProviderCall = jest.fn();
const mockProviderSendTransaction = jest.fn();
const mockProviderGetNonce = jest.fn();
const mockProviderGetNextNonce = jest.fn();
const mockInitialize = jest.fn(async () => undefined);
const mockApproveSession = jest.fn(async () => undefined);
const mockRejectSession = jest.fn(async () => undefined);
const mockRespondToRequest = jest.fn(async () => undefined);
const mockRejectRequest = jest.fn(async () => undefined);
const mockClearPendingTransaction = jest.fn();
const mockClearPendingSigningRequest = jest.fn();
const mockReconcileSessionsForActiveNetwork = jest.fn(async () => undefined);
const mockIsSessionTopicApprovedForActiveNetwork = jest.fn(() => true);
const mockGetSessionTopicValidationForActiveNetwork = jest.fn<
  { status: string; message?: string },
  [string]
>(() => ({
  status: 'ready',
}));

let lastTransactionApprovalModalProps: any = null;
let lastSessionApprovalModalProps: any = null;
let lastMessageSigningModalProps: any = null;

let mockNetworkState = {
  mode: 'mainnet',
  hasHydrated: true,
};

let mockWalletConnectState: any = {};

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    address: '1WalletAddress',
    activeAccountId: 'account-1',
    isWalletCreated: true,
  }),
}));

jest.mock('../../stores/networkStore', () => ({
  useNetworkStore: (selector?: (state: typeof mockNetworkState) => unknown) =>
    selector ? selector(mockNetworkState) : mockNetworkState,
  getActiveNetworkConfig: () => (
    mockNetworkState.mode === 'harbinger' ? mockTestnetConfig : mockMainnetConfig
  ),
}));

jest.mock('../../stores/walletConnectStore', () => ({
  KOINOS_METHODS: {
    GetHeadInfo: 'koinos_getHeadInfo',
    GetNonce: 'koinos_getNonce',
    GetNextNonce: 'koinos_getNextNonce',
    JsonRpcCall: 'koinos_JsonRpcCall',
    SendTransaction: 'koinos_sendTransaction',
    SignMessage: 'koinos_signMessage',
    SignHash: 'koinos_signHash',
    SignAndSendTransaction: 'koinos_signAndSendTransaction',
  },
  WALLETCONNECT_NETWORK_MISMATCH_ERROR:
    'WalletConnect session no longer matches the active network',
  WALLETCONNECT_NETWORK_NOT_READY_ERROR:
    'WalletConnect is waiting for the active network to finish loading',
  WALLETCONNECT_SEND_TRANSACTION_UNSUPPORTED_ERROR:
    'WalletConnect transaction broadcasting requires manual approval. Use koinos_signAndSendTransaction instead.',
  useWalletConnectStore: () => mockWalletConnectState,
}));

jest.mock('../../components/WCSessionApprovalModal', () => ({
  WCSessionApprovalModal: (props: any) => {
    lastSessionApprovalModalProps = props;
    return null;
  },
}));

jest.mock('../../components/TransactionApprovalModal', () => ({
  TransactionApprovalModal: (props: any) => {
    lastTransactionApprovalModalProps = props;
    return null;
  },
}));

jest.mock('../../components/DAppMessageSigningModal', () => ({
  DAppMessageSigningModal: (props: any) => {
    lastMessageSigningModalProps = props;
    return null;
  },
}));

jest.mock('../../lib/biometrics', () => ({
  requireBiometricAuth: jest.fn(async () => true),
}));

jest.mock('../../lib/haptics', () => ({
  HapticFeedback: {
    success: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  wcLogger: {
    error: jest.fn(),
    debug: jest.fn(),
  },
  sanitizeErrorForUser: jest.fn((_error: unknown, fallback: string) => fallback),
}));

jest.mock('koilib', () => {
  class Provider {
    rpcNodes: string[];

    constructor(rpcNodes: string[]) {
      this.rpcNodes = rpcNodes;
      mockProvider(rpcNodes);
    }

    async getHeadInfo() {
      return { head_topology: { height: '1' } };
    }

    async call(method: string, params: unknown) {
      return mockProviderCall(method, params);
    }

    async getNonce(address: string) {
      return mockProviderGetNonce(address);
    }

    async getNextNonce(address: string) {
      return mockProviderGetNextNonce(address);
    }

    async sendTransaction(transaction: unknown, broadcast: boolean) {
      return mockProviderSendTransaction(transaction, broadcast);
    }
  }

  class Transaction {}
  class Signer {}
  const utils = {
    encodeBase64: (bytes: Uint8Array) => Buffer.from(bytes).toString('base64'),
    decodeBase64url: (value: string) =>
      new Uint8Array(
        Buffer.from(
          value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='),
          'base64'
        )
      ),
  };

  return {
    Provider,
    Transaction,
    Signer,
    utils,
  };
});

function flushEffects() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('WalletConnectHandler network reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProviderCall.mockReset();
    mockProviderGetNonce.mockReset();
    mockProviderGetNextNonce.mockReset();
    mockIsSessionTopicApprovedForActiveNetwork.mockReset().mockReturnValue(true);
    mockGetSessionTopicValidationForActiveNetwork.mockReset().mockReturnValue({
      status: 'ready',
    });
    lastTransactionApprovalModalProps = null;
    lastSessionApprovalModalProps = null;
    lastMessageSigningModalProps = null;
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: true,
    };
    mockWalletConnectState = {
      initialized: true,
      initialize: mockInitialize,
      pendingProposal: null,
      pendingTransaction: null,
      pendingSigningRequest: null,
      pendingRequest: null,
      approveSession: mockApproveSession,
      rejectSession: mockRejectSession,
      respondToRequest: mockRespondToRequest,
      rejectRequest: mockRejectRequest,
      clearPendingTransaction: mockClearPendingTransaction,
      clearPendingSigningRequest: mockClearPendingSigningRequest,
      reconcileSessionsForActiveNetwork: mockReconcileSessionsForActiveNetwork,
      isSessionTopicApprovedForActiveNetwork: mockIsSessionTopicApprovedForActiveNetwork,
      getSessionTopicValidationForActiveNetwork: mockGetSessionTopicValidationForActiveNetwork,
    };
  });

  it('reconciles existing sessions when the active network changes', async () => {
    const { WalletConnectHandler } = require('../WalletConnectHandler');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(mockReconcileSessionsForActiveNetwork).toHaveBeenCalledTimes(1);

    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: true,
    };

    await act(async () => {
      renderer!.update(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(mockReconcileSessionsForActiveNetwork).toHaveBeenCalledTimes(2);
  });

  it('rejects generic requests for sessions that no longer match the active network', async () => {
    mockIsSessionTopicApprovedForActiveNetwork.mockReturnValue(false);
    mockGetSessionTopicValidationForActiveNetwork.mockReturnValue({
      status: 'reject',
      message: 'WalletConnect session no longer matches the active network',
    });
    mockWalletConnectState = {
      ...mockWalletConnectState,
      pendingRequest: {
        id: 9,
        topic: 'stale-topic',
        method: 'koinos_getHeadInfo',
        params: {},
        peerMeta: {
          name: 'Old Session dApp',
          url: 'https://old-session.example.com',
        },
      },
    };

    const { WalletConnectHandler } = require('../WalletConnectHandler');

    await act(async () => {
      TestRenderer.create(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(mockRejectRequest).toHaveBeenCalledWith(
      9,
      'stale-topic',
      expect.stringMatching(/active network/i)
    );
    expect(mockRespondToRequest).not.toHaveBeenCalled();
    expect(mockProvider).not.toHaveBeenCalled();
  });

  it('rejects koinos_sendTransaction requests instead of auto-broadcasting them', async () => {
    mockProviderSendTransaction.mockResolvedValue({ receipt: 'should-not-broadcast' });
    mockWalletConnectState = {
      ...mockWalletConnectState,
      pendingRequest: {
        id: 27,
        topic: 'send-topic',
        method: 'koinos_sendTransaction',
        params: {
          transaction: {
            operations: [],
          },
        },
        peerMeta: {
          name: 'Broadcast dApp',
          url: 'https://broadcast.example.com',
        },
      },
    };

    const { WalletConnectHandler } = require('../WalletConnectHandler');

    await act(async () => {
      TestRenderer.create(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(mockRejectRequest).toHaveBeenCalledWith(
      27,
      'send-topic',
      expect.stringMatching(/manual approval|required/i)
    );
    expect(mockRespondToRequest).not.toHaveBeenCalled();
    expect(mockProviderSendTransaction).not.toHaveBeenCalled();
  });

  it('routes koinos_getNextNonce to provider.getNextNonce', async () => {
    mockProviderGetNextNonce.mockResolvedValue({ nonce: '0x11' });
    mockWalletConnectState = {
      ...mockWalletConnectState,
      pendingRequest: {
        id: 31,
        topic: 'next-nonce-topic',
        method: 'koinos_getNextNonce',
        params: {
          address: '1WalletAddress',
        },
        peerMeta: {
          name: 'Nonce dApp',
          url: 'https://nonce.example.com',
        },
      },
    };

    const { WalletConnectHandler } = require('../WalletConnectHandler');

    await act(async () => {
      TestRenderer.create(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(mockProviderGetNextNonce).toHaveBeenCalledWith('1WalletAddress');
    expect(mockProviderGetNonce).not.toHaveBeenCalled();
    expect(mockRespondToRequest).toHaveBeenCalledWith(
      31,
      'next-nonce-topic',
      { nonce: '0x11' }
    );
  });

  it('rejects koinos_JsonRpcCall requests instead of executing passthrough RPC methods', async () => {
    mockProviderCall.mockResolvedValue({ receipt: 'should-not-run' });
    mockWalletConnectState = {
      ...mockWalletConnectState,
      pendingRequest: {
        id: 33,
        topic: 'rpc-topic',
        method: 'koinos_JsonRpcCall',
        params: {
          method: 'chain.submit_transaction',
          params: { transaction: { operations: [] } },
        },
        peerMeta: {
          name: 'RPC dApp',
          url: 'https://rpc.example.com',
        },
      },
    };

    const { WalletConnectHandler } = require('../WalletConnectHandler');

    await act(async () => {
      TestRenderer.create(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(mockRejectRequest).toHaveBeenCalledWith(
      33,
      'rpc-topic',
      expect.stringMatching(/read-only|approval|required|unsupported/i)
    );
    expect(mockRespondToRequest).not.toHaveBeenCalled();
    expect(mockProviderCall).not.toHaveBeenCalled();
  });

  it('keeps transaction approval hidden until hydration completes and rejects stale topics before showing it', async () => {
    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: false,
    };
    mockGetSessionTopicValidationForActiveNetwork.mockReturnValueOnce({
      status: 'defer',
      message: 'WalletConnect is waiting for the active network to finish loading',
    });
    mockGetSessionTopicValidationForActiveNetwork.mockReturnValue({
      status: 'reject',
      message: 'WalletConnect session no longer matches the active network',
    });
    mockWalletConnectState = {
      ...mockWalletConnectState,
      pendingTransaction: {
        id: 12,
        topic: 'stale-topic',
        method: 'koinos_signAndSendTransaction',
        transaction: { operations: [] },
        signerAddress: '1WalletAddress',
        peerMeta: {
          name: 'Old Session dApp',
          url: 'https://old-session.example.com',
        },
      },
    };

    const { WalletConnectHandler } = require('../WalletConnectHandler');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(lastTransactionApprovalModalProps?.visible).toBe(false);
    expect(mockRejectRequest).not.toHaveBeenCalled();

    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: true,
    };

    await act(async () => {
      renderer!.update(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(mockRejectRequest).toHaveBeenCalledWith(
      12,
      'stale-topic',
      expect.stringMatching(/active network/i)
    );
    expect(lastTransactionApprovalModalProps?.visible).toBe(false);
  });

  it('opens a signing modal for pending koinos_signMessage requests and responds with WalletConnect base64', async () => {
    mockWalletConnectState = {
      ...mockWalletConnectState,
      pendingSigningRequest: {
        id: 41,
        topic: 'sign-topic',
        method: 'koinos_signMessage',
        signerAddress: '1WalletAddress',
        message: 'hello walletconnect',
        peerMeta: {
          name: 'Signer dApp',
          url: 'https://sign.example.com',
        },
      },
    };

    const { WalletConnectHandler } = require('../WalletConnectHandler');

    await act(async () => {
      TestRenderer.create(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(lastMessageSigningModalProps).toEqual(
      expect.objectContaining({
        visible: true,
        request: expect.objectContaining({
          signerAddress: '1WalletAddress',
          kind: 'message',
          message: 'hello walletconnect',
        }),
      })
    );

    await act(async () => {
      await lastMessageSigningModalProps.onApprove('-_8');
    });
    await flushEffects();

    expect(mockRespondToRequest).toHaveBeenCalledWith(41, 'sign-topic', '+/8=');
    expect(mockClearPendingSigningRequest).toHaveBeenCalled();
  });

  it('revalidates deferred signing requests after hydration completes', async () => {
    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: false,
    };
    mockGetSessionTopicValidationForActiveNetwork.mockReturnValueOnce({
      status: 'defer',
      message: 'WalletConnect is waiting for the active network to finish loading',
    });
    mockGetSessionTopicValidationForActiveNetwork.mockReturnValue({
      status: 'ready',
    });
    mockWalletConnectState = {
      ...mockWalletConnectState,
      pendingSigningRequest: {
        id: 42,
        topic: 'deferred-sign-topic',
        method: 'koinos_signMessage',
        signerAddress: '1WalletAddress',
        message: 'hello after hydration',
        peerMeta: {
          name: 'Deferred Signer dApp',
          url: 'https://deferred-sign.example.com',
        },
      },
    };

    const { WalletConnectHandler } = require('../WalletConnectHandler');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(lastMessageSigningModalProps?.visible).toBe(false);
    expect(mockRejectRequest).not.toHaveBeenCalled();

    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: true,
    };

    await act(async () => {
      renderer!.update(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(lastMessageSigningModalProps).toEqual(
      expect.objectContaining({
        visible: true,
        request: expect.objectContaining({
          signerAddress: '1WalletAddress',
          kind: 'message',
          message: 'hello after hydration',
        }),
      })
    );
    expect(mockRejectRequest).not.toHaveBeenCalled();
  });

  it('keeps session approval hidden until hydration completes even when a proposal is pending', async () => {
    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: false,
    };
    mockWalletConnectState = {
      ...mockWalletConnectState,
      pendingProposal: {
        id: 44,
        params: {
          requiredNamespaces: {
            koinos: {
              chains: ['koinos:EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3e'],
              methods: [],
              events: [],
            },
          },
        },
        peerMeta: {
          name: 'Pending dApp',
          description: 'Pending approval',
          url: 'https://pending.example.com',
          icons: [],
        },
      },
    };

    const { WalletConnectHandler } = require('../WalletConnectHandler');

    await act(async () => {
      TestRenderer.create(<WalletConnectHandler />);
    });
    await flushEffects();

    expect(lastSessionApprovalModalProps?.visible).toBe(false);
    expect(mockApproveSession).not.toHaveBeenCalled();
  });
});
