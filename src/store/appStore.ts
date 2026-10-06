import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeAddress } from "../utils/address";

export interface Contact {
  id: string;
  name: string;
  publicKey: string;
}

export type ThemeMode = "light" | "dark" | "system";

const VALID_THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return (
    typeof value === "string" && VALID_THEME_MODES.includes(value as ThemeMode)
  );
}

const DEFAULT_THEME_MODE: ThemeMode = "dark";

export interface DuplicateCheckResult {
  /** true if a duplicate was found and the contact should not be saved. */
  isDuplicate: boolean;
  /** The type of duplicate detected. */
  type: "address" | "name" | "none";
  /** A user-facing message describing the conflict, if any. */
  message: string;
}

interface AppState {
  contacts: Contact[];
  themeMode: ThemeMode;
  isInitialized: boolean;

  // Actions
  initializeApp: () => Promise<void>;
  addContact: (contact: Contact) => Promise<{ success: boolean; duplicateName?: string }>;
  addContactIfUnique: (contact: Contact) => Promise<DuplicateCheckResult>;
  updateContact: (id: string, name: string) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  findContactByPublicKey: (publicKey: string) => Contact | undefined;
  findContactByName: (name: string) => Contact | undefined;
  findDuplicateContact: (
    name: string,
    publicKey: string,
    excludeId?: string,
  ) => DuplicateCheckResult;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const STORAGE_KEYS = {
  CONTACTS: "@pocketpay_contacts",
  THEME_MODE: "@pocketpay_theme",
};

/**
 * @deprecated Use normalizeAddress from src/utils/address instead.
 * Kept for backward compatibility with existing callers.
 */
export function normalizePublicKey(publicKey: string): string {
  return normalizeAddress(publicKey);
}

// Serialize reads and mutations, not just writes: each operation must compute
// its next snapshot from the last successfully persisted contact list.
let contactOperations: Promise<void> = Promise.resolve();

function withContactStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = contactOperations.then(operation);
  // Reject the caller on failure, but keep later operations/retries runnable.
  contactOperations = result.then(() => undefined, () => undefined);
  return result;
}

const persistContacts = async (contacts: Contact[]) => {
  await AsyncStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
};

/** Parses a stored theme preference, falling back safely if it is missing, malformed, or not a recognized mode. */
function parseStoredThemeMode(stored: string | null): ThemeMode {
  if (!stored) return DEFAULT_THEME_MODE;
  try {
    const parsed = JSON.parse(stored);
    return isValidThemeMode(parsed) ? parsed : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  contacts: [],
  themeMode: DEFAULT_THEME_MODE,
  isInitialized: false,

  initializeApp: () => withContactStorage(async () => {
    try {
      const [storedContacts, storedTheme] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.CONTACTS),
        AsyncStorage.getItem(STORAGE_KEYS.THEME_MODE),
      ]);

      set({
        contacts: storedContacts ? JSON.parse(storedContacts) : [],
        themeMode: parseStoredThemeMode(storedTheme),
        isInitialized: true,
      });
    } catch (e) {
      console.error("Failed to load app settings:", e);
      set({ isInitialized: true });
    }
  }),

  addContact: (contact: Contact) => {
    // Capture caller input before yielding to another queued operation.
    const sanitized: Contact = {
      ...contact,
      publicKey: normalizeAddress(contact.publicKey),
      name: contact.name.trim(),
    };
    return withContactStorage(async () => {
      const { contacts } = get();
      const existing = contacts.find(
        (c) => normalizeAddress(c.publicKey) === sanitized.publicKey,
      );
      if (existing) {
        return { success: false, duplicateName: existing.name };
      }

      const newContacts = [...contacts, sanitized];
      await persistContacts(newContacts);
      set({ contacts: newContacts });
      return { success: true };
    });
  },

  updateContact: (id: string, name: string) => withContactStorage(async () => {
    const newContacts = get().contacts.map((c) =>
      c.id === id ? { ...c, name: name.trim() } : c,
    );
    await persistContacts(newContacts);
    set({ contacts: newContacts });
  }),

  addContactIfUnique: async (contact: Contact) => {
    // addContact checks inside the queue, so simultaneous saves cannot both
    // report success for the same normalized address.
    const result = await get().addContact(contact);
    if (!result.success) {
      return {
        isDuplicate: true,
        type: "address",
        message: `This address is already saved as "${result.duplicateName}".`,
      };
    }

    // Name conflicts are advisory rather than blocking. Check after the
    // serialized save so concurrent additions observe the latest committed
    // contact list, while excluding the contact we just added.
    const nameConflict = get().findDuplicateContact(
      contact.name,
      contact.publicKey,
      contact.id,
    );
    if (nameConflict.type === "name") {
      return nameConflict;
    }

    return { isDuplicate: false, type: "none", message: "" };
  },

  removeContact: (id: string) => withContactStorage(async () => {
    const newContacts = get().contacts.filter((c) => c.id !== id);
    await persistContacts(newContacts);
    set({ contacts: newContacts });
  }),

  findDuplicateContact: (
    name: string,
    publicKey: string,
    excludeId?: string,
  ) => {
    const contacts = get().contacts;

    // Address is the stronger duplicate identifier — check it first.
    const normalizedKey = normalizePublicKey(publicKey);
    const addressMatch = contacts.find(
      (c) =>
        c.id !== excludeId && normalizePublicKey(c.publicKey) === normalizedKey,
    );
    if (addressMatch) {
      return {
        isDuplicate: true,
        type: "address" as const,
        message: `This address is already saved as "${addressMatch.name}".`,
      };
    }

    // Name duplicates are non-blocking warnings.
    const normalizedName = name.trim().toLowerCase();
    if (normalizedName) {
      const nameMatch = contacts.find(
        (c) =>
          c.id !== excludeId && c.name.trim().toLowerCase() === normalizedName,
      );
      if (nameMatch) {
        return {
          isDuplicate: false,
          type: "name" as const,
          message: `You already have a contact named "${nameMatch.name}". You can still save another with a different address.`,
        };
      }
    }

    return { isDuplicate: false, type: "none" as const, message: "" };
  },

  findContactByPublicKey: (publicKey: string) => {
    const normalized = normalizeAddress(publicKey);
    return get().contacts.find(
      (c) => normalizeAddress(c.publicKey) === normalized,
    );
  },

  findContactByName: (name: string) => {
    const normalized = name.trim().toLowerCase();
    return get().contacts.find(
      (c) => c.name.trim().toLowerCase() === normalized,
    );
  },

  setThemeMode: async (mode: ThemeMode) => {
    if (!isValidThemeMode(mode)) return;
    set({ themeMode: mode });
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.THEME_MODE, JSON.stringify(mode));
    } catch (e) {
      console.error("Failed to save theme setting:", e);
    }
  },
}));
