import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DApp } from '../constants/dapps';
import { validateDAppUrl } from '../lib/urlValidation';

export type CustomDappCategory = DApp['category'];

export interface CustomDapp extends DApp {
  createdAt: number;
  updatedAt: number;
  isCurated: false;
}

export interface CustomDappInput {
  name: string;
  url: string;
  category?: CustomDappCategory;
  iconUrl?: string;
}

export interface UpdateCustomDappInput {
  name?: string;
  url?: string;
  category?: CustomDappCategory;
  iconUrl?: string;
}

export type CustomDappResult =
  | { ok: true; dapp: CustomDapp }
  | { ok: false; error: string };

interface CustomDappState {
  customDapps: CustomDapp[];
  addCustomDapp: (input: CustomDappInput) => CustomDappResult;
  updateCustomDapp: (id: string, input: UpdateCustomDappInput) => CustomDappResult;
  removeCustomDapp: (id: string) => void;
  getCustomDapps: () => CustomDapp[];
}

let nextCustomDappId = 0;

export function createEmptyCustomDappState(): Pick<CustomDappState, 'customDapps'> {
  return {
    customDapps: [],
  };
}

function isDappCategory(value: unknown): value is CustomDappCategory {
  return (
    value === 'defi' ||
    value === 'tools' ||
    value === 'nft' ||
    value === 'social' ||
    value === 'gaming' ||
    value === 'other'
  );
}

function canonicalUrlKey(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
}

function normalizeUrl(url: string): { url?: string; error?: string } {
  const result = validateDAppUrl(url);

  if (!result) {
    return { error: 'Please enter a valid URL.' };
  }

  if (result.error) {
    return { error: result.error };
  }

  return { url: result.url };
}

function duplicateUrlExists(
  dapps: CustomDapp[],
  url: string,
  exceptId?: string
): boolean {
  const nextKey = canonicalUrlKey(url);
  return dapps.some((dapp) => dapp.id !== exceptId && canonicalUrlKey(dapp.url) === nextKey);
}

function createCustomDapp(input: CustomDappInput, now: number): CustomDappResult {
  const name = input.name.trim();
  const normalized = normalizeUrl(input.url);
  if (normalized.error || !normalized.url) {
    return { ok: false, error: normalized.error || 'Please enter a valid URL.' };
  }

  if (!name) {
    return { ok: false, error: 'App name is required.' };
  }

  nextCustomDappId += 1;
  return {
    ok: true,
    dapp: {
      id: `custom-${now}-${nextCustomDappId}`,
      name,
      description: 'Custom URL',
      url: normalized.url,
      icon: input.iconUrl?.trim() || '',
      category: isDappCategory(input.category) ? input.category : 'other',
      createdAt: now,
      updatedAt: now,
      isCurated: false,
    },
  };
}

export const useCustomDappStore = create<CustomDappState>()(
  persist(
    (set, get) => ({
      customDapps: [],

      addCustomDapp: (input) => {
        const now = Date.now();
        const result = createCustomDapp(input, now);
        if (!result.ok) {
          return result;
        }

        if (duplicateUrlExists(get().customDapps, result.dapp.url)) {
          return {
            ok: false,
            error: 'This app URL is already saved.',
          };
        }

        set((state) => ({
          customDapps: [...state.customDapps, result.dapp],
        }));
        return result;
      },

      updateCustomDapp: (id, input) => {
        const current = get().customDapps.find((dapp) => dapp.id === id);
        if (!current) {
          return {
            ok: false,
            error: 'Saved app not found.',
          };
        }

        let nextUrl = current.url;
        if (input.url !== undefined) {
          const normalized = normalizeUrl(input.url);
          if (normalized.error || !normalized.url) {
            return { ok: false, error: normalized.error || 'Please enter a valid URL.' };
          }
          nextUrl = normalized.url;
        }

        if (duplicateUrlExists(get().customDapps, nextUrl, id)) {
          return {
            ok: false,
            error: 'This app URL is already saved.',
          };
        }

        const nextDapp: CustomDapp = {
          ...current,
          name: input.name?.trim() || current.name,
          url: nextUrl,
          icon: input.iconUrl?.trim() ?? current.icon,
          category: isDappCategory(input.category) ? input.category : current.category,
          updatedAt: Date.now(),
        };

        set((state) => ({
          customDapps: state.customDapps.map((dapp) => dapp.id === id ? nextDapp : dapp),
        }));

        return {
          ok: true,
          dapp: nextDapp,
        };
      },

      removeCustomDapp: (id) => {
        set((state) => ({
          customDapps: state.customDapps.filter((dapp) => dapp.id !== id),
        }));
      },

      getCustomDapps: () => get().customDapps,
    }),
    {
      name: 'custom_dapp_store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        customDapps: state.customDapps,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        customDapps: Array.isArray((persistedState as { customDapps?: unknown } | null)?.customDapps)
          ? (persistedState as { customDapps: CustomDapp[] }).customDapps
          : [],
      }),
    }
  )
);
