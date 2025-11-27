import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { useWalletStore } from '../stores/walletStore';
import { generateMnemonic } from '../lib/wallet';
import { colors } from '../theme/colors';

export const CreateWalletScreen = () => {
  const navigation = useNavigation<any>();
  const createWallet = useWalletStore(state => state.createWallet);
  const [mnemonic, setMnemonic] = useState('');
  const [isRevealed, setIsRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateWallet = () => {
    const newMnemonic = generateMnemonic();
    setMnemonic(newMnemonic);
    setIsRevealed(true);
  };

  const handleCopyMnemonic = async () => {
    await Clipboard.setStringAsync(mnemonic);
    Alert.alert('Copied!', 'Recovery phrase copied to clipboard');
  };

  const handleConfirmWallet = async () => {
    Alert.alert(
      'Important!',
      'Have you saved your recovery phrase? You will need it to recover your wallet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, I saved it',
          onPress: async () => {
            setIsLoading(true);
            try {
              await createWallet(mnemonic);
              navigation.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              });
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to create wallet');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Create New Wallet</Text>
        <Text style={styles.description}>
          Generate a new wallet with a secure recovery phrase
        </Text>

        {!isRevealed ? (
          <View style={styles.content}>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>What is a recovery phrase?</Text>
              <Text style={styles.infoText}>
                A recovery phrase is a series of 12 words that acts as a backup
                for your wallet. Keep it safe and never share it with anyone!
              </Text>
            </View>
            <Button
              title="Generate Recovery Phrase"
              onPress={handleGenerateWallet}
              style={styles.button}
            />
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠️ Write down these words in order and keep them safe!
              </Text>
              <Text style={styles.warningSubtext}>
                Never share your recovery phrase with anyone
              </Text>
            </View>

            <View style={styles.mnemonicContainer}>
              <ScrollView style={styles.mnemonicScroll}>
                <View style={styles.mnemonicBox}>
                  {mnemonic.split(' ').map((word, index) => (
                    <View key={index} style={styles.wordContainer}>
                      <Text style={styles.wordNumber}>{index + 1}.</Text>
                      <Text style={styles.word}>{word}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopyMnemonic}>
                <Text style={styles.copyButtonText}>Copy to Clipboard</Text>
              </TouchableOpacity>
            </View>

            <Button
              title="I've Saved My Recovery Phrase"
              onPress={handleConfirmWallet}
              loading={isLoading}
              style={styles.button}
            />
          </View>
        )}
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
  infoBox: {
    backgroundColor: colors.purpleLight,
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.purple,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  warningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning,
    marginBottom: 4,
  },
  warningSubtext: {
    fontSize: 12,
    color: colors.warning,
  },
  mnemonicContainer: {
    flex: 1,
    marginBottom: 24,
  },
  mnemonicScroll: {
    maxHeight: 300,
  },
  mnemonicBox: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  wordContainer: {
    flexDirection: 'row',
    width: '50%',
    paddingVertical: 6,
  },
  wordNumber: {
    fontSize: 12,
    color: colors.textTertiary,
    marginRight: 6,
    width: 20,
  },
  word: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  copyButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  copyButtonText: {
    color: colors.purple,
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    marginTop: 'auto',
  },
});