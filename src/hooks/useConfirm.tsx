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

interface ActiveConfirmation {
  request: ConfirmRequest;
  resolve: (confirmed: boolean) => void;
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
  const [active, setActive] = useState<ActiveConfirmation | null>(null);
  const activeRef = useRef<ActiveConfirmation | null>(null);
  const request = active?.request ?? null;

  const settle = useCallback((expected: ActiveConfirmation, confirmed: boolean) => {
    // A superseded callback must not close or resolve the replacement request.
    if (activeRef.current !== expected) return;
    activeRef.current = null;
    setActive(null);
    expected.resolve(confirmed);
  }, []);

  const confirm = useCallback(
    (next: ConfirmRequest) => {
      // A second request while one is open supersedes it; the superseded caller
      // resolves `false` so its promise never dangles.
      activeRef.current?.resolve(false);

      return new Promise<boolean>((resolve) => {
        // Every invocation has its own identity, even if options are reused.
        const pending = { request: next, resolve };
        activeRef.current = pending;
        setActive(pending);
      });
    },
    [],
  );

  const handleConfirm = useCallback(async () => {
    // Ignore stale rendered handlers, and retain this identity across the await.
    const pending = active;
    if (!pending || activeRef.current !== pending) return;

    try {
      await pending.request.onConfirm?.();
    } finally {
      settle(pending, true);
    }
  }, [active, settle]);

  const handleCancel = useCallback(() => {
    if (active) settle(active, false);
  }, [active, settle]);

  const confirmationDialog = useMemo(() => {
    if (!request) return null;

    return (
      <ConfirmModal
        visible
        title={request.title}
        message={request.message}
        confirmLabel={request.confirmLabel ?? 'Confirm'}
        cancelLabel={request.cancelLabel ?? 'Cancel'}
        destructive={request.destructive}
        icon={request.icon}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  }, [request, handleConfirm, handleCancel]);

  return { confirm, confirmationDialog, isVisible: request !== null };
}
