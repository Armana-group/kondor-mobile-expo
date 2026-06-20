/**
 * Receive Screen
 * Shows QR code and address for receiving tokens
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
  Image,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Screen } from '../components/Screen';
import { BackupStatusNotice } from '../components/BackupStatusNotice';
import { useWalletStore } from '../stores/walletStore';
import { Token } from '../stores/tokenStore';
import { HapticFeedback } from '../lib/haptics';
import { logger } from '../lib/logger';
import colors from '../theme/colors';

type ReceiveRouteParams = {
  Receive: { token?: Token } | undefined;
};

export const ReceiveScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ReceiveRouteParams, 'Receive'>>();
  const { address, backupHealth } = useWalletStore();

  const token = route.params?.token;

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(address);
    await HapticFeedback.success();
    Alert.alert('Copied!', 'Address copied to clipboard');
  };

  const handleShare = async () => {
    try {
      const message = token
        ? `Send ${token.symbol} to my Koinos address:\n${address}`
        : `My Koinos address:\n${address}`;

      await Share.share({
        message,
        title: 'My Koinos Address',
      });
    } catch (error) {
      logger.error('Share error:', error);
    }
  };

  const handleBackupPress = () => {
    navigation.navigate('Settings');
  };

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            Receive {token?.symbol || 'Tokens'}
          </Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Token Info (if specific token) */}
        {token && (
          <View style={styles.tokenInfo}>
            {token.icon ? (
              <Image
                source={{ uri: token.icon }}
                style={styles.tokenIcon}
                defaultSource={require('../../assets/icon.png')}
              />
            ) : (
              <View style={styles.tokenIconFallback}>
                <Text style={styles.tokenIconText}>{token.symbol.charAt(0)}</Text>
              </View>
            )}
            <Text style={styles.tokenName}>{token.name}</Text>
          </View>
        )}

        <BackupStatusNotice backupHealth={backupHealth} onPress={handleBackupPress} />

        {/* QR Code */}
        <View style={styles.qrContainer}>
          <View style={styles.qrBackground}>
            <QRCode
              value={address}
              size={220}
              backgroundColor={colors.textPrimary}
              color={colors.background}
            />
          </View>
        </View>

        {/* Instructions */}
        <Text style={styles.instructions}>
          Scan this QR code or share your address to receive{' '}
          {token?.symbol || 'tokens'}
        </Text>

        {/* Address Display */}
        <TouchableOpacity style={styles.addressContainer} onPress={handleCopyAddress}>
          <Text style={styles.addressLabel}>Your Address</Text>
          <Text style={styles.address}>{address}</Text>
          <View style={styles.copyHint}>
            <Ionicons name="copy-outline" size={16} color={colors.purple} />
            <Text style={styles.copyHintText}>Tap to copy</Text>
          </View>
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleCopyAddress}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="copy-outline" size={24} color={colors.textPrimary} />
            </View>
            <Text style={styles.actionLabel}>Copy</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="share-outline" size={24} color={colors.textPrimary} />
            </View>
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Warning */}
        <View style={styles.warningContainer}>
          <Ionicons name="warning-outline" size={20} color={colors.warning} />
          <Text style={styles.warningText}>
            Only send Koinos tokens to this address. Sending other blockchain
            assets will result in permanent loss.
          </Text>
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  tokenInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  tokenIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.elevated,
    marginBottom: 8,
  },
  tokenIconFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  tokenIconText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  tokenName: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrBackground: {
    backgroundColor: colors.textPrimary,
    padding: 16,
    borderRadius: 16,
  },
  instructions: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  addressContainer: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  addressLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  address: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  copyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyHintText: {
    fontSize: 12,
    color: colors.purple,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 24,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  warningContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning,
    lineHeight: 18,
  },
});
