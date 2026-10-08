# Wallet-flow accessibility audit — issue #529

This audit is tied to the concrete PocketPay Mobile UI components, not to
an unverified device or WCAG certification. The source changes address
screen-reader discoverability and readable error states in creation/import,
balance/history, send/receive, and contacts.

## Source audit and applied repairs

| Flow | Previous gap | Source-level change |
| --- | --- | --- |
| Create/import and storage recovery | WalletEmptyState failures had ordinary heading text but no alert/live-region semantics | Failed creation/import/storage titles are spoken as alerts; empty/cancelled headings are identified as headings |
| Import/send/receive field validation | FormField inputs did not reliably expose label/error via the control itself; secret visibility icon had no named action | Label, error hint, disabled state and live error text; named Show/Hide secret-key toggle with expanded state |
| Address-book entry | Input controls and inline errors were inconsistently exposed | Input label/error hint and live validation messages |
| Contact deletion and duplicate recovery | A bare Trash icon was the removal target; duplicate update lacked an accessible action label | Actual touchable button with descriptive label/hint/hitSlop; labelled update and live duplicate warning |
| Balance and activity | See All was Text with an onPress but no button role | Touchable navigation control with button role, label, hint, and expanded touch target |
| Receive | QR bitmap and request-details toggle did not explain their purpose and state to a screen reader | QR image announcement with non-QR fallback, expanded-state toggle and descriptive address label |
| Send | FormField validation was visually shown but not conveyed as a focused hint/live error | Shared FormField fix applies to destination, XLM amount, memo and other input sites |

The existing BalanceDisplay already exposes available/unavailable states
and a retry button; this change intentionally does not duplicate those
semantics. The shared AsyncActionButton already reports busy/disabled
states.

## Manual acceptance checklist (not executed)

Run on *both* Android TalkBack and iOS VoiceOver with a testnet wallet.
These are acceptance steps to complete, not a claim of device verification.

- [ ] Create: heading is discoverable, Generate Keypair has a named
  button role, storage failure is announced, and retry and start-over
  controls appear in reading order.
- [ ] Import: navigate by controls to Secret Key; its label and format
  guidance are read without exposing secret contents; Show/Hide has
  an explicit name/state; invalid key errors are announced.
- [ ] Home: balance available/loading/unavailable states are read
  distinctly; history's See All is announced as a button and activates
  by a screen-reader double-tap.
- [ ] Send: destination, amount, memo labels are announced; invalid
  amount/memo/address text appears as a live error and on field focus;
  Network Unavailable disables the submit action.
- [ ] Receive: screen reader describes the QR purpose and points to
  Copy Address/Share; request-details toggle announces expanded or
  collapsed; invalid optional amount and memo errors are readable.
- [ ] Contacts: adding a duplicate announces the warning, Update
  Existing has a named action, and Delete Contact is focused as a button
  that opens confirmation rather than deleting immediately.
- [ ] Rotate text size to 200% and enable bold text; verify no clipped
  control or inaccessible modal/focus trap. These visual checks require
  a device and are **not** verified by this source patch.

## Guidelines for future contributors

Prefer named TouchableOpacity/Button actions to bare icon onPress or
Text onPress. Every TextInput must have an accessible label independent
of placeholder. Errors should be tied to a focused control via
accessibilityHint and be exposed in a live-region Text element.
Decorative icons should not become the only accessible control. Keep
share/copy alternatives for QR flows. Confirm with device assistive
technology; Jest/source assertions alone cannot prove focus order,
dynamic-font layout, or VoiceOver/TalkBack output.

## Verification boundary

Changes are authored against the sponsor main source snapshot
`c3a24abacb45030eb4fef41aabc46b312aaf54a3`. Device audit,
mobile build, hosted CI, and end-to-end accessibility checks **have not
been executed** by this source author. The manual checklist above
is the required follow-up before representing this as device-verified.
