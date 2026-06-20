import * as SecureStore from 'expo-secure-store';
import { Provider, Signer, utils } from 'koilib';
import { requireBiometricAuth } from '../biometrics';
import { createWalletFromMnemonic } from '../wallet';
import { getActiveNetworkConfig } from '../../stores/networkStore';
import { type Account, useWalletStore } from '../../stores/walletStore';

const MNEMONIC_KEY = 'kondor_wallet_mnemonic';
const PRIVATE_KEY_PREFIX = 'kondor_pk_';
const LEGACY_PRIVATE_KEY = 'kondor_wallet_private_key';

const BYTE_INPUT_ERROR =
  'Byte input must be a Uint8Array, byte array, hex string, or base64url string.';
const HASH_LENGTH_ERROR = 'Raw hash requests must provide exactly 32 bytes.';

function assertValidByte(byte: unknown): number {
  if (!Number.isInteger(byte) || (byte as number) < 0 || (byte as number) > 255) {
    throw new Error(BYTE_INPUT_ERROR);
  }

  return byte as number;
}

function decodeHexString(value: string): Uint8Array {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;

  if (normalized.length === 0) {
    return new Uint8Array();
  }

  if (normalized.length % 2 !== 0 || /[^0-9a-f]/i.test(normalized)) {
    throw new Error(BYTE_INPUT_ERROR);
  }

  const bytes = normalized.match(/.{2}/g)?.map((chunk) => Number.parseInt(chunk, 16)) ?? [];
  return new Uint8Array(bytes);
}

function isHexString(value: string): boolean {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;

  if (value.startsWith('0x')) {
    return normalized.length % 2 === 0 && !/[^0-9a-f]/i.test(normalized);
  }

  return normalized.length > 0 && normalized.length % 2 === 0 && !/[^0-9a-f]/i.test(normalized);
}

export function normalizeBytesInput(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Array.isArray(value)) {
    return new Uint8Array(value.map(assertValidByte));
  }

  if (typeof value === 'string') {
    try {
      if (isHexString(value)) {
        return decodeHexString(value);
      }

      return utils.decodeBase64url(value);
    } catch {
      throw new Error(BYTE_INPUT_ERROR);
    }
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([key]) => /^\d+$/.test(key))
      .sort(([left], [right]) => Number(left) - Number(right));

    if (entries.length > 0) {
      return new Uint8Array(entries.map(([, byte]) => assertValidByte(byte)));
    }
  }

  throw new Error(BYTE_INPUT_ERROR);
}

export function normalizeHashBytes(hash: unknown): Uint8Array {
  const bytes = normalizeBytesInput(hash);
  if (bytes.length !== 32) {
    throw new Error(HASH_LENGTH_ERROR);
  }

  return bytes;
}

export function normalizeMessageForSigning(message: unknown): string | Uint8Array {
  if (typeof message === 'string') {
    return isHexString(message) ? decodeHexString(message) : message;
  }

  return normalizeBytesInput(message);
}

function getAccountByAddress(address: string): Account {
  const account = useWalletStore.getState().accounts.find((candidate) => candidate.address === address);

  if (!account) {
    throw new Error(`Signer ${address || 'unknown'} is not in this wallet.`);
  }

  return account;
}

async function getLegacyPrivateKeyForAccount(account: Account): Promise<string | null> {
  const legacyPrivateKey = await SecureStore.getItemAsync(LEGACY_PRIVATE_KEY);
  if (!legacyPrivateKey) {
    return null;
  }

  const legacySigner = legacyPrivateKey.length === 64
    ? new Signer({ privateKey: legacyPrivateKey })
    : Signer.fromWif(legacyPrivateKey);

  return legacySigner.getAddress() === account.address ? legacyPrivateKey : null;
}

async function getAuthenticatedPrivateKeyForAccount(account: Account, operation: string): Promise<string> {
  const authenticated = await requireBiometricAuth(operation);
  if (!authenticated) {
    throw new Error('Authentication required');
  }

  let privateKey: string | null = null;

  if (account.isImported) {
    privateKey = await SecureStore.getItemAsync(`${PRIVATE_KEY_PREFIX}${account.id}`);
  } else {
    const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
    if (mnemonic) {
      privateKey = createWalletFromMnemonic(mnemonic, account.derivationIndex).privateKey;
    }
  }

  if (!privateKey) {
    privateKey = await getLegacyPrivateKeyForAccount(account);
  }

  if (!privateKey) {
    throw new Error('Private key not found');
  }

  return privateKey;
}

function createSigner(privateKey: string, provider: Provider): Signer {
  if (privateKey.length === 64) {
    return new Signer({ privateKey, provider });
  }

  const signer = Signer.fromWif(privateKey);
  signer.provider = provider;
  return signer;
}

function getSigningProvider(provider?: Provider): Provider {
  if (provider) {
    return provider;
  }

  const activeNetwork = getActiveNetworkConfig();
  return new Provider(activeNetwork.rpcNodes);
}

interface AuthenticatedSigningParams {
  signerAddress: string;
  provider?: Provider;
  authOperation?: string;
}

interface AuthenticatedSignerContext {
  account: Account;
  provider: Provider;
  signer: Signer;
}

export async function withAuthenticatedAccountSigner<T>(
  params: AuthenticatedSigningParams,
  callback: (context: AuthenticatedSignerContext) => Promise<T>
): Promise<T> {
  const account = getAccountByAddress(params.signerAddress);
  const provider = getSigningProvider(params.provider);

  let privateKey: string | null = null;
  let signer: Signer | null = null;

  try {
    privateKey = await getAuthenticatedPrivateKeyForAccount(
      account,
      params.authOperation ?? 'sign with this account'
    );
    signer = createSigner(privateKey, provider);

    if (signer.getAddress() !== params.signerAddress) {
      throw new Error('Authenticated signer does not match the requested account.');
    }

    return await callback({
      account,
      provider,
      signer,
    });
  } finally {
    signer = null;
    privateKey = null;
  }
}

export async function signMessageWithAuthenticatedAccount(
  params: AuthenticatedSigningParams & { message: unknown }
): Promise<string> {
  return withAuthenticatedAccountSigner(params, async ({ signer }) => {
    const signature = await signer.signMessage(normalizeMessageForSigning(params.message));
    return utils.encodeBase64url(signature);
  });
}

export async function signHashWithAuthenticatedAccount(
  params: AuthenticatedSigningParams & { hash: unknown }
): Promise<Uint8Array> {
  return withAuthenticatedAccountSigner(
    {
      ...params,
      authOperation: params.authOperation ?? 'sign this hash',
    },
    async ({ signer }) => {
    return await signer.signHash(normalizeHashBytes(params.hash));
    }
  );
}
