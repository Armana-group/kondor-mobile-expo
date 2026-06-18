import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Contact {
  id: string;
  name: string;
  address: string;
  createdAt: number;
}

interface ContactState {
  contacts: Contact[];

  // Actions
  addContact: (name: string, address: string) => void;
  updateContact: (id: string, name: string, address: string) => void;
  deleteContact: (id: string) => void;
  getContactByAddress: (address: string) => Contact | undefined;
  getContactById: (id: string) => Contact | undefined;
}

// Generate cryptographically secure unique ID
const generateId = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export const useContactStore = create<ContactState>()(
  persist(
    (set, get) => ({
      contacts: [
        // Default contact
        {
          id: 'default-ron',
          name: 'Ron',
          address: '1DTstq47k9v5dwyw8LrvZRxRX1qU5CBNJd',
          createdAt: Date.now(),
        },
      ],

      addContact: (name: string, address: string) => {
        const newContact: Contact = {
          id: generateId(),
          name: name.trim(),
          address: address.trim(),
          createdAt: Date.now(),
        };

        set((state) => ({
          contacts: [...state.contacts, newContact],
        }));
      },

      updateContact: (id: string, name: string, address: string) => {
        set((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === id
              ? { ...contact, name: name.trim(), address: address.trim() }
              : contact
          ),
        }));
      },

      deleteContact: (id: string) => {
        set((state) => ({
          contacts: state.contacts.filter((contact) => contact.id !== id),
        }));
      },

      getContactByAddress: (address: string) => {
        return get().contacts.find(
          (contact) => contact.address.toLowerCase() === address.toLowerCase()
        );
      },

      getContactById: (id: string) => {
        return get().contacts.find((contact) => contact.id === id);
      },
    }),
    {
      name: 'kondor-contacts',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
