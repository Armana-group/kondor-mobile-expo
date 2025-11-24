// Alternative implementation using direct RPC calls to bypass protobuf issues
import { create } from 'zustand';
import { Provider, Signer, utils } from 'koilib';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_NETWORK, DEFAULT_RC_LIMIT } from '../lib/constants';

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
      let signer: Signer;
      if (privateKey.length === 64) {
        console.log('[KoinosStore] Creating signer from hex private key');
        signer = new Signer({
          privateKey: privateKey,
          provider
        });
      } else {
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

      console.log('[KoinosStore] Making direct RPC call for balance');
      console.log('  - Contract ID:', DEFAULT_NETWORK.koinContract);
      console.log('  - Address:', address);

      // Encode the address for the RPC call
      // balanceOf entry point is 0x5c721497 (1550980247 in decimal)
      const addressBytes = utils.decodeBase58(address);

      // Create the arguments object manually
      const args = {
        owner: addressBytes
      };

      // Encode the arguments
      const encodedArgs = utils.encodeBase64url(
        new Uint8Array(Buffer.from(JSON.stringify(args)))
      );

      console.log('[KoinosStore] Calling read_contract with encoded args');

      // Make direct RPC call
      const result = await currentProvider.call('chain.read_contract', {
        contract_id: DEFAULT_NETWORK.koinContract,
        entry_point: 1550980247, // balanceOf entry point
        args: encodedArgs
      });

      console.log('[KoinosStore] RPC result:', result);

      // Parse the result
      let balance = '0';
      if (result && result.result) {
        try {
          const decoded = utils.decodeBase64url(result.result);
          console.log('[KoinosStore] Decoded result:', decoded);

          // The result should contain the balance value
          // Try to parse it as a simple value
          if (decoded && decoded.value) {
            balance = utils.formatUnits(decoded.value.toString(), 8);
          } else if (typeof decoded === 'string' || typeof decoded === 'number') {
            balance = utils.formatUnits(decoded.toString(), 8);
          }
        } catch (decodeError) {
          console.error('[KoinosStore] Failed to decode result:', decodeError);
          // Try alternative parsing
          balance = '0';
        }
      }

      console.log('[KoinosStore] Formatted balance:', balance);

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
    console.log('[KoinosStore] Transfer not yet implemented with direct RPC');
    throw new Error('Transfer not yet implemented with direct RPC');
  },

  estimateMana: async (to: string, amount: string) => {
    return DEFAULT_RC_LIMIT.toString();
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