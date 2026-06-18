import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ContactPicker } from '../components/ContactPicker';
import { QRScannerModal, ParsedQRData } from '../components/QRScannerModal';
import { useKoinosStore } from '../stores/koinosStore';
import { useWalletStore } from '../stores/walletStore';
import { useContactStore, Contact } from '../stores/contactStore';
import { useTokenStore, Token } from '../stores/tokenStore';
import { isValidAddress, calculateManaRegenTime, truncateAddress, formatKoinBalance } from '../lib/utils';
import { requireBiometricAuth } from '../lib/biometrics';
import { koinosLogger } from '../lib/logger';
import colors from '../theme/colors';

type SendRouteParams = {
  Send: { token?: Token } | undefined;
};

export const SendScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<SendRouteParams, 'Send'>>();
  const { transfer, transferToken, getMana, getBalance } = useKoinosStore();
  const { balance, address, updateBalance } = useWalletStore();
  const { getContactByAddress } = useContactStore();
  const { tokens, getTokenBySymbol, refreshSingleBalance } = useTokenStore();

  // Get initial token from route params or default to KOIN
  const initialToken = route.params?.token || getTokenBySymbol('KOIN') || tokens[0];

  const [selectedToken, setSelectedToken] = useState<Token | null>(initialToken || null);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [errors, setErrors] = useState<{
    recipient?: string;
    amount?: string;
  }>({});

  // Update selected token when route params change
  useEffect(() => {
    if (route.params?.token) {
      setSelectedToken(route.params.token);
    }
  }, [route.params?.token]);

  // Get token balance
  const tokenBalance = selectedToken?.balance || '0';

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    // Validate token selection
    if (!selectedToken) {
      Alert.alert('Error', 'Please select a token to send');
      return false;
    }

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
    } else if (parseFloat(amount) > parseFloat(tokenBalance)) {
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

      koinosLogger.debug('Available mana:', availableMana.toString());
      koinosLogger.debug('Reserved mana:', manaData.reserved);
      koinosLogger.debug('Estimated required:', requiredMana.toString());

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

      koinosLogger.debug('Mana check passed, proceeding with transfer');
      return true;
    } catch (error: any) {
      koinosLogger.error('Mana check error:', error);
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
    if (!validateForm() || !selectedToken) {
      return;
    }

    const hasSufficientMana = await validateMana();
    if (!hasSufficientMana) {
      return;
    }

    const displayRecipient = selectedContact
      ? `${selectedContact.name} (${truncateAddress(recipient)})`
      : truncateAddress(recipient);

    Alert.alert(
      'Confirm Transaction',
      `Send ${amount} ${selectedToken.symbol} to\n${displayRecipient}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            const authenticated = await requireBiometricAuth('send this transaction');
            if (!authenticated) {
              Alert.alert('Authentication Required', 'Biometric authentication is required to send transactions.');
              return;
            }

            setIsSending(true);
            try {
              // Use transferToken for all tokens (works with any contract)
              const txId = await transferToken(
                selectedToken.contractId,
                recipient,
                amount,
                selectedToken.decimals
              );

              // Refresh balances
              const newBalance = await getBalance(address);
              updateBalance(newBalance);
              await refreshSingleBalance(address, selectedToken.contractId);

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
    // For KOIN, leave a small amount for mana. For other tokens, use full balance.
    const bal = parseFloat(tokenBalance);
    const maxAmount = selectedToken?.symbol === 'KOIN'
      ? Math.max(0, bal - 0.01)
      : bal;
    setAmount(maxAmount.toString());
    setErrors({ ...errors, amount: undefined });
  };

  const handleTokenSelect = (token: Token) => {
    setSelectedToken(token);
    setShowTokenPicker(false);
    setAmount(''); // Clear amount when changing token
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

  const handleQRScan = (data: ParsedQRData) => {
    // Set recipient address
    setRecipient(data.address);
    setErrors({ ...errors, recipient: undefined });

    // Check if this address matches a contact
    const contact = getContactByAddress(data.address);
    setSelectedContact(contact || null);

    // If amount was included in QR, set it
    if (data.amount) {
      setAmount(data.amount);
      setErrors((prev) => ({ ...prev, amount: undefined }));
    }

    // If token was specified, try to select it
    if (data.token) {
      const token = getTokenBySymbol(data.token.toUpperCase());
      if (token) {
        setSelectedToken(token);
      }
    }
  };

  // Render token picker modal
  const renderTokenPicker = () => (
    <Modal
      visible={showTokenPicker}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowTokenPicker(false)}
    >
      <View style={styles.tokenPickerContainer}>
        <View style={styles.tokenPickerHeader}>
          <Text style={styles.tokenPickerTitle}>Select Token</Text>
          <TouchableOpacity onPress={() => setShowTokenPicker(false)}>
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={tokens}
          keyExtractor={(item) => item.contractId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.tokenPickerItem,
                selectedToken?.contractId === item.contractId && styles.tokenPickerItemSelected,
              ]}
              onPress={() => handleTokenSelect(item)}
            >
              <View style={styles.tokenPickerIconContainer}>
                {item.icon ? (
                  <Image
                    source={{ uri: item.icon }}
                    style={styles.tokenPickerIcon}
                    defaultSource={require('../../assets/icon.png')}
                  />
                ) : (
                  <View style={styles.tokenPickerIconFallback}>
                    <Text style={styles.tokenPickerIconText}>{item.symbol.charAt(0)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.tokenPickerInfo}>
                <Text style={styles.tokenPickerName}>{item.name}</Text>
                <Text style={styles.tokenPickerSymbol}>{item.symbol}</Text>
              </View>
              <View style={styles.tokenPickerBalance}>
                <Text style={styles.tokenPickerBalanceText}>
                  {parseFloat(item.balance) > 0 ? formatKoinBalance(item.balance) : '0'}
                </Text>
              </View>
              {selectedToken?.contractId === item.contractId && (
                <Ionicons name="checkmark-circle" size={24} color={colors.purple} />
              )}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.tokenPickerSeparator} />}
          contentContainerStyle={styles.tokenPickerList}
        />
      </View>
    </Modal>
  );

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Send {selectedToken?.symbol || 'Token'}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          {/* Token Selector */}
          <View style={styles.tokenSection}>
            <Text style={styles.inputLabel}>Token</Text>
            <TouchableOpacity
              style={styles.tokenSelector}
              onPress={() => setShowTokenPicker(true)}
            >
              {selectedToken ? (
                <>
                  <View style={styles.tokenSelectorIcon}>
                    {selectedToken.icon ? (
                      <Image
                        source={{ uri: selectedToken.icon }}
                        style={styles.tokenSelectorImage}
                        defaultSource={require('../../assets/icon.png')}
                      />
                    ) : (
                      <View style={styles.tokenSelectorFallback}>
                        <Text style={styles.tokenSelectorFallbackText}>
                          {selectedToken.symbol.charAt(0)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.tokenSelectorInfo}>
                    <Text style={styles.tokenSelectorName}>{selectedToken.name}</Text>
                    <Text style={styles.tokenSelectorSymbol}>{selectedToken.symbol}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.tokenSelectorPlaceholder}>Select a token</Text>
              )}
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
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
                rightIcon={
                  <TouchableOpacity
                    onPress={() => setShowScanner(true)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="qr-code-outline" size={22} color={colors.purple} />
                  </TouchableOpacity>
                }
              />
            )}
          </View>

          {/* Amount Section */}
          <View style={styles.amountSection}>
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
                Available: {formatKoinBalance(tokenBalance)} {selectedToken?.symbol || ''}
              </Text>
              <TouchableOpacity style={styles.maxButton} onPress={handleMaxAmount}>
                <Text style={styles.maxButtonText}>Max</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

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

      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleQRScan}
      />

      {renderTokenPicker()}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  form: {
    flex: 1,
  },
  tokenSection: {
    marginBottom: 20,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tokenSelectorIcon: {
    marginRight: 12,
  },
  tokenSelectorImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.elevated,
  },
  tokenSelectorFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenSelectorFallbackText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tokenSelectorInfo: {
    flex: 1,
  },
  tokenSelectorName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tokenSelectorSymbol: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tokenSelectorPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: colors.textTertiary,
  },
  recipientSection: {
    marginBottom: 20,
  },
  amountSection: {
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
  // Token Picker Modal styles
  tokenPickerContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tokenPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  tokenPickerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tokenPickerList: {
    padding: 16,
  },
  tokenPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
  },
  tokenPickerItemSelected: {
    borderWidth: 1,
    borderColor: colors.purple,
  },
  tokenPickerIconContainer: {
    marginRight: 12,
  },
  tokenPickerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.elevated,
  },
  tokenPickerIconFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenPickerIconText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  tokenPickerInfo: {
    flex: 1,
  },
  tokenPickerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tokenPickerSymbol: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tokenPickerBalance: {
    marginRight: 12,
  },
  tokenPickerBalanceText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  tokenPickerSeparator: {
    height: 8,
  },
});
