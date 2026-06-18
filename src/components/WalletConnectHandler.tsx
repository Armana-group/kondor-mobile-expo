/**
 * WalletConnectHandler
 *
 * Global handler for WalletConnect sessions and requests.
 * Should be mounted at the app root to handle incoming requests.
 */

import React, { useEffect, useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { Provider, Transaction, Signer, TransactionJson } from 'koilib';
import * as SecureStore from 'expo-secure-store';
import { useWalletStore } from '../stores/walletStore';
import {
  useWalletConnectStore,
  KOINOS_METHODS,
  WCTransactionRequest,
} from '../stores/walletConnectStore';
import { WCSessionApprovalModal } from './WCSessionApprovalModal';
import {
  TransactionApprovalModal,
  TransactionRequest,
  SigningResult,
} from './TransactionApprovalModal';
import { DEFAULT_NETWORK } from '../lib/constants';
import { requireBiometricAuth } from '../lib/biometrics';
import { HapticFeedback } from '../lib/haptics';
import { wcLogger, sanitizeErrorForUser } from '../lib/logger';

export const WalletConnectHandler: React.FC = () => {
  const { address, activeAccountId, isWalletCreated } = useWalletStore();
  const {
    initialized,
    initialize,
    pendingProposal,
    pendingTransaction,
    pendingRequest,
    approveSession,
    rejectSession,
    respondToRequest,
    rejectRequest,
    clearPendingTransaction,
  } = useWalletConnectStore();

  // State for transaction approval
  const [txRequest, setTxRequest] = useState<TransactionRequest | null>(null);
  const [currentWCRequest, setCurrentWCRequest] = useState<WCTransactionRequest | null>(null);

  // Initialize WalletConnect when wallet is created
  useEffect(() => {
    if (isWalletCreated && address && !initialized) {
      initialize(address).catch((error) => {
        wcLogger.error('Failed to initialize:', error);
      });
    }
  }, [isWalletCreated, address, initialized, initialize]);

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
    if (pendingTransaction) {
      // Convert WC transaction request to TransactionRequest format
      const txReq: TransactionRequest = {
        signerAddress: pendingTransaction.signerAddress,
        transaction: pendingTransaction.transaction,
      };
      setTxRequest(txReq);
      setCurrentWCRequest(pendingTransaction);
    } else {
      setTxRequest(null);
      setCurrentWCRequest(null);
    }
  }, [pendingTransaction]);

  // Handle generic requests (non-transaction)
  useEffect(() => {
    if (pendingRequest) {
      handleGenericRequest();
    }
  }, [pendingRequest]);

  // Handle generic (non-signing) requests
  const handleGenericRequest = useCallback(async () => {
    if (!pendingRequest) return;

    const { id, topic, method, params } = pendingRequest;

    try {
      const provider = new Provider(DEFAULT_NETWORK.rpcNodes);
      let result: unknown;

      switch (method) {
        case KOINOS_METHODS.GetNonce:
        case KOINOS_METHODS.GetNextNonce: {
          const address = (params as { address?: string })?.address || '';
          result = await provider.getNonce(address);
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
          const provider = new Provider(DEFAULT_NETWORK.rpcNodes);
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

        case KOINOS_METHODS.SendTransaction: {
          // Just broadcast, don't sign
          const sendParams = params as { transaction: TransactionJson };
          result = await provider.sendTransaction(sendParams.transaction, true);
          break;
        }

        case KOINOS_METHODS.JsonRpcCall: {
          const rpcParams = params as { method: string; params: unknown };
          result = await provider.call(rpcParams.method, rpcParams.params);
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
  }, [pendingRequest, respondToRequest, rejectRequest]);

  // Handle transaction approval
  const handleApproveTransaction = useCallback(
    async (signingResult: SigningResult) => {
      if (!currentWCRequest) return;

      try {
        const { id, topic, method } = currentWCRequest;

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
    [currentWCRequest, respondToRequest, clearPendingTransaction]
  );

  // Handle transaction rejection
  const handleRejectTransaction = useCallback(
    async (error: string) => {
      if (!currentWCRequest) return;

      try {
        await rejectRequest(currentWCRequest.id, currentWCRequest.topic, error);
        clearPendingTransaction();
      } catch (err) {
        wcLogger.error('Rejection error:', err);
      }
    },
    [currentWCRequest, rejectRequest, clearPendingTransaction]
  );

  // Close transaction modal
  const handleCloseTransaction = useCallback(() => {
    clearPendingTransaction();
    setTxRequest(null);
    setCurrentWCRequest(null);
  }, [clearPendingTransaction]);

  return (
    <>
      {/* Session Approval Modal */}
      <WCSessionApprovalModal
        visible={!!pendingProposal}
        proposal={pendingProposal}
        walletAddress={address}
        onApprove={handleApproveSession}
        onReject={handleRejectSession}
      />

      {/* Transaction Approval Modal */}
      <TransactionApprovalModal
        visible={!!txRequest}
        request={txRequest}
        appName={currentWCRequest?.peerMeta.name || 'Unknown App'}
        appOrigin={currentWCRequest?.peerMeta.url || ''}
        isSend={currentWCRequest?.method === KOINOS_METHODS.SignAndSendTransaction}
        onApprove={handleApproveTransaction}
        onReject={handleRejectTransaction}
        onClose={handleCloseTransaction}
      />
    </>
  );
};
