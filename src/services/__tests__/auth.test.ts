import * as SecureStore from 'expo-secure-store';
import {
  setPin,
  verifyPin,
  isPinEnabled,
  removePin,
  changePin,
  getLockoutState,
  getFailedAttempts,
  setBiometricUnlock,
  isBiometricUnlockEnabled,
} from '../auth';

// Access the mock store directly for cleanup
const mockStore = (SecureStore as any).__store as Map<string, string>;

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('PIN setup and verification', () => {
  it('reports PIN as disabled when no PIN is set', async () => {
    expect(await isPinEnabled()).toBe(false);
  });

  it('enables PIN after setPin', async () => {
    await setPin('123456');
    expect(await isPinEnabled()).toBe(true);
  });

  it('verifies correct PIN', async () => {
    await setPin('123456');
    expect(await verifyPin('123456')).toBe(true);
  });

  it('rejects incorrect PIN', async () => {
    await setPin('123456');
    expect(await verifyPin('000000')).toBe(false);
  });

  it('removes PIN', async () => {
    await setPin('123456');
    expect(await isPinEnabled()).toBe(true);
    await removePin();
    expect(await isPinEnabled()).toBe(false);
  });

  it('changes PIN successfully with correct current PIN', async () => {
    await setPin('123456');
    const result = await changePin('123456', '654321');
    expect(result).toBe(true);
    expect(await verifyPin('654321')).toBe(true);
    expect(await verifyPin('123456')).toBe(false);
  });

  it('rejects PIN change with wrong current PIN', async () => {
    await setPin('123456');
    const result = await changePin('000000', '654321');
    expect(result).toBe(false);
    // Original PIN should still work
    expect(await verifyPin('123456')).toBe(true);
  });
});

describe('brute-force protection', () => {
  it('tracks failed attempts', async () => {
    await setPin('123456');
    expect(await getFailedAttempts()).toBe(0);

    await verifyPin('wrong1');
    expect(await getFailedAttempts()).toBe(1);

    await verifyPin('wrong2');
    expect(await getFailedAttempts()).toBe(2);
  });

  it('resets failed attempts on successful verification', async () => {
    await setPin('123456');
    await verifyPin('wrong1');
    await verifyPin('wrong2');
    expect(await getFailedAttempts()).toBe(2);

    await verifyPin('123456');
    expect(await getFailedAttempts()).toBe(0);
  });

  it('enters lockout after 3 failed attempts', async () => {
    await setPin('123456');

    await verifyPin('wrong1');
    await verifyPin('wrong2');
    await verifyPin('wrong3');

    const state = await getLockoutState();
    expect(state.isLockedOut).toBe(true);
    expect(state.failedAttempts).toBe(3);
    expect(state.remainingSeconds).toBeGreaterThan(0);
  });

  it('flags wipe after 10 failed attempts', async () => {
    await setPin('123456');

    for (let i = 0; i < 10; i++) {
      // Manually clear lockout between attempts to simulate time passing
      await SecureStore.deleteItemAsync('kondor_lockout_until');
      await verifyPin(`wrong${i}`);
    }

    const state = await getLockoutState();
    expect(state.shouldWipe).toBe(true);
    expect(state.failedAttempts).toBe(10);
  });

  it('rejects verification while locked out', async () => {
    await setPin('123456');

    // Trigger lockout
    await verifyPin('wrong1');
    await verifyPin('wrong2');
    await verifyPin('wrong3');

    // Even correct PIN should fail during lockout
    const result = await verifyPin('123456');
    expect(result).toBe(false);
  });
});

describe('biometric unlock setting', () => {
  it('defaults to disabled', async () => {
    expect(await isBiometricUnlockEnabled()).toBe(false);
  });

  it('can be enabled and disabled', async () => {
    await setBiometricUnlock(true);
    expect(await isBiometricUnlockEnabled()).toBe(true);

    await setBiometricUnlock(false);
    expect(await isBiometricUnlockEnabled()).toBe(false);
  });

  it('is cleared when PIN is removed', async () => {
    await setPin('123456');
    await setBiometricUnlock(true);
    expect(await isBiometricUnlockEnabled()).toBe(true);

    await removePin();
    expect(await isBiometricUnlockEnabled()).toBe(false);
  });
});
