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
  Image,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { useWalletStore } from '../stores/walletStore';
import { useKoinosStore } from '../stores/koinosStore';
import { useTokenStore, Token } from '../stores/tokenStore';
import { truncateAddress, formatKoinBalance } from '../lib/utils';
import colors from '../theme/colors';

export const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const { address, balance, updateBalance } = useWalletStore();
  const { getBalance, getMana, initialize } = useKoinosStore();
  const { tokens, isLoading: tokensLoading, initialize: initializeTokens, refreshBalances } = useTokenStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [manaPercentage, setManaPercentage] = useState<number>(0);

  const initializeAndLoadBalance = useCallback(async () => {
    try {
      if (!isInitialized && address) {
        await initialize();
        await initializeTokens(address);
        setIsInitialized(true);
      }
      await refreshBalance();
    } catch (error: any) {
      console.error('Failed to initialize:', error);
    }
  }, [isInitialized, address]);

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
      // Refresh token balances
      await refreshBalances(address);

      // Get KOIN balance for portfolio display
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

  // Calculate total portfolio value (for now just sum of balances, no USD)
  const totalBalance = tokens.reduce((sum, token) => {
    const bal = parseFloat(token.balance) || 0;
    return sum + bal;
  }, 0);

  // Get KOIN balance for display
  const koinToken = tokens.find(t => t.symbol === 'KOIN');
  const koinBalance = koinToken?.balance || balance || '0';

  // Handle token press - navigate to token detail
  const handleTokenPress = (token: Token) => {
    navigation.navigate('TokenDetail', { token });
  };

  // Render token item
  const renderTokenItem = ({ item: token }: { item: Token }) => (
    <TouchableOpacity
      style={styles.tokenItem}
      onPress={() => handleTokenPress(token)}
    >
      <View style={styles.tokenIconContainer}>
        {token.icon ? (
          <Image
            source={{ uri: token.icon }}
            style={styles.tokenIconImage}
            defaultSource={require('../../assets/icon.png')}
          />
        ) : (
          <View style={styles.tokenIcon}>
            <Text style={styles.tokenIconText}>{token.symbol.charAt(0)}</Text>
          </View>
        )}
      </View>
      <View style={styles.tokenInfo}>
        <Text style={styles.tokenName}>{token.name}</Text>
        <Text style={styles.tokenSymbol}>{token.symbol}</Text>
      </View>
      <View style={styles.tokenBalance}>
        <Text style={styles.tokenAmount}>
          {parseFloat(token.balance) > 0 ? formatKoinBalance(token.balance) : '0'}
        </Text>
        <Text style={styles.tokenValue}>{token.symbol}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );

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

  const getManaColor = () => {
    if (manaPercentage < 20) return colors.error;
    if (manaPercentage < 50) return colors.warning;
    return colors.success;
  };

  return (
    <Screen scroll={false}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
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
                <Ionicons name="copy-outline" size={14} color={colors.textTertiary} style={styles.copyIcon} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('Contacts')}
            >
              <Ionicons name="people-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('Settings')}
            >
              <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Portfolio Card */}
        <View style={styles.portfolioCard}>
          <Text style={styles.portfolioLabel}>Portfolio</Text>
          <Text style={styles.portfolioSubLabel}>Total Balance</Text>
          <Text style={styles.portfolioValue}>
            {formatKoinBalance(koinBalance)} KOIN
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
              <Ionicons name="arrow-down" size={24} color={colors.textPrimary} />
            </View>
            <Text style={styles.actionLabel}>Receive</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Send')}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="arrow-up" size={24} color={colors.textPrimary} />
            </View>
            <Text style={styles.actionLabel}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Swap')}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="swap-horizontal" size={24} color={colors.textPrimary} />
            </View>
            <Text style={styles.actionLabel}>Swap</Text>
          </TouchableOpacity>
        </View>

        {/* Tokens Section */}
        <View style={styles.tokensSection}>
          <View style={styles.tokensSectionHeader}>
            <Text style={styles.sectionTitle}>Tokens</Text>
            <Text style={styles.tokenCount}>{tokens.length}</Text>
          </View>
          {tokens.length === 0 && tokensLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading tokens...</Text>
            </View>
          ) : (
            <FlatList
              data={tokens}
              keyExtractor={(item) => item.contractId}
              renderItem={renderTokenItem}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.tokenSeparator} />}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No tokens found</Text>
                </View>
              }
            />
          )}
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
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
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
    marginLeft: 6,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  portfolioCard: {
    marginHorizontal: 16,
    marginVertical: 12,
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
    paddingHorizontal: 16,
    marginBottom: 32,
    gap: 16,
  },
  actionButton: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
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
  tokensSection: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  tokensSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tokenCount: {
    fontSize: 14,
    color: colors.textTertiary,
    marginLeft: 8,
    backgroundColor: colors.elevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
  },
  tokenIconContainer: {
    marginRight: 12,
  },
  tokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenIconImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.elevated,
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
    marginRight: 8,
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
  tokenSeparator: {
    height: 8,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
