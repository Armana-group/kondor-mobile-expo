import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { colors } from '../theme/colors';

export const WelcomeScreen = () => {
  const navigation = useNavigation<any>();

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/splash-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Kondor</Text>
          <Text style={styles.subtitle}>
            Your gateway to the Koinos blockchain
          </Text>
        </View>

        <View style={styles.buttons}>
          <Button
            title="Create New Wallet"
            onPress={() => navigation.navigate('CreateWallet')}
            style={styles.button}
          />
          <Button
            title="Import Existing Wallet"
            onPress={() => navigation.navigate('ImportWallet')}
            variant="secondary"
            style={styles.button}
          />
        </View>

        <Text style={styles.version}>Version 1.0.0</Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  buttons: {
    width: '100%',
  },
  button: {
    marginBottom: 12,
  },
  version: {
    fontSize: 12,
    color: colors.textTertiary,
  },
});