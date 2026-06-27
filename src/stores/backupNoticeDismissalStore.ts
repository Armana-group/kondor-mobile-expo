import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  isBackupHealthActionRequired,
  type BackupHealth,
} from '../lib/backupHealth';

type BackupNoticeDismissalState = {
  dismissedKeys: Record<string, true>;
  dismissNotice: (key: string | null) => void;
  isDismissed: (key: string | null) => boolean;
  clearDismissals: () => void;
};

function keyPart(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : '-';
}

export function getBackupNoticeDismissalKey(backupHealth: BackupHealth): string | null {
  if (!isBackupHealthActionRequired(backupHealth)) {
    return null;
  }

  return [
    backupHealth.status,
    keyPart(backupHealth.walletFingerprint),
    keyPart(backupHealth.accountSetHash),
    keyPart(backupHealth.failureReason),
    keyPart(backupHealth.lastCreatedAt),
    keyPart(backupHealth.lastVerifiedAt),
  ].join('|');
}

export const useBackupNoticeDismissalStore = create<BackupNoticeDismissalState>()(
  persist(
    (set, get) => ({
      dismissedKeys: {},
      dismissNotice: (key) => {
        if (!key) {
          return;
        }

        set((state) => ({
          dismissedKeys: {
            ...state.dismissedKeys,
            [key]: true,
          },
        }));
      },
      isDismissed: (key) => (key ? get().dismissedKeys[key] === true : false),
      clearDismissals: () => set({ dismissedKeys: {} }),
    }),
    {
      name: 'kondor-backup-notice-dismissals',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        dismissedKeys: state.dismissedKeys,
      }),
    }
  )
);
