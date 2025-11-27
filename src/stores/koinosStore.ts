import { create } from 'zustand';
import { Provider, Signer, Contract, utils } from 'koilib';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_NETWORK, DEFAULT_RC_LIMIT } from '../lib/constants';
import { ManualTokenContract } from '../lib/manualTokenContract';
import { koinosLogger as log } from '../lib/logger';

interface KoinosState {
  provider: Provider | null;
  signer: Signer | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  getBalance: (address: string) => Promise<string>;
  getMana: (address: string) => Promise<{ current: string; reserved: string; available: string; max: string; percentage: number; availablePercentage: number }>;
  transfer: (to: string, amount: string) => Promise<string>;
  transferToken: (contractId: string, to: string, amount: string, decimals: number) => Promise<string>;
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
    log.debug(' Initializing provider and signer...');
    try {
      set({ isLoading: true, error: null });

      // Create provider with multiple nodes for reliability
      log.debug(' Creating provider with nodes:', DEFAULT_NETWORK.rpcNodes);
      const provider = new Provider(DEFAULT_NETWORK.rpcNodes);

      // Get private key from secure storage
      // Try new per-account key first, then fall back to legacy key
      log.debug(' Getting private key from secure storage...');

      // Import the wallet store to get active account
      const { useWalletStore } = await import('./walletStore');
      const { activeAccountId } = useWalletStore.getState();

      let privateKey: string | null = null;

      // Try account-specific key first
      if (activeAccountId) {
        privateKey = await SecureStore.getItemAsync(`kondor_pk_${activeAccountId}`);
        log.debug(' Tried account-specific key:', privateKey ? 'found' : 'not found');
      }

      // Fallback to legacy key
      if (!privateKey) {
        privateKey = await SecureStore.getItemAsync('kondor_wallet_private_key');
        log.debug(' Tried legacy key:', privateKey ? 'found' : 'not found');
      }

      if (!privateKey) {
        log.error(' No private key found in secure storage');
        set({
          isLoading: false,
          error: 'No wallet found. Please create or import a wallet first.'
        });
        return;
      }

      log.debug(' Private key found, length:', privateKey.length);

      // Handle both hex and WIF formats
      // We store as hex (64 chars) but can also handle WIF (52 chars)
      let signer: Signer;
      if (privateKey.length === 64) {
        // Hex format (our standard storage format)
        log.debug(' Creating signer from hex private key');
        signer = new Signer({
          privateKey: privateKey,
          provider
        });
      } else {
        // WIF format (for compatibility)
        log.debug(' Creating signer from WIF private key');
        signer = Signer.fromWif(privateKey);
        signer.provider = provider;
      }

      log.debug(' Signer created, address:', signer.getAddress());

      set({
        provider,
        signer,
        isInitialized: true,
        isLoading: false,
        error: null
      });
      log.debug(' Initialization complete');
    } catch (error: any) {
      log.error(' Initialization error:', error);
      log.error(' Error stack:', error.stack);
      set({
        isLoading: false,
        error: error.message || 'Failed to initialize Koinos connection'
      });
      throw error;
    }
  },

  getBalance: async (address: string) => {
    log.debug(' getBalance called for address:', address);
    const { provider, isInitialized } = get();

    // Initialize if needed
    if (!provider || !isInitialized) {
      log.debug(' Provider not initialized, initializing...');
      await get().initialize();
    }

    const currentProvider = get().provider;
    if (!currentProvider) {
      log.error(' Provider still not initialized after init attempt');
      throw new Error('Provider not initialized');
    }

    try {
      set({ isLoading: true, error: null });

      log.debug(' Creating ManualTokenContract to avoid protobuf issues');
      log.debug('Contract ID:', DEFAULT_NETWORK.koinContract);
      log.debug('Network:', DEFAULT_NETWORK.name);
      log.debug('RPC Nodes:', DEFAULT_NETWORK.rpcNodes);

      // Use ManualTokenContract to avoid protobuf extension issues
      const tokenContract = new ManualTokenContract(
        DEFAULT_NETWORK.koinContract,
        currentProvider
      );

      log.debug(' ManualTokenContract created, calling getBalance...');

      // Get balance using the simplified implementation
      const balance = await tokenContract.getBalance(address);

      log.debug(' Got balance:', balance);

      set({ isLoading: false });
      return balance;
    } catch (error: any) {
      log.error(' Balance fetch error:', error);
      log.error(' Error stack:', error.stack);
      set({
        isLoading: false,
        error: error.message || 'Failed to get balance'
      });
      throw error;
    }
  },

  getMana: async (address: string) => {
    log.debug(' getMana called for address:', address);
    const { provider, isInitialized } = get();

    // Initialize if needed
    if (!provider || !isInitialized) {
      log.debug(' Provider not initialized, initializing...');
      await get().initialize();
    }

    const currentProvider = get().provider;
    if (!currentProvider) {
      log.error(' Provider still not initialized after init attempt');
      throw new Error('Provider not initialized');
    }

    try {
      log.debug(' Fetching account resource credits...');

      // Get current mana using chain.get_account_rc RPC call
      const rcResult = await currentProvider.call('chain.get_account_rc', {
        account: address
      });

      log.debug(' RC result:', rcResult);

      const currentMana = rcResult.rc || '0';

      // Get reserved mana from mempool (mana locked in pending transactions)
      let reservedMana = '0';
      try {
        const reservedResult = await currentProvider.call('mempool.get_reserved_account_rc', {
          account: address
        });
        reservedMana = reservedResult.rc || '0';
        log.debug(' Reserved mana in mempool:', reservedMana);
      } catch (error) {
        log.debug(' Could not fetch reserved mana (mempool may be empty)');
      }

      // Get balance to calculate max mana
      const balance = await get().getBalance(address);

      // Max mana = balance * 10^8 (KOIN has 8 decimals)
      const balanceInSatoshis = utils.parseUnits(balance, 8);
      const maxMana = balanceInSatoshis;

      log.debug(' Current mana:', currentMana);
      log.debug(' Reserved mana:', reservedMana);
      log.debug(' Max mana:', maxMana);

      // Calculate available mana (current - reserved)
      const currentManaBigInt = BigInt(currentMana);
      const reservedManaBigInt = BigInt(reservedMana);
      const maxManaBigInt = BigInt(maxMana);

      const availableManaBigInt = currentManaBigInt > reservedManaBigInt
        ? currentManaBigInt - reservedManaBigInt
        : 0n;

      log.debug(' Available mana:', availableManaBigInt.toString());

      // Calculate percentages
      let percentage = 0;
      let availablePercentage = 0;

      if (maxManaBigInt > 0n) {
        percentage = Number((currentManaBigInt * 100n) / maxManaBigInt);
        availablePercentage = Number((availableManaBigInt * 100n) / maxManaBigInt);
      }

      log.debug(' Current mana percentage:', percentage);
      log.debug(' Available mana percentage:', availablePercentage);

      return {
        current: currentMana,
        reserved: reservedMana,
        available: availableManaBigInt.toString(),
        max: maxMana,
        percentage,
        availablePercentage
      };
    } catch (error: any) {
      log.error(' Get mana error:', error);
      log.error(' Error stack:', error.stack);
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

      log.debug(' Starting transfer to:', to, 'amount:', amount);

      // Use ManualTokenContract to avoid protobuf extension issues
      const tokenContract = new ManualTokenContract(
        DEFAULT_NETWORK.koinContract,
        currentProvider
      );

      // Transfer using manual contract implementation
      // Don't pass rcLimit - let the contract estimate via dry-run
      const { transactionId } = await tokenContract.transfer(
        currentSigner,
        to,
        amount
      );

      log.debug(' Transfer complete, transaction ID:', transactionId);

      set({ isLoading: false });
      return transactionId;
    } catch (error: any) {
      log.error(' Transfer error:', error);
      log.error(' Error details:', error.message);
      log.error(' Error stack:', error.stack);
      set({
        isLoading: false,
        error: error.message || 'Failed to send transaction'
      });
      throw error;
    }
  },

  transferToken: async (contractId: string, to: string, amount: string, decimals: number) => {
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

      log.debug(' Starting token transfer');
      log.debug('Contract:', contractId);
      log.debug('To:', to);
      log.debug('Amount:', amount);
      log.debug('Decimals:', decimals);

      // Use ManualTokenContract with the specified token contract
      const tokenContract = new ManualTokenContract(
        contractId,
        currentProvider
      );

      // Transfer using manual contract implementation with token decimals
      const { transactionId } = await tokenContract.transfer(
        currentSigner,
        to,
        amount,
        { decimals }
      );

      log.debug(' Token transfer complete, transaction ID:', transactionId);

      set({ isLoading: false });
      return transactionId;
    } catch (error: any) {
      log.error(' Token transfer error:', error);
      log.error(' Error details:', error.message);
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
      log.error('Failed to estimate mana:', error);
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