import * as SecureStore from 'expo-secure-store';

const mockStore = (SecureStore as any).__store as Map<string, string>;

async function loadService(): Promise<typeof import('../transactionAuthorization')> {
  jest.resetModules();
  return require('../transactionAuthorization');
}

describe('transactionAuthorization', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('defaults to requiring authentication for every transaction', async () => {
    const {
      getTransactionAuthorizationMode,
      isTransactionAuthorizationActive,
      shouldAuthenticateTransaction,
    } = await loadService();

    expect(await getTransactionAuthorizationMode()).toBe('always');
    expect(await isTransactionAuthorizationActive('account-1', 1_000)).toBe(false);
    expect(await shouldAuthenticateTransaction('account-1', 1_000)).toBe(true);
  });

  it('remembers authorization for the configured account-scoped window', async () => {
    const {
      setTransactionAuthorizationMode,
      rememberTransactionAuthorization,
      isTransactionAuthorizationActive,
      shouldAuthenticateTransaction,
    } = await loadService();

    await setTransactionAuthorizationMode('five-minutes');
    await rememberTransactionAuthorization('account-1', 1_000);

    expect(await isTransactionAuthorizationActive('account-1', 1_000 + 299_000)).toBe(true);
    expect(await shouldAuthenticateTransaction('account-1', 1_000 + 299_000)).toBe(false);
    expect(await isTransactionAuthorizationActive('account-2', 1_000 + 299_000)).toBe(false);
    expect(await isTransactionAuthorizationActive('account-1', 1_000 + 301_000)).toBe(false);
  });

  it('keeps until-lock authorization active until explicitly cleared', async () => {
    const {
      setTransactionAuthorizationMode,
      rememberTransactionAuthorization,
      isTransactionAuthorizationActive,
      clearTransactionAuthorization,
    } = await loadService();

    await setTransactionAuthorizationMode('until-lock');
    await rememberTransactionAuthorization('account-1', 2_000);

    expect(await isTransactionAuthorizationActive('account-1', 2_000 + 86_400_000)).toBe(true);

    clearTransactionAuthorization();

    expect(await isTransactionAuthorizationActive('account-1', 2_000 + 86_400_000)).toBe(false);
  });

  it('clears remembered authorization when the mode is reset to always', async () => {
    const {
      setTransactionAuthorizationMode,
      rememberTransactionAuthorization,
      isTransactionAuthorizationActive,
    } = await loadService();

    await setTransactionAuthorizationMode('one-minute');
    await rememberTransactionAuthorization('account-1', 3_000);
    expect(await isTransactionAuthorizationActive('account-1', 3_500)).toBe(true);

    await setTransactionAuthorizationMode('always');

    expect(await isTransactionAuthorizationActive('account-1', 3_500)).toBe(false);
  });
});
