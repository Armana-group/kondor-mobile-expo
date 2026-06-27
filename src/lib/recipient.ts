import { Contract, Provider, utils } from 'koilib';
import { getNetworkConfigForMode, type NetworkMode } from '../stores/networkStore';

export type RecipientResolutionSource = 'address' | 'nickname' | 'kap';

export interface RecipientResolution {
  input: string;
  address: string;
  source: RecipientResolutionSource;
  label: string;
}

const contractCache = new Map<string, Promise<Contract | null>>();

export function normalizeRecipientInput(value: string): string {
  return value.trim().replace(/^kap:\/\//i, '').replace(/^@/, '');
}

export function isValidKoinosAddress(value: string): boolean {
  const trimmed = value.trim();

  try {
    return utils.isChecksumAddress(trimmed);
  } catch {
    return /^[1-9A-HJ-NP-Za-km-z]{33,35}$/.test(trimmed);
  }
}

function utf8ToHex(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function loadContract(
  networkMode: NetworkMode,
  contractId: string
): Promise<Contract | null> {
  const networkConfig = getNetworkConfigForMode(networkMode);
  const cacheKey = `${networkMode}:${networkConfig.rpcNodes.join(',')}:${contractId}`;
  const cached = contractCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    try {
      const provider = new Provider(networkConfig.rpcNodes);
      const contract = new Contract({ id: contractId, provider });
      await contract.fetchAbi();
      return contract;
    } catch {
      return null;
    }
  })();

  contractCache.set(cacheKey, promise);
  const contract = await promise;
  if (!contract) {
    contractCache.delete(cacheKey);
  }

  return contract;
}

async function resolveNickname(
  value: string,
  networkMode: NetworkMode
): Promise<RecipientResolution | null> {
  const contractId = getNetworkConfigForMode(networkMode).nicknamesContractId;
  if (!contractId) {
    return null;
  }

  const contract = await loadContract(networkMode, contractId);
  if (!contract?.functions.get_address) {
    return null;
  }

  try {
    const { result } = await contract.functions.get_address({ value });
    const address = result?.value;
    if (!address || !isValidKoinosAddress(address)) {
      return null;
    }

    return {
      input: value,
      address,
      source: 'nickname',
      label: `@${value} resolves to ${address}`,
    };
  } catch {
    return null;
  }
}

async function resolveKapName(
  value: string,
  networkMode: NetworkMode
): Promise<RecipientResolution | null> {
  const contractId = getNetworkConfigForMode(networkMode).kapNameServiceContractId;
  if (!contractId) {
    return null;
  }

  const contract = await loadContract(networkMode, contractId);
  if (!contract?.functions.owner_of) {
    return null;
  }

  try {
    const { result } = await contract.functions.owner_of({
      token_id: `0x${utf8ToHex(value)}`,
    });
    const address = result?.value;
    if (!address || !isValidKoinosAddress(address)) {
      return null;
    }

    return {
      input: value,
      address,
      source: 'kap',
      label: `kap://${value} resolves to ${address}`,
    };
  } catch {
    return null;
  }
}

export async function resolveRecipient(
  value: string,
  networkMode: NetworkMode
): Promise<RecipientResolution | null> {
  const trimmedInput = value.trim();
  if (!trimmedInput) {
    return null;
  }

  if (isValidKoinosAddress(trimmedInput)) {
    return {
      input: trimmedInput,
      address: trimmedInput,
      source: 'address',
      label: 'Valid Koinos address',
    };
  }

  const name = normalizeRecipientInput(trimmedInput);
  if (!name) {
    return null;
  }

  const nicknameResolution = await resolveNickname(name, networkMode);
  if (nicknameResolution) {
    return nicknameResolution;
  }

  const kapResolution = await resolveKapName(name, networkMode);
  if (kapResolution) {
    return kapResolution;
  }

  return null;
}
