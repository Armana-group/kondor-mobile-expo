/**
 * Transaction History Hook
 * Based on kondor3 patterns - fetches and parses transaction history from Koinos REST API
 * Supports multi-token transactions
 */

import { useState, useEffect, useCallback } from 'react';
import { useWalletStore } from '../stores/walletStore';
import { useTokenStore } from '../stores/tokenStore';
import { utils } from 'koilib';
import { txLogger } from '../lib/logger';
import { KOINOS_REST } from '../lib/constants';
import { fetchTransactionTimestamps } from '../lib/txHistory';

// Cache of txId -> ms timestamp. Confirmed transactions never change, so this
// persists across the hook's periodic refresh — only new txs trigger a lookup.
const timestampCache = new Map<string, number>();

export interface ParsedTransaction {
  id: string;
  type: 'send' | 'receive';
  amount: string;
  token: string; // Contract ID
  tokenSymbol: string;
  tokenDecimals: number;
  tokenIcon?: string;
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
 * Uses Koinos REST API: rest.koinos.io
 */
export const useTransactionHistory = (): UseTransactionHistoryResult => {
  const { address } = useWalletStore();
  const { tokens, getTokenByContractId } = useTokenStore();
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Parse raw transaction from REST API into our format
   * The REST API returns decoded operations, not protobuf
   * Now supports multi-token by looking up token metadata
   */
  const parseTransaction = (rawTx: any, userAddress: string): ParsedTransaction | null => {
    try {
      // Extract operation details
      const operations = rawTx.trx?.transaction?.operations || [];
      if (operations.length === 0) return null;

      const operation = operations[0];
      const callContract = operation.call_contract;
      if (!callContract) return null;

      // REST API provides already-decoded args
      const args = callContract.args;
      if (!args || !args.from || !args.to || !args.value) {
        txLogger.debug('Missing required fields in args');
        return null;
      }

      const from = args.from;
      const to = args.to;
      const amount = args.value;
      const contractId = callContract.contract_id;

      // Look up token metadata from store
      const tokenInfo = getTokenByContractId(contractId);
      const tokenSymbol = tokenInfo?.symbol || 'UNKNOWN';
      const tokenDecimals = tokenInfo?.decimals || 8;
      const tokenIcon = tokenInfo?.icon;

      // Determine transaction type
      const type: 'send' | 'receive' = from.toLowerCase() === userAddress.toLowerCase() ? 'send' : 'receive';

      // Parse fee from receipt
      let fee = '0';
      if (rawTx.trx?.receipt?.rc_used) {
        fee = utils.formatUnits(rawTx.trx.receipt.rc_used, 8);
      }

      // Get payer
      const payer = rawTx.trx?.transaction?.header?.payer || '';

      // The history list has no block time; 0 = unknown (enriched after fetch
      // via the per-transaction endpoint). Do NOT fake Date.now() — that made
      // every transaction read "Just now".
      const timestamp = 0;

      return {
        id: rawTx.trx?.transaction?.id || `tx-${rawTx.seq_num}`,
        type,
        amount: utils.formatUnits(amount, tokenDecimals),
        token: contractId,
        tokenSymbol,
        tokenDecimals,
        tokenIcon,
        from,
        to,
        timestamp,
        status: 'confirmed',
        blockHeight: rawTx.block_height,
        fee,
        payer,
        seqNum: rawTx.seq_num
      };
    } catch (error) {
      txLogger.error('Error parsing transaction:', error);
      return null;
    }
  };

  /**
   * Fetch transaction history from Koinos REST API
   */
  const fetchTransactions = useCallback(async (isRefresh = false) => {
    if (!address) {
      txLogger.debug('No address, skipping fetch');
      return;
    }

    txLogger.debug('Fetching transactions for:', address);

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch transaction history from REST API
      const url = `${KOINOS_REST.history}/v1/account/${address}/history?limit=50&ascending=false`;
      txLogger.debug('Fetching from:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      txLogger.debug('Got response with', Array.isArray(data) ? data.length : 0, 'transactions');

      // Parse transactions
      const parsedTransactions: ParsedTransaction[] = [];
      if (Array.isArray(data)) {
        for (const rawTx of data) {
          const parsed = parseTransaction(rawTx, address);
          if (parsed) {
            parsedTransactions.push(parsed);
          }
        }
      }

      txLogger.debug('Parsed', parsedTransactions.length, 'transactions');

      // The history list omits block time, so enrich each tx with its real
      // timestamp from the per-transaction endpoint (cached by txId).
      try {
        const realIds = parsedTransactions
          .map((t) => t.id)
          .filter((id) => id && !id.startsWith('tx-')); // skip seq_num fallback ids
        const tsMap = await fetchTransactionTimestamps(realIds, {
          baseUrl: KOINOS_REST.transaction,
          cache: timestampCache,
        });
        for (const tx of parsedTransactions) {
          const ts = tsMap.get(tx.id);
          if (ts !== undefined) tx.timestamp = ts;
        }
      } catch (tsErr) {
        // Non-fatal: timestamps stay 0 (UI shows "Confirmed"), history still renders.
        txLogger.warn('Timestamp enrichment failed:', tsErr);
      }

      setTransactions(parsedTransactions);
    } catch (err: any) {
      txLogger.error('Fetch error:', err);
      setError(err.message || 'Failed to fetch transaction history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

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
      txLogger.debug('Auto-refreshing...');
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
