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
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useTransactionHistory, ParsedTransaction } from '../hooks/useTransactionHistory';
import { truncateAddress } from '../lib/utils';
import colors from '../theme/colors';
import { EXPLORER } from '../lib/constants';

/**
 * Format transaction time relative to now
 */
const formatTransactionTime = (timestamp: number): string => {
  // 0 / missing = timestamp unavailable from the API; show neutral status
  // rather than a misleading relative time.
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
};

const getTransactionLabel = (tx: ParsedTransaction): string => {
  if (tx.type === 'swap') return 'Swap';
  return tx.type === 'send' ? 'Sent' : 'Received';
};

const getTransactionDetail = (tx: ParsedTransaction): string => {
  if (tx.type === 'swap') return tx.swapRoute || `${tx.tokenSymbol} swap`;
  return tx.type === 'send' ? truncateAddress(tx.to) : truncateAddress(tx.from);
};

const getTransactionColor = (tx: ParsedTransaction): string => {
  if (tx.type === 'receive') return colors.success;
  if (tx.type === 'swap') return colors.purple;
  return colors.error;
};

const getTransactionIcon = (tx: ParsedTransaction): keyof typeof Ionicons.glyphMap => {
  if (tx.type === 'swap') return 'swap-horizontal';
  return tx.type === 'send' ? 'arrow-up' : 'arrow-down';
};

const getAmountPrefix = (tx: ParsedTransaction): string => {
  return tx.type === 'receive' ? '+' : '-';
};

export const ActivityScreen = () => {
  const { transactions, loading, error, refetch } = useTransactionHistory();

  const handleTransactionPress = (tx: ParsedTransaction) => {
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
      `Block: ${tx.blockHeight || 'N/A'}\n` +
      `Time: ${tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'N/A'}`,
      [
        {
          text: 'View on KoinScan',
          onPress: () => {
            const url = `${EXPLORER.mainnet.tx}/${tx.id}`;
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
          { backgroundColor: getTransactionColor(tx) }
        ]}>
          <Ionicons
            name={getTransactionIcon(tx)}
            size={10}
            color={colors.textPrimary}
          />
        </View>
      </View>
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionType}>
          {getTransactionLabel(tx)} {tx.tokenSymbol}
        </Text>
        <Text style={styles.transactionAddress}>
          {getTransactionDetail(tx)}
        </Text>
      </View>
      <View style={styles.transactionAmount}>
        <Text style={[
          styles.transactionAmountText,
          { color: getTransactionColor(tx) }
        ]}>
          {getAmountPrefix(tx)}{tx.amount}
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
        <Ionicons name="document-text-outline" size={36} color={colors.textTertiary} />
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
