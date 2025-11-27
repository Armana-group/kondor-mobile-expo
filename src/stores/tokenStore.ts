/**
 * Token Store - Multi-token support for Kondor Mobile
 * Fetches token list from KoinDX and manages balances
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Provider, utils } from 'koilib';
import * as protobuf from 'protobufjs/minimal';
import { DEFAULT_NETWORK } from '../lib/constants';
import { tokenLogger as log } from '../lib/logger';

// Token metadata interface
export interface Token {
  contractId: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  balance: string;
  isLoading: boolean;
  error?: string;
}

// KoinDX token list format
interface KoinDXToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}

interface TokenState {
  tokens: Token[];
  isLoading: boolean;
  isInitialized: boolean;
  lastFetch: number;
  error: string | null;

  // Actions
  initialize: (address: string) => Promise<void>;
  refreshBalances: (address: string) => Promise<void>;
  refreshSingleBalance: (address: string, contractId: string) => Promise<void>;
  getTokenByContractId: (contractId: string) => Token | undefined;
  getTokenBySymbol: (symbol: string) => Token | undefined;
  reset: () => void;
}

// Special tokens that are always included (even if not in KoinDX list)
const SPECIAL_TOKENS: Partial<Token>[] = [
  {
    contractId: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK', // KOIN
    symbol: 'KOIN',
    name: 'Koinos',
    decimals: 8,
    icon: 'https://raw.githubusercontent.com/koindx/token-list/main/src/images/mainnet/koin.png',
  },
  {
    contractId: '12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq', // VHP
    symbol: 'VHP',
    name: 'Virtual Hash Power',
    decimals: 8,
    icon: 'https://raw.githubusercontent.com/koindx/token-list/main/src/images/mainnet/vhp.png',
  },
];

// Blacklisted contracts that don't follow standard token interface
// Also skip KoinDX nickname addresses for KOIN/VHP since we have proper entries in SPECIAL_TOKENS
const BLACKLISTED_CONTRACTS = new Set([
  '1A4Nv58odXgVK91bFHgCFWPgiu7kfsxdVY', // Lords Forsaken packs
  'koin', // KoinDX uses nickname, we use full contract address in SPECIAL_TOKENS
  'vhp',  // KoinDX uses nickname, we use full contract address in SPECIAL_TOKENS
]);

const KOINDX_TOKEN_LIST_URL = 'https://raw.githubusercontent.com/koindx/token-list/main/src/tokens/mainnet.json';
const TOKEN_LIST_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Encode balanceOf arguments using protobufjs
 */
function encodeBalanceOfArgs(address: string): Uint8Array {
  const addressBytes = utils.decodeBase58(address);
  const writer = protobuf.Writer.create();
  writer.uint32(0x0A); // field 1, wire type 2 (length-delimited)
  writer.bytes(addressBytes);
  return writer.finish();
}

/**
 * Decode balanceOf result using protobufjs
 */
function decodeBalanceOfResult(data: Uint8Array): string {
  try {
    const reader = protobuf.Reader.create(data);
    let value = '0';

    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          const longValue = reader.uint64();
          value = longValue.toString();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }

    return value;
  } catch (error) {
    log.error(' Error decoding result:', error);
    return '0';
  }
}

/**
 * Get balance for a token contract
 */
async function getTokenBalance(
  provider: Provider,
  contractId: string,
  ownerAddress: string,
  decimals: number
): Promise<string> {
  try {
    const encodedArgs = encodeBalanceOfArgs(ownerAddress);

    const result = await provider.call('chain.read_contract', {
      contract_id: contractId,
      entry_point: 0x5c721497, // balanceOf entry point
      args: utils.encodeBase64url(encodedArgs),
    });

    if (!result || !result.result) {
      return '0';
    }

    const resultBytes = utils.decodeBase64url(result.result);
    const value = decodeBalanceOfResult(resultBytes);
    return utils.formatUnits(value, decimals);
  } catch (error) {
    log.error(`Error getting balance for ${contractId}:`, error);
    throw error;
  }
}

/**
 * Fetch token list from KoinDX
 */
async function fetchKoinDXTokenList(): Promise<KoinDXToken[]> {
  try {
    log.debug(' Fetching KoinDX token list...');
    const response = await fetch(KOINDX_TOKEN_LIST_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch token list: ${response.status}`);
    }

    const data = await response.json();
    // API returns { chainId, tokens: [...] }, not a raw array
    const tokens = data.tokens || [];
    log.debug(' Fetched', tokens.length, 'tokens from KoinDX');
    return tokens;
  } catch (error) {
    log.error(' Error fetching token list:', error);
    throw error;
  }
}

export const useTokenStore = create<TokenState>()(
  persist(
    (set, get) => ({
      tokens: [],
      isLoading: false,
      isInitialized: false,
      lastFetch: 0,
      error: null,

      initialize: async (address: string) => {
        const { lastFetch, isInitialized } = get();
        const now = Date.now();

        // Skip if recently fetched
        if (isInitialized && now - lastFetch < TOKEN_LIST_CACHE_DURATION) {
          log.debug(' Using cached token list');
          // Still refresh balances
          await get().refreshBalances(address);
          return;
        }

        log.debug(' Initializing token store for:', address);
        set({ isLoading: true, error: null });

        try {
          // Fetch token list from KoinDX
          const koindxTokens = await fetchKoinDXTokenList();

          // Build token list with special tokens first
          const tokenMap = new Map<string, Token>();

          // Add special tokens first
          for (const special of SPECIAL_TOKENS) {
            tokenMap.set(special.contractId!, {
              contractId: special.contractId!,
              symbol: special.symbol!,
              name: special.name!,
              decimals: special.decimals!,
              icon: special.icon!,
              balance: '0',
              isLoading: false,
            });
          }

          // Add KoinDX tokens (skip blacklisted and duplicates)
          for (const token of koindxTokens) {
            if (BLACKLISTED_CONTRACTS.has(token.address)) {
              continue;
            }
            if (tokenMap.has(token.address)) {
              continue; // Skip duplicates (special tokens take precedence)
            }

            tokenMap.set(token.address, {
              contractId: token.address,
              symbol: token.symbol,
              name: token.name,
              decimals: token.decimals,
              icon: token.logoURI,
              balance: '0',
              isLoading: false,
            });
          }

          const tokens = Array.from(tokenMap.values());
          log.debug(' Built token list with', tokens.length, 'tokens');

          set({
            tokens,
            isInitialized: true,
            lastFetch: now,
            isLoading: false,
          });

          // Fetch balances for all tokens
          await get().refreshBalances(address);
        } catch (error: any) {
          log.error(' Initialization error:', error);
          set({
            isLoading: false,
            error: error.message || 'Failed to initialize tokens',
          });
        }
      },

      refreshBalances: async (address: string) => {
        const { tokens } = get();
        if (tokens.length === 0) {
          log.debug(' No tokens to refresh');
          return;
        }

        log.debug(' Refreshing balances for', tokens.length, 'tokens');

        const provider = new Provider(DEFAULT_NETWORK.rpcNodes);

        // Mark all tokens as loading
        set({
          tokens: tokens.map((t) => ({ ...t, isLoading: true })),
        });

        // Fetch balances in parallel (batch of 5 to avoid rate limiting)
        const batchSize = 5;
        const updatedTokens = [...tokens];

        for (let i = 0; i < tokens.length; i += batchSize) {
          const batch = tokens.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async (token, batchIndex) => {
              const tokenIndex = i + batchIndex;
              try {
                const balance = await getTokenBalance(
                  provider,
                  token.contractId,
                  address,
                  token.decimals
                );
                updatedTokens[tokenIndex] = {
                  ...token,
                  balance,
                  isLoading: false,
                  error: undefined,
                };
              } catch (error: any) {
                log.error(`Error fetching ${token.symbol}:`, error);
                updatedTokens[tokenIndex] = {
                  ...token,
                  balance: '0',
                  isLoading: false,
                  error: error.message,
                };
              }
            })
          );

          // Update state after each batch
          set({ tokens: [...updatedTokens] });
        }

        log.debug(' Finished refreshing balances');
      },

      refreshSingleBalance: async (address: string, contractId: string) => {
        const { tokens } = get();
        const tokenIndex = tokens.findIndex((t) => t.contractId === contractId);

        if (tokenIndex === -1) {
          log.debug(' Token not found:', contractId);
          return;
        }

        const token = tokens[tokenIndex];
        const provider = new Provider(DEFAULT_NETWORK.rpcNodes);

        // Mark token as loading
        const updatedTokens = [...tokens];
        updatedTokens[tokenIndex] = { ...token, isLoading: true };
        set({ tokens: updatedTokens });

        try {
          const balance = await getTokenBalance(
            provider,
            token.contractId,
            address,
            token.decimals
          );

          updatedTokens[tokenIndex] = {
            ...token,
            balance,
            isLoading: false,
            error: undefined,
          };
          set({ tokens: updatedTokens });
        } catch (error: any) {
          log.error(`Error refreshing ${token.symbol}:`, error);
          updatedTokens[tokenIndex] = {
            ...token,
            isLoading: false,
            error: error.message,
          };
          set({ tokens: updatedTokens });
        }
      },

      getTokenByContractId: (contractId: string) => {
        return get().tokens.find((t) => t.contractId === contractId);
      },

      getTokenBySymbol: (symbol: string) => {
        return get().tokens.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase());
      },

      reset: () => {
        set({
          tokens: [],
          isLoading: false,
          isInitialized: false,
          lastFetch: 0,
          error: null,
        });
      },
    }),
    {
      name: 'kondor-tokens',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        tokens: state.tokens,
        lastFetch: state.lastFetch,
        isInitialized: state.isInitialized,
      }),
    }
  )
);
