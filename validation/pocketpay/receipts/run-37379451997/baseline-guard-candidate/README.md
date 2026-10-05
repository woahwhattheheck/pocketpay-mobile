This is a local validation-controller repair candidate for the failed PocketPay baseline run 37379451997. It does not change product source, branches, hosted jobs or application behavior outside the disposable fixture.

The original run loaded a native runtime error before any of its nine baseline target screens. The exact fatal message was `Dummy key-generation guard did not install.` The installed Expo live-binding transform exposes `generateKeypair` through a non-configurable getter, so the frozen bootstrap's assignment retained the original function. The same export boundary affected its already-intended mock deposit and withdrawal blockers.

The candidate preloads a guarded Metro factory before the vault initializer, stores and router. It preserves every other export descriptor and getter identity and gives only the three existing guarded exports writable, non-configurable slots. Those slots initially throw. The original deterministic seed11/12/23 definitions, baseline generator identity guard, screen cases and counters remain unchanged. The vault initializer adds explicit fatal identity checks for its two blockers.

Owner and independent peer reproduced the frozen failure and five passing local regression cases against clean source52/treeb755 and all30 pinned source files. The passing cases cover the fatal vault checks, deterministic generation through a transformed named import and cached namespace, existing write/clipboard/transport/no-secret/privacy denials, five fail-closed preload boundaries, and selected slot shape. The peer regression report is byte-equal to the owner report. Preparation verifies four JavaScript syntax files, zero TypeScript diagnostics, and both Android route metadata entries.

The actual installed Expo worker and active dev serializer emit the exact module name `src/services/stellar.ts`; the generated factory's argument4 is `module`. Raw worker output, emitted registration, effective actual config, primary-source hash bindings and scripts are retained under `evidence/`. The serializer dependency IDs refer to unexecuted fixtures. This is source-derived Node VM evidence; no candidate native/Hermes/UI execution or baseline acceptance is claimed.

Two attempts at a full local bundle failed during preparation: the first did not include the disposable entry in Metro's watch list; the second could not resolve the local SDK through the installed dependency symlink. Their logs are retained. No complete local bundle was emitted, and neither failure is a product or binding assertion.

Run the local proof from this directory, passing the exact source52 checkout and immutable baseline fixture directory:

```bash
node guard-install-regression.cjs /path/to/source52 /path/to/immutable/baseline-fixture
node fixture/validate-fixture.js /path/to/source52
```

`fixture-guard.patch` changes four existing baseline fixture files and adds the preload seam. Composition must also copy the guarded vault initializer identically into the separate vault-fixture directory, refresh both fixture manifests, preparation pins, shared vault guard hash and controller manifests, and record seven installed fixture files/four JavaScript syntax files. Ledger owns that composition after root review. The candidate keeps the controller parser and baseline Tutorial behavior unchanged.

All probes forbid original production/random operations and use harmless store/native/transport stubs plus the fixture's existing public deterministic SDK seeds. They do not deliver HTTP, native clipboard/share, persistence, signing or broadcasts. Writable slots still permit assignment/value replacement; deletion and accessor redefinition fail. Cold-start behavior is tested; HMR behavior remains untested.
