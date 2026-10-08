import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm action in the error colour and shows the warning icon. */
  destructive?: boolean;
  icon?: React.ReactNode;
  /**
   * Work to run while the dialog stays open in its busy state. When omitted the
   * dialog closes as soon as the user confirms and `confirm()` resolves `true`.
   */
  onConfirm?: () => void | Promise<void>;
}

export interface UseConfirmResult {
  /**
   * Opens the dialog and resolves `true` once the user confirms (and any
   * `onConfirm` work settles), or `false` if they dismiss it.
   */
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  /** Render this inside the component tree for the dialog to appear. */
  confirmationDialog: React.ReactElement | null;
  isVisible: boolean;
}

/**
 * Imperative confirmation dialog backed by {@link ConfirmModal}.
 *
 * Replaces ad-hoc `Alert.alert(..., [{ style: 'destructive' }])` call sites so
 * confirmations look, behave, and read to assistive tech the same everywhere —
 * while still supporting the one thing the native alert cannot do: keeping the
 * dialog open with a spinner while async work completes.
 *
 * ```tsx
 * const { confirm, confirmationDialog } = useConfirm();
 *
 * const handleDelete = async (contact: Contact) => {
 *   await confirm({
 *     title: 'Delete Contact',
 *     message: `Remove "${contact.name}" from your contacts?`,
 *     confirmLabel: 'Delete',
 *     destructive: true,
 *     onConfirm: () => deleteContact(contact.id),
 *   });
 * };
 *
 * return <>{...}{confirmationDialog}</>;
 * ```
 */
export function useConfirm(): UseConfirmResult {
  // Each request has its own identity: a late callback from an older dialog
  // must never acknowledge or dismiss a different confirmation.
  const [request, setRequest] = useState<(ConfirmRequest & { id: number }) | null>(null);
  const requestRef = useRef<(ConfirmRequest & { id: number }) | null>(null);
  const requestIdRef = useRef(0);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const confirmingIdRef = useRef<number | null>(null);

  const settle = useCallback((id: number, confirmed: boolean) => {
    if (requestRef.current?.id !== id) return;
    const resolve = resolverRef.current;
    resolverRef.current = null;
    requestRef.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((next: ConfirmRequest): Promise<boolean> => {
    // Do not replace an in-flight destructive action. It may have committed
    // side effects even though its promise has not settled yet.
    if (confirmingIdRef.current !== null) return Promise.resolve(false);

    // Superseding an idle request resolves the prior caller as cancelled.
    resolverRef.current?.(false);
    const active = { ...next, id: ++requestIdRef.current };
    requestRef.current = active;
    setRequest(active);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(async (id: number) => {
    const pending = requestRef.current;
    if (!pending || pending.id !== id || confirmingIdRef.current !== null) return;

    confirmingIdRef.current = id;
    try {
      await pending.onConfirm?.();
      // Only a completed action can report success. On rejection the dialog
      // remains open, so the user can retry or cancel instead of getting true.
      settle(id, true);
    } finally {
      if (confirmingIdRef.current === id) confirmingIdRef.current = null;
    }
  }, [settle]);

  const handleCancel = useCallback((id: number) => {
    if (confirmingIdRef.current !== null) return;
    settle(id, false);
  }, [settle]);

  const confirmationDialog = useMemo(() => {
    if (!request) return null;

    return (
      <ConfirmModal
        key={request.id}
        visible
        title={request.title}
        message={request.message}
        confirmLabel={request.confirmLabel ?? 'Confirm'}
        cancelLabel={request.cancelLabel ?? 'Cancel'}
        destructive={request.destructive}
        icon={request.icon}
        onConfirm={() => handleConfirm(request.id)}
        onCancel={() => handleCancel(request.id)}
      />
    );
  }, [request, handleConfirm, handleCancel]);

  return { confirm, confirmationDialog, isVisible: request !== null };
}
