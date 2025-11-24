import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createWalletFromMnemonic, validateMnemonic } from '../lib/wallet';
import { STORAGE_KEYS } from '../lib/constants';
import { requireBiometricAuth } from '../lib/biometrics';
import { HapticFeedback } from '../lib/haptics';

// Keys for secure storage
const MNEMONIC_KEY = 'kondor_wallet_mnemonic';
const PRIVATE_KEY = 'kondor_wallet_private_key';

interface WalletState {
  // Public data (stored in AsyncStorage)
  address: string;
  balance: string;
  isWalletCreated: boolean;

  // Actions
  createWallet: (mnemonic: string) => Promise<void>;
  importWallet: (mnemonic: string) => Promise<void>;
  loadWallet: () => Promise<boolean>;
  clearWallet: () => Promise<void>;
  updateBalance: (balance: string) => void;
  getPrivateKey: () => Promise<string | null>;
  getMnemonic: () => Promise<string | null>;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      address: '',
      balance: '0',
      isWalletCreated: false,

      createWallet: async (mnemonic: string) => {
        try {
          const { address, privateKey } = createWalletFromMnemonic(mnemonic);

          // Store sensitive data in SecureStore (encrypted)
          await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);
          await SecureStore.setItemAsync(PRIVATE_KEY, privateKey);

          // Store public data in state
          set({
            address,
            isWalletCreated: true
          });

          // Haptic feedback for successful wallet creation
          await HapticFeedback.walletCreated();
        } catch (error) {
          console.error('Failed to create wallet:', error);
          await HapticFeedback.error();
          throw error;
        }
      },

      importWallet: async (mnemonic: string) => {
        // Validate mnemonic first
        if (!validateMnemonic(mnemonic)) {
          throw new Error('Invalid mnemonic phrase');
        }
        // Same as create but with user-provided mnemonic
        return get().createWallet(mnemonic);
      },

      loadWallet: async () => {
        try {
          const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
          if (mnemonic) {
            const { address } = createWalletFromMnemonic(mnemonic);
            set({
              address,
              isWalletCreated: true
            });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Failed to load wallet:', error);
          return false;
        }
      },

      clearWallet: async () => {
        try {
          // Clear sensitive data from SecureStore
          await SecureStore.deleteItemAsync(MNEMONIC_KEY);
          await SecureStore.deleteItemAsync(PRIVATE_KEY);

          // Clear state
          set({
            address: '',
            balance: '0',
            isWalletCreated: false
          });
        } catch (error) {
          console.error('Failed to clear wallet:', error);
          throw error;
        }
      },

      updateBalance: (balance: string) => set({ balance }),

      getPrivateKey: async () => {
        try {
          // Require biometric authentication before accessing private key
          const authenticated = await requireBiometricAuth('access your private key');
          if (!authenticated) {
            console.log('Biometric authentication failed or was cancelled');
            return null;
          }
          return await SecureStore.getItemAsync(PRIVATE_KEY);
        } catch (error) {
          console.error('Failed to get private key:', error);
          return null;
        }
      },

      getMnemonic: async () => {
        try {
          // Require biometric authentication before accessing mnemonic
          const authenticated = await requireBiometricAuth('access your recovery phrase');
          if (!authenticated) {
            console.log('Biometric authentication failed or was cancelled');
            return null;
          }
          return await SecureStore.getItemAsync(MNEMONIC_KEY);
        } catch (error) {
          console.error('Failed to get mnemonic:', error);
          return null;
        }
      }
    }),
    {
      name: 'wallet-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        address: state.address,
        balance: state.balance,
        isWalletCreated: state.isWalletCreated
      }) // Only persist non-sensitive data
    }
  )
);