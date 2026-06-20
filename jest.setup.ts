/**
 * Jest setup file — global mocks for native modules
 */

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// expo-secure-store: in-memory Map
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    __store: store, // exposed for test assertions
  };
});

// expo-local-authentication
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  authenticateAsync: jest.fn(() =>
    Promise.resolve({ success: true })
  ),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC: 2 },
}));

// expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// expo-crypto — deterministic hash based on input for testable PIN logic
jest.mock('expo-crypto', () => {
  // Simple deterministic hash for testing (not crypto-safe, just for mocking)
  function simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  return {
    getRandomBytes: jest.fn((size: number) => new Uint8Array(size)),
    getRandomBytesAsync: jest.fn((size: number) =>
      Promise.resolve(new Uint8Array(size))
    ),
    digestStringAsync: jest.fn((_algo: string, data: string) =>
      Promise.resolve(simpleHash(data))
    ),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256', SHA512: 'SHA-512' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  };
});

// expo-clipboard
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(() => Promise.resolve('')),
  setStringAsync: jest.fn(() => Promise.resolve()),
  hasStringAsync: jest.fn(() => Promise.resolve(false)),
}));

// expo-camera
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn(() => [
    { granted: false, canAskAgain: true },
    jest.fn(() => Promise.resolve({ granted: true })),
  ]),
}));

// expo-application
jest.mock('expo-application', () => ({
  applicationName: 'Kondor Mobile',
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1',
}));

// react-native-quick-crypto
jest.mock('react-native-quick-crypto', () => ({
  randomBytes: jest.fn((size: number) => Buffer.alloc(size)),
  createHash: jest.fn(),
  createHmac: jest.fn(),
}));

// react-native-get-random-values — side-effect polyfill, just needs to not throw
jest.mock('react-native-get-random-values', () => {});
