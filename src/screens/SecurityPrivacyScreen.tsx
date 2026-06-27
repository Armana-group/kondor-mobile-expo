import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { InfoCard } from '../components/InfoCard';
import { WarningInline } from '../components/WarningInline';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsSection } from '../components/settings/SettingsSection';
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
import { layout } from '../theme/layout';

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
        <AppHeader title="Security & Privacy" onBack={() => navigation.goBack()} />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <InfoCard
            title="Sensitive Wallet Data"
            body="Each reveal and copy action requires device authentication before the data is shown or moved to the clipboard."
          />

          <SettingsSection>
            <SettingsRow
              label="Require biometrics for sends"
              helperText="Manual sends ask for device authentication before broadcasting."
              minHeight="tall"
              control={
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
              }
              showChevron={false}
            />
            {!sendConfirmationRequired && (
              <WarningInline
                text="Manual sends will skip device authentication."
                style={styles.sectionWarning}
              />
            )}
          </SettingsSection>

          <InfoCard
            title="Transaction Authorization"
            body="Remember manual send and native swap authorization briefly in memory. dApp and WalletConnect approvals still require confirmation."
          >
            <View style={styles.authorizationOptions}>
              {getTransactionAuthorizationOptions().map((option, index, options) => (
                <SettingsRow
                  key={option.mode}
                  label={option.label}
                  helperText={option.detail}
                  minHeight="tall"
                  selected={transactionAuthorizationMode === option.mode}
                  showChevron={false}
                  showSeparator={index < options.length - 1}
                  onPress={() => void handleTransactionAuthorizationModePress(option.mode)}
                />
              ))}
            </View>
          </InfoCard>

          <SettingsSection>
            {secretActions.map((action, index) => (
              <SettingsRow
                key={action.title}
                label={`View ${action.title}`}
                helperText="Authenticate to reveal or copy"
                icon={action.icon}
                onPress={() => handleRevealSecret(action)}
                disabled={isLoading}
                showSeparator={index < secretActions.length - 1}
              />
            ))}
          </SettingsSection>
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
  content: {
    flex: 1,
    paddingHorizontal: layout.screen.gutter,
  },
  contentContainer: {
    paddingBottom: layout.screen.bottomPadding,
  },
  authorizationOptions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionWarning: {
    marginHorizontal: layout.row.horizontalPadding,
    marginBottom: layout.row.verticalPadding,
  },
});
