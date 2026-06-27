import type { Provider } from 'koilib';
import { MAINNET, KOINOS_TOKEN_CONTRACTS, KOINDX } from './constants';
import { swapQuoteService, type SwapQuote } from './swapQuote';
import type { SwapToken } from './swapMath';
import type { Token } from '../stores/tokenStore';
import type { NetworkMode } from '../stores/networkStore';

const KOIN_PRICE_CACHE_MS = KOINDX.QUOTE_CACHE_MS;
const KOIN_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=koinos&vs_currencies=usd';

interface PriceCacheEntry {
  usd: number;
  cachedAt: number;
}

interface QuoteServiceLike {
  getSwapQuote: (params: {
    provider: Provider;
    tokenIn: SwapToken;
    tokenOut: SwapToken;
    amountIn: string;
    slippagePercent: number;
    allTokens: SwapToken[];
  }) => Promise<Pick<SwapQuote, 'amountOut'>>;
}

interface TokenPriceServiceOptions {
  now?: () => number;
  cacheDurationMs?: number;
  fetchKoinUsdPrice?: () => Promise<number>;
  quoteService?: QuoteServiceLike;
}

export interface PortfolioValueParams {
  provider: Provider;
  networkMode: NetworkMode;
  tokens: Token[];
}

export interface PortfolioValueResult {
  totalUsd: number | null;
  pricedTokenCount: number;
  pricesByContractId: Record<string, number>;
  unavailableContractIds: string[];
}

function buildKoinContextToken(): Token {
  return {
    contractId: MAINNET.koinContract,
    symbol: 'KOIN',
    name: 'Koinos',
    decimals: 8,
    icon: '',
    balance: '1',
    isLoading: false,
  };
}

function parseBalance(balance: string): number {
  const parsed = Number(balance);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMainnetKoin(contractId: string): boolean {
  return contractId === KOINOS_TOKEN_CONTRACTS.KOIN;
}

function isMainnetVhp(contractId: string): boolean {
  return contractId === KOINOS_TOKEN_CONTRACTS.VHP;
}

async function fetchDefaultKoinUsdPrice(): Promise<number> {
  const response = await fetch(KOIN_PRICE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch KOIN USD price: ${response.status}`);
  }

  const data = await response.json();
  const usd = Number(data?.koinos?.usd);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error('KOIN USD price unavailable');
  }

  return usd;
}

export class TokenPriceService {
  private readonly now: () => number;
  private readonly cacheDurationMs: number;
  private readonly fetchKoinUsdPrice: () => Promise<number>;
  private readonly quoteService: QuoteServiceLike;
  private koinUsdCache: PriceCacheEntry | null = null;
  private readonly tokenPriceCache = new Map<string, PriceCacheEntry>();

  constructor(options: TokenPriceServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.cacheDurationMs = options.cacheDurationMs ?? KOIN_PRICE_CACHE_MS;
    this.fetchKoinUsdPrice = options.fetchKoinUsdPrice ?? fetchDefaultKoinUsdPrice;
    this.quoteService = options.quoteService ?? swapQuoteService;
  }

  async getPortfolioValue({
    provider,
    networkMode,
    tokens,
  }: PortfolioValueParams): Promise<PortfolioValueResult> {
    if (networkMode !== 'mainnet') {
      return {
        totalUsd: null,
        pricedTokenCount: 0,
        pricesByContractId: {},
        unavailableContractIds: [],
      };
    }

    const balanceTokens = tokens.filter((token) => parseBalance(token.balance) > 0);
    if (balanceTokens.length === 0) {
      return {
        totalUsd: null,
        pricedTokenCount: 0,
        pricesByContractId: {},
        unavailableContractIds: [],
      };
    }

    let koinUsdPrice: number;
    try {
      koinUsdPrice = await this.getKoinUsdPrice();
    } catch (_error) {
      return {
        totalUsd: null,
        pricedTokenCount: 0,
        pricesByContractId: {},
        unavailableContractIds: [],
      };
    }

    const pricesByContractId: Record<string, number> = {};
    const unavailableContractIds: string[] = [];
    let totalUsd = 0;

    for (const token of balanceTokens) {
      const usdPrice = await this.getUsdPriceForToken({
        provider,
        token,
        allTokens: tokens,
        koinUsdPrice,
      });

      if (usdPrice == null) {
        unavailableContractIds.push(token.contractId);
        continue;
      }

      pricesByContractId[token.contractId] = usdPrice;
      totalUsd += parseBalance(token.balance) * usdPrice;
    }

    const pricedTokenCount = Object.keys(pricesByContractId).length;
    return {
      totalUsd: pricedTokenCount > 0 ? totalUsd : null,
      pricedTokenCount,
      pricesByContractId,
      unavailableContractIds,
    };
  }

  private async getKoinUsdPrice(): Promise<number> {
    const now = this.now();
    if (this.koinUsdCache && now - this.koinUsdCache.cachedAt < this.cacheDurationMs) {
      return this.koinUsdCache.usd;
    }

    const usd = await this.fetchKoinUsdPrice();
    this.koinUsdCache = {
      usd,
      cachedAt: now,
    };
    return usd;
  }

  private async getUsdPriceForToken(params: {
    provider: Provider;
    token: Token;
    allTokens: Token[];
    koinUsdPrice: number;
  }): Promise<number | null> {
    const { provider, token, allTokens, koinUsdPrice } = params;
    const now = this.now();
    const cachedPrice = this.tokenPriceCache.get(token.contractId);

    if (cachedPrice && now - cachedPrice.cachedAt < this.cacheDurationMs) {
      return cachedPrice.usd;
    }

    if (isMainnetKoin(token.contractId) || isMainnetVhp(token.contractId)) {
      this.tokenPriceCache.set(token.contractId, {
        usd: koinUsdPrice,
        cachedAt: now,
      });
      return koinUsdPrice;
    }

    try {
      const quoteTokens = allTokens.some((candidate) => isMainnetKoin(candidate.contractId))
        ? allTokens
        : [buildKoinContextToken(), ...allTokens];
      const quote = await this.quoteService.getSwapQuote({
        provider,
        tokenIn: buildKoinContextToken(),
        tokenOut: token,
        amountIn: '1',
        slippagePercent: 0,
        allTokens: quoteTokens,
      });

      const amountOut = Number(quote.amountOut);
      if (!Number.isFinite(amountOut) || amountOut <= 0) {
        return null;
      }

      const usd = koinUsdPrice / amountOut;
      this.tokenPriceCache.set(token.contractId, {
        usd,
        cachedAt: now,
      });
      return usd;
    } catch (_error) {
      return null;
    }
  }
}

export const tokenPriceService = new TokenPriceService();
