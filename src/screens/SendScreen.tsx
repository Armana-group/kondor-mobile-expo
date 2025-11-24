import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ContactPicker } from '../components/ContactPicker';
import { useKoinosStore } from '../stores/koinosStore';
import { useWalletStore } from '../stores/walletStore';
import { useContactStore, Contact } from '../stores/contactStore';
import { isValidAddress, calculateManaRegenTime, truncateAddress } from '../lib/utils';
import colors from '../theme/colors';

export const SendScreen = () => {
  const navigation = useNavigation<any>();
  const { transfer, getMana, getBalance } = useKoinosStore();
  const { balance, address, updateBalance } = useWalletStore();
  const { getContactByAddress } = useContactStore();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
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
    const ESTIMATED_TRANSFER_MANA = 500000;

    try {
      const manaData = await getMana(address);
      const availableMana = BigInt(manaData.available);
      const maxMana = BigInt(manaData.max);
      const requiredMana = BigInt(ESTIMATED_TRANSFER_MANA);

      console.log('[SendScreen] Available mana:', availableMana.toString());
      console.log('[SendScreen] Reserved mana:', manaData.reserved);
      console.log('[SendScreen] Estimated required:', requiredMana.toString());

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

    const hasSufficientMana = await validateMana();
    if (!hasSufficientMana) {
      return;
    }

    const displayRecipient = selectedContact
      ? `${selectedContact.name} (${truncateAddress(recipient)})`
      : recipient;

    Alert.alert(
      'Confirm Transaction',
      `Send ${amount} KOIN to\n${displayRecipient}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setIsSending(true);
            try {
              const txId = await transfer(recipient, amount);

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
    const maxAmount = Math.max(0, parseFloat(balance) - 0.01);
    setAmount(maxAmount.toString());
    setErrors({ ...errors, amount: undefined });
  };

  const handleContactSelect = (contact: Contact) => {
    setSelectedContact(contact);
    setRecipient(contact.address);
    setErrors({ ...errors, recipient: undefined });
  };

  const handleRecipientChange = (text: string) => {
    setRecipient(text);
    setErrors({ ...errors, recipient: undefined });
    // Check if this address matches a contact
    const contact = getContactByAddress(text);
    setSelectedContact(contact || null);
  };

  const clearSelectedContact = () => {
    setSelectedContact(null);
    setRecipient('');
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Send KOIN</Text>
        </View>

        <View style={styles.form}>
          {/* Recipient Section */}
          <View style={styles.recipientSection}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Recipient Address</Text>
              <TouchableOpacity
                style={styles.contactButton}
                onPress={() => setShowContactPicker(true)}
              >
                <Text style={styles.contactButtonText}>👥 Contacts</Text>
              </TouchableOpacity>
            </View>

            {selectedContact ? (
              <TouchableOpacity
                style={styles.selectedContact}
                onPress={clearSelectedContact}
              >
                <View style={styles.selectedContactAvatar}>
                  <Text style={styles.selectedContactAvatarText}>
                    {selectedContact.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.selectedContactInfo}>
                  <Text style={styles.selectedContactName}>{selectedContact.name}</Text>
                  <Text style={styles.selectedContactAddress}>
                    {truncateAddress(selectedContact.address)}
                  </Text>
                </View>
                <Text style={styles.clearButton}>✕</Text>
              </TouchableOpacity>
            ) : (
              <Input
                placeholder="Enter Koinos address"
                value={recipient}
                onChangeText={handleRecipientChange}
                error={errors.recipient}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          </View>

          {/* Amount Section */}
          <View>
            <Input
              label="Amount"
              placeholder="0.00"
              value={amount}
              onChangeText={(text) => {
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
              <TouchableOpacity style={styles.maxButton} onPress={handleMaxAmount}>
                <Text style={styles.maxButtonText}>Max</Text>
              </TouchableOpacity>
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
              <ActivityIndicator size="large" color={colors.purple} />
              <Text style={styles.sendingText}>Sending transaction...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!recipient || !amount) && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!recipient || !amount}
            >
              <Text style={styles.sendButtonText}>Send Transaction</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ContactPicker
        visible={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelect={handleContactSelect}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.purple,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  form: {
    flex: 1,
  },
  recipientSection: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  contactButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.elevated,
    borderRadius: 8,
  },
  contactButtonText: {
    fontSize: 13,
    color: colors.purple,
    fontWeight: '500',
  },
  selectedContact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.purple,
  },
  selectedContactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  selectedContactAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.purple,
  },
  selectedContactInfo: {
    flex: 1,
  },
  selectedContactName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  selectedContactAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  clearButton: {
    fontSize: 18,
    color: colors.textSecondary,
    padding: 4,
  },
  balanceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  balanceText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  maxButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.elevated,
    borderRadius: 6,
  },
  maxButtonText: {
    fontSize: 12,
    color: colors.purple,
    fontWeight: '600',
  },
  feeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 16,
  },
  feeLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  feeValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
  },
  sendButton: {
    backgroundColor: colors.purple,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sendingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  sendingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
