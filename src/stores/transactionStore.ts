import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TransactionJson } from 'koilib';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  parseHistoryTransaction,
  type ParsedTransaction,
} from '../lib/transactionHistoryParser';
import type { NetworkMode } from './networkStore';

const STORAGE_NAME = 'transaction-store';
const ZUSTAND_PERSIST_VERSION = 0;

export const PENDING_TRANSACTION_STALE_MS = 24 * 60 * 60 * 1000;

type PendingTransactionType = ParsedTransaction['type'];

export interface PendingTransactionRecord {
  localId: string;
  networkMode: NetworkMode;
  address: string;
  chainTransactionId?: string;
  type: PendingTransactionType;
  amount: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenIcon?: string;
  from: string;
  to: string;
  timestamp: number;
  fee: string;
  payer: string;
  blockHeight?: number;
  seqNum?: string;
  swapTokenOut?: string;
  swapTokenOutSymbol?: string;
  swapAmountOutMin?: string;
  swapRoute?: string;
  source?: 'send' | 'swap' | 'dapp' | 'walletconnect';
  appOrigin?: string;
}

export interface PendingTransactionScope {
  networkMode: NetworkMode;
  address: string | null | undefined;
}

export interface AddPendingTransactionInput {
  networkMode: NetworkMode;
  address: string;
  chainTransactionId?: string;
  transaction: Omit<ParsedTransaction, 'status' | 'id'> & Partial<Pick<ParsedTransaction, 'id'>>;
  source?: PendingTransactionRecord['source'];
  appOrigin?: string;
}

export interface BroadcastPendingTransactionParams {
  address: string;
  chainTransactionId?: string;
  transaction: TransactionJson;
  timestamp?: number;
  receipt?: {
    rc_used?: string | number | bigint | null;
  } | null;
  getTokenByContractId: (contractId: string) => {
    symbol?: string;
    decimals?: number;
    icon?: string;
  } | undefined;
}

interface TransactionStoreState {
  pendingTransactions: PendingTransactionRecord[];
  hasHydrated: boolean;
  addPendingTransaction: (input: AddPendingTransactionInput) => string;
  confirmPendingTransactionByLocalId: (localId: string) => void;
  confirmPendingTransactionByChainId: (chainTransactionId: string) => void;
  confirmPendingTransactionsByChainIds: (chainTransactionIds: string[]) => void;
  pruneStalePendingTransactions: (now?: number) => void;
  getPendingTransactions: (scope: PendingTransactionScope) => ParsedTransaction[];
  setHasHydrated: (hydrated: boolean) => void;
}

let nextLocalId = 0;

function createLocalId(timestamp: number): string {
  nextLocalId += 1;
  return `pending-${timestamp}-${nextLocalId}`;
}

function sanitizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  return Date.now();
}

function sanitizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sanitizePendingTransactionRecord(
  input: AddPendingTransactionInput,
  localId: string
): PendingTransactionRecord | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const { transaction } = input;
  if (!transaction || typeof transaction !== 'object') {
    return null;
  }

  const address = typeof input.address === 'string' ? input.address : '';
  if (!address) {
    return null;
  }

  const {
    type,
    amount,
    token,
    tokenSymbol,
    tokenDecimals,
    tokenIcon,
    from,
    to,
    timestamp,
    fee,
    payer,
    blockHeight,
    seqNum,
    swapTokenOut,
    swapTokenOutSymbol,
    swapAmountOutMin,
    swapRoute,
  } = transaction;

  if (
    (type !== 'send' && type !== 'receive' && type !== 'swap') ||
    typeof amount !== 'string' ||
    typeof token !== 'string' ||
    typeof tokenSymbol !== 'string' ||
    typeof tokenDecimals !== 'number' ||
    !Number.isFinite(tokenDecimals) ||
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    typeof fee !== 'string' ||
    typeof payer !== 'string'
  ) {
    return null;
  }

  return {
    localId,
    networkMode: input.networkMode === 'harbinger' ? 'harbinger' : 'mainnet',
    address,
    chainTransactionId: sanitizeOptionalString(input.chainTransactionId ?? transaction.id),
    type,
    amount,
    token,
    tokenSymbol,
    tokenDecimals,
    ...(sanitizeOptionalString(tokenIcon) ? { tokenIcon } : {}),
    from,
    to,
    timestamp: sanitizeTimestamp(timestamp),
    fee,
    payer,
    ...(typeof blockHeight === 'number' && Number.isFinite(blockHeight) ? { blockHeight } : {}),
    ...(sanitizeOptionalString(seqNum) ? { seqNum } : {}),
    ...(sanitizeOptionalString(swapTokenOut) ? { swapTokenOut } : {}),
    ...(sanitizeOptionalString(swapTokenOutSymbol) ? { swapTokenOutSymbol } : {}),
    ...(sanitizeOptionalString(swapAmountOutMin) ? { swapAmountOutMin } : {}),
    ...(sanitizeOptionalString(swapRoute) ? { swapRoute } : {}),
    ...(sanitizeOptionalString(input.source) ? { source: input.source } : {}),
    ...(sanitizeOptionalString(input.appOrigin) ? { appOrigin: input.appOrigin } : {}),
  };
}

function sanitizePendingTransactions(value: unknown): PendingTransactionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<PendingTransactionRecord[]>((records, entry) => {
    if (!entry || typeof entry !== 'object') {
      return records;
    }

    const record = entry as PendingTransactionRecord;
    if (
      typeof record.localId !== 'string' ||
      (record.networkMode !== 'mainnet' && record.networkMode !== 'harbinger') ||
      typeof record.address !== 'string' ||
      (record.type !== 'send' && record.type !== 'receive' && record.type !== 'swap') ||
      typeof record.amount !== 'string' ||
      typeof record.token !== 'string' ||
      typeof record.tokenSymbol !== 'string' ||
      typeof record.tokenDecimals !== 'number' ||
      typeof record.from !== 'string' ||
      typeof record.to !== 'string' ||
      typeof record.fee !== 'string' ||
      typeof record.payer !== 'string'
    ) {
      return records;
    }

    records.push({
      localId: record.localId,
      networkMode: record.networkMode,
      address: record.address,
      ...(sanitizeOptionalString(record.chainTransactionId) ? { chainTransactionId: record.chainTransactionId } : {}),
      type: record.type,
      amount: record.amount,
      token: record.token,
      tokenSymbol: record.tokenSymbol,
      tokenDecimals: record.tokenDecimals,
      ...(sanitizeOptionalString(record.tokenIcon) ? { tokenIcon: record.tokenIcon } : {}),
      from: record.from,
      to: record.to,
      timestamp: sanitizeTimestamp(record.timestamp),
      fee: record.fee,
      payer: record.payer,
      ...(typeof record.blockHeight === 'number' && Number.isFinite(record.blockHeight) ? { blockHeight: record.blockHeight } : {}),
      ...(sanitizeOptionalString(record.seqNum) ? { seqNum: record.seqNum } : {}),
      ...(sanitizeOptionalString(record.swapTokenOut) ? { swapTokenOut: record.swapTokenOut } : {}),
      ...(sanitizeOptionalString(record.swapTokenOutSymbol) ? { swapTokenOutSymbol: record.swapTokenOutSymbol } : {}),
      ...(sanitizeOptionalString(record.swapAmountOutMin) ? { swapAmountOutMin: record.swapAmountOutMin } : {}),
      ...(sanitizeOptionalString(record.swapRoute) ? { swapRoute: record.swapRoute } : {}),
      ...(record.source === 'send' || record.source === 'swap' || record.source === 'dapp' || record.source === 'walletconnect'
        ? { source: record.source }
        : {}),
      ...(sanitizeOptionalString(record.appOrigin) ? { appOrigin: record.appOrigin } : {}),
    });
    return records;
  }, []);
}

function matchesScope(record: PendingTransactionRecord, scope: PendingTransactionScope): boolean {
  return Boolean(scope.address) &&
    record.networkMode === (scope.networkMode === 'harbinger' ? 'harbinger' : 'mainnet') &&
    record.address === scope.address;
}

function toParsedTransaction(record: PendingTransactionRecord): ParsedTransaction {
  return {
    id: record.chainTransactionId || record.localId,
    type: record.type,
    amount: record.amount,
    token: record.token,
    tokenSymbol: record.tokenSymbol,
    tokenDecimals: record.tokenDecimals,
    ...(record.tokenIcon ? { tokenIcon: record.tokenIcon } : {}),
    from: record.from,
    to: record.to,
    timestamp: record.timestamp,
    status: 'pending',
    ...(typeof record.blockHeight === 'number' ? { blockHeight: record.blockHeight } : {}),
    fee: record.fee,
    payer: record.payer,
    ...(record.seqNum ? { seqNum: record.seqNum } : {}),
    ...(record.swapTokenOut ? { swapTokenOut: record.swapTokenOut } : {}),
    ...(record.swapTokenOutSymbol ? { swapTokenOutSymbol: record.swapTokenOutSymbol } : {}),
    ...(record.swapAmountOutMin ? { swapAmountOutMin: record.swapAmountOutMin } : {}),
    ...(record.swapRoute ? { swapRoute: record.swapRoute } : {}),
  };
}

function sortPendingTransactions(records: PendingTransactionRecord[]): PendingTransactionRecord[] {
  return [...records].sort((left, right) => right.timestamp - left.timestamp);
}

function normalizeReceipt(receipt?: BroadcastPendingTransactionParams['receipt']) {
  if (!receipt || receipt.rc_used == null) {
    return undefined;
  }

  return {
    rc_used: receipt.rc_used,
  };
}

export function buildPendingTransactionFromBroadcast({
  address,
  chainTransactionId,
  transaction,
  timestamp,
  receipt,
  getTokenByContractId,
}: BroadcastPendingTransactionParams): AddPendingTransactionInput['transaction'] {
  const pendingTimestamp = sanitizeTimestamp(timestamp);
  const parsed = parseHistoryTransaction(
    {
      trx: {
        transaction: {
          ...transaction,
          id: chainTransactionId || transaction.id,
        },
        receipt: normalizeReceipt(receipt),
      },
    },
    address,
    (contractId) => {
      const token = getTokenByContractId(contractId);
      if (!token) {
        return undefined;
      }

      return {
        contractId,
        symbol: token.symbol ?? 'UNKNOWN',
        decimals: token.decimals ?? 8,
        icon: token.icon,
      };
    }
  );

  if (parsed) {
    return {
      ...parsed,
      id: chainTransactionId || parsed.id,
      timestamp: pendingTimestamp,
    };
  }

  const payer = transaction.header?.payer || address;

  return {
    id: chainTransactionId || transaction.id,
    type: 'send',
    amount: '0',
    token: 'unknown',
    tokenSymbol: 'TX',
    tokenDecimals: 8,
    from: payer,
    to: transaction.header?.payee || payer,
    timestamp: pendingTimestamp,
    fee: '0',
    payer,
  };
}

function syncPendingTransactions(pendingTransactions: PendingTransactionRecord[]) {
  const payload = {
    state: {
      pendingTransactions: sanitizePendingTransactions(pendingTransactions),
    },
    version: ZUSTAND_PERSIST_VERSION,
  };

  void AsyncStorage.setItem(STORAGE_NAME, JSON.stringify(payload));
}

export const useTransactionStore = create<TransactionStoreState>()(
  persist(
    (set, get) => ({
      pendingTransactions: [],
      hasHydrated: false,

      addPendingTransaction: (input) => {
        const localId = createLocalId(sanitizeTimestamp(input?.transaction?.timestamp));
        const record = sanitizePendingTransactionRecord(input, localId);
        if (!record) {
          return localId;
        }

        set((state) => ({
          pendingTransactions: (() => {
            const pendingTransactions = sortPendingTransactions([
            record,
            ...state.pendingTransactions.filter((existing) => {
              if (existing.localId === localId) {
                return false;
              }

              if (!record.chainTransactionId) {
                return true;
              }

              return !(
                existing.networkMode === record.networkMode &&
                existing.address === record.address &&
                existing.chainTransactionId === record.chainTransactionId
              );
            }),
          ]);
            syncPendingTransactions(pendingTransactions);
            return pendingTransactions;
          })(),
        }));

        return localId;
      },

      confirmPendingTransactionByLocalId: (localId) => {
        set((state) => ({
          pendingTransactions: (() => {
            const pendingTransactions = state.pendingTransactions.filter(
              (record) => record.localId !== localId
            );
            syncPendingTransactions(pendingTransactions);
            return pendingTransactions;
          })(),
        }));
      },

      confirmPendingTransactionByChainId: (chainTransactionId) => {
        set((state) => ({
          pendingTransactions: (() => {
            const pendingTransactions = state.pendingTransactions.filter(
              (record) => record.chainTransactionId !== chainTransactionId
            );
            syncPendingTransactions(pendingTransactions);
            return pendingTransactions;
          })(),
        }));
      },

      confirmPendingTransactionsByChainIds: (chainTransactionIds) => {
        const confirmedIds = new Set(
          chainTransactionIds.filter((transactionId): transactionId is string => (
            typeof transactionId === 'string' && transactionId.length > 0
          ))
        );
        if (confirmedIds.size === 0) {
          return;
        }

        set((state) => ({
          pendingTransactions: (() => {
            const pendingTransactions = state.pendingTransactions.filter(
              (record) => !record.chainTransactionId || !confirmedIds.has(record.chainTransactionId)
            );
            syncPendingTransactions(pendingTransactions);
            return pendingTransactions;
          })(),
        }));
      },

      pruneStalePendingTransactions: (now = Date.now()) => {
        set((state) => ({
          pendingTransactions: (() => {
            const pendingTransactions = state.pendingTransactions.filter(
              (record) => now - record.timestamp <= PENDING_TRANSACTION_STALE_MS
            );
            syncPendingTransactions(pendingTransactions);
            return pendingTransactions;
          })(),
        }));
      },

      getPendingTransactions: (scope) => sortPendingTransactions(
        get().pendingTransactions.filter((record) => matchesScope(record, scope))
      ).map(toParsedTransaction),

      setHasHydrated: (hydrated) => {
        set({ hasHydrated: hydrated });
      },
    }),
    {
      name: STORAGE_NAME,
      version: ZUSTAND_PERSIST_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        pendingTransactions: sanitizePendingTransactions(state.pendingTransactions),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { pendingTransactions?: unknown } | null;
        return {
          ...currentState,
          pendingTransactions: sortPendingTransactions(
            sanitizePendingTransactions(persisted?.pendingTransactions)
          ),
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
