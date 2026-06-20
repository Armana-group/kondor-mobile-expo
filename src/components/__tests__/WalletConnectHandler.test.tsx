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
  useWalletConnectStore: () => mockWalletConnectState,
}));

jest.mock('../../components/WCSessionApprovalModal', () => ({
  WCSessionApprovalModal: () => null,
}));

jest.mock('../../components/TransactionApprovalModal', () => ({
  TransactionApprovalModal: () => null,
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
});
