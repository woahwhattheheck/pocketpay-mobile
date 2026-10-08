import {
  classifyWalletImportConflict,
  ONBOARDING_ERROR_MESSAGES,
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
});
