import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '../components/Screen';
import colors from '../theme/colors';

export const BrowserScreen = () => {
  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🌐</Text>
        </View>
        <Text style={styles.title}>Browser</Text>
        <Text style={styles.subtitle}>Coming Soon</Text>
        <Text style={styles.description}>
          Browse and interact with dApps on the Koinos blockchain.
        </Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: colors.background,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.purple,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
