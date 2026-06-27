import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { useWalletStore } from '../stores/walletStore';
import { useNetworkStore } from '../stores/networkStore';
import {
  useTokenStore,
  getExpectedTokenCacheKey,
} from '../stores/tokenStore';
import { useCustomTokenStore } from '../stores/customTokenStore';
import colors from '../theme/colors';
import { layout } from '../theme/layout';

export const TokenManagementScreen = () => {
  const navigation = useNavigation<any>();
  const { address } = useWalletStore();
  const networkMode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const {
    allTokens,
    cacheKey,
    isLoading,
    isInitialized,
    initialize,
    syncManagedTokens,
  } = useTokenStore();
  const {
    removeCustomToken,
    setSystemTokenHidden,
  } = useCustomTokenStore();
  const requestedScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasHydrated || !address) {
      requestedScopeRef.current = null;
      return;
    }

    const expectedScope = getExpectedTokenCacheKey(networkMode, address);
    if (cacheKey === expectedScope && isInitialized) {
      requestedScopeRef.current = expectedScope;
      return;
    }

    if (isLoading && requestedScopeRef.current === expectedScope) {
      return;
    }

    requestedScopeRef.current = expectedScope;
    void initialize(address).catch(() => {
      if (requestedScopeRef.current === expectedScope) {
        requestedScopeRef.current = null;
      }
    });
  }, [address, cacheKey, hasHydrated, initialize, isInitialized, isLoading, networkMode]);

  const expectedScope = hasHydrated && address ? getExpectedTokenCacheKey(networkMode, address) : null;
  const scopedTokens = expectedScope && cacheKey === expectedScope ? allTokens : [];
  const visibleCount = scopedTokens.filter((token) => !token.isHidden).length;
  const hiddenCount = useMemo(
    () => scopedTokens.filter((token) => !token.isCustom && token.isHidden).length,
    [scopedTokens]
  );
  const networkLabel = networkMode === 'harbinger' ? 'Harbinger' : 'Mainnet';

  const handleOpenAddCustomToken = useCallback(() => {
    navigation.navigate('AddCustomToken');
  }, [navigation]);

  const addCustomTokenAction = useMemo(() => (
    <Pressable
      style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
      onPress={handleOpenAddCustomToken}
      accessibilityRole="button"
      accessibilityLabel="Add custom token"
      hitSlop={8}
    >
      <Ionicons name="add" size={layout.header.iconSize} color={colors.purple} />
    </Pressable>
  ), [handleOpenAddCustomToken]);

  const handleToggleSystemToken = async (token: (typeof scopedTokens)[number]) => {
    setSystemTokenHidden(networkMode, token.contractId, !token.isHidden);
    await syncManagedTokens(address);
  };

  const handleRemoveCustomToken = (token: (typeof scopedTokens)[number]) => {
    Alert.alert(
      'Remove Token',
      `Remove ${token.symbol} from this network?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            removeCustomToken(networkMode, token.contractId);
            await syncManagedTokens(address);
          },
        },
      ]
    );
  };

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <AppHeader
          title="Manage Tokens"
          onBack={() => navigation.goBack()}
          rightAccessory={addCustomTokenAction}
        />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          testID="token-management-scroll"
        >
          <View style={styles.summaryCard} testID="token-management-summary-card">
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryNetworkLabel}>Network</Text>
              <Text style={styles.summaryNetworkValue}>{networkLabel}</Text>
            </View>
            <View style={styles.summaryStats}>
              <View>
                <Text style={styles.summaryLabel}>Visible</Text>
                <Text style={styles.summaryValue}>{visibleCount}</Text>
              </View>
              <View style={styles.summaryStatRight}>
                <Text style={styles.summaryLabel}>Hidden</Text>
                <Text style={styles.summaryValue}>{hiddenCount}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tokens</Text>
            {scopedTokens.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {isLoading ? 'Loading tokens...' : 'No tokens found'}
                </Text>
                <Text style={styles.emptyText}>
                  Add a custom token or return after balances finish loading.
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.emptyAction, pressed ? styles.pressed : null]}
                  onPress={handleOpenAddCustomToken}
                  accessibilityRole="button"
                  accessibilityLabel="Add custom token"
                >
                  <Text style={styles.emptyActionText}>Add Custom Token</Text>
                </Pressable>
              </View>
            ) : (
              scopedTokens.map((token) => (
                <View
                  key={token.contractId}
                  style={[
                    styles.tokenRow,
                    token.isHidden && styles.tokenRowHidden,
                  ]}
                >
                  <View style={styles.tokenLeft}>
                    {token.icon ? (
                      <Image
                        source={{ uri: token.icon }}
                        style={styles.tokenIcon}
                        defaultSource={require('../../assets/icon.png')}
                      />
                    ) : (
                      <View style={styles.tokenIconFallback}>
                        <Text style={styles.tokenIconFallbackText}>
                          {token.symbol.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.tokenCopy}>
                      <View style={styles.tokenTitleRow}>
                        <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                        {token.isCustom && <Text style={styles.customBadge}>Custom</Text>}
                        {!token.isCustom && token.isHidden && <Text style={styles.hiddenBadge}>Hidden</Text>}
                      </View>
                      <Text style={styles.tokenName}>{token.name}</Text>
                    </View>
                  </View>

                  <View style={styles.tokenActions}>
                    {!token.isCustom ? (
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => void handleToggleSystemToken(token)}
                      >
                        <Ionicons
                          name={token.isHidden ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={token.isHidden ? colors.textSecondary : colors.purple}
                        />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => handleRemoveCustomToken(token)}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.screen.gutter,
  },
  contentContainer: {
    paddingBottom: layout.screen.bottomPadding + layout.section.gap,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: layout.card.radius,
    padding: layout.card.padding,
    marginBottom: layout.section.gap,
  },
  summaryHeader: {
    paddingBottom: layout.row.verticalPadding,
    marginBottom: layout.row.verticalPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  summaryNetworkLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  summaryNetworkValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryStatRight: {
    alignItems: 'flex-end',
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  section: {
    marginBottom: layout.section.gap,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: layout.card.radius,
    padding: layout.card.padding,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyAction: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.elevated,
  },
  emptyActionText: {
    color: colors.purple,
    fontSize: 14,
    fontWeight: '600',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  tokenRowHidden: {
    opacity: 0.6,
  },
  tokenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tokenIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  tokenIconFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconFallbackText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  tokenCopy: {
    flex: 1,
    marginLeft: 12,
  },
  tokenTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: 8,
  },
  tokenName: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
  },
  customBadge: {
    fontSize: 11,
    color: colors.purple,
    backgroundColor: colors.purpleLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  hiddenBadge: {
    fontSize: 11,
    color: colors.warning,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tokenActions: {
    marginLeft: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
  },
  addButton: {
    width: layout.header.sideButtonWidth,
    minHeight: layout.header.sideButtonWidth,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
});
