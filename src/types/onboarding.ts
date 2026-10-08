/**
 * Onboarding Recovery State Model
 *
 * Defines the possible states during wallet onboarding (create/import)
 * and the recovery paths for each failure scenario.
 */

/** High-level onboarding phase */
export type OnboardingPhase = 'idle' | 'creating' | 'importing' | 'completed';

/** Recovery state when onboarding fails */
export type OnboardingRecoveryState =
  | { status: 'idle' }
  | { status: 'failed'; error: OnboardingError; phase: OnboardingPhase }
  | { status: 'storage_error'; error: StorageError; phase: OnboardingPhase }
  | { status: 'cancelled'; phase: OnboardingPhase };

/** Errors that can occur during wallet creation/import */
export type OnboardingError =
  | 'keypair_generation_failed'
  | 'invalid_secret_key'
  | 'duplicate_wallet'
  | 'existing_wallet'
  | 'secret_key_wrong_network'
  | 'import_validation_failed'
  | 'unknown_error';

/** Storage-specific errors during onboarding */
export type StorageError =
  | 'persist_failed'
  | 'secure_store_unavailable'
  | 'device_locked'
  | 'permission_denied'
  | 'storage_full';

/** User-friendly messages for each error type */
export const ONBOARDING_ERROR_MESSAGES: Record<OnboardingError, { title: string; message: string; guidance: string }> = {
  keypair_generation_failed: {
    title: 'Keypair Generation Failed',
    message: 'PocketPay could not generate a new keypair. This is a rare error that may indicate a system issue.',
    guidance: 'Try again. If this persists, restart the app or check that your device has sufficient entropy sources available.',
  },
  invalid_secret_key: {
    title: 'Invalid Secret Key',
    message: 'The secret key you entered is not valid. It may be corrupted or incorrectly formatted.',
    guidance: 'Double-check your secret key. It should be 56 characters starting with "S". Try copying it again from your backup.',
  },
  duplicate_wallet: {
    title: 'Wallet Already Imported',
    message: 'This wallet is already active on your device. It has not been imported again.',
    guidance: 'Return to your wallet. To restore a different one, first back up your existing wallet and use the explicit wallet-reset flow.',
  },
  existing_wallet: {
    title: 'A Wallet Is Already Active',
    message: 'A wallet is already set up on this device. Importing here would replace its stored key.',
    guidance: 'Back up your current wallet and use the explicit reset process before importing another secret key.',
  },
  // Legacy error key retained for compatibility; secret seeds do not encode a network.
  secret_key_wrong_network: {
    title: 'Network Setup Error',
    message: 'A network-related error was reported during wallet setup.',
    guidance: 'Use PocketPay only on Stellar Testnet. Check your connection and try again.',
  },
  import_validation_failed: {
    title: 'Import Failed',
    message: 'PocketPay could not validate or import this secret key.',
    guidance: 'Verify your secret key is correct and try again. If you continue to have issues, check that the key hasn\'t been compromised.',
  },
  unknown_error: {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred during wallet setup.',
    guidance: 'Try again. If this persists, restart the app and attempt the operation again.',
  },
};

/** User-friendly messages for storage errors */
export const STORAGE_ERROR_MESSAGES: Record<StorageError, { title: string; message: string; guidance: string }> = {
  persist_failed: {
    title: 'Could Not Save Wallet',
    message: 'PocketPay was unable to save your wallet to secure storage.',
    guidance: 'Check that your device has sufficient storage space and that the app has permission to use secure storage. Try again.',
  },
  secure_store_unavailable: {
    title: 'Secure Storage Unavailable',
    message: 'PocketPay cannot access secure storage on your device.',
    guidance: 'This can happen on rooted/jailbroken devices or when the keystore is corrupted. Restart the app and try again.',
  },
  device_locked: {
    title: 'Device Locked',
    message: 'Your device needs to be unlocked to access secure storage.',
    guidance: 'Unlock your device and try again. If you just restarted, wait a moment for the device to fully boot.',
  },
  permission_denied: {
    title: 'Permission Denied',
    message: 'PocketPay does not have permission to access secure storage.',
    guidance: 'Check your device settings to ensure PocketPay has the necessary permissions for secure storage.',
  },
  storage_full: {
    title: 'Storage Full',
    message: 'Your device storage is full and cannot save the wallet.',
    guidance: 'Free up some space on your device and try again.',
  },
};

/**
 * Normalize both a failed secure save and an unexpected rejected save to the
 * import screen's existing storage recovery state. Never pass through raw
 * provider exceptions; native keystores can include sensitive context.
 *
 * The store normally catches SecureStore failures and returns false. This
 * boundary also covers unforeseen rejections without misclassifying them as
 * SDK validation failures or displaying a success state.
 */
export async function saveImportedWalletWithRecovery(
  save: () => Promise<boolean>,
): Promise<StorageError | null> {
  try {
    return (await save()) === true ? null : 'persist_failed';
  } catch {
    return 'persist_failed';
  }
}

/**
 * Fail closed when an import would overwrite an existing active wallet.
 * Only public account identifiers reach this helper; never pass a secret seed.
 */
export function classifyWalletImportConflict(
  activePublicKey: string | null,
  incomingPublicKey: string,
): OnboardingError | null {
  if (!activePublicKey) return null;
  return activePublicKey === incomingPublicKey ? 'duplicate_wallet' : 'existing_wallet';
}

/**
 * Maps a raw error message to a typed OnboardingError.
 */
export function classifyOnboardingError(errorMessage: string): OnboardingError {
  const lower = errorMessage.toLowerCase();
  if (lower.includes('keypair') || lower.includes('generate')) {
    return 'keypair_generation_failed';
  }
  if (lower.includes('invalid') && lower.includes('secret')) {
    return 'invalid_secret_key';
  }
  if (lower.includes('network') || lower.includes('testnet')) {
    return 'secret_key_wrong_network';
  }
  return 'unknown_error';
}

/**
 * Maps a raw error message to a typed StorageError.
 */
export function classifyStorageError(errorMessage: string): StorageError {
  const lower = errorMessage.toLowerCase();
  if (lower.includes('secure') || lower.includes('keystore') || lower.includes('keychain')) {
    return 'secure_store_unavailable';
  }
  if (lower.includes('locked') || lower.includes('biometric')) {
    return 'device_locked';
  }
  if (lower.includes('permission') || lower.includes('denied')) {
    return 'permission_denied';
  }
  if (lower.includes('full') || lower.includes('space') || lower.includes('quota')) {
    return 'storage_full';
  }
  return 'persist_failed';
}

/**
 * Maps a WalletStorageErrors constant to a StorageError type.
 */
export function mapWalletErrorToStorageError(errorConstant: string): StorageError {
  if (errorConstant.includes('Failed to persist')) return 'persist_failed';
  if (errorConstant.includes('Failed to restore')) return 'secure_store_unavailable';
  if (errorConstant.includes('Failed to clear')) return 'persist_failed';
  if (errorConstant.includes('Failed to read')) return 'secure_store_unavailable';
  return 'persist_failed';
}
