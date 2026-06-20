import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { NetworkMode } from './networkStore';

export interface CustomTokenDefinition {
  contractId: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
}

export interface NetworkCustomTokenState {
  customTokens: Record<string, CustomTokenDefinition>;
  hiddenSystemTokenIds: string[];
}

export interface CustomTokenNetworks {
  mainnet: NetworkCustomTokenState;
  harbinger: NetworkCustomTokenState;
}

interface CustomTokenState {
  networks: CustomTokenNetworks;
  addCustomToken: (networkMode: NetworkMode, token: CustomTokenDefinition) => void;
  removeCustomToken: (networkMode: NetworkMode, contractId: string) => void;
  setSystemTokenHidden: (networkMode: NetworkMode, contractId: string, hidden: boolean) => void;
  getCustomTokens: (networkMode: NetworkMode) => CustomTokenDefinition[];
  getHiddenSystemTokenIds: (networkMode: NetworkMode) => string[];
}

function createEmptyNetworkCustomTokenState(): NetworkCustomTokenState {
  return {
    customTokens: {},
    hiddenSystemTokenIds: [],
  };
}

export function createEmptyCustomTokenNetworks(): CustomTokenNetworks {
  return {
    mainnet: createEmptyNetworkCustomTokenState(),
    harbinger: createEmptyNetworkCustomTokenState(),
  };
}

function normalizeCustomToken(token: CustomTokenDefinition): CustomTokenDefinition {
  return {
    contractId: token.contractId.trim(),
    symbol: token.symbol.trim(),
    name: token.name.trim(),
    decimals: token.decimals,
    icon: token.icon?.trim() || undefined,
  };
}

function dedupeHiddenTokenIds(contractIds: string[]): string[] {
  return Array.from(new Set(contractIds.map((contractId) => contractId.trim()).filter(Boolean)));
}

function getNetworkState(
  networks: CustomTokenNetworks,
  networkMode: NetworkMode
): NetworkCustomTokenState {
  return networks[networkMode];
}

export const useCustomTokenStore = create<CustomTokenState>()(
  persist(
    (set, get) => ({
      networks: createEmptyCustomTokenNetworks(),

      addCustomToken: (networkMode, token) => {
        const normalizedToken = normalizeCustomToken(token);
        if (!normalizedToken.contractId) {
          return;
        }

        set((state) => ({
          networks: {
            ...state.networks,
            [networkMode]: {
              ...getNetworkState(state.networks, networkMode),
              customTokens: {
                ...getNetworkState(state.networks, networkMode).customTokens,
                [normalizedToken.contractId]: normalizedToken,
              },
            },
          },
        }));
      },

      removeCustomToken: (networkMode, contractId) => {
        const trimmedContractId = contractId.trim();
        set((state) => {
          const nextCustomTokens = {
            ...getNetworkState(state.networks, networkMode).customTokens,
          };
          delete nextCustomTokens[trimmedContractId];

          return {
            networks: {
              ...state.networks,
              [networkMode]: {
                ...getNetworkState(state.networks, networkMode),
                customTokens: nextCustomTokens,
              },
            },
          };
        });
      },

      setSystemTokenHidden: (networkMode, contractId, hidden) => {
        const trimmedContractId = contractId.trim();
        if (!trimmedContractId) {
          return;
        }

        set((state) => {
          const currentNetworkState = getNetworkState(state.networks, networkMode);
          const hiddenIds = hidden
            ? dedupeHiddenTokenIds([...currentNetworkState.hiddenSystemTokenIds, trimmedContractId])
            : currentNetworkState.hiddenSystemTokenIds.filter((id) => id !== trimmedContractId);

          return {
            networks: {
              ...state.networks,
              [networkMode]: {
                ...currentNetworkState,
                hiddenSystemTokenIds: hiddenIds,
              },
            },
          };
        });
      },

      getCustomTokens: (networkMode) => {
        return Object.values(getNetworkState(get().networks, networkMode).customTokens);
      },

      getHiddenSystemTokenIds: (networkMode) => {
        return getNetworkState(get().networks, networkMode).hiddenSystemTokenIds;
      },
    }),
    {
      name: 'custom_token_store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        networks: state.networks,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as object | undefined),
        networks: {
          ...createEmptyCustomTokenNetworks(),
          ...((persistedState as { networks?: Partial<CustomTokenNetworks> } | null)?.networks ?? {}),
        },
      }),
    }
  )
);
