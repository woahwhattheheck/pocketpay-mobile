import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockRequestPermission = jest.fn();
let mockPermission: { granted: boolean; canAskAgain: boolean } | null = null;
let mockMountError: ((event: { message: string }) => void) | undefined;
let mockScan: ((event: { type: string; data: string }) => void) | undefined;

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
  CameraView: ({ onMountError, onBarcodeScanned }: any) => {
    const { View } = require('react-native');
    mockMountError = onMountError;
    mockScan = onBarcodeScanned;
    return <View testID="native-camera" />;
  },
}));
jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({ colors: require('../src/constants/theme').COLORS }),
}));

import ScanScreen from '../app/scan';

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = null;
  mockMountError = undefined;
  mockScan = undefined;
});

describe('#297 – generic scanner permission and camera states', () => {
  it('offers manual entry while permission is loading', () => {
    const screen = render(<ScanScreen />);
    expect(screen.getByText('Preparing Camera')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Enter recipient address manually' }));
    expect(mockReplace).toHaveBeenCalledWith('/send');
  });

  it('offers a permission request and manual entry after denial', () => {
    mockPermission = { granted: false, canAskAgain: true };
    const screen = render(<ScanScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Request camera permission' }));
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Enter recipient address manually' }));
    expect(mockReplace).toHaveBeenCalledWith('/send');
  });

  it('explains device settings when permission cannot be requested again', () => {
    mockPermission = { granted: false, canAskAgain: false };
    const screen = render(<ScanScreen />);
    expect(screen.getByText(/device settings/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request camera permission' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Enter recipient address manually' }));
    expect(mockReplace).toHaveBeenCalledWith('/send');
  });

  it('replaces a failed native camera with usable manual entry', () => {
    mockPermission = { granted: true, canAskAgain: false };
    const screen = render(<ScanScreen />);
    act(() => mockMountError?.({ message: 'No camera available' }));
    expect(screen.getByText('Camera Unavailable')).toBeTruthy();
    expect(screen.queryByTestId('native-camera')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Enter recipient address manually' }));
    expect(mockReplace).toHaveBeenCalledWith('/send');
  });

  it('keeps the successful scan handoff to Send without submitting a payment', () => {
    mockPermission = { granted: true, canAskAgain: false };
    render(<ScanScreen />);
    act(() => mockScan?.({ type: 'qr', data: 'dummy address' }));
    expect(mockReplace).toHaveBeenCalledWith('/send?destination=dummy%20address');
  });
});
