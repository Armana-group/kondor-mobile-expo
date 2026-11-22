import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  AppState,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { BackupStatusNotice } from '../components/BackupStatusNotice';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ContactPicker } from '../components/ContactPicker';
import { QRScannerModal, ParsedQRData } from '../components/QRScannerModal';
import { WarningInline } from '../components/WarningInline';
import { useKoinosStore } from '../stores/koinosStore';
import { useWalletStore } from '../stores/walletStore';
import { useContactStore, Contact } from '../stores/contactStore';
import {
  useTokenStore,
  Token,
  getScopedTokens,
  isTokenScopeLoading,
} from '../stores/tokenStore';
import { useNetworkStore } from '../stores/networkStore';
import { useTransactionStore } from '../stores/transactionStore';
import { isValidAddress, truncateAddress, formatKoinBalance } from '../lib/utils';
import { resolveRecipient, type RecipientResolution } from '../lib/recipient';
import { requireBiometricAuth } from '../lib/biometrics';
import { parseManaLimit, formatMana, assertManaCapacity, DEFAULT_MAX_MANA } from '../lib/mana';
import { parseDecimalAmount } from '../lib/swapMath';
import { MAINNET, TESTNET } from '../lib/constants';
import { TransactionOutcomeUnknownError } from '../lib/transactionBroadcast';
import { koinosLogger } from '../lib/logger';
import { isSendConfirmationRequired } from '../services/auth';
import {
  rememberTransactionAuthorization,
  shouldAuthenticateTransaction,
} from '../services/transactionAuthorization';
import colors from '../theme/colors';

type SendRouteParams = {
  Send: { token?: Token } | undefined;
};

type TokenSelectionPreference = {
  contractId: string | null;
  symbol: string | null;
};

function getTokenSelectionPreference(token?: Pick<Token, 'contractId' | 'symbol'> | null): TokenSelectionPreference {
  if (!token) {
    return {
      contractId: null,
      symbol: 'KOIN',
    };
  }

  return {
    contractId: token.contractId,
    symbol: token.symbol,
  };
}

function resolveSelectedToken(
  scopedTokens: Token[],
  preference: TokenSelectionPreference
): Token | null {
  if (scopedTokens.length === 0) {
    return null;
  }

  if (preference.contractId) {
    const tokenByContract = scopedTokens.find((token) => token.contractId === preference.contractId);
    if (tokenByContract) {
      return tokenByContract;
    }
  }

  if (preference.symbol) {
    const tokenBySymbol = scopedTokens.find(
      (token) => token.symbol.toLowerCase() === preference.symbol!.toLowerCase()
    );
    if (tokenBySymbol) {
      return tokenBySymbol;
    }
  }

  return scopedTokens.find((token) => token.symbol === 'KOIN') || scopedTokens[0] || null;
}

type TokenPickerRowProps = {
  token: Token;
  selected: boolean;
  onSelect: (token: Token) => void;
};

const TokenPickerRow = React.memo(function TokenPickerRow({
  token,
  selected,
  onSelect,
}: TokenPickerRowProps) {
  const handlePress = useCallback(() => {
    onSelect(token);
  }, [onSelect, token]);

  return (
    <TouchableOpacity
      style={selected ? styles.tokenPickerItemSelected : styles.tokenPickerItem}
      onPress={handlePress}
    >
      <View style={styles.tokenPickerIconContainer}>
        {token.icon ? (
          <Image
            source={{ uri: token.icon }}
            style={styles.tokenPickerIcon}
            defaultSource={require('../../assets/icon.png')}
          />
        ) : (
          <View style={styles.tokenPickerIconFallback}>
            <Text style={styles.tokenPickerIconText}>{token.symbol.charAt(0)}</Text>
          </View>
        )}
      </View>
      <View style={styles.tokenPickerInfo}>
        <Text style={styles.tokenPickerName}>{token.name}</Text>
        <Text style={styles.tokenPickerSymbol}>{token.symbol}</Text>
      </View>
      <View style={styles.tokenPickerBalance}>
        <Text style={styles.tokenPickerBalanceText}>
          {parseFloat(token.balance) > 0 ? formatKoinBalance(token.balance) : '0'}
        </Text>
      </View>
      {selected && <Ionicons name="checkmark-circle" size={24} color={colors.purple} />}
    </TouchableOpacity>
  );
});

type TokenPickerModalProps = {
  visible: boolean;
  tokens: Token[];
  selectedContractId?: string;
  onClose: () => void;
  onSelect: (token: Token) => void;
};

const TokenPickerSeparator = () => <View style={styles.tokenPickerSeparator} />;

const TokenPickerModal = React.memo(function TokenPickerModal({
  visible,
  tokens,
  selectedContractId,
  onClose,
  onSelect,
}: TokenPickerModalProps) {
  const renderTokenItem = useCallback(({ item }: { item: Token }) => (
    <TokenPickerRow
      token={item}
      selected={selectedContractId === item.contractId}
      onSelect={onSelect}
    />
  ), [onSelect, selectedContractId]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.tokenPickerContainer}>
        <View style={styles.tokenPickerHeader}>
          <Text style={styles.tokenPickerTitle}>Select Token</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={tokens}
          keyExtractor={(item) => item.contractId}
          renderItem={renderTokenItem}
          ItemSeparatorComponent={TokenPickerSeparator}
          contentContainerStyle={styles.tokenPickerList}
        />
      </View>
    </Modal>
  );
});

export const SendScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<SendRouteParams, 'Send'>>();
  const routeToken = route.params?.token;
  const { transferToken, getTransferCapacity, getBalance } = useKoinosStore();
  const { address, updateBalance, backupHealth } = useWalletStore();
  const { contacts, getContactByAddress } = useContactStore();
  const {
    tokens,
    isLoading: tokensLoading,
    isInitialized: tokensInitialized,
    cacheKey: tokenCacheKey,
    initialize: initializeTokens,
    refreshSingleBalance,
  } = useTokenStore();
  const networkMode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const historyNetworkMode = hasHydrated ? networkMode : 'mainnet';
  const visibleTokens = getScopedTokens({
    hasHydrated,
    networkMode,
    address,
    cacheKey: tokenCacheKey,
    tokens,
  });
  const tokenScopeLoading = isTokenScopeLoading({
    hasHydrated,
    networkMode,
    address,
    cacheKey: tokenCacheKey,
    isLoading: tokensLoading,
  });
  const [selectedTokenPreference, setSelectedTokenPreference] = useState<TokenSelectionPreference>(() =>
    getTokenSelectionPreference(routeToken)
  );
  const selectedToken = useMemo(
    () => resolveSelectedToken(visibleTokens, selectedTokenPreference),
    [visibleTokens, selectedTokenPreference]
  );
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [maxMana, setMaxMana] = useState('');
  const [payerMode, setPayerMode] = useState<'own' | 'free' | 'custom'>('own');
  const [customPayer, setCustomPayer] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendConfirmationRequired, setSendConfirmationRequired] = useState(true);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [recipientResolution, setRecipientResolution] = useState<RecipientResolution | null>(null);
  const requestedTokenScopeRef = useRef<string | null>(null);
  const [errors, setErrors] = useState<{
    recipient?: string;
    amount?: string;
  }>({});

  const approvalEpoch = useRef(0);
  const draftRef = useRef('');
  useLayoutEffect(() => {
    draftRef.current = JSON.stringify([address, historyNetworkMode, selectedToken?.contractId, recipient, amount, memo, maxMana, payerMode, customPayer]);
  }, [address, historyNetworkMode, selectedToken?.contractId, recipient, amount, memo, maxMana, payerMode, customPayer]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') approvalEpoch.current += 1;
    });
    return () => { approvalEpoch.current += 1; subscription.remove(); };
  }, []);

  // Update selected token when route params change
  useEffect(() => {
    if (routeToken) {
      setSelectedTokenPreference(getTokenSelectionPreference(routeToken));
    }
  }, [routeToken]);

  useEffect(() => {
    let mounted = true;

    void isSendConfirmationRequired()
      .then((required) => {
        if (mounted) {
          setSendConfirmationRequired(required);
        }
      })
      .catch(() => {
        if (mounted) {
          setSendConfirmationRequired(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated || !address) {
      requestedTokenScopeRef.current = null;
      return;
    }

    const expectedScope = `${networkMode}:${address}`;
    const hasActiveScope = tokenCacheKey === expectedScope;

    if (hasActiveScope && tokensInitialized) {
      requestedTokenScopeRef.current = expectedScope;
      return;
    }

    if (tokensLoading && requestedTokenScopeRef.current === expectedScope) {
      return;
    }

    requestedTokenScopeRef.current = expectedScope;
    void initializeTokens(address).catch((error) => {
      if (requestedTokenScopeRef.current === expectedScope) {
        requestedTokenScopeRef.current = null;
      }
      koinosLogger.error('Failed to initialize SendScreen token scope:', error);
    });
  }, [address, hasHydrated, initializeTokens, networkMode, tokenCacheKey, tokensInitialized, tokensLoading]);

  // Get token balance
  const tokenBalance = selectedToken?.balance || '0';
  const canSend = Boolean(recipient && amount && selectedToken && !tokenScopeLoading);

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    // Validate token selection
    if (tokenScopeLoading) {
      Alert.alert('Balance Loading', 'Token balances are still loading for the active network.');
      return false;
    }

    if (!selectedToken) {
      Alert.alert('Error', 'Please select a token to send');
      return false;
    }

    // Validate recipient input. Name resolution happens in handleSend because it is async.
    if (!recipient) {
      newErrors.recipient = 'Recipient address is required';
    } else if (isValidAddress(recipient) && recipient === address) {
      newErrors.recipient = 'Cannot send to yourself';
    }

    try {
      const units = BigInt(parseDecimalAmount(amount, selectedToken.decimals));
      if (units <= 0n) newErrors.amount = 'Enter an amount greater than zero';
      else if (units > BigInt(parseDecimalAmount(tokenBalance, selectedToken.decimals))) newErrors.amount = 'Insufficient balance';
    } catch (error) {
      newErrors.amount = error instanceof Error ? error.message : 'Invalid amount';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSend = async () => {
    if (!validateForm() || !selectedToken) {
      return;
    }

    const reviewedDraft = draftRef.current;
    const epoch = approvalEpoch.current;
    const expiresAt = Date.now() + 60_000;
    const assertCurrent = () => {
      if (draftRef.current !== reviewedDraft || useWalletStore.getState().address !== address || useNetworkStore.getState().mode !== networkMode || epoch !== approvalEpoch.current || Date.now() >= expiresAt) {
        throw new Error('The transaction review changed or expired. Review the transaction again.');
      }
    };
    const resolution = await resolveRecipient(recipient, networkMode);
    try { assertCurrent(); } catch (error) { Alert.alert('Review Changed', (error as Error).message); return; }
    if (!resolution) {
      setRecipientResolution(null);
      setErrors((prev) => ({
        ...prev,
        recipient: networkMode === 'mainnet'
          ? 'Enter a valid address, @nickname, or kap://name'
          : 'Enter a valid Koinos address',
      }));
      return;
    }

    if (resolution.address === address) {
      setRecipientResolution(resolution);
      setErrors((prev) => ({
        ...prev,
        recipient: 'Cannot send to yourself',
      }));
      return;
    }

    setRecipientResolution(resolution);

    const network = historyNetworkMode === 'harbinger' ? TESTNET : MAINNET;
    const payer = payerMode === 'own' ? address : payerMode === 'free' ? network.freeManaSharer : customPayer.trim();
    let rcLimit: string;
    try {
      if (!isValidAddress(payer)) throw new Error('Enter a valid payer address.');
      const capacity = await getTransferCapacity(payer, selectedToken.contractId, address, amount);
      assertCurrent();
      const defaultLimit = BigInt(parseManaLimit(DEFAULT_MAX_MANA));
      rcLimit = maxMana ? parseManaLimit(maxMana) : (BigInt(capacity) < defaultLimit ? capacity : defaultLimit.toString());
      assertManaCapacity(rcLimit, capacity);
    } catch (error) {
      Alert.alert('Mana Check', error instanceof Error ? error.message : 'Could not check available mana.');
      return;
    }

    const resolvedRecipientAddress = resolution.address;
    const trimmedMemo = memo.trim();
    let approvalConsumed = false;
    Alert.alert(
      'Confirm Transaction',
      `Send ${amount} ${selectedToken.symbol} to\n${resolvedRecipientAddress}\n\nNetwork: ${network.name}\nPayer: ${payer}\nMaximum mana: ${formatMana(rcLimit)}${trimmedMemo ? `\n\nMemo: ${trimmedMemo}` : ''}\n\nExecution cost is checked by the network when submitted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            if (approvalConsumed) return;
            approvalConsumed = true;
            try { assertCurrent(); } catch (error) { Alert.alert('Review Changed', (error as Error).message); return; }
            if (sendConfirmationRequired) {
              const authenticationRequired = await shouldAuthenticateTransaction(address);
              if (authenticationRequired) {
                const authenticated = await requireBiometricAuth('send this transaction');
                if (!authenticated) {
                  Alert.alert('Authentication Required', 'Biometric authentication is required to send transactions.');
                  return;
                }
                await rememberTransactionAuthorization(address);
              }
            }

            setIsSending(true);
            try {
              assertCurrent();
              let pendingRecorded = false;
              const recordPendingTransaction = ({
                transactionId,
                timestamp,
              }: {
                transactionId: string;
                timestamp: number;
              }) => {
                if (!address || pendingRecorded) {
                  return;
                }

                pendingRecorded = true;
                useTransactionStore.getState().addPendingTransaction({
                  address,
                  networkMode: historyNetworkMode,
                  chainTransactionId: transactionId,
                  source: 'send',
                  submissionTracked: true,
                  transaction: {
                    id: transactionId,
                    type: 'send',
                    amount,
                    token: selectedToken.contractId,
                    tokenSymbol: selectedToken.symbol,
                    tokenDecimals: selectedToken.decimals,
                    tokenIcon: selectedToken.icon,
                    from: address,
                    to: resolvedRecipientAddress,
                    timestamp,
                    fee: '0',
                    payer,
                    ...(trimmedMemo ? { memo: trimmedMemo } : {}),
                  },
                });
              };

              // Use transferToken for all tokens (works with any contract)
              const txId = await transferToken(
                selectedToken.contractId,
                resolvedRecipientAddress,
                amount,
                selectedToken.decimals,
                {
                  ...(trimmedMemo ? { memo: trimmedMemo } : {}),
                  rcLimit, payer, assertCurrent,
                  onBroadcastAccepted: recordPendingTransaction,
                }
              );

              recordPendingTransaction({ transactionId: txId, timestamp: Date.now() });

              // A balance refresh cannot change a confirmed transaction outcome.
              try {
                const newBalance = await getBalance(address);
                if (useWalletStore.getState().address === address) updateBalance(newBalance);
                await refreshSingleBalance(address, selectedToken.contractId);
              } catch { /* A later portfolio refresh will update balances. */ }

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
                error instanceof TransactionOutcomeUnknownError ? 'Checking Transaction' : 'Transaction Failed',
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
    if (!selectedToken || tokenScopeLoading) {
      return;
    }

    // For KOIN, leave a small amount for mana. For other tokens, use full balance.
    const bal = parseFloat(tokenBalance);
    const maxAmount = selectedToken?.symbol === 'KOIN'
      ? Math.max(0, bal - 0.01)
      : bal;
    setAmount(maxAmount.toString());
    setErrors({ ...errors, amount: undefined });
  };

  const handleOpenTokenPicker = useCallback(() => {
    setShowTokenPicker(true);
  }, []);

  const handleCloseTokenPicker = useCallback(() => {
    setShowTokenPicker(false);
  }, []);

  const handleTokenSelect = useCallback((token: Token) => {
    setSelectedTokenPreference(getTokenSelectionPreference(token));
    setShowTokenPicker(false);
    setAmount(''); // Clear amount when changing token
  }, []);

  const handleContactSelect = (contact: Contact) => {
    setSelectedContact(contact);
    setRecipient(contact.address);
    setRecipientResolution({
      input: contact.address,
      address: contact.address,
      source: 'address',
      label: 'Valid Koinos address',
    });
    setErrors({ ...errors, recipient: undefined });
  };

  const handleRecipientChange = (text: string) => {
    setRecipient(text);
    setRecipientResolution(null);
    setErrors({ ...errors, recipient: undefined });
    // Check if this address matches a contact
    const contact = getContactByAddress(text);
    setSelectedContact(contact || null);
  };

  const clearSelectedContact = () => {
    setSelectedContact(null);
    setRecipientResolution(null);
    setRecipient('');
  };

  const handleQRScan = (data: ParsedQRData) => {
    // A koinos_address QR must carry an address; bail if it's missing
    if (!data.address) {
      return;
    }

    // Set recipient address
    setRecipient(data.address);
    setRecipientResolution({
      input: data.address,
      address: data.address,
      source: 'address',
      label: 'Valid Koinos address',
    });
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
      const token = visibleTokens.find(
        (candidate) => candidate.symbol.toLowerCase() === data.token!.toLowerCase()
      );
      if (token) {
        setSelectedTokenPreference(getTokenSelectionPreference(token));
      } else {
        setSelectedTokenPreference({
          contractId: null,
          symbol: data.token.toUpperCase(),
        });
      }
    }
  };

  const handleBackupPress = () => {
    navigation.navigate('Settings', { screen: 'BackupRecovery' });
  };

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
              onPress={handleOpenTokenPicker}
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
                <Text style={styles.tokenSelectorPlaceholder}>
                  {tokenScopeLoading ? 'Loading...' : 'Select a token'}
                </Text>
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
                placeholder={networkMode === 'mainnet'
                  ? 'Enter address, @nickname, or kap://name'
                  : 'Enter Koinos address'
                }
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
            {recipientResolution && recipientResolution.source !== 'address' && (
              <View style={styles.recipientResolution}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.recipientResolutionText}>{recipientResolution.label}</Text>
              </View>
            )}

            {!selectedContact && contacts.length > 0 && (
              <View style={styles.savedRecipients}>
                <Text style={styles.savedRecipientsLabel}>Saved recipients</Text>
                <View style={styles.savedRecipientChips}>
                  {contacts.slice(0, 6).map((contact) => (
                    <TouchableOpacity
                      key={contact.id}
                      style={styles.savedRecipientChip}
                      onPress={() => handleContactSelect(contact)}
                    >
                      <Text
                        style={styles.savedRecipientChipText}
                        numberOfLines={1}
                      >
                        {contact.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
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
                {tokenScopeLoading
                  ? 'Available: --'
                  : `Available: ${formatKoinBalance(tokenBalance)} ${selectedToken?.symbol || ''}`.trim()}
              </Text>
              <TouchableOpacity
                style={[
                  styles.maxButton,
                  (!selectedToken || tokenScopeLoading) && styles.maxButtonDisabled,
                ]}
                onPress={handleMaxAmount}
                disabled={!selectedToken || tokenScopeLoading}
              >
                <Text style={styles.maxButtonText}>Max</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.memoSection}>
            <Input
              label="Memo (optional)"
              placeholder="Add a note to this transaction"
              value={memo}
              onChangeText={setMemo}
              autoCapitalize="sentences"
            />
          </View>
          <View style={styles.memoSection}>
            <Input label="Maximum mana" placeholder="Up to 10, limited by available mana" value={maxMana} onChangeText={setMaxMana} keyboardType="decimal-pad" />
            <Text style={styles.inputLabel}>Mana payer</Text>
            <View style={styles.savedRecipientChips}>
              {(['own', 'free', 'custom'] as const).map(mode => (
                <TouchableOpacity key={mode} accessibilityRole="radio" accessibilityState={{ selected: payerMode === mode }} style={styles.savedRecipientChip} onPress={() => setPayerMode(mode)}>
                  <Text style={styles.savedRecipientChipText}>{mode === 'own' ? 'My account' : mode === 'free' ? 'Free mana' : 'Custom payer'}{payerMode === mode ? ' ✓' : ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {payerMode === 'custom' && <Input label="Payer address" value={customPayer} onChangeText={setCustomPayer} autoCapitalize="none" autoCorrect={false} />}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <BackupStatusNotice
            backupHealth={backupHealth}
            compact
            onPress={handleBackupPress}
          />
          {!sendConfirmationRequired && (
            <WarningInline
              text="Send biometrics are off"
              style={styles.sendConfirmationWarning}
              textStyle={styles.sendConfirmationWarningText}
            />
          )}
          {isSending ? (
            <View style={styles.sendingContainer}>
              <ActivityIndicator size="large" color={colors.purple} />
              <Text style={styles.sendingText}>Sending transaction...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendButton,
                !canSend && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!canSend}
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

      <TokenPickerModal
        visible={showTokenPicker}
        tokens={visibleTokens}
        selectedContractId={selectedToken?.contractId}
        onClose={handleCloseTokenPicker}
        onSelect={handleTokenSelect}
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
  memoSection: {
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
  recipientResolution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  recipientResolutionText: {
    flex: 1,
    fontSize: 12,
    color: colors.success,
  },
  savedRecipients: {
    marginTop: 10,
  },
  savedRecipientsLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  savedRecipientChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  savedRecipientChip: {
    maxWidth: 132,
    backgroundColor: colors.elevated,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  savedRecipientChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
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
  maxButtonDisabled: {
    opacity: 0.5,
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
  sendConfirmationWarning: {
    marginBottom: 12,
  },
  sendConfirmationWarningText: {
    color: colors.textSecondary,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
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
