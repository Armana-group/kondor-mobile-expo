import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppState } from 'react-native';

// Screens
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { CreateWalletScreen } from '../screens/CreateWalletScreen';
import { ImportWalletScreen } from '../screens/ImportWalletScreen';
import { LockScreen } from '../screens/LockScreen';
import { SetupPinScreen } from '../screens/SetupPinScreen';
import { StartupSplash } from '../components/StartupSplash';

// Navigators
import { TabNavigator } from './TabNavigator';

// Store
import { useWalletStore } from '../stores/walletStore';

// Services
import { isPinEnabled } from '../services/auth';
import { walletLogger } from '../lib/logger';

// Theme
import colors from '../theme/colors';

export type RootStackParamList = {
  Welcome: undefined;
  CreateWallet: undefined;
  ImportWallet: undefined;
  SetupPin: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const { isWalletCreated, loadWallet } = useWalletStore();

  useEffect(() => {
    const checkWallet = async () => {
      try {
        await loadWallet();
        const pinIsEnabled = await isPinEnabled();
        setPinEnabled(pinIsEnabled);
        setIsLocked(pinIsEnabled);
      } catch (error) {
        walletLogger.error('Failed to load wallet:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkWallet();
  }, [loadWallet]);

  // Re-lock when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' && pinEnabled) {
        setIsLocked(true);
      }
    });
    return () => subscription.remove();
  }, [pinEnabled]);

  const handleUnlock = () => {
    setIsLocked(false);
  };

  const handleLock = () => {
    setIsLocked(true);
  };

  const handlePinSetupComplete = async () => {
    setPinEnabled(true);
    // Don't lock immediately — user just set it up
  };

  if (isLoading) {
    return <StartupSplash />;
  }

  // Show lock screen if PIN is enabled and app is locked
  if (isLocked && pinEnabled && isWalletCreated) {
    return <LockScreen onUnlock={handleUnlock} />;
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
        ) : !pinEnabled ? (
          // PIN Setup required after wallet creation
          <Stack.Screen name="SetupPin">
            {() => <SetupPinScreen onComplete={handlePinSetupComplete} />}
          </Stack.Screen>
        ) : (
          // Main App with Tabs
          <Stack.Screen name="Main">
            {() => <TabNavigator onLockWallet={handleLock} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
