import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { AccountSwitcher } from '../components/AccountSwitcher';
import { BackupStatusNotice } from '../components/BackupStatusNotice';
import { useWalletStore } from '../stores/walletStore';
import { useKoinosStore } from '../stores/koinosStore';
import {
  useTokenStore,
  Token,
  getVisibleTokens,
  getScopedTokens,
  isTokenScopeLoading,
} from '../stores/tokenStore';
import { useNetworkStore } from '../stores/networkStore';
import { useTransactionStore } from '../stores/transactionStore';
import { tokenPriceService } from '../lib/tokenPrices';
import { truncateAddress, formatKoinBalance } from '../lib/utils';
import { HapticFeedback } from '../lib/haptics';
import { koinosLogger, sanitizeErrorForUser } from '../lib/logger';
import colors from '../theme/colors';

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const { address, updateBalance, accounts, getActiveAccount, backupHealth } = useWalletStore();
  const { getBalance, getMana, initialize, reset: resetKoinos } = useKoinosStore();
  const {
    tokens,
    isLoading: tokensLoading,
    cacheKey: tokenCacheKey,
    initialize: initializeTokens,
    refreshBalances,
    reset: resetTokens,
  } = useTokenStore();
  const networkMode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [manaPercentage, setManaPercentage] = useState<number>(0);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [portfolioValueUsd, setPortfolioValueUsd] = useState<number | null>(null);
  const [portfolioPricingCycle, setPortfolioPricingCycle] = useState<{
    scope: string;
    version: number;
  } | null>(null);
  const initializedScopeRef = useRef<string | null>(null);

  // Get active account info
  const activeAccount = getActiveAccount();
  const initializationScope = hasHydrated && address ? `${networkMode}:${address}` : null;
  const scopedTokens = useMemo(
    () => getScopedTokens({
      hasHydrated,
      networkMode,
      address,
      cacheKey: tokenCacheKey,
      tokens,
    }),
    [address, hasHydrated, networkMode, tokenCacheKey, tokens]
  );
  const visibleTokens = useMemo(
    () => getVisibleTokens(scopedTokens),
    [scopedTokens]
  );
  const tokenScopeLoading = isTokenScopeLoading({
    hasHydrated,
    networkMode,
    address,
    cacheKey: tokenCacheKey,
    isLoading: tokensLoading,
  });
  const pendingTransactionCount = useTransactionStore((state) => state.getPendingTransactions({
    address,
    networkMode: hasHydrated ? networkMode : 'mainnet',
  }).length);

  // Core balance fetching logic (silent - no spinner)
  const fetchBalances = useCallback(async () => {
    if (!address || !hasHydrated) {
      koinosLogger.debug('No address, skipping balance refresh');
      return;
    }

    const requestScope = `${networkMode}:${address}`;
    koinosLogger.debug('Fetching balances for address:', address);
    try {
      setPortfolioPricingCycle(null);

      // Refresh token balances
      await refreshBalances(address);

      // Get KOIN balance for portfolio display
      const newBalance = await getBalance(address);
      if (initializedScopeRef.current !== requestScope) {
        koinosLogger.debug('Skipping stale balance write for scope:', requestScope);
        return;
      }
      koinosLogger.debug('Balance fetched successfully:', newBalance);
      updateBalance(newBalance);

      // Fetch mana
      try {
        const manaData = await getMana(address);
        if (initializedScopeRef.current !== requestScope) {
          koinosLogger.debug('Skipping stale mana write for scope:', requestScope);
          return;
        }
        koinosLogger.debug('Mana fetched successfully:', manaData);
        setManaPercentage(manaData.availablePercentage);
      } catch (manaError: any) {
        koinosLogger.error('Mana fetch error:', manaError);
      }

      if (initializedScopeRef.current !== requestScope) {
        koinosLogger.debug('Skipping stale portfolio refresh write for scope:', requestScope);
        return;
      }

      setPortfolioPricingCycle((current) => (
        current?.scope === requestScope
          ? { scope: requestScope, version: current.version + 1 }
          : { scope: requestScope, version: 1 }
      ));
    } catch (error: any) {
      koinosLogger.error('Balance fetch error:', error);
    }
  }, [address, hasHydrated, networkMode, refreshBalances, getBalance, updateBalance, getMana]);

  // Initialize on first load (silent)
  const initializeAndLoadBalance = useCallback(async () => {
    if (!initializationScope || !address) {
      initializedScopeRef.current = null;
      return;
    }

    if (initializedScopeRef.current === initializationScope) {
      return;
    }

    try {
      initializedScopeRef.current = initializationScope;
      setManaPercentage(0);
      updateBalance('0');
      setPortfolioValueUsd(null);
      setPortfolioPricingCycle(null);
      resetKoinos();
      resetTokens();
      await initialize();
      await initializeTokens(address);
      await fetchBalances();
    } catch (error: any) {
      initializedScopeRef.current = null;
      koinosLogger.error('Failed to initialize:', error);
    }
  }, [address, initializationScope, initialize, initializeTokens, fetchBalances, resetKoinos, resetTokens, updateBalance]);

  useEffect(() => {
    if (!initializationScope) {
      initializedScopeRef.current = null;
      setPortfolioValueUsd(null);
      setPortfolioPricingCycle(null);
      return;
    }

    initializeAndLoadBalance();
  }, [initializationScope, initializeAndLoadBalance]);

  useEffect(() => {
    const activeProvider = useKoinosStore.getState().provider;

    if (
      !initializationScope ||
      !activeProvider ||
      !portfolioPricingCycle ||
      portfolioPricingCycle.scope !== initializationScope ||
      visibleTokens.length === 0
    ) {
      setPortfolioValueUsd(null);
      return;
    }

    if (tokenScopeLoading || visibleTokens.some((token) => token.isLoading)) {
      return;
    }

    let cancelled = false;

    void tokenPriceService.getPortfolioValue({
      provider: activeProvider,
      networkMode,
      tokens: visibleTokens,
    }).then((result) => {
      if (cancelled) {
        return;
      }

      setPortfolioValueUsd(result.totalUsd);
    }).catch(() => {
      if (cancelled) {
        return;
      }

      setPortfolioValueUsd(null);
    });

    return () => {
      cancelled = true;
    };
  }, [initializationScope, networkMode, portfolioPricingCycle, tokenScopeLoading, visibleTokens]);

  // Manual pull-to-refresh (with spinner)
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchBalances();
    } catch (error: any) {
      Alert.alert('Error', sanitizeErrorForUser(error, 'Failed to fetch balance'));
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate total portfolio value (for now just sum of balances, no USD)
  // Get KOIN balance for display
  const koinToken = scopedTokens.find((t) => t.symbol === 'KOIN');
  const koinBalance = koinToken?.balance || '0';

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
    await HapticFeedback.success();
    Alert.alert('Copied!', 'Address copied to clipboard');
  };

  const handleReceive = () => {
    navigation.navigate('Receive');
  };

  const handleBackupPress = () => {
    navigation.navigate('Settings', { screen: 'BackupRecovery' });
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
            onRefresh={handleManualRefresh}
            tintColor={colors.purple}
          />
        }>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.accountInfo}
            onPress={() => setShowAccountSwitcher(true)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {activeAccount?.name.charAt(0).toUpperCase() || 'A'}
              </Text>
            </View>
            <View style={styles.accountDetails}>
              <View style={styles.accountNameRow}>
                <Text style={styles.accountName}>
                  {activeAccount?.name || 'Account 1'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
              </View>
              <TouchableOpacity onPress={handleCopyAddress} style={styles.addressRow}>
                <Text style={styles.address}>{truncateAddress(address)}</Text>
                <Ionicons name="copy-outline" size={14} color={colors.textTertiary} style={styles.copyIcon} />
              </TouchableOpacity>
            </View>
            {accounts.length > 1 && (
              <View style={styles.accountCountBadge}>
                <Text style={styles.accountCountText}>{accounts.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('Activity', pendingTransactionCount > 0 ? {
                initialFilter: 'pending',
              } : undefined)}
            >
              <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
              {pendingTransactionCount > 0 && (
                <View style={styles.headerButtonBadge}>
                  <Text style={styles.headerButtonBadgeText}>
                    {pendingTransactionCount > 9 ? '9+' : pendingTransactionCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
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
          {portfolioValueUsd != null && (
            <Text style={styles.portfolioUsdValue}>
              {USD_FORMATTER.format(portfolioValueUsd)}
            </Text>
          )}

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

        <BackupStatusNotice backupHealth={backupHealth} onPress={handleBackupPress} />

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

          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Activity')}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="time-outline" size={24} color={colors.textPrimary} />
            </View>
            <Text style={styles.actionLabel}>Activity</Text>
          </TouchableOpacity>
        </View>

        {/* Tokens Section */}
        <View style={styles.tokensSection}>
          <View style={styles.tokensSectionHeader}>
            <Text style={styles.sectionTitle}>Tokens</Text>
            <Text style={styles.tokenCount}>{visibleTokens.length}</Text>
          </View>
          {visibleTokens.length === 0 && tokenScopeLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading tokens...</Text>
            </View>
          ) : (
            <FlatList
              data={visibleTokens}
              keyExtractor={(item) => item.contractId}
              renderItem={renderTokenItem}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.tokenSeparator} />}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="wallet-outline" size={32} color={colors.textTertiary} />
                  </View>
                  <Text style={styles.emptyTitle}>No Tokens Yet</Text>
                  <Text style={styles.emptyText}>
                    Tokens will appear here once you receive them
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </ScrollView>

      {/* Account Switcher Modal */}
      <AccountSwitcher
        visible={showAccountSwitcher}
        onClose={() => setShowAccountSwitcher(false)}
        onAccountSwitch={() => {
          // Reset koinos store to re-initialize with new account's private key
          resetKoinos();
          resetTokens();
          initializedScopeRef.current = null;
        }}
      />
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
    flex: 1,
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
  accountDetails: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  accountCountBadge: {
    backgroundColor: colors.purple,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  accountCountText: {
    fontSize: 11,
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
    flexShrink: 0,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerButtonBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.background,
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
  },
  portfolioUsdValue: {
    marginTop: 6,
    marginBottom: 20,
    fontSize: 15,
    color: colors.textSecondary,
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
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actionIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
