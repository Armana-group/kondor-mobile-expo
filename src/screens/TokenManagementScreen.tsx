import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import { useWalletStore } from '../stores/walletStore';
import { useNetworkStore } from '../stores/networkStore';
import {
  useTokenStore,
  getExpectedTokenCacheKey,
} from '../stores/tokenStore';
import { useCustomTokenStore } from '../stores/customTokenStore';
import colors from '../theme/colors';

const DECIMALS_RE = /^\d+$/;

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
    addCustomToken,
    removeCustomToken,
    setSystemTokenHidden,
  } = useCustomTokenStore();
  const [contractId, setContractId] = useState('');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [decimals, setDecimals] = useState('8');
  const [icon, setIcon] = useState('');
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

  const resetForm = () => {
    setContractId('');
    setSymbol('');
    setName('');
    setDecimals('8');
    setIcon('');
  };

  const handleAddCustomToken = async () => {
    const trimmedContractId = contractId.trim();
    const trimmedSymbol = symbol.trim().toUpperCase();
    const trimmedName = name.trim();
    const trimmedIcon = icon.trim();

    if (!trimmedContractId || !trimmedSymbol || !trimmedName) {
      Alert.alert('Missing fields', 'Contract, symbol, and name are required.');
      return;
    }

    if (!DECIMALS_RE.test(decimals)) {
      Alert.alert('Invalid decimals', 'Decimals must be a whole number.');
      return;
    }

    if (scopedTokens.some((token) => token.contractId === trimmedContractId)) {
      Alert.alert('Token exists', 'That contract is already in your token list.');
      return;
    }

    addCustomToken(networkMode, {
      contractId: trimmedContractId,
      symbol: trimmedSymbol,
      name: trimmedName,
      decimals: Number(decimals),
      icon: trimmedIcon || undefined,
    });

    await syncManagedTokens(address);
    resetForm();
  };

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
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Manage Tokens</Text>
            <Text style={styles.subtitle}>{networkLabel}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>Visible</Text>
              <Text style={styles.summaryValue}>{visibleCount}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Hidden</Text>
              <Text style={styles.summaryValue}>{hiddenCount}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add Custom Token</Text>
            <Input label="Contract" value={contractId} onChangeText={setContractId} />
            <Input label="Symbol" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" />
            <Input label="Name" value={name} onChangeText={setName} />
            <Input label="Decimals" value={decimals} onChangeText={setDecimals} keyboardType="number-pad" />
            <Input label="Icon URL (optional)" value={icon} onChangeText={setIcon} />
            <Button title="Add Token" onPress={() => void handleAddCustomToken()} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: colors.textSecondary,
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 18,
    borderRadius: 12,
    backgroundColor: colors.card,
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
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 18,
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
});
