import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getBackupHealthLabel,
  isBackupHealthActionRequired,
  type BackupHealth,
} from '../lib/backupHealth';
import colors from '../theme/colors';

type BackupStatusNoticeProps = {
  backupHealth: BackupHealth;
  onPress: () => void;
  compact?: boolean;
};

export function BackupStatusNotice({
  backupHealth,
  onPress,
  compact = false,
}: BackupStatusNoticeProps) {
  if (!isBackupHealthActionRequired(backupHealth)) {
    return null;
  }

  const fullBody = backupHealth.status === 'stale'
    ? 'Your wallet changed after the last backup. Create a fresh encrypted backup.'
    : backupHealth.status === 'failed'
      ? 'The last backup did not verify. Create a verified encrypted backup before relying on it.'
      : 'Create a verified encrypted backup before relying on this wallet.';
  const compactBody = backupHealth.status === 'stale'
    ? 'Create a fresh encrypted backup before sending.'
    : backupHealth.status === 'failed'
      ? 'Create a verified backup before relying on it.'
      : fullBody;
  const body = compact ? compactBody : fullBody;
  const showBody = !compact || backupHealth.status === 'stale' || backupHealth.status === 'failed';

  return (
    <TouchableOpacity style={[styles.container, compact && styles.compact]} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>
          {backupHealth.status === 'none' ? 'Back up this wallet' : getBackupHealthLabel(backupHealth)}
        </Text>
        {showBody && <Text style={styles.body}>{body}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 8,
    padding: 12,
  },
  compact: {
    paddingVertical: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
});
