import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { verifyPin, getLockoutState, isBiometricUnlockEnabled, LockoutState } from '../services/auth';
import { authenticateWithBiometrics } from '../lib/biometrics';
import { HapticFeedback } from '../lib/haptics';
import colors from '../theme/colors';

const PIN_LENGTH = 6;

interface LockScreenProps {
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [lockout, setLockout] = useState<LockoutState | null>(null);
  const [shakeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    checkLockout();
    tryBiometricUnlock();
  }, []);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockout?.isLockedOut || lockout.shouldWipe) return;

    const timer = setInterval(() => {
      checkLockout();
    }, 1000);

    return () => clearInterval(timer);
  }, [lockout?.isLockedOut]);

  const checkLockout = async () => {
    const state = await getLockoutState();
    setLockout(state);

    if (state.shouldWipe) {
      setError('Too many failed attempts. Wallet data will be wiped.');
    }
  };

  const tryBiometricUnlock = async () => {
    const biometricsEnabled = await isBiometricUnlockEnabled();
    if (!biometricsEnabled) return;

    const result = await authenticateWithBiometrics(
      'Unlock Kondor',
      'Use PIN'
    );
    if (result.success) {
      onUnlock();
    }
  };

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleKeyPress = async (digit: string) => {
    if (lockout?.isLockedOut) return;

    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    if (newPin.length === PIN_LENGTH) {
      const isValid = await verifyPin(newPin);
      if (isValid) {
        await HapticFeedback.success();
        onUnlock();
      } else {
        await HapticFeedback.error();
        shake();
        setPin('');
        await checkLockout();
        const state = await getLockoutState();
        if (state.isLockedOut) {
          // Lockout message will be shown by the lockout display
        } else {
          setError('Incorrect PIN');
        }
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError('');
    }
  };

  const handleBiometric = () => {
    tryBiometricUnlock();
  };

  const formatLockoutTime = (seconds: number): string => {
    if (seconds >= 60) {
      const minutes = Math.ceil(seconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  };

  const renderDots = () => (
    <Animated.View style={[styles.dotsContainer, { transform: [{ translateX: shakeAnim }] }]}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < pin.length && styles.dotFilled,
          ]}
        />
      ))}
    </Animated.View>
  );

  const renderKeypad = () => {
    const keys = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['biometric', '0', 'delete'],
    ];

    return (
      <View style={styles.keypad}>
        {keys.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keypadRow}>
            {row.map((key) => {
              if (key === 'biometric') {
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.keypadButton}
                    onPress={handleBiometric}
                    disabled={lockout?.isLockedOut}
                  >
                    <Ionicons name="finger-print" size={28} color={colors.purple} />
                  </TouchableOpacity>
                );
              }
              if (key === 'delete') {
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.keypadButton}
                    onPress={handleDelete}
                    disabled={lockout?.isLockedOut}
                  >
                    <Ionicons name="backspace-outline" size={28} color={colors.textPrimary} />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.keypadButton}
                  onPress={() => handleKeyPress(key)}
                  disabled={lockout?.isLockedOut}
                >
                  <Text style={styles.keypadButtonText}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Unlock Kondor</Text>

        {lockout?.isLockedOut && !lockout.shouldWipe ? (
          <View style={styles.lockoutContainer}>
            <Ionicons name="lock-closed" size={24} color={colors.error} />
            <Text style={styles.lockoutText}>
              Too many failed attempts
            </Text>
            <Text style={styles.lockoutTimer}>
              Try again in {formatLockoutTime(lockout.remainingSeconds)}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>Enter your PIN</Text>
            {renderDots()}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        )}
      </View>

      {renderKeypad()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  logo: {
    width: 72,
    height: 72,
    marginBottom: 24,
    borderRadius: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.textTertiary,
  },
  dotFilled: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    marginTop: 8,
  },
  lockoutContainer: {
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  lockoutText: {
    fontSize: 16,
    color: colors.error,
    fontWeight: '600',
  },
  lockoutTimer: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  keypad: {
    paddingHorizontal: 40,
    paddingBottom: 24,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  keypadButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadButtonText: {
    fontSize: 28,
    fontWeight: '500',
    color: colors.textPrimary,
  },
});
