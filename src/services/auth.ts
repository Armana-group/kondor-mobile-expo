import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const PIN_HASH_KEY = 'kondor_pin_hash';
const PIN_SALT_KEY = 'kondor_pin_salt';
const PIN_ENABLED_KEY = 'kondor_pin_enabled';
const BIOMETRICS_UNLOCK_KEY = 'kondor_biometrics_unlock';
const SEND_CONFIRMATION_REQUIRED_KEY = 'kondor_send_confirmation_required';
const FAILED_ATTEMPTS_KEY = 'kondor_failed_attempts';
const LOCKOUT_UNTIL_KEY = 'kondor_lockout_until';

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 3;
const MAX_ATTEMPTS_BEFORE_WIPE = 10;
const MAX_LOCKOUT_SECONDS = 3600; // 1 hour cap

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = `${salt}:${pin}`;
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data
  );
}

export async function isPinEnabled(): Promise<boolean> {
  const enabled = await SecureStore.getItemAsync(PIN_ENABLED_KEY);
  return enabled === 'true';
}

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  const enabled = await SecureStore.getItemAsync(BIOMETRICS_UNLOCK_KEY);
  return enabled === 'true';
}

export async function setBiometricUnlock(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRICS_UNLOCK_KEY, enabled ? 'true' : 'false');
}

export async function isSendConfirmationRequired(): Promise<boolean> {
  const required = await SecureStore.getItemAsync(SEND_CONFIRMATION_REQUIRED_KEY);
  return required !== 'false';
}

export async function setSendConfirmationRequired(required: boolean): Promise<void> {
  await SecureStore.setItemAsync(SEND_CONFIRMATION_REQUIRED_KEY, required ? 'true' : 'false');
}

export async function setPin(pin: string): Promise<void> {
  const saltSource = Math.random().toString() + Date.now().toString();
  const salt = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    saltSource
  );
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt);
  await SecureStore.setItemAsync(PIN_ENABLED_KEY, 'true');
  await resetFailedAttempts();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const lockout = await getLockoutState();
  if (lockout.isLockedOut) {
    return false;
  }

  const salt = await SecureStore.getItemAsync(PIN_SALT_KEY);
  const storedHash = await SecureStore.getItemAsync(PIN_HASH_KEY);
  if (!salt || !storedHash) return false;

  const hash = await hashPin(pin, salt);
  const isValid = hash === storedHash;

  if (isValid) {
    await resetFailedAttempts();
  } else {
    await incrementFailedAttempts();
  }

  return isValid;
}

export async function changePin(currentPin: string, newPin: string): Promise<boolean> {
  const isValid = await verifyPin(currentPin);
  if (!isValid) return false;

  await setPin(newPin);
  return true;
}

export async function removePin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY);
  await SecureStore.deleteItemAsync(PIN_SALT_KEY);
  await SecureStore.deleteItemAsync(PIN_ENABLED_KEY);
  await SecureStore.deleteItemAsync(BIOMETRICS_UNLOCK_KEY);
  await SecureStore.deleteItemAsync(SEND_CONFIRMATION_REQUIRED_KEY);
  await resetFailedAttempts();
}

// Brute-force protection

async function incrementFailedAttempts(): Promise<number> {
  const current = parseInt(
    await SecureStore.getItemAsync(FAILED_ATTEMPTS_KEY) || '0',
    10
  );
  const attempts = current + 1;
  await SecureStore.setItemAsync(FAILED_ATTEMPTS_KEY, attempts.toString());

  if (attempts >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
    const lockoutSeconds = Math.min(
      30 * Math.pow(2, attempts - MAX_ATTEMPTS_BEFORE_LOCKOUT),
      MAX_LOCKOUT_SECONDS
    );
    const lockoutUntil = Date.now() + lockoutSeconds * 1000;
    await SecureStore.setItemAsync(LOCKOUT_UNTIL_KEY, lockoutUntil.toString());
  }

  return attempts;
}

async function resetFailedAttempts(): Promise<void> {
  await SecureStore.deleteItemAsync(FAILED_ATTEMPTS_KEY);
  await SecureStore.deleteItemAsync(LOCKOUT_UNTIL_KEY);
}

export interface LockoutState {
  isLockedOut: boolean;
  remainingSeconds: number;
  failedAttempts: number;
  shouldWipe: boolean;
}

export async function getLockoutState(): Promise<LockoutState> {
  const attempts = parseInt(
    await SecureStore.getItemAsync(FAILED_ATTEMPTS_KEY) || '0',
    10
  );

  if (attempts >= MAX_ATTEMPTS_BEFORE_WIPE) {
    return {
      isLockedOut: true,
      remainingSeconds: 0,
      failedAttempts: attempts,
      shouldWipe: true,
    };
  }

  const lockoutUntilStr = await SecureStore.getItemAsync(LOCKOUT_UNTIL_KEY);
  if (!lockoutUntilStr) {
    return {
      isLockedOut: false,
      remainingSeconds: 0,
      failedAttempts: attempts,
      shouldWipe: false,
    };
  }

  const lockoutUntil = parseInt(lockoutUntilStr, 10);
  const now = Date.now();

  if (now >= lockoutUntil) {
    // Lockout expired, clear it
    await SecureStore.deleteItemAsync(LOCKOUT_UNTIL_KEY);
    return {
      isLockedOut: false,
      remainingSeconds: 0,
      failedAttempts: attempts,
      shouldWipe: false,
    };
  }

  return {
    isLockedOut: true,
    remainingSeconds: Math.ceil((lockoutUntil - now) / 1000),
    failedAttempts: attempts,
    shouldWipe: false,
  };
}

export async function getFailedAttempts(): Promise<number> {
  return parseInt(
    await SecureStore.getItemAsync(FAILED_ATTEMPTS_KEY) || '0',
    10
  );
}
