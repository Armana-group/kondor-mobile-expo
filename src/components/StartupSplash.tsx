import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import colors from '../theme/colors';

const nativeSplash = require('../../assets/kondor-native-splash.png');

export function StartupSplash() {
  return (
    <View
      testID="startup-splash"
      accessibilityRole="summary"
      accessibilityLabel="Kondor Wallet is starting"
      style={styles.container}>
      <Image
        testID="startup-splash-composite"
        source={nativeSplash}
        style={styles.composite}
        resizeMode="contain"
      />
      <ActivityIndicator size="small" color={colors.purple} style={styles.loadingIndicator} />
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
  composite: {
    width: 320,
    height: 320,
  },
  loadingIndicator: {
    marginTop: 8,
  },
});
