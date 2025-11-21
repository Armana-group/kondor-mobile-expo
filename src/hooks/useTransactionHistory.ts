/**
 * Transaction History Hook
 * Based on kondor3 patterns - fetches and parses transaction history from Koinos RPC
 */

import { useState, useEffect, useCallback } from 'react';
import { useWalletStore } from '../stores/walletStore';
import { useKoinosStore } from '../stores/koinosStore';
import { utils } from 'koilib';

export interface ParsedTransaction {
  id: string;
  type: 'send' | 'receive';
  amount: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  from: string;
  to: string;
  timestamp: number;
  status: 'confirmed' | 'pending';
  blockHeight?: number;
  fee: string; // In mana (RC converted to decimals)
  payer: string;
  seqNum?: string;
}

interface TransactionStats {
  incoming: number;
  outgoing: number;
  total: number;
}

interface UseTransactionHistoryResult {
  transactions: ParsedTransaction[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  stats: TransactionStats;
  refetch: () => Promise<void>;
}

const REFRESH_INTERVAL = 30000; // 30 seconds

/**
 * Hook to fetch and manage transaction history
 * Auto-refreshes every 30 seconds
 * Uses Koinos RPC method: chain.get_account_history
 */
export const useTransactionHistory = (): UseTransactionHistoryResult => {
  const { address } = useWalletStore();
  const koinosStore = useKoinosStore();
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Parse raw transaction from API into our format
   */
  const parseTransaction = (rawTx: any, userAddress: string): ParsedTransaction | null => {
    try {
      // Extract operation details
      const operations = rawTx.trx?.transaction?.operations || [];
      if (operations.length === 0) return null;

      const operation = operations[0];
      const callContract = operation.call_contract;
      if (!callContract) return null;

      // Decode the arguments to get transfer details
      let from = '';
      let to = '';
      let amount = '0';
      let tokenSymbol = 'KOIN';
      let tokenDecimals = 8;

      // Try to decode transfer arguments
      if (callContract.args) {
        try {
          const argsBytes = utils.decodeBase64url(callContract.args);
          // Simple protobuf parsing for transfer args
          // Field 1: from (bytes), Field 2: to (bytes), Field 3: value (uint64)
          let pos = 0;
          while (pos < argsBytes.length) {
            const tag = argsBytes[pos];
            const fieldNumber = tag >>> 3;
            const wireType = tag & 7;
            pos++;

            if (fieldNumber === 1 && wireType === 2) {
              // from address
              const length = argsBytes[pos];
              pos++;
              const addressBytes = argsBytes.slice(pos, pos + length);
              from = utils.encodeBase58(addressBytes);
              pos += length;
            } else if (fieldNumber === 2 && wireType === 2) {
              // to address
              const length = argsBytes[pos];
              pos++;
              const addressBytes = argsBytes.slice(pos, pos + length);
              to = utils.encodeBase58(addressBytes);
              pos += length;
            } else if (fieldNumber === 3 && wireType === 0) {
              // amount (varint)
              let value = 0;
              let shift = 0;
              while (pos < argsBytes.length) {
                const byte = argsBytes[pos];
                pos++;
                value |= (byte & 0x7f) << shift;
                if ((byte & 0x80) === 0) break;
                shift += 7;
              }
              amount = value.toString();
            } else {
              // Skip unknown fields
              if (wireType === 0) {
                // Varint
                while (pos < argsBytes.length && (argsBytes[pos] & 0x80) !== 0) pos++;
                pos++;
              } else if (wireType === 2) {
                // Length-delimited
                const length = argsBytes[pos];
                pos += length + 1;
              }
            }
          }
        } catch (parseError) {
          console.log('[TransactionHistory] Could not parse args, using fallback');
        }
      }

      // Determine transaction type
      const type: 'send' | 'receive' = from.toLowerCase() === userAddress.toLowerCase() ? 'send' : 'receive';

      // Parse fee from receipt
      let fee = '0';
      if (rawTx.trx?.receipt?.rc_used) {
        fee = utils.formatUnits(rawTx.trx.receipt.rc_used, 8);
      }

      // Get payer
      const payer = rawTx.trx?.transaction?.header?.payer || '';

      return {
        id: rawTx.trx?.id || `${rawTx.block_height}-${rawTx.seq_num}`,
        type,
        amount: utils.formatUnits(amount, tokenDecimals),
        token: callContract.contract_id,
        tokenSymbol,
        tokenDecimals,
        from,
        to,
        timestamp: rawTx.timestamp ? parseInt(rawTx.timestamp) : Date.now(),
        status: 'confirmed',
        blockHeight: rawTx.block_height,
        fee,
        payer,
        seqNum: rawTx.seq_num
      };
    } catch (error) {
      console.error('[TransactionHistory] Error parsing transaction:', error);
      return null;
    }
  };

  /**
   * Fetch transaction history from Koinos RPC
   */
  const fetchTransactions = useCallback(async (isRefresh = false) => {
    if (!address) {
      console.log('[TransactionHistory] No address, skipping fetch');
      return;
    }

    // Wait for provider initialization
    if (!koinosStore.provider || !koinosStore.isInitialized) {
      console.log('[TransactionHistory] Provider not initialized, waiting...');
      try {
        await koinosStore.initialize();
      } catch (error) {
        console.log('[TransactionHistory] Failed to initialize provider');
        return;
      }
    }

    console.log('[TransactionHistory] Fetching transactions for:', address);

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch transaction history via RPC
      const result = await koinosStore.provider!.call('chain.get_account_history', {
        address,
        limit: 50,
        ascending: false
      });

      console.log('[TransactionHistory] Got RPC response');

      // Parse transactions
      const parsedTransactions: ParsedTransaction[] = [];
      if (result.values && Array.isArray(result.values)) {
        for (const rawTx of result.values) {
          const parsed = parseTransaction(rawTx, address);
          if (parsed) {
            parsedTransactions.push(parsed);
          }
        }
      }

      console.log('[TransactionHistory] Parsed', parsedTransactions.length, 'transactions');
      setTransactions(parsedTransactions);
    } catch (err: any) {
      console.error('[TransactionHistory] Fetch error:', err);
      setError(err.message || 'Failed to fetch transaction history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address, koinosStore]);

  /**
   * Calculate transaction statistics
   */
  const calculateStats = useCallback((): TransactionStats => {
    const incoming = transactions.filter(tx => tx.type === 'receive').length;
    const outgoing = transactions.filter(tx => tx.type === 'send').length;
    return {
      incoming,
      outgoing,
      total: transactions.length
    };
  }, [transactions]);

  // Initial fetch
  useEffect(() => {
    if (address) {
      fetchTransactions();
    }
  }, [address]); // Only run on address change

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!address) return;

    const interval = setInterval(() => {
      console.log('[TransactionHistory] Auto-refreshing...');
      fetchTransactions(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [address, fetchTransactions]);

  return {
    transactions,
    loading,
    error,
    refreshing,
    stats: calculateStats(),
    refetch: () => fetchTransactions(true)
  };
};
