// VALIDATION ONLY: install before vault/stores/router in the disposable dev app.
// Expo's live exports are read-only. Keep every unselected descriptor intact;
// make only the existing dummy-generator/write-blocker slots assignable.
const metroRequire = globalThis.__r;
if (typeof metroRequire !== 'function' || typeof metroRequire.getModules !== 'function') {
  throw new Error('Dummy Stellar export guard requires the validation Metro dev runtime.');
}
const matches = [...metroRequire.getModules().values()]
  .filter(record => record.verboseName === 'src/services/stellar.ts');
if (matches.length !== 1) throw new Error('Dummy Stellar export guard requires one exact source module.');
const record = matches[0];
if (record.isInitialized !== false || record.hasError !== false || typeof record.factory !== 'function') {
  throw new Error('Dummy Stellar export guard must install before the source module loads.');
}
const sourceFactory = record.factory;
const guardedNames = new Set(['generateKeypair', 'mockDepositToVault', 'mockWithdrawFromVault']);
const pendingGuard = () => {
  throw new Error('Dummy Stellar fixture has not installed its generator/write blockers.');
};
const guardedFactory = function(...args) {
  sourceFactory.apply(this, args);
  const module = args[4];
  const originalExports = module.exports;
  const guardedExports = {};
  for (const key of Reflect.ownKeys(originalExports)) {
    const descriptor = Object.getOwnPropertyDescriptor(originalExports, key);
    if (guardedNames.has(key)) {
      if (typeof originalExports[key] !== 'function') {
        throw new Error('Dummy Stellar guard expected its pinned function export.');
      }
      Object.defineProperty(guardedExports, key, {
        enumerable: descriptor.enumerable, configurable: false, writable: true, value: pendingGuard,
      });
    } else {
      Object.defineProperty(guardedExports, key, descriptor);
    }
  }
  for (const name of guardedNames) {
    if (guardedExports[name] !== pendingGuard) throw new Error('Dummy Stellar blocking slot did not install.');
  }
  module.exports = guardedExports;
  if (module.exports !== guardedExports) throw new Error('Dummy Stellar namespace guard did not install.');
};
record.factory = guardedFactory;
if (record.factory !== guardedFactory) throw new Error('Dummy Stellar preload guard did not install.');
