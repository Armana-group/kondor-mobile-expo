import { create } from 'zustand';
import { Provider, Signer, Contract, utils } from 'koilib';
import * as SecureStore from 'expo-secure-store';
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

  if (!privateKey) {
    privateKey = await SecureStore.getItemAsync('kondor_wallet_private_key');
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

  if (!privateKey) {
    throw new Error('No private key found');
  }

  if (privateKey.length === 64) {
    return new Signer({ privateKey, provider });
  }

  const signer = Signer.fromWif(privateKey);
  signer.provider = provider;
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
    const { provider: currentProvider } = await ensureActiveProvider(get);

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

      // See transferToken: use max rc (balance) as the dry-run limit so a stale
      // available-rc reading can't trigger a spurious "insufficient rc".
      let maxRc: number | undefined;
      try {
        const mana = await get().getMana(from);
        maxRc = Number(mana.max) || undefined;
      } catch (manaErr) {
        log.debug(' Could not fetch max rc; estimation will fall back to available rc');
      }

      const tokenContract = new ManualTokenContract(
        network.koinContract,
        currentProvider
      );

      const { transactionId } = await tokenContract.transfer(
        signer,
        to,
        amount,
        {
          maxRc,
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
    const { provider: currentProvider } = await ensureActiveProvider(get);

    try {
      set({ isLoading: true, error: null });

      log.debug(' Starting token transfer');

      const signer = await getTemporarySigner(currentProvider);
      const from = signer.getAddress();

      // Max rc = the account's KOIN balance; used as the dry-run rc_limit so a
      // stale/low *available* rc reading (e.g. just after funding) can't cap the
      // estimation and cause a spurious "insufficient rc" on the first attempt.
      let maxRc: number | undefined;
      try {
        const mana = await get().getMana(from);
        maxRc = Number(mana.max) || undefined;
      } catch (manaErr) {
        log.debug(' Could not fetch max rc; estimation will fall back to available rc');
      }

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
          maxRc,
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
