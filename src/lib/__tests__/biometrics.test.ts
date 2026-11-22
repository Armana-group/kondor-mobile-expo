import * as LocalAuthentication from 'expo-local-authentication';
import { requireBiometricAuth } from '../biometrics';

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1 },
  getEnrolledLevelAsync: jest.fn(),
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(false),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([]),
  authenticateAsync: jest.fn(),
}));

afterEach(() => jest.clearAllMocks());

it('uses system authentication on a passcode-only device', async () => {
  jest.mocked(LocalAuthentication.getEnrolledLevelAsync).mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
  jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });

  await expect(requireBiometricAuth('send this transaction')).resolves.toBe(true);
  expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(expect.objectContaining({
    disableDeviceFallback: false,
  }));
});

it('does not authorize a device without credentials', async () => {
  jest.mocked(LocalAuthentication.getEnrolledLevelAsync).mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
  await expect(requireBiometricAuth()).resolves.toBe(false);
  expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
});
