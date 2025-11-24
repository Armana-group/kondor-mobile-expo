import * as LocalAuthentication from 'expo-local-authentication';

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export const checkBiometricSupport = async (): Promise<{
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
}> => {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

  return {
    hasHardware,
    isEnrolled,
    supportedTypes
  };
};

export const authenticateWithBiometrics = async (
  promptMessage: string = 'Authenticate to access your wallet',
  fallbackLabel: string = 'Use Passcode'
): Promise<BiometricAuthResult> => {
  try {
    const { hasHardware, isEnrolled } = await checkBiometricSupport();

    if (!hasHardware) {
      return {
        success: false,
        error: 'Biometric authentication is not available on this device'
      };
    }

    if (!isEnrolled) {
      return {
        success: false,
        error: 'No biometric credentials are enrolled on this device'
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel,
      disableDeviceFallback: false,
      cancelLabel: 'Cancel'
    });

    if (result.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: result.error || 'Authentication failed'
      };
    }
  } catch (error) {
    console.error('Biometric authentication error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

// Hook for biometric auth before sensitive operations
export const requireBiometricAuth = async (
  operation: string = 'perform this action'
): Promise<boolean> => {
  const result = await authenticateWithBiometrics(
    `Authenticate to ${operation}`,
    'Use Device Passcode'
  );

  return result.success;
};