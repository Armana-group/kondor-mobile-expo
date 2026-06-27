/**
 * WalletConnect Store
 *
 * Manages WalletConnect v2 sessions and handles incoming requests
 * from dApps that connect via WalletConnect protocol.
 *
 * IMPORTANT: @walletconnect/react-native-compat MUST be imported at the
 * very top of the app entry point (index.ts) BEFORE any other imports.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TransactionJson } from 'koilib';
import { Core } from '@walletconnect/core';
import { WalletKit } from '@reown/walletkit';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import { wcLogger } from '../lib/logger';
import { useNetworkStore } from './networkStore';

// WalletConnect feature flag
const WALLETCONNECT_ENABLED = true;

// Koinos chain IDs from @armana/walletconnect-koinos-sdk-js
export const KOINOS_CHAIN_IDS = {
  Mainnet: 'koinos:EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3e',
  Harbinger: 'koinos:EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9l',
} as const;

function getActiveWalletConnectChainId() {
  const { mode, hasHydrated } = useNetworkStore.getState();
  const activeMode = hasHydrated ? mode : 'mainnet';
  return activeMode === 'harbinger'
    ? KOINOS_CHAIN_IDS.Harbinger
    : KOINOS_CHAIN_IDS.Mainnet;
}

export const WALLETCONNECT_NETWORK_MISMATCH_ERROR =
  'WalletConnect session no longer matches the active network';
export const WALLETCONNECT_NETWORK_NOT_READY_ERROR =
  'WalletConnect is waiting for the active network to finish loading';
export const WALLETCONNECT_SEND_TRANSACTION_UNSUPPORTED_ERROR =
  'WalletConnect transaction broadcasting requires manual approval. Use koinos_signAndSendTransaction instead.';

type WalletConnectTopicValidation =
  | { status: 'ready' }
  | { status: 'defer'; message: string }
  | { status: 'reject'; message: string };

function getSessionChains(session: any): string[] {
  return Object.values(session?.namespaces || {}).flatMap(
    (namespace: any) => namespace?.chains || []
  );
}

function getSessionAccounts(session: any): string[] {
  return Object.values(session?.namespaces || {}).flatMap(
    (namespace: any) => namespace?.accounts || []
  );
}

function sessionMatchesChain(session: any, activeChainId: string): boolean {
  const chains = getSessionChains(session);
  const accounts = getSessionAccounts(session);

  return (
    chains.includes(activeChainId) &&
    accounts.some((account: string) => account.startsWith(`${activeChainId}:`))
  );
}

// Koinos methods from @armana/walletconnect-koinos-sdk-js
export const KOINOS_METHODS = {
  SignMessage: 'koinos_signMessage',
  SignHash: 'koinos_signHash',
  SignTransaction: 'koinos_signTransaction',
  SignAndSendTransaction: 'koinos_signAndSendTransaction',
  PrepareTransaction: 'koinos_prepareTransaction',
  WaitForTransaction: 'koinos_waitForTransaction',
  JsonRpcCall: 'koinos_JsonRpcCall',
  GetNonce: 'koinos_getNonce',
  GetNextNonce: 'koinos_getNextNonce',
  GetAccountRc: 'koinos_getAccountRc',
  GetTransactionsById: 'koinos_getTransactionsById',
  GetBlocksById: 'koinos_getBlocksById',
  GetHeadInfo: 'koinos_getHeadInfo',
  GetChainId: 'koinos_getChainId',
  GetBlocks: 'koinos_getBlocks',
  GetBlock: 'koinos_getBlock',
  SendTransaction: 'koinos_sendTransaction',
  ReadContract: 'koinos_readContract',
  SubmitBlock: 'koinos_submitBlock',
} as const;

// Methods we can honestly advertise during session approval.
const APPROVED_METHODS: string[] = [
  KOINOS_METHODS.SignMessage,
  KOINOS_METHODS.SignHash,
  KOINOS_METHODS.SignTransaction,
  KOINOS_METHODS.SignAndSendTransaction,
  KOINOS_METHODS.PrepareTransaction,
  KOINOS_METHODS.WaitForTransaction,
  KOINOS_METHODS.GetNonce,
  KOINOS_METHODS.GetNextNonce,
  KOINOS_METHODS.GetAccountRc,
  KOINOS_METHODS.GetTransactionsById,
  KOINOS_METHODS.GetBlocksById,
  KOINOS_METHODS.GetHeadInfo,
  KOINOS_METHODS.GetChainId,
  KOINOS_METHODS.GetBlocks,
  KOINOS_METHODS.GetBlock,
  KOINOS_METHODS.ReadContract,
];

// Events (none for now, but required by WalletConnect)
const SUPPORTED_EVENTS: string[] = [];

// WalletConnect Project ID from https://cloud.walletconnect.com
// Set via EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID in .env
const WALLETCONNECT_PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

// Session info for display
export interface WCSession {
  topic: string;
  peerMeta: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  chains: string[];
  connectedAt: number;
}

// Pending session proposal
export interface WCSessionProposal {
  id: number;
  params: any; // WalletKitTypes.SessionProposal['params'] - disabled for now
  peerMeta: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
}

// Pending request from dApp
export interface WCPendingRequest {
  id: number;
  topic: string;
  method: string;
  params: unknown;
  peerMeta: {
    name: string;
    url: string;
  };
}

// Transaction signing request
export interface WCTransactionRequest {
  id: number;
  topic: string;
  method: string;
  transaction: TransactionJson;
  signerAddress: string;
  peerMeta: {
    name: string;
    url: string;
  };
}

export interface WCSigningRequest {
  id: number;
  topic: string;
  method: typeof KOINOS_METHODS.SignMessage | typeof KOINOS_METHODS.SignHash;
  signerAddress: string;
  message?: unknown;
  hash?: unknown;
  peerMeta: {
    name: string;
    url: string;
  };
}

interface WalletConnectState {
  // State
  initialized: boolean;
  sessions: WCSession[];
  pendingProposal: WCSessionProposal | null;
  pendingRequest: WCPendingRequest | null;
  pendingTransaction: WCTransactionRequest | null;
  pendingSigningRequest: WCSigningRequest | null;

  // Actions
  initialize: (address: string) => Promise<void>;
  pair: (uri: string) => Promise<void>;
  approveSession: (address: string) => Promise<void>;
  rejectSession: () => Promise<void>;
  disconnectSession: (topic: string) => Promise<void>;
  disconnectAll: () => Promise<void>;
  respondToRequest: (id: number, topic: string, result: unknown) => Promise<void>;
  rejectRequest: (id: number, topic: string, message?: string) => Promise<void>;
  clearPendingTransaction: () => void;
  clearPendingSigningRequest: () => void;

  // Internal (using any for WalletKit since it's dynamically imported)
  _walletKit: any | null;
  _setWalletKit: (kit: any | null) => void;
  _setPendingProposal: (proposal: WCSessionProposal | null) => void;
  _setPendingRequest: (request: WCPendingRequest | null) => void;
  _setPendingTransaction: (request: WCTransactionRequest | null) => void;
  _setPendingSigningRequest: (request: WCSigningRequest | null) => void;
  _updateSessions: () => void;
  isSessionTopicApprovedForActiveNetwork: (topic: string) => boolean;
  getSessionTopicValidationForActiveNetwork: (topic: string) => WalletConnectTopicValidation;
  reconcileSessionsForActiveNetwork: () => Promise<void>;
}

export const useWalletConnectStore = create<WalletConnectState>()(
  persist(
    (set, get) => ({
      initialized: false,
      sessions: [],
      pendingProposal: null,
      pendingRequest: null,
      pendingTransaction: null,
      pendingSigningRequest: null,
      _walletKit: null,

      _setWalletKit: (kit) => set({ _walletKit: kit }),

      _setPendingProposal: (proposal) => set({ pendingProposal: proposal }),

      _setPendingRequest: (request) => set({ pendingRequest: request }),

      _setPendingTransaction: (request) => set({ pendingTransaction: request }),

      _setPendingSigningRequest: (request) => set({ pendingSigningRequest: request }),

      clearPendingTransaction: () => set({ pendingTransaction: null }),

      clearPendingSigningRequest: () => set({ pendingSigningRequest: null }),

      _updateSessions: () => {
        const { _walletKit } = get();
        if (!_walletKit) {
          set({ sessions: [] });
          return;
        }

        try {
          const activeSessions = _walletKit.getActiveSessions();
          const sessions: WCSession[] = Object.values(activeSessions).map((session: any) => ({
            topic: session.topic,
            peerMeta: {
              name: session.peer.metadata.name,
              description: session.peer.metadata.description,
              url: session.peer.metadata.url,
              icons: session.peer.metadata.icons,
            },
            chains: Object.keys(session.namespaces).flatMap(
              (ns: string) => session.namespaces[ns].chains || []
            ),
            connectedAt: session.expiry * 1000 - 7 * 24 * 60 * 60 * 1000, // Approximate
          }));
          set({ sessions });
        } catch (error) {
          wcLogger.error('Failed to update sessions:', error);
        }
      },

      isSessionTopicApprovedForActiveNetwork: (topic: string) => {
        return get().getSessionTopicValidationForActiveNetwork(topic).status === 'ready';
      },

      getSessionTopicValidationForActiveNetwork: (topic: string) => {
        const { hasHydrated } = useNetworkStore.getState();
        if (!hasHydrated) {
          return {
            status: 'defer',
            message: WALLETCONNECT_NETWORK_NOT_READY_ERROR,
          };
        }

        const { _walletKit } = get();
        if (!_walletKit) {
          return {
            status: 'reject',
            message: 'WalletConnect session is no longer available',
          };
        }

        const session = _walletKit.getActiveSessions()?.[topic];
        if (!session) {
          return {
            status: 'reject',
            message: 'WalletConnect session is no longer available',
          };
        }

        if (!sessionMatchesChain(session, getActiveWalletConnectChainId())) {
          return {
            status: 'reject',
            message: WALLETCONNECT_NETWORK_MISMATCH_ERROR,
          };
        }

        return { status: 'ready' };
      },

      reconcileSessionsForActiveNetwork: async () => {
        const { _walletKit, pendingRequest, pendingTransaction, pendingSigningRequest } = get();
        if (!_walletKit) {
          set({ sessions: [] });
          return;
        }

        const activeChainId = getActiveWalletConnectChainId();
        const activeSessions = _walletKit.getActiveSessions();
        const mismatchedTopics = Object.entries(activeSessions)
          .filter(([, session]) => !sessionMatchesChain(session, activeChainId))
          .map(([topic]) => topic);

        if (!mismatchedTopics.length) {
          get()._updateSessions();
          return;
        }

        wcLogger.debug('Disconnecting sessions that no longer match the active network', {
          activeChainId,
          mismatchedTopics,
        });

        for (const topic of mismatchedTopics) {
          try {
            await _walletKit.disconnectSession({
              topic,
              reason: getSdkError('USER_DISCONNECTED'),
            });
          } catch (error) {
            wcLogger.error('Failed to reconcile WalletConnect session:', error);
          }
        }

        set({
          pendingRequest:
            pendingRequest && mismatchedTopics.includes(pendingRequest.topic) ? null : pendingRequest,
          pendingTransaction:
            pendingTransaction && mismatchedTopics.includes(pendingTransaction.topic)
              ? null
              : pendingTransaction,
          pendingSigningRequest:
            pendingSigningRequest && mismatchedTopics.includes(pendingSigningRequest.topic)
              ? null
              : pendingSigningRequest,
        });

        get()._updateSessions();
      },

      initialize: async (address: string) => {
        // WalletConnect is currently disabled
        if (!WALLETCONNECT_ENABLED) {
          wcLogger.debug('Feature is currently disabled');
          return;
        }

        const { _walletKit, initialized } = get();

        // Skip if already initialized
        if (initialized && _walletKit) {
          get()._updateSessions();
          return;
        }

        try {
          wcLogger.debug('Initializing...');

          if (!WALLETCONNECT_PROJECT_ID) {
            throw new Error('EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID not configured. Set it in .env file.');
          }

          // Create Core instance
          const core = new Core({
            projectId: WALLETCONNECT_PROJECT_ID,
          });

          // Create WalletKit instance
          const walletKit = await WalletKit.init({
            core,
            metadata: {
              name: 'Kondor Mobile',
              description: 'Koinos Mobile Wallet',
              url: 'https://kondor.app',
              icons: ['https://kondor.app/icon.png'],
              redirect: {
                native: 'kondor://',
              },
            },
          });

          // Handle session proposals
          walletKit.on('session_proposal', async (proposal) => {
            wcLogger.debug('Session proposal received:', proposal.id);

            const { proposer } = proposal.params;
            get()._setPendingProposal({
              id: proposal.id,
              params: proposal.params,
              peerMeta: {
                name: proposer.metadata.name,
                description: proposer.metadata.description,
                url: proposer.metadata.url,
                icons: proposer.metadata.icons,
              },
            });
          });

          // Handle session requests
          walletKit.on('session_request', async (event) => {
            wcLogger.debug('Session request:', event.params.request.method);

            const { topic, params, id } = event;
            const { request } = params;
            const session = walletKit.getActiveSessions()[topic];

            if (!session) {
              wcLogger.error('Session not found for topic:', topic);
              return;
            }

            const validation = get().getSessionTopicValidationForActiveNetwork(topic);
            if (validation.status === 'reject') {
              wcLogger.error('Rejecting request for stale WalletConnect session topic:', topic);
              await get().rejectRequest(id, topic, validation.message);
              return;
            }

            const peerMeta = {
              name: session.peer.metadata.name,
              url: session.peer.metadata.url,
            };

            // Check if this is a transaction signing request
            if (
              request.method === KOINOS_METHODS.SignTransaction ||
              request.method === KOINOS_METHODS.SignAndSendTransaction
            ) {
              // Extract transaction from params
              const txParams = request.params as {
                transaction?: TransactionJson;
                address?: string;
                signer?: string;
                signerAddress?: string;
              };
              const transaction = txParams.transaction;
              const signerAddress = txParams.address || txParams.signer || txParams.signerAddress || address;

              if (transaction) {
                get()._setPendingTransaction({
                  id,
                  topic,
                  method: request.method,
                  transaction,
                  signerAddress,
                  peerMeta,
                });
              } else {
                // Reject if no transaction provided
                get().rejectRequest(id, topic, 'No transaction provided');
              }
            } else if (
              request.method === KOINOS_METHODS.SignMessage ||
              request.method === KOINOS_METHODS.SignHash
            ) {
              const signingParams = request.params as {
                address?: string;
                signer?: string;
                signerAddress?: string;
                message?: unknown;
                hash?: unknown;
              };
              const signerAddress =
                signingParams.address || signingParams.signer || signingParams.signerAddress || address;

              get()._setPendingSigningRequest({
                id,
                topic,
                method: request.method,
                signerAddress,
                message: signingParams.message,
                hash: signingParams.hash,
                peerMeta,
              });
            } else {
              // Handle as generic request
              get()._setPendingRequest({
                id,
                topic,
                method: request.method,
                params: request.params,
                peerMeta,
              });
            }
          });

          // Handle session deletions
          walletKit.on('session_delete', () => {
            wcLogger.debug('Session deleted');
            get()._updateSessions();
          });

          set({ _walletKit: walletKit, initialized: true });
          get()._updateSessions();

          wcLogger.debug('Initialized successfully');
        } catch (error) {
          wcLogger.error('Initialization error:', error);
          throw error;
        }
      },

      pair: async (uri: string) => {
        if (!WALLETCONNECT_ENABLED) {
          throw new Error('WalletConnect is currently disabled');
        }

        const { _walletKit } = get();
        if (!_walletKit) {
          throw new Error('WalletConnect not initialized');
        }

        try {
          wcLogger.debug('Pairing with URI...');
          await _walletKit.pair({ uri });
          wcLogger.debug('Pairing initiated');
        } catch (error) {
          wcLogger.error('Pairing error:', error);
          throw error;
        }
      },

      approveSession: async (address: string) => {
        const { _walletKit, pendingProposal } = get();

        if (!_walletKit || !pendingProposal) {
          throw new Error('No pending proposal');
        }

        if (!useNetworkStore.getState().hasHydrated) {
          throw new Error(WALLETCONNECT_NETWORK_NOT_READY_ERROR);
        }

        try {
          wcLogger.debug('Approving session:', pendingProposal.id);
          const activeChainId = getActiveWalletConnectChainId();

          // Build approved namespaces for Koinos
          const approvedNamespaces = buildApprovedNamespaces({
            proposal: pendingProposal.params,
            supportedNamespaces: {
              koinos: {
                chains: [activeChainId],
                methods: APPROVED_METHODS,
                events: SUPPORTED_EVENTS,
                accounts: [`${activeChainId}:${address}`],
              },
            },
          });

          await _walletKit.approveSession({
            id: pendingProposal.id,
            namespaces: approvedNamespaces,
          });

          set({ pendingProposal: null });
          get()._updateSessions();

          wcLogger.debug('Session approved');
        } catch (error) {
          wcLogger.error('Session approval error:', error);
          throw error;
        }
      },

      rejectSession: async () => {
        const { _walletKit, pendingProposal } = get();

        if (!_walletKit || !pendingProposal) {
          throw new Error('No pending proposal');
        }

        try {
          wcLogger.debug('Rejecting session:', pendingProposal.id);

          await _walletKit.rejectSession({
            id: pendingProposal.id,
            reason: getSdkError('USER_REJECTED'),
          });

          set({ pendingProposal: null });

          wcLogger.debug('Session rejected');
        } catch (error) {
          wcLogger.error('Session rejection error:', error);
          throw error;
        }
      },

      disconnectSession: async (topic: string) => {
        const { _walletKit } = get();

        if (!_walletKit) {
          throw new Error('WalletConnect not initialized');
        }

        try {
          wcLogger.debug('Disconnecting session:', topic);

          await _walletKit.disconnectSession({
            topic,
            reason: getSdkError('USER_DISCONNECTED'),
          });

          get()._updateSessions();

          wcLogger.debug('Session disconnected');
        } catch (error) {
          wcLogger.error('Disconnect error:', error);
          throw error;
        }
      },

      disconnectAll: async () => {
        const { _walletKit, sessions } = get();

        if (!_walletKit) return;

        try {
          for (const session of sessions) {
            await _walletKit.disconnectSession({
              topic: session.topic,
              reason: getSdkError('USER_DISCONNECTED'),
            });
          }

          get()._updateSessions();
        } catch (error) {
          wcLogger.error('Disconnect all error:', error);
        }
      },

      respondToRequest: async (id: number, topic: string, result: unknown) => {
        const { _walletKit } = get();

        if (!_walletKit) {
          throw new Error('WalletConnect not initialized');
        }

        try {
          wcLogger.debug('Responding to request:', id);

          await _walletKit.respondSessionRequest({
            topic,
            response: {
              id,
              jsonrpc: '2.0',
              result,
            },
          });

          set({ pendingRequest: null, pendingTransaction: null, pendingSigningRequest: null });

          wcLogger.debug('Request response sent');
        } catch (error) {
          wcLogger.error('Response error:', error);
          throw error;
        }
      },

      rejectRequest: async (id: number, topic: string, message?: string) => {
        const { _walletKit } = get();

        if (!_walletKit) {
          throw new Error('WalletConnect not initialized');
        }

        try {
          wcLogger.debug('Rejecting request:', id);

          await _walletKit.respondSessionRequest({
            topic,
            response: {
              id,
              jsonrpc: '2.0',
              error: {
                code: 4001,
                message: message || 'User rejected the request',
              },
            },
          });

          set({ pendingRequest: null, pendingTransaction: null, pendingSigningRequest: null });

          wcLogger.debug('Request rejected');
        } catch (error) {
          wcLogger.error('Rejection error:', error);
          throw error;
        }
      },
    }),
    {
      name: 'walletconnect-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist sessions list, not the WalletKit instance
        sessions: state.sessions,
      }),
    }
  )
);
