import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { useContactStore, Contact } from '../stores/contactStore';
import { truncateAddress } from '../lib/utils';
import colors from '../theme/colors';

interface ContactPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (contact: Contact) => void;
}

export const ContactPicker: React.FC<ContactPickerProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  const { contacts } = useContactStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (contact: Contact) => {
    onSelect(contact);
    setSearchQuery('');
    onClose();
  };

  const renderContact = ({ item: contact }: { item: Contact }) => (
    <TouchableOpacity
      style={styles.contactItem}
      onPress={() => handleSelect(contact)}
    >
      <View style={styles.contactAvatar}>
        <Text style={styles.contactAvatarText}>
          {contact.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{contact.name}</Text>
        <Text style={styles.contactAddress}>{truncateAddress(contact.address)}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>👥</Text>
      <Text style={styles.emptyTitle}>
        {searchQuery ? 'No contacts found' : 'No contacts yet'}
      </Text>
      <Text style={styles.emptyDescription}>
        {searchQuery
          ? 'Try a different search term'
          : 'Add contacts from the Contacts screen'}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Contact</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {contacts.length > 0 && (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search contacts..."
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />
            </View>
          )}

          <FlatList
            data={filteredContacts}
            keyExtractor={(item) => item.id}
            renderItem={renderContact}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={
              filteredContacts.length === 0 ? styles.emptyContainer : styles.listContainer
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeButton: {
    fontSize: 24,
    color: colors.textSecondary,
    padding: 4,
  },
  searchContainer: {
    padding: 16,
    paddingTop: 8,
  },
  searchInput: {
    backgroundColor: colors.elevated,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listContainer: {
    padding: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  separator: {
    height: 8,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevated,
    padding: 14,
    borderRadius: 12,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.purple,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  contactAddress: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
