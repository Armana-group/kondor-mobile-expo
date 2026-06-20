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
import { Screen } from '../components/Screen';
import { type NetworkMode, useNetworkStore } from '../stores/networkStore';
import colors from '../theme/colors';

type NetworkRow = {
  mode: NetworkMode;
  label: string;
  description: string;
};

const NETWORK_OPTIONS: NetworkRow[] = [
  {
    mode: 'mainnet',
    label: 'Mainnet',
    description: 'Production network for live wallet balances, tokens, and activity.',
  },
  {
    mode: 'harbinger',
    label: 'Harbinger',
    description: 'Test network for non-production app and dApp flows.',
  },
];

export const NetworkSettingsScreen = () => {
  const navigation = useNavigation<any>();
  const mode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const setMode = useNetworkStore((state) => state.setMode);
  const [isSwitching, setIsSwitching] = useState(false);
  const currentLabel = mode === 'harbinger' ? 'Harbinger' : 'Mainnet';
  const isInteractionDisabled = isSwitching || !hasHydrated;

  const confirmSwitch = (target: NetworkRow) => {
    if (!hasHydrated || target.mode === mode || isSwitching) {
      return;
    }

    Alert.alert(
      'Switch Network',
      `Switch from ${currentLabel} to ${target.label}? Balances, token lists, history, and connected sessions will refresh for the selected network.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            setIsSwitching(true);
            try {
              await setMode(target.mode);
            } finally {
              setIsSwitching(false);
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
          <Text style={styles.title}>Network</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Current network</Text>
            <Text style={styles.summaryValue}>{hasHydrated ? currentLabel : 'Loading...'}</Text>
            <Text style={styles.summaryBody}>
              Mainnet and Harbinger are the only supported networks in this parity pass.
            </Text>
          </View>

          <View style={styles.section}>
            {NETWORK_OPTIONS.map((option, index) => {
              const isCurrent = hasHydrated && option.mode === mode;
              const statusLabel = hasHydrated
                ? isCurrent ? 'Current' : 'Available'
                : 'Loading...';

              return (
                <React.Fragment key={option.mode}>
                  <TouchableOpacity
                    style={[styles.networkRow, isInteractionDisabled && styles.networkRowDisabled]}
                    onPress={() => confirmSwitch(option)}
                    disabled={isInteractionDisabled}
                  >
                    <View style={styles.networkLeft}>
                      <Ionicons
                        name={isCurrent ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={isCurrent ? colors.purple : colors.textTertiary}
                      />
                      <View style={styles.networkCopy}>
                        <Text style={styles.networkLabel}>{option.label}</Text>
                        <Text style={styles.networkDescription}>{option.description}</Text>
                      </View>
                    </View>

                    <View style={styles.networkStatus}>
                      <Text style={[styles.statusBadge, isCurrent && styles.statusBadgeActive]}>
                        {statusLabel}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {index < NETWORK_OPTIONS.length - 1 && <View style={styles.separator} />}
                </React.Fragment>
              );
            })}
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
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 6,
  },
  summaryBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: 8,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
  },
  networkRow: {
    minHeight: 86,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  networkRowDisabled: {
    opacity: 0.7,
  },
  networkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  networkCopy: {
    flex: 1,
  },
  networkLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  networkDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 4,
  },
  networkStatus: {
    marginLeft: 12,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statusBadgeActive: {
    color: colors.purple,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 50,
  },
});
