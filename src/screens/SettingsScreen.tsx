import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useWalletStore } from '../stores/walletStore';
import { HapticFeedback } from '../lib/haptics';
import { copyWithAutoClear } from '../lib/clipboard';
import { sanitizeErrorForUser } from '../lib/logger';
import colors from '../theme/colors';

export const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const { getMnemonic, getPrivateKey, clearWallet } = useWalletStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleViewSeedPhrase = async () => {
    Alert.alert(
      'View Recovery Phrase',
      'Your recovery phrase gives full access to your wallet. Never share it with anyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            setIsLoading(true);
            try {
              const mnemonic = await getMnemonic();
              if (mnemonic) {
                Alert.alert(
                  'Recovery Phrase',
                  mnemonic,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Copy',
                      onPress: async () => {
                        await copyWithAutoClear(mnemonic);
                        await HapticFeedback.success();
                        Alert.alert('Copied', 'Recovery phrase copied to clipboard. It will be cleared in 30 seconds.');
                      },
                    },
                  ]
                );
              } else {
                Alert.alert('Error', 'Unable to retrieve recovery phrase');
              }
            } catch (error: any) {
              Alert.alert('Error', sanitizeErrorForUser(error, 'Failed to get recovery phrase'));
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleViewPrivateKey = async () => {
    Alert.alert(
      'View Private Key',
      'Your private key gives full access to your wallet. Never share it with anyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            setIsLoading(true);
            try {
              const privateKey = await getPrivateKey();
              if (privateKey) {
                Alert.alert(
                  'Private Key',
                  privateKey,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Copy',
                      onPress: async () => {
                        await copyWithAutoClear(privateKey);
                        await HapticFeedback.success();
                        Alert.alert('Copied', 'Private key copied to clipboard. It will be cleared in 30 seconds.');
                      },
                    },
                  ]
                );
              } else {
                Alert.alert('Error', 'Unable to retrieve private key');
              }
            } catch (error: any) {
              Alert.alert('Error', sanitizeErrorForUser(error, 'Failed to get private key'));
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Remove Wallet',
      'Are you sure you want to remove this wallet? Make sure you have backed up your recovery phrase.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearWallet();
              // Navigation will be handled by AppNavigator when wallet is cleared
            } catch (error: any) {
              Alert.alert('Error', 'Failed to remove wallet');
            }
          },
        },
      ]
    );
  };

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Security Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Security</Text>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={handleViewSeedPhrase}
              disabled={isLoading}
            >
              <View style={styles.settingItemLeft}>
                <Ionicons name="shield-outline" size={22} color={colors.purple} />
                <Text style={styles.settingItemText}>View Recovery Phrase</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              style={styles.settingItem}
              onPress={handleViewPrivateKey}
              disabled={isLoading}
            >
              <View style={styles.settingItemLeft}>
                <Ionicons name="key-outline" size={22} color={colors.purple} />
                <Text style={styles.settingItemText}>View Private Key</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Network Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Network</Text>

            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <Ionicons name="globe-outline" size={22} color={colors.purple} />
                <Text style={styles.settingItemText}>Network</Text>
              </View>
              <Text style={styles.settingItemValue}>Mainnet</Text>
            </View>
          </View>

          {/* Connected Sites */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DApps</Text>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => navigation.navigate('ConnectedSites')}
            >
              <View style={styles.settingItemLeft}>
                <Ionicons name="globe-outline" size={22} color={colors.purple} />
                <Text style={styles.settingItemText}>Connected Sites</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* About Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>

            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <Ionicons name="information-circle-outline" size={22} color={colors.purple} />
                <Text style={styles.settingItemText}>Version</Text>
              </View>
              <Text style={styles.settingItemValue}>1.0.0</Text>
            </View>
          </View>

          {/* Danger Zone */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Danger Zone</Text>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={handleLogout}
            >
              <View style={styles.settingItemLeft}>
                <Ionicons name="trash-outline" size={22} color={colors.error} />
                <Text style={[styles.settingItemText, { color: colors.error }]}>
                  Remove Wallet
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.purple} />
          </View>
        )}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingItemText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  settingItemValue: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  separator: {
    height: 8,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
