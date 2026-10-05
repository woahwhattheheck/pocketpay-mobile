import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useWalletStore } from '../store/walletStore';
import { BALANCE_STALE_AFTER_MS } from '../types/balanceRefresh';

/** Reuse the screen's connectivity signal; this hook adds no network polling. */
export function useBalanceRefresh(isOnline: boolean) {
  const publicKey = useWalletStore(state => state.publicKey);
  const state = useWalletStore(wallet => wallet.balanceRefresh);
  const refresh = useWalletStore(wallet => wallet.refreshWalletData);
  const setConnectivity = useWalletStore(wallet => wallet.setBalanceConnectivity);
  const markStale = useWalletStore(wallet => wallet.markBalanceStale);

  useEffect(() => {
    setConnectivity(isOnline);
    if (publicKey) void refresh();
  }, [publicKey, isOnline, setConnectivity, refresh]);

  useEffect(() => {
    if (state.status !== 'refreshed' || state.lastSucceededAt === null) return;
    markStale();
    const timer = setTimeout(markStale, Math.max(0,
      state.lastSucceededAt + BALANCE_STALE_AFTER_MS - Date.now()));
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') markStale();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [state.status, state.lastSucceededAt, markStale]);

  return { state, refresh };
}
