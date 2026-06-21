import React, { useReducer } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { HapticFeedback } from '../lib/haptics';
import { sanitizeErrorForUser } from '../lib/logger';
import { getBackupHealthLabel } from '../lib/backupHealth';
import {
  isValidBackupRecoveryKey,
  normalizeBackupRecoveryKey,
} from '../lib/backupRecoveryKey';
import {
  verifyWalletBackup,
  type BackupData,
} from '../lib/walletBackup';
import { useWalletStore } from '../stores/walletStore';
import colors from '../theme/colors';

const VERIFY_BACKUP_ERROR_MESSAGE =
  'Check the backup recovery key or legacy backup PIN and backup file, then try again.';

function getRestoreBackupSecret(backup: BackupData, value: string): string {
  const trimmedValue = value.trim();
  if (backup.version === 2 && isValidBackupRecoveryKey(trimmedValue)) {
    return normalizeBackupRecoveryKey(trimmedValue);
  }

  return trimmedValue;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function getImportBackupErrorMessage(error: unknown): string {
  if (error instanceof SyntaxError) {
    return 'Select a valid Kondor backup file and try again.';
  }

  return sanitizeErrorForUser(
    error,
    'Unable to import wallet backup. Select a valid Kondor backup file and try again.'
  );
}

function getVerifyBackupErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  if (message.startsWith('Backup verification failed')) {
    return VERIFY_BACKUP_ERROR_MESSAGE;
  }

  return sanitizeErrorForUser(error, VERIFY_BACKUP_ERROR_MESSAGE);
}

function getRestoreBackupErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  if (message === 'Incorrect PIN' || message === 'Current PIN is incorrect') {
    return 'Current PIN is incorrect.';
  }

  return sanitizeErrorForUser(
    error,
    'Unable to restore wallet backup. Check your current PIN, backup recovery key or legacy backup PIN, and backup file, then try again.'
  );
}

function formatBackupDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type RestoreState = {
  restorePin: string;
  currentPin: string;
  isImportingBackup: boolean;
  isVerifyingBackup: boolean;
  isRestoringBackup: boolean;
  importedBackup: BackupData | null;
  importedFileName: string | null;
  isImportedBackupVerified: boolean;
};

type RestoreAction =
  | { type: 'importStarted' }
  | { type: 'importFinished' }
  | { type: 'backupImported'; backup: BackupData; fileName: string }
  | { type: 'restorePinChanged'; value: string }
  | { type: 'currentPinChanged'; value: string }
  | { type: 'verifyStarted' }
  | { type: 'verifySucceeded' }
  | { type: 'verifyFailed' }
  | { type: 'restoreStarted' }
  | { type: 'restoreFinished' }
  | { type: 'restoreCompleted' };

const initialRestoreState: RestoreState = {
  restorePin: '',
  currentPin: '',
  isImportingBackup: false,
  isVerifyingBackup: false,
  isRestoringBackup: false,
  importedBackup: null,
  importedFileName: null,
  isImportedBackupVerified: false,
};

function restoreReducer(state: RestoreState, action: RestoreAction): RestoreState {
  switch (action.type) {
    case 'importStarted':
      return { ...state, isImportingBackup: true };
    case 'importFinished':
      return { ...state, isImportingBackup: false };
    case 'backupImported':
      return {
        ...state,
        importedBackup: action.backup,
        importedFileName: action.fileName,
        isImportedBackupVerified: false,
        restorePin: '',
      };
    case 'restorePinChanged':
      return {
        ...state,
        restorePin: action.value,
        isImportedBackupVerified: false,
      };
    case 'currentPinChanged':
      return { ...state, currentPin: action.value };
    case 'verifyStarted':
      return { ...state, isVerifyingBackup: true };
    case 'verifySucceeded':
      return {
        ...state,
        isVerifyingBackup: false,
        isImportedBackupVerified: true,
      };
    case 'verifyFailed':
      return {
        ...state,
        isVerifyingBackup: false,
        isImportedBackupVerified: false,
      };
    case 'restoreStarted':
      return { ...state, isRestoringBackup: true };
    case 'restoreFinished':
      return { ...state, isRestoringBackup: false };
    case 'restoreCompleted':
      return {
        ...state,
        isRestoringBackup: false,
        importedBackup: null,
        importedFileName: null,
        restorePin: '',
        currentPin: '',
        isImportedBackupVerified: false,
      };
    default:
      return state;
  }
}

export const BackupRecoveryScreen = () => {
  const navigation = useNavigation<any>();
  const {
    backupHealth,
    restoreFromBackup,
    backupRecords,
  } = useWalletStore();
  const [restoreState, dispatchRestore] = useReducer(restoreReducer, initialRestoreState);
  const {
    restorePin,
    currentPin,
    isImportingBackup,
    isVerifyingBackup,
    isRestoringBackup,
    importedBackup,
    importedFileName,
    isImportedBackupVerified,
  } = restoreState;

  const handleImportBackup = async () => {
    dispatchRestore({ type: 'importStarted' });

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

      dispatchRestore({
        type: 'backupImported',
        backup: parsedBackup,
        fileName: asset.name ?? 'wallet-backup.json',
      });

      await HapticFeedback.selection();
    } catch (error: any) {
      await HapticFeedback.error();
      Alert.alert('Import Failed', getImportBackupErrorMessage(error));
    } finally {
      dispatchRestore({ type: 'importFinished' });
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

    dispatchRestore({ type: 'verifyStarted' });

    try {
      const backupSecret = getRestoreBackupSecret(importedBackup, restorePin);
      const isValid = await verifyWalletBackup(importedBackup, backupSecret);
      if (!isValid) {
        throw new Error('Backup verification failed');
      }

      dispatchRestore({ type: 'verifySucceeded' });
      await HapticFeedback.success();
      Alert.alert('Backup Verified', 'This backup can be restored with the provided backup secret.');
    } catch (error: any) {
      dispatchRestore({ type: 'verifyFailed' });
      await HapticFeedback.error();
      Alert.alert('Verification Failed', getVerifyBackupErrorMessage(error));
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
            dispatchRestore({ type: 'restoreStarted' });
            try {
              await restoreFromBackup(
                importedBackup,
                getRestoreBackupSecret(importedBackup, restorePin),
                currentPin.trim()
              );
              dispatchRestore({ type: 'restoreCompleted' });
              await HapticFeedback.success();
              Alert.alert('Restore Complete', 'Wallet backup restored successfully.');
              navigation.goBack();
            } catch (error: any) {
              await HapticFeedback.error();
              Alert.alert('Restore Failed', getRestoreBackupErrorMessage(error));
            } finally {
              dispatchRestore({ type: 'restoreFinished' });
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
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </Pressable>
          <Text style={styles.title}>Backup & Recovery</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statusCard}>
            <Text style={styles.sectionTitle}>Backup Status</Text>
            <View style={styles.statusRow}>
              <Ionicons name="cloud-done-outline" size={20} color={colors.purple} />
              <Text style={styles.statusText}>{getBackupHealthLabel(backupHealth)}</Text>
            </View>
            <Text style={styles.helperText}>
              To recover this wallet later, you need the encrypted backup file and its backup recovery key.
            </Text>
            <Text style={styles.helperText}>
              The backup file cannot be decrypted by someone who only has the file. The recovery key unlocks the file during restore.
            </Text>
            <Button
              title="Create new backup"
              onPress={() => navigation.navigate('CreateBackup')}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Created Backups</Text>
            {backupRecords.length ? (
              <View style={styles.backupList}>
                {backupRecords.map((record) => (
                  <View key={record.id} style={styles.backupRecordRow}>
                    <View style={styles.backupRecordIcon}>
                      <Ionicons name="document-lock-outline" size={18} color={colors.purple} />
                    </View>
                    <View style={styles.backupRecordCopy}>
                      <Text style={styles.backupRecordName}>{record.fileName}</Text>
                      <Text style={styles.backupRecordMeta}>
                        Manual file • {formatBackupDate(record.createdAt)}
                      </Text>
                      <Text style={styles.backupRecordHint}>
                        Encrypted. Recovery key required to restore.
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            {!backupRecords.length ? (
              <Text style={styles.emptyBackupsText}>
                No backups created on this device yet. Create a backup, then save the file somewhere you can access if this device is lost.
              </Text>
            ) : (
              <Text style={styles.createdBackupsNote}>
                This list only tracks backups created on this device. Keep your recovery key outside Kondor.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Import Recovery File</Text>
            <Text style={styles.helperText}>
              Restore from an encrypted backup file. New backups use the backup recovery key; older backups may use the legacy backup PIN.
            </Text>

            <Pressable style={styles.fileRow} onPress={handleImportBackup}>
              <View style={styles.fileRowLeft}>
                <Ionicons name="document-outline" size={20} color={colors.purple} />
                <Text style={styles.fileRowText}>
                  {importedFileName ?? 'Choose backup file'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>

            <Input
              label="Backup recovery key or legacy backup PIN"
              value={restorePin}
              onChangeText={(value) => {
                dispatchRestore({ type: 'restorePinChanged', value });
              }}
              secureTextEntry
              containerStyle={styles.input}
            />
            <Input
              label="Current Wallet PIN"
              value={currentPin}
              onChangeText={(value) => dispatchRestore({ type: 'currentPinChanged', value })}
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
  scrollContent: {
    paddingBottom: 120,
  },
  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(112, 97, 239, 0.35)',
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
    marginBottom: 18,
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
    marginBottom: 18,
  },
  backupList: {
    gap: 12,
    marginBottom: 12,
  },
  backupRecordRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backupRecordIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupRecordCopy: {
    flex: 1,
  },
  backupRecordName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  backupRecordMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  backupRecordHint: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  emptyBackupsText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  createdBackupsNote: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
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
    marginBottom: 20,
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
    gap: 14,
  },
});
