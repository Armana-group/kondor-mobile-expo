jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { KOINOS_TOKEN_CONTRACTS, MAINNET, TESTNET } from '../../lib/constants';
import {
  buildTokensForNetwork,
  buildManagedTokens,
  getVisibleTokens,
  getTokenListUrlForNetwork,
  type Token,
} from '../tokenStore';

const ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

async function loadTokenStoreModule() {
  jest.resetModules();
  const mod = require('../tokenStore');
  await mod.useTokenStore.persist.rehydrate();
  return mod;
}

const mainnetList = [
  {
    chainId: 24,
    address: '1TokenMainnetAlpha',
    name: 'Alpha',
    symbol: 'ALPHA',
    decimals: 8,
    logoURI: 'https://example.com/alpha.png',
  },
  {
    chainId: 24,
    address: 'koin',
    name: 'Koin Alias',
    symbol: 'KOIN',
    decimals: 8,
    logoURI: 'https://example.com/koin.png',
  },
];

describe('tokenStore network token helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the mainnet token list URL on mainnet', () => {
    expect(getTokenListUrlForNetwork(MAINNET)).toMatch(/mainnet\.json$/);
  });

  it('does not use the mainnet token list on Harbinger', () => {
    expect(getTokenListUrlForNetwork(TESTNET)).toBeNull();
  });

  it('builds a minimal Harbinger token set with the Harbinger KOIN contract', () => {
    const tokens = buildTokensForNetwork(TESTNET, mainnetList) as Token[];

    expect(tokens).toEqual([
      expect.objectContaining({
        contractId: TESTNET.koinContract,
        symbol: 'KOIN',
        balance: '0',
      }),
    ]);
    expect(tokens.some((token) => token.contractId === '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK')).toBe(false);
    expect(tokens.some((token) => token.symbol === 'ALPHA')).toBe(false);
  });

  it('keeps hidden system tokens in the managed token set while filtering them from visible UI lists', () => {
    const systemTokens: Token[] = [
      {
        contractId: MAINNET.koinContract,
        symbol: 'KOIN',
        name: 'Koinos',
        decimals: 8,
        icon: '',
        balance: '1',
        isLoading: false,
      },
      {
        contractId: KOINOS_TOKEN_CONTRACTS.VHP,
        symbol: 'VHP',
        name: 'Virtual Hash Power',
        decimals: 8,
        icon: '',
        balance: '2',
        isLoading: false,
      },
    ];

    const managedTokens = buildManagedTokens({
      systemTokens,
      customTokens: [],
      hiddenSystemTokenIds: [MAINNET.koinContract],
    });

    expect(managedTokens).toEqual([
      expect.objectContaining({
        contractId: MAINNET.koinContract,
        isHidden: true,
      }),
      expect.objectContaining({
        contractId: KOINOS_TOKEN_CONTRACTS.VHP,
        isHidden: false,
      }),
    ]);
    expect(getVisibleTokens(managedTokens).map((token) => token.contractId)).toEqual([
      KOINOS_TOKEN_CONTRACTS.VHP,
    ]);
  });

  it('reconstructs canonical allTokens before the cached warm-start fast path', async () => {
    const persistedTokens: Token[] = [
      {
        contractId: MAINNET.koinContract,
        symbol: 'KOIN',
        name: 'Koinos',
        decimals: 8,
        icon: '',
        balance: '12.34000000',
        isLoading: false,
        isHidden: true,
      },
      {
        contractId: '1AlphaCustomToken',
        symbol: 'ALPHA',
        name: 'Alpha Token',
        decimals: 8,
        icon: '',
        balance: '5.00000000',
        isLoading: false,
        isCustom: true,
      },
    ];

    const { useTokenStore } = await loadTokenStoreModule();
    const refreshSnapshots: Token[][] = [];

    useTokenStore.setState({
      tokens: persistedTokens,
      allTokens: [],
      lastFetch: Date.now(),
      isInitialized: true,
      cacheKey: `mainnet:${ADDRESS}`,
    });

    useTokenStore.setState({
      refreshBalances: async () => {
        refreshSnapshots.push(
          useTokenStore.getState().allTokens.map((token: Token) => ({ ...token }))
        );
      },
    });

    expect(useTokenStore.getState().allTokens).toEqual([]);

    await useTokenStore.getState().initialize(ADDRESS);

    expect(refreshSnapshots).toEqual([persistedTokens]);
    expect(useTokenStore.getState().getTokenByContractId('1AlphaCustomToken')).toEqual(
      expect.objectContaining({
        contractId: '1AlphaCustomToken',
        isCustom: true,
      })
    );
  });

  it('stops a token balance refresh after a transient HTML RPC response', async () => {
    jest.resetModules();

    const mockProviderCall = jest.fn(async () => {
      throw new SyntaxError('JSON Parse error: Unexpected character: <');
    });

    jest.doMock('koilib', () => {
      const actual = jest.requireActual('koilib');

      return {
        ...actual,
        Provider: jest.fn(function MockProvider(this: any) {
          this.call = mockProviderCall;
        }),
        utils: {
          ...actual.utils,
          decodeBase58: jest.fn(() => new Uint8Array([1, 2, 3])),
          encodeBase64url: jest.fn(() => 'encoded-balance-args'),
        },
      };
    });

    try {
      const { useTokenStore } = await loadTokenStoreModule();
      const existingTokens: Token[] = [
        {
          contractId: MAINNET.koinContract,
          symbol: 'KOIN',
          name: 'Koinos',
          decimals: 8,
          icon: '',
          balance: '8.00000000',
          isLoading: false,
        },
        {
          contractId: KOINOS_TOKEN_CONTRACTS.VHP,
          symbol: 'VHP',
          name: 'Virtual Hash Power',
          decimals: 8,
          icon: '',
          balance: '2.00000000',
          isLoading: false,
        },
      ];

      useTokenStore.setState({
        tokens: existingTokens,
        allTokens: existingTokens,
        cacheKey: `mainnet:${ADDRESS}`,
        isInitialized: true,
        error: null,
      });

      await useTokenStore.getState().refreshBalances(ADDRESS);

      expect(mockProviderCall).toHaveBeenCalledTimes(1);
      expect(useTokenStore.getState().tokens).toEqual(existingTokens);
      expect(useTokenStore.getState().allTokens).toEqual(existingTokens);
      expect(useTokenStore.getState().error).toMatch(/temporarily unavailable/i);
    } finally {
      jest.dontMock('koilib');
    }
  });
});
