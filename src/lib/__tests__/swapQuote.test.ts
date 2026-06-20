import { Provider } from 'koilib';
import { KOINDX } from '../constants';
import { encodeGetAmountOutArgs, encodeGetPairArgs } from '../koindxCodec';
import { KoinDxSwapQuoteService } from '../swapQuote';
import type { SwapToken } from '../swapMath';

const koin: SwapToken = {
  contractId: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
  symbol: 'KOIN',
  name: 'Koinos',
  decimals: 8,
  icon: '',
  balance: '10',
};

const vhp: SwapToken = {
  contractId: '12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq',
  symbol: 'VHP',
  name: 'Virtual Hash Power',
  decimals: 8,
  icon: '',
  balance: '0',
};

const vUsdt: SwapToken = {
  contractId: '12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh',
  symbol: 'vUSDT',
  name: 'Vortex USDT',
  decimals: 8,
  icon: '',
  balance: '0',
};

describe('KoinDxSwapQuoteService', () => {
  it('gets a direct quote from pair, reserves, and amount_out calls', async () => {
    const call = jest.fn(async (_method: string, params: any) => {
      if (params.contract_id === KOINDX.PERIPHERY_CONTRACT && params.entry_point === KOINDX.ENTRY_POINTS.GET_PAIR) {
        return { result: 'encoded-pair-address' };
      }
      if (params.contract_id === '17PairAddress' && params.entry_point === KOINDX.ENTRY_POINTS.GET_RESERVES) {
        return { result: 'encoded-reserves' };
      }
      if (params.contract_id === KOINDX.PERIPHERY_CONTRACT && params.entry_point === KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT) {
        return { result: 'encoded-amount-out' };
      }
      throw new Error(`unexpected call ${params.contract_id}:${params.entry_point}`);
    });

    const service = new KoinDxSwapQuoteService({
      now: () => 1_000,
      decodeGetPairResult: () => '17PairAddress',
      decodeGetReservesResult: () => ({ reserveA: '1000000000', reserveB: '500000000' }),
      decodeUint64Result: () => '45000000',
    });

    const quote = await service.getSwapQuote({
      provider: { call } as unknown as Provider,
      tokenIn: koin,
      tokenOut: vhp,
      amountIn: '1',
      slippagePercent: 0.5,
      allTokens: [koin, vhp],
    });

    expect(quote.amountIn).toBe('1');
    expect(quote.amountInBaseUnits).toBe('100000000');
    expect(quote.amountOut).toBe('0.45');
    expect(quote.amountOutMin).toBe('0.44775');
    expect(quote.amountOutMinBaseUnits).toBe('44775000');
    expect(quote.route).toEqual(['koin', 'vhp']);
    expect(quote.expiresAt).toBe(61_000);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('rejects same-token swaps before network calls', async () => {
    const call = jest.fn();
    const service = new KoinDxSwapQuoteService();
    await expect(service.getSwapQuote({
      provider: { call } as unknown as Provider,
      tokenIn: koin,
      tokenOut: koin,
      amountIn: '1',
      slippagePercent: 0.5,
      allTokens: [koin, vhp],
    })).rejects.toThrow(/same token/i);
    expect(call).not.toHaveBeenCalled();
  });

  it('returns cached quotes for repeated requests inside cache duration', async () => {
    const call = jest.fn(async (_method: string, params: any) => {
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_PAIR) return { result: 'encoded-pair-address' };
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_RESERVES) return { result: 'encoded-reserves' };
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT) return { result: 'encoded-amount-out' };
      return {};
    });
    const service = new KoinDxSwapQuoteService({
      now: () => 1_000,
      decodeGetPairResult: () => '17PairAddress',
      decodeGetReservesResult: () => ({ reserveA: '1000000000', reserveB: '500000000' }),
      decodeUint64Result: () => '45000000',
    });
    const params = {
      provider: { call } as unknown as Provider,
      tokenIn: koin,
      tokenOut: vhp,
      amountIn: '1',
      slippagePercent: 0.5,
      allTokens: [koin, vhp],
    };

    const first = await service.getSwapQuote(params);
    const second = await service.getSwapQuote(params);

    expect(second).toEqual(first);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('sorts pair lookup by real address and orients reserves for user direction', async () => {
    const call = jest.fn(async (_method: string, params: any) => {
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_PAIR) return { result: 'encoded-pair-address' };
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_RESERVES) return { result: 'encoded-reserves' };
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT) return { result: 'encoded-amount-out' };
      return {};
    });
    const service = new KoinDxSwapQuoteService({
      now: () => 1_000,
      decodeGetPairResult: () => '17PairAddress',
      decodeGetReservesResult: () => ({ reserveA: '200000000', reserveB: '1000000000' }),
      decodeUint64Result: () => '19000000',
    });

    await service.getSwapQuote({
      provider: { call } as unknown as Provider,
      tokenIn: koin,
      tokenOut: vhp,
      amountIn: '1',
      slippagePercent: 0.5,
      allTokens: [koin, vhp],
    });

    expect(call).toHaveBeenCalledWith('chain.read_contract', {
      contract_id: KOINDX.PERIPHERY_CONTRACT,
      entry_point: KOINDX.ENTRY_POINTS.GET_PAIR,
      args: encodeGetPairArgs('vhp', 'koin'),
    });
    expect(call).toHaveBeenCalledWith('chain.read_contract', {
      contract_id: KOINDX.PERIPHERY_CONTRACT,
      entry_point: KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT,
      args: encodeGetAmountOutArgs('100000000', '1000000000', '200000000'),
    });
  });

  it('orients KOIN stablecoin reserves by token identity instead of address sort', async () => {
    const call = jest.fn(async (_method: string, params: any) => {
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_PAIR) return { result: 'encoded-pair-address' };
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_RESERVES) return { result: 'encoded-reserves' };
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT) return { result: 'encoded-amount-out' };
      return {};
    });
    const service = new KoinDxSwapQuoteService({
      now: () => 1_000,
      decodeGetPairResult: () => '17PairAddress',
      decodeGetReservesResult: () => ({
        reserveA: '5325992421831',
        reserveB: '31541683597',
      }),
      decodeUint64Result: () => '590730',
    });

    const quote = await service.getSwapQuote({
      provider: { call } as unknown as Provider,
      tokenIn: koin,
      tokenOut: vUsdt,
      amountIn: '1',
      slippagePercent: 0.5,
      allTokens: [koin, vhp, vUsdt],
    });

    expect(quote.amountOut).toBe('0.0059073');
    expect(call).toHaveBeenCalledWith('chain.read_contract', {
      contract_id: KOINDX.PERIPHERY_CONTRACT,
      entry_point: KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT,
      args: encodeGetAmountOutArgs('100000000', '5325992421831', '31541683597'),
    });
  });
});
