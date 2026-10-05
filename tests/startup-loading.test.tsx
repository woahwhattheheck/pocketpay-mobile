import React from 'react';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useWalletStore } from '../src/store/walletStore';
import { useAppStore } from '../src/store/appStore';
import RootLayout from '../app/_layout';

jest.mock('../shim', () => ({}));
jest.mock('../src/utils/globalErrorHandler', () => ({ installGlobalErrorHandlers: jest.fn() }));
jest.mock('../src/store/walletStore');
jest.mock('../src/store/appStore');
jest.mock('../src/components/LockScreen', () => ({ LockScreen: ({ children }: any) => children }));
jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({ colors: require('../src/constants/theme').DARK_COLORS }),
}));
jest.mock('expo-linking', () => ({ useURL: () => null, openURL: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSegments: () => ['(tabs)'],
  Slot: () => {
    const { Text } = require('react-native');
    return <Text>App content</Text>;
  },
}));

const initializeApp = jest.fn();
const loadWalletFromStorage = jest.fn();

function setup(isInitialized: boolean, walletChecked: boolean) {
  jest.mocked(useAppStore).mockReturnValue({ isInitialized, initializeApp } as any);
  jest.mocked(useWalletStore).mockReturnValue({
    walletChecked, loadWalletFromStorage, publicKey: 'GEXISTING', error: null,
  } as any);
}

describe('Root startup loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() } as any);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('loads settings before restoring the wallet and keeps app content hidden', () => {
    setup(false, false);
    const { getByText, queryByText } = render(<RootLayout />);
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(loadWalletFromStorage).not.toHaveBeenCalled();
    expect(getByText('Loading your settings…')).toBeTruthy();
    expect(queryByText('App content')).toBeNull();
    act(() => jest.advanceTimersByTime(300));
    expect(loadWalletFromStorage).toHaveBeenCalledTimes(1);
    expect(getByText('Restoring your wallet…')).toBeTruthy();
  });

  it('waits for the wallet check even when settings have initialized', () => {
    setup(true, false);
    const { getByText, queryByText, rerender } = render(<RootLayout />);
    expect(getByText('Restoring your wallet…')).toBeTruthy();
    expect(queryByText('App content')).toBeNull();
    setup(true, true);
    rerender(<RootLayout />);
    expect(getByText('App content')).toBeTruthy();
    expect(queryByText('Restoring your wallet…')).toBeNull();
  });
});
