import {
  SwapError,
  assertProtectedMinOutput,
  buildDirectRoute,
  calculateMinOutput,
  formatBaseUnits,
  parseDecimalAmount,
  resolveApproveContractId,
  toKoinDxIdentifier,
  type SwapToken,
} from '../swapMath';

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

const token18: SwapToken = {
  contractId: '1TokenWith18Decimals',
  symbol: 'TOK',
  name: 'Token',
  decimals: 18,
  icon: '',
  balance: '0',
};

describe('swapMath', () => {
  it('parses and formats decimal amounts without float rounding', () => {
    expect(parseDecimalAmount('1', 8)).toBe('100000000');
    expect(parseDecimalAmount('1.23456789', 8)).toBe('123456789');
    expect(parseDecimalAmount('0.00000001', 8)).toBe('1');
    expect(formatBaseUnits('123456789', 8)).toBe('1.23456789');
    expect(formatBaseUnits('100000000', 8)).toBe('1');
  });

  it('rejects malformed or over-precision user amounts', () => {
    expect(() => parseDecimalAmount('', 8)).toThrow(SwapError);
    expect(() => parseDecimalAmount('abc', 8)).toThrow(SwapError);
    expect(() => parseDecimalAmount('-1', 8)).toThrow(SwapError);
    expect(() => parseDecimalAmount('1.000000001', 8)).toThrow(SwapError);
  });

  it('calculates min output at the output token precision', () => {
    expect(calculateMinOutput('0.9', 0.5, 8)).toBe('0.8955');
    expect(Number(calculateMinOutput('0.0000000005', 0.5, 18))).toBeGreaterThan(0);
    expect(calculateMinOutput('0.000000004', 0.5, 8)).toBe('0');
  });

  it('fails closed when a non-zero input has zero minimum output', () => {
    expect(() => assertProtectedMinOutput('1', '0')).toThrow(/slippage protection/i);
    expect(() => assertProtectedMinOutput('0', '0')).not.toThrow();
  });

  it('parses slippage percentages with decimal precision without float drift', () => {
    expect(calculateMinOutput('1', 0.145, 8)).toBe('0.9985');
  });

  it('throws SwapError for malformed minimum-output base-unit values', () => {
    expect(() => assertProtectedMinOutput('1', 'abc')).toThrow(SwapError);
    expect(() => assertProtectedMinOutput('1', '1.5')).toThrow(SwapError);
  });

  it('uses KoinDX nickname identifiers only for route path KOIN and VHP', () => {
    expect(toKoinDxIdentifier(koin)).toBe('koin');
    expect(toKoinDxIdentifier(vhp)).toBe('vhp');
    expect(toKoinDxIdentifier(token18)).toBe('1TokenWith18Decimals');
    expect(buildDirectRoute(koin, vhp)).toEqual(['koin', 'vhp']);
    expect(resolveApproveContractId('koin', [koin, vhp])).toBe(koin.contractId);
    expect(resolveApproveContractId('1TokenWith18Decimals', [token18])).toBe('1TokenWith18Decimals');
  });
});
