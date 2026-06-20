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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { HapticFeedback } from '../lib/haptics';
import { sanitizeErrorForUser } from '../lib/logger';
import { getBackupHealthLabel } from '../lib/backupHealth';
import {
  generateBackupRecoveryKey,
  isValidBackupRecoveryKey,
  normalizeBackupRecoveryKey,
} from '../lib/backupRecoveryKey';
import {
  createWalletBackup,
  verifyWalletBackup,
  type BackupData,
} from '../lib/walletBackup';
import { useWalletStore } from '../stores/walletStore';
import colors from '../theme/colors';

const BACKUP_DIRECTORY_NAME = 'backups';

export const BackupRecoveryScreen = () => {
  const navigation = useNavigation<any>();
  const {
    backupHealth,
    createBackupSnapshot,
    restoreFromBackup,
    markBackupVerified,
  } = useWalletStore();

  const [currentBackupPin, setCurrentBackupPin] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
  const [confirmedRecoveryKey, setConfirmedRecoveryKey] = useState('');
  const [restorePin, setRestorePin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [isVerifyingBackup, setIsVerifyingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [importedBackup, setImportedBackup] = useState<BackupData | null>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [isImportedBackupVerified, setIsImportedBackupVerified] = useState(false);

  const handleGenerateRecoveryKey = async () => {
    const key = await generateBackupRecoveryKey();
    setGeneratedRecoveryKey(key);
    setConfirmedRecoveryKey('');
    await HapticFeedback.selection();
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
      markBackupVerified({
        provider: 'manual-file',
        verifiedAt: completedAt,
        walletFingerprint: backup.version === 2 ? backup.walletFingerprint : '',
        accountSetHash: backup.version === 2 ? backup.accountSetHash : '',
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: 'Share wallet backup',
          mimeType: 'application/json',
          UTI: 'public.json',
        });
        Alert.alert('Backup Ready', 'Encrypted wallet backup created and ready to share.');
      } else {
        Alert.alert('Backup Saved', `Encrypted wallet backup saved to ${fileName}.`);
      }

      await HapticFeedback.success();
    } catch (error: any) {
      await HapticFeedback.error();
      Alert.alert('Backup Failed', sanitizeErrorForUser(error, 'Unable to create wallet backup'));
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleImportBackup = async () => {
    setIsImportingBackup(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const asset = result.assets[0];
      const contents = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsedBackup = JSON.parse(contents) as BackupData;

      setImportedBackup(parsedBackup);
      setImportedFileName(asset.name ?? 'wallet-backup.json');
      setIsImportedBackupVerified(false);
      setRestorePin('');

      await HapticFeedback.selection();
    } catch (error: any) {
      await HapticFeedback.error();
      Alert.alert('Import Failed', sanitizeErrorForUser(error, 'Unable to import wallet backup'));
    } finally {
      setIsImportingBackup(false);
    }
  };

  const handleVerifyImportedBackup = async () => {
    if (!importedBackup) {
      Alert.alert('Backup Required', 'Import a backup file before verifying it.');
      return;
    }

    if (!restorePin.trim()) {
      Alert.alert('Backup Secret Required', 'Enter the backup recovery key or legacy backup PIN used to create this backup.');
      return;
    }

    setIsVerifyingBackup(true);

    try {
      const isValid = await verifyWalletBackup(importedBackup, restorePin.trim());
      if (!isValid) {
        throw new Error('Backup verification failed. Check the PIN and backup file.');
      }

      setIsImportedBackupVerified(true);
      await HapticFeedback.success();
      Alert.alert('Backup Verified', 'This backup can be restored with the provided backup secret.');
    } catch (error: any) {
      setIsImportedBackupVerified(false);
      await HapticFeedback.error();
      Alert.alert('Verification Failed', sanitizeErrorForUser(error, 'Unable to verify wallet backup'));
    } finally {
      setIsVerifyingBackup(false);
    }
  };

  const handleRestoreBackup = () => {
    if (!importedBackup || !isImportedBackupVerified) {
      Alert.alert('Verification Required', 'Verify the imported backup before restoring it.');
      return;
    }

    if (!currentPin.trim()) {
      Alert.alert('PIN Required', 'Enter your current PIN to authorize replacing this device wallet.');
      return;
    }

    Alert.alert(
      'Restore Wallet Backup',
      'Restoring will replace the current wallet accounts on this device. Your existing app PIN and lock settings will stay in place.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setIsRestoringBackup(true);
            try {
              await restoreFromBackup(importedBackup, restorePin.trim(), currentPin.trim());
              setImportedBackup(null);
              setImportedFileName(null);
              setRestorePin('');
              setCurrentPin('');
              setIsImportedBackupVerified(false);
              await HapticFeedback.success();
              Alert.alert('Restore Complete', 'Wallet backup restored successfully.');
              navigation.goBack();
            } catch (error: any) {
              await HapticFeedback.error();
              Alert.alert('Restore Failed', sanitizeErrorForUser(error, 'Unable to restore wallet backup'));
            } finally {
              setIsRestoringBackup(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </TouchableOpacity>
          <Text style={styles.title}>Backup & Recovery</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Backup Status</Text>
            <View style={styles.statusRow}>
              <Ionicons name="cloud-done-outline" size={20} color={colors.purple} />
              <Text style={styles.statusText}>{getBackupHealthLabel(backupHealth)}</Text>
            </View>
            <Text style={styles.helperText}>
              Backups include encrypted account data, integrity checks, and account-by-account verification.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Create Backup</Text>
            <Text style={styles.helperText}>
              Generate a backup recovery key, confirm it, then use your current wallet PIN to authorize an encrypted JSON backup.
            </Text>
            <Button
              title="Generate Recovery Key"
              onPress={handleGenerateRecoveryKey}
              variant="secondary"
            />
            {generatedRecoveryKey ? (
              <View style={styles.recoveryKeyBox}>
                <Text style={styles.recoveryKeyText}>{generatedRecoveryKey}</Text>
              </View>
            ) : null}
            <Input
              label="Current wallet PIN"
              value={currentBackupPin}
              onChangeText={setCurrentBackupPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              containerStyle={styles.input}
            />
            <Input
              label="Confirm backup recovery key"
              value={confirmedRecoveryKey}
              onChangeText={setConfirmedRecoveryKey}
              autoCapitalize="characters"
              secureTextEntry
              containerStyle={styles.input}
            />
            <Button
              title="Create Manual Backup"
              onPress={handleCreateBackup}
              loading={isCreatingBackup}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Import Recovery File</Text>
            <Text style={styles.helperText}>
              Import a previously exported backup, verify it with the backup recovery key or legacy backup PIN, then restore it over the current wallet.
            </Text>

            <TouchableOpacity style={styles.fileRow} onPress={handleImportBackup} activeOpacity={0.8}>
              <View style={styles.fileRowLeft}>
                <Ionicons name="document-outline" size={20} color={colors.purple} />
                <Text style={styles.fileRowText}>
                  {importedFileName ?? 'Choose backup file'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <Input
              label="Backup recovery key or legacy backup PIN"
              value={restorePin}
              onChangeText={(value) => {
                setRestorePin(value);
                setIsImportedBackupVerified(false);
              }}
              secureTextEntry
              containerStyle={styles.input}
            />
            <Input
              label="Current Wallet PIN"
              value={currentPin}
              onChangeText={setCurrentPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              containerStyle={styles.input}
            />

            <View style={styles.buttonStack}>
              <Button
                title="Import Backup File"
                onPress={handleImportBackup}
                variant="secondary"
                loading={isImportingBackup}
              />
              <Button
                title={isImportedBackupVerified ? 'Backup Verified' : 'Verify Backup'}
                onPress={handleVerifyImportedBackup}
                variant="secondary"
                disabled={!importedBackup || isImportedBackupVerified}
                loading={isVerifyingBackup}
              />
              <Button
                title="Restore Backup"
                onPress={handleRestoreBackup}
                variant="danger"
                disabled={!importedBackup || !isImportedBackupVerified}
                loading={isRestoringBackup}
              />
            </View>
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
  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  statusText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    marginBottom: 0,
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
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.elevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  fileRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  fileRowText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  buttonStack: {
    gap: 12,
  },
});
