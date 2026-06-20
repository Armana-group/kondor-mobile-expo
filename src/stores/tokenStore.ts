/**
 * Token Store - Multi-token support for Kondor Mobile
 * Fetches token list from KoinDX and manages balances
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Provider, utils } from 'koilib';
import * as protobuf from 'protobufjs/minimal';
import { tokenLogger as log } from '../lib/logger';
import { getActiveNetworkConfig, type NetworkMode } from './networkStore';
import { useCustomTokenStore, type CustomTokenDefinition } from './customTokenStore';

// Token metadata interface
export interface Token {
  contractId: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  balance: string;
  isLoading: boolean;
  isCustom?: boolean;
  isHidden?: boolean;
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
  allTokens: Token[];
  isLoading: boolean;
  isInitialized: boolean;
  lastFetch: number;
  cacheKey: string | null;
  error: string | null;

  // Actions
  initialize: (address: string) => Promise<void>;
  refreshBalances: (address: string) => Promise<void>;
  refreshSingleBalance: (address: string, contractId: string) => Promise<void>;
  syncManagedTokens: (address?: string | null) => Promise<void>;
  getTokenByContractId: (contractId: string) => Token | undefined;
  getTokenBySymbol: (symbol: string) => Token | undefined;
  reset: () => void;
}

// Special tokens that are always included (even if not in KoinDX list)
const MAINNET_SPECIAL_TOKENS: Partial<Token>[] = [
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

const HARBINGER_SPECIAL_TOKENS: Partial<Token>[] = [
  {
    contractId: '1FaSvLjQJsCJKq5ybmGsMMQs8RQYyVv8ju', // Harbinger KOIN
    symbol: 'KOIN',
    name: 'Koinos',
    decimals: 8,
    icon: 'https://raw.githubusercontent.com/koindx/token-list/main/src/images/mainnet/koin.png',
  },
];

// Blacklisted contracts that don't follow standard token interface
// Also skip KoinDX nickname addresses for KOIN/VHP since we have proper entries in SPECIAL_TOKENS
const BLACKLISTED_CONTRACTS = new Set([
  '1A4Nv58odXgVK91bFHgCFWPgiu7kfsxdVY', // Lords Forsaken packs
  'koin', // KoinDX uses nickname, we use full contract address in SPECIAL_TOKENS
  'vhp',  // KoinDX uses nickname, we use full contract address in SPECIAL_TOKENS
]);

const MAINNET_TOKEN_LIST_URL = 'https://raw.githubusercontent.com/koindx/token-list/main/src/tokens/mainnet.json';
const TOKEN_LIST_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface ScopedTokensParams {
  hasHydrated: boolean;
  networkMode: NetworkMode;
  address: string | null | undefined;
  cacheKey: string | null;
  tokens: Token[];
}

interface TokenScopeLoadingParams {
  hasHydrated: boolean;
  networkMode: NetworkMode;
  address: string | null | undefined;
  cacheKey: string | null;
  isLoading: boolean;
}

export function getExpectedTokenCacheKey(networkMode: NetworkMode, address: string): string {
  return `${networkMode}:${address}`;
}

export function getScopedTokens({
  hasHydrated,
  networkMode,
  address,
  cacheKey,
  tokens,
}: ScopedTokensParams): Token[] {
  if (!hasHydrated || !address) {
    return [];
  }

  const expectedCacheKey = getExpectedTokenCacheKey(networkMode, address);
  return cacheKey === expectedCacheKey ? tokens : [];
}

export function isTokenScopeLoading({
  hasHydrated,
  networkMode,
  address,
  cacheKey,
  isLoading,
}: TokenScopeLoadingParams): boolean {
  if (!address) {
    return false;
  }

  if (!hasHydrated) {
    return true;
  }

  const expectedCacheKey = getExpectedTokenCacheKey(networkMode, address);
  return isLoading || cacheKey !== expectedCacheKey;
}

function getTokenScope(address: string): {
  cacheKey: string;
  network: ReturnType<typeof getActiveNetworkConfig>;
} {
  const network = getActiveNetworkConfig();
  return {
    cacheKey: getExpectedTokenCacheKey(network.isTestnet ? 'harbinger' : 'mainnet', address),
    network,
  };
}

export function getTokenListUrlForNetwork(
  network: ReturnType<typeof getActiveNetworkConfig>
): string | null {
  return network.isTestnet ? null : MAINNET_TOKEN_LIST_URL;
}

export function buildTokensForNetwork(
  network: ReturnType<typeof getActiveNetworkConfig>,
  koindxTokens: KoinDXToken[]
): Token[] {
  const tokenMap = new Map<string, Token>();
  const specialTokens = network.isTestnet
    ? HARBINGER_SPECIAL_TOKENS
    : MAINNET_SPECIAL_TOKENS;

  for (const special of specialTokens) {
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

  if (network.isTestnet) {
    return Array.from(tokenMap.values());
  }

  for (const token of koindxTokens) {
    if (BLACKLISTED_CONTRACTS.has(token.address)) {
      continue;
    }
    if (tokenMap.has(token.address)) {
      continue;
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

  return Array.from(tokenMap.values());
}

function getVisibleTokens(tokens: Token[]): Token[] {
  return tokens.filter((token) => !token.isHidden);
}

function toCustomToken(customToken: CustomTokenDefinition, existingToken?: Token): Token {
  return {
    contractId: customToken.contractId,
    symbol: customToken.symbol,
    name: customToken.name,
    decimals: customToken.decimals,
    icon: customToken.icon || '',
    balance: existingToken?.balance || '0',
    isLoading: existingToken?.isLoading || false,
    error: existingToken?.error,
    isCustom: true,
    isHidden: false,
  };
}

interface BuildManagedTokensParams {
  systemTokens: Token[];
  customTokens: CustomTokenDefinition[];
  hiddenSystemTokenIds: string[];
  existingTokens?: Token[];
}

export function buildManagedTokens({
  systemTokens,
  customTokens,
  hiddenSystemTokenIds,
  existingTokens = [],
}: BuildManagedTokensParams): Token[] {
  const existingTokenMap = new Map(existingTokens.map((token) => [token.contractId, token]));
  const managedTokens: Token[] = [];
  const seenContractIds = new Set<string>();
  const hiddenSystemTokenIdSet = new Set(hiddenSystemTokenIds);

  for (const systemToken of systemTokens) {
    const existingToken = existingTokenMap.get(systemToken.contractId);
    managedTokens.push({
      ...systemToken,
      balance: existingToken?.balance || systemToken.balance,
      isLoading: existingToken?.isLoading || systemToken.isLoading,
      error: existingToken?.error,
      isCustom: false,
      isHidden: hiddenSystemTokenIdSet.has(systemToken.contractId),
    });
    seenContractIds.add(systemToken.contractId);
  }

  for (const customToken of customTokens) {
    if (seenContractIds.has(customToken.contractId)) {
      continue;
    }

    managedTokens.push(
      toCustomToken(customToken, existingTokenMap.get(customToken.contractId))
    );
    seenContractIds.add(customToken.contractId);
  }

  return managedTokens;
}

function getManagedTokenState(networkMode: NetworkMode): {
  customTokens: CustomTokenDefinition[];
  hiddenSystemTokenIds: string[];
} {
  const customTokenState = useCustomTokenStore.getState();
  return {
    customTokens: customTokenState.getCustomTokens(networkMode),
    hiddenSystemTokenIds: customTokenState.getHiddenSystemTokenIds(networkMode),
  };
}

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

    const result = await provider.call<{ result?: string }>('chain.read_contract', {
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
async function fetchKoinDXTokenList(
  network: ReturnType<typeof getActiveNetworkConfig>
): Promise<KoinDXToken[]> {
  try {
    const tokenListUrl = getTokenListUrlForNetwork(network);
    if (!tokenListUrl) {
      log.debug(' No token list configured for this network; using fallback tokens only');
      return [];
    }

    log.debug(' Fetching KoinDX token list...');
    const response = await fetch(tokenListUrl);

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
      allTokens: [],
      isLoading: false,
      isInitialized: false,
      lastFetch: 0,
      cacheKey: null,
      error: null,

      initialize: async (address: string) => {
        const { cacheKey, lastFetch, isInitialized } = get();
        const scope = getTokenScope(address);
        const now = Date.now();

        if (cacheKey !== scope.cacheKey) {
          set({
            tokens: [],
            allTokens: [],
            isInitialized: false,
            lastFetch: 0,
            cacheKey: scope.cacheKey,
            error: null,
          });
        }

        // Skip if recently fetched
        if (cacheKey === scope.cacheKey && isInitialized && now - lastFetch < TOKEN_LIST_CACHE_DURATION) {
          log.debug(' Using cached token list');
          // Still refresh balances
          await get().refreshBalances(address);
          return;
        }

        log.debug(' Initializing token store for:', address);
        set({ isLoading: true, error: null, cacheKey: scope.cacheKey });

        try {
          // Fetch token list from KoinDX
          const koindxTokens = await fetchKoinDXTokenList(scope.network);
          const systemTokens = buildTokensForNetwork(scope.network, koindxTokens);
          const managedTokenState = getManagedTokenState(
            scope.network.isTestnet ? 'harbinger' : 'mainnet'
          );
          const allTokens = buildManagedTokens({
            systemTokens,
            customTokens: managedTokenState.customTokens,
            hiddenSystemTokenIds: managedTokenState.hiddenSystemTokenIds,
            existingTokens: get().allTokens,
          });
          log.debug(' Built token list with', allTokens.length, 'tokens');

          if (get().cacheKey !== scope.cacheKey) {
            return;
          }

          set({
            tokens: getVisibleTokens(allTokens),
            allTokens,
            isInitialized: true,
            lastFetch: now,
            isLoading: false,
            cacheKey: scope.cacheKey,
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
        const scope = getTokenScope(address);
        const { allTokens, cacheKey } = get();

        if (cacheKey !== scope.cacheKey) {
          set({
            tokens: [],
            allTokens: [],
            isInitialized: false,
            lastFetch: 0,
            cacheKey: scope.cacheKey,
            isLoading: false,
          });
          return;
        }

        if (allTokens.length === 0) {
          log.debug(' No tokens to refresh');
          return;
        }

        log.debug(' Refreshing balances for', allTokens.length, 'tokens');

        const provider = new Provider(scope.network.rpcNodes);

        // Mark all tokens as loading
        set({
          allTokens: allTokens.map((token) => ({ ...token, isLoading: true })),
          tokens: getVisibleTokens(allTokens.map((token) => ({ ...token, isLoading: true }))),
        });

        // Fetch balances in parallel (batch of 5 to avoid rate limiting)
        const batchSize = 5;
        const updatedTokens = [...allTokens];

        for (let i = 0; i < allTokens.length; i += batchSize) {
          const batch = allTokens.slice(i, i + batchSize);

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
          if (get().cacheKey !== scope.cacheKey) {
            return;
          }
          set({
            allTokens: [...updatedTokens],
            tokens: getVisibleTokens(updatedTokens),
          });
        }

        log.debug(' Finished refreshing balances');
      },

      refreshSingleBalance: async (address: string, contractId: string) => {
        const scope = getTokenScope(address);
        const { allTokens, cacheKey } = get();

        if (cacheKey !== scope.cacheKey) {
          return;
        }

        const tokenIndex = allTokens.findIndex((token) => token.contractId === contractId);

        if (tokenIndex === -1) {
          log.debug(' Token not found:', contractId);
          return;
        }

        const token = allTokens[tokenIndex];
        const provider = new Provider(scope.network.rpcNodes);

        // Mark token as loading
        const updatedTokens = [...allTokens];
        updatedTokens[tokenIndex] = { ...token, isLoading: true };
        set({
          allTokens: updatedTokens,
          tokens: getVisibleTokens(updatedTokens),
        });

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
          if (get().cacheKey !== scope.cacheKey) {
            return;
          }
          set({
            allTokens: updatedTokens,
            tokens: getVisibleTokens(updatedTokens),
          });
        } catch (error: any) {
          log.error(`Error refreshing ${token.symbol}:`, error);
          updatedTokens[tokenIndex] = {
            ...token,
            isLoading: false,
            error: error.message,
          };
          if (get().cacheKey !== scope.cacheKey) {
            return;
          }
          set({
            allTokens: updatedTokens,
            tokens: getVisibleTokens(updatedTokens),
          });
        }
      },

      syncManagedTokens: async (address) => {
        const activeNetwork = getActiveNetworkConfig();
        const networkMode: NetworkMode = activeNetwork.isTestnet ? 'harbinger' : 'mainnet';
        const { allTokens, cacheKey } = get();

        if (address) {
          const scope = getTokenScope(address);
          if (cacheKey !== scope.cacheKey) {
            return;
          }
        }

        const managedTokenState = getManagedTokenState(networkMode);
        const systemTokens = allTokens.filter((token) => !token.isCustom).map((token) => ({
          ...token,
          isHidden: false,
        }));
        const nextAllTokens = buildManagedTokens({
          systemTokens,
          customTokens: managedTokenState.customTokens,
          hiddenSystemTokenIds: managedTokenState.hiddenSystemTokenIds,
          existingTokens: allTokens,
        });

        set({
          allTokens: nextAllTokens,
          tokens: getVisibleTokens(nextAllTokens),
        });

        if (address) {
          await get().refreshBalances(address);
        }
      },

      getTokenByContractId: (contractId: string) => {
        return get().allTokens.find((token) => token.contractId === contractId);
      },

      getTokenBySymbol: (symbol: string) => {
        return get().allTokens.find((token) => token.symbol.toLowerCase() === symbol.toLowerCase());
      },

      reset: () => {
        set({
          tokens: [],
          allTokens: [],
          isLoading: false,
          isInitialized: false,
          lastFetch: 0,
          cacheKey: null,
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
        cacheKey: state.cacheKey,
      }),
    }
  )
);
