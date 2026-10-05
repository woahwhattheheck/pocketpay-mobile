import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { VaultUnavailableState } from '../src/components/VaultUnavailableState';

jest.mock('lucide-react-native', () => ({ XCircle: () => null }));

describe('VaultUnavailableState', () => {
  it('renders unavailable copy and a working settings action for a missing wallet', () => {
    const onNavigateToSettings = jest.fn();
    const { getByText, getByTestId } = render(
      <VaultUnavailableState reasons={['no-wallet']} onNavigateToSettings={onNavigateToSettings} />
    );
    expect(getByTestId('vault-readiness-unavailable')).toBeTruthy();
    expect(getByText('Vault Unavailable')).toBeTruthy();
    fireEvent.press(getByText('Go to Settings'));
    expect(onNavigateToSettings).toHaveBeenCalledTimes(1);
  });

  it('labels an unconfigured vault planned without offering a misleading retry', () => {
    const { getByText, getByTestId, queryByText } = render(
      <VaultUnavailableState reasons={['contract-not-configured']} onRetry={jest.fn()} />
    );
    expect(getByTestId('vault-readiness-planned')).toBeTruthy();
    expect(getByText('Vault Planned')).toBeTruthy();
    expect(queryByText('Try Again')).toBeNull();
  });

  it('labels disabled builds explicitly and preserves all reason details', () => {
    const { getByText, getByTestId, queryByText } = render(
      <VaultUnavailableState reasons={['feature-disabled', 'no-wallet']} onRetry={jest.fn()} />
    );
    expect(getByText('Vault Disabled')).toBeTruthy();
    expect(getByTestId('reason-detail-feature-disabled')).toBeTruthy();
    expect(getByTestId('reason-detail-no-wallet')).toBeTruthy();
    expect(queryByText('Try Again')).toBeNull();
  });

  it('calls retry for an isolated transient backend blocker', () => {
    const onRetry = jest.fn();
    const { getByText } = render(<VaultUnavailableState reasons={['sdk-not-ready']} onRetry={onRetry} />);
    fireEvent.press(getByText('Try Again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('updates planned copy to disabled copy when the reasons change', () => {
    const { rerender, getByText, queryByText } = render(
      <VaultUnavailableState reasons={['contract-not-configured']} />
    );
    rerender(<VaultUnavailableState reasons={['feature-disabled']} />);
    expect(getByText('Vault Disabled')).toBeTruthy();
    expect(queryByText('Vault Planned')).toBeNull();
    expect(getByText('See docs/vault-readiness.md for current capabilities and limitations.')).toBeTruthy();
  });
});
