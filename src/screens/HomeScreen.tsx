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
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { useWalletStore } from '../stores/walletStore';
import { useKoinosStore } from '../stores/koinosStore';
import { truncateAddress, formatKoinBalance } from '../lib/utils';
import { useTransactionHistory } from '../hooks/useTransactionHistory';

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

export const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const { address, balance, updateBalance } = useWalletStore();
  const { getBalance, getMana, initialize } = useKoinosStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [manaPercentage, setManaPercentage] = useState<number>(0);

  // Transaction history hook
  const { transactions, loading: txLoading, error: txError, refetch: refetchTransactions } = useTransactionHistory();

  const initializeAndLoadBalance = useCallback(async () => {
    try {
      if (!isInitialized) {
        await initialize();
        setIsInitialized(true);
      }
      await refreshBalance();
    } catch (error: any) {
      console.error('Failed to initialize:', error);
      // Don't show error on initial load, only on refresh
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
        // Use availablePercentage instead of percentage (accounts for reserved mana)
        setManaPercentage(manaData.availablePercentage);
      } catch (manaError: any) {
        console.error('[HomeScreen] Mana fetch error:', manaError);
        // Don't show alert for mana fetch error, just log it
      }

      // Refresh transaction history
      await refetchTransactions();
    } catch (error: any) {
      console.error('[HomeScreen] Balance fetch error:', error);
      console.error('[HomeScreen] Error message:', error.message);
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

  return (
    <Screen scroll={false}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refreshBalance} />
        }>
        <View style={styles.header}>
          <Text style={styles.title}>Kondor Mobile</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balance}>{formatKoinBalance(balance)} KOIN</Text>

          <View style={styles.manaContainer}>
            <View style={styles.manaHeader}>
              <Text style={styles.manaLabel}>Mana Available</Text>
              <Text style={styles.manaValue}>{manaPercentage.toFixed(1)}%</Text>
            </View>
            <View style={styles.manaBarContainer}>
              <View
                style={[
                  styles.manaBar,
                  {
                    width: `${Math.min(manaPercentage, 100)}%`,
                    backgroundColor: manaPercentage < 20 ? '#DC3545' : manaPercentage < 50 ? '#FFC107' : '#34C759'
                  }
                ]}
              />
            </View>
          </View>

          <View style={styles.addressContainer}>
            <Text style={styles.addressLabel}>Your Address</Text>
            <TouchableOpacity onPress={handleCopyAddress}>
              <Text style={styles.address}>{truncateAddress(address)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.sendButton]}
            onPress={() => navigation.navigate('Send')}>
            <Text style={styles.actionButtonText}>↑</Text>
            <Text style={styles.actionLabel}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.receiveButton]}
            onPress={handleReceive}>
            <Text style={styles.actionButtonText}>↓</Text>
            <Text style={styles.actionLabel}>Receive</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.transactionSection}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          {txLoading && transactions.length === 0 ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading transactions...</Text>
            </View>
          ) : txError ? (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>Failed to load transactions</Text>
              <TouchableOpacity onPress={refetchTransactions}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No transactions yet</Text>
            </View>
          ) : (
            <View style={styles.transactionList}>
              {transactions.slice(0, 10).map((tx) => (
                <TouchableOpacity
                  key={tx.id}
                  style={styles.transactionItem}
                  onPress={() => {
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
                  }}
                >
                  <View style={styles.transactionIcon}>
                    <Text style={styles.transactionIconText}>
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
                      { color: tx.type === 'send' ? '#DC3545' : '#34C759' }
                    ]}>
                      {tx.type === 'send' ? '-' : '+'}{tx.amount} {tx.tokenSymbol}
                    </Text>
                    <Text style={styles.transactionTime}>
                      {formatTransactionTime(tx.timestamp)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutText: {
    fontSize: 14,
    color: '#DC3545',
  },
  balanceCard: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 24,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  balance: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 16,
  },
  manaContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  manaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  manaLabel: {
    fontSize: 12,
    color: '#666',
  },
  manaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  manaBarContainer: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  manaBar: {
    height: '100%',
    borderRadius: 4,
  },
  addressContainer: {
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 16,
  },
  addressLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  address: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#333',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  sendButton: {
    backgroundColor: '#007AFF',
  },
  receiveButton: {
    backgroundColor: '#34C759',
  },
  actionButtonText: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
  transactionSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  loadingState: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  errorState: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#DC3545',
    marginBottom: 12,
  },
  retryText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  transactionList: {
    gap: 12,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionIconText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  transactionAddress: {
    fontSize: 12,
    color: '#999',
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
    color: '#999',
  },
});