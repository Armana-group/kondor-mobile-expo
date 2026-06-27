import type { Provider } from 'koilib';
import type { Token } from '../../stores/tokenStore';
import { TokenPriceService } from '../tokenPrices';

const koinToken: Token = {
  contractId: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
  symbol: 'KOIN',
  name: 'Koinos',
  decimals: 8,
  icon: '',
  balance: '2',
  isLoading: false,
};

const alphaToken: Token = {
  contractId: '1AlphaContract',
  symbol: 'ALPHA',
  name: 'Alpha Token',
  decimals: 8,
  icon: '',
  balance: '4',
  isLoading: false,
};

describe('TokenPriceService', () => {
  it('calculates portfolio value when KOIN USD and token quote data are available', async () => {
    const quoteService = {
      getSwapQuote: jest.fn(async () => ({
        amountOut: '2',
      })),
    };
    const service = new TokenPriceService({
      now: () => 1_000,
      fetchKoinUsdPrice: jest.fn(async () => 0.5),
      quoteService,
      cacheDurationMs: 30_000,
    });

    const result = await service.getPortfolioValue({
      provider: {} as Provider,
      networkMode: 'mainnet',
      tokens: [koinToken, alphaToken],
    });

    expect(result.totalUsd).toBe(2);
    expect(result.pricedTokenCount).toBe(2);
    expect(result.pricesByContractId[koinToken.contractId]).toBe(0.5);
    expect(result.pricesByContractId[alphaToken.contractId]).toBe(0.25);
  });

  it('marks missing token prices as unavailable without failing the whole portfolio', async () => {
    const quoteService = {
      getSwapQuote: jest.fn(async () => {
        throw new Error('no pair');
      }),
    };
    const service = new TokenPriceService({
      now: () => 1_000,
      fetchKoinUsdPrice: jest.fn(async () => 0.5),
      quoteService,
      cacheDurationMs: 30_000,
    });

    const result = await service.getPortfolioValue({
      provider: {} as Provider,
      networkMode: 'mainnet',
      tokens: [koinToken, alphaToken],
    });

    expect(result.totalUsd).toBe(1);
    expect(result.pricedTokenCount).toBe(1);
    expect(result.pricesByContractId[alphaToken.contractId]).toBeUndefined();
    expect(result.unavailableContractIds).toEqual([alphaToken.contractId]);
  });

  it('returns no portfolio value when the KOIN USD fetch fails', async () => {
    const service = new TokenPriceService({
      now: () => 1_000,
      fetchKoinUsdPrice: jest.fn(async () => {
        throw new Error('price API down');
      }),
      quoteService: {
        getSwapQuote: jest.fn(),
      },
      cacheDurationMs: 30_000,
    });

    const result = await service.getPortfolioValue({
      provider: {} as Provider,
      networkMode: 'mainnet',
      tokens: [koinToken, alphaToken],
    });

    expect(result.totalUsd).toBeNull();
    expect(result.pricedTokenCount).toBe(0);
    expect(result.pricesByContractId).toEqual({});
  });

  it('skips zero-balance tokens when fetching prices', async () => {
    const zeroBalanceToken: Token = {
      ...alphaToken,
      contractId: '1ZeroBalance',
      balance: '0',
    };
    const quoteService = {
      getSwapQuote: jest.fn(async () => ({
        amountOut: '2',
      })),
    };
    const service = new TokenPriceService({
      now: () => 1_000,
      fetchKoinUsdPrice: jest.fn(async () => 0.5),
      quoteService,
      cacheDurationMs: 30_000,
    });

    const result = await service.getPortfolioValue({
      provider: {} as Provider,
      networkMode: 'mainnet',
      tokens: [koinToken, zeroBalanceToken],
    });

    expect(result.totalUsd).toBe(1);
    expect(quoteService.getSwapQuote).not.toHaveBeenCalled();
  });

  it('reuses cached prices within the cache window', async () => {
    let now = 1_000;
    const quoteService = {
      getSwapQuote: jest.fn(async () => ({
        amountOut: '2',
      })),
    };
    const service = new TokenPriceService({
      now: () => now,
      fetchKoinUsdPrice: jest.fn(async () => 0.5),
      quoteService,
      cacheDurationMs: 30_000,
    });

    const params = {
      provider: {} as Provider,
      networkMode: 'mainnet' as const,
      tokens: [alphaToken],
    };

    const first = await service.getPortfolioValue(params);
    now += 5_000;
    const second = await service.getPortfolioValue(params);

    expect(second.totalUsd).toBe(first.totalUsd);
    expect(quoteService.getSwapQuote).toHaveBeenCalledTimes(1);
  });
});
