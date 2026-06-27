import React, { useCallback, useEffect, useState } from 'react';
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
import { Screen } from '../components/Screen';
import { MAINNET, TESTNET } from '../lib/constants';
import {
  checkNetworkHealth,
  type NetworkHealthStatus,
  type NetworkHealthSummary,
} from '../services/networkHealth';
import { type NetworkMode, useNetworkStore } from '../stores/networkStore';
import colors from '../theme/colors';

type NetworkRow = {
  mode: NetworkMode;
  label: string;
  description: string;
  rpcNodes: string[];
};

const NETWORK_OPTIONS: NetworkRow[] = [
  {
    mode: 'mainnet',
    label: 'Mainnet',
    description: 'Production network for live wallet balances, tokens, and activity.',
    rpcNodes: MAINNET.rpcNodes,
  },
  {
    mode: 'harbinger',
    label: 'Harbinger',
    description: 'Test network for non-production app and dApp flows.',
    rpcNodes: TESTNET.rpcNodes,
  },
];

type HealthByMode = Record<NetworkMode, {
  isChecking: boolean;
  summary?: NetworkHealthSummary;
  error?: string;
}>;

function createInitialHealthState(): HealthByMode {
  return {
    mainnet: { isChecking: false },
    harbinger: { isChecking: false },
  };
}

function getHealthLabel(status?: NetworkHealthStatus): string {
  if (status === 'online') {
    return 'Online';
  }
  if (status === 'degraded') {
    return 'Slow';
  }
  if (status === 'unavailable') {
    return 'Unavailable';
  }

  return 'Checking';
}

function getReachabilityCopy(summary?: NetworkHealthSummary, isChecking?: boolean, error?: string): string {
  if (isChecking) {
    return 'Checking network health...';
  }
  if (error) {
    return 'Health check failed. Try refreshing.';
  }
  if (!summary) {
    return 'Health has not been checked yet.';
  }
  if (summary.totalCount === 0) {
    return 'No network nodes configured';
  }

  return `${summary.healthyCount} of ${summary.totalCount} nodes reachable`;
}

function getLastCheckedCopy(summary?: NetworkHealthSummary): string | null {
  if (!summary?.checkedAt) {
    return null;
  }

  return `Last checked ${new Date(summary.checkedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export const NetworkSettingsScreen = () => {
  const navigation = useNavigation<any>();
  const mode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const setMode = useNetworkStore((state) => state.setMode);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthByMode, setHealthByMode] = useState<HealthByMode>(() => createInitialHealthState());
  const currentLabel = mode === 'harbinger' ? 'Harbinger' : 'Mainnet';
  const currentHealth = healthByMode[mode];

  const refreshHealth = useCallback(async () => {
    if (!hasHydrated) {
      return;
    }

    setIsCheckingHealth(true);
    setHealthByMode((previous) => ({
      mainnet: { ...previous.mainnet, isChecking: true, error: undefined },
      harbinger: { ...previous.harbinger, isChecking: true, error: undefined },
    }));

    const entries = await Promise.all(
      NETWORK_OPTIONS.map(async (option) => {
        try {
          const { summary } = await checkNetworkHealth(option.rpcNodes);
          return [option.mode, { isChecking: false, summary }] as const;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to check network health';
          return [option.mode, { isChecking: false, error: message }] as const;
        }
      })
    );

    setHealthByMode({
      mainnet: entries.find(([networkMode]) => networkMode === 'mainnet')?.[1] ?? { isChecking: false },
      harbinger: entries.find(([networkMode]) => networkMode === 'harbinger')?.[1] ?? { isChecking: false },
    });
    setIsCheckingHealth(false);
  }, [hasHydrated]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const confirmSwitch = (target: NetworkRow) => {
    if (!hasHydrated || target.mode === mode || isSwitching) {
      return;
    }

    const targetHealth = healthByMode[target.mode];
    if (targetHealth.isChecking || !targetHealth.summary) {
      Alert.alert(
        'Checking Network',
        `Kondor is checking ${target.label}. Try again in a moment.`,
        [{ text: 'OK' }]
      );
      return;
    }

    if (targetHealth.summary.status === 'unavailable') {
      Alert.alert(
        'Network Unavailable',
        `Kondor cannot reach ${target.label} right now. Try again after the network is reachable.`,
        [{ text: 'OK' }]
      );
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
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={28} color={colors.purple} />
          </Pressable>
          <Text style={styles.title}>Network</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Selected network</Text>
            <Text style={styles.summaryValue}>{hasHydrated ? currentLabel : 'Loading...'}</Text>
            <Text style={styles.summaryBody}>
              {hasHydrated
                ? `${currentLabel} is selected. ${getReachabilityCopy(
                  currentHealth?.summary,
                  currentHealth?.isChecking,
                  currentHealth?.error
                )}.`
                : 'Loading network settings...'}
            </Text>
          </View>

          <View style={styles.healthHeader}>
            <View style={styles.healthHeaderCopy}>
              <Text style={styles.sectionTitle}>Network health</Text>
              <Text style={styles.sectionBody}>
                Kondor checks whether each network can be reached before switching.
              </Text>
            </View>
            <Pressable
              style={[styles.refreshButton, (!hasHydrated || isCheckingHealth) && styles.refreshButtonDisabled]}
              onPress={refreshHealth}
              disabled={!hasHydrated || isCheckingHealth}
            >
              <Ionicons name="refresh" size={16} color={colors.purple} />
              <Text style={styles.refreshButtonText}>Refresh health</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            {NETWORK_OPTIONS.map((option, index) => {
              const isCurrent = hasHydrated && option.mode === mode;
              const health = healthByMode[option.mode];
              const statusLabel = hasHydrated ? getHealthLabel(health.summary?.status) : 'Loading...';
              const lastChecked = getLastCheckedCopy(health.summary);
              const isHealthPending = health.isChecking || !health.summary;
              const isHealthUnavailable = Boolean(health.error)
                || health.summary?.status === 'unavailable';
              const isRowSelectable = hasHydrated
                && !isSwitching
                && !isCheckingHealth
                && !isCurrent
                && !isHealthPending;
              const shouldDimRow = !hasHydrated
                || isSwitching
                || isHealthPending
                || isHealthUnavailable;

              return (
                <React.Fragment key={option.mode}>
                  <Pressable
                    style={[styles.networkRow, shouldDimRow && styles.networkRowDisabled]}
                    onPress={() => confirmSwitch(option)}
                    disabled={!isRowSelectable}
                  >
                    <View style={styles.networkLeft}>
                      <Ionicons
                        name={isCurrent ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={isCurrent ? colors.purple : colors.textTertiary}
                        style={styles.networkIcon}
                      />
                      <View style={styles.networkCopy}>
                        <Text style={styles.networkLabel}>{option.label}</Text>
                        <Text style={styles.networkDescription}>{option.description}</Text>
                        <Text style={styles.reachabilityText}>
                          {hasHydrated
                            ? getReachabilityCopy(health.summary, health.isChecking, health.error)
                            : 'Loading...'}
                        </Text>
                        {lastChecked && <Text style={styles.lastCheckedText}>{lastChecked}</Text>}
                      </View>
                    </View>

                    <View style={styles.networkStatus}>
                      {isCurrent && <Text style={styles.selectedBadge}>Selected</Text>}
                      <Text style={[
                        styles.statusBadge,
                        health.summary?.status === 'online' && styles.statusBadgeOnline,
                        health.summary?.status === 'degraded' && styles.statusBadgeSlow,
                        health.summary?.status === 'unavailable' && styles.statusBadgeUnavailable,
                      ]}>
                        {statusLabel}
                      </Text>
                    </View>
                  </Pressable>
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
  contentContainer: {
    paddingBottom: 28,
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
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  healthHeaderCopy: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 3,
  },
  refreshButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.purple,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  networkRow: {
    minHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  networkRowDisabled: {
    opacity: 0.7,
  },
  networkLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 12,
  },
  networkIcon: {
    marginTop: 2,
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
  reachabilityText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
    marginTop: 10,
  },
  lastCheckedText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textTertiary,
    marginTop: 3,
  },
  networkStatus: {
    marginLeft: 12,
    minWidth: 84,
    alignItems: 'flex-end',
    gap: 6,
  },
  selectedBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.purple,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  statusBadgeOnline: {
    color: colors.success,
  },
  statusBadgeSlow: {
    color: colors.warning,
  },
  statusBadgeUnavailable: {
    color: colors.error,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 50,
  },
});
