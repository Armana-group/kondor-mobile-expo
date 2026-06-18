import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createWalletFromMnemonic, createWalletFromPrivateKey, validateMnemonic } from '../lib/wallet';
import { requireBiometricAuth } from '../lib/biometrics';
import { HapticFeedback } from '../lib/haptics';
import { walletLogger as log } from '../lib/logger';

// Keys for secure storage
const MNEMONIC_KEY = 'kondor_wallet_mnemonic';
const PRIVATE_KEY_PREFIX = 'kondor_pk_'; // For imported accounts: kondor_pk_{accountId}
const LEGACY_PRIVATE_KEY = 'kondor_wallet_private_key'; // Legacy single-account key

// Account interface
export interface Account {
  id: string;
  name: string;
  address: string;
  derivationIndex: number; // HD derivation index, -1 for imported accounts
  isImported: boolean;
}

interface WalletState {
  // Account data (stored in AsyncStorage)
  accounts: Account[];
  activeAccountId: string;
  nextDerivationIndex: number; // Track next HD index to use

  // Computed values
  address: string; // Current active account address (for backward compatibility)
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

  // Multi-account actions
  addAccount: (name?: string) => Promise<Account>;
  importAccountFromPrivateKey: (privateKey: string, name?: string) => Promise<Account>;
  switchAccount: (accountId: string) => void;
  renameAccount: (accountId: string, name: string) => void;
  removeAccount: (accountId: string) => Promise<boolean>;
  getActiveAccount: () => Account | undefined;
}

// Generate a unique ID
const generateId = async (): Promise<string> => {
  const randomBytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountId: '',
      nextDerivationIndex: 0,
      address: '',
      balance: '0',
      isWalletCreated: false,

      createWallet: async (mnemonic: string) => {
        try {
          // Create first account from mnemonic
          const { address, privateKey } = createWalletFromMnemonic(mnemonic, 0);
          const accountId = await generateId();

          const firstAccount: Account = {
            id: accountId,
            name: 'Account 1',
            address,
            derivationIndex: 0,
            isImported: false,
          };

          // Store mnemonic in SecureStore (encrypted)
          // Private keys are derived on-demand from mnemonic — not cached
          await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);

          set({
            accounts: [firstAccount],
            activeAccountId: accountId,
            nextDerivationIndex: 1,
            address,
            isWalletCreated: true,
          });

          await HapticFeedback.walletCreated();
        } catch (error) {
          log.error('Failed to create wallet:', error);
          await HapticFeedback.error();
          throw error;
        }
      },

      importWallet: async (mnemonic: string) => {
        if (!validateMnemonic(mnemonic)) {
          throw new Error('Invalid mnemonic phrase');
        }
        return get().createWallet(mnemonic);
      },

      loadWallet: async () => {
        try {
          const { accounts, activeAccountId } = get();

          // If we have accounts, just verify the mnemonic exists
          if (accounts.length > 0 && activeAccountId) {
            const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
            if (mnemonic) {
              // Find active account and set address
              const activeAccount = accounts.find(a => a.id === activeAccountId);
              if (activeAccount) {
                set({ address: activeAccount.address, isWalletCreated: true });
                return true;
              }
            }
          }

          // Fallback: Try to load from legacy storage (migration)
          const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
          if (mnemonic) {
            const { address, privateKey } = createWalletFromMnemonic(mnemonic, 0);
            const accountId = await generateId();

            const migratedAccount: Account = {
              id: accountId,
              name: 'Account 1',
              address,
              derivationIndex: 0,
              isImported: false,
            };

            // Private key derived on-demand from mnemonic — not cached

            set({
              accounts: [migratedAccount],
              activeAccountId: accountId,
              nextDerivationIndex: 1,
              address,
              isWalletCreated: true,
            });

            return true;
          }

          return false;
        } catch (error) {
          log.error('Failed to load wallet:', error);
          return false;
        }
      },

      clearWallet: async () => {
        try {
          const { accounts } = get();

          // Clear mnemonic
          await SecureStore.deleteItemAsync(MNEMONIC_KEY);
          await SecureStore.deleteItemAsync(LEGACY_PRIVATE_KEY);

          // Clear all account private keys
          for (const account of accounts) {
            await SecureStore.deleteItemAsync(`${PRIVATE_KEY_PREFIX}${account.id}`);
          }

          set({
            accounts: [],
            activeAccountId: '',
            nextDerivationIndex: 0,
            address: '',
            balance: '0',
            isWalletCreated: false,
          });
        } catch (error) {
          log.error('Failed to clear wallet:', error);
          throw error;
        }
      },

      updateBalance: (balance: string) => set({ balance }),

      getPrivateKey: async () => {
        try {
          const authenticated = await requireBiometricAuth('access your private key');
          if (!authenticated) {
            log.debug('Biometric authentication failed or was cancelled');
            return null;
          }

          const { activeAccountId, accounts } = get();
          const activeAccount = accounts.find(a => a.id === activeAccountId);

          if (!activeAccount) {
            // Fallback to legacy key
            return await SecureStore.getItemAsync(LEGACY_PRIVATE_KEY);
          }

          // Try account-specific key first
          let privateKey = await SecureStore.getItemAsync(`${PRIVATE_KEY_PREFIX}${activeAccountId}`);

          // If not found and it's an HD account, derive from mnemonic
          if (!privateKey && !activeAccount.isImported) {
            const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
            if (mnemonic) {
              const wallet = createWalletFromMnemonic(mnemonic, activeAccount.derivationIndex);
              privateKey = wallet.privateKey;
              // Derived on-demand — not cached in SecureStore
            }
          }

          return privateKey;
        } catch (error) {
          log.error('Failed to get private key:', error);
          return null;
        }
      },

      getMnemonic: async () => {
        try {
          const authenticated = await requireBiometricAuth('access your recovery phrase');
          if (!authenticated) {
            log.debug('Biometric authentication failed or was cancelled');
            return null;
          }
          return await SecureStore.getItemAsync(MNEMONIC_KEY);
        } catch (error) {
          log.error('Failed to get mnemonic:', error);
          return null;
        }
      },

      // Multi-account methods
      addAccount: async (name?: string) => {
        const { nextDerivationIndex, accounts } = get();

        // Require biometric auth
        const authenticated = await requireBiometricAuth('create a new account');
        if (!authenticated) {
          throw new Error('Authentication required');
        }

        // Get mnemonic to derive new account
        const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
        if (!mnemonic) {
          throw new Error('No mnemonic found');
        }

        // Derive new account
        const { address, privateKey } = createWalletFromMnemonic(mnemonic, nextDerivationIndex);
        const accountId = await generateId();
        const accountName = name || `Account ${accounts.length + 1}`;

        const newAccount: Account = {
          id: accountId,
          name: accountName,
          address,
          derivationIndex: nextDerivationIndex,
          isImported: false,
        };

        // HD account keys are derived on-demand from mnemonic — not cached

        set({
          accounts: [...accounts, newAccount],
          nextDerivationIndex: nextDerivationIndex + 1,
        });

        await HapticFeedback.success();
        return newAccount;
      },

      importAccountFromPrivateKey: async (privateKey: string, name?: string) => {
        const { accounts } = get();

        // Require biometric auth
        const authenticated = await requireBiometricAuth('import an account');
        if (!authenticated) {
          throw new Error('Authentication required');
        }

        // Create wallet from private key
        const wallet = createWalletFromPrivateKey(privateKey);

        // Check if this address already exists
        const existingAccount = accounts.find(a => a.address === wallet.address);
        if (existingAccount) {
          throw new Error('This account is already in your wallet');
        }

        const accountId = await generateId();
        const accountName = name || `Imported ${accounts.length + 1}`;

        const newAccount: Account = {
          id: accountId,
          name: accountName,
          address: wallet.address,
          derivationIndex: -1, // -1 indicates imported
          isImported: true,
        };

        // Store private key
        await SecureStore.setItemAsync(`${PRIVATE_KEY_PREFIX}${accountId}`, wallet.privateKey);

        set({
          accounts: [...accounts, newAccount],
        });

        await HapticFeedback.success();
        return newAccount;
      },

      switchAccount: (accountId: string) => {
        const { accounts } = get();
        const account = accounts.find(a => a.id === accountId);

        if (account) {
          set({
            activeAccountId: accountId,
            address: account.address,
            balance: '0', // Reset balance, will be refreshed
          });
          HapticFeedback.selection();
        }
      },

      renameAccount: (accountId: string, name: string) => {
        const { accounts } = get();
        const updatedAccounts = accounts.map(a =>
          a.id === accountId ? { ...a, name } : a
        );
        set({ accounts: updatedAccounts });
      },

      removeAccount: async (accountId: string) => {
        const { accounts, activeAccountId } = get();

        // Cannot remove the last account
        if (accounts.length <= 1) {
          throw new Error('Cannot remove the last account');
        }

        // Require biometric auth
        const authenticated = await requireBiometricAuth('remove this account');
        if (!authenticated) {
          return false;
        }

        // Remove private key from secure storage
        await SecureStore.deleteItemAsync(`${PRIVATE_KEY_PREFIX}${accountId}`);

        const updatedAccounts = accounts.filter(a => a.id !== accountId);

        // If removing active account, switch to first remaining account
        let newActiveId = activeAccountId;
        let newAddress = get().address;

        if (activeAccountId === accountId) {
          newActiveId = updatedAccounts[0].id;
          newAddress = updatedAccounts[0].address;
        }

        set({
          accounts: updatedAccounts,
          activeAccountId: newActiveId,
          address: newAddress,
          balance: '0',
        });

        await HapticFeedback.success();
        return true;
      },

      getActiveAccount: () => {
        const { accounts, activeAccountId } = get();
        return accounts.find(a => a.id === activeAccountId);
      },
    }),
    {
      name: 'wallet-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        accounts: state.accounts,
        activeAccountId: state.activeAccountId,
        nextDerivationIndex: state.nextDerivationIndex,
        address: state.address,
        balance: state.balance,
        isWalletCreated: state.isWalletCreated,
      }),
    }
  )
);
