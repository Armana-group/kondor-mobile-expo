/**
 * WCSessionApprovalModal
 *
 * Modal for approving or rejecting WalletConnect session proposals.
 * Shows dApp information and requested permissions.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticFeedback } from '../lib/haptics';
import { WCSessionProposal, KOINOS_METHODS } from '../stores/walletConnectStore';
import colors from '../theme/colors';

interface WCSessionApprovalModalProps {
  visible: boolean;
  proposal: WCSessionProposal | null;
  walletAddress: string;
  onApprove: () => void;
  onReject: () => void;
}

// Get simplified domain from URL
function getSimplifiedDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

// Get human-readable method names
function getMethodDisplayName(method: string): string {
  const methodNames: Record<string, string> = {
    [KOINOS_METHODS.SignMessage]: 'Sign Messages',
    [KOINOS_METHODS.SignHash]: 'Sign Hash',
    [KOINOS_METHODS.SignTransaction]: 'Sign Transactions',
    [KOINOS_METHODS.SignAndSendTransaction]: 'Sign & Send Transactions',
    [KOINOS_METHODS.PrepareTransaction]: 'Prepare Transactions',
    [KOINOS_METHODS.WaitForTransaction]: 'Wait for Transactions',
    [KOINOS_METHODS.ReadContract]: 'Read Contracts',
    [KOINOS_METHODS.GetNonce]: 'Get Account Nonce',
    [KOINOS_METHODS.GetAccountRc]: 'Get Account Mana',
    [KOINOS_METHODS.GetHeadInfo]: 'Get Chain Info',
  };
  return methodNames[method] || method.replace('koinos_', '');
}

// Group methods into categories
function categorizePermissions(methods: string[]): { critical: string[]; standard: string[] } {
  const criticalMethods = [
    KOINOS_METHODS.SignTransaction,
    KOINOS_METHODS.SignAndSendTransaction,
    KOINOS_METHODS.SignMessage,
    KOINOS_METHODS.SignHash,
  ];

  return {
    critical: methods.filter((m) => criticalMethods.includes(m as any)),
    standard: methods.filter((m) => !criticalMethods.includes(m as any)),
  };
}

export const WCSessionApprovalModal: React.FC<WCSessionApprovalModalProps> = ({
  visible,
  proposal,
  walletAddress,
  onApprove,
  onReject,
}) => {
  const handleApprove = useCallback(() => {
    HapticFeedback.success();
    onApprove();
  }, [onApprove]);

  const handleReject = useCallback(() => {
    HapticFeedback.selection();
    onReject();
  }, [onReject]);

  if (!visible || !proposal) return null;

  const { peerMeta, params } = proposal;
  const domain = getSimplifiedDomain(peerMeta.url);

  // Get requested methods from namespaces
  const requestedMethods: string[] = [];
  const requiredNamespaces = params.requiredNamespaces || {};
  const optionalNamespaces = params.optionalNamespaces || {};

  // Collect all requested methods
  Object.values({ ...requiredNamespaces, ...optionalNamespaces }).forEach((ns: any) => {
    if (ns.methods) {
      requestedMethods.push(...ns.methods.filter((m: string) => !requestedMethods.includes(m)));
    }
  });

  const { critical, standard } = categorizePermissions(requestedMethods);

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
          <Text style={styles.headerLabel}>Connection Request</Text>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* App Info */}
          <View style={styles.appInfo}>
            {peerMeta.icons?.[0] ? (
              <Image source={{ uri: peerMeta.icons[0] }} style={styles.appIcon} />
            ) : (
              <View style={[styles.appIcon, styles.appIconPlaceholder]}>
                <Ionicons name="globe-outline" size={32} color={colors.textSecondary} />
              </View>
            )}
            <Text style={styles.appName}>{peerMeta.name}</Text>
            <Text style={styles.appDomain}>{domain}</Text>
            {peerMeta.description && (
              <Text style={styles.appDescription} numberOfLines={2}>
                {peerMeta.description}
              </Text>
            )}
          </View>

          {/* Connected Account */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connect with</Text>
            <View style={styles.accountCard}>
              <Ionicons name="wallet-outline" size={24} color={colors.purple} />
              <Text style={styles.accountAddress} numberOfLines={1}>
                {walletAddress}
              </Text>
            </View>
          </View>

          {/* Permissions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Permissions Requested</Text>

            {/* Critical Permissions */}
            {critical.length > 0 && (
              <View style={styles.permissionGroup}>
                <View style={styles.permissionGroupHeader}>
                  <Ionicons name="shield" size={16} color={colors.warning} />
                  <Text style={styles.permissionGroupTitle}>Requires Approval</Text>
                </View>
                {critical.map((method, index) => (
                  <View key={index} style={styles.permissionItem}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.warning} />
                    <Text style={styles.permissionText}>{getMethodDisplayName(method)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Standard Permissions */}
            {standard.length > 0 && (
              <View style={styles.permissionGroup}>
                <View style={styles.permissionGroupHeader}>
                  <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
                  <Text style={styles.permissionGroupTitleLight}>Read-only Access</Text>
                </View>
                {standard.slice(0, 5).map((method, index) => (
                  <View key={index} style={styles.permissionItem}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.textTertiary} />
                    <Text style={styles.permissionTextLight}>{getMethodDisplayName(method)}</Text>
                  </View>
                ))}
                {standard.length > 5 && (
                  <Text style={styles.morePermissions}>
                    +{standard.length - 5} more permissions
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Warning */}
          <View style={styles.warningContainer}>
            <Ionicons name="warning" size={20} color={colors.warning} />
            <Text style={styles.warningText}>
              Only connect to sites you trust. This app will be able to request transaction
              signatures from your wallet.
            </Text>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.rejectButton} onPress={handleReject}>
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.approveButton} onPress={handleApprove}>
            <Ionicons name="link" size={20} color={colors.textPrimary} style={styles.buttonIcon} />
            <Text style={styles.approveButtonText}>Connect</Text>
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
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  appInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appIcon: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: 12,
  },
  appIconPlaceholder: {
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  appDomain: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  appDescription: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  accountAddress: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  permissionGroup: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  permissionGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  permissionGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.warning,
  },
  permissionGroupTitleLight: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  permissionText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  permissionTextLight: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  morePermissions: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 6,
    paddingLeft: 28,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${colors.warning}15`,
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: colors.warning,
    marginLeft: 10,
    lineHeight: 18,
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3B99FC', // WalletConnect blue
    gap: 8,
  },
  buttonIcon: {
    marginRight: 4,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
