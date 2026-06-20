import * as Crypto from 'expo-crypto';
import { validateMnemonic, createWalletFromMnemonic, createWalletFromPrivateKey } from './wallet';
import type { Account } from '../stores/walletStore';

const BACKUP_KIND = 'kondor-wallet-backup';
const BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 250000;
const AES_KEY_LENGTH = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedSecret {
  algorithm: 'pbkdf2-aes-256-gcm';
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
  digest: 'SHA-256';
  keyLength: number;
}

export interface WalletBackupAccountData extends Account {
  encryptedPrivateKey: EncryptedSecret;
}

export interface WalletBackupSnapshot {
  activeAccountId: string;
  nextDerivationIndex: number;
  encryptedMnemonic?: EncryptedSecret;
  accounts: WalletBackupAccountData[];
}

export interface BackupData {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  checksum: string;
  wallet: WalletBackupSnapshot;
}

export interface RestoredWalletSnapshot {
  accounts: Account[];
  activeAccountId: string;
  nextDerivationIndex: number;
  mnemonic: string | null;
  importedPrivateKeys: Record<string, string>;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error('Invalid hex encoding');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

function normalizeBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto is unavailable');
  }
  return subtle;
}

async function deriveAesKey(
  pin: string,
  salt: Uint8Array,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const encodedPin = normalizeBytes(new TextEncoder().encode(pin));
  const baseKey = await subtle.importKey(
    'raw',
    toArrayBuffer(encodedPin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: AES_KEY_LENGTH,
    },
    false,
    usages
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(',')}}`;
}

async function computeChecksum(payload: Omit<BackupData, 'checksum'>): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    stableStringify(payload)
  );
}

function assertSupportedVersion(backup: BackupData): void {
  if (backup.kind !== BACKUP_KIND) {
    throw new Error('Unsupported backup format');
  }
  if (backup.version !== BACKUP_VERSION) {
    throw new Error('Unsupported backup version');
  }
}

function assertBackupShape(backup: BackupData): void {
  if (!backup.wallet || !Array.isArray(backup.wallet.accounts) || backup.wallet.accounts.length === 0) {
    throw new Error('Backup is missing wallet accounts');
  }

  for (const account of backup.wallet.accounts) {
    if (!account?.encryptedPrivateKey) {
      throw new Error(`Backup is missing an encrypted key for account ${account?.id ?? 'unknown'}`);
    }
  }
}

async function decryptAndValidateMnemonic(
  encryptedMnemonic: EncryptedSecret | undefined,
  accounts: WalletBackupAccountData[],
  pin: string
): Promise<string | null> {
  if (!encryptedMnemonic) {
    const hasHdAccounts = accounts.some((account) => !account.isImported);
    if (hasHdAccounts) {
      throw new Error('Backup is missing the encrypted mnemonic for HD accounts');
    }
    return null;
  }

  const mnemonic = await decryptSecretWithPin(encryptedMnemonic, pin);
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Backup mnemonic is invalid');
  }
  return mnemonic;
}

export async function encryptSecretWithPin(secret: string, pin: string): Promise<EncryptedSecret> {
  const subtle = getSubtleCrypto();
  const salt = normalizeBytes(await Crypto.getRandomBytesAsync(SALT_BYTES));
  const iv = normalizeBytes(await Crypto.getRandomBytesAsync(IV_BYTES));
  const key = await deriveAesKey(pin, salt, ['encrypt']);
  const encodedSecret = normalizeBytes(new TextEncoder().encode(secret));
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encodedSecret)
  );

  return {
    algorithm: 'pbkdf2-aes-256-gcm',
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
    iv: bytesToHex(iv),
    salt: bytesToHex(salt),
    iterations: PBKDF2_ITERATIONS,
    digest: 'SHA-256',
    keyLength: AES_KEY_LENGTH,
  };
}

export async function decryptSecretWithPin(secret: EncryptedSecret, pin: string): Promise<string> {
  if (
    !secret ||
    secret.algorithm !== 'pbkdf2-aes-256-gcm' ||
    secret.iterations !== PBKDF2_ITERATIONS ||
    secret.keyLength !== AES_KEY_LENGTH ||
    secret.digest !== 'SHA-256'
  ) {
    throw new Error('Unsupported encrypted secret format');
  }

  const subtle = getSubtleCrypto();
  const salt = normalizeBytes(hexToBytes(secret.salt));
  const iv = normalizeBytes(hexToBytes(secret.iv));
  const ciphertext = normalizeBytes(hexToBytes(secret.ciphertext));
  const key = await deriveAesKey(pin, salt, ['decrypt']);

  try {
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('Invalid PIN or corrupted encrypted secret');
  }
}

export async function createWalletBackup(
  walletSnapshot: WalletBackupSnapshot,
  pin: string
): Promise<BackupData> {
  if (!walletSnapshot.accounts.length) {
    throw new Error('Cannot back up an empty wallet');
  }

  const createdAt = new Date().toISOString();
  const backupWithoutChecksum = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    createdAt,
    wallet: walletSnapshot,
  } as const;

  await restoreWalletBackup(
    {
      ...backupWithoutChecksum,
      checksum: '',
    } as BackupData,
    pin,
    { skipChecksum: true }
  );

  return {
    ...backupWithoutChecksum,
    checksum: await computeChecksum(backupWithoutChecksum),
  };
}

export async function verifyWalletBackup(backup: BackupData, pin: string): Promise<boolean> {
  try {
    await restoreWalletBackup(backup, pin);
    return true;
  } catch {
    return false;
  }
}

export async function restoreWalletBackup(
  backup: BackupData,
  pin: string,
  options?: { skipChecksum?: boolean }
): Promise<RestoredWalletSnapshot> {
  assertSupportedVersion(backup);
  assertBackupShape(backup);

  if (!options?.skipChecksum) {
    const expectedChecksum = await computeChecksum({
      kind: backup.kind,
      version: backup.version,
      createdAt: backup.createdAt,
      wallet: backup.wallet,
    });

    if (backup.checksum !== expectedChecksum) {
      throw new Error('Backup checksum mismatch');
    }
  }

  const mnemonic = await decryptAndValidateMnemonic(
    backup.wallet.encryptedMnemonic,
    backup.wallet.accounts,
    pin
  );
  const importedPrivateKeys: Record<string, string> = {};

  for (const account of backup.wallet.accounts) {
    const privateKey = await decryptSecretWithPin(account.encryptedPrivateKey, pin);
    const walletFromKey = createWalletFromPrivateKey(privateKey);

    if (walletFromKey.address !== account.address) {
      throw new Error(`Backup account ${account.id} failed address verification`);
    }

    if (account.isImported) {
      importedPrivateKeys[account.id] = privateKey;
      continue;
    }

    if (!mnemonic) {
      throw new Error(`HD account ${account.id} cannot be restored without a mnemonic`);
    }

    const derivedWallet = createWalletFromMnemonic(mnemonic, account.derivationIndex);
    if (
      derivedWallet.privateKey !== privateKey ||
      derivedWallet.address !== account.address
    ) {
      throw new Error(`HD account ${account.id} does not match the backup mnemonic`);
    }
  }

  const accounts = backup.wallet.accounts.map(
    ({ encryptedPrivateKey: _encryptedPrivateKey, ...account }) => account
  );
  const activeAccount = accounts.find((account) => account.id === backup.wallet.activeAccountId);

  if (!activeAccount) {
    throw new Error('Backup restore did not include an active account');
  }

  return {
    accounts,
    activeAccountId: activeAccount.id,
    nextDerivationIndex: backup.wallet.nextDerivationIndex,
    mnemonic,
    importedPrivateKeys,
  };
}
