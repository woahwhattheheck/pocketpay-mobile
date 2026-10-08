import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ReceiveQrBoundary } from '../src/components/ReceiveQrBoundary';

const BrokenQr: React.FC = () => {
  throw new Error('QR renderer failed: memo is private');
};

describe('ReceiveQrBoundary', () => {
  beforeEach(() => {
    // React logs expected error-boundary catches as console errors in tests.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a safe fallback without echoing the QR library exception', () => {
    const unavailable = jest.fn();
    const ready = jest.fn();
    const tree = render(
      <ReceiveQrBoundary
        fallback={<Text>QR unavailable — copy or share address</Text>}
        onUnavailable={unavailable}
        onReady={ready}
      >
        <BrokenQr />
      </ReceiveQrBoundary>
    );

    expect(tree.getByText('QR unavailable — copy or share address')).toBeTruthy();
    expect(tree.queryByText(/memo is private/)).toBeNull();
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(ready).not.toHaveBeenCalled();
  });

  it('retries the QR child when the payment request payload changes', () => {
    const unavailable = jest.fn();
    const ready = jest.fn();
    const tree = render(
      <ReceiveQrBoundary
        key="bad-payload"
        fallback={<Text>QR unavailable</Text>}
        onUnavailable={unavailable}
        onReady={ready}
      >
        <BrokenQr />
      </ReceiveQrBoundary>
    );

    expect(tree.getByText('QR unavailable')).toBeTruthy();

    tree.rerender(
      <ReceiveQrBoundary
        key="new-payload"
        fallback={<Text>QR unavailable</Text>}
        onUnavailable={unavailable}
        onReady={ready}
      >
        <Text>QR displayed again</Text>
      </ReceiveQrBoundary>
    );

    expect(tree.getByText('QR displayed again')).toBeTruthy();
    expect(tree.queryByText('QR unavailable')).toBeNull();
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
