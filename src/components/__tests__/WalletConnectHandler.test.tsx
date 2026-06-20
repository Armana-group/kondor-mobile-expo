import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MAINNET, TESTNET } from '../../lib/constants';

const mockMainnetConfig = MAINNET;
const mockTestnetConfig = TESTNET;
const mockProvider = jest.fn();
const mockInitialize = jest.fn(async () => undefined);
const mockApproveSession = jest.fn(async () => undefined);
const mockRejectSession = jest.fn(async () => undefined);
const mockRespondToRequest = jest.fn(async () => undefined);
const mockRejectRequest = jest.fn(async () => undefined);
const mockClearPendingTransaction = jest.fn();
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
    SignAndSendTransaction: 'koinos_signAndSendTransaction',
  },
  WALLETCONNECT_NETWORK_MISMATCH_ERROR:
    'WalletConnect session no longer matches the active network',
  WALLETCONNECT_NETWORK_NOT_READY_ERROR:
    'WalletConnect is waiting for the active network to finish loading',
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
  }

  class Transaction {}
  class Signer {}

  return {
    Provider,
    Transaction,
    Signer,
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
    lastTransactionApprovalModalProps = null;
    lastSessionApprovalModalProps = null;
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: true,
    };
    mockWalletConnectState = {
      initialized: true,
      initialize: mockInitialize,
      pendingProposal: null,
      pendingTransaction: null,
      pendingRequest: null,
      approveSession: mockApproveSession,
      rejectSession: mockRejectSession,
      respondToRequest: mockRespondToRequest,
      rejectRequest: mockRejectRequest,
      clearPendingTransaction: mockClearPendingTransaction,
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
