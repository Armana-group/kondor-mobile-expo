import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useKoinosStore } from '../stores/koinosStore';
import { useWalletStore } from '../stores/walletStore';
import { isValidAddress, calculateManaRegenTime } from '../lib/utils';

export const SendScreen = () => {
  const navigation = useNavigation<any>();
  const { transfer, estimateMana, getMana, getBalance } = useKoinosStore();
  const { balance, address, updateBalance } = useWalletStore();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errors, setErrors] = useState<{
    recipient?: string;
    amount?: string;
  }>({});

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    // Validate recipient address
    if (!recipient) {
      newErrors.recipient = 'Recipient address is required';
    } else if (!isValidAddress(recipient)) {
      newErrors.recipient = 'Invalid Koinos address';
    } else if (recipient === address) {
      newErrors.recipient = 'Cannot send to yourself';
    }

    // Validate amount
    if (!amount) {
      newErrors.amount = 'Amount is required';
    } else if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      newErrors.amount = 'Invalid amount';
    } else if (parseFloat(amount) > parseFloat(balance)) {
      newErrors.amount = 'Insufficient balance';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateMana = async (): Promise<boolean> => {
    // Estimated mana cost for a transfer (typically 0.2-0.5 million)
    // This is a conservative estimate - actual cost will be determined by dry-run
    const ESTIMATED_TRANSFER_MANA = 500000;

    try {
      const manaData = await getMana(address);
      const availableMana = BigInt(manaData.available);
      const maxMana = BigInt(manaData.max);
      const requiredMana = BigInt(ESTIMATED_TRANSFER_MANA);

      console.log('[SendScreen] Available mana:', availableMana.toString());
      console.log('[SendScreen] Reserved mana:', manaData.reserved);
      console.log('[SendScreen] Estimated required:', requiredMana.toString());

      // Check if available mana (after accounting for reserved) is sufficient
      if (availableMana < requiredMana) {
        const timeToRegen = calculateManaRegenTime(
          availableMana,
          requiredMana,
          maxMana
        );

        Alert.alert(
          'Insufficient Mana',
          `Your account doesn't have enough available mana to process this transaction.\n\nAvailable: ${manaData.availablePercentage.toFixed(1)}% (${(Number(availableMana) / 1000000).toFixed(2)}M)\nReserved: ${(Number(manaData.reserved) / 1000000).toFixed(2)}M\nRequired: ~${(Number(requiredMana) / 1000000).toFixed(2)}M\n\nMana regenerates over time. Please wait approximately ${timeToRegen} and try again.`,
          [{ text: 'OK' }]
        );
        return false;
      }

      console.log('[SendScreen] Mana check passed, proceeding with transfer');
      return true;
    } catch (error: any) {
      console.error('[SendScreen] Mana check error:', error);
      // If mana check fails, show warning but allow user to proceed
      Alert.alert(
        'Warning',
        'Unable to check mana availability. The transaction may fail if you have insufficient mana. Continue anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => {} }
        ]
      );
      return false;
    }
  };

  const handleSend = async () => {
    if (!validateForm()) {
      return;
    }

    // Check mana before proceeding
    const hasSufficientMana = await validateMana();
    if (!hasSufficientMana) {
      return;
    }

    Alert.alert(
      'Confirm Transaction',
      `Send ${amount} KOIN to\n${recipient}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setIsSending(true);
            try {
              const txId = await transfer(recipient, amount);

              // Update balance after successful transaction
              const newBalance = await getBalance(address);
              updateBalance(newBalance);

              Alert.alert(
                'Success!',
                `Transaction sent successfully!\n\nTransaction ID:\n${txId}`,
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]
              );
            } catch (error: any) {
              Alert.alert(
                'Transaction Failed',
                error.message || 'Failed to send transaction'
              );
            } finally {
              setIsSending(false);
            }
          },
        },
      ]
    );
  };

  const handleMaxAmount = () => {
    // Leave a small amount for transaction fees
    const maxAmount = Math.max(0, parseFloat(balance) - 0.01);
    setAmount(maxAmount.toString());
    setErrors({ ...errors, amount: undefined });
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Button
            title="← Back"
            onPress={() => navigation.goBack()}
            variant="secondary"
            style={styles.backButton}
          />
          <Text style={styles.title}>Send KOIN</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Recipient Address"
            placeholder="Enter Koinos address"
            value={recipient}
            onChangeText={(text) => {
              setRecipient(text);
              setErrors({ ...errors, recipient: undefined });
            }}
            error={errors.recipient}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View>
            <Input
              label="Amount"
              placeholder="0.00"
              value={amount}
              onChangeText={(text) => {
                // Only allow valid numeric input
                if (/^\d*\.?\d*$/.test(text) || text === '') {
                  setAmount(text);
                  setErrors({ ...errors, amount: undefined });
                }
              }}
              keyboardType="decimal-pad"
              error={errors.amount}
            />
            <View style={styles.balanceInfo}>
              <Text style={styles.balanceText}>
                Available: {balance} KOIN
              </Text>
              <Button
                title="Max"
                onPress={handleMaxAmount}
                variant="secondary"
                style={styles.maxButton}
                textStyle={styles.maxButtonText}
              />
            </View>
          </View>

          <View style={styles.feeInfo}>
            <Text style={styles.feeLabel}>Network Fee</Text>
            <Text style={styles.feeValue}>~0.001 KOIN</Text>
          </View>
        </View>

        <View style={styles.footer}>
          {isSending ? (
            <View style={styles.sendingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.sendingText}>Sending transaction...</Text>
            </View>
          ) : (
            <Button
              title="Send Transaction"
              onPress={handleSend}
              disabled={!recipient || !amount}
              style={styles.sendButton}
            />
          )}
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  form: {
    flex: 1,
  },
  balanceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  balanceText: {
    fontSize: 12,
    color: '#666',
  },
  maxButton: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 28,
  },
  maxButtonText: {
    fontSize: 12,
  },
  feeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    marginTop: 16,
  },
  feeLabel: {
    fontSize: 14,
    color: '#666',
  },
  feeValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
  },
  sendButton: {
    marginTop: 16,
  },
  sendingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  sendingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
});