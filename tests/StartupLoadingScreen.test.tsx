import React from 'react';
import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';
import { StartupLoadingScreen } from '../src/components/StartupLoadingScreen';

describe('StartupLoadingScreen', () => {
  beforeEach(() => {
    jest.spyOn(Animated, 'loop').mockReturnValue({
      start: jest.fn(), stop: jest.fn(), reset: jest.fn(),
    } as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('explains the startup state and wallet custody', () => {
    const { getByText } = render(<StartupLoadingScreen />);
    expect(getByText('Preparing your wallet…')).toBeTruthy();
    expect(getByText('Non-custodial Stellar Wallet')).toBeTruthy();
    expect(getByText('Encrypted • Self-custodial')).toBeTruthy();
    expect(getByText('PocketPay • Testnet')).toBeTruthy();
  });

  it('updates the progress message as initialization proceeds', () => {
    const { getByText, queryByText, rerender } = render(
      <StartupLoadingScreen progressMessage="Restoring your wallet…" />
    );
    expect(getByText('Restoring your wallet…')).toBeTruthy();
    rerender(<StartupLoadingScreen progressMessage="Ready" />);
    expect(getByText('Ready')).toBeTruthy();
    expect(queryByText('Restoring your wallet…')).toBeNull();
  });
});
