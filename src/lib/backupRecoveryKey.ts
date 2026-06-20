import * as Crypto from 'expo-crypto';

export const BACKUP_RECOVERY_KEY_GROUP_COUNT = 8;
export const BACKUP_RECOVERY_KEY_GROUP_LENGTH = 4;

const BACKUP_RECOVERY_KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const BACKUP_RECOVERY_KEY_CHARS =
  BACKUP_RECOVERY_KEY_GROUP_COUNT * BACKUP_RECOVERY_KEY_GROUP_LENGTH;
const MAX_UNBIASED_BYTE =
  Math.floor(256 / BACKUP_RECOVERY_KEY_ALPHABET.length) * BACKUP_RECOVERY_KEY_ALPHABET.length;

export function normalizeBackupRecoveryKey(value: string): string {
  const compact = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return compact
    .match(new RegExp(`.{1,${BACKUP_RECOVERY_KEY_GROUP_LENGTH}}`, 'g'))
    ?.join('-') ?? '';
}

export function isValidBackupRecoveryKey(value: string): boolean {
  const compact = normalizeBackupRecoveryKey(value).replaceAll('-', '');
  if (compact.length !== BACKUP_RECOVERY_KEY_CHARS) {
    return false;
  }

  return [...compact].every((char) => BACKUP_RECOVERY_KEY_ALPHABET.includes(char));
}

export async function generateBackupRecoveryKey(): Promise<string> {
  const indexes: number[] = [];
  while (indexes.length < BACKUP_RECOVERY_KEY_CHARS) {
    const bytes = await Crypto.getRandomBytesAsync(BACKUP_RECOVERY_KEY_CHARS - indexes.length);
    for (const byte of bytes) {
      if (byte >= MAX_UNBIASED_BYTE) {
        continue;
      }

      indexes.push(byte % BACKUP_RECOVERY_KEY_ALPHABET.length);
      if (indexes.length === BACKUP_RECOVERY_KEY_CHARS) {
        break;
      }
    }
  }

  const chars = indexes.map((index) => BACKUP_RECOVERY_KEY_ALPHABET[index]).join('');
  return normalizeBackupRecoveryKey(chars);
}
