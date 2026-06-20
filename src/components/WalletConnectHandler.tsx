/**
 * WalletConnectHandler
 *
 * Global handler for WalletConnect sessions and requests.
 * Should be mounted at the app root to handle incoming requests.
 */

import React, { useEffect, useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { Provider, Transaction, TransactionJson, utils } from 'koilib';
import { useWalletStore } from '../stores/walletStore';
import {
  useWalletConnectStore,
  KOINOS_METHODS,
  WCSigningRequest,
  WCTransactionRequest,
  WALLETCONNECT_SEND_TRANSACTION_UNSUPPORTED_ERROR,
} from '../stores/walletConnectStore';
import { WCSessionApprovalModal } from './WCSessionApprovalModal';
import {
  TransactionApprovalModal,
  TransactionRequest,
  SigningResult,
} from './TransactionApprovalModal';
import {
  DAppMessageSigningModal,
  DAppMessageSigningRequest,
} from './DAppMessageSigningModal';
import { HapticFeedback } from '../lib/haptics';
import { WALLETCONNECT_JSONRPC_UNSUPPORTED_ERROR } from '../lib/koinosRpcPolicy';
import { wcLogger, sanitizeErrorForUser } from '../lib/logger';
import { getActiveNetworkConfig, useNetworkStore } from '../stores/networkStore';

export const WalletConnectHandler: React.FC = () => {
  const { address, isWalletCreated } = useWalletStore();
  const networkMode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const {
    initialized,
    initialize,
    pendingProposal,
    pendingTransaction,
    pendingSigningRequest,
    pendingRequest,
    approveSession,
    rejectSession,
    respondToRequest,
    rejectRequest,
    clearPendingTransaction,
    clearPendingSigningRequest,
    reconcileSessionsForActiveNetwork,
    getSessionTopicValidationForActiveNetwork,
  } = useWalletConnectStore();

  // State for transaction approval
  const [transactionApproval, setTransactionApproval] = useState<{
    request: TransactionRequest;
    current: WCTransactionRequest;
  } | null>(null);
  const [signingApproval, setSigningApproval] = useState<{
    request: DAppMessageSigningRequest;
    current: WCSigningRequest;
  } | null>(null);

  // Initialize WalletConnect when wallet is created
  useEffect(() => {
    if (isWalletCreated && address && !initialized) {
      initialize(address).catch((error) => {
        wcLogger.error('Failed to initialize:', error);
      });
    }
  }, [isWalletCreated, address, initialized, initialize]);

  useEffect(() => {
    if (!initialized || !hasHydrated) {
      return;
    }

    reconcileSessionsForActiveNetwork().catch((error) => {
      wcLogger.error('Failed to reconcile WalletConnect sessions:', error);
    });
  }, [initialized, hasHydrated, networkMode, reconcileSessionsForActiveNetwork]);

  // Handle session approval
  const handleApproveSession = useCallback(async () => {
    try {
      await approveSession(address);
      HapticFeedback.success();
    } catch (error: any) {
      wcLogger.error('Session approval error:', error);
      Alert.alert('Connection Failed', sanitizeErrorForUser(error, 'Failed to connect to app'));
    }
  }, [approveSession, address]);

  // Handle session rejection
  const handleRejectSession = useCallback(async () => {
    try {
      await rejectSession();
    } catch (error) {
      wcLogger.error('Session rejection error:', error);
    }
  }, [rejectSession]);

  // Handle incoming transaction request
  useEffect(() => {
    if (!pendingTransaction) {
      setTransactionApproval(null);
      return;
    }

    const validation = getSessionTopicValidationForActiveNetwork(pendingTransaction.topic);

    if (validation.status === 'defer') {
      setTransactionApproval(null);
      return;
    }

    if (validation.status === 'reject') {
      setTransactionApproval(null);
      rejectRequest(pendingTransaction.id, pendingTransaction.topic, validation.message).catch(
        (error) => {
          wcLogger.error('Failed to reject invalid WalletConnect transaction request:', error);
        }
      );
      return;
    }

    // Convert WC transaction request to TransactionRequest format
    const txReq: TransactionRequest = {
      signerAddress: pendingTransaction.signerAddress,
      transaction: pendingTransaction.transaction,
    };
    setTransactionApproval({
      request: txReq,
      current: pendingTransaction,
    });
  }, [
    getSessionTopicValidationForActiveNetwork,
    hasHydrated,
    networkMode,
    pendingTransaction,
    rejectRequest,
  ]);

  useEffect(() => {
    if (!pendingSigningRequest) {
      setSigningApproval(null);
      return;
    }

    const validation = getSessionTopicValidationForActiveNetwork(pendingSigningRequest.topic);

    if (validation.status === 'defer') {
      setSigningApproval(null);
      return;
    }

    if (validation.status === 'reject') {
      setSigningApproval(null);
      rejectRequest(pendingSigningRequest.id, pendingSigningRequest.topic, validation.message).catch(
        (error) => {
          wcLogger.error('Failed to reject invalid WalletConnect signing request:', error);
        }
      );
      return;
    }

    setSigningApproval({
      request: {
        signerAddress: pendingSigningRequest.signerAddress,
        kind:
          pendingSigningRequest.method === KOINOS_METHODS.SignHash
            ? 'hash'
            : 'message',
        message: pendingSigningRequest.message,
        hash: pendingSigningRequest.hash,
      },
      current: pendingSigningRequest,
    });
  }, [
    getSessionTopicValidationForActiveNetwork,
    hasHydrated,
    networkMode,
    pendingSigningRequest,
    rejectRequest,
  ]);

  // Handle generic (non-signing) requests
  const handleGenericRequest = useCallback(async () => {
    if (!pendingRequest) return;

    const { id, topic, method, params } = pendingRequest;

    const validation = getSessionTopicValidationForActiveNetwork(topic);
    if (validation.status === 'defer') {
      return;
    }

    if (validation.status === 'reject') {
      await rejectRequest(id, topic, validation.message);
      return;
    }

    if (method === KOINOS_METHODS.SendTransaction) {
      await rejectRequest(id, topic, WALLETCONNECT_SEND_TRANSACTION_UNSUPPORTED_ERROR);
      return;
    }

    if (method === KOINOS_METHODS.JsonRpcCall) {
      await rejectRequest(id, topic, WALLETCONNECT_JSONRPC_UNSUPPORTED_ERROR);
      return;
    }

    const activeNetwork = getActiveNetworkConfig();

    try {
      const provider = new Provider(activeNetwork.rpcNodes);
      let result: unknown;

      switch (method) {
        case KOINOS_METHODS.GetNonce:
        {
          const address = (params as { address?: string })?.address || '';
          result = await provider.getNonce(address);
          break;
        }

        case KOINOS_METHODS.GetNextNonce: {
          const address = (params as { address?: string })?.address || '';
          result = await provider.getNextNonce(address);
          break;
        }

        case KOINOS_METHODS.GetAccountRc: {
          const address = (params as { address?: string })?.address || '';
          result = await provider.getAccountRc(address);
          break;
        }

        case KOINOS_METHODS.GetHeadInfo: {
          result = await provider.getHeadInfo();
          break;
        }

        case KOINOS_METHODS.GetChainId: {
          result = await provider.getChainId();
          break;
        }

        case KOINOS_METHODS.ReadContract: {
          const readParams = params as {
            contract_id: string;
            entry_point: number;
            args: string;
          };
          result = await provider.readContract(readParams);
          break;
        }

        case KOINOS_METHODS.GetTransactionsById: {
          const txParams = params as { transaction_ids: string[] };
          result = await provider.getTransactionsById(txParams.transaction_ids);
          break;
        }

        case KOINOS_METHODS.GetBlocksById: {
          const blockParams = params as { block_ids: string[] };
          result = await provider.getBlocksById(blockParams.block_ids);
          break;
        }

        case KOINOS_METHODS.GetBlocks: {
          const blocksParams = params as { height: number; num_blocks: number };
          result = await provider.getBlocks(blocksParams.height, blocksParams.num_blocks);
          break;
        }

        case KOINOS_METHODS.GetBlock: {
          const blockParam = params as { height: number };
          result = await provider.getBlock(blockParam.height);
          break;
        }

        case KOINOS_METHODS.PrepareTransaction: {
          // Prepare transaction without signing
          const prepParams = params as { transaction: TransactionJson };
          const txObj = new Transaction({ provider });
          txObj.transaction = prepParams.transaction;
          await txObj.prepare();
          result = txObj.transaction;
          break;
        }

        case KOINOS_METHODS.WaitForTransaction: {
          const waitParams = params as { transaction_id: string; timeout?: number };
          result = await provider.wait(waitParams.transaction_id, 'byBlock', waitParams.timeout);
          break;
        }

        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      await respondToRequest(id, topic, result);
    } catch (error: any) {
      wcLogger.error('Request error:', error);
      await rejectRequest(id, topic, error.message || 'Request failed');
    }
  }, [
    getSessionTopicValidationForActiveNetwork,
    pendingRequest,
    rejectRequest,
    respondToRequest,
  ]);

  // Handle generic requests (non-transaction)
  useEffect(() => {
    if (pendingRequest) {
      handleGenericRequest();
    }
  }, [hasHydrated, networkMode, pendingRequest, handleGenericRequest]);

  // Handle transaction approval
  const handleApproveTransaction = useCallback(
    async (signingResult: SigningResult) => {
      if (!transactionApproval) return;

      try {
        const { id, topic, method } = transactionApproval.current;

        if (method === KOINOS_METHODS.SignAndSendTransaction) {
          // Return both transaction and receipt
          await respondToRequest(id, topic, {
            transaction: signingResult.transaction,
            receipt: signingResult.receipt,
          });
        } else {
          // Just return signed transaction
          await respondToRequest(id, topic, {
            transaction: signingResult.transaction,
          });
        }

        clearPendingTransaction();
        HapticFeedback.success();
      } catch (error: any) {
        wcLogger.error('Transaction response error:', error);
        Alert.alert('Error', sanitizeErrorForUser(error, 'Failed to send response'));
      }
    },
    [transactionApproval, respondToRequest, clearPendingTransaction]
  );

  // Handle transaction rejection
  const handleRejectTransaction = useCallback(
    async (error: string) => {
      if (!transactionApproval) return;

      try {
        await rejectRequest(transactionApproval.current.id, transactionApproval.current.topic, error);
        clearPendingTransaction();
      } catch (err) {
        wcLogger.error('Rejection error:', err);
      }
    },
    [transactionApproval, rejectRequest, clearPendingTransaction]
  );

  // Close transaction modal
  const handleCloseTransaction = useCallback(() => {
    clearPendingTransaction();
    setTransactionApproval(null);
  }, [clearPendingTransaction]);

  const handleApproveSigningRequest = useCallback(
    async (signature: string | Uint8Array) => {
      if (!signingApproval) {
        return;
      }

      try {
        const result =
          signingApproval.current.method === KOINOS_METHODS.SignHash
            ? utils.encodeBase64(signature as Uint8Array)
            : utils.encodeBase64(utils.decodeBase64url(signature as string));

        await respondToRequest(signingApproval.current.id, signingApproval.current.topic, result);
        clearPendingSigningRequest();
        setSigningApproval(null);
      } catch (error: any) {
        wcLogger.error('Signing response error:', error);
        Alert.alert('Error', sanitizeErrorForUser(error, 'Failed to send response'));
      }
    },
    [clearPendingSigningRequest, signingApproval, respondToRequest]
  );

  const handleRejectSigningRequest = useCallback(
    async (error: string) => {
      if (!signingApproval) {
        return;
      }

      try {
        await rejectRequest(signingApproval.current.id, signingApproval.current.topic, error);
        clearPendingSigningRequest();
        setSigningApproval(null);
      } catch (err) {
        wcLogger.error('Signing rejection error:', err);
      }
    },
    [clearPendingSigningRequest, signingApproval, rejectRequest]
  );

  return (
    <>
      {/* Session Approval Modal */}
      <WCSessionApprovalModal
        visible={hasHydrated && !!pendingProposal}
        proposal={pendingProposal}
        walletAddress={address}
        onApprove={handleApproveSession}
        onReject={handleRejectSession}
      />

      {/* Transaction Approval Modal */}
      <TransactionApprovalModal
        visible={!!transactionApproval}
        request={transactionApproval?.request || null}
        appName={transactionApproval?.current.peerMeta.name || 'Unknown App'}
        appOrigin={transactionApproval?.current.peerMeta.url || ''}
        isSend={transactionApproval?.current.method === KOINOS_METHODS.SignAndSendTransaction}
        onApprove={handleApproveTransaction}
        onReject={handleRejectTransaction}
        onClose={handleCloseTransaction}
      />

      <DAppMessageSigningModal
        visible={!!signingApproval}
        request={signingApproval?.request || null}
        appName={signingApproval?.current.peerMeta.name || 'Unknown App'}
        appOrigin={signingApproval?.current.peerMeta.url || ''}
        onApprove={handleApproveSigningRequest}
        onReject={handleRejectSigningRequest}
      />
    </>
  );
};
