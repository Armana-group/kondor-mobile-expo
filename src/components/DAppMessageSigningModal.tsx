import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { utils } from 'koilib';
import colors from '../theme/colors';
import { inspectDAppOrigin } from '../lib/dapp/originSecurity';
import {
  normalizeBytesInput,
  normalizeHashBytes,
  normalizeMessageForSigning,
  signHashWithAuthenticatedAccount,
  signMessageWithAuthenticatedAccount,
} from '../lib/dapp/messageSigning';
import { useWalletStore } from '../stores/walletStore';
import { HapticFeedback } from '../lib/haptics';

export interface DAppMessageSigningRequest {
  signerAddress: string;
  kind: 'message' | 'hash';
  message?: unknown;
  hash?: unknown;
}

interface DAppMessageSigningModalProps {
  visible: boolean;
  request: DAppMessageSigningRequest | null;
  appName: string;
  appOrigin: string;
  onApprove: (signature: string | Uint8Array) => void;
  onReject: (error: string) => void;
}

function truncateMiddle(value: string, start = 16, end = 12): string {
  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

function formatMessagePreview(message: unknown, showRawData: boolean): string {
  try {
    const normalized = normalizeMessageForSigning(message);

    if (typeof normalized === 'string') {
      return normalized || '(empty message)';
    }

    const bytes = normalized instanceof Uint8Array
      ? normalized
      : normalizeBytesInput(normalized);
    const base64url = utils.encodeBase64url(bytes);
    return showRawData ? bytesToHex(bytes) : truncateMiddle(base64url, 24, 18);
  } catch {
    return '(invalid message payload)';
  }
}

function formatHashPreview(hash: unknown, showRawData: boolean): string {
  try {
    const bytes = normalizeHashBytes(hash);
    const hex = bytesToHex(bytes);
    return showRawData ? hex : truncateMiddle(hex, 18, 18);
  } catch {
    return '(invalid raw hash)';
  }
}

export const DAppMessageSigningModal: React.FC<DAppMessageSigningModalProps> = ({
  visible,
  request,
  appName,
  appOrigin,
  onApprove,
  onReject,
}) => {
  const accounts = useWalletStore((state) => state.accounts);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [hashAcknowledged, setHashAcknowledged] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSigning(false);
    setError(null);
    setShowRawData(false);
    setHashAcknowledged(false);
  }, [visible, request]);

  const security = useMemo(
    () =>
      inspectDAppOrigin(appOrigin, {
        highRiskRequest: request?.kind === 'hash' ? 'raw hash signing' : 'message signing',
      }),
    [appOrigin, request?.kind]
  );

  const signerAccount = request
    ? accounts.find((account) => account.address === request.signerAddress)
    : undefined;

  const preview = request?.kind === 'hash'
    ? formatHashPreview(request.hash, showRawData)
    : formatMessagePreview(request?.message, showRawData);

  const handleReject = () => {
    HapticFeedback.selection();
    onReject(request?.kind === 'hash' ? 'User rejected the hash signing request' : 'User rejected the message signing request');
  };

  const handleRequestClose = () => {
    if (signing) {
      return;
    }

    handleReject();
  };

  const handleApprove = async () => {
    if (!request) {
      setError('No signing request is active.');
      return;
    }

    if (request.kind === 'hash' && !hashAcknowledged) {
      setError('Raw hash signing requires explicit confirmation.');
      return;
    }

    setSigning(true);
    setError(null);

    try {
      const signature = request.kind === 'hash'
        ? await signHashWithAuthenticatedAccount({
            signerAddress: request.signerAddress,
            hash: request.hash,
          })
        : await signMessageWithAuthenticatedAccount({
            signerAddress: request.signerAddress,
            message: request.message,
          });

      HapticFeedback.success();
      onApprove(signature);
    } catch (signingError) {
      HapticFeedback.error();
      setError(signingError instanceof Error ? signingError.message : 'Failed to sign request');
      setSigning(false);
    }
  };

  if (!visible || !request) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerLabel}>Your wallet is interacting with:</Text>
          <Text style={styles.appName}>{appName || security.siteName}</Text>
          <Text style={styles.appOrigin} numberOfLines={1}>
            {security.displayOrigin}
          </Text>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.noticeCard}>
            <Ionicons
              name={security.level === 'trusted' ? 'shield-checkmark' : 'warning'}
              size={18}
              color={security.level === 'trusted' ? colors.success : colors.warning}
            />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>
                {request.kind === 'hash' ? 'Raw hash signing request' : 'Message signing request'}
              </Text>
              <Text style={styles.noticeText}>
                {security.signals[0]?.detail || 'Review the request carefully before approving.'}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.card}>
              <Text style={styles.accountName}>{signerAccount?.name || 'Unknown account'}</Text>
              <Text style={styles.accountAddress}>{request.signerAddress}</Text>
            </View>
          </View>

          <View style={styles.rawToggleRow}>
            <View>
              <Text style={styles.sectionLabel}>Raw data</Text>
              <Text style={styles.rawToggleHelp}>
                {request.kind === 'hash'
                  ? 'Show the full hash bytes exactly as received.'
                  : 'Show the exact payload bytes when this request is not plain text.'}
              </Text>
            </View>
            <Switch
              value={showRawData}
              onValueChange={setShowRawData}
              trackColor={{ false: colors.border, true: colors.purpleLight }}
              thumbColor={showRawData ? colors.purple : colors.textPrimary}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {request.kind === 'hash' ? 'Hash Preview' : 'Message Preview'}
            </Text>
            <View style={styles.card}>
              <Text style={styles.previewText}>{preview}</Text>
            </View>
          </View>

          {request.kind === 'hash' && (
            <TouchableOpacity
              style={[
                styles.acknowledgementCard,
                hashAcknowledged && styles.acknowledgementCardSelected,
              ]}
              onPress={() => setHashAcknowledged((current) => !current)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={hashAcknowledged ? 'checkbox' : 'square-outline'}
                size={20}
                color={hashAcknowledged ? colors.purple : colors.textTertiary}
              />
              <Text style={styles.acknowledgementText}>
                I understand this is a raw hash request and Kondor cannot show the original message.
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleReject}
            disabled={signing}
          >
            <Text style={styles.secondaryButtonText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton, signing && styles.buttonDisabled]}
            onPress={handleApprove}
            disabled={signing}
          >
            {signing ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Approve</Text>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    backgroundColor: colors.card,
  },
  headerLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  appOrigin: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textTertiary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeCopy: {
    flex: 1,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  accountAddress: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  rawToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rawToggleHelp: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textTertiary,
    maxWidth: 250,
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  acknowledgementCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.warning + '14',
    borderWidth: 1,
    borderColor: colors.warning + '55',
  },
  acknowledgementCardSelected: {
    borderColor: colors.purple,
    backgroundColor: colors.purpleLight,
  },
  acknowledgementText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  errorContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.error + '18',
    borderWidth: 1,
    borderColor: colors.error + '55',
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: colors.purple,
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
