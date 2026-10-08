/**
 * Central error reporting hook.
 *
 * This intentionally has zero external dependencies so it works before a
 * crash reporter (Sentry, Bugsnag, etc.) is wired up. Every call site in the
 * app — the ErrorBoundary, the global JS error handler, and the unhandled
 * promise rejection tracker — should funnel through here so we have exactly
 * one place to swap in real telemetry.
 *
 * All logged payloads are redacted so secret keys, public keys, and mnemonics
 * never appear in developer logs or diagnostics exports.
 */

import { redactSensitiveValue, sanitizeError, SanitizedError } from './redactSensitive';

export interface ErrorReportContext {
  /** Where the error was captured, e.g. "ErrorBoundary", "GlobalHandler". */
  source: string;
  /** React component stack, if available. */
  componentStack?: string;
  /** True if the JS engine considers this fatal (app is about to die). */
  isFatal?: boolean;
  [key: string]: unknown;
}

/** Non-sensitive snapshot of the most recent reported failure. */
export interface LastErrorReport {
  source: string;
  name: string;
  message: string;
  isFatal?: boolean;
  timestamp: string;
}

let lastErrorReport: LastErrorReport | null = null;

export function getLastErrorReport(): LastErrorReport | null {
  return lastErrorReport ? { ...lastErrorReport } : null;
}

export function clearLastErrorReport(): void {
  lastErrorReport = null;
}

export function reportError(error: Error, context: ErrorReportContext): void {
  let sanitized: SanitizedError;
  let safeContext: ErrorReportContext;
  try {
    sanitized = sanitizeError(error);
    const redactedContext = redactSensitiveValue(context);
    safeContext = redactedContext !== null && typeof redactedContext === 'object'
      && !Array.isArray(redactedContext)
      ? redactedContext as ErrorReportContext
      : { source: 'Unknown' };
  } catch {
    sanitized = { name: 'Error', message: 'Error details unavailable' };
    safeContext = { source: 'ErrorReporting' };
  }

  lastErrorReport = {
    source: typeof safeContext.source === 'string' ? safeContext.source : 'Unknown',
    name: sanitized.name,
    message: sanitized.message,
    isFatal: typeof safeContext.isFatal === 'boolean' ? safeContext.isFatal : undefined,
    timestamp: new Date().toISOString(),
  };

  try {
    // eslint-disable-next-line no-console
    console.error(`[${lastErrorReport.source}]`, sanitized, safeContext);
  } catch {
  }

  if (!__DEV__) {
    // TODO: wire up a real crash reporter, e.g.:
    // Sentry.captureException(sanitized, { extra: safeContext, level: safeContext.isFatal ? 'fatal' : 'error' });
  }
}
