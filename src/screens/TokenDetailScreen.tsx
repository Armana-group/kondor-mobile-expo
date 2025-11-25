/**
 * Token Detail Screen
 * Shows detailed view of a single token with balance and transaction history
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../components/Screen';
import { useWalletStore } from '../stores/walletStore';
import { useTokenStore, Token } from '../stores/tokenStore';
import { useTransactionHistory, ParsedTransaction } from '../hooks/useTransactionHistory';
import { truncateAddress, formatKoinBalance } from '../lib/utils';
import colors from '../theme/colors';

type TokenDetailRouteParams = {
  TokenDetail: {
    token: Token;
  };
};

const formatTransactionTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

export const TokenDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<TokenDetailRouteParams, 'TokenDetail'>>();
  const { token: initialToken } = route.params;

  const { address } = useWalletStore();
  const { refreshSingleBalance, getTokenByContractId } = useTokenStore();
  const { transactions, loading, refetch } = useTransactionHistory();

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get latest token data from store
  const token = getTokenByContractId(initialToken.contractId) || initialToken;

  // Filter transactions for this token
  const tokenTransactions = transactions.filter(
    (tx) => tx.token === token.contractId
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshSingleBalance(address, token.contractId),
        refetch(),
      ]);
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSend = () => {
    navigation.navigate('Send', { token });
  };

  const handleReceive = () => {
    navigation.navigate('Receive', { token });
  };

  const handleCopyContract = async () => {
    await Clipboard.setStringAsync(token.contractId);
    Alert.alert('Copied!', 'Contract address copied to clipboard');
  };

  const handleViewOnExplorer = () => {
    const url = `https://koiner.app/tokens/${token.contractId}`;
    Linking.openURL(url);
  };

  const handleTransactionPress = (tx: ParsedTransaction) => {
    Alert.alert(
      'Transaction Details',
      `Type: ${tx.type === 'send' ? 'Sent' : 'Received'}\n` +
        `Amount: ${tx.amount} ${tx.tokenSymbol}\n` +
        `${tx.type === 'send' ? 'To' : 'From'}: ${tx.type === 'send' ? tx.to : tx.from}\n` +
        `Block: ${tx.blockHeight || 'N/A'}\n` +
        `Time: ${new Date(tx.timestamp).toLocaleString()}`,
      [
        {
          text: 'View on Explorer',
          onPress: () => {
            const url = `https://koiner.app/transactions/${tx.id}`;
            Linking.openURL(url);
          },
        },
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  const renderTransaction = ({ item: tx }: { item: ParsedTransaction }) => (
    <TouchableOpacity
      style={styles.transactionItem}
      onPress={() => handleTransactionPress(tx)}
    >
      <View
        style={[
          styles.transactionIcon,
          {
            backgroundColor:
              tx.type === 'send'
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(34, 197, 94, 0.1)',
          },
        ]}
      >
        <Ionicons
          name={tx.type === 'send' ? 'arrow-up' : 'arrow-down'}
          size={20}
          color={tx.type === 'send' ? colors.error : colors.success}
        />
      </View>
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionType}>
          {tx.type === 'send' ? 'Sent' : 'Received'}
        </Text>
        <Text style={styles.transactionAddress}>
          {tx.type === 'send' ? truncateAddress(tx.to) : truncateAddress(tx.from)}
        </Text>
      </View>
      <View style={styles.transactionAmount}>
        <Text
          style={[
            styles.transactionAmountText,
            { color: tx.type === 'send' ? colors.error : colors.success },
          ]}
        >
          {tx.type === 'send' ? '-' : '+'}
          {tx.amount}
        </Text>
        <Text style={styles.transactionTime}>{formatTransactionTime(tx.timestamp)}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <>
      {/* Token Header */}
      <View style={styles.tokenHeader}>
        <View style={styles.tokenIconLarge}>
          {token.icon ? (
            <Image
              source={{ uri: token.icon }}
              style={styles.tokenIconImage}
              defaultSource={require('../../assets/icon.png')}
            />
          ) : (
            <View style={styles.tokenIconFallback}>
              <Text style={styles.tokenIconText}>{token.symbol.charAt(0)}</Text>
            </View>
          )}
        </View>
        <View style={styles.tokenHeaderText}>
          <Text style={styles.tokenName}>{token.name}</Text>
          <Text style={styles.tokenSymbol}>{token.symbol}</Text>
        </View>
      </View>

      {/* Balance */}
      <View style={styles.balanceContainer}>
        <Text style={styles.balanceLabel}>Balance</Text>
        <Text style={styles.balanceValue}>
          {parseFloat(token.balance) > 0 ? formatKoinBalance(token.balance) : '0'}
        </Text>
        <Text style={styles.balanceSymbol}>{token.symbol}</Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleSend}>
          <View style={styles.actionIconContainer}>
            <Ionicons name="arrow-up" size={24} color={colors.textPrimary} />
          </View>
          <Text style={styles.actionLabel}>Send</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleReceive}>
          <View style={styles.actionIconContainer}>
            <Ionicons name="arrow-down" size={24} color={colors.textPrimary} />
          </View>
          <Text style={styles.actionLabel}>Receive</Text>
        </TouchableOpacity>
      </View>

      {/* Token Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>Token Info</Text>
        <TouchableOpacity style={styles.infoRow} onPress={handleCopyContract}>
          <Text style={styles.infoLabel}>Contract</Text>
          <View style={styles.infoValueRow}>
            <Text style={styles.infoValue}>{truncateAddress(token.contractId)}</Text>
            <Ionicons name="copy-outline" size={16} color={colors.textTertiary} />
          </View>
        </TouchableOpacity>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Decimals</Text>
          <Text style={styles.infoValue}>{token.decimals}</Text>
        </View>
        <TouchableOpacity style={styles.explorerButton} onPress={handleViewOnExplorer}>
          <Text style={styles.explorerButtonText}>View on Explorer</Text>
          <Ionicons name="open-outline" size={16} color={colors.purple} />
        </TouchableOpacity>
      </View>

      {/* Transactions Header */}
      <View style={styles.transactionsHeader}>
        <Text style={styles.transactionsTitle}>Transactions</Text>
        {tokenTransactions.length > 0 && (
          <Text style={styles.transactionCount}>{tokenTransactions.length}</Text>
        )}
      </View>
    </>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="document-text-outline" size={32} color={colors.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Transactions</Text>
      <Text style={styles.emptyDescription}>
        Your {token.symbol} transaction history will appear here.
      </Text>
    </View>
  );

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        {/* Navigation Header */}
        <View style={styles.navHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>{token.symbol}</Text>
          <View style={styles.placeholder} />
        </View>

        <FlatList
          data={tokenTransactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing || loading}
              onRefresh={handleRefresh}
              tintColor={colors.purple}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  listContent: {
    paddingBottom: 40,
  },
  tokenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  tokenIconLarge: {
    marginRight: 16,
  },
  tokenHeaderText: {
    flex: 1,
  },
  tokenIconImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.elevated,
  },
  tokenIconFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenIconText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  tokenName: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  tokenSymbol: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  balanceContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 24,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  balanceSymbol: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 32,
    gap: 24,
  },
  actionButton: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 24,
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
  infoSection: {
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  explorerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.purple,
  },
  transactionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  transactionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  transactionCount: {
    fontSize: 14,
    color: colors.textTertiary,
    marginLeft: 8,
    backgroundColor: colors.elevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  transactionAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  transactionAmountText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  transactionTime: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  separator: {
    height: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
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
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
