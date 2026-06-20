import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { HapticFeedback } from '../lib/haptics';
import { copyWithAutoClear } from '../lib/clipboard';
import { sanitizeErrorForUser } from '../lib/logger';
import { useWalletStore } from '../stores/walletStore';
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
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </TouchableOpacity>
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

          <View style={styles.section}>
            {secretActions.map((action, index) => (
              <React.Fragment key={action.title}>
                <TouchableOpacity
                  style={styles.settingItem}
                  onPress={() => handleRevealSecret(action)}
                  disabled={isLoading}
                >
                  <View style={styles.settingItemLeft}>
                    <Ionicons name={action.icon} size={22} color={colors.purple} />
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingItemText}>{`View ${action.title}`}</Text>
                      <Text style={styles.settingHint}>Authenticate to reveal or copy</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
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
