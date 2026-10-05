import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockGetNativePermission = jest.fn();
const mockRequestNativePermission = jest.fn();

jest.mock('expo-camera', () => {
  // Exercise the installed Expo hook's real response publication and callback
  // identities; only the native permission methods and camera view are bounded.
  const { createPermissionHook } = jest.requireActual('../node_modules/expo-modules-core/src/PermissionsHook.ts');
  const useCameraPermissions = createPermissionHook({
    getMethod: () => mockGetNativePermission(),
    requestMethod: () => mockRequestNativePermission(),
  });
  return {
    useCameraPermissions,
    CameraView: () => require('react').createElement(require('react-native').View, { testID: 'native-camera-boundary' }),
  };
});
jest.mock('lucide-react-native', () => ({ X: () => null, ScanLine: () => null }));
jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({ colors: require('../src/constants/theme').COLORS }),
}));
jest.mock('../src/utils/validation', () => ({ validateAddress: () => null }));

import { QrScanner } from '../src/components/QrScanner';

type Permission = {
  status: 'undetermined' | 'denied' | 'granted';
  granted: boolean;
  canAskAgain: boolean;
  expires: 'never';
};
const undetermined: Permission = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
const deniedAskable: Permission = { status: 'denied', granted: false, canAskAgain: true, expires: 'never' };
const blocked: Permission = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
const granted: Permission = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };

function deferred() {
  let resolve!: (permission: Permission) => void;
  const promise = new Promise<Permission>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.resetAllMocks();
  // An unexpected request stays pending so a defect has a finite observable
  // count rather than an artificial loop of instantly resolved responses.
  mockRequestNativePermission.mockImplementation(() => new Promise<Permission>(() => {}));
});

it('keeps manual entry usable while the initial permission query is loading', () => {
  mockGetNativePermission.mockReturnValue(new Promise<Permission>(() => {}));
  const onManualEntry = jest.fn();
  const screen = render(<QrScanner onScan={jest.fn()} onError={jest.fn()} onClose={jest.fn()} onManualEntry={onManualEntry} />);
  expect(screen.getByText('Checking camera permission…')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Enter recipient address manually' }));
  expect(onManualEntry).toHaveBeenCalledTimes(1);
  expect(mockRequestNativePermission).not.toHaveBeenCalled();
});

it('requests once from undetermined and retries an askable denial only after an explicit Grant press', async () => {
  const initial = deferred();
  const firstRequest = deferred();
  const explicitRetry = deferred();
  mockGetNativePermission.mockReturnValue(initial.promise);
  mockRequestNativePermission
    .mockImplementationOnce(() => firstRequest.promise)
    .mockImplementationOnce(() => explicitRetry.promise);
  const onManualEntry = jest.fn();
  const screen = render(<QrScanner onScan={jest.fn()} onError={jest.fn()} onClose={jest.fn()} onManualEntry={onManualEntry} />);
  await act(async () => { initial.resolve(undetermined); });
  expect(mockRequestNativePermission).toHaveBeenCalledTimes(1);
  await act(async () => { firstRequest.resolve({ ...deniedAskable }); });
  expect(screen.getByText('Camera access is required to scan QR codes.')).toBeTruthy();
  expect(mockRequestNativePermission).toHaveBeenCalledTimes(1);

  fireEvent.press(screen.getByRole('button', { name: 'Grant camera permission' }));
  expect(mockRequestNativePermission).toHaveBeenCalledTimes(2);
  await act(async () => { explicitRetry.resolve({ ...deniedAskable }); });
  expect(mockRequestNativePermission).toHaveBeenCalledTimes(2);
  fireEvent.press(screen.getByRole('button', { name: 'Enter recipient address manually' }));
  expect(onManualEntry).toHaveBeenCalledTimes(1);
});

it('does not automatically request an already denied but askable permission', async () => {
  mockGetNativePermission.mockResolvedValue({ ...deniedAskable });
  const screen = render(<QrScanner onScan={jest.fn()} onError={jest.fn()} onClose={jest.fn()} />);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Grant camera permission' })).toBeTruthy();
  expect(mockRequestNativePermission).not.toHaveBeenCalled();
});

it('keeps a blocked denial on settings and manual guidance without requesting', async () => {
  mockGetNativePermission.mockResolvedValue(blocked);
  const onManualEntry = jest.fn();
  const screen = render(<QrScanner onScan={jest.fn()} onError={jest.fn()} onClose={jest.fn()} onManualEntry={onManualEntry} />);
  await act(async () => {});
  expect(screen.getByText('Please enable camera access in your device settings, then try again.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Grant camera permission' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Enter recipient address manually' }));
  expect(onManualEntry).toHaveBeenCalledTimes(1);
  expect(mockRequestNativePermission).not.toHaveBeenCalled();
});

it('mounts the granted camera after the first request without requesting again', async () => {
  mockGetNativePermission.mockResolvedValue(undetermined);
  const firstRequest = deferred();
  mockRequestNativePermission.mockImplementationOnce(() => firstRequest.promise);
  const screen = render(<QrScanner onScan={jest.fn()} onError={jest.fn()} onClose={jest.fn()} />);
  await act(async () => {});
  expect(mockRequestNativePermission).toHaveBeenCalledTimes(1);
  await act(async () => { firstRequest.resolve(granted); });
  expect(screen.getByTestId('native-camera-boundary')).toBeTruthy();
  expect(mockRequestNativePermission).toHaveBeenCalledTimes(1);
});
