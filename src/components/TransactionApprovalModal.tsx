/**
 * TransactionApprovalModal
 *
 * Displays transaction signing/sending approval UI when a DApp requests
 * to sign or send a transaction. Shows decoded operations and requires
 * biometric authentication before signing.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Signer, Transaction, Provider, TransactionJson, type OperationJson } from 'koilib';
import * as SecureStore from 'expo-secure-store';
import colors from '../theme/colors';
import { useWalletStore } from '../stores/walletStore';
import { requireBiometricAuth } from '../lib/biometrics';
import { HapticFeedback } from '../lib/haptics';
import { txLogger } from '../lib/logger';
import { getActiveNetworkConfig, useNetworkStore } from '../stores/networkStore';
import { inspectDAppOrigin } from '../lib/dapp/originSecurity';
import {
  type DecodedOperation,
  decodeKnownOperation,
  hasKoinDxSwapOperation,
} from '../lib/transactionDecoder';

// Transaction request from dApp
export interface TransactionRequest {
  signerAddress: string;
  transaction: TransactionJson;
  options?: {
    broadcast?: boolean;
    sendAbis?: boolean;
  };
  abis?: Record<string, unknown>;
}

// Result returned after signing
export interface SigningResult {
  transaction: TransactionJson;
  receipt?: unknown;
}

interface TransactionApprovalModalProps {
  visible: boolean;
  request: TransactionRequest | null;
  appName: string;
  appOrigin: string;
  isSend: boolean; // true for sendTransaction, false for signTransaction
  onApprove: (result: SigningResult) => void;
  onReject: (error: string) => void;
  onClose: () => void;
}

// Get simplified domain name from origin
function getSimplifiedDomain(origin: string): string {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    const parts = hostname.split('.');
    // Get the main domain name (e.g., "kollection" from "kollection.app")
    return parts.length > 2 ? parts[parts.length - 2] : parts[0];
  } catch {
    return origin;
  }
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}

function cloneOperation(operation: OperationJson): OperationJson {
  if (operation.call_contract) {
    return {
      ...operation,
      call_contract: { ...operation.call_contract },
    };
  }

  if (operation.upload_contract) {
    return {
      ...operation,
      upload_contract: { ...operation.upload_contract },
    };
  }

  if (operation.set_system_call) {
    return {
      ...operation,
      set_system_call: { ...operation.set_system_call },
    };
  }

  if (operation.set_system_contract) {
    return {
      ...operation,
      set_system_contract: { ...operation.set_system_contract },
    };
  }

  return { ...operation };
}

function cloneTransaction(transaction: TransactionJson): TransactionJson {
  return {
    ...transaction,
    header: transaction.header ? { ...transaction.header } : undefined,
    operations: transaction.operations?.map(cloneOperation),
    signatures: transaction.signatures ? [...transaction.signatures] : undefined,
  };
}

export const TransactionApprovalModal: React.FC<TransactionApprovalModalProps> = ({
  visible,
  request,
  appName,
  appOrigin,
  isSend,
  onApprove,
  onReject,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<DecodedOperation[]>([]);
  const [expandedOps, setExpandedOps] = useState<Set<number>>(new Set([0])); // First op expanded by default
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { getActiveAccount, activeAccountId } = useWalletStore();
  useNetworkStore((state) => state.mode);
  useNetworkStore((state) => state.hasHydrated);
  const activeAccount = getActiveAccount();
  const activeNetwork = getActiveNetworkConfig();
  const normalizedOrigin = normalizeOrigin(appOrigin);
  const originSecurity = useMemo(
    () =>
      inspectDAppOrigin(normalizedOrigin, {
        highRiskRequest: isSend ? 'transaction broadcast' : 'transaction signing',
      }),
    [isSend, normalizedOrigin]
  );
  const blockedSwapMessage =
    'KoinDX swaps from dApps are not supported on mobile. Use the Swap tab in Kondor Mobile instead.';

  const simplifiedDomain = getSimplifiedDomain(normalizedOrigin);

  // Decode operations when request changes
  useEffect(() => {
    if (request?.transaction) {
      const decoded = request.transaction.operations?.map(decodeKnownOperation) ?? [];
      setOperations(decoded);
      setLoading(false);
    } else {
      setOperations([]);
      setLoading(true);
    }
    setError(null);
    setSigning(false);
  }, [request]);

  const rejectPendingRequest = useCallback((message: string) => {
    setError(message);
    setSigning(false);
    onReject(message);
  }, [onReject]);

  // Toggle operation expansion
  const toggleOperation = useCallback((index: number) => {
    setExpandedOps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  // Handle sign/send
  const handleApprove = useCallback(async () => {
    if (!request || !activeAccount) {
      setError('No active account');
      return;
    }

    if (request.signerAddress !== activeAccount.address) {
      rejectPendingRequest('Transaction signer does not match the active wallet account.');
      return;
    }

    if (
      request.transaction.header?.chain_id &&
      request.transaction.header.chain_id !== activeNetwork.chainId
    ) {
      rejectPendingRequest('Transaction network does not match the active wallet network.');
      return;
    }

    if (hasKoinDxSwapOperation(request.transaction.operations)) {
      rejectPendingRequest(blockedSwapMessage);
      return;
    }

    setSigning(true);
    setError(null);

    try {
      // Require biometric authentication
      const authenticated = await requireBiometricAuth(
        isSend ? 'send this transaction' : 'sign this transaction'
      );

      if (!authenticated) {
        setSigning(false);
        setError('Authentication required');
        return;
      }

      HapticFeedback.success();

      // Get private key from secure storage
      let privateKey = await SecureStore.getItemAsync(`kondor_pk_${activeAccountId}`);
      if (!privateKey) {
        privateKey = await SecureStore.getItemAsync('kondor_wallet_private_key');
      }

      if (!privateKey) {
        throw new Error('Private key not found');
      }

      // Create provider and signer
      const provider = new Provider(activeNetwork.rpcNodes);

      let signer: Signer;
      if (privateKey.length === 64) {
        signer = new Signer({ privateKey, provider });
      } else {
        signer = Signer.fromWif(privateKey);
        signer.provider = provider;
      }

      // Prepare transaction
      const tx = cloneTransaction(request.transaction);

      // Use free mana sharer to pay for transaction mana
      const freeManaSharer = activeNetwork.freeManaSharer;
      txLogger.debug('Using free mana sharer:', freeManaSharer);

      // Ensure header exists with free mana sharer as payer
      if (!tx.header) {
        tx.header = {
          payer: freeManaSharer,
          payee: request.signerAddress
        };
      }

      // Override payer to use free mana sharer
      tx.header.payer = freeManaSharer;
      tx.header.payee = request.signerAddress;
      tx.header.chain_id = activeNetwork.chainId;

      // Create Transaction object for dry-run estimation
      // We ALWAYS estimate rc_limit via dry-run because dApps may send incorrect values
      const estimateTx = new Transaction({ signer, provider });

      // Copy transaction but clear id and signatures (they'll be recalculated)
      const txForEstimation = cloneTransaction(tx);
      delete txForEstimation.id;
      delete txForEstimation.signatures;
      estimateTx.transaction = txForEstimation;

      // Set rc_limit for estimation - free mana sharer has a max of 100 mana per tx
      // 100 mana = 10,000,000,000 (10^10) in smallest units
      const MAX_FREE_MANA = 10000000000;
      let estimationLimit = MAX_FREE_MANA;
      txLogger.debug('Using free mana sharer with max', MAX_FREE_MANA, 'RC (100 mana)');

      // Prepare the estimation transaction
      if (!estimateTx.transaction.header) {
        estimateTx.transaction.header = {};
      }
      estimateTx.transaction.header.rc_limit = String(estimationLimit);

      // Fill in nonce if missing
      if (!estimateTx.transaction.header.nonce) {
        await estimateTx.prepare();
      }

      // Dry-run to get actual RC usage
      txLogger.debug('Performing dry-run estimation...');
      let dryRunReceipt;
      try {
        dryRunReceipt = await estimateTx.send({ broadcast: false });
        txLogger.debug('Dry-run receipt:', dryRunReceipt);
      } catch (dryRunError: any) {
        txLogger.error('Dry-run failed:', dryRunError);
        // If dry-run fails, the transaction would fail anyway - show meaningful error
        const errorMsg = dryRunError.message || 'Transaction would fail';
        throw new Error(`Transaction simulation failed: ${errorMsg}`);
      }

      // Check if dry-run reverted
      if (dryRunReceipt.reverted) {
        const revertReason =
          dryRunReceipt.logs?.join('; ') ||
          (dryRunReceipt as { error_message?: string }).error_message ||
          'Unknown error';
        txLogger.error('Dry-run reverted:', revertReason);
        throw new Error(`Transaction would revert: ${revertReason}`);
      }

      // Calculate rc_limit with 10% buffer (Kondor pattern)
      const rcUsed = Number(dryRunReceipt.rc_used || 0);
      let rcLimit = Math.floor(1.1 * rcUsed);
      txLogger.debug('RC used:', rcUsed, '-> RC limit with 10% buffer:', rcLimit);

      // Ensure we have a reasonable rc_limit
      if (rcLimit <= 0) {
        txLogger.warn('RC limit is 0, using fallback');
        throw new Error('Could not estimate transaction cost');
      }

      // Cap to free mana sharer's max (100 mana)
      if (rcLimit > MAX_FREE_MANA) {
        txLogger.warn('Transaction needs', rcLimit, 'RC but free mana max is', MAX_FREE_MANA);
        // For now, cap it - transaction might fail if it actually needs more
        // TODO: Fall back to user's own mana if transaction needs more than 100 mana
        rcLimit = MAX_FREE_MANA;
        txLogger.debug('Capped rc_limit to', MAX_FREE_MANA);
      }

      // Now create the actual transaction with proper rc_limit
      const txObj = new Transaction({ signer, provider });

      // Copy transaction but clear id and signatures (they'll be recalculated after signing)
      const txForSigning = cloneTransaction(tx);
      delete txForSigning.id;
      delete txForSigning.signatures;
      txObj.transaction = txForSigning;

      // Set the estimated rc_limit (override whatever the dApp sent)
      if (!txObj.transaction.header) {
        txObj.transaction.header = {};
      }
      txObj.transaction.header.rc_limit = String(rcLimit);

      // Always prepare to calculate transaction ID and fill missing fields
      txLogger.debug('Preparing transaction...');
      await txObj.prepare();
      txLogger.debug('Transaction prepared, ID:', txObj.transaction.id);

      // Sign the transaction
      await signer.signTransaction(txObj.transaction);

      if (isSend) {
        // Send the transaction
        const receipt = await txObj.send({ broadcast: true });
        onApprove({
          transaction: txObj.transaction,
          receipt,
        });
      } else {
        // Just return the signed transaction
        onApprove({
          transaction: txObj.transaction,
        });
      }

      HapticFeedback.success();
    } catch (err: any) {
      txLogger.error('Transaction signing error:', err);
      setError(err.message || 'Failed to sign transaction');
      setSigning(false);
      HapticFeedback.error();
    }
  }, [
    request,
    activeAccount,
    activeAccountId,
    activeNetwork.chainId,
    activeNetwork.freeManaSharer,
    activeNetwork.rpcNodes,
    isSend,
    onApprove,
    rejectPendingRequest,
    blockedSwapMessage,
  ]);

  // Handle rejection
  const handleReject = useCallback(() => {
    HapticFeedback.selection();
    onReject('User rejected the transaction');
    onClose();
  }, [onReject, onClose]);

  // Render operation icon based on type
  const renderOperationIcon = (type: DecodedOperation['type']) => {
    switch (type) {
      case 'contract_call':
        return <Ionicons name="code-slash" size={20} color={colors.purple} />;
      case 'upload_contract':
        return <Ionicons name="cloud-upload" size={20} color={colors.purple} />;
      case 'set_system_call':
      case 'set_system_contract':
        return <Ionicons name="settings" size={20} color={colors.warning} />;
      default:
        return <Ionicons name="document" size={20} color={colors.purple} />;
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleReject}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerLabel}>
              Your wallet is interacting with:
            </Text>
            <Text style={styles.appNameLarge}>{appName || simplifiedDomain}</Text>
            <Text style={styles.appOrigin} numberOfLines={1}>
              {originSecurity.displayOrigin}
            </Text>
          </View>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Loading transaction...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentContainer}
          >
            <View style={styles.noticeCard}>
              <Ionicons
                name={originSecurity.level === 'trusted' ? 'shield-checkmark' : 'warning'}
                size={18}
                color={originSecurity.level === 'trusted' ? colors.success : colors.warning}
              />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>Origin and network review</Text>
                <Text style={styles.noticeText}>
                  {hasKoinDxSwapOperation(request?.transaction.operations)
                    ? blockedSwapMessage
                    : 'Review the site origin and network before approving this transaction.'}
                </Text>
              </View>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Site Origin</Text>
                <Text style={styles.summaryValue}>{originSecurity.displayOrigin}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Active Network</Text>
                <Text style={styles.summaryValue}>{activeNetwork.name}</Text>
              </View>
            </View>

            {/* Operations List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {operations.length === 1 ? 'Operation' : `${operations.length} Operations`}
              </Text>

              {operations.length === 0 ? (
                <View style={styles.emptyOps}>
                  <Text style={styles.emptyOpsText}>
                    No operations in this transaction
                  </Text>
                </View>
              ) : (
                operations.map((op, index) => (
                  <View key={index} style={styles.operationCard}>
                    <TouchableOpacity
                      style={styles.operationHeader}
                      onPress={() => toggleOperation(index)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.operationIconContainer}>
                        {renderOperationIcon(op.type)}
                      </View>
                      <View style={styles.operationTitleContainer}>
                        <Text style={styles.operationTitle}>{op.title}</Text>
                        <Text style={styles.operationContract} numberOfLines={1}>
                          {op.details.find(detail => detail.label === 'Contract')?.value ?? op.contractId}
                        </Text>
                      </View>
                      <Ionicons
                        name={expandedOps.has(index) ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={colors.textTertiary}
                      />
                    </TouchableOpacity>

                    {expandedOps.has(index) && (
                      <View style={styles.operationDetails}>
                        {op.details.map((detail, detailIndex) => (
                          <View key={detailIndex} style={styles.detailRow}>
                            <Text style={styles.detailLabel}>{detail.label}</Text>
                            <Text style={styles.detailValue} numberOfLines={3}>
                              {detail.value}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>

            {/* Advanced Toggle */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text style={styles.advancedToggleText}>Advanced Details</Text>
              <Ionicons
                name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Advanced Details */}
            {showAdvanced && request && (
              <View style={styles.advancedSection}>
                {/* Signer Info */}
                <View style={styles.advancedCard}>
                  <Text style={styles.advancedLabel}>Signer</Text>
                  <Text style={styles.advancedValue}>
                    {activeAccount?.name || 'Unknown'}
                  </Text>
                  <Text style={styles.advancedValueSmall} numberOfLines={1}>
                    {request.signerAddress}
                  </Text>
                </View>

                {/* Transaction Header */}
                {request.transaction.header && (
                  <View style={styles.advancedCard}>
                    <Text style={styles.advancedLabel}>Transaction Header</Text>
                    {request.transaction.header.payer && (
                      <View style={styles.advancedRow}>
                        <Text style={styles.advancedRowLabel}>Payer:</Text>
                        <Text style={styles.advancedRowValue} numberOfLines={1}>
                          {request.transaction.header.payer}
                        </Text>
                      </View>
                    )}
                    {request.transaction.header.payee && (
                      <View style={styles.advancedRow}>
                        <Text style={styles.advancedRowLabel}>Payee:</Text>
                        <Text style={styles.advancedRowValue} numberOfLines={1}>
                          {request.transaction.header.payee}
                        </Text>
                      </View>
                    )}
                    {request.transaction.header.nonce && (
                      <View style={styles.advancedRow}>
                        <Text style={styles.advancedRowLabel}>Nonce:</Text>
                        <Text style={styles.advancedRowValue}>
                          {request.transaction.header.nonce}
                        </Text>
                      </View>
                    )}
                    {request.transaction.header.rc_limit && (
                      <View style={styles.advancedRow}>
                        <Text style={styles.advancedRowLabel}>RC Limit:</Text>
                        <Text style={styles.advancedRowValue}>
                          {request.transaction.header.rc_limit}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Warning */}
            <View style={styles.warningContainer}>
              <Ionicons name="warning" size={20} color={colors.warning} />
              <Text style={styles.warningText}>
                Interacting with unknown contracts can be risky. Only proceed if you trust this application.
              </Text>
            </View>
          </ScrollView>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={handleReject}
            disabled={signing}
          >
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.approveButton, signing && styles.buttonDisabled]}
            onPress={handleApprove}
            disabled={signing || loading}
          >
            {signing ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={styles.approveButtonText}>
                {isSend ? 'Send' : 'Sign'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.card,
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'flex-start',
  },
  headerLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  appNameLarge: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  appOrigin: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: colors.textSecondary,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 16,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyOps: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyOpsText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  operationCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  operationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  operationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  operationTitleContainer: {
    flex: 1,
  },
  operationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  operationContract: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  operationDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailRow: {
    marginTop: 10,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 12,
  },
  advancedToggleText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 6,
  },
  advancedSection: {
    marginBottom: 16,
  },
  advancedCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  advancedLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  advancedValue: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  advancedValueSmall: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  advancedRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  advancedRowLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    width: 70,
  },
  advancedRowValue: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${colors.warning}15`,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: colors.warning,
    marginLeft: 10,
    lineHeight: 18,
  },
  errorContainer: {
    backgroundColor: `${colors.error}20`,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rejectButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  approveButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.purple,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
