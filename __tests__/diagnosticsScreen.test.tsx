import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
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

  it('shows error categories without rendering raw failure details', async () => {
    mockGetDiagnostics.mockResolvedValue(
      JSON.stringify(diagnosticsFixtures.networkErrorWithReportedCrash)
    );

    const { getByText, queryByText } = render(<DiagnosticsScreen />);

    await waitFor(() => getByText('ErrorBoundary'));
    getByText('TypeError');
    getByText('Offline');
    expect(queryByText('Cannot read property of undefined')).toBeNull();
    expect(queryByText('Network request failed')).toBeNull();
  });
});
