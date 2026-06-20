import { EXPLORER, KOINOS_TOKEN_CONTRACTS } from './constants';

const MAINNET_CONTRACT_ALIASES: Record<string, string> = {
  [KOINOS_TOKEN_CONTRACTS.KOIN]: 'koin',
  [KOINOS_TOKEN_CONTRACTS.VHP]: 'vhp',
};

export function getContractExplorerUrl(contractId: string): string {
  const contractPath = MAINNET_CONTRACT_ALIASES[contractId] || contractId;
  return `${EXPLORER.mainnet.contract}/${contractPath}`;
}
