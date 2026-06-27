import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { useTransactionHistory, ParsedTransaction } from '../hooks/useTransactionHistory';
import type { HomeStackParamList } from '../navigation/TabNavigator';
import { getTransactionExplorerUrl } from '../lib/explorer';
import { truncateAddress } from '../lib/utils';
import colors from '../theme/colors';

export type ActivityFilter = 'all' | 'send' | 'receive' | 'swap' | 'pending';

const FILTER_OPTIONS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'send', label: 'Send' },
  { value: 'receive', label: 'Receive' },
  { value: 'swap', label: 'Swap' },
  { value: 'pending', label: 'Pending' },
];

function formatTransactionTime(transaction: ParsedTransaction): string {
  if (transaction.status === 'pending') {
    return 'Pending';
  }

  const { timestamp } = transaction;
  if (!timestamp) return 'Confirmed';

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
}

function getTransactionLabel(tx: ParsedTransaction): string {
  if (tx.type === 'swap') return 'Swap';
  return tx.type === 'send' ? 'Sent' : 'Received';
}

function getTransactionDetail(tx: ParsedTransaction): string {
  if (tx.type === 'swap') return tx.swapRoute || `${tx.tokenSymbol} swap`;
  return tx.type === 'send' ? truncateAddress(tx.to) : truncateAddress(tx.from);
}

function getTransactionColor(tx: ParsedTransaction): string {
  if (tx.status === 'pending') return colors.warning;
  if (tx.type === 'receive') return colors.success;
  if (tx.type === 'swap') return colors.purple;
  return colors.error;
}

function getTransactionIcon(tx: ParsedTransaction): keyof typeof Ionicons.glyphMap {
  if (tx.status === 'pending') return 'time-outline';
  if (tx.type === 'swap') return 'swap-horizontal';
  return tx.type === 'send' ? 'arrow-up' : 'arrow-down';
}

function getAmountDisplay(tx: ParsedTransaction): string {
  if (tx.status === 'pending' && tx.amount === '0' && tx.tokenSymbol === 'TX') {
    return 'Pending';
  }

  const prefix = tx.type === 'receive' ? '+' : '-';
  return `${prefix}${tx.amount}`;
}

function handleTransactionPress(tx: ParsedTransaction) {
  const detail =
    tx.type === 'swap'
      ? `Pay: ${tx.amount} ${tx.tokenSymbol}\n` +
        `Route: ${tx.swapRoute || `${tx.tokenSymbol} swap`}\n` +
        (tx.swapAmountOutMin && tx.swapTokenOutSymbol
          ? `Minimum received: ${tx.swapAmountOutMin} ${tx.swapTokenOutSymbol}\n`
          : '') +
        `Receiver: ${tx.to}\n`
      : `Amount: ${tx.amount} ${tx.tokenSymbol}\n` +
        `${tx.type === 'send' ? 'To' : 'From'}: ${tx.type === 'send' ? tx.to : tx.from}\n`;

  Alert.alert(
    'Transaction Details',
    `Type: ${getTransactionLabel(tx)}\n` +
    detail +
    `Status: ${tx.status === 'pending' ? 'Pending' : 'Confirmed'}\n` +
    `Block: ${tx.blockHeight || 'N/A'}\n` +
    `Time: ${tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'N/A'}`,
    [
      {
        text: 'View on Explorer',
        onPress: () => {
          const url = getTransactionExplorerUrl(tx.id);
          Linking.openURL(url);
        },
      },
      { text: 'Close', style: 'cancel' },
    ]
  );
}

function renderTransaction({ item: tx }: { item: ParsedTransaction }) {
  return (
    <Pressable
      style={styles.transactionItem}
      onPress={() => handleTransactionPress(tx)}
    >
      <View style={styles.transactionIconContainer}>
        {tx.tokenIcon ? (
          <Image
            source={{ uri: tx.tokenIcon }}
            style={styles.tokenIconImage}
            defaultSource={require('../../assets/icon.png')}
          />
        ) : (
          <View style={styles.tokenIconFallback}>
            <Text style={styles.tokenIconText}>{tx.tokenSymbol.charAt(0)}</Text>
          </View>
        )}
        <View style={[
          styles.transactionTypeIndicator,
          { backgroundColor: getTransactionColor(tx) },
        ]}>
          <Ionicons
            name={getTransactionIcon(tx)}
            size={10}
            color={colors.textPrimary}
          />
        </View>
      </View>
      <View style={styles.transactionDetails}>
        <View style={styles.transactionTitleRow}>
          <Text style={styles.transactionType}>
            {getTransactionLabel(tx)} {tx.tokenSymbol}
          </Text>
          {tx.status === 'pending' && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>Pending</Text>
            </View>
          )}
        </View>
        <Text style={styles.transactionAddress}>
          {getTransactionDetail(tx)}
        </Text>
      </View>
      <View style={styles.transactionAmount}>
        <Text style={[
          styles.transactionAmountText,
          { color: getTransactionColor(tx) },
        ]}>
          {getAmountDisplay(tx)}
        </Text>
        <Text style={styles.transactionTime}>
          {formatTransactionTime(tx)}
        </Text>
      </View>
    </Pressable>
  );
}

export const ActivityScreen = () => {
  const route = useRoute<RouteProp<HomeStackParamList, 'Activity'>>();
  const { transactions, loading, error, refetch } = useTransactionHistory();
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>(
    route.params?.initialFilter ?? 'all'
  );

  useEffect(() => {
    if (route.params?.initialFilter) {
      setActiveFilter(route.params.initialFilter);
    }
  }, [route.params?.initialFilter]);

  const filteredTransactions = useMemo(() => {
    if (activeFilter === 'all') {
      return transactions;
    }
    if (activeFilter === 'pending') {
      return transactions.filter((transaction) => transaction.status === 'pending');
    }
    return transactions.filter((transaction) => transaction.type === activeFilter);
  }, [activeFilter, transactions]);

  const renderFilterChip = useCallback(
    ({ item }: { item: { value: ActivityFilter; label: string } }) => {
      const isActive = item.value === activeFilter;
      return (
        <Pressable
          style={[
            styles.filterChip,
            isActive ? styles.filterChipActive : null,
          ]}
          onPress={() => setActiveFilter(item.value)}
        >
          <Text
            style={[
              styles.filterChipText,
              isActive ? styles.filterChipTextActive : null,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      );
    },
    [activeFilter]
  );

  const renderEmpty = () => {
    const activeLabel = FILTER_OPTIONS.find((option) => option.value === activeFilter)?.label ?? 'Transactions';

    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="document-text-outline" size={36} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>
          {activeFilter === 'all' ? 'No Transactions' : `No ${activeLabel}`}
        </Text>
        <Text style={styles.emptyDescription}>
          {activeFilter === 'pending'
            ? 'Broadcasted transactions will stay here until on-chain history confirms them.'
            : 'Your transaction history will appear here.'}
        </Text>
      </View>
    );
  };

  const renderError = () => (
    <View style={styles.errorState}>
      <Text style={styles.errorText}>Failed to load transactions</Text>
      <Pressable style={styles.retryButton} onPress={refetch}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );

  const transactionRefreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={loading}
        onRefresh={refetch}
        tintColor={colors.purple}
      />
    ),
    [loading, refetch]
  );

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Activity</Text>
        </View>

        <FlatList
          horizontal
          data={FILTER_OPTIONS}
          keyExtractor={(item) => item.value}
          renderItem={renderFilterChip}
          style={styles.filterList}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        />

        {loading && filteredTransactions.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Loading transactions...</Text>
          </View>
        ) : error ? (
          renderError()
        ) : (
          <FlatList
            data={filteredTransactions}
            keyExtractor={(item) => item.id}
            renderItem={renderTransaction}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={
              filteredTransactions.length === 0 ? styles.emptyContainer : styles.listContainer
            }
            refreshControl={transactionRefreshControl}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
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
    padding: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
    alignItems: 'center',
  },
  filterList: {
    flexGrow: 0,
    maxHeight: 56,
    minHeight: 56,
  },
  filterChip: {
    height: 44,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.textPrimary,
  },
  listContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  separator: {
    height: 12,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
  },
  transactionIconContainer: {
    position: 'relative',
    marginRight: 12,
  },
  tokenIconImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.elevated,
  },
  tokenIconFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  transactionTypeIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  transactionDetails: {
    flex: 1,
    gap: 4,
  },
  transactionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.warning,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.background,
  },
  transactionAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  transactionAmount: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  transactionAmountText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  transactionTime: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.elevated,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    color: colors.purple,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 18,
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
