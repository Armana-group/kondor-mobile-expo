import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { useWalletStore } from '../stores/walletStore';
import { useKoinosStore } from '../stores/koinosStore';
import { truncateAddress, formatKoinBalance } from '../lib/utils';
import colors from '../theme/colors';

export const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const { address, balance, updateBalance } = useWalletStore();
  const { getBalance, getMana, initialize } = useKoinosStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [manaPercentage, setManaPercentage] = useState<number>(0);

  const initializeAndLoadBalance = useCallback(async () => {
    try {
      if (!isInitialized) {
        await initialize();
        setIsInitialized(true);
      }
      await refreshBalance();
    } catch (error: any) {
      console.error('Failed to initialize:', error);
    }
  }, [isInitialized]);

  useFocusEffect(
    useCallback(() => {
      initializeAndLoadBalance();
    }, [])
  );

  const refreshBalance = async () => {
    if (!address) {
      console.log('[HomeScreen] No address, skipping balance refresh');
      return;
    }

    console.log('[HomeScreen] Refreshing balance for address:', address);
    setIsRefreshing(true);
    try {
      const newBalance = await getBalance(address);
      console.log('[HomeScreen] Balance fetched successfully:', newBalance);
      updateBalance(newBalance);

      // Fetch mana
      try {
        const manaData = await getMana(address);
        console.log('[HomeScreen] Mana fetched successfully:', manaData);
        setManaPercentage(manaData.availablePercentage);
      } catch (manaError: any) {
        console.error('[HomeScreen] Mana fetch error:', manaError);
      }
    } catch (error: any) {
      console.error('[HomeScreen] Balance fetch error:', error);
      Alert.alert('Error', `Failed to fetch balance: ${error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(address);
    Alert.alert('Copied!', 'Address copied to clipboard');
  };

  const handleReceive = () => {
    Alert.alert(
      'Receive KOIN',
      `Share your address to receive KOIN:\n\n${address}`,
      [
        { text: 'Copy Address', onPress: handleCopyAddress },
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? Make sure you have your recovery phrase saved!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await useWalletStore.getState().clearWallet();
            useKoinosStore.getState().reset();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Welcome' }],
            });
          },
        },
      ]
    );
  };

  const getManaColor = () => {
    if (manaPercentage < 20) return colors.error;
    if (manaPercentage < 50) return colors.warning;
    return colors.success;
  };

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshBalance}
            tintColor={colors.purple}
          />
        }>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.accountInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>A1</Text>
            </View>
            <View>
              <Text style={styles.accountName}>Account 1</Text>
              <TouchableOpacity onPress={handleCopyAddress} style={styles.addressRow}>
                <Text style={styles.address}>{truncateAddress(address)}</Text>
                <Text style={styles.copyIcon}>📋</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('Contacts')}
            >
              <Text style={styles.headerButtonText}>👥</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleLogout}
            >
              <Text style={styles.headerButtonText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Portfolio Card */}
        <View style={styles.portfolioCard}>
          <Text style={styles.portfolioLabel}>Portfolio</Text>
          <Text style={styles.portfolioSubLabel}>Total Balance</Text>
          <Text style={styles.portfolioValue}>
            {formatKoinBalance(balance)} KOIN
          </Text>

          {/* Mana Bar */}
          <View style={styles.manaContainer}>
            <View style={styles.manaHeader}>
              <Text style={styles.manaLabel}>Mana Available</Text>
              <Text style={[styles.manaValue, { color: getManaColor() }]}>
                {manaPercentage.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.manaBarContainer}>
              <View
                style={[
                  styles.manaBar,
                  {
                    width: `${Math.min(manaPercentage, 100)}%`,
                    backgroundColor: getManaColor(),
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleReceive}>
            <View style={styles.actionIconContainer}>
              <Text style={styles.actionIcon}>📥</Text>
            </View>
            <Text style={styles.actionLabel}>Receive</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Send')}>
            <View style={styles.actionIconContainer}>
              <Text style={styles.actionIcon}>📤</Text>
            </View>
            <Text style={styles.actionLabel}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Swap')}>
            <View style={styles.actionIconContainer}>
              <Text style={styles.actionIcon}>🔄</Text>
            </View>
            <Text style={styles.actionLabel}>Swap</Text>
          </TouchableOpacity>
        </View>

        {/* Tokens Section */}
        <View style={styles.tokensSection}>
          <Text style={styles.sectionTitle}>Tokens</Text>
          <TouchableOpacity style={styles.tokenItem}>
            <View style={styles.tokenIcon}>
              <Text style={styles.tokenIconText}>K</Text>
            </View>
            <View style={styles.tokenInfo}>
              <Text style={styles.tokenName}>Koinos</Text>
              <Text style={styles.tokenSymbol}>KOIN</Text>
            </View>
            <View style={styles.tokenBalance}>
              <Text style={styles.tokenAmount}>{formatKoinBalance(balance)}</Text>
              <Text style={styles.tokenValue}>KOIN</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingTop: 16,
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.purple,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  address: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyIcon: {
    fontSize: 12,
    marginLeft: 6,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 20,
  },
  portfolioCard: {
    margin: 20,
    marginTop: 8,
    padding: 24,
    backgroundColor: colors.card,
    borderRadius: 16,
  },
  portfolioLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  portfolioSubLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  portfolioValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  manaContainer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  manaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  manaLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  manaValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  manaBarContainer: {
    height: 6,
    backgroundColor: colors.elevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  manaBar: {
    height: '100%',
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 32,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  tokensSection: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
  },
  tokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tokenIconText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tokenSymbol: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tokenBalance: {
    alignItems: 'flex-end',
  },
  tokenAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tokenValue: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
