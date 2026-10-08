import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DiagnosticsScreen from '../app/diagnostics';
import { getDiagnostics } from '../src/utils/diagnostics';
import { diagnosticsFixtures } from '../tests/fixtures';

jest.mock('../src/utils/diagnostics', () => ({
  getDiagnostics: jest.fn(),
}));

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
}));

const mockGetDiagnostics = getDiagnostics as jest.MockedFunction<typeof getDiagnostics>;

describe('DiagnosticsScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
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

  it('hides builder failures and disables export rather than exposing a raw error', async () => {
    mockGetDiagnostics.mockRejectedValueOnce(new Error('private wallet details'));

    const { getByText, getByLabelText, queryByText } = render(<DiagnosticsScreen />);

    await waitFor(() => getByText('Diagnostics unavailable. Please retry.'));
    expect(queryByText('private wallet details')).toBeNull();
    expect(getByLabelText('Export redacted diagnostics log')).toBeDisabled();
  });

  it('rejects incomplete diagnostics and permits an explicit retry', async () => {
    mockGetDiagnostics
      .mockResolvedValueOnce('{}')
      .mockResolvedValueOnce(JSON.stringify(diagnosticsFixtures.healthy));

    const { getByText, getByLabelText } = render(<DiagnosticsScreen />);
    await waitFor(() => getByText('Diagnostics unavailable. Please retry.'));

    fireEvent.press(getByLabelText('Refresh diagnostics data'));

    await waitFor(() => getByText('horizon-testnet.stellar.org'));
    expect(getByLabelText('Export redacted diagnostics log')).not.toBeDisabled();
    expect(mockGetDiagnostics).toHaveBeenCalledTimes(2);
  });
});
