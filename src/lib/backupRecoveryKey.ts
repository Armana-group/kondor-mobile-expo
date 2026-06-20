import * as Crypto from 'expo-crypto';

export const BACKUP_RECOVERY_KEY_GROUP_COUNT = 8;
export const BACKUP_RECOVERY_KEY_GROUP_LENGTH = 4;

const BACKUP_RECOVERY_KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const BACKUP_RECOVERY_KEY_CHARS =
  BACKUP_RECOVERY_KEY_GROUP_COUNT * BACKUP_RECOVERY_KEY_GROUP_LENGTH;

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
  const bytes = await Crypto.getRandomBytesAsync(BACKUP_RECOVERY_KEY_CHARS);
  const chars = Array.from(bytes, (byte) => BACKUP_RECOVERY_KEY_ALPHABET[byte % BACKUP_RECOVERY_KEY_ALPHABET.length]).join('');
  return normalizeBackupRecoveryKey(chars);
}
