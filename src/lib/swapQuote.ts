import type { Provider } from 'koilib';
import { KOINDX } from './constants';
import {
  decodeGetPairResult as defaultDecodeGetPairResult,
  decodeGetReservesResult as defaultDecodeGetReservesResult,
  decodeUint64Result as defaultDecodeUint64Result,
  encodeGetAmountOutArgs,
  encodeGetPairArgs,
  encodeGetReservesArgs,
} from './koindxCodec';
import {
  SwapError,
  buildDirectRoute,
  calculateMinOutput,
  formatBaseUnits,
  parseDecimalAmount,
  resolveApproveContractId,
  toKoinDxIdentifier,
  type SwapToken,
} from './swapMath';

export interface SwapQuote {
  tokenInContractId: string;
  tokenOutContractId: string;
  amountIn: string;
  amountInBaseUnits: string;
  amountOut: string;
  amountOutBaseUnits: string;
  amountOutMin: string;
  amountOutMinBaseUnits: string;
  priceImpact: number;
  executionPrice: number;
  spotPrice: number;
  route: string[];
  pairAddress: string;
  fee: number;
  timestamp: number;
  expiresAt: number;
}

export interface SwapQuoteParams {
  provider: Provider;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  amountIn: string;
  slippagePercent: number;
  allTokens: SwapToken[];
}

interface KoinDxSwapQuoteServiceOptions {
  now?: () => number;
  decodeGetPairResult?: typeof defaultDecodeGetPairResult;
  decodeGetReservesResult?: typeof defaultDecodeGetReservesResult;
  decodeUint64Result?: typeof defaultDecodeUint64Result;
}

interface TokenQuoteLeg {
  token: SwapToken;
  identifier: string;
  address: string;
}

interface PairCacheEntry {
  address: string;
  cachedAt: number;
}

interface QuoteCacheEntry {
  quote: SwapQuote;
  cachedAt: number;
}

export class KoinDxSwapQuoteService {
  private readonly now: () => number;
  private readonly decodeGetPairResult: typeof defaultDecodeGetPairResult;
  private readonly decodeGetReservesResult: typeof defaultDecodeGetReservesResult;
  private readonly decodeUint64Result: typeof defaultDecodeUint64Result;
  private readonly pairCache = new Map<string, PairCacheEntry>();
  private readonly quoteCache = new Map<string, QuoteCacheEntry>();

  constructor(options: KoinDxSwapQuoteServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.decodeGetPairResult = options.decodeGetPairResult ?? defaultDecodeGetPairResult;
    this.decodeGetReservesResult = options.decodeGetReservesResult ?? defaultDecodeGetReservesResult;
    this.decodeUint64Result = options.decodeUint64Result ?? defaultDecodeUint64Result;
  }

  async getSwapQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    if (params.tokenIn.contractId === params.tokenOut.contractId) {
      throw new SwapError('Cannot swap the same token', 'SAME_TOKEN');
    }

    const timestamp = this.now();
    const tokenInLeg = this.buildLeg(params.tokenIn, params.allTokens);
    const tokenOutLeg = this.buildLeg(params.tokenOut, params.allTokens);
    const route = buildDirectRoute(params.tokenIn, params.tokenOut);
    const quoteCacheKey = this.buildQuoteCacheKey(params, tokenInLeg, tokenOutLeg, route);
    const cachedQuote = this.quoteCache.get(quoteCacheKey);

    if (cachedQuote && timestamp - cachedQuote.cachedAt < KOINDX.QUOTE_CACHE_MS) {
      return cachedQuote.quote;
    }

    const amountInBaseUnits = parseDecimalAmount(params.amountIn, params.tokenIn.decimals);
    const sortedPairLegs = this.sortLegsForPair(tokenInLeg, tokenOutLeg);
    const pairAddress = await this.getPairAddress(
      params.provider,
      sortedPairLegs[0],
      sortedPairLegs[1],
      timestamp
    );
    const reserves = await this.getPairReserves(params.provider, pairAddress);
    const { reserveIn, reserveOut } = this.orientReserves(
      sortedPairLegs,
      tokenInLeg,
      reserves.reserveA,
      reserves.reserveB
    );

    if (BigInt(reserveIn) === 0n || BigInt(reserveOut) === 0n) {
      throw new SwapError('No liquidity available for this pair', 'NO_LIQUIDITY');
    }

    const amountOutBaseUnits = await this.getAmountOut(
      params.provider,
      amountInBaseUnits,
      reserveIn,
      reserveOut
    );
    const amountOut = formatBaseUnits(amountOutBaseUnits, params.tokenOut.decimals);
    const amountOutMin = calculateMinOutput(
      amountOut,
      params.slippagePercent,
      params.tokenOut.decimals
    );
    const amountOutMinBaseUnits = parseDecimalAmount(amountOutMin, params.tokenOut.decimals);
    const { executionPrice, spotPrice, priceImpact } = this.calculatePriceMetrics(
      params,
      amountOut,
      reserveIn,
      reserveOut
    );
    const quote: SwapQuote = {
      tokenInContractId: params.tokenIn.contractId,
      tokenOutContractId: params.tokenOut.contractId,
      amountIn: params.amountIn,
      amountInBaseUnits,
      amountOut,
      amountOutBaseUnits,
      amountOutMin,
      amountOutMinBaseUnits,
      priceImpact,
      executionPrice,
      spotPrice,
      route,
      pairAddress,
      fee: KOINDX.SWAP_FEE,
      timestamp,
      expiresAt: timestamp + KOINDX.QUOTE_EXPIRY_MS,
    };

    this.quoteCache.set(quoteCacheKey, { quote, cachedAt: timestamp });
    return quote;
  }

  private buildLeg(token: SwapToken, allTokens: SwapToken[]): TokenQuoteLeg {
    const identifier = toKoinDxIdentifier(token);
    return {
      token,
      identifier,
      address: resolveApproveContractId(identifier, allTokens),
    };
  }

  private sortLegsForPair(tokenA: TokenQuoteLeg, tokenB: TokenQuoteLeg): [TokenQuoteLeg, TokenQuoteLeg] {
    if (tokenA.address === tokenB.address) {
      throw new SwapError('Cannot swap the same token', 'SAME_TOKEN');
    }

    return tokenA.address < tokenB.address ? [tokenA, tokenB] : [tokenB, tokenA];
  }

  private buildPairCacheKey(tokenA: TokenQuoteLeg, tokenB: TokenQuoteLeg): string {
    return [
      tokenA.address,
      tokenB.address,
      tokenA.identifier,
      tokenB.identifier,
    ].join('|');
  }

  private buildQuoteCacheKey(
    params: SwapQuoteParams,
    tokenInLeg: TokenQuoteLeg,
    tokenOutLeg: TokenQuoteLeg,
    route: string[]
  ): string {
    return [
      tokenInLeg.address,
      tokenOutLeg.address,
      tokenInLeg.identifier,
      tokenOutLeg.identifier,
      params.tokenIn.decimals,
      params.tokenOut.decimals,
      params.amountIn,
      params.slippagePercent,
      route.join('>'),
    ].join('|');
  }

  private async getPairAddress(
    provider: Provider,
    tokenA: TokenQuoteLeg,
    tokenB: TokenQuoteLeg,
    timestamp: number
  ): Promise<string> {
    const cacheKey = this.buildPairCacheKey(tokenA, tokenB);
    const cachedPair = this.pairCache.get(cacheKey);

    if (cachedPair && timestamp - cachedPair.cachedAt < KOINDX.PAIR_CACHE_MS) {
      return cachedPair.address;
    }

    const result = await this.readContract(
      provider,
      KOINDX.PERIPHERY_CONTRACT,
      KOINDX.ENTRY_POINTS.GET_PAIR,
      encodeGetPairArgs(tokenA.identifier, tokenB.identifier)
    );

    if (!result) {
      throw new SwapError('No liquidity pool exists for this pair', 'NO_PAIR');
    }

    const pairAddress = this.decodeGetPairResult(result);
    if (!pairAddress) {
      throw new SwapError('No liquidity pool exists for this pair', 'NO_PAIR');
    }

    this.pairCache.set(cacheKey, { address: pairAddress, cachedAt: timestamp });
    return pairAddress;
  }

  private async getPairReserves(
    provider: Provider,
    pairAddress: string
  ): Promise<{ reserveA: string; reserveB: string }> {
    const result = await this.readContract(
      provider,
      pairAddress,
      KOINDX.ENTRY_POINTS.GET_RESERVES,
      encodeGetReservesArgs()
    );

    if (!result) {
      throw new SwapError('No liquidity available for this pair', 'NO_LIQUIDITY');
    }

    return this.decodeGetReservesResult(result);
  }

  private orientReserves(
    sortedPairLegs: [TokenQuoteLeg, TokenQuoteLeg],
    tokenInLeg: TokenQuoteLeg,
    reserveA: string,
    reserveB: string
  ): { reserveIn: string; reserveOut: string } {
    if (sortedPairLegs[0].address === tokenInLeg.address) {
      return { reserveIn: reserveA, reserveOut: reserveB };
    }

    return { reserveIn: reserveB, reserveOut: reserveA };
  }

  private async getAmountOut(
    provider: Provider,
    amountInBaseUnits: string,
    reserveIn: string,
    reserveOut: string
  ): Promise<string> {
    const result = await this.readContract(
      provider,
      KOINDX.PERIPHERY_CONTRACT,
      KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT,
      encodeGetAmountOutArgs(amountInBaseUnits, reserveIn, reserveOut)
    );

    if (!result) {
      throw new SwapError('Could not calculate swap output', 'CONTRACT_ERROR');
    }

    const amountOut = this.decodeUint64Result(result);
    if (!amountOut) {
      throw new SwapError('Could not calculate swap output', 'CONTRACT_ERROR');
    }

    return amountOut;
  }

  private async readContract(
    provider: Provider,
    contractId: string,
    entryPoint: number,
    args: string
  ): Promise<string | undefined> {
    const result = await provider.call<{ result?: string }>('chain.read_contract', {
      contract_id: contractId,
      entry_point: entryPoint,
      args,
    });

    return result?.result;
  }

  private calculatePriceMetrics(
    params: SwapQuoteParams,
    amountOut: string,
    reserveIn: string,
    reserveOut: string
  ): { executionPrice: number; spotPrice: number; priceImpact: number } {
    const amountInDecimal = Number(params.amountIn);
    const amountOutDecimal = Number(amountOut);
    const reserveInDecimal = Number(formatBaseUnits(reserveIn, params.tokenIn.decimals));
    const reserveOutDecimal = Number(formatBaseUnits(reserveOut, params.tokenOut.decimals));
    const executionPrice = amountInDecimal > 0 ? amountOutDecimal / amountInDecimal : 0;
    const spotPrice = reserveInDecimal > 0 ? reserveOutDecimal / reserveInDecimal : 0;
    const priceImpact = spotPrice > 0
      ? Math.max(0, (spotPrice - executionPrice) / spotPrice)
      : 0;

    return { executionPrice, spotPrice, priceImpact };
  }
}

export const swapQuoteService = new KoinDxSwapQuoteService();
