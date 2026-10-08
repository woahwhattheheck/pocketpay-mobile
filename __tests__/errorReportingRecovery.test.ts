import {
  clearLastErrorReport,
  ErrorReportContext,
  getLastErrorReport,
  reportError,
} from '../src/utils/errorReporting';
import { redactSensitiveValue, sanitizeError } from '../src/utils/redactSensitive';

// Format-shaped synthetic sentinel; not a wallet credential.
const sentinel = 'S' + 'A'.repeat(55);

describe('error reporting recovery', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    clearLastErrorReport();
    log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => log.mockRestore());

  it('redacts the retained source and error name as well as logged data', () => {
    const error = new Error(`Could not load: ${sentinel}`);
    error.name = `Storage-${sentinel}`;
    reportError(error, { source: `Wallet-${sentinel}`, isFatal: true });
    expect(getLastErrorReport()).toMatchObject({
      source: 'Wallet-[REDACTED_SECRET]',
      name: 'Storage-[REDACTED_SECRET]',
      isFatal: true,
    });
    expect(JSON.stringify(getLastErrorReport())).not.toContain(sentinel);
    expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
    expect(sanitizeError(error).name).toBe('Storage-[REDACTED_SECRET]');
  });

  it('handles object and array cycles without discarding shared references', () => {
    const shared = { code: 'E_STORAGE', secret: sentinel };
    const context: ErrorReportContext = {
      source: 'ErrorBoundary', left: shared, right: shared,
    };
    context.self = context;
    context.items = [context];
    expect(redactSensitiveValue(context)).toEqual({
      source: 'ErrorBoundary',
      left: { code: 'E_STORAGE', secret: '[REDACTED]' },
      right: { code: 'E_STORAGE', secret: '[REDACTED]' },
      self: '[Circular]',
      items: ['[Circular]'],
    });
    const array: unknown[] = [];
    array.push(array);
    expect(redactSensitiveValue(array)).toEqual(['[Circular]']);
    expect(() => reportError(new Error('Render failed'), context)).not.toThrow();
    expect(getLastErrorReport()?.source).toBe('ErrorBoundary');
  });

  it('isolates the retained diagnostic snapshot from caller mutation', () => {
    reportError(new Error('Render failed'), { source: 'ErrorBoundary' });
    const snapshot = getLastErrorReport()!;
    snapshot.source = sentinel;
    snapshot.message = sentinel;
    expect(getLastErrorReport()).toMatchObject({
      source: 'ErrorBoundary', message: 'Render failed',
    });
    clearLastErrorReport();
    expect(getLastErrorReport()).toBeNull();
  });

  it('falls back safely when context inspection throws', () => {
    const context: ErrorReportContext = { source: 'ErrorBoundary' };
    Object.defineProperty(context, 'broken', {
      enumerable: true,
      get() { throw new Error(sentinel); },
    });
    expect(() => reportError(new Error(sentinel), context)).not.toThrow();
    expect(getLastErrorReport()).toMatchObject({
      source: 'ErrorReporting', message: 'Error details unavailable',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
  });

  it('retains diagnostics when the logging sink throws', () => {
    log.mockImplementation(() => { throw new Error('Logger unavailable'); });
    expect(() => reportError(new Error('Render failed'), {
      source: 'ErrorBoundary',
    })).not.toThrow();
    expect(getLastErrorReport()?.message).toBe('Render failed');
  });

  it('preserves ordinary context and normalizes malformed context', () => {
    reportError(new TypeError('Render failed'), {
      source: 'ErrorBoundary', isFatal: false, code: 17,
    });
    expect(getLastErrorReport()).toMatchObject({ name: 'TypeError', isFatal: false });
    expect(log.mock.calls[0][2].code).toBe(17);
    expect(Number.isFinite(Date.parse(getLastErrorReport()!.timestamp))).toBe(true);
    expect(() => reportError(new Error('Render failed'),
      null as unknown as ErrorReportContext)).not.toThrow();
    expect(getLastErrorReport()?.source).toBe('Unknown');
  });
});
