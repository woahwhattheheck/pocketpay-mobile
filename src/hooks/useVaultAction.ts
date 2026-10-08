import { useCallback, useState } from 'react';
import type { VaultActionState, VaultActionStatus } from '../types/vault';

interface VaultActionSteps<TSigned, TResult> {
  sign: () => Promise<TSigned>;
  submit: (signed: TSigned) => Promise<{ txHash: string }>;
  confirm: (txHash: string) => Promise<TResult>;
}

/**
 * useVaultAction
 *
 * Drives a single vault action (deposit, lock, or withdraw) through a
 * well-defined progress state machine: signing -> submission -> pending -> confirmed.
 * Failure at any step transitions to 'failed' with the error message attached.
 *
 * Reusable across all vault action types — pass in the sign/submit/confirm
 * functions specific to the action being performed.
 */
export function useVaultAction<TSigned = unknown, TResult = unknown>() {
  const [status, setStatus] = useState<VaultActionStatus>({ state: 'idle' });

  const run = useCallback(async (steps: VaultActionSteps<TSigned, TResult>): Promise<VaultActionStatus> => {
    let acceptedHash: string | undefined;
    try {
      setStatus({ state: 'signing' });
      const signed = await steps.sign();

      setStatus({ state: 'submission' });
      const { txHash } = await steps.submit(signed);
      acceptedHash = txHash || undefined;

      setStatus({ state: 'pending', txHash: acceptedHash });
      await steps.confirm(txHash);

      const complete: VaultActionStatus = { state: 'confirmed', txHash: acceptedHash };
      setStatus(complete);
      return complete;
    } catch (err) {
      // A confirmation error after submission is not proof of a failed transaction.
      // Keep the known hash and mark the outcome pending so users won't retry blindly.
      const result: VaultActionStatus = {
        state: acceptedHash ? 'pending' : 'failed',
        txHash: acceptedHash,
        error: err instanceof Error ? err.message : 'Unable to complete the vault action.',
      };
      setStatus(result);
      return result;
    }
  }, []);

  const reset = useCallback(() => setStatus({ state: 'idle' }), []);

  const state: VaultActionState = status.state;
  const isBusy = state === 'signing' || state === 'submission' || state === 'pending';

  return { status, state, isBusy, run, reset };
}
