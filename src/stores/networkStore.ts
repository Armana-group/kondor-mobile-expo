import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { MAINNET, STORAGE_KEYS, TESTNET } from '../lib/constants';
import { clearTransactionAuthorization } from '../services/transactionAuthorization';

export type NetworkMode = 'mainnet' | 'harbinger';

export interface NetworkConfig {
  chainId: string;
  name: string;
  rpcNodes: string[];
  koinContract: string;
  nicknamesContractId?: string;
  kapNameServiceContractId?: string;
  explorer: {
    base: string;
    tx: string;
    address: string;
    contract: string;
    block: string;
  };
  rest: {
    history: string;
    transaction: string;
  };
  freeManaSharer: string;
  isTestnet: boolean;
}

interface NetworkState {
  mode: NetworkMode;
  hasHydrated: boolean;
  setMode: (mode: NetworkMode) => Promise<void>;
  setHasHydrated: (hydrated: boolean) => void;
}

const NETWORK_CONFIGS: Record<NetworkMode, NetworkConfig> = {
  mainnet: MAINNET,
  harbinger: TESTNET,
};

function normalizeNetworkMode(value: unknown): NetworkMode {
  return value === 'harbinger' ? 'harbinger' : 'mainnet';
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      mode: 'mainnet',
      hasHydrated: false,

      setMode: async (mode: NetworkMode) => {
        set((state) => {
          const nextMode = normalizeNetworkMode(mode);
          if (nextMode !== state.mode) {
            clearTransactionAuthorization();
          }

          return { mode: nextMode };
        });
      },

      setHasHydrated: (hydrated: boolean) => {
        set({ hasHydrated: hydrated });
      },
    }),
    {
      name: STORAGE_KEYS.CURRENT_NETWORK,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        mode: state.mode,
      }),
      merge: (persistedState, currentState) => {
        const persistedMode = (persistedState as { mode?: unknown } | null)?.mode;

        return {
          ...currentState,
          ...(persistedState as object | undefined),
          mode: normalizeNetworkMode(persistedMode),
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export function getActiveNetworkConfig(): NetworkConfig {
  const { mode, hasHydrated } = useNetworkStore.getState();
  if (!hasHydrated) {
    return NETWORK_CONFIGS.mainnet;
  }

  return NETWORK_CONFIGS[normalizeNetworkMode(mode)];
}

export function getNetworkConfigForMode(mode: NetworkMode): NetworkConfig {
  return NETWORK_CONFIGS[mode];
}

export async function setNetworkMode(mode: NetworkMode): Promise<void> {
  await useNetworkStore.getState().setMode(mode);
}
