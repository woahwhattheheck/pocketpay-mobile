import React from 'react';
import { act, renderHook } from '@testing-library/react-native';

// lucide-react-native ships untransformed ESM; stub the icons ConfirmModal uses,
// as the other ConfirmModal/useConfirm suites do.
jest.mock('lucide-react-native', () => ({
  X: () => null,
  AlertTriangle: () => null,
}));

import { ConfirmModal, ConfirmModalProps } from '../src/components/ConfirmModal';
import { useConfirm } from '../src/hooks/useConfirm';

function activeDialog(result: { current: ReturnType<typeof useConfirm> }) {
  const dialog = result.current.confirmationDialog as React.ReactElement<ConfirmModalProps>;
  expect(dialog.type).toBe(ConfirmModal);
  return dialog.props;
}

describe('async confirmation failure and lifecycle', () => {
  it('does not resolve true on a rejected destructive action and permits retry', async () => {
    const { result } = renderHook(() => useConfirm());
    let attempts = 0;
    let decision!: Promise<boolean>;
    const settled = jest.fn();

    act(() => {
      decision = result.current.confirm({
        title: 'Delete Contact',
        message: 'Confirm deletion',
        destructive: true,
        onConfirm: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('private provider detail');
        },
      });
      void decision.then(settled);
    });

    await act(async () => {
      await expect(activeDialog(result).onConfirm()).rejects.toThrow('private provider detail');
    });
    expect(result.current.isVisible).toBe(true);
    expect(settled).not.toHaveBeenCalled();

    await act(async () => {
      await activeDialog(result).onConfirm();
    });
    expect(await decision).toBe(true);
    expect(settled).toHaveBeenCalledWith(true);
    expect(attempts).toBe(2);
    expect(result.current.isVisible).toBe(false);
  });

  it('cannot let a superseded dialog settle its replacement', async () => {
    const { result } = renderHook(() => useConfirm());
    const oldAction = jest.fn();
    const newAction = jest.fn();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.confirm({
        title: 'First',
        message: 'First operation',
        onConfirm: oldAction,
      });
    });
    const stale = activeDialog(result);

    act(() => {
      second = result.current.confirm({
        title: 'Second',
        message: 'New operation',
        onConfirm: newAction,
      });
    });
    expect(await first).toBe(false);

    await act(async () => {
      stale.onCancel();
      await stale.onConfirm();
    });
    expect(oldAction).not.toHaveBeenCalled();
    expect(newAction).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(true);
    expect(activeDialog(result).title).toBe('Second');

    act(() => activeDialog(result).onCancel());
    expect(await second).toBe(false);
  });

  it('blocks duplicate submits, cancellation and supersession during an in-flight action', async () => {
    const { result } = renderHook(() => useConfirm());
    let complete!: () => void;
    const work = new Promise<void>((resolve) => { complete = resolve; });
    const perform = jest.fn(() => work);
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.confirm({
        title: 'Save',
        message: 'Commit an action',
        onConfirm: perform,
      });
    });

    const modal = activeDialog(result);
    let pending!: Promise<void>;
    act(() => {
      pending = modal.onConfirm() as Promise<void>;
      void modal.onConfirm();
      modal.onCancel();
    });
    let rejectedNew!: Promise<boolean>;
    act(() => {
      rejectedNew = result.current.confirm({ title: 'Other', message: 'Other action' });
    });
    expect(await rejectedNew).toBe(false);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(result.current.isVisible).toBe(true);

    await act(async () => {
      complete();
      await pending;
    });
    expect(await first).toBe(true);
    expect(result.current.isVisible).toBe(false);
  });
});
