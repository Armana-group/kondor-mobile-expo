import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setPin, setBiometricUnlock } from '../services/auth';
import { checkBiometricSupport } from '../lib/biometrics';
import { HapticFeedback } from '../lib/haptics';
import colors from '../theme/colors';

const PIN_LENGTH = 6;

type Step = 'enter' | 'confirm';

interface SetupPinScreenProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export const SetupPinScreen: React.FC<SetupPinScreenProps> = ({ onComplete, onSkip }) => {
  const [step, setStep] = useState<Step>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin_] = useState('');
  const [error, setError] = useState('');
  const [shakeAnim] = useState(new Animated.Value(0));

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleComplete = async (confirmedPin: string) => {
    try {
      await setPin(confirmedPin);

      // Check if biometrics are available and offer to enable
      const biometrics = await checkBiometricSupport();
      if (biometrics.hasHardware && biometrics.isEnrolled) {
        Alert.alert(
          'Enable Biometric Unlock',
          'Would you like to unlock Kondor with biometrics (Face ID / fingerprint) in addition to your PIN?',
          [
            {
              text: 'No, just PIN',
              style: 'cancel',
              onPress: () => {
                setBiometricUnlock(false);
                onComplete();
              },
            },
            {
              text: 'Enable',
              onPress: () => {
                setBiometricUnlock(true);
                onComplete();
              },
            },
          ]
        );
      } else {
        onComplete();
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to set PIN. Please try again.');
    }
  };

  const handleKeyPress = async (digit: string) => {
    const newPin = pin + digit;
    setPin_(newPin);
    setError('');

    if (newPin.length === PIN_LENGTH) {
      if (step === 'enter') {
        setFirstPin(newPin);
        setPin_('');
        setStep('confirm');
      } else {
        // Confirm step
        if (newPin === firstPin) {
          await HapticFeedback.success();
          await handleComplete(newPin);
        } else {
          await HapticFeedback.error();
          shake();
          setPin_('');
          setError('PINs do not match. Try again.');
          setStep('enter');
          setFirstPin('');
        }
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin_(pin.slice(0, -1));
      setError('');
    }
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
      ['', '0', 'delete'],
    ];

    return (
      <View style={styles.keypad}>
        {keys.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keypadRow}>
            {row.map((key) => {
              if (key === '') {
                return <View key="empty" style={styles.keypadButton} />;
              }
              if (key === 'delete') {
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.keypadButton}
                    onPress={handleDelete}
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
      <View style={styles.header}>
        {step === 'confirm' && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setStep('enter');
              setFirstPin('');
              setPin_('');
              setError('');
            }}
          >
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <Ionicons name="lock-closed" size={48} color={colors.purple} style={styles.icon} />
        <Text style={styles.title}>
          {step === 'enter' ? 'Set a PIN' : 'Confirm PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'enter'
            ? 'Choose a 6-digit PIN to protect your wallet'
            : 'Enter your PIN again to confirm'
          }
        </Text>

        {renderDots()}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {renderKeypad()}

      {onSkip && step === 'enter' && (
        <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  backButton: {
    padding: 4,
    width: 36,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  icon: {
    marginBottom: 24,
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
    textAlign: 'center',
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
    textAlign: 'center',
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
  skipButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  skipButtonText: {
    fontSize: 15,
    color: colors.textTertiary,
  },
});
