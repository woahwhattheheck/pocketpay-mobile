import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { useWalletStore } from '../src/store/walletStore';
import { useVaultStore } from '../src/store/vaultStore';
import { useVaultStore as useWithdrawalStore } from '../src/features/vault/vaultStore';
import { mockFetchVaultBalance, mockFetchVaultMaturedLocks, mockWithdrawFromVault } from '../src/services/stellar';
import VaultScreen from '../app/(tabs)/vault';

jest.mock('../src/services/stellar');
jest.mock('../src/store/walletStore');
jest.mock('../src/store/vaultStore');
jest.mock('../src/hooks/useNetworkState', () => ({
  useNetworkState: () => ({ state: 'online', disableWriteActions: false, retry: jest.fn() }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => 'true'),
  setItem: jest.fn(async () => {}),
}));
jest.mock('../src/services/vault', () => ({
  isVaultConfigured: jest.fn(() => true),
  getVaultContractId: jest.fn(() => 'CABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'),
}));

process.env.EXPO_PUBLIC_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
const VALID_AMOUNT = '10';
const mockDeposit = jest.fn();
const mockWithdraw = jest.fn();
const mockLoadBalance = jest.fn();
const mockLoadLocks = jest.fn();
const mockAddLock = jest.fn();
const mockUseWalletStore = jest.mocked(useWalletStore);
const mockUseVaultStore = jest.mocked(useVaultStore);

function setupStores(overrides: Record<string, unknown> = {}) {
  const walletState = {
    publicKey: 'GPUBLIC123', balance: '100.0000000',
    getSecretKey: jest.fn(async () => 'SVALIDSECRET'), ...overrides,
  };
  const vaultState = {
    balance: '50.0000000', locks: [], isConfigured: true,
    contractId: 'CABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
    isLoadingBalance: false, isLoadingLocks: false, isSubmitting: false,
    balanceError: null, vaultError: null, loadBalance: mockLoadBalance,
    loadLocks: mockLoadLocks, addLock: mockAddLock, unlockLock: jest.fn(),
    deposit: mockDeposit, withdraw: mockWithdraw, withdrawMaturedLock: jest.fn(),
    clearVaultError: jest.fn(), ...overrides,
  };
  mockUseWalletStore.mockImplementation((selector?: any) =>
    typeof selector === 'function' ? selector(walletState) : walletState as any);
  mockUseVaultStore.mockImplementation((selector?: any) =>
    typeof selector === 'function' ? selector(vaultState) : vaultState as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDeposit.mockResolvedValue('tx_hash_1234567890abcdef');
  mockWithdraw.mockResolvedValue('unexpected-withdrawal');
  mockAddLock.mockResolvedValue(undefined);
  jest.mocked(mockFetchVaultBalance).mockResolvedValue('50.0000000');
  jest.mocked(mockFetchVaultMaturedLocks).mockResolvedValue([]);
  jest.mocked(mockWithdrawFromVault).mockResolvedValue(true);
  useWithdrawalStore.setState({
    vaultBalance: '50.0000000', maturedLocks: [], isWithdrawing: false,
    withdrawalError: null, selectedWithdrawalType: null, selectedLockId: null,
  });
  setupStores();
});

function openDeposit(ui: ReturnType<typeof render>) {
  fireEvent.changeText(ui.getByPlaceholderText('0.00'), VALID_AMOUNT);
  fireEvent.press(ui.getByText('Deposit'));
}

async function reviewAvailableWithdrawal(ui: ReturnType<typeof render>) {
  fireEvent.press(ui.getByText('Withdraw'));
  await waitFor(() => expect(ui.getAllByText('50.0000000 XLM').length).toBeGreaterThan(0));
  fireEvent.press(ui.getByText('Withdraw Available'));
  expect(ui.getByText('Review Withdrawal')).toBeTruthy();
}

describe('vault review and submission', () => {
  it('reviews the amount and remaining wallet balance before depositing', () => {
    const ui = render(<VaultScreen />);
    openDeposit(ui);
    expect(ui.getByText('Deposit to Vault')).toBeTruthy();
    expect(ui.getByText('Confirm Deposit')).toBeTruthy();
    expect(ui.getByText('90.0000000 XLM')).toBeTruthy();
    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('reviews the withdrawal source before submitting', async () => {
    const ui = render(<VaultScreen />);
    await reviewAvailableWithdrawal(ui);
    expect(ui.getByText('Confirm Withdrawal')).toBeTruthy();
    expect(mockWithdrawFromVault).not.toHaveBeenCalled();
  });

  it('requests confirmation before creating a lock', () => {
    const ui = render(<VaultScreen />);
    fireEvent.changeText(ui.getByPlaceholderText('0.00'), VALID_AMOUNT);
    fireEvent.press(ui.getByText('Set Aside for 30 Days'));
    expect(ui.getAllByText('Confirm Lock')).toHaveLength(2);
    expect(mockAddLock).not.toHaveBeenCalled();
  });

  it('submits a confirmed deposit with the wallet secret and requested amount', async () => {
    const ui = render(<VaultScreen />);
    openDeposit(ui);
    fireEvent.press(ui.getByText('Confirm Deposit'));
    await waitFor(() => expect(mockDeposit).toHaveBeenCalledWith('SVALIDSECRET', 'GPUBLIC123', VALID_AMOUNT));
    expect(mockDeposit).toHaveBeenCalledTimes(1);
  });

  it('submits the full available withdrawal selected in the preview', async () => {
    const ui = render(<VaultScreen />);
    await reviewAvailableWithdrawal(ui);
    fireEvent.press(ui.getByText('Confirm Withdrawal'));
    await waitFor(() => expect(mockWithdrawFromVault).toHaveBeenCalledWith('SVALIDSECRET', '50.0000000'));
  });

  it('submits the selected matured lock amount', async () => {
    const maturedLock = { id: 'matured-lock', amount: '7.5000000', unlockedAt: '2025-01-01T00:00:00Z' };
    useWithdrawalStore.setState({ maturedLocks: [maturedLock] });
    const ui = render(<VaultScreen />);
    fireEvent.press(ui.getByText('Withdraw'));
    await waitFor(() => expect(ui.getByText('Withdraw This Lock')).toBeTruthy());
    fireEvent.press(ui.getByText('Withdraw This Lock'));
    fireEvent.press(ui.getByText('Confirm Withdrawal'));
    await waitFor(() => expect(mockWithdrawFromVault).toHaveBeenCalledWith('SVALIDSECRET', '7.5000000'));
  });
});

describe('vault loading and duplicate submission', () => {
  it('disables further deposits while the request is in flight', async () => {
    let finishDeposit!: (value: string) => void;
    mockDeposit.mockImplementationOnce(() => new Promise<string>((resolve) => { finishDeposit = resolve; }));
    const ui = render(<VaultScreen />);
    openDeposit(ui);
    fireEvent.press(ui.getByText('Confirm Deposit'));
    await waitFor(() => expect(ui.getByText('Depositing…')).toBeDisabled());
    fireEvent.press(ui.getByText('Depositing…'));
    expect(mockDeposit).toHaveBeenCalledTimes(1);
    expect(ui.queryByText('Confirm Deposit')).toBeNull();
    await act(async () => { finishDeposit('completed-deposit'); });
  });

  it('disables the lock button and explains that it is loading', () => {
    const ui = render(<VaultScreen />);
    fireEvent.changeText(ui.getByPlaceholderText('0.00'), VALID_AMOUNT);
    fireEvent.press(ui.getByText('Set Aside for 30 Days'));
    setupStores({ isSubmitting: true });
    ui.rerender(<VaultScreen />);
    expect(ui.getByText('Locking…')).toBeDisabled();
  });

  it('explains deposit processing in the preview while the store is submitting', () => {
    const ui = render(<VaultScreen />);
    openDeposit(ui);
    setupStores({ isSubmitting: true });
    ui.rerender(<VaultScreen />);
    expect(ui.getByText('Processing deposit...')).toBeTruthy();
    expect(ui.getByText('Cancel')).toBeDisabled();
  });
});

describe('vault result feedback', () => {
  it('shows a success receipt with the deposit transaction hash', async () => {
    const ui = render(<VaultScreen />);
    openDeposit(ui);
    fireEvent.press(ui.getByText('Confirm Deposit'));
    await waitFor(() => expect(ui.getByText('Transaction Receipt')).toBeTruthy());
    expect(ui.getByText('Success')).toBeTruthy();
    expect(ui.getByText('tx_hash_1234567890abcdef')).toBeTruthy();
    expect(ui.getByText('10 XLM')).toBeTruthy();
    expect(ui.queryByText('Confirm Deposit')).toBeNull();
  });

  it('shows deposit failure and closes the review', async () => {
    mockDeposit.mockRejectedValueOnce(new Error('insufficient funds'));
    const ui = render(<VaultScreen />);
    openDeposit(ui);
    fireEvent.press(ui.getByText('Confirm Deposit'));
    await waitFor(() => expect(ui.getByText('insufficient funds')).toBeTruthy());
    expect(ui.getByText('Transaction Receipt')).toBeTruthy();
    expect(ui.getByText('Failed')).toBeTruthy();
    expect(ui.queryByText('Confirm Deposit')).toBeNull();
  });

  it('shows withdrawal errors in the review without reporting success', async () => {
    jest.mocked(mockWithdrawFromVault).mockRejectedValueOnce(new Error('network error'));
    const ui = render(<VaultScreen />);
    await reviewAvailableWithdrawal(ui);
    fireEvent.press(ui.getByText('Confirm Withdrawal'));
    await waitFor(() => expect(ui.getByText('network error')).toBeTruthy());
    expect(ui.getByText('Review Withdrawal')).toBeTruthy();
    expect(ui.queryByText('Success')).toBeNull();
  });

  it('returns to source selection after a successful preview withdrawal', async () => {
    const ui = render(<VaultScreen />);
    await reviewAvailableWithdrawal(ui);
    fireEvent.press(ui.getByText('Confirm Withdrawal'));
    await waitFor(() => expect(useWithdrawalStore.getState()).toMatchObject({
      selectedWithdrawalType: null, withdrawalError: null, isWithdrawing: false,
    }));
    await waitFor(() => expect(ui.queryByText('Review Withdrawal')).toBeNull());
    expect(mockWithdrawFromVault).toHaveBeenCalledTimes(1);
    expect(ui.getByText('Select Withdrawal Source')).toBeTruthy();
  });

  it('records the lock and identifies its mock transaction in the receipt', async () => {
    const ui = render(<VaultScreen />);
    fireEvent.changeText(ui.getByPlaceholderText('0.00'), VALID_AMOUNT);
    fireEvent.press(ui.getByText('Set Aside for 30 Days'));
    fireEvent.press(ui.getAllByText('Confirm Lock')[1]);
    await waitFor(() => expect(ui.getByText('Transaction Receipt')).toBeTruthy());
    expect(mockAddLock).toHaveBeenCalledWith(VALID_AMOUNT, expect.any(String));
    expect(ui.getByText('Success')).toBeTruthy();
    expect(ui.getByText('mock-lock')).toBeTruthy();
  });

  it('keeps the reviewed lock action when native confirmation supplies a press event', async () => {
    const ui = render(<VaultScreen />);
    fireEvent.changeText(ui.getByPlaceholderText('0.00'), VALID_AMOUNT);
    fireEvent.press(ui.getByText('Set Aside for 30 Days'));
    fireEvent.press(ui.getAllByText('Confirm Lock')[1], {
      nativeEvent: { target: 1, timestamp: 42, pageX: 140, pageY: 200 },
    });

    await waitFor(() => expect(mockAddLock).toHaveBeenCalledTimes(1));
    expect(mockAddLock).toHaveBeenCalledWith(VALID_AMOUNT, expect.any(String));
    expect(mockWithdraw).not.toHaveBeenCalled();
    expect(mockDeposit).not.toHaveBeenCalled();
    expect(ui.getByText('Transaction Receipt')).toBeTruthy();
    expect(ui.getByText('Success')).toBeTruthy();
    expect(ui.getByText('mock-lock')).toBeTruthy();
  });

  it('cancels the deposit review without submitting', () => {
    const ui = render(<VaultScreen />);
    openDeposit(ui);
    fireEvent.press(ui.getByText('Cancel'));
    expect(ui.queryByText('Confirm Deposit')).toBeNull();
    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('dismisses the receipt when Done is pressed', async () => {
    const ui = render(<VaultScreen />);
    openDeposit(ui);
    fireEvent.press(ui.getByText('Confirm Deposit'));
    await waitFor(() => expect(ui.getByText('Transaction Receipt')).toBeTruthy());
    fireEvent.press(ui.getByText('Done'));
    expect(ui.queryByText('Transaction Receipt')).toBeNull();
  });
});

describe('vault validation and availability', () => {
  it('does not open deposit review for an empty amount', () => {
    const ui = render(<VaultScreen />);
    fireEvent.press(ui.getByText('Deposit'));
    expect(ui.queryByText('Confirm Deposit')).toBeNull();
    expect(ui.getByText('Please enter an amount.')).toBeTruthy();
  });

  it('does not open deposit review when the amount exceeds the wallet balance', () => {
    const ui = render(<VaultScreen />);
    fireEvent.changeText(ui.getByPlaceholderText('0.00'), '9999');
    fireEvent.press(ui.getByText('Deposit'));
    expect(ui.queryByText('Confirm Deposit')).toBeNull();
    expect(ui.getByText("You don't have enough XLM for this payment.")).toBeTruthy();
  });

  it('guides users to create a wallet when no public key is available', () => {
    setupStores({ publicKey: null });
    const ui = render(<VaultScreen />);
    expect(ui.getByText('Vault Unavailable')).toBeTruthy();
    expect(ui.getByText('Create or import a wallet to use the Soroban Savings Vault.')).toBeTruthy();
    expect(ui.queryByText('Set Aside for 30 Days')).toBeNull();
    expect(mockLoadBalance).not.toHaveBeenCalled();
    expect(mockLoadLocks).not.toHaveBeenCalled();
  });

  it('explains when the vault is disabled by configuration', () => {
    const originalEnv = process.env.EXPO_PUBLIC_VAULT_ENABLED;
    process.env.EXPO_PUBLIC_VAULT_ENABLED = 'false';
    try {
      const ui = render(<VaultScreen />);
      expect(ui.getByText('Vault Unavailable')).toBeTruthy();
      expect(ui.getByText('The vault is currently disabled by configuration. This may be temporary while the backend is being updated.')).toBeTruthy();
      expect(ui.queryByText('Set Aside for 30 Days')).toBeNull();
    } finally {
      if (originalEnv === undefined) delete process.env.EXPO_PUBLIC_VAULT_ENABLED;
      else process.env.EXPO_PUBLIC_VAULT_ENABLED = originalEnv;
    }
  });
});
