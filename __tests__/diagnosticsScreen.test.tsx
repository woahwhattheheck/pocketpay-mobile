import React from 'react';
import { Share } from 'react-native';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import DiagnosticsScreen from '../app/diagnostics';
import { getDiagnostics } from '../src/utils/diagnostics';
import { diagnosticsFixtures } from '../tests/fixtures';

jest.mock('../src/utils/diagnostics', () => ({
  getDiagnostics: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  Redirect: () => null,
  Stack: {
    Screen: () => null,
  },
}));

const mockGetDiagnostics = getDiagnostics as jest.MockedFunction<typeof getDiagnostics>;

describe('DiagnosticsScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('renders environment, network, and wallet status from a healthy diagnostics snapshot', async () => {
    mockGetDiagnostics.mockResolvedValue(JSON.stringify(diagnosticsFixtures.healthy));

    const { getByText, getAllByText } = render(<DiagnosticsScreen />);

    await waitFor(() => getByText(/Testnet/));

    getByText(/ios/);
    getByText('1.0.0');
    getByText('Production');
    getByText('horizon-testnet.stellar.org');
    getByText('Available');
    // Both "Wallet Configured" and "Balance Loaded" render "Yes" for this fixture.
    expect(getAllByText('Yes')).toHaveLength(2);
    getByText('None');
  });

  it('surfaces storage unavailability instead of hiding it', async () => {
    mockGetDiagnostics.mockResolvedValue(
      JSON.stringify(diagnosticsFixtures.secureStoreUnavailable)
    );

    const { getByText } = render(<DiagnosticsScreen />);

    await waitFor(() => getByText('Unavailable'));
  });

  it('shows the last reported error and the wallet store error when the snapshot has both', async () => {
    mockGetDiagnostics.mockResolvedValue(
      JSON.stringify(diagnosticsFixtures.networkErrorWithReportedCrash)
    );

    const { getByText } = render(<DiagnosticsScreen />);

    await waitFor(() => getByText('ErrorBoundary'));
    getByText('TypeError');
    getByText('Cannot read property of undefined');
    // Distinct from lastReportedError: this is walletState.lastError.
    getByText('Network request failed');
  });
  it('shows a coarse error category and redacts accidental secrets before display or sharing', async () => {
    const secret = 'S' + 'A'.repeat(55);
    const unsafeSnapshot = {
      ...diagnosticsFixtures.networkErrorWithReportedCrash,
      walletState: {
        ...diagnosticsFixtures.networkErrorWithReportedCrash.walletState,
        lastError: 'Request failed with ' + secret,
      },
      lastReportedError: {
        ...diagnosticsFixtures.networkErrorWithReportedCrash.lastReportedError!,
        message: 'Crash ' + secret,
      },
    };
    mockGetDiagnostics.mockResolvedValue(JSON.stringify(unsafeSnapshot));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });

    const { getByText, queryByText } = render(<DiagnosticsScreen />);
    await waitFor(() => getByText('connection'));
    getByText('Request failed with [REDACTED_SECRET]');
    getByText('Crash [REDACTED_SECRET]');
    expect(queryByText(secret)).toBeNull();
    expect(share).not.toHaveBeenCalled();

    fireEvent.press(getByText('Export Diagnostics Log'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = (share.mock.calls[0][0] as { message: string }).message;
    expect(payload).toContain('[REDACTED_SECRET]');
    expect(payload).not.toContain(secret);
  });

  it('recovers a failed first load and retains safe diagnostics when refresh fails', async () => {
    const secret = 'S' + 'C'.repeat(55);
    mockGetDiagnostics
      .mockRejectedValueOnce(new Error('initial provider failure: ' + secret))
      .mockResolvedValueOnce(JSON.stringify(diagnosticsFixtures.healthy))
      .mockRejectedValueOnce(new Error('refresh provider failure: ' + secret));

    const { getByText, queryByText } = render(<DiagnosticsScreen />);
    await waitFor(() => getByText('Unable to load diagnostics.'));
    expect(queryByText(secret)).toBeNull();

    fireEvent.press(getByText('Retry diagnostics'));
    await waitFor(() => getByText('horizon-testnet.stellar.org'));

    fireEvent.press(getByText('Refresh Diagnostics'));
    await waitFor(() => getByText('Unable to refresh diagnostics. Showing the previous safe snapshot.'));
    getByText('horizon-testnet.stellar.org');
    getByText('Export Diagnostics Log');
    expect(queryByText(secret)).toBeNull();
    expect(mockGetDiagnostics).toHaveBeenCalledTimes(3);
  });

  it('shows a loading state until the snapshot resolves', () => {
    mockGetDiagnostics.mockImplementation(() => new Promise<string>(() => {}));
    const { getByText } = render(<DiagnosticsScreen />);
    getByText('Loading diagnostics...');
  });

  it('does not display raw exception text when diagnostics loading fails', async () => {
    const secret = 'S' + 'B'.repeat(55);
    mockGetDiagnostics.mockRejectedValue(new Error('provider error: ' + secret));
    const { getByText, queryByText } = render(<DiagnosticsScreen />);
    await waitFor(() => getByText('Unable to load diagnostics.'));
    expect(queryByText(secret)).toBeNull();
  });

});
