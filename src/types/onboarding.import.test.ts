import {
  classifyWalletImportConflict,
  saveImportedWalletWithRecovery,
  ONBOARDING_ERROR_MESSAGES,
  STORAGE_ERROR_MESSAGES,
} from './onboarding';

describe('wallet import safety', () => {
  const activeAccount = 'GACTIVEACCOUNT';
  const anotherAccount = 'GOTHERACCOUNT';

  it('permits importing into an empty wallet state', () => {
    expect(classifyWalletImportConflict(null, activeAccount)).toBeNull();
  });

  it('rejects duplicate imports without replacing the active secret', () => {
    expect(classifyWalletImportConflict(activeAccount, activeAccount)).toBe('duplicate_wallet');
  });

  it('rejects overwriting a different active wallet', () => {
    expect(classifyWalletImportConflict(activeAccount, anotherAccount)).toBe('existing_wallet');
  });

  it('uses fixed, non-sensitive guidance for both rejection states', () => {
    const sensitiveSeed = 'S' + 'A'.repeat(55);
    for (const code of ['duplicate_wallet', 'existing_wallet'] as const) {
      const message = ONBOARDING_ERROR_MESSAGES[code];
      expect(message.title).toBeTruthy();
      expect(message.guidance).toContain('reset');
      expect([message.title, message.message, message.guidance].join(' ')).not.toContain(sensitiveSeed);
    }
  });
  it('activates the success path only after a confirmed secure save', async () => {
    expect(await saveImportedWalletWithRecovery(async () => true)).toBeNull();
  });

  it('classifies the existing false-return storage failure as recoverable', async () => {
    expect(await saveImportedWalletWithRecovery(async () => false)).toBe('persist_failed');
  });

  it('turns a rejected secure write into a fixed storage error without echoing secrets', async () => {
    const seed = 'S' + 'A'.repeat(55);
    const failure = await saveImportedWalletWithRecovery(async () => {
      throw new Error('SecureStore failed with private seed ' + seed);
    });
    expect(failure).toBe('persist_failed');
    expect(STORAGE_ERROR_MESSAGES[failure!].message).not.toContain(seed);
  });
});
