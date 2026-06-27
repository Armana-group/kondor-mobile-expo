import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useWalletStore } from '../stores/walletStore';
import { validateMnemonic } from '../lib/wallet';
import { sanitizeErrorForUser } from '../lib/logger';
import { colors } from '../theme/colors';

export const ImportWalletScreen = () => {
  const navigation = useNavigation<any>();
  const importWallet = useWalletStore(state => state.importWallet);
  const [mnemonic, setMnemonic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    // Clear previous error
    setError('');

    // Basic validation
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12) {
      setError('Recovery phrase must be exactly 12 words');
      return;
    }

    // Validate mnemonic
    if (!validateMnemonic(mnemonic.trim())) {
      setError('Invalid recovery phrase. Please check and try again.');
      return;
    }

    setIsLoading(true);
    try {
      await importWallet(mnemonic.trim());
    } catch (error: any) {
      Alert.alert('Error', sanitizeErrorForUser(error, 'Failed to import wallet'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen
      scroll={false}
      keyboardAvoiding={false}
      safeAreaEdges={['left', 'right', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.title}>Import Wallet</Text>
            <Text style={styles.description}>
              Enter your 12-word recovery phrase to restore your wallet.
            </Text>
          </View>

          <View style={styles.content}>
            <Input
              label="Recovery Phrase"
              placeholder="word one word two word three..."
              value={mnemonic}
              onChangeText={(text) => {
                setMnemonic(text);
                setError('');
              }}
              multiline
              numberOfLines={4}
              style={styles.input}
              containerStyle={styles.inputContainer}
              error={error}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Enter the words in the exact order they were given to you
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.buttons}>
          <Button
            title="Import Wallet"
            onPress={handleImport}
            loading={isLoading}
            disabled={!mnemonic.trim()}
            style={styles.button}
          />
          <Button
            title="Cancel"
            onPress={() => navigation.goBack()}
            variant="secondary"
            style={styles.secondaryButton}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
  },
  hero: {
    marginBottom: 28,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  content: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 14,
  },
  input: {
    minHeight: 132,
    paddingTop: 14,
    paddingBottom: 14,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  infoBox: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  buttons: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(64, 64, 64, 0.45)',
    backgroundColor: colors.background,
  },
  button: {
    marginBottom: 12,
  },
  secondaryButton: {
    marginBottom: 0,
  },
});
