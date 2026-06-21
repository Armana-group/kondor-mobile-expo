import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { copyWithAutoClear } from '../lib/clipboard';
import { HapticFeedback } from '../lib/haptics';
import { sanitizeErrorForUser } from '../lib/logger';
import {
  generateBackupRecoveryKey,
  isValidBackupRecoveryKey,
  normalizeBackupRecoveryKey,
} from '../lib/backupRecoveryKey';
import { createWalletBackup } from '../lib/walletBackup';
import { useWalletStore } from '../stores/walletStore';
import colors from '../theme/colors';

const BACKUP_DIRECTORY_NAME = 'backups';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function isCurrentPinError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message === 'Incorrect PIN' || message === 'Current PIN is incorrect';
}

function getCreateBackupErrorMessage(error: unknown): string {
  if (isCurrentPinError(error)) {
    return 'Current PIN is incorrect.';
  }

  if (getErrorMessage(error) === 'Backup recovery key is required') {
    return 'Backup recovery key is required.';
  }

  return sanitizeErrorForUser(
    error,
    'Unable to create wallet backup. Check your current PIN and backup recovery key, then try again.'
  );
}

export const CreateBackupScreen = () => {
  const navigation = useNavigation<any>();
  const { createBackupSnapshot, recordBackupCreated } = useWalletStore();
  const [currentBackupPin, setCurrentBackupPin] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
  const [confirmedRecoveryKey, setConfirmedRecoveryKey] = useState('');
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  const handleGenerateRecoveryKey = async () => {
    const key = await generateBackupRecoveryKey();
    setGeneratedRecoveryKey(key);
    setConfirmedRecoveryKey('');
    await HapticFeedback.selection();
  };

  const handleCopyRecoveryKey = async () => {
    if (!generatedRecoveryKey) {
      return;
    }

    await copyWithAutoClear(generatedRecoveryKey);
    Alert.alert(
      'Recovery Key Copied',
      'Backup recovery key copied to clipboard. It will be cleared in 30 seconds.'
    );
  };

  const handleCreateBackup = async () => {
    if (!currentBackupPin.trim()) {
      Alert.alert('PIN Required', 'Enter your current PIN to create an encrypted backup.');
      return;
    }

    const normalizedConfirmedKey = normalizeBackupRecoveryKey(confirmedRecoveryKey);
    if (!generatedRecoveryKey || normalizedConfirmedKey !== generatedRecoveryKey) {
      Alert.alert(
        'Recovery Key Required',
        'Confirm the generated backup recovery key before creating this backup.'
      );
      return;
    }

    if (!isValidBackupRecoveryKey(normalizedConfirmedKey)) {
      Alert.alert('Invalid Recovery Key', 'Use the generated backup recovery key exactly as shown.');
      return;
    }

    setIsCreatingBackup(true);

    try {
      const snapshot = await createBackupSnapshot(currentBackupPin.trim(), normalizedConfirmedKey);
      const backup = await createWalletBackup(snapshot, normalizedConfirmedKey);
      const documentsDirectory = FileSystem.documentDirectory;

      if (!documentsDirectory) {
        throw new Error('Local document storage is unavailable on this device');
      }

      const backupDirectory = `${documentsDirectory}${BACKUP_DIRECTORY_NAME}`;
      await FileSystem.makeDirectoryAsync(backupDirectory, { intermediates: true });

      const fileName = `kondor-wallet-backup-${Date.now()}.json`;
      const fileUri = `${backupDirectory}/${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const completedAt = new Date().toISOString();
      recordBackupCreated({
        id: `${completedAt}-${fileName}`,
        fileName,
        fileUri,
        provider: 'manual-file',
        createdAt: completedAt,
        walletFingerprint: backup.version === 2 ? backup.walletFingerprint : '',
        accountSetHash: backup.version === 2 ? backup.accountSetHash : '',
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: 'Share wallet backup',
          mimeType: 'application/json',
          UTI: 'public.json',
        });
      }

      Alert.alert(
        'Backup Created',
        'Save the encrypted backup file and this backup recovery key. Kondor cannot recover the key if you lose it.'
      );
      await HapticFeedback.success();
    } catch (error: any) {
      await HapticFeedback.error();
      Alert.alert('Backup Failed', getCreateBackupErrorMessage(error));
    } finally {
      setIsCreatingBackup(false);
    }
  };

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </Pressable>
          <Text style={styles.title}>Create Backup</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.purple} />
            </View>
            <Text style={styles.summaryTitle}>Encrypted wallet backup</Text>
            <Text style={styles.summaryBody}>
              This creates an encrypted backup file containing the secrets needed to restore your accounts.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What you need to recover</Text>
            <View style={styles.requirementRow}>
              <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.requirementText}>The encrypted backup file</Text>
            </View>
            <View style={styles.requirementRow}>
              <Ionicons name="key-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.requirementText}>The backup recovery key shown on this screen</Text>
            </View>
            <Text style={styles.helperText}>
              Your current wallet PIN only authorizes creating this backup on this device. It does not unlock the backup file after your device is lost or reset.
            </Text>
          </View>

          <View style={styles.warningCard}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.warning} />
            <Text style={styles.warningText}>
              Anyone who only has the backup file cannot read it. Anyone who has both the file and recovery key can restore the wallet.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Generate recovery key</Text>
            <Text style={styles.helperText}>
              Copy this key and save it somewhere separate from the backup file. Kondor does not store it for you.
            </Text>
            <Button
              title="Generate Recovery Key"
              onPress={handleGenerateRecoveryKey}
              variant="secondary"
            />
            {generatedRecoveryKey ? (
              <View style={styles.recoveryKeyBox}>
                <Text style={styles.recoveryKeyText}>{generatedRecoveryKey}</Text>
                <Pressable
                  style={styles.copyRecoveryKeyButton}
                  onPress={handleCopyRecoveryKey}
                >
                  <Ionicons name="copy-outline" size={16} color={colors.purple} />
                  <Text style={styles.copyRecoveryKeyText}>Copy Recovery Key</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Confirm and create</Text>
            <Text style={styles.helperText}>
              Re-enter the recovery key to confirm you saved it, then enter your current wallet PIN to authorize the backup.
            </Text>
            <Input
              label="Confirm backup recovery key"
              value={confirmedRecoveryKey}
              onChangeText={setConfirmedRecoveryKey}
              autoCapitalize="characters"
              secureTextEntry
              containerStyle={styles.input}
            />
            <Input
              label="Current wallet PIN"
              value={currentBackupPin}
              onChangeText={setCurrentBackupPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              containerStyle={styles.input}
            />
            <Button
              title="Create encrypted backup"
              onPress={handleCreateBackup}
              loading={isCreatingBackup}
            />
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingTop: 20,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(112, 97, 239, 0.35)',
    borderRadius: 8,
    padding: 18,
    marginBottom: 18,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  summaryBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 18,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 18,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  requirementText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 18,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  input: {
    marginBottom: 18,
  },
  recoveryKeyBox: {
    backgroundColor: colors.elevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  recoveryKeyText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  copyRecoveryKeyButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  copyRecoveryKeyText: {
    color: colors.purple,
    fontSize: 14,
    fontWeight: '700',
  },
});
