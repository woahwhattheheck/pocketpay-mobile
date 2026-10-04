# Contact duplicate and persistence rules

The Contacts screen uses `src/store/appStore.ts` for manual and scan-to-add entries.

- **Same address:** surrounding whitespace is removed and case is normalized to
  uppercase before comparison and storage. A duplicate address is rejected even
  when the proposed name differs. Manual entry offers an explicit update of the
  existing contact's name; it does not silently replace the contact or its ID.
- **Same name, different address:** names are compared after trimming and folding
  case. This produces a warning, not a rejection. The address is the contact's
  stronger identity. The warning is recomputed when either input changes.
- **Scanned address:** the same duplicate-address check applies before opening
  the confirmation form, and the store checks again when the user saves.

## Durable changes

Contact initialization, additions, renames and deletions are serialized in one
queue. Each mutation derives its snapshot from the last committed list, then
waits for AsyncStorage before publishing that snapshot to the UI. Two concurrent
saves of the same normalized address therefore cannot both succeed. A slow
write cannot overwrite a newer contact list.

A rejected write rejects the action without changing the committed contact
list. The save/update form retains the user's input and allows retry; failed
deletion is surfaced through the existing confirmation dialog. A failed action
does not prevent subsequent queued actions from running. Save, update, cancel,
scan and text editing are guarded while the form's write is in progress.

This does not add cloud sync, backups, export or a migration of old contact data.
Existing local-only storage and backup limitations remain in [contacts.md](./contacts.md).

## Focused checks

Run `npm test -- --runInBand --runTestsByPath __tests__/appStore.contacts.test.ts __tests__/contacts.persistence.test.tsx`.

The store cases cover persistence-before-publication, reload, normalized address
conflicts, allowed duplicate names, concurrent saves, mixed mutations, write
failures/retry, and initialization ordering. The screen cases cover normalized
update lookup and retaining/retrying a failed form submission.
