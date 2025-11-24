import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

// Screens
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { CreateWalletScreen } from '../screens/CreateWalletScreen';
import { ImportWalletScreen } from '../screens/ImportWalletScreen';

// Navigators
import { TabNavigator } from './TabNavigator';

// Store
import { useWalletStore } from '../stores/walletStore';

// Theme
import colors from '../theme/colors';

export type RootStackParamList = {
  Welcome: undefined;
  CreateWallet: undefined;
  ImportWallet: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const { isWalletCreated, loadWallet } = useWalletStore();

  useEffect(() => {
    checkWallet();
  }, []);

  const checkWallet = async () => {
    try {
      await loadWallet();
    } catch (error) {
      console.error('Failed to load wallet:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.purple} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}>
        {!isWalletCreated ? (
          // Auth Stack
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen
              name="CreateWallet"
              component={CreateWalletScreen}
              options={{
                headerShown: true,
                title: 'Create Wallet',
                headerBackTitle: 'Back',
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.textPrimary,
              }}
            />
            <Stack.Screen
              name="ImportWallet"
              component={ImportWalletScreen}
              options={{
                headerShown: true,
                title: 'Import Wallet',
                headerBackTitle: 'Back',
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.textPrimary,
              }}
            />
          </>
        ) : (
          // Main App with Tabs
          <Stack.Screen name="Main" component={TabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
