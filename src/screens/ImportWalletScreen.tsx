import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useWalletStore } from '../stores/walletStore';
import { validateMnemonic } from '../lib/wallet';
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
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to import wallet');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Import Wallet</Text>
        <Text style={styles.description}>
          Enter your 12-word recovery phrase to restore your wallet
        </Text>

        <View style={styles.content}>
          <Input
            label="Recovery Phrase"
            placeholder="Enter your 12 words separated by spaces"
            value={mnemonic}
            onChangeText={(text) => {
              setMnemonic(text);
              setError('');
            }}
            multiline
            numberOfLines={4}
            style={styles.input}
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
            style={styles.button}
          />
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  content: {
    flex: 1,
  },
  input: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  infoBox: {
    backgroundColor: colors.elevated,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  buttons: {
    marginTop: 'auto',
  },
  button: {
    marginBottom: 12,
  },
});