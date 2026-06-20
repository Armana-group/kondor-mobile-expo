import { KOINOS_TOKEN_CONTRACTS } from './constants';

export type SwapErrorCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_AMOUNT_PRECISION'
  | 'INVALID_SLIPPAGE'
  | 'SAME_TOKEN'
  | 'NO_PAIR'
  | 'NO_LIQUIDITY'
  | 'QUOTE_EXPIRED'
  | 'CONTRACT_ERROR'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_SLIPPAGE_FLOOR';

export class SwapError extends Error {
  constructor(message: string, public code: SwapErrorCode) {
    super(message);
    this.name = 'SwapError';
  }
}

export interface SwapToken {
  contractId: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  balance: string;
}

const DECIMAL_AMOUNT_RE = /^\d+(?:\.\d+)?$/;
const BASE_UNIT_RE = /^\d+$/;
const DECIMAL_RE = /^\d+(?:\.\d+)?$/;

const trimToken = (value: string) => value.trim();

function toBaseUnitsExact(
  amount: string,
  decimals: number,
  allowOverPrecision = false
): string {
  const trimmed = trimToken(amount);
  if (!trimmed) {
    throw new SwapError('Amount must be a valid decimal', 'INVALID_AMOUNT');
  }

  if (!DECIMAL_AMOUNT_RE.test(trimmed)) {
    throw new SwapError('Amount must be a valid decimal', 'INVALID_AMOUNT');
  }

  const [integerPart, rawFraction = ''] = trimmed.split('.');

  if (rawFraction.length > decimals) {
    if (allowOverPrecision) {
      // Truncate extra precision for routing calculations.
      // This mirrors quote output behavior where tiny fractional dust should safely
      // floor to zero minimum output.
    } else {
      throw new SwapError('Amount has too many decimal places', 'INVALID_AMOUNT_PRECISION');
    }
  }

  const fraction = rawFraction.slice(0, decimals).padEnd(decimals, '0');
  const combined = `${integerPart}${fraction}`;
  return BigInt(combined).toString();
}

function parseBaseUnits(value: string): bigint {
  const trimmed = trimToken(value);
  if (!trimmed || !BASE_UNIT_RE.test(trimmed)) {
    throw new SwapError('Amount must be a valid integer', 'INVALID_AMOUNT');
  }
  return BigInt(trimmed);
}

function parseSlippageBps(slippagePercent: number): bigint {
  if (!Number.isFinite(slippagePercent)) {
    throw new SwapError('Slippage must be between 0.01 and 50', 'INVALID_SLIPPAGE');
  }

  const asString = trimToken(String(slippagePercent));
  if (!DECIMAL_RE.test(asString)) {
    throw new SwapError('Slippage must be a decimal', 'INVALID_SLIPPAGE');
  }

  const [integerPart, fractionPart = ''] = asString.split('.');
  const scale = 10n ** BigInt(fractionPart.length);
  const integerPartBigInt = BigInt(integerPart);
  const fractionPartBigInt = fractionPart ? BigInt(fractionPart) : 0n;
  const numerator = (integerPartBigInt * scale + fractionPartBigInt) * 100n;
  const hasFraction = fractionPart !== '0'.repeat(fractionPart.length);

  if (integerPartBigInt < 0n || integerPartBigInt > 50n) {
    throw new SwapError('Slippage must be between 0.01 and 50', 'INVALID_SLIPPAGE');
  }

  if (integerPartBigInt === 50n && hasFraction) {
    throw new SwapError('Slippage must be between 0.01 and 50', 'INVALID_SLIPPAGE');
  }

  if (numerator < scale) {
    throw new SwapError('Slippage must be between 0.01 and 50', 'INVALID_SLIPPAGE');
  }

  const rounded = (numerator + scale / 2n) / scale;

  if (rounded < 1n || rounded > 5000n) {
    throw new SwapError('Slippage must be between 0.01 and 50', 'INVALID_SLIPPAGE');
  }

  return rounded;
}

export function parseDecimalAmount(amount: string, decimals: number): string {
  return toBaseUnitsExact(amount, decimals, false);
}

export function formatBaseUnits(value: string, decimals: number): string {
  const trimmed = trimToken(value);
  if (!trimmed || !BASE_UNIT_RE.test(trimmed)) {
    throw new SwapError('Amount must be a valid integer', 'INVALID_AMOUNT');
  }

  const units = BigInt(trimmed).toString();

  if (decimals === 0) {
    return units;
  }

  const padded = units.padStart(decimals + 1, '0');
  const integerPart = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '');
  const fractionRaw = padded.slice(-decimals).replace(/0+$/, '');
  if (!fractionRaw) {
    return integerPart;
  }

  return `${integerPart}.${fractionRaw}`;
}

export function calculateMinOutput(
  amountOut: string,
  slippagePercent: number,
  outputDecimals: number
): string {
  const slippageBps = parseSlippageBps(slippagePercent);
  const units = BigInt(toBaseUnitsExact(amountOut, outputDecimals, true));
  const scaled = (units * (10_000n - slippageBps)) / 10_000n;
  return formatBaseUnits(scaled.toString(), outputDecimals);
}

export function assertProtectedMinOutput(amountInBaseUnits: string, amountOutMinBaseUnits: string): void {
  const amountIn = parseBaseUnits(amountInBaseUnits);
  const amountOutMin = parseBaseUnits(amountOutMinBaseUnits);

  if (amountIn > 0n && amountOutMin === 0n) {
    throw new SwapError(
      'Slippage protection would result in zero minimum output',
      'INVALID_SLIPPAGE_FLOOR'
    );
  }
}

export function toKoinDxIdentifier(token: Pick<SwapToken, 'contractId' | 'symbol'>): string {
  if (token.contractId === KOINOS_TOKEN_CONTRACTS.KOIN) {
    return 'koin';
  }
  if (token.contractId === KOINOS_TOKEN_CONTRACTS.VHP) {
    return 'vhp';
  }
  return token.contractId;
}

export function resolveApproveContractId(identifier: string, tokens: SwapToken[]): string {
  if (identifier === 'koin') {
    const koin = tokens.find((token) => token.contractId === KOINOS_TOKEN_CONTRACTS.KOIN);
    if (!koin) {
      throw new SwapError('Could not resolve KOIN identifier', 'CONTRACT_ERROR');
    }
    return KOINOS_TOKEN_CONTRACTS.KOIN;
  }

  if (identifier === 'vhp') {
    const vhp = tokens.find((token) => token.contractId === KOINOS_TOKEN_CONTRACTS.VHP);
    if (!vhp) {
      throw new SwapError('Could not resolve VHP identifier', 'CONTRACT_ERROR');
    }
    return KOINOS_TOKEN_CONTRACTS.VHP;
  }

  return identifier;
}

export function buildDirectRoute(tokenIn: SwapToken, tokenOut: SwapToken): string[] {
  return [toKoinDxIdentifier(tokenIn), toKoinDxIdentifier(tokenOut)];
}
