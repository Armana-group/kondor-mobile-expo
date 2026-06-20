import { utils } from 'koilib';
import { KOINDX, KOINOS_TOKEN_CONTRACTS } from './constants';
import { txLogger } from './logger';

export interface ParsedTransaction {
  id: string;
  type: 'send' | 'receive' | 'swap';
  amount: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenIcon?: string;
  from: string;
  to: string;
  timestamp: number;
  status: 'confirmed' | 'pending';
  blockHeight?: number;
  fee: string;
  payer: string;
  seqNum?: string;
  swapTokenOut?: string;
  swapTokenOutSymbol?: string;
  swapAmountOutMin?: string;
  swapRoute?: string;
}

export type HistoryTokenMetadata = {
  contractId: string;
  symbol: string;
  decimals: number;
  icon?: string;
};

type TokenLookup = (contractId: string) => HistoryTokenMetadata | undefined;

function transactionId(rawTx: any): string {
  return rawTx.trx?.transaction?.id || `tx-${rawTx.seq_num}`;
}

function parseFee(rawTx: any): string {
  if (!rawTx.trx?.receipt?.rc_used) return '0';
  return utils.formatUnits(rawTx.trx.receipt.rc_used, 8);
}

function metadataFor(contractId: string, getTokenByContractId: TokenLookup): HistoryTokenMetadata {
  const tokenInfo = getTokenByContractId(contractId);
  return {
    contractId,
    symbol: tokenInfo?.symbol || fallbackTokenSymbol(contractId),
    decimals: tokenInfo?.decimals ?? 8,
    icon: tokenInfo?.icon,
  };
}

function fallbackTokenSymbol(contractId: string): string {
  if (contractId === KOINOS_TOKEN_CONTRACTS.KOIN) return 'KOIN';
  if (contractId === KOINOS_TOKEN_CONTRACTS.VHP) return 'VHP';
  return 'UNKNOWN';
}

function stringArg(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return undefined;
}

function operationArgs(callContract: any): any | undefined {
  const args = callContract?.args;
  return args && typeof args === 'object' && !Array.isArray(args) ? args : undefined;
}

function resolveRouteContractId(routeValue: unknown): string | undefined {
  const identifier = stringArg(routeValue);
  if (!identifier) return undefined;

  const normalized = identifier.toLowerCase();
  if (normalized === 'koin') return KOINOS_TOKEN_CONTRACTS.KOIN;
  if (normalized === 'vhp') return KOINOS_TOKEN_CONTRACTS.VHP;
  return identifier;
}

function baseFields(rawTx: any) {
  return {
    id: transactionId(rawTx),
    timestamp: 0,
    status: 'confirmed' as const,
    blockHeight: rawTx.block_height,
    fee: parseFee(rawTx),
    payer: rawTx.trx?.transaction?.header?.payer || '',
    seqNum: rawTx.seq_num,
  };
}

function parseSwapTransaction(
  rawTx: any,
  userAddress: string,
  getTokenByContractId: TokenLookup
): ParsedTransaction | null {
  const operations = rawTx.trx?.transaction?.operations || [];
  const swapCall = operations
    .map((operation: any) => operation.call_contract)
    .find((callContract: any) => (
      callContract?.contract_id === KOINDX.PERIPHERY_CONTRACT &&
      callContract?.entry_point === KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN
    ));

  const args = operationArgs(swapCall);
  if (!args) return null;

  const path = Array.isArray(args.path) ? args.path : [];
  const tokenInContractId = resolveRouteContractId(path[0]);
  const tokenOutContractId = resolveRouteContractId(path[path.length - 1]);
  const amountIn = stringArg(args.amount_in ?? args.amountIn);
  const amountOutMin = stringArg(args.amount_out_min ?? args.amountOutMin);
  const from = stringArg(args.from);
  const receiver = stringArg(args.receiver);

  if (!tokenInContractId || !tokenOutContractId || !amountIn || !from || !receiver) {
    return null;
  }

  const lowerUserAddress = userAddress.toLowerCase();
  if (
    from.toLowerCase() !== lowerUserAddress &&
    receiver.toLowerCase() !== lowerUserAddress &&
    String(rawTx.trx?.transaction?.header?.payer || '').toLowerCase() !== lowerUserAddress
  ) {
    return null;
  }

  const tokenIn = metadataFor(tokenInContractId, getTokenByContractId);
  const tokenOut = metadataFor(tokenOutContractId, getTokenByContractId);
  const swapAmountOutMin = amountOutMin
    ? utils.formatUnits(amountOutMin, tokenOut.decimals)
    : undefined;

  return {
    ...baseFields(rawTx),
    type: 'swap',
    amount: utils.formatUnits(amountIn, tokenIn.decimals),
    token: tokenIn.contractId,
    tokenSymbol: tokenIn.symbol,
    tokenDecimals: tokenIn.decimals,
    tokenIcon: tokenIn.icon,
    from,
    to: receiver,
    swapTokenOut: tokenOut.contractId,
    swapTokenOutSymbol: tokenOut.symbol,
    swapAmountOutMin,
    swapRoute: `${tokenIn.symbol} -> ${tokenOut.symbol}`,
  };
}

function parseTransferTransaction(
  rawTx: any,
  userAddress: string,
  getTokenByContractId: TokenLookup
): ParsedTransaction | null {
  const operations = rawTx.trx?.transaction?.operations || [];
  const lowerUserAddress = userAddress.toLowerCase();

  for (const operation of operations) {
    const callContract = operation.call_contract;
    const args = operationArgs(callContract);
    if (!callContract || !args) continue;

    const from = stringArg(args.from);
    const to = stringArg(args.to);
    const amount = stringArg(args.value);
    if (!from || !to || !amount) continue;
    if (from.toLowerCase() !== lowerUserAddress && to.toLowerCase() !== lowerUserAddress) continue;

    const token = metadataFor(callContract.contract_id, getTokenByContractId);
    const type: 'send' | 'receive' = from.toLowerCase() === lowerUserAddress ? 'send' : 'receive';

    return {
      ...baseFields(rawTx),
      type,
      amount: utils.formatUnits(amount, token.decimals),
      token: token.contractId,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      tokenIcon: token.icon,
      from,
      to,
    };
  }

  return null;
}

export function parseHistoryTransaction(
  rawTx: any,
  userAddress: string,
  getTokenByContractId: TokenLookup
): ParsedTransaction | null {
  try {
    const operations = rawTx.trx?.transaction?.operations || [];
    if (operations.length === 0) return null;

    return (
      parseSwapTransaction(rawTx, userAddress, getTokenByContractId) ||
      parseTransferTransaction(rawTx, userAddress, getTokenByContractId)
    );
  } catch (error) {
    txLogger.error('Error parsing transaction:', error);
    return null;
  }
}
