import 'react-native-gesture-handler';
import './src/lib/crypto';
import { setupCrypto } from './src/lib/crypto';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';

// WalletConnect is currently disabled due to bundler compatibility issues
// import { WalletConnectHandler } from './src/components/WalletConnectHandler';

// Initialize crypto polyfills
setupCrypto();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppNavigator />
      {/* WalletConnectHandler disabled until bundler issues resolved */}
    </SafeAreaProvider>
  );
}