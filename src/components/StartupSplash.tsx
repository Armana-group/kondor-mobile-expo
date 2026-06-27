import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import colors from '../theme/colors';

const splashLogo = require('../../assets/splash-icon.png');

export function StartupSplash() {
  return (
    <View
      testID="startup-splash"
      accessibilityRole="summary"
      accessibilityLabel="Kondor Wallet is starting"
      style={styles.container}>
      <View style={styles.markStage}>
        <View style={styles.outerHalo} />
        <View style={styles.innerHalo} />
        <View style={styles.logoRing}>
          <Image
            testID="startup-splash-logo"
            source={splashLogo}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      </View>

      <Text style={styles.title}>Kondor Wallet</Text>

      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.purple} />
        <Text style={styles.status}>Securing wallet</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 32,
  },
  markStage: {
    width: 216,
    height: 216,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  outerHalo: {
    position: 'absolute',
    width: 216,
    height: 216,
    borderRadius: 108,
    backgroundColor: 'rgba(112, 97, 239, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(112, 97, 239, 0.14)',
  },
  innerHalo: {
    position: 'absolute',
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: 'rgba(112, 97, 239, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(112, 97, 239, 0.28)',
  },
  logoRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: colors.purple,
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  logo: {
    width: 92,
    height: 92,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
  },
  loadingRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  status: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0,
  },
});
