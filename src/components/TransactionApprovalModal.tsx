/**
 * TransactionApprovalModal
 *
 * Displays transaction signing/sending approval UI when a DApp requests
 * to sign or send a transaction. Shows decoded operations and requires
 * biometric authentication before signing.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { Signer, Transaction, Provider, TransactionJson } from 'koilib';
import * as SecureStore from 'expo-secure-store';
import colors from '../theme/colors';
import { useWalletStore } from '../stores/walletStore';
import { requireBiometricAuth } from '../lib/biometrics';
import { HapticFeedback } from '../lib/haptics';
import { DEFAULT_NETWORK, FREE_MANA_SHARER } from '../lib/constants';

// Decoded operation for display
export interface DecodedOperation {
  type: 'contract_call' | 'upload_contract' | 'set_system_call' | 'set_system_contract';
  title: string;
  contractId: string;
  entryPoint?: number;
  details: { label: string; value: string }[];
}

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

// Known contract addresses for better display
const KNOWN_CONTRACTS: Record<string, { name: string; symbol?: string }> = {
  '15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL': { name: 'KOIN', symbol: 'KOIN' },
  '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK': { name: 'KOIN', symbol: 'KOIN' },
  '1AdzuXSpC6K9qtXdCBgD5NUpDNwHjMgrc9': { name: 'VHP', symbol: 'VHP' },
  '18tWNU7E4yuQzz7hMVpceb9ixmaWLVyQsr': { name: 'VHP', symbol: 'VHP' },
  '1KD9Es7LBBjA1FY3ViCgQJ7e6WH1ipKbhz': { name: 'KoinDX Router' },
  '1NHReq2apWsQ6UPBjNqcV3ABsj88Ncimiy': { name: 'Kollection' },
};

// Known entry points for better display
const KNOWN_ENTRY_POINTS: Record<number, string> = {
  0x27f576ca: 'transfer',
  0x82a3537f: 'mint',
  0x859facc5: 'burn',
  0x5c721497: 'approve',
  0xe74b785a: 'balanceOf',
  0xc65b2bae: 'totalSupply',
  0x7e794b24: 'swap',
  0x8f5a3e29: 'addLiquidity',
  0x12b4a9c3: 'removeLiquidity',
};

// Decode entry point number to human-readable name
function decodeEntryPoint(entryPoint: number): string {
  return KNOWN_ENTRY_POINTS[entryPoint] || `0x${entryPoint.toString(16)}`;
}

// Decode contract ID to human-readable name
function decodeContract(contractId: string): string {
  const known = KNOWN_CONTRACTS[contractId];
  if (known) {
    return known.symbol ? `${known.name} (${known.symbol})` : known.name;
  }
  return contractId;
}

// Decode transaction operations for display
function decodeOperations(transaction: TransactionJson): DecodedOperation[] {
  const operations: DecodedOperation[] = [];

  if (!transaction.operations) {
    return operations;
  }

  for (const op of transaction.operations) {
    if (op.call_contract) {
      const { contract_id, entry_point, args } = op.call_contract;
      const entryPointName = decodeEntryPoint(entry_point);
      const contractName = decodeContract(contract_id);

      operations.push({
        type: 'contract_call',
        title: `${entryPointName}`,
        contractId: contract_id,
        entryPoint: entry_point,
        details: [
          { label: 'Contract', value: contractName },
          { label: 'Entry Point', value: entryPointName },
          ...(args ? [{ label: 'Arguments', value: args.length > 100 ? `${args.slice(0, 100)}...` : args }] : []),
        ],
      });
    } else if (op.upload_contract) {
      operations.push({
        type: 'upload_contract',
        title: 'Upload Contract',
        contractId: op.upload_contract.contract_id || 'New Contract',
        details: [
          { label: 'Contract ID', value: op.upload_contract.contract_id || 'TBD' },
          { label: 'Bytecode Size', value: `${(op.upload_contract.bytecode?.length || 0) / 2} bytes` },
        ],
      });
    } else if (op.set_system_call) {
      operations.push({
        type: 'set_system_call',
        title: 'Set System Call',
        contractId: 'System',
        details: [
          { label: 'Call ID', value: String(op.set_system_call.call_id) },
          { label: 'Target', value: JSON.stringify(op.set_system_call.target) },
        ],
      });
    } else if (op.set_system_contract) {
      operations.push({
        type: 'set_system_contract',
        title: 'Set System Contract',
        contractId: 'System',
        details: [
          { label: 'Contract ID', value: op.set_system_contract.contract_id || 'N/A' },
          { label: 'System Contract', value: String(op.set_system_contract.system_contract) },
        ],
      });
    }
  }

  return operations;
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
  const activeAccount = getActiveAccount();

  const simplifiedDomain = getSimplifiedDomain(appOrigin);

  // Decode operations when request changes
  useEffect(() => {
    if (request?.transaction) {
      const decoded = decodeOperations(request.transaction);
      setOperations(decoded);
      setLoading(false);
    } else {
      setOperations([]);
      setLoading(true);
    }
    setError(null);
    setSigning(false);
  }, [request]);

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
      const provider = new Provider(DEFAULT_NETWORK.rpcNodes);

      let signer: Signer;
      if (privateKey.length === 64) {
        signer = new Signer({ privateKey, provider });
      } else {
        signer = Signer.fromWif(privateKey);
        signer.provider = provider;
      }

      // Prepare transaction
      let tx = { ...request.transaction };

      // Use free mana sharer to pay for transaction mana
      const freeManaSharer = FREE_MANA_SHARER.mainnet;
      console.log('[TxApproval] Using free mana sharer:', freeManaSharer);

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

      if (!tx.header.chain_id) {
        tx.header.chain_id = DEFAULT_NETWORK.chainId;
      }

      // Create Transaction object for dry-run estimation
      // We ALWAYS estimate rc_limit via dry-run because dApps may send incorrect values
      const estimateTx = new Transaction({ signer, provider });

      // Copy transaction but clear id and signatures (they'll be recalculated)
      const txForEstimation = { ...tx };
      delete txForEstimation.id;
      delete txForEstimation.signatures;
      estimateTx.transaction = txForEstimation;

      // Set rc_limit for estimation - free mana sharer has a max of 100 mana per tx
      // 100 mana = 10,000,000,000 (10^10) in smallest units
      const MAX_FREE_MANA = 10000000000;
      let estimationLimit = MAX_FREE_MANA;
      console.log('[TxApproval] Using free mana sharer with max', MAX_FREE_MANA, 'RC (100 mana)');

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
      console.log('[TxApproval] Performing dry-run estimation...');
      let dryRunReceipt;
      try {
        dryRunReceipt = await estimateTx.send({ broadcast: false });
        console.log('[TxApproval] Dry-run receipt:', dryRunReceipt);
      } catch (dryRunError: any) {
        console.error('[TxApproval] Dry-run failed:', dryRunError);
        // If dry-run fails, the transaction would fail anyway - show meaningful error
        const errorMsg = dryRunError.message || 'Transaction would fail';
        throw new Error(`Transaction simulation failed: ${errorMsg}`);
      }

      // Check if dry-run reverted
      if (dryRunReceipt.reverted) {
        const revertReason = dryRunReceipt.error_message || 'Unknown error';
        console.error('[TxApproval] Dry-run reverted:', revertReason);
        throw new Error(`Transaction would revert: ${revertReason}`);
      }

      // Calculate rc_limit with 10% buffer (Kondor pattern)
      const rcUsed = Number(dryRunReceipt.rc_used || 0);
      let rcLimit = Math.floor(1.1 * rcUsed);
      console.log('[TxApproval] RC used:', rcUsed, '-> RC limit with 10% buffer:', rcLimit);

      // Ensure we have a reasonable rc_limit
      if (rcLimit <= 0) {
        console.warn('[TxApproval] RC limit is 0, using fallback');
        throw new Error('Could not estimate transaction cost');
      }

      // Cap to free mana sharer's max (100 mana)
      if (rcLimit > MAX_FREE_MANA) {
        console.warn('[TxApproval] Transaction needs', rcLimit, 'RC but free mana max is', MAX_FREE_MANA);
        // For now, cap it - transaction might fail if it actually needs more
        // TODO: Fall back to user's own mana if transaction needs more than 100 mana
        rcLimit = MAX_FREE_MANA;
        console.log('[TxApproval] Capped rc_limit to', MAX_FREE_MANA);
      }

      // Now create the actual transaction with proper rc_limit
      const txObj = new Transaction({ signer, provider });

      // Copy transaction but clear id and signatures (they'll be recalculated after signing)
      const txForSigning = { ...tx };
      delete txForSigning.id;
      delete txForSigning.signatures;
      txObj.transaction = txForSigning;

      // Set the estimated rc_limit (override whatever the dApp sent)
      if (!txObj.transaction.header) {
        txObj.transaction.header = {};
      }
      txObj.transaction.header.rc_limit = String(rcLimit);

      // Always prepare to calculate transaction ID and fill missing fields
      console.log('[TxApproval] Preparing transaction...');
      await txObj.prepare();
      console.log('[TxApproval] Transaction prepared, ID:', txObj.transaction.id);

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
      console.error('Transaction signing error:', err);
      setError(err.message || 'Failed to sign transaction');
      setSigning(false);
      HapticFeedback.error();
    }
  }, [request, activeAccount, activeAccountId, isSend, onApprove]);

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
            <Text style={styles.appNameLarge}>{simplifiedDomain}</Text>
            <Text style={styles.appOrigin} numberOfLines={1}>
              {appOrigin}
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
                          {decodeContract(op.contractId)}
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
