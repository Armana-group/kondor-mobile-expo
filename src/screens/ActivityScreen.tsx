import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Screen } from '../components/Screen';
import { useTransactionHistory } from '../hooks/useTransactionHistory';
import { truncateAddress } from '../lib/utils';
import colors from '../theme/colors';

/**
 * Format transaction time relative to now
 */
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

export const ActivityScreen = () => {
  const { transactions, loading, error, refetch } = useTransactionHistory();

  const handleTransactionPress = (tx: any) => {
    Alert.alert(
      'Transaction Details',
      `Type: ${tx.type === 'send' ? 'Sent' : 'Received'}\n` +
      `Amount: ${tx.amount} ${tx.tokenSymbol}\n` +
      `${tx.type === 'send' ? 'To' : 'From'}: ${tx.type === 'send' ? tx.to : tx.from}\n` +
      `Fee: ${tx.fee} mana\n` +
      `Block: ${tx.blockHeight || 'N/A'}\n` +
      `Time: ${new Date(tx.timestamp).toLocaleString()}`,
      [{ text: 'OK' }]
    );
  };

  const renderTransaction = ({ item: tx }: { item: any }) => (
    <TouchableOpacity
      style={styles.transactionItem}
      onPress={() => handleTransactionPress(tx)}
    >
      <View style={[
        styles.transactionIcon,
        { backgroundColor: tx.type === 'send' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)' }
      ]}>
        <Text style={[
          styles.transactionIconText,
          { color: tx.type === 'send' ? colors.error : colors.success }
        ]}>
          {tx.type === 'send' ? '↑' : '↓'}
        </Text>
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
        <Text style={[
          styles.transactionAmountText,
          { color: tx.type === 'send' ? colors.error : colors.success }
        ]}>
          {tx.type === 'send' ? '-' : '+'}{tx.amount} {tx.tokenSymbol}
        </Text>
        <Text style={styles.transactionTime}>
          {formatTransactionTime(tx.timestamp)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Text style={styles.emptyIcon}>📋</Text>
      </View>
      <Text style={styles.emptyTitle}>No Transactions</Text>
      <Text style={styles.emptyDescription}>
        Your transaction history will appear here.
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.errorState}>
      <Text style={styles.errorText}>Failed to load transactions</Text>
      <TouchableOpacity style={styles.retryButton} onPress={refetch}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Activity</Text>
        </View>

        {loading && transactions.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Loading transactions...</Text>
          </View>
        ) : error ? (
          renderError()
        ) : (
          <FlatList
            data={transactions}
            keyExtractor={(item) => item.id}
            renderItem={renderTransaction}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={transactions.length === 0 ? styles.emptyContainer : styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={refetch}
                tintColor={colors.purple}
              />
            }
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
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
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionIconText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 16,
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
  emptyIcon: {
    fontSize: 36,
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
