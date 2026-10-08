# Error reporting during recovery

The existing root `ErrorBoundary` and global error handler use `reportError`.
Recovery must not depend on successfully inspecting or logging the original
failure. This change repairs that reporting path; it does not install a second
boundary or replace the existing recovery screen.

The retained `getLastErrorReport()` snapshot uses the sanitized source, error
name and message. The getter returns a copy, so diagnostics consumers cannot
change the retained report. The original error and context remain untouched.

Circular object and array references become `[Circular]`. Repeated references
which are not cycles retain their redacted content. If context inspection or
error sanitization throws, reporting uses a generic `ErrorReporting` snapshot
without copying either exception or the original context. Logging is best effort:
a failed console sink does not prevent the boundary from rendering recovery UI.

Existing Stellar key, mnemonic-shaped string and sensitive-field redaction rules
still apply. These patterns are not a guarantee that arbitrary sensitive text can
be recognized: callers must not place credentials, wallet material or unnecessary
personal data in error names, messages, source labels or context. Deeply nested
context may fall back to the generic snapshot. No external telemetry transport,
wallet reset, transaction retry or secure-storage access is added here.

Focused repository regression command:

```sh
npm test -- --runInBand __tests__/errorReportingRecovery.test.ts
```

The six regressions cover retained/logged redaction, cycles versus shared
references, snapshot isolation, context inspection failure, logging failure, and
ordinary/malformed context. Existing error-boundary UI checks can be run with the
repository's normal Jest setup; no device-level result is implied by utility
checks alone.
