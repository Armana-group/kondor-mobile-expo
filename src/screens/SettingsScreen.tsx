import React from 'react';
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
import { useWalletStore } from '../stores/walletStore';
import { useNetworkStore } from '../stores/networkStore';
import colors from '../theme/colors';

type SettingsItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  value?: string;
  destructive?: boolean;
};

type SettingsSection = {
  title: string;
  items: SettingsItem[];
};

type SettingsScreenProps = {
  onLockWallet?: () => void;
};

export const SettingsScreen = ({ onLockWallet }: SettingsScreenProps) => {
  const navigation = useNavigation<any>();
  const clearWallet = useWalletStore((state) => state.clearWallet);
  const networkMode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const networkLabel = hasHydrated
    ? networkMode === 'harbinger' ? 'Harbinger' : 'Mainnet'
    : 'Loading...';

  const handleRemoveWallet = () => {
    Alert.alert(
      'Remove Wallet',
      'Are you sure you want to remove this wallet? Make sure you have backed up your recovery phrase.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearWallet();
            } catch {
              Alert.alert('Error', 'Failed to remove wallet');
            }
          },
        },
      ]
    );
  };

  const sections: SettingsSection[] = [
    {
      title: 'Wallet',
      items: [
        {
          label: 'Manage Accounts',
          icon: 'wallet-outline',
          onPress: () => navigation.navigate('ManageAccounts'),
        },
        {
          label: 'Manage Tokens',
          icon: 'logo-bitcoin',
          onPress: () => navigation.navigate('TokenManagement'),
        },
        {
          label: 'Contacts',
          icon: 'people-outline',
          onPress: () => navigation.getParent()?.navigate('Contacts'),
        },
      ],
    },
    {
      title: 'Security',
      items: [
        {
          label: 'Security & Privacy',
          icon: 'shield-checkmark-outline',
          onPress: () => navigation.navigate('SecurityPrivacy'),
        },
        {
          label: 'Backup & Recovery',
          icon: 'cloud-upload-outline',
          onPress: () => navigation.navigate('BackupRecovery'),
        },
        {
          label: 'Lock Wallet',
          icon: 'lock-closed-outline',
          onPress: () => onLockWallet?.(),
        },
      ],
    },
    {
      title: 'Connections',
      items: [
        {
          label: 'Connected Sites',
          icon: 'globe-outline',
          onPress: () => navigation.navigate('ConnectedSites'),
        },
        {
          label: 'Network',
          icon: 'git-network-outline',
          value: networkLabel,
          onPress: () => navigation.navigate('NetworkSettings'),
        },
      ],
    },
    {
      title: 'Danger Zone',
      items: [
        {
          label: 'Remove Wallet',
          icon: 'trash-outline',
          onPress: handleRemoveWallet,
          destructive: true,
        },
      ],
    },
  ];

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.items.map((item, index) => {
                const color = item.destructive ? colors.error : colors.purple;
                const textColor = item.destructive ? colors.error : colors.textPrimary;

                return (
                  <React.Fragment key={item.label}>
                    <TouchableOpacity style={styles.settingItem} onPress={item.onPress}>
                      <View style={styles.settingItemLeft}>
                        <Ionicons name={item.icon} size={22} color={color} />
                        <Text style={[styles.settingItemText, { color: textColor }]}>
                          {item.label}
                        </Text>
                      </View>

                      {item.value ? (
                        <View style={styles.settingItemRight}>
                          <Text style={styles.settingItemValue}>{item.value}</Text>
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.textTertiary}
                          />
                        </View>
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={colors.textTertiary}
                        />
                      )}
                    </TouchableOpacity>
                    {index < section.items.length - 1 && <View style={styles.separator} />}
                  </React.Fragment>
                );
              })}
            </View>
          ))}
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
  section: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },
  settingItem: {
    minHeight: 58,
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
  settingItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  settingItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingItemValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 50,
  },
});
