/**
 * WalletConnect Store
 *
 * Manages WalletConnect v2 sessions and handles incoming requests
 * from dApps that connect via WalletConnect protocol.
 *
 * NOTE: WalletConnect is currently disabled due to compatibility issues
 * with the React Native/Expo build system. The feature will be re-enabled
 * once the bundler issues are resolved.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TransactionJson } from 'koilib';

// WalletConnect is currently disabled - set to true to enable when ready
const WALLETCONNECT_ENABLED = false;

// Koinos chain IDs from @armana/walletconnect-koinos-sdk-js
export const KOINOS_CHAIN_IDS = {
  Mainnet: 'koinos:EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3e',
  Harbinger: 'koinos:EiBncD4pKRIQWco_WRqo5Q-xnXR7JuO3',
} as const;

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

// All supported methods
const SUPPORTED_METHODS = Object.values(KOINOS_METHODS);

// Events (none for now, but required by WalletConnect)
const SUPPORTED_EVENTS: string[] = [];

// WalletConnect Project ID - you need to get this from https://cloud.walletconnect.com
// For development, we use a placeholder
const WALLETCONNECT_PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID || 'your-project-id';

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

interface WalletConnectState {
  // State
  initialized: boolean;
  sessions: WCSession[];
  pendingProposal: WCSessionProposal | null;
  pendingRequest: WCPendingRequest | null;
  pendingTransaction: WCTransactionRequest | null;

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

  // Internal (using any for WalletKit since it's dynamically imported)
  _walletKit: any | null;
  _setWalletKit: (kit: any | null) => void;
  _setPendingProposal: (proposal: WCSessionProposal | null) => void;
  _setPendingRequest: (request: WCPendingRequest | null) => void;
  _setPendingTransaction: (request: WCTransactionRequest | null) => void;
  _updateSessions: () => void;
}

export const useWalletConnectStore = create<WalletConnectState>()(
  persist(
    (set, get) => ({
      initialized: false,
      sessions: [],
      pendingProposal: null,
      pendingRequest: null,
      pendingTransaction: null,
      _walletKit: null,

      _setWalletKit: (kit) => set({ _walletKit: kit }),

      _setPendingProposal: (proposal) => set({ pendingProposal: proposal }),

      _setPendingRequest: (request) => set({ pendingRequest: request }),

      _setPendingTransaction: (request) => set({ pendingTransaction: request }),

      clearPendingTransaction: () => set({ pendingTransaction: null }),

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
          console.error('[WalletConnect] Failed to update sessions:', error);
        }
      },

      initialize: async (address: string) => {
        // WalletConnect is currently disabled
        if (!WALLETCONNECT_ENABLED) {
          console.log('[WalletConnect] Feature is currently disabled');
          return;
        }

        const { _walletKit, initialized } = get();

        // Skip if already initialized
        if (initialized && _walletKit) {
          get()._updateSessions();
          return;
        }

        try {
          console.log('[WalletConnect] Initializing...');

          // Dynamic imports for WalletConnect
          const { Core } = await import('@walletconnect/core');
          const { WalletKit } = await import('@reown/walletkit');

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
            console.log('[WalletConnect] Session proposal received:', proposal.id);

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
            console.log('[WalletConnect] Session request:', event.params.request.method);

            const { topic, params, id } = event;
            const { request } = params;
            const session = walletKit.getActiveSessions()[topic];

            if (!session) {
              console.error('[WalletConnect] Session not found for topic:', topic);
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
              const txParams = request.params as { transaction?: TransactionJson; signer?: string };
              const transaction = txParams.transaction;
              const signerAddress = txParams.signer || address;

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
            console.log('[WalletConnect] Session deleted');
            get()._updateSessions();
          });

          set({ _walletKit: walletKit, initialized: true });
          get()._updateSessions();

          console.log('[WalletConnect] Initialized successfully');
        } catch (error) {
          console.error('[WalletConnect] Initialization error:', error);
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
          console.log('[WalletConnect] Pairing with URI...');
          await _walletKit.pair({ uri });
          console.log('[WalletConnect] Pairing initiated');
        } catch (error) {
          console.error('[WalletConnect] Pairing error:', error);
          throw error;
        }
      },

      approveSession: async (address: string) => {
        const { _walletKit, pendingProposal } = get();

        if (!_walletKit || !pendingProposal) {
          throw new Error('No pending proposal');
        }

        try {
          console.log('[WalletConnect] Approving session:', pendingProposal.id);

          const { buildApprovedNamespaces } = await import('@walletconnect/utils');

          // Build approved namespaces for Koinos
          const approvedNamespaces = buildApprovedNamespaces({
            proposal: pendingProposal.params,
            supportedNamespaces: {
              koinos: {
                chains: [KOINOS_CHAIN_IDS.Mainnet],
                methods: SUPPORTED_METHODS,
                events: SUPPORTED_EVENTS,
                accounts: [`${KOINOS_CHAIN_IDS.Mainnet}:${address}`],
              },
            },
          });

          await _walletKit.approveSession({
            id: pendingProposal.id,
            namespaces: approvedNamespaces,
          });

          set({ pendingProposal: null });
          get()._updateSessions();

          console.log('[WalletConnect] Session approved');
        } catch (error) {
          console.error('[WalletConnect] Session approval error:', error);
          throw error;
        }
      },

      rejectSession: async () => {
        const { _walletKit, pendingProposal } = get();

        if (!_walletKit || !pendingProposal) {
          throw new Error('No pending proposal');
        }

        try {
          console.log('[WalletConnect] Rejecting session:', pendingProposal.id);

          const { getSdkError } = await import('@walletconnect/utils');

          await _walletKit.rejectSession({
            id: pendingProposal.id,
            reason: getSdkError('USER_REJECTED'),
          });

          set({ pendingProposal: null });

          console.log('[WalletConnect] Session rejected');
        } catch (error) {
          console.error('[WalletConnect] Session rejection error:', error);
          throw error;
        }
      },

      disconnectSession: async (topic: string) => {
        const { _walletKit } = get();

        if (!_walletKit) {
          throw new Error('WalletConnect not initialized');
        }

        try {
          console.log('[WalletConnect] Disconnecting session:', topic);

          const { getSdkError } = await import('@walletconnect/utils');

          await _walletKit.disconnectSession({
            topic,
            reason: getSdkError('USER_DISCONNECTED'),
          });

          get()._updateSessions();

          console.log('[WalletConnect] Session disconnected');
        } catch (error) {
          console.error('[WalletConnect] Disconnect error:', error);
          throw error;
        }
      },

      disconnectAll: async () => {
        const { _walletKit, sessions } = get();

        if (!_walletKit) return;

        try {
          const { getSdkError } = await import('@walletconnect/utils');

          for (const session of sessions) {
            await _walletKit.disconnectSession({
              topic: session.topic,
              reason: getSdkError('USER_DISCONNECTED'),
            });
          }

          get()._updateSessions();
        } catch (error) {
          console.error('[WalletConnect] Disconnect all error:', error);
        }
      },

      respondToRequest: async (id: number, topic: string, result: unknown) => {
        const { _walletKit } = get();

        if (!_walletKit) {
          throw new Error('WalletConnect not initialized');
        }

        try {
          console.log('[WalletConnect] Responding to request:', id);

          await _walletKit.respondSessionRequest({
            topic,
            response: {
              id,
              jsonrpc: '2.0',
              result,
            },
          });

          set({ pendingRequest: null, pendingTransaction: null });

          console.log('[WalletConnect] Request response sent');
        } catch (error) {
          console.error('[WalletConnect] Response error:', error);
          throw error;
        }
      },

      rejectRequest: async (id: number, topic: string, message?: string) => {
        const { _walletKit } = get();

        if (!_walletKit) {
          throw new Error('WalletConnect not initialized');
        }

        try {
          console.log('[WalletConnect] Rejecting request:', id);

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

          set({ pendingRequest: null, pendingTransaction: null });

          console.log('[WalletConnect] Request rejected');
        } catch (error) {
          console.error('[WalletConnect] Rejection error:', error);
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
