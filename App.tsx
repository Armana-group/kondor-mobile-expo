import 'react-native-gesture-handler';
import './src/lib/crypto';
import { setupCrypto } from './src/lib/crypto';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';

// Initialize crypto polyfills
setupCrypto();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}