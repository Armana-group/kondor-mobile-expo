import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import { useCustomTokenStore } from '../stores/customTokenStore';
import { useNetworkStore } from '../stores/networkStore';
import {
  getExpectedTokenCacheKey,
  useTokenStore,
} from '../stores/tokenStore';
import { useWalletStore } from '../stores/walletStore';
import colors from '../theme/colors';
import { layout } from '../theme/layout';

const DECIMALS_RE = /^\d+$/;

export const AddCustomTokenScreen = () => {
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
  const { addCustomToken } = useCustomTokenStore();
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
  const networkLabel = networkMode === 'harbinger' ? 'Harbinger' : 'Mainnet';

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
    navigation.goBack();
  };

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <AppHeader title="Add Custom Token" onBack={() => navigation.goBack()} />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          testID="add-custom-token-scroll"
        >
          <View style={styles.contextCard}>
            <Text style={styles.contextLabel}>Network</Text>
            <Text style={styles.contextValue}>{networkLabel}</Text>
          </View>

          <View style={styles.formCard} testID="add-custom-token-form-card">
            <Input label="Contract" value={contractId} onChangeText={setContractId} />
            <Input label="Symbol" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" />
            <Input label="Name" value={name} onChangeText={setName} />
            <Input label="Decimals" value={decimals} onChangeText={setDecimals} keyboardType="number-pad" />
            <Input label="Icon URL (optional)" value={icon} onChangeText={setIcon} />
            <Button title="Add Token" onPress={() => void handleAddCustomToken()} />
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
    paddingBottom: layout.screen.bottomPadding + 96,
  },
  contextCard: {
    backgroundColor: colors.card,
    borderRadius: layout.card.radius,
    padding: layout.card.padding,
    marginBottom: layout.section.gap,
  },
  contextLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  contextValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: layout.card.radius,
    padding: layout.card.padding,
  },
});
