import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  EMPTY_PERMISSION_STORE,
  GRANT_SCHEMA_VERSION,
  addGrant,
  isValidGrant,
  normalizeGrantOrigin,
  removeGrant,
  type DAppPermissionGrant,
} from '../lib/dapp/permissions';

interface DAppPermissionState {
  version: typeof GRANT_SCHEMA_VERSION;
  grants: Record<string, DAppPermissionGrant>;
  hasHydrated: boolean;
  upsertGrant: (grant: DAppPermissionGrant) => void;
  touchGrantLastUsed: (origin: string, lastUsedAt: number) => void;
  revokeGrant: (origin: string) => void;
  revokeAllGrants: () => void;
  setHasHydrated: (hydrated: boolean) => void;
}

const STORAGE_NAME = 'dapp-permission-store';
const ZUSTAND_PERSIST_VERSION = 0;

function sanitizeGrant(grant: unknown): DAppPermissionGrant | null {
  if (!isValidGrant(grant)) {
    return null;
  }

  const normalized = normalizeGrantOrigin(grant.origin);
  if (!normalized) {
    return null;
  }

  return {
    version: GRANT_SCHEMA_VERSION,
    origin: normalized,
    hostname: grant.hostname,
    accounts: [...grant.accounts],
    capabilities: grant.capabilities.map((capability) => ({
      method: capability.method,
      caveats: Array.isArray(capability.caveats) ? [...capability.caveats] : [],
    })),
    lifetime: grant.lifetime,
    riskAtGrant: grant.riskAtGrant,
    createdAt: grant.createdAt,
    lastUsedAt: grant.lastUsedAt,
    ...(typeof grant.expiresAt === 'number' ? { expiresAt: grant.expiresAt } : {}),
    ...(typeof grant.integrity === 'string' ? { integrity: grant.integrity } : {}),
  };
}

function sanitizeGrantMap(value: unknown): Record<string, DAppPermissionGrant> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, DAppPermissionGrant>>(
    (accumulator, [key, grant]) => {
      const sanitized = sanitizeGrant(grant);
      if (!sanitized) {
        return accumulator;
      }

      const normalizedKey = normalizeGrantOrigin(key);
      if (!normalizedKey || normalizedKey !== sanitized.origin) {
        return accumulator;
      }

      accumulator[normalizedKey] = sanitized;
      return accumulator;
    },
    {}
  );
}

function persistentOnly(grants: Record<string, DAppPermissionGrant>): Record<string, DAppPermissionGrant> {
  return Object.entries(grants).reduce<Record<string, DAppPermissionGrant>>((accumulator, [key, grant]) => {
    if (grant.lifetime === 'persistent') {
      accumulator[key] = grant;
    }
    return accumulator;
  }, {});
}

function syncPersistentGrants(grants: Record<string, DAppPermissionGrant>) {
  const payload = {
    state: {
      version: GRANT_SCHEMA_VERSION,
      grants: persistentOnly(sanitizeGrantMap(grants)),
    },
    version: ZUSTAND_PERSIST_VERSION,
  };

  void AsyncStorage.setItem(STORAGE_NAME, JSON.stringify(payload));
}

export const useDAppPermissionStore = create<DAppPermissionState>()(
  persist(
    (set) => ({
      version: GRANT_SCHEMA_VERSION,
      grants: {},
      hasHydrated: false,

      upsertGrant: (grant) => {
        const sanitized = sanitizeGrant(grant);
        if (!sanitized) {
          return;
        }

        set((state) => {
          const grants = addGrant(
            { version: state.version, grants: state.grants },
            sanitized
          ).grants;
          syncPersistentGrants(grants);
          return { grants };
        });
      },

      touchGrantLastUsed: (origin, lastUsedAt) => {
        set((state) => {
          const normalized = normalizeGrantOrigin(origin);
          if (!normalized) {
            return state;
          }

          const existingGrant = state.grants[normalized];
          const sanitizedGrant = sanitizeGrant(existingGrant);
          if (!sanitizedGrant) {
            return state;
          }

          const grants = addGrant(
            { version: state.version, grants: state.grants },
            { ...sanitizedGrant, lastUsedAt }
          ).grants;

          syncPersistentGrants(grants);
          return { grants };
        });
      },

      revokeGrant: (origin) => {
        set((state) => {
          const grants = removeGrant(
            { version: state.version, grants: state.grants },
            origin
          ).grants;
          syncPersistentGrants(grants);
          return { grants };
        });
      },

      revokeAllGrants: () => {
        syncPersistentGrants({});
        set({ grants: {} });
      },

      setHasHydrated: (hydrated) => {
        set({ hasHydrated: hydrated });
      },
    }),
    {
      name: STORAGE_NAME,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        version: GRANT_SCHEMA_VERSION,
        grants: persistentOnly(sanitizeGrantMap(state.grants)),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | {
              version?: unknown;
              grants?: unknown;
            }
          | null;

        const version =
          persisted?.version === GRANT_SCHEMA_VERSION
            ? GRANT_SCHEMA_VERSION
            : currentState.version;

        return {
          ...currentState,
          version,
          grants: sanitizeGrantMap(persisted?.grants),
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export function getPermissionStoreSnapshot() {
  const { grants, version } = useDAppPermissionStore.getState();
  return {
    version,
    grants,
  };
}

export function getSortedPermissionGrants(): DAppPermissionGrant[] {
  return Object.values(useDAppPermissionStore.getState().grants).sort(
    (left, right) => right.createdAt - left.createdAt
  );
}

export function clearPermissionGrants() {
  useDAppPermissionStore.getState().revokeAllGrants();
}

export { EMPTY_PERMISSION_STORE };
