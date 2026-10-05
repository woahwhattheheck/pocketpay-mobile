import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { BalanceRefreshFeedback } from '../src/components/BalanceRefreshFeedback';
import type { BalanceRefreshStatus } from '../src/types/balanceRefresh';

jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { textSecondary: '#222' } }),
}));
jest.mock('../src/components/Button', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return {
    Button: ({ title, variant: _variant, ...props }: any) =>
      React.createElement(TouchableOpacity, props, React.createElement(Text, null, title)),
  };
});

function fixture(status: BalanceRefreshStatus) {
  return { status, requestId: 1, lastSucceededAt: 1 };
}

test('loading and offline feedback explain the cached value and disable refresh', () => {
  const retry = jest.fn();
  const view = render(<BalanceRefreshFeedback state={fixture('loading')} onRetry={retry} />);
  expect(view.getByText(/Showing your last successful balance/)).toBeTruthy();
  expect(view.getByRole('button').props.accessibilityState).toEqual({ disabled: true, busy: true });
  fireEvent.press(view.getByRole('button'));
  view.rerender(<BalanceRefreshFeedback state={fixture('offline')} onRetry={retry} />);
  expect(view.getByText(/You are offline/)).toBeTruthy();
  expect(view.getByRole('button').props.accessibilityState).toEqual({ disabled: true, busy: false });
  fireEvent.press(view.getByRole('button'));
  expect(retry).not.toHaveBeenCalled();
});

test('failed feedback offers an accessible retry without hiding the cached-value warning', () => {
  const retry = jest.fn();
  const view = render(<BalanceRefreshFeedback state={fixture('failed')} onRetry={retry} />);
  expect(view.getByText(/Balance refresh failed.*last successful balance/)).toBeTruthy();
  const button = view.getByRole('button', { name: 'Refresh balance' });
  expect(button.props.accessibilityState).toEqual({ disabled: false, busy: false });
  fireEvent.press(button);
  expect(retry).toHaveBeenCalledTimes(1);
});
