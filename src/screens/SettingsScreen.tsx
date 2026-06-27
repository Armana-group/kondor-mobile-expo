import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsSection } from '../components/settings/SettingsSection';
import { useWalletStore } from '../stores/walletStore';
import { useNetworkStore } from '../stores/networkStore';
import colors from '../theme/colors';
import { layout } from '../theme/layout';

type SettingsItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  value?: string;
  destructive?: boolean;
};

type SettingsGroup = {
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

  const sections: SettingsGroup[] = [
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
        <AppHeader title="Settings" onBack={() => navigation.goBack()} />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {sections.map((section) => (
            <SettingsSection key={section.title} title={section.title}>
              {section.items.map((item, index) => {
                const color = item.destructive ? colors.error : colors.purple;

                return (
                  <SettingsRow
                    key={item.label}
                    label={item.label}
                    icon={item.icon}
                    iconColor={color}
                    value={item.value}
                    destructive={item.destructive}
                    onPress={item.onPress}
                    showSeparator={index < section.items.length - 1}
                  />
                );
              })}
            </SettingsSection>
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
  content: {
    flex: 1,
    paddingHorizontal: layout.screen.gutter,
  },
  contentContainer: {
    paddingBottom: layout.screen.bottomPadding,
  },
});
