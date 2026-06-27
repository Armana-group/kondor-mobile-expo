import { KOINOS_TOKEN_CONTRACTS } from './constants';
import { getActiveNetworkConfig, type NetworkConfig } from '../stores/networkStore';

type ExplorerNetworkConfig = Pick<NetworkConfig, 'explorer' | 'koinContract' | 'isTestnet'>;

function getContractAliases(network: ExplorerNetworkConfig): Record<string, string> {
  const aliases: Record<string, string> = {
    [network.koinContract]: 'koin',
  };

  if (!network.isTestnet) {
    aliases[KOINOS_TOKEN_CONTRACTS.VHP] = 'vhp';
  }

  return aliases;
}

export function getContractExplorerUrl(
  contractId: string,
  network: ExplorerNetworkConfig = getActiveNetworkConfig()
): string {
  const contractPath = getContractAliases(network)[contractId] || contractId;
  return `${network.explorer.contract}/${contractPath}`;
}

export function getTransactionExplorerUrl(
  transactionId: string,
  network: ExplorerNetworkConfig = getActiveNetworkConfig()
): string {
  return `${network.explorer.tx}/${transactionId}`;
}
