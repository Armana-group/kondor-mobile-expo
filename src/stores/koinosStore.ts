import { create } from 'zustand';
import { Provider, Signer, Contract, utils } from 'koilib';
import * as SecureStore from 'expo-secure-store';
import { readPayerCapacity, parseManaLimit, DEFAULT_MAX_MANA } from '../lib/mana';
import { DEFAULT_RC_LIMIT } from '../lib/constants';
import { createWalletFromMnemonic } from '../lib/wallet';
import {
  ManualTokenContract,
  type TransferBroadcastAcceptedDetails,
} from '../lib/manualTokenContract';
import { koinosLogger as log } from '../lib/logger';
import { getActiveNetworkConfig } from './networkStore';
import { useWalletStore } from './walletStore';

interface TransferExecutionOptions {
  rcLimit?: string;
  payer?: string;
  assertCurrent?: () => void;
  memo?: string;
  onBroadcastAccepted?: (details: TransferBroadcastAcceptedDetails) => void;
}

interface KoinosState {
  provider: Provider | null;
  networkChainId: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  getBalance: (address: string) => Promise<string>;
  getMana: (address: string) => Promise<{ current: string; reserved: string; available: string; max: string; percentage: number; availablePercentage: number }>;
  transfer: (to: string, amount: string, options?: TransferExecutionOptions) => Promise<string>;
  transferToken: (
    contractId: string,
    to: string,
    amount: string,
    decimals: number,
    options?: TransferExecutionOptions
  ) => Promise<string>;
  estimateMana: (to: string, amount: string) => Promise<string>;
  getTransferCapacity: (payer: string, contractId: string, from: string, amount: string) => Promise<string>;
  reset: () => void;
}

/**
 * Create a temporary signer for a single operation.
 * The signer is not cached — it goes out of scope after use.
 */
async function getTemporarySigner(provider: Provider): Promise<Signer> {
  const { activeAccountId } = useWalletStore.getState();

  let privateKey: string | null = null;

  if (activeAccountId) {
    privateKey = await SecureStore.getItemAsync(`kondor_pk_${activeAccountId}`);
  }

  // If still no key, try deriving from mnemonic
  if (!privateKey) {
    const state = useWalletStore.getState();
    const activeAccount = state.accounts.find(a => a.id === activeAccountId);

    if (activeAccount && !activeAccount.isImported) {
      const mnemonic = await SecureStore.getItemAsync('kondor_wallet_mnemonic');
      if (mnemonic) {
        const wallet = createWalletFromMnemonic(mnemonic, activeAccount.derivationIndex);
        privateKey = wallet.privateKey;
      }
    }
  }

  if (!privateKey) privateKey = await SecureStore.getItemAsync('kondor_wallet_private_key');

  if (!privateKey) {
    throw new Error('No private key found');
  }

  const signer = privateKey.length === 64 ? new Signer({ privateKey, provider }) : Signer.fromWif(privateKey);
  signer.provider = provider;
  const state = useWalletStore.getState();
  const expectedAddress = state.accounts.find(account => account.id === activeAccountId)?.address ?? state.address;
  if (!expectedAddress || signer.getAddress() !== expectedAddress || state.activeAccountId !== activeAccountId) {
    throw new Error('The signing key does not match the selected account. Restore this account before sending.');
  }
  return signer;
}

async function ensureActiveProvider(get: () => KoinosState): Promise<{
  provider: Provider;
  network: ReturnType<typeof getActiveNetworkConfig>;
}> {
  const activeNetwork = getActiveNetworkConfig();
  const { provider, isInitialized, networkChainId } = get();

  if (!provider || !isInitialized || networkChainId !== activeNetwork.chainId) {
    await get().initialize();
  }

  const currentProvider = get().provider;
  if (!currentProvider) {
    throw new Error('Provider not initialized');
  }

  return {
    provider: currentProvider,
    network: getActiveNetworkConfig(),
  };
}

export const useKoinosStore = create<KoinosState>((set, get) => ({
  provider: null,
  networkChainId: null,
  isInitialized: false,
  isLoading: false,
  error: null,

  initialize: async () => {
    log.debug(' Initializing provider...');
    try {
      set({ isLoading: true, error: null });

      const network = getActiveNetworkConfig();
      const provider = new Provider(network.rpcNodes);

      set({
        provider,
        networkChainId: network.chainId,
        isInitialized: true,
        isLoading: false,
        error: null
      });
      log.debug(' Initialization complete');
    } catch (error: any) {
      log.error(' Initialization error:', error.message);
      set({
        isLoading: false,
        error: error.message || 'Failed to initialize Koinos connection'
      });
      throw error;
    }
  },

  getBalance: async (address: string) => {
    log.debug(' getBalance called for address:', address);
    const { provider: currentProvider, network } = await ensureActiveProvider(get);

    try {
      set({ isLoading: true, error: null });

      const tokenContract = new ManualTokenContract(
        network.koinContract,
        currentProvider
      );

      const balance = await tokenContract.getBalance(address);

      log.debug(' Got balance:', balance);

      set({ isLoading: false });
      return balance;
    } catch (error: any) {
      log.error(' Balance fetch error:', error.message);
      set({
        isLoading: false,
        error: error.message || 'Failed to get balance'
      });
      throw error;
    }
  },

  getMana: async (address: string) => {
    log.debug(' getMana called for address:', address);
    const { provider: currentProvider, network } = await ensureActiveProvider(get);

    try {
      log.debug(' Fetching account resource credits...');

      const rcResult = await currentProvider.call('chain.get_account_rc', {
        account: address
      }) as { rc?: string };

      const currentMana = rcResult.rc || '0';

      let reservedMana = '0';
      try {
        const reservedResult = await currentProvider.call('mempool.get_reserved_account_rc', {
          account: address
        }) as { rc?: string };
        reservedMana = reservedResult.rc || '0';
      } catch (error) {
        log.debug(' Could not fetch reserved mana (mempool may be empty)');
      }

      const balance = await get().getBalance(address);
      const balanceInSatoshis = utils.parseUnits(balance, 8);
      const maxMana = balanceInSatoshis;

      const currentManaBigInt = BigInt(currentMana);
      const reservedManaBigInt = BigInt(reservedMana);
      const maxManaBigInt = BigInt(maxMana);

      const availableManaBigInt = currentManaBigInt > reservedManaBigInt
        ? currentManaBigInt - reservedManaBigInt
        : 0n;

      let percentage = 0;
      let availablePercentage = 0;

      if (maxManaBigInt > 0n) {
        percentage = Number((currentManaBigInt * 100n) / maxManaBigInt);
        availablePercentage = Number((availableManaBigInt * 100n) / maxManaBigInt);
      }

      return {
        current: currentMana,
        reserved: reservedMana,
        available: availableManaBigInt.toString(),
        max: maxMana,
        percentage,
        availablePercentage
      };
    } catch (error: any) {
      log.error(' Get mana error:', error.message);
      throw error;
    }
  },

  transfer: async (to: string, amount: string, options?: TransferExecutionOptions) => {
    const { provider: currentProvider, network } = await ensureActiveProvider(get);

    try {
      set({ isLoading: true, error: null });

      log.debug(' Starting transfer to:', to, 'amount:', amount);

      const signer = await getTemporarySigner(currentProvider);
      const from = signer.getAddress();

      const tokenContract = new ManualTokenContract(
        network.koinContract,
        currentProvider
      );

      const { transactionId } = await tokenContract.transfer(
        signer,
        to,
        amount,
        {
          rcLimit: options?.rcLimit ?? parseManaLimit(DEFAULT_MAX_MANA),
          payer: options?.payer,
          assertCurrent: options?.assertCurrent,
          networkMode: network.isTestnet ? 'harbinger' : 'mainnet',
          memo: options?.memo,
          onBroadcastAccepted: options?.onBroadcastAccepted,
        }
      );

      log.debug(' Transfer complete, transaction ID:', transactionId);

      set({ isLoading: false });
      return transactionId;
    } catch (error: any) {
      log.error(' Transfer error:', error.message);
      set({
        isLoading: false,
        error: error.message || 'Failed to send transaction'
      });
      throw error;
    }
  },

  transferToken: async (
    contractId: string,
    to: string,
    amount: string,
    decimals: number,
    options?: TransferExecutionOptions
  ) => {
    const { provider: currentProvider, network } = await ensureActiveProvider(get);

    try {
      set({ isLoading: true, error: null });

      log.debug(' Starting token transfer');

      const signer = await getTemporarySigner(currentProvider);
      const from = signer.getAddress();

      const tokenContract = new ManualTokenContract(
        contractId,
        currentProvider
      );

      const { transactionId } = await tokenContract.transfer(
        signer,
        to,
        amount,
        {
          decimals,
          rcLimit: options?.rcLimit ?? parseManaLimit(DEFAULT_MAX_MANA),
          payer: options?.payer,
          assertCurrent: options?.assertCurrent,
          networkMode: network.isTestnet ? 'harbinger' : 'mainnet',
          memo: options?.memo,
          onBroadcastAccepted: options?.onBroadcastAccepted,
        }
      );

      log.debug(' Token transfer complete, transaction ID:', transactionId);

      set({ isLoading: false });
      return transactionId;
    } catch (error: any) {
      log.error(' Token transfer error:', error.message);
      set({
        isLoading: false,
        error: error.message || 'Failed to send transaction'
      });
      throw error;
    }
  },

  getTransferCapacity: async (payer, contractId, from, amount) => {
    const { provider, network } = await ensureActiveProvider(get);
    return readPayerCapacity({
      provider, payer, koinContract: network.koinContract, sponsor: network.freeManaSharer,
      outgoingKoin: payer === from && contractId === network.koinContract ? utils.parseUnits(amount, 8) : '0',
    });
  },

  estimateMana: async (to: string, amount: string) => {
    const { provider: currentProvider, network } = await ensureActiveProvider(get);

    try {
      const signer = await getTemporarySigner(currentProvider);

      const koin = new Contract({
        id: network.koinContract,
        abi: utils.tokenAbi,
        provider: currentProvider,
        signer,
      });

      const value = utils.parseUnits(amount, 8);

      await koin.functions.transfer({
        from: signer.getAddress(),
        to,
        value
      }, {
        onlyOperation: true
      });

      return DEFAULT_RC_LIMIT.toString();
    } catch (error: any) {
      log.error('Failed to estimate mana:', error.message);
      return DEFAULT_RC_LIMIT.toString();
    }
  },

  reset: () => {
    set({
      provider: null,
      networkChainId: null,
      isInitialized: false,
      isLoading: false,
      error: null
    });
  }
}));
