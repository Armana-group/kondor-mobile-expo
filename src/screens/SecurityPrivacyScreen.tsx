import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { HapticFeedback } from '../lib/haptics';
import { copyWithAutoClear } from '../lib/clipboard';
import { sanitizeErrorForUser } from '../lib/logger';
import { useWalletStore } from '../stores/walletStore';
import {
  isSendConfirmationRequired,
  setSendConfirmationRequired as persistSendConfirmationRequired,
} from '../services/auth';
import {
  getTransactionAuthorizationMode,
  getTransactionAuthorizationOptions,
  setTransactionAuthorizationMode,
  type TransactionAuthorizationMode,
} from '../services/transactionAuthorization';
import colors from '../theme/colors';

type SecretAction = {
  title: string;
  warning: string;
  failureMessage: string;
  loadSecret: () => Promise<string | null>;
};

export const SecurityPrivacyScreen = () => {
  const navigation = useNavigation<any>();
  const getMnemonic = useWalletStore((state) => state.getMnemonic);
  const getPrivateKey = useWalletStore((state) => state.getPrivateKey);
  const [isLoading, setIsLoading] = useState(false);
  const [sendConfirmationRequired, setSendConfirmationRequiredState] = useState(true);
  const [transactionAuthorizationMode, setSelectedTransactionAuthorizationMode] =
    useState<TransactionAuthorizationMode>('always');

  useEffect(() => {
    let mounted = true;

    void isSendConfirmationRequired()
      .then((required) => {
        if (mounted) {
          setSendConfirmationRequiredState(required);
        }
      })
      .catch(() => {
        if (mounted) {
          setSendConfirmationRequiredState(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    void getTransactionAuthorizationMode()
      .then((mode) => {
        if (mounted) {
          setSelectedTransactionAuthorizationMode(mode);
        }
      })
      .catch(() => {
        if (mounted) {
          setSelectedTransactionAuthorizationMode('always');
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleCopySecret = async (action: SecretAction) => {
    setIsLoading(true);
    try {
      const secret = await action.loadSecret();
      if (!secret) {
        return;
      }

      await copyWithAutoClear(secret);
      await HapticFeedback.success();
      Alert.alert('Copied', `${action.title} copied to clipboard. It will be cleared in 30 seconds.`);
    } catch (error: any) {
      Alert.alert('Error', sanitizeErrorForUser(error, action.failureMessage));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransactionAuthorizationModePress = async (
    mode: TransactionAuthorizationMode
  ) => {
    setSelectedTransactionAuthorizationMode(mode);
    try {
      await setTransactionAuthorizationMode(mode);
    } catch (error: any) {
      setSelectedTransactionAuthorizationMode(await getTransactionAuthorizationMode());
      Alert.alert('Error', sanitizeErrorForUser(error, 'Failed to update transaction authorization'));
    }
  };

  const updateSendConfirmationRequired = async (required: boolean) => {
    try {
      await persistSendConfirmationRequired(required);
      setSendConfirmationRequiredState(required);
    } catch (error: any) {
      Alert.alert('Error', sanitizeErrorForUser(error, 'Failed to update send biometric approval'));
    }
  };

  const handleSendConfirmationToggle = (nextRequired = !sendConfirmationRequired) => {
    if (nextRequired) {
      void updateSendConfirmationRequired(true);
      return;
    }

    Alert.alert(
      'Turn Off Send Biometrics?',
      'Anyone with access to your unlocked wallet can send tokens without biometric confirmation. Keep this on for the strongest protection.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn Off',
          style: 'destructive',
          onPress: () => updateSendConfirmationRequired(false),
        },
      ]
    );
  };

  const handleRevealSecret = (action: SecretAction) => {
    Alert.alert(action.title, action.warning, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: async () => {
          setIsLoading(true);
          try {
            const secret = await action.loadSecret();
            if (!secret) {
              return;
            }

            Alert.alert(action.title, secret, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Copy',
                onPress: () => void handleCopySecret(action),
              },
            ]);
          } catch (error: any) {
            Alert.alert('Error', sanitizeErrorForUser(error, action.failureMessage));
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const secretActions: Array<SecretAction & {
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      title: 'Recovery Phrase',
      icon: 'shield-outline',
      warning: 'Your recovery phrase gives full access to your wallet. Never share it with anyone.',
      failureMessage: 'Failed to get recovery phrase',
      loadSecret: getMnemonic,
    },
    {
      title: 'Private Key',
      icon: 'key-outline',
      warning: 'Your private key gives full access to your wallet. Never share it with anyone.',
      failureMessage: 'Failed to get private key',
      loadSecret: getPrivateKey,
    },
  ];

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </Pressable>
          <Text style={styles.title}>Security & Privacy</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Sensitive Wallet Data</Text>
            <Text style={styles.summaryBody}>
              Each reveal and copy action requires device authentication before the data is shown or moved to the clipboard.
            </Text>
          </View>

          <View style={styles.authorizationCard}>
            <View style={styles.sendApprovalHeader}>
              <View style={styles.sendApprovalCopy}>
                <Text style={styles.summaryTitle}>Require biometrics for sends</Text>
                <Text style={styles.summaryBody}>
                  Manual sends ask for device authentication before broadcasting.
                </Text>
              </View>
              <View style={styles.sendApprovalControl}>
                <Switch
                  accessibilityLabel="Require biometrics for sends"
                  value={sendConfirmationRequired}
                  onValueChange={handleSendConfirmationToggle}
                  trackColor={{
                    false: colors.border,
                    true: colors.purple,
                  }}
                  thumbColor={colors.textPrimary}
                  ios_backgroundColor={colors.border}
                />
              </View>
            </View>
            {!sendConfirmationRequired && (
              <View style={styles.sendApprovalWarning}>
                <Ionicons name="warning-outline" size={15} color={colors.warning} />
                <Text style={styles.sendApprovalWarningText}>
                  Manual sends will skip device authentication.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.authorizationCard}>
            <Text style={styles.summaryTitle}>Transaction Authorization</Text>
            <Text style={styles.summaryBody}>
              Remember manual send and native swap authorization briefly in memory. dApp and WalletConnect approvals still require confirmation.
            </Text>
            <View style={styles.authorizationOptions}>
              {getTransactionAuthorizationOptions().map((option, index, options) => (
                <React.Fragment key={option.mode}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.authorizationOption,
                      pressed ? styles.pressed : null,
                    ]}
                    onPress={() => void handleTransactionAuthorizationModePress(option.mode)}
                    accessibilityRole="button"
                  >
                    <View style={styles.authorizationOptionCopy}>
                      <Text style={styles.settingItemText}>{option.label}</Text>
                      <Text style={styles.settingHint}>{option.detail}</Text>
                    </View>
                    {transactionAuthorizationMode === option.mode && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    )}
                  </Pressable>
                  {index < options.length - 1 && <View style={styles.authorizationSeparator} />}
                </React.Fragment>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            {secretActions.map((action, index) => (
              <React.Fragment key={action.title}>
                <Pressable
                  style={({ pressed }) => [
                    styles.settingItem,
                    pressed ? styles.pressed : null,
                  ]}
                  onPress={() => handleRevealSecret(action)}
                  disabled={isLoading}
                  accessibilityRole="button"
                >
                  <View style={styles.settingItemLeft}>
                    <Ionicons name={action.icon} size={22} color={colors.purple} />
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingItemText}>{`View ${action.title}`}</Text>
                      <Text style={styles.settingHint}>Authenticate to reveal or copy</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </Pressable>
                {index < secretActions.length - 1 && <View style={styles.separator} />}
              </React.Fragment>
            ))}
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
  },
  headerSpacer: {
    width: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.65,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  summaryBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  authorizationCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sendApprovalHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sendApprovalCopy: {
    flex: 1,
    paddingRight: 4,
  },
  sendApprovalControl: {
    width: 66,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sendApprovalWarning: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sendApprovalWarningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.warning,
  },
  authorizationOptions: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  authorizationOption: {
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  authorizationOptionCopy: {
    flex: 1,
  },
  authorizationSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
  },
  settingItem: {
    minHeight: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  settingCopy: {
    flex: 1,
  },
  settingItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  settingHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 50,
  },
});
