import * as SecureStore from 'expo-secure-store';

export type TransactionAuthorizationMode =
  | 'always'
  | 'one-minute'
  | 'five-minutes'
  | 'fifteen-minutes'
  | 'until-lock';

export interface TransactionAuthorizationOption {
  mode: TransactionAuthorizationMode;
  label: string;
  detail: string;
}

const TRANSACTION_AUTHORIZATION_MODE_KEY = 'kondor_transaction_authorization_mode';

const AUTHORIZATION_OPTIONS: TransactionAuthorizationOption[] = [
  {
    mode: 'always',
    label: 'Every transaction',
    detail: 'Authenticate before each manual send or native swap.',
  },
  {
    mode: 'one-minute',
    label: 'Remember for 1 minute',
    detail: 'Skip repeated manual send or native swap prompts for one minute.',
  },
  {
    mode: 'five-minutes',
    label: 'Remember for 5 minutes',
    detail: 'Skip repeated manual send or native swap prompts for five minutes.',
  },
  {
    mode: 'fifteen-minutes',
    label: 'Remember for 15 minutes',
    detail: 'Skip repeated manual send or native swap prompts for fifteen minutes.',
  },
  {
    mode: 'until-lock',
    label: 'Until wallet locks',
    detail: 'Keep authorization in memory until the wallet locks or the app clears it.',
  },
];

const MODE_DURATIONS_MS: Partial<Record<TransactionAuthorizationMode, number>> = {
  'one-minute': 60_000,
  'five-minutes': 5 * 60_000,
  'fifteen-minutes': 15 * 60_000,
};

type RememberedAuthorization = {
  accountAddress: string;
  expiresAt: number | null;
};

let rememberedAuthorization: RememberedAuthorization | null = null;

function isTransactionAuthorizationMode(value: unknown): value is TransactionAuthorizationMode {
  return AUTHORIZATION_OPTIONS.some((option) => option.mode === value);
}

export function getTransactionAuthorizationOptions(): TransactionAuthorizationOption[] {
  return AUTHORIZATION_OPTIONS;
}

export async function getTransactionAuthorizationMode(): Promise<TransactionAuthorizationMode> {
  const storedMode = await SecureStore.getItemAsync(TRANSACTION_AUTHORIZATION_MODE_KEY);
  return isTransactionAuthorizationMode(storedMode) ? storedMode : 'always';
}

export async function setTransactionAuthorizationMode(
  mode: TransactionAuthorizationMode
): Promise<void> {
  const normalizedMode = isTransactionAuthorizationMode(mode) ? mode : 'always';
  await SecureStore.setItemAsync(TRANSACTION_AUTHORIZATION_MODE_KEY, normalizedMode);
  if (normalizedMode === 'always') {
    clearTransactionAuthorization();
  }
}

export function clearTransactionAuthorization(): void {
  rememberedAuthorization = null;
}

export function clearTransactionAuthorizationForAccount(accountAddress: string | null | undefined): void {
  if (!accountAddress || rememberedAuthorization?.accountAddress !== accountAddress) {
    return;
  }

  clearTransactionAuthorization();
}

export async function rememberTransactionAuthorization(
  accountAddress: string,
  now: number = Date.now()
): Promise<void> {
  const mode = await getTransactionAuthorizationMode();

  if (mode === 'always') {
    clearTransactionAuthorization();
    return;
  }

  rememberedAuthorization = {
    accountAddress,
    expiresAt: mode === 'until-lock'
      ? null
      : now + (MODE_DURATIONS_MS[mode] ?? 0),
  };
}

export async function isTransactionAuthorizationActive(
  accountAddress: string | null | undefined,
  now: number = Date.now()
): Promise<boolean> {
  if (!accountAddress || !rememberedAuthorization) {
    return false;
  }

  const mode = await getTransactionAuthorizationMode();
  if (mode === 'always') {
    clearTransactionAuthorization();
    return false;
  }

  if (rememberedAuthorization.accountAddress !== accountAddress) {
    return false;
  }

  if (rememberedAuthorization.expiresAt == null) {
    return true;
  }

  if (rememberedAuthorization.expiresAt <= now) {
    clearTransactionAuthorization();
    return false;
  }

  return true;
}

export async function shouldAuthenticateTransaction(
  accountAddress: string | null | undefined,
  now: number = Date.now()
): Promise<boolean> {
  return !(await isTransactionAuthorizationActive(accountAddress, now));
}
