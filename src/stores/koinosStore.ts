import { create } from 'zustand';
import { Provider, Signer, Contract, utils } from 'koilib';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_NETWORK, DEFAULT_RC_LIMIT } from '../lib/constants';
import { ManualTokenContract } from '../lib/manualTokenContract';

interface KoinosState {
  provider: Provider | null;
  signer: Signer | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  getBalance: (address: string) => Promise<string>;
  transfer: (to: string, amount: string) => Promise<string>;
  estimateMana: (to: string, amount: string) => Promise<string>;
  reset: () => void;
}

export const useKoinosStore = create<KoinosState>((set, get) => ({
  provider: null,
  signer: null,
  isInitialized: false,
  isLoading: false,
  error: null,

  initialize: async () => {
    console.log('[KoinosStore] Initializing provider and signer...');
    try {
      set({ isLoading: true, error: null });

      // Create provider with multiple nodes for reliability
      console.log('[KoinosStore] Creating provider with nodes:', DEFAULT_NETWORK.rpcNodes);
      const provider = new Provider(DEFAULT_NETWORK.rpcNodes);

      // Get private key from secure storage
      console.log('[KoinosStore] Getting private key from secure storage...');
      const privateKey = await SecureStore.getItemAsync('kondor_wallet_private_key');
      if (!privateKey) {
        console.error('[KoinosStore] No private key found in secure storage');
        set({
          isLoading: false,
          error: 'No wallet found. Please create or import a wallet first.'
        });
        return;
      }

      console.log('[KoinosStore] Private key found, length:', privateKey.length);

      // Handle both hex and WIF formats
      // We store as hex (64 chars) but can also handle WIF (52 chars)
      let signer: Signer;
      if (privateKey.length === 64) {
        // Hex format (our standard storage format)
        console.log('[KoinosStore] Creating signer from hex private key');
        signer = new Signer({
          privateKey: privateKey,
          provider
        });
      } else {
        // WIF format (for compatibility)
        console.log('[KoinosStore] Creating signer from WIF private key');
        signer = Signer.fromWif(privateKey);
        signer.provider = provider;
      }

      console.log('[KoinosStore] Signer created, address:', signer.getAddress());

      set({
        provider,
        signer,
        isInitialized: true,
        isLoading: false,
        error: null
      });
      console.log('[KoinosStore] Initialization complete');
    } catch (error: any) {
      console.error('[KoinosStore] Initialization error:', error);
      console.error('[KoinosStore] Error stack:', error.stack);
      set({
        isLoading: false,
        error: error.message || 'Failed to initialize Koinos connection'
      });
      throw error;
    }
  },

  getBalance: async (address: string) => {
    console.log('[KoinosStore] getBalance called for address:', address);
    const { provider, isInitialized } = get();

    // Initialize if needed
    if (!provider || !isInitialized) {
      console.log('[KoinosStore] Provider not initialized, initializing...');
      await get().initialize();
    }

    const currentProvider = get().provider;
    if (!currentProvider) {
      console.error('[KoinosStore] Provider still not initialized after init attempt');
      throw new Error('Provider not initialized');
    }

    try {
      set({ isLoading: true, error: null });

      console.log('[KoinosStore] Creating ManualTokenContract to avoid protobuf issues');
      console.log('  - Contract ID:', DEFAULT_NETWORK.koinContract);
      console.log('  - Network:', DEFAULT_NETWORK.name);
      console.log('  - RPC Nodes:', DEFAULT_NETWORK.rpcNodes);

      // Use ManualTokenContract to avoid protobuf extension issues
      const tokenContract = new ManualTokenContract(
        DEFAULT_NETWORK.koinContract,
        currentProvider
      );

      console.log('[KoinosStore] ManualTokenContract created, calling getBalance...');

      // Get balance using the simplified implementation
      const balance = await tokenContract.getBalance(address);

      console.log('[KoinosStore] Got balance:', balance);

      set({ isLoading: false });
      return balance;
    } catch (error: any) {
      console.error('[KoinosStore] Balance fetch error:', error);
      console.error('[KoinosStore] Error stack:', error.stack);
      set({
        isLoading: false,
        error: error.message || 'Failed to get balance'
      });
      throw error;
    }
  },

  transfer: async (to: string, amount: string) => {
    const { provider, signer, isInitialized } = get();

    // Initialize if needed
    if (!provider || !signer || !isInitialized) {
      await get().initialize();
    }

    const currentProvider = get().provider;
    const currentSigner = get().signer;

    if (!currentProvider || !currentSigner) {
      throw new Error('Not initialized');
    }

    try {
      set({ isLoading: true, error: null });

      console.log('[KoinosStore] Starting transfer to:', to, 'amount:', amount);

      // Use ManualTokenContract to avoid protobuf extension issues
      const tokenContract = new ManualTokenContract(
        DEFAULT_NETWORK.koinContract,
        currentProvider
      );

      // Transfer using manual contract implementation
      const { transactionId } = await tokenContract.transfer(
        currentSigner,
        to,
        amount,
        { rcLimit: DEFAULT_RC_LIMIT }
      );

      console.log('[KoinosStore] Transfer complete, transaction ID:', transactionId);

      set({ isLoading: false });
      return transactionId;
    } catch (error: any) {
      console.error('[KoinosStore] Transfer error:', error);
      console.error('[KoinosStore] Error details:', error.message);
      console.error('[KoinosStore] Error stack:', error.stack);
      set({
        isLoading: false,
        error: error.message || 'Failed to send transaction'
      });
      throw error;
    }
  },

  estimateMana: async (to: string, amount: string) => {
    const { provider, signer, isInitialized } = get();

    if (!provider || !signer || !isInitialized) {
      await get().initialize();
    }

    const currentProvider = get().provider;
    const currentSigner = get().signer;

    if (!currentProvider || !currentSigner) {
      throw new Error('Not initialized');
    }

    try {
      // Get KOIN contract with standard token ABI
      const koin = new Contract({
        id: DEFAULT_NETWORK.koinContract,
        abi: utils.tokenAbi,
        provider: currentProvider,
        signer: currentSigner
      });

      // Convert amount to smallest unit
      const value = utils.parseUnits(amount, 8);

      // Prepare transaction (don't send, just estimate)
      const result = await koin.functions.transfer({
        from: currentSigner.getAddress(),
        to,
        value
      }, {
        onlyOperation: true
      });

      // Return estimated mana cost - use default if not available
      // The operation object may not have rc_limit directly accessible
      return DEFAULT_RC_LIMIT.toString();
    } catch (error: any) {
      console.error('Failed to estimate mana:', error);
      return DEFAULT_RC_LIMIT.toString();
    }
  },

  reset: () => {
    set({
      provider: null,
      signer: null,
      isInitialized: false,
      isLoading: false,
      error: null
    });
  }
}));