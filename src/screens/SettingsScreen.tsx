import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useWalletStore } from '../stores/walletStore';
import { useNetworkStore } from '../stores/networkStore';
import {
  isSendConfirmationRequired,
  setSendConfirmationRequired as persistSendConfirmationRequired,
} from '../services/auth';
import colors from '../theme/colors';

type SettingsItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  value?: string;
  helperText?: string;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
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
  const [sendConfirmationRequired, setSendConfirmationRequiredState] = useState(true);
  const networkLabel = hasHydrated
    ? networkMode === 'harbinger' ? 'Harbinger' : 'Mainnet'
    : 'Loading...';

  useEffect(() => {
    let mounted = true;

    void isSendConfirmationRequired()
      .then((required) => {
        if (mounted) {
          setSendConfirmationRequiredState(required);
        }
      })
      .catch(() => {
        if (mounted) {
          setSendConfirmationRequiredState(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updateSendConfirmationRequired = async (required: boolean) => {
    try {
      await persistSendConfirmationRequired(required);
      setSendConfirmationRequiredState(required);
    } catch {
      Alert.alert('Error', 'Failed to update send confirmation setting.');
    }
  };

  const handleSendConfirmationToggle = (nextRequired = !sendConfirmationRequired) => {
    if (nextRequired) {
      void updateSendConfirmationRequired(true);
      return;
    }

    Alert.alert(
      'Turn Off Send Confirmation?',
      'Anyone with access to your unlocked wallet can send tokens without biometric confirmation. Keep this on for the strongest protection.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn Off',
          style: 'destructive',
          onPress: () => updateSendConfirmationRequired(false),
        },
      ]
    );
  };

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
          label: 'Send confirmation',
          icon: 'shield-checkmark-outline',
          switchValue: sendConfirmationRequired,
          onSwitchChange: handleSendConfirmationToggle,
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
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </Pressable>
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
                    <Pressable
                      style={({ pressed }) => [
                        styles.settingItem,
                        item.onPress && pressed ? styles.pressed : null,
                      ]}
                      onPress={item.onPress}
                      accessibilityRole={item.onPress ? 'button' : undefined}
                    >
                      <View style={styles.settingItemLeft}>
                        <Ionicons name={item.icon} size={22} color={color} />
                        <View style={styles.settingItemLabelWrap}>
                          <Text style={[styles.settingItemText, { color: textColor }]}>
                            {item.label}
                          </Text>
                          {item.helperText ? (
                            <Text style={styles.settingItemHelper}>{item.helperText}</Text>
                          ) : null}
                        </View>
                      </View>

                      {item.switchValue !== undefined ? (
                        <Switch
                          accessibilityLabel={item.label}
                          value={item.switchValue}
                          onValueChange={item.onSwitchChange}
                          trackColor={{
                            false: colors.border,
                            true: colors.purple,
                          }}
                          thumbColor={colors.textPrimary}
                          ios_backgroundColor={colors.border}
                        />
                      ) : item.value ? (
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
                    </Pressable>
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
  pressed: {
    opacity: 0.65,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  settingItemLabelWrap: {
    flex: 1,
  },
  settingItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  settingItemHelper: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.warning,
    marginTop: 3,
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
