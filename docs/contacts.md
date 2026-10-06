# Contacts: Storage, Backup, and Export

This document explains how contacts (address book entries) are stored today,
what backup coverage they have, and what's being considered for future
export/import support.

## Current Storage Behaviour

Contacts are **local-only**. Each contact is a simple record:

    interface Contact {
      id: string;
      name: string;
      publicKey: string;
    }

They are persisted on-device using **AsyncStorage** (unencrypted), under the
key `@pocketpay_contacts`. See the [Storage Guide](./storage.md) for why
contacts live in AsyncStorage rather than SecureStore — a contact's public
key is, by design, not sensitive in the same way a secret key or mnemonic is.

There is currently **no server, cloud, or account-based sync**. Contacts
saved on one device are not available on any other device, and there is no
PocketPay account tying them together.

## Send Flow Integration and Recent Recipients

The Send screen, contact picker, contact editor, and payment receipt share the
same `useAppStore` contact records. Manual destination entry remains
available; choosing a saved contact only fills that same destination field.

Recent recipients are recorded **only from a confirmed payment receipt** when
both a transaction hash and destination are present. They are normalized,
deduplicated with newest first, capped at five entries, and persisted locally
under `@pocketpay_recent_recipients`. A failed or merely initiated send does
not add a recent recipient.

Editing a contact may change its name or public key. The centralized duplicate
check prevents changing a contact to an address already owned by another saved
contact. Deletion still uses the existing confirmation flow.

## Backup Limitations

- **No cloud backup exists for contacts.** This mirrors the wallet's secret
  key, which also has no cloud backup (see the [Security Guide](./security.md)).
- **Uninstalling the app deletes AsyncStorage**, which deletes the contact
  list along with it. There is currently no confirmation step or warning
  before this happens.
- **There is no manual export option yet** (no "export to file" or "share"
  action on the Contacts screen), so there is no way to save a copy of your
  contacts outside the app today.
- **Restoring a wallet from a secret key does not restore contacts.**
  Contacts are tied to the device/install, not to the wallet's keys, so
  reinstalling the app or importing a wallet on a new device starts with an
  empty contact list.

## Future Export / Import Considerations

No export/import feature is implemented yet. If added in the future, the
following approaches are worth considering:

- **JSON export/import**: dump the `Contact[]` array to a local file (e.g.
  via `expo-file-system` + a native share sheet) and allow re-importing that
  same file on another device.
- **QR-code based transfer**: encode a single contact (or a small batch) as a
  QR code so it can be shared without files or network access, consistent
  with how addresses are already shared elsewhere in the app.
- **Merge strategy on import**: decide how to handle duplicates (matched by
  `publicKey`, see `findContactByPublicKey` in `src/store/appStore.ts`) —
  e.g. skip, overwrite, or prompt per conflict.
- **Optional encryption for exported files**: since exported contacts could
  reveal a user's transaction relationships, an exported file should probably
  not be stored or shared in plaintext by default.

None of the above is implemented. This section only records ideas for future
work; contributions or proposals are welcome via an issue or PR.

## Summary

|
