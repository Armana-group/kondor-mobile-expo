import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';

export const WelcomeScreen = () => {
  const navigation = useNavigation<any>();

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logo}>K</Text>
          </View>
          <Text style={styles.title}>Kondor Mobile</Text>
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
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
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
    color: '#999',
  },
});