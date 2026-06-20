import type { OperationJson } from 'koilib';
import { KOINDX } from './constants';

export interface DecodedOperation {
  type: 'contract_call' | 'upload_contract' | 'set_system_call' | 'set_system_contract';
  title: string;
  contractId: string;
  entryPoint?: number;
  details: { label: string; value: string }[];
}

const KNOWN_CONTRACTS: Record<string, string> = {
  '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK': 'KOIN (KOIN)',
  '15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL': 'KOIN (KOIN)',
  '12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq': 'VHP (VHP)',
  '18tWNU7E4yuQzz7hMVpceb9ixmaWLVyQsr': 'VHP (VHP)',
  [KOINDX.PERIPHERY_CONTRACT]: 'KoinDX Periphery',
  '1NHReq2apWsQ6UPBjNqcV3ABsj88Ncimiy': 'Kollection',
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

export function decodeKnownOperation(operation: OperationJson): DecodedOperation {
  if (operation.call_contract) {
    const { contract_id, entry_point, args } = operation.call_contract;
    const entryPointName = decodeEntryPoint(entry_point);
    const contractName = decodeContract(contract_id);

    return {
      type: 'contract_call',
      title: entryPointName,
      contractId: contract_id,
      entryPoint: entry_point,
      details: [
        { label: 'Contract', value: contractName },
        { label: 'Entry Point', value: entryPointName },
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
    return {
      type: 'set_system_call',
      title: 'Set System Call',
      contractId: 'System',
      details: [
        { label: 'Call ID', value: String(operation.set_system_call.call_id) },
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
