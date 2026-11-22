/**
 * TransactionApprovalModal
 *
 * Displays transaction signing/sending approval UI when a DApp requests
 * to sign or send a transaction. Shows decoded operations and requires
 * biometric authentication before signing.
 */

import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  AppState,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Provider, TransactionJson, utils } from 'koilib';
import colors from '../theme/colors';
import { useWalletStore } from '../stores/walletStore';
import { HapticFeedback } from '../lib/haptics';
import { txLogger } from '../lib/logger';
import { submitTransactionOnce, TransactionOutcomeUnknownError, TransactionRejectedError } from '../lib/transactionBroadcast';
import { buildPendingTransactionFromBroadcast, useTransactionStore, type AddPendingTransactionInput } from '../stores/transactionStore';
import { useTokenStore } from '../stores/tokenStore';
import { getActiveNetworkConfig, useNetworkStore } from '../stores/networkStore';
import { inspectDAppOrigin } from '../lib/dapp/originSecurity';
import { withAuthenticatedAccountSigner } from '../lib/dapp/messageSigning';
import { copyTransaction, prepareTransactionReview, transactionPayload } from '../lib/dapp/transactionReview';
import { assertManaCapacity, DEFAULT_MAX_MANA, formatMana, parseManaLimit, readPayerCapacity } from '../lib/mana';
import {
  type DecodedOperation,
  decodeKnownOperation,
  decodeRecoveryTransfer,
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
  isRequestCurrent?: () => boolean;
  source?: 'dapp' | 'walletconnect';
  recovery?: AddPendingTransactionInput;
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

export const TransactionApprovalModal: React.FC<TransactionApprovalModalProps> = ({
  visible,
  request,
  appName,
  appOrigin,
  isSend,
  onApprove,
  isRequestCurrent,
  source = 'dapp',
  recovery,
  onReject,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<DecodedOperation[]>([]);
  const [expandedOps, setExpandedOps] = useState<Set<number>>(new Set([0])); // First op expanded by default
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [review, setReview] = useState<{ transaction: TransactionJson; provider: Provider; expiresAt: number } | null>(null);
  const [sponsoredMana, setSponsoredMana] = useState(false);
  const [rcLimit, setRcLimit] = useState(DEFAULT_MAX_MANA);
  const [preparing, setPreparing] = useState(false);
  const [approvalFinished, setApprovalFinished] = useState(false);
  const revision = useRef(0);
  const busy = useRef(false);

  const { accounts, getActiveAccount } = useWalletStore();
  const networkMode = useNetworkStore((state) => state.mode);
  useNetworkStore((state) => state.hasHydrated);
  const activeAccount = getActiveAccount();
  const requestedAccount = request
    ? accounts.find((account) => account.address === request.signerAddress)
    : undefined;
  const activeNetwork = getActiveNetworkConfig();
  const normalizedOrigin = normalizeOrigin(appOrigin);
  const originSecurity = useMemo(
    () =>
      inspectDAppOrigin(normalizedOrigin, {
        highRiskRequest: isSend ? 'transaction broadcast' : 'transaction signing',
      }),
    [isSend, normalizedOrigin]
  );
  const unsupportedSwap = activeNetwork.isTestnet && hasKoinDxSwapOperation(request?.transaction.operations);
  const unsupportedSwapMessage = 'KoinDX swaps are only available on Koinos Mainnet.';
  const fixedPayer = request?.transaction.header?.payer;
  const fixedRc = request?.transaction.header?.rc_limit;
  const recoveredTransfer = useMemo(() => recovery && request?.transaction.operations?.length === 1
    ? decodeRecoveryTransfer(request.transaction.operations[0]) : undefined, [recovery, request]);
  const canSetPayer = !request?.transaction.signatures?.length && !fixedPayer;
  const canSetRc = !request?.transaction.signatures?.length && fixedRc === undefined;

  useLayoutEffect(() => {
    revision.current += 1;
    const reset = () => {
      revision.current += 1;
    };
    setReview(null);
    setPreparing(false);
    setSigning(false);
    setApprovalFinished(false);
    setSponsoredMana(false);
    setRcLimit(DEFAULT_MAX_MANA);
    return reset;
  }, [visible, request, normalizedOrigin, activeNetwork.chainId, activeAccount?.id, isSend]);

  const simplifiedDomain = getSimplifiedDomain(normalizedOrigin);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        revision.current += 1;
        setReview(null);
        setPreparing(false);
        setSigning(false);
      }
    });
    return () => subscription.remove();
  }, []);

  // Decode operations when request changes
  useEffect(() => {
    if (request?.transaction) {
      const token = recovery?.transaction;
      const amount = recoveredTransfer && token?.token === recoveredTransfer.contractId &&
        Number.isInteger(token.tokenDecimals) && token.tokenDecimals >= 0 && token.tokenDecimals <= 255
        ? `${utils.formatUnits(recoveredTransfer.value, token.tokenDecimals)} ${token.tokenSymbol}` : undefined;
      const decoded: DecodedOperation[] = recovery ? (recoveredTransfer ? [{
        type: 'contract_call', title: 'Token transfer', contractId: recoveredTransfer.contractId,
        details: [
          { label: 'Token contract', value: recoveredTransfer.contractId },
          { label: 'From', value: recoveredTransfer.from },
          { label: 'To', value: recoveredTransfer.to },
          ...(amount ? [{ label: 'Amount', value: amount }] : []),
          { label: 'Base units', value: recoveredTransfer.value },
          ...(recoveredTransfer.memo ? [{ label: 'Memo', value: recoveredTransfer.memo }] : []),
        ],
      }] : []) : request.transaction.operations?.map(decodeKnownOperation) ?? [];
      setOperations(decoded);
      setLoading(false);
    } else {
      setOperations([]);
      setLoading(true);
    }
    setError(null);
  }, [request, recovery, recoveredTransfer]);

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

  const assertCurrent = (currentRevision: number) => {
    if (
      currentRevision !== revision.current ||
      !visible ||
      isRequestCurrent?.() === false ||
      (recovery && (!isSend || recovery.chainTransactionId !== request?.transaction.id ||
        recovery.address !== request?.signerAddress || recovery.networkMode !== useNetworkStore.getState().mode ||
        recovery.address !== useWalletStore.getState().address)) ||
      getActiveNetworkConfig().chainId !== activeNetwork.chainId ||
      getActiveNetworkConfig().rpcNodes[0] !== activeNetwork.rpcNodes[0] ||
      !useWalletStore.getState().accounts.some(({ id, address }) =>
        id === requestedAccount?.id && address === request?.signerAddress
      )
    ) {
      throw new Error('The transaction request changed. Review it again.');
    }
  };

  const assertResources = async (provider: Provider, transaction: TransactionJson) => {
    if (!isSend) return;
    const payer = transaction.header?.payer;
    const maxRc = transaction.header?.rc_limit;
    if (!payer || !maxRc) throw new Error('Payer or maximum mana is missing.');
    const capacity = await readPayerCapacity({
      provider, payer, koinContract: activeNetwork.koinContract, sponsor: activeNetwork.freeManaSharer,
      ...(recoveredTransfer?.contractId === activeNetwork.koinContract && recoveredTransfer.from === payer
        ? { outgoingKoin: recoveredTransfer.value } : {}),
    });
    assertManaCapacity(String(maxRc), capacity);
  };

  const handleReview = async () => {
    if (busy.current || !request) return;
    if (!activeAccount || !requestedAccount) {
      rejectPendingRequest('Transaction signer is not in this wallet.');
      return;
    }
    if (isSend && request.options?.broadcast === false) {
      rejectPendingRequest('Transaction simulation is unavailable. No transaction was signed or sent.');
      return;
    }
    if (unsupportedSwap) {
      rejectPendingRequest(unsupportedSwapMessage);
      return;
    }
    if (recovery && recoveredTransfer?.from !== request.signerAddress) {
      rejectPendingRequest('The original transfer could not be reviewed.');
      return;
    }
    if (!recovery && originSecurity.denyApproval) {
      rejectPendingRequest('This site cannot request wallet approval.');
      return;
    }
    const currentRevision = revision.current;
    busy.current = true;
    setPreparing(true);
    setError(null);

    try {
      assertCurrent(currentRevision);
      const provider = new Provider(activeNetwork.rpcNodes);
      const transaction = await prepareTransactionReview({
        transaction: request.transaction,
        provider,
        signerAddress: request.signerAddress,
        chainId: activeNetwork.chainId,
        defaultPayer: sponsoredMana ? activeNetwork.freeManaSharer : request.signerAddress,
        rcLimit: canSetRc ? parseManaLimit(rcLimit) : '',
      });
      assertCurrent(currentRevision);
      await assertResources(provider, transaction);
      assertCurrent(currentRevision);
      setReview({ transaction, provider, expiresAt: Date.now() + 60_000 });
    } catch (err) {
      if (currentRevision === revision.current) {
        if (request.transaction.header?.chain_id && request.transaction.header.chain_id !== activeNetwork.chainId) {
          rejectPendingRequest('Transaction network does not match the active wallet network.');
        } else {
          setError(err instanceof Error ? err.message : 'Unable to prepare transaction');
        }
      }
    } finally {
      busy.current = false;
      if (currentRevision === revision.current) setPreparing(false);
    }
  };

  const handleApprove = async () => {
    if (busy.current || approvalFinished || !request || !review) return;
    const currentRevision = revision.current;
    const assertApprovalCurrent = () => {
      assertCurrent(currentRevision);
      if (Date.now() >= review.expiresAt) throw new Error('Transaction review expired. Review it again.');
    };
    busy.current = true;
    setSigning(true);
    setError(null);
    try {
      assertApprovalCurrent();
      await assertResources(review.provider, review.transaction);
      assertApprovalCurrent();
      await withAuthenticatedAccountSigner(
        {
          signerAddress: request.signerAddress,
          provider: review.provider,
          authOperation: isSend ? 'send this transaction' : 'sign this transaction',
          assertCurrent: assertApprovalCurrent,
        },
        async ({ signer }) => {
          assertApprovalCurrent();
          const transaction = copyTransaction(review.transaction);
          const priorSignatures = review.transaction.signatures ?? [];
          await signer.signTransaction(transaction);
          assertApprovalCurrent();
          if (transactionPayload(transaction) !== transactionPayload(review.transaction) ||
              transaction.signatures?.length !== priorSignatures.length + 1 ||
              priorSignatures.some((signature, index) => transaction.signatures?.[index] !== signature)) {
            throw new Error('The signature changed the transaction you reviewed.');
          }
          setApprovalFinished(true);
          if (isSend) {
            const receipt = await submitTransactionOnce({
              provider: review.provider,
              transaction,
              assertCurrent: assertApprovalCurrent,
              ...(recovery ? { retryOnly: true } : {}),
              pending: recovery ?? {
                address: request.signerAddress,
                networkMode,
                source,
                appOrigin: normalizedOrigin,
                transaction: buildPendingTransactionFromBroadcast({
                  address: request.signerAddress,
                  chainTransactionId: transaction.id,
                  transaction,
                  getTokenByContractId: useTokenStore.getState().getTokenByContractId,
                }),
              },
              onPersisted: (pending) => useTransactionStore.getState().addPendingTransaction(pending),
              onRejected: (pending) => {
                if (pending.chainTransactionId) {
                  useTransactionStore.getState().removeRejectedSubmission(pending, pending.chainTransactionId);
                }
              },
            });
            onApprove({ transaction, receipt });
          } else {
            onApprove({ transaction });
          }
        }
      );
      HapticFeedback.success();
    } catch (err) {
      txLogger.error('Transaction approval failed:', err);
      if (currentRevision === revision.current) {
        const message = err instanceof Error ? err.message : 'Failed to approve transaction';
        setError(message);
        if (err instanceof TransactionOutcomeUnknownError || err instanceof TransactionRejectedError) {
          onReject(message);
        } else {
          setApprovalFinished(false);
        }
      }
      HapticFeedback.error();
    } finally {
      busy.current = false;
      if (currentRevision === revision.current) setSigning(false);
    }
  };

  // Handle rejection
  const handleReject = useCallback(() => {
    revision.current += 1;
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
              {recovery ? 'Activity' : 'Your wallet is interacting with:'}
            </Text>
            <Text style={styles.appNameLarge}>{recovery ? 'Review original send' : appName || simplifiedDomain}</Text>
            {!recovery && <Text style={styles.appOrigin} numberOfLines={1}>
              {originSecurity.displayOrigin}
            </Text>}
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
                <Text style={styles.noticeTitle}>{recovery ? 'Original transaction' : 'Origin and network review'}</Text>
                <Text style={styles.noticeText}>
                  {recovery ? 'Retry the same send with its original amount, recipient and maximum mana.' : unsupportedSwap
                    ? unsupportedSwapMessage
                    : 'Review the site origin and network before approving this transaction.'}
                </Text>
              </View>
            </View>

            <View style={styles.summaryGrid}>
              {!recovery && <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Site Origin</Text>
                <Text style={styles.summaryValue}>{originSecurity.displayOrigin}</Text>
              </View>}
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
                            <Text style={styles.detailValue} numberOfLines={recovery ? undefined : 3}>
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

            {review ? (
              <View style={styles.advancedCard}>
                <Text style={styles.advancedLabel}>Reviewed transaction</Text>
                <Text style={styles.advancedValue}>Payer {review.transaction.header?.payer}</Text>
                {review.transaction.header?.payee && (
                  <Text style={styles.advancedValue}>Payee {review.transaction.header.payee}</Text>
                )}
                <Text style={styles.advancedValue}>Maximum mana {formatMana(String(review.transaction.header?.rc_limit))}</Text>
                <TouchableOpacity onPress={() => setReview(null)} disabled={signing || approvalFinished}>
                  <Text style={styles.advancedLabel}>Review again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.advancedCard}>
                {canSetPayer && (
                  <TouchableOpacity onPress={() => setSponsoredMana((enabled) => !enabled)} disabled={preparing}>
                    <Text style={styles.advancedValue}>
                      {sponsoredMana ? 'Paying with sponsored mana' : 'Paying with account mana'}
                    </Text>
                  </TouchableOpacity>
                )}
                {canSetRc && (
                  <>
                    <Text style={styles.advancedLabel}>Maximum mana</Text>
                    <TextInput
                      accessibilityLabel="Maximum mana"
                      style={styles.advancedValue}
                      value={rcLimit}
                      editable={!preparing}
                      keyboardType="decimal-pad"
                      onChangeText={setRcLimit}
                    />
                  </>
                )}
              </View>
            )}

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
                    {requestedAccount?.name || 'Unknown'}
                  </Text>
                  <Text style={styles.advancedValueSmall} numberOfLines={1}>
                    {request.signerAddress}
                  </Text>
                </View>

                {/* Transaction Header */}
                {(review?.transaction ?? request.transaction).header && (
                  <View style={styles.advancedCard}>
                    <Text style={styles.advancedLabel}>Transaction Header</Text>
                    {(review?.transaction ?? request.transaction).header?.payer && (
                      <View style={styles.advancedRow}>
                        <Text style={styles.advancedRowLabel}>Payer:</Text>
                        <Text style={styles.advancedRowValue} numberOfLines={1}>
                          {(review?.transaction ?? request.transaction).header?.payer}
                        </Text>
                      </View>
                    )}
                    {(review?.transaction ?? request.transaction).header?.payee && (
                      <View style={styles.advancedRow}>
                        <Text style={styles.advancedRowLabel}>Payee:</Text>
                        <Text style={styles.advancedRowValue} numberOfLines={1}>
                          {(review?.transaction ?? request.transaction).header?.payee}
                        </Text>
                      </View>
                    )}
                    {(review?.transaction ?? request.transaction).header?.nonce && (
                      <View style={styles.advancedRow}>
                        <Text style={styles.advancedRowLabel}>Nonce:</Text>
                        <Text style={styles.advancedRowValue}>
                          {(review?.transaction ?? request.transaction).header?.nonce}
                        </Text>
                      </View>
                    )}
                    {(review?.transaction ?? request.transaction).header?.rc_limit && (
                      <View style={styles.advancedRow}>
                        <Text style={styles.advancedRowLabel}>RC Limit:</Text>
                        <Text style={styles.advancedRowValue}>
                          {(review?.transaction ?? request.transaction).header?.rc_limit}
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
                {recovery ? 'Check the recipient and token contract before you retry.' : 'Interacting with unknown contracts can be risky. Only proceed if you trust this application.'}
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
            onPress={review ? handleApprove : handleReview}
            disabled={signing || preparing || loading || approvalFinished}
          >
            {signing || preparing ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={styles.approveButtonText}>
                {review ? (recovery ? 'Retry send' : isSend ? 'Send' : 'Sign') : 'Review'}
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
