/**
 * Account Switcher Component
 * Allows users to switch between accounts and manage them
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore, Account } from '../stores/walletStore';
import { truncateAddress } from '../lib/utils';
import colors from '../theme/colors';

interface AccountSwitcherProps {
  visible: boolean;
  onClose: () => void;
  onAccountSwitch?: () => void;
}

export const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  visible,
  onClose,
  onAccountSwitch,
}) => {
  const {
    accounts,
    activeAccountId,
    switchAccount,
    addAccount,
    importAccountFromPrivateKey,
    removeAccount,
    renameAccount,
  } = useWalletStore();

  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleSelectAccount = (account: Account) => {
    if (account.id !== activeAccountId) {
      switchAccount(account.id);
      onAccountSwitch?.();
    }
    onClose();
  };

  const handleAddAccount = async () => {
    try {
      const name = newAccountName.trim() || undefined;
      await addAccount(name);
      setNewAccountName('');
      setIsAddingAccount(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create account');
    }
  };

  const handleImportAccount = async () => {
    const key = importPrivateKey.trim();
    if (!key) {
      Alert.alert('Error', 'Please enter a private key');
      return;
    }

    try {
      const name = newAccountName.trim() || undefined;
      await importAccountFromPrivateKey(key, name);
      setImportPrivateKey('');
      setNewAccountName('');
      setIsImporting(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to import account');
    }
  };

  const handleRemoveAccount = (account: Account) => {
    if (accounts.length <= 1) {
      Alert.alert('Cannot Remove', 'You must have at least one account.');
      return;
    }

    Alert.alert(
      'Remove Account',
      `Are you sure you want to remove "${account.name}"?\n\n${account.isImported ? 'This is an imported account. Make sure you have backed up the private key.' : 'You can re-create this account from your seed phrase.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeAccount(account.id);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove account');
            }
          },
        },
      ]
    );
  };

  const handleStartRename = (account: Account) => {
    setEditingAccountId(account.id);
    setEditingName(account.name);
  };

  const handleSaveRename = () => {
    if (editingAccountId && editingName.trim()) {
      renameAccount(editingAccountId, editingName.trim());
    }
    setEditingAccountId(null);
    setEditingName('');
  };

  const renderAccount = ({ item: account }: { item: Account }) => {
    const isActive = account.id === activeAccountId;
    const isEditing = editingAccountId === account.id;

    return (
      <View style={[styles.accountItem, isActive && styles.accountItemActive]}>
        <TouchableOpacity
          style={styles.accountContent}
          onPress={() => handleSelectAccount(account)}
          disabled={isEditing}
        >
          <View style={[styles.avatar, isActive && styles.avatarActive]}>
            <Text style={[styles.avatarText, isActive && styles.avatarTextActive]}>
              {account.name.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.accountInfo}>
            {isEditing ? (
              <TextInput
                style={styles.nameInput}
                value={editingName}
                onChangeText={setEditingName}
                autoFocus
                selectTextOnFocus
                onBlur={handleSaveRename}
                onSubmitEditing={handleSaveRename}
              />
            ) : (
              <>
                <View style={styles.nameRow}>
                  <Text style={styles.accountName}>{account.name}</Text>
                  {account.isImported && (
                    <View style={styles.importedBadge}>
                      <Text style={styles.importedText}>Imported</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.accountAddress}>
                  {truncateAddress(account.address)}
                </Text>
              </>
            )}
          </View>

          {isActive && !isEditing && (
            <Ionicons name="checkmark-circle" size={24} color={colors.purple} />
          )}
        </TouchableOpacity>

        {!isEditing && (
          <View style={styles.accountActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleStartRename(account)}
            >
              <Ionicons name="pencil" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
            {accounts.length > 1 && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleRemoveAccount(account)}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Accounts</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Account List */}
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id}
          renderItem={renderAccount}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />

        {/* Add Account Section */}
        <View style={styles.footer}>
          {isAddingAccount ? (
            <View style={styles.addAccountForm}>
              <TextInput
                style={styles.addAccountInput}
                placeholder="Account name (optional)"
                placeholderTextColor={colors.textTertiary}
                value={newAccountName}
                onChangeText={setNewAccountName}
                autoFocus
              />
              <View style={styles.addAccountButtons}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setIsAddingAccount(false);
                    setNewAccountName('');
                  }}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={handleAddAccount}
                >
                  <Text style={styles.createBtnText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : isImporting ? (
            <View style={styles.addAccountForm}>
              <TextInput
                style={styles.addAccountInput}
                placeholder="Private key (hex or WIF)"
                placeholderTextColor={colors.textTertiary}
                value={importPrivateKey}
                onChangeText={setImportPrivateKey}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <TextInput
                style={styles.addAccountInput}
                placeholder="Account name (optional)"
                placeholderTextColor={colors.textTertiary}
                value={newAccountName}
                onChangeText={setNewAccountName}
              />
              <View style={styles.addAccountButtons}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setIsImporting(false);
                    setImportPrivateKey('');
                    setNewAccountName('');
                  }}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={handleImportAccount}
                >
                  <Text style={styles.createBtnText}>Import</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.footerButtons}>
              <TouchableOpacity
                style={styles.addAccountBtn}
                onPress={() => setIsAddingAccount(true)}
              >
                <Ionicons name="add-circle-outline" size={24} color={colors.purple} />
                <Text style={styles.addAccountText}>Add Account</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.importAccountBtn}
                onPress={() => setIsImporting(true)}
              >
                <Ionicons name="key-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.importAccountText}>Import Private Key</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    padding: 16,
  },
  separator: {
    height: 8,
  },
  accountItem: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  accountItemActive: {
    borderWidth: 1,
    borderColor: colors.purple,
  },
  accountContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarActive: {
    backgroundColor: colors.purpleLight,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  avatarTextActive: {
    color: colors.purple,
  },
  accountInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  importedBadge: {
    backgroundColor: colors.elevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  importedText: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  accountAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },
  nameInput: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: colors.elevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  accountActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButtons: {
    gap: 12,
  },
  addAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  addAccountText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.purple,
  },
  importAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  importAccountText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  addAccountForm: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  addAccountInput: {
    backgroundColor: colors.elevated,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  addAccountButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.elevated,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  createBtn: {
    flex: 1,
    backgroundColor: colors.purple,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
