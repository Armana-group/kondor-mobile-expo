import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { inspectDAppOrigin, isRiskEscalation } from '../lib/dapp/originSecurity';
import { useDAppPermissionStore } from '../stores/dappPermissionStore';
import colors from '../theme/colors';

function truncateAddress(address: string): string {
  if (address.length <= 14) {
    return address;
  }
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

export const ConnectedSitesScreen = () => {
  const navigation = useNavigation<any>();
  const hasHydrated = useDAppPermissionStore((state) => state.hasHydrated);
  const grants = useDAppPermissionStore((state) => state.grants);
  const revokeGrant = useDAppPermissionStore((state) => state.revokeGrant);
  const revokeAllGrants = useDAppPermissionStore((state) => state.revokeAllGrants);

  const grantList = Object.values(grants).sort((left, right) => right.createdAt - left.createdAt);

  const handleRevoke = (origin: string, hostname: string) => {
    Alert.alert(
      'Disconnect Site',
      `Remove ${hostname} from your connected sites? It will need approval again before it can view your accounts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => revokeGrant(origin),
        },
      ]
    );
  };

  const handleRevokeAll = () => {
    Alert.alert(
      'Disconnect All Sites',
      'Remove every connected site? Each site will need approval again before it can view your accounts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect All',
          style: 'destructive',
          onPress: () => revokeAllGrants(),
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
          <Text style={styles.title}>Connected Sites</Text>
          <View style={styles.headerSpacer} />
        </View>

        {!hasHydrated ? (
          <View style={styles.centeredState}>
            <ActivityIndicator size="small" color={colors.purple} />
            <Text style={styles.stateText}>Loading connected sites...</Text>
          </View>
        ) : grantList.length === 0 ? (
          <View style={styles.centeredState}>
            <Ionicons name="globe-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No connected sites</Text>
            <Text style={styles.emptyText}>
              Sites you connect to will appear here.
            </Text>
          </View>
        ) : (
          <>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {grantList.map((grant) => {
                const riskChanged = isRiskEscalation(
                  grant.riskAtGrant,
                  inspectDAppOrigin(grant.origin).level
                );

                return (
                  <View key={grant.origin} style={styles.siteCard}>
                    <View style={styles.siteHeader}>
                      <View style={styles.siteIdentity}>
                        <Text style={styles.siteTitle}>{grant.hostname}</Text>
                        <Text style={styles.siteMeta}>
                          {grant.lifetime === 'session' ? 'Session only' : 'Saved connection'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.disconnectButton}
                        onPress={() => handleRevoke(grant.origin, grant.hostname)}
                      >
                        <Text style={styles.disconnectButtonText}>Disconnect</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.accountsLabel}>Shared accounts</Text>
                    {grant.accounts.map((account) => (
                      <Text key={`${grant.origin}-${account}`} style={styles.accountText}>
                        {truncateAddress(account)}
                      </Text>
                    ))}

                    <Text style={styles.siteMeta}>
                      Connected {new Date(grant.createdAt).toLocaleDateString()}
                    </Text>

                    {riskChanged ? (
                      <Text style={styles.riskChangedText}>
                        Risk changed since you connected. Kondor will ask again before sharing accounts.
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.disconnectAllButton} onPress={handleRevokeAll}>
                <Text style={styles.disconnectAllButtonText}>Disconnect All Sites</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  stateText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  siteCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  siteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  siteIdentity: {
    flex: 1,
    gap: 2,
  },
  siteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  siteMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  accountsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  accountText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  disconnectButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  disconnectButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  riskChangedText: {
    fontSize: 12,
    color: colors.warning,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  disconnectAllButton: {
    backgroundColor: colors.error,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  disconnectAllButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
