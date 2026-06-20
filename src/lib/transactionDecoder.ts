import { utils, type OperationJson } from 'koilib';
import * as protobuf from 'protobufjs/minimal';
import { KOINDX } from './constants';

export interface DecodedOperation {
  type: 'contract_call' | 'upload_contract' | 'set_system_call' | 'set_system_contract';
  title: string;
  contractId: string;
  entryPoint?: number;
  details: { label: string; value: string }[];
}

const KNOWN_CONTRACTS: Record<string, string> = {
  '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK': 'Koinos (KOIN)',
  '15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL': 'Koinos (KOIN)',
  '1FaSvLjQJsCJKq5ybmGsMMQs8RQYyVv8ju': 'Koinos Testnet (KOIN)',
  '12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq': 'Virtual Hash Power (VHP)',
  '18tWNU7E4yuQzz7hMVpceb9ixmaWLVyQsr': 'Virtual Hash Power (VHP)',
  '17n12ktwN79sR6ia9DDgCfmw77EgpbTyBi': 'Virtual Hash Power (VHP)',
  [KOINDX.PERIPHERY_CONTRACT]: 'KoinDX Periphery',
  '1NHReq2apWsQ6UPBjNqcV3ABsj88Ncimiy': 'Kollection',
};

const TOKEN_METADATA: Record<string, { symbol: string; name: string; decimals: number }> = {
  '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK': { symbol: 'KOIN', name: 'Koinos', decimals: 8 },
  '15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL': { symbol: 'KOIN', name: 'Koinos', decimals: 8 },
  '1FaSvLjQJsCJKq5ybmGsMMQs8RQYyVv8ju': { symbol: 'KOIN', name: 'Koinos Testnet', decimals: 8 },
  '12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq': { symbol: 'VHP', name: 'Virtual Hash Power', decimals: 8 },
  '18tWNU7E4yuQzz7hMVpceb9ixmaWLVyQsr': { symbol: 'VHP', name: 'Virtual Hash Power', decimals: 8 },
  '17n12ktwN79sR6ia9DDgCfmw77EgpbTyBi': { symbol: 'VHP', name: 'Virtual Hash Power', decimals: 8 },
};

const KNOWN_ENTRY_POINTS: Record<number, string> = {
  0x27f576ca: 'transfer',
  [KOINDX.ENTRY_POINTS.TOKEN_APPROVE]: 'approve',
  0x5c721497: 'balanceOf',
  0xe74b785a: 'balanceOfLegacy',
  0xc65b2bae: 'totalSupply',
  [KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN]: 'swap_tokens_in',
  0x82a3537f: 'mint',
  0x859facc5: 'burn',
  0x8f5a3e29: 'addLiquidity',
  0x12b4a9c3: 'removeLiquidity',
};

function decodeEntryPoint(entryPoint: number): string {
  return KNOWN_ENTRY_POINTS[entryPoint] || `0x${entryPoint.toString(16)}`;
}

function decodeContract(contractId: string): string {
  return KNOWN_CONTRACTS[contractId] || contractId;
}

function truncateArguments(args: string): string {
  return args.length > 100 ? `${args.slice(0, 100)}...` : args;
}

function getTokenMetadata(contractId: string) {
  return TOKEN_METADATA[contractId];
}

function formatTokenAmount(value: string, decimals: number, symbol: string): string {
  try {
    const amount = BigInt(value);
    const base = 10n ** BigInt(decimals);
    const whole = amount / base;
    const fraction = amount % base;
    const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${fractionText ? `${whole.toString()}.${fractionText}` : whole.toString()} ${symbol}`;
  } catch {
    return `${value} ${symbol}`.trim();
  }
}

function decodeBase58Address(bytes: Uint8Array): string {
  try {
    return utils.encodeBase58(bytes);
  } catch {
    return 'Unknown address';
  }
}

function decodeApproveArgs(args: string): { owner?: string; spender?: string; value?: string } | null {
  try {
    const reader = protobuf.Reader.create(utils.decodeBase64url(args));
    const decoded: { owner?: string; spender?: string; value?: string } = {};

    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          decoded.owner = decodeBase58Address(reader.bytes());
          break;
        case 2:
          decoded.spender = decodeBase58Address(reader.bytes());
          break;
        case 3:
          decoded.value = reader.uint64().toString();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }

    return decoded;
  } catch {
    return null;
  }
}

function decodeTransferArgs(args: string): {
  from?: string;
  to?: string;
  value?: string;
  memo?: string;
} | null {
  try {
    const reader = protobuf.Reader.create(utils.decodeBase64url(args));
    const decoded: { from?: string; to?: string; value?: string; memo?: string } = {};

    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          decoded.from = decodeBase58Address(reader.bytes());
          break;
        case 2:
          decoded.to = decodeBase58Address(reader.bytes());
          break;
        case 3:
          decoded.value = reader.uint64().toString();
          break;
        case 4:
          decoded.memo = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }

    return decoded;
  } catch {
    return null;
  }
}

function decodeSwapTokensInArgs(args: string): {
  from?: string;
  receiver?: string;
  amountIn?: string;
  amountOutMin?: string;
  path: string[];
} | null {
  try {
    const reader = protobuf.Reader.create(utils.decodeBase64url(args));
    const decoded: {
      from?: string;
      receiver?: string;
      amountIn?: string;
      amountOutMin?: string;
      path: string[];
    } = { path: [] };

    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          decoded.from = decodeBase58Address(reader.bytes());
          break;
        case 2:
          decoded.receiver = decodeBase58Address(reader.bytes());
          break;
        case 3:
          decoded.amountIn = reader.uint64().toString();
          break;
        case 4:
          decoded.amountOutMin = reader.uint64().toString();
          break;
        case 5:
          decoded.path.push(reader.string());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }

    return decoded;
  } catch {
    return null;
  }
}

function getTokenLabel(identifier?: string): string {
  if (!identifier) return 'Unknown token';
  const token = Object.values(TOKEN_METADATA).find((candidate) => (
    candidate.symbol.toLowerCase() === identifier.toLowerCase()
  ));
  return token?.symbol || identifier.toUpperCase();
}

function buildTokenOperation(operation: OperationJson): DecodedOperation | null {
  const callContract = operation.call_contract;
  if (!callContract) {
    return null;
  }

  const { contract_id, entry_point, args } = callContract;
  const token = getTokenMetadata(contract_id);

  if (entry_point === 0x27f576ca && token && args) {
    const decoded = decodeTransferArgs(args);
    if (decoded?.value) {
      return {
        type: 'contract_call',
        title: `Transfer ${token.symbol}`,
        contractId: contract_id,
        entryPoint: entry_point,
        details: [
          { label: 'Token', value: `${token.name} (${token.symbol})` },
          ...(decoded.from ? [{ label: 'From', value: decoded.from }] : []),
          ...(decoded.to ? [{ label: 'To', value: decoded.to }] : []),
          { label: 'Amount', value: formatTokenAmount(decoded.value, token.decimals, token.symbol) },
          ...(decoded.memo ? [{ label: 'Memo', value: decoded.memo }] : []),
        ],
      };
    }
  }

  if (entry_point === KOINDX.ENTRY_POINTS.TOKEN_APPROVE && token && args) {
    const decoded = decodeApproveArgs(args);
    if (decoded?.value) {
      return {
        type: 'contract_call',
        title: `Approve ${token.symbol} spend`,
        contractId: contract_id,
        entryPoint: entry_point,
        details: [
          { label: 'Token', value: `${token.name} (${token.symbol})` },
          ...(decoded.owner ? [{ label: 'Owner', value: decoded.owner }] : []),
          ...(decoded.spender ? [{ label: 'Spender', value: decoded.spender }] : []),
          { label: 'Amount', value: formatTokenAmount(decoded.value, token.decimals, token.symbol) },
        ],
      };
    }
  }

  if (contract_id === KOINDX.PERIPHERY_CONTRACT && entry_point === KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN && args) {
    const decoded = decodeSwapTokensInArgs(args);
    const inputSymbol = getTokenLabel(decoded?.path[0]);
    const outputSymbol = getTokenLabel(decoded?.path[decoded.path.length - 1]);

    if (decoded) {
      return {
        type: 'contract_call',
        title: `Swap ${inputSymbol} for ${outputSymbol}`,
        contractId: contract_id,
        entryPoint: entry_point,
        details: [
          { label: 'Contract', value: decodeContract(contract_id) },
          ...(decoded.from ? [{ label: 'From', value: decoded.from }] : []),
          ...(decoded.receiver ? [{ label: 'Receiver', value: decoded.receiver }] : []),
          ...(decoded.amountIn ? [{ label: 'Amount In', value: formatTokenAmount(decoded.amountIn, 8, inputSymbol) }] : []),
          ...(decoded.amountOutMin ? [{ label: 'Minimum Out', value: formatTokenAmount(decoded.amountOutMin, 8, outputSymbol) }] : []),
          { label: 'Route', value: decoded.path.map(getTokenLabel).join(' -> ') || 'Unknown route' },
        ],
      };
    }
  }

  return null;
}

export function decodeKnownOperation(operation: OperationJson): DecodedOperation {
  if (operation.call_contract) {
    const decodedKnownOperation = buildTokenOperation(operation);
    if (decodedKnownOperation) {
      return decodedKnownOperation;
    }

    const { contract_id, entry_point, args } = operation.call_contract;
    const entryPointName = decodeEntryPoint(entry_point);

    return {
      type: 'contract_call',
      title: KNOWN_ENTRY_POINTS[entry_point]
        ? entryPointName
        : `Contract Call (Entry: 0x${entry_point.toString(16)})`,
      contractId: contract_id,
      entryPoint: entry_point,
      details: [
        { label: 'Contract ID', value: contract_id },
        { label: 'Contract', value: decodeContract(contract_id) },
        { label: 'Entry Point', value: `0x${entry_point.toString(16)}` },
        ...(args ? [{ label: 'Arguments', value: truncateArguments(args) }] : []),
      ],
    };
  }

  if (operation.upload_contract) {
    return {
      type: 'upload_contract',
      title: 'Upload Contract',
      contractId: operation.upload_contract.contract_id || 'New Contract',
      details: [
        { label: 'Contract ID', value: operation.upload_contract.contract_id || 'TBD' },
        { label: 'Bytecode Size', value: `${(operation.upload_contract.bytecode?.length || 0) / 2} bytes` },
      ],
    };
  }

  if (operation.set_system_call) {
    const target = operation.set_system_call.target as
      | { system_call_bundle?: { contract_id?: string; entry_point?: number } }
      | undefined;
    const bundle = target?.system_call_bundle;

    return {
      type: 'set_system_call',
      title: 'Unknown System Call',
      contractId: 'System',
      details: [
        { label: 'Call ID', value: String(operation.set_system_call.call_id) },
        ...(bundle?.contract_id ? [{ label: 'Contract ID', value: bundle.contract_id }] : []),
        ...(typeof bundle?.entry_point === 'number'
          ? [{ label: 'Entry Point', value: `0x${bundle.entry_point.toString(16)}` }]
          : []),
        { label: 'Target', value: JSON.stringify(operation.set_system_call.target) },
      ],
    };
  }

  if (operation.set_system_contract) {
    return {
      type: 'set_system_contract',
      title: 'Set System Contract',
      contractId: 'System',
      details: [
        { label: 'Contract ID', value: operation.set_system_contract.contract_id || 'N/A' },
        { label: 'System Contract', value: String(operation.set_system_contract.system_contract) },
      ],
    };
  }

  return {
    type: 'contract_call',
    title: 'Unknown Operation',
    contractId: 'Unknown',
    details: [
      { label: 'Operation', value: JSON.stringify(operation) },
    ],
  };
}

export function hasKoinDxSwapOperation(operations: OperationJson[] | undefined): boolean {
  return Boolean(operations?.some((operation) => (
    operation.call_contract?.contract_id === KOINDX.PERIPHERY_CONTRACT &&
    operation.call_contract.entry_point === KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN
  )));
}
