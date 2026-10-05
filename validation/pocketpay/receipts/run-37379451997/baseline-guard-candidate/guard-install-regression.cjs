// Read-only local proof. All production operations are forbidden stubs; the
// frozen fixtures may derive only their existing public deterministic seeds.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const product = path.resolve(process.argv[2] || '../pocketpay-infra-repair');
const frozen = path.resolve(process.argv[3] || '../pocketpay-remote-native-controller-kvm-next/validation/pocketpay/baseline/baseline-fixture');
const candidate = path.join(__dirname, 'fixture');
const req = createRequire(path.join(product, 'package.json'));
const transform = req('@expo/metro-config/build/babel-transformer').transform;
const { applyImportSupport } = req('@expo/metro-config/build/transform-worker/metro-transform-worker');
const generate = req('@babel/generator').default;
const options = {
  dev: true, platform: 'android', type: 'module', projectRoot: product,
  experimentalImportSupport: true, inlineRequires: false,
  customTransformOptions: { engine: 'hermes', routerRoot: 'app' },
  enableBabelRCLookup: true, unstable_transformProfile: 'hermes-stable',
};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pins = JSON.parse(fs.readFileSync(path.join(frozen, 'source-manifest.json'), 'utf8'));
for (const [relative, digest] of Object.entries(pins.sourceFiles)) {
  assert.equal(sha(fs.readFileSync(path.join(product, relative))), digest, relative);
}
const runtimePath = req.resolve('metro-runtime/src/polyfills/require.js');
const runtime = fs.readFileSync(runtimePath, 'utf8');
const source = fs.readFileSync(path.join(product, 'src/services/stellar.ts'), 'utf8');
const seam = fs.readFileSync(path.join(candidate, 'native-baseline-stellar-guard.js'), 'utf8');
const vault = fs.readFileSync(path.join(frozen, 'native-vault-bootstrap.js'), 'utf8');
const candidateVault = fs.readFileSync(path.join(candidate, 'native-vault-bootstrap.js'), 'utf8');
const baseline = fs.readFileSync(path.join(frozen, 'native-baseline-bootstrap.js'), 'utf8');
const entry = fs.readFileSync(path.join(candidate, 'native-baseline-entry.js'), 'utf8');
assert.ok(entry.indexOf("require('./native-baseline-stellar-guard')") < entry.indexOf("require('./native-vault-bootstrap')"));
assert.ok(entry.indexOf("require('./native-vault-bootstrap')") < entry.indexOf("require('./native-baseline-bootstrap')"));
assert.ok(entry.indexOf("require('./native-baseline-bootstrap')") < entry.indexOf("require('expo-router/entry')"));
function compile(src, relative) {
  const filename = path.join(product, relative);
  const ast = transform({ filename, src, options, plugins: [] }).ast;
  const converted = applyImportSupport(ast, {
    filename, options, importDefault: '_fixtureImportDefault',
    importAll: '_fixtureImportAll', collectLocations: false,
  });
  return generate(converted.ast).code;
}
const compiled = compile(source, 'src/services/stellar.ts');
const consumerSource = "import { generateKeypair } from './src/services/stellar'; export const callSelected = () => generateKeypair(); export const selected = () => generateKeypair;";
const consumerCode = compile(consumerSource, 'validation-named-consumer.ts');
const actualSdk = req('@stellar/stellar-sdk');
const reports = [];
const selectedNames = ['generateKeypair', 'mockDepositToVault', 'mockWithdrawFromVault'];
function environment() {
  const calls = { originalOperations: 0, fixedSeedDerivations: 0, nativeShares: 0 };
  const forbidden = () => { calls.originalOperations++; throw new Error('FORBIDDEN_PRODUCTION_OPERATION'); };
  class HarmlessRpcServer { sendTransaction() { return forbidden(); } }
  const fixedSdk = {
    Keypair: {
      fromRawEd25519Seed: seed => {
        assert.equal(seed.length, 32);
        assert.ok([11, 12, 23].includes(seed[0]) && [...seed].every(byte => byte === seed[0]));
        calls.fixedSeedDerivations++;
        return actualSdk.Keypair.fromRawEd25519Seed(seed);
      },
      fromSecret: forbidden,
    },
    Account: actualSdk.Account, Networks: actualSdk.Networks,
    rpc: { Server: HarmlessRpcServer },
  };
  const server = { root: forbidden, submitTransaction: forbidden };
  const sourceSdk = {
    Horizon: { Server: class { constructor() { return server; } } },
    Keypair: { fromRawEd25519Seed: forbidden, fromSecret: forbidden }, Networks: actualSdk.Networks,
  };
  const storage = Object.fromEntries(['getItem', 'setItem', 'removeItem', 'clear', 'getAllKeys', 'multiGet', 'multiSet', 'multiRemove', 'mergeItem', 'multiMerge'].map(key => [key, forbidden]));
  const store = () => {
    let state = { publicKey: null, loadLocks: async () => {}, addLock: forbidden };
    return { getState: () => state, setState: (next, replace) => { state = replace ? next : { ...state, ...next }; }, persist: { rehydrate: async () => {} } };
  };
  const wallet = store(), app = store(), contacts = store(), lock = store(), vaultStore = store(), withdrawal = store();
  const clipboard = { setStringAsync: forbidden };
  const share = { share: async () => { calls.nativeShares++; throw new Error('NO_NATIVE_SHARE_IN_LOCAL_PROOF'); } };
  const events = [];
  const quietConsole = { info: (tag, json) => events.push({ tag, ...JSON.parse(json) }), log() {}, warn() {}, error() {} };
  const ctx = vm.createContext({ __DEV__: true, __METRO_GLOBAL_PREFIX__: '', console: quietConsole,
    process: { env: {} }, Buffer, Response, setTimeout, clearTimeout, fetch: forbidden,
    XMLHttpRequest: class { open() { return forbidden(); } },
  });
  ctx.global = ctx;
  vm.runInContext(runtime, ctx, { timeout: 1000 });
  const sourceDeps = { '@stellar/stellar-sdk': sourceSdk, 'expo-crypto': { getRandomValues: forbidden },
    buffer: { Buffer: { from: forbidden } }, 'expo/virtual/env': { env: {} } };
  const sourceRequire = name => {
    if (Object.hasOwn(sourceDeps, name)) return sourceDeps[name];
    if (name.startsWith('@babel/runtime/helpers/')) return req(name);
    throw new Error('Unexpected transformed source dependency: ' + name);
  };
  ctx._fixtureImportDefault = name => sourceRequire(name);
  ctx._fixtureImportAll = name => sourceRequire(name);
  const body = vm.runInContext('(function(global, require, importDefault, importAll, module, exports, dependencyMap) {' + compiled + '\n})', ctx);
  ctx.__d((global, ignored, importDefault, importAll, module, exports, map) => {
    body(global, sourceRequire, importDefault, importAll, module, exports, map);
  }, 100, [], 'src/services/stellar.ts');
  const consumerBody = vm.runInContext('(function(global, require, importDefault, importAll, module, exports, dependencyMap) {' + consumerCode + '\n})', ctx);
  ctx.__d((global, metroRequire, importDefault, importAll, module, exports, map) => {
    consumerBody(global, name => {
      assert.equal(name, './src/services/stellar'); return metroRequire(100);
    }, importDefault, importAll, module, exports, map);
  }, 101, [100], 'validation-named-consumer.ts');
  const fixtureDeps = {
    '@stellar/stellar-sdk': fixedSdk,
    '@react-native-async-storage/async-storage': { default: storage },
    './src/services/stellar': () => ctx.__r(100),
    './src/store/walletStore': { useWalletStore: wallet }, './src/store/appStore': { useAppStore: app },
    './src/features/contacts/contactStore': { useContactStore: contacts },
    './src/store/appLockStore': { useAppLockStore: lock }, './src/store/vaultStore': { useVaultStore: vaultStore },
    './src/features/vault/vaultStore': { useVaultStore: withdrawal },
    'react-native': { Share: share }, 'expo-clipboard': clipboard,
  };
  ctx.require = name => {
    assert.ok(Object.hasOwn(fixtureDeps, name), 'Unexpected fixture dependency: ' + name);
    const value = fixtureDeps[name]; return typeof value === 'function' ? value() : value;
  };
  const run = (text, filename) => vm.runInContext('(function(){\n' + text + '\n})()', ctx, { timeout: 1000, filename });
  return { ctx, calls, run, events, wallet, clipboard, storage, server, share, fixedSdk };
}
async function main() {
  const before = environment();
  before.run(vault, 'frozen-native-vault-bootstrap.js');
  const beforeNamespace = before.ctx.__r(100);
  const beforeGenerator = beforeNamespace.generateKeypair;
  assert.throws(() => before.run(baseline, 'frozen-native-baseline-bootstrap.js'), /Dummy key-generation guard did not install\./);
  assert.equal(beforeNamespace.generateKeypair, beforeGenerator);
  assert.equal(before.ctx.__pocketBaselineNativeFixture.snapshot().ready, false);
  assert.equal(before.calls.originalOperations, 0);
  reports.push({ case: 'frozen-bootstrap', result: 'expected-failure', error: 'Dummy key-generation guard did not install.', originalFunctionCalls: 0 });

  const noDepositInstall = environment();
  assert.throws(() => noDepositInstall.run(candidateVault, 'candidate-vault-with-readonly-deposit.js'), /Dummy deposit guard did not install\./);
  assert.equal(noDepositInstall.calls.originalOperations, 0);
  const noWithdrawalInstall = environment();
  noWithdrawalInstall.run(seam, 'candidate-preload.js');
  const withdrawalRecord = noWithdrawalInstall.ctx.__r.getModules().get(100);
  const withdrawalFactory = withdrawalRecord.factory;
  withdrawalRecord.factory = function(...args) {
    withdrawalFactory.apply(this, args);
    const descriptors = Object.getOwnPropertyDescriptors(args[4].exports);
    const blocked = args[4].exports.mockWithdrawFromVault;
    descriptors.mockWithdrawFromVault = { enumerable: true, configurable: false, get: () => blocked };
    args[4].exports = Object.defineProperties({}, descriptors);
  };
  assert.throws(() => noWithdrawalInstall.run(candidateVault, 'candidate-vault-with-readonly-withdrawal.js'), /Dummy withdrawal guard did not install\./);
  assert.equal(noWithdrawalInstall.calls.originalOperations, 0);
  reports.push({ case: 'vault-blocker-identity-guards', result: 'pass', readonlyDepositRejectsFatally: true, readonlyWithdrawalRejectsFatally: true, originalFunctionCalls: 0 });

  const after = environment();
  let capturedOriginalNamespace;
  const actualRecord = after.ctx.__r.getModules().get(100);
  const actualSourceFactory = actualRecord.factory;
  actualRecord.factory = function(...args) {
    actualSourceFactory.apply(this, args);
    capturedOriginalNamespace = args[4].exports;
  };
  after.run(seam, 'candidate-native-baseline-stellar-guard.js');
  const record = after.ctx.__r.getModules().get(100);
  const wrappedFactory = record.factory;
  const namespace = after.ctx.__r.importAll(100);
  const consumer = after.ctx.__r(101);
  for (const name of selectedNames) assert.throws(() => namespace[name](), /fixture has not installed/);
  const originalNamespace = capturedOriginalNamespace;
  for (const key of Reflect.ownKeys(originalNamespace)) {
    if (selectedNames.includes(key)) continue;
    const a = Object.getOwnPropertyDescriptor(originalNamespace, key);
    const b = Object.getOwnPropertyDescriptor(namespace, key);
    assert.deepEqual(a, b, 'Unselected descriptor changed: ' + String(key));
  }
  after.run(candidateVault, 'candidate-native-vault-bootstrap.js');
  assert.notEqual(namespace.mockDepositToVault, originalNamespace.mockDepositToVault);
  assert.notEqual(namespace.mockWithdrawFromVault, originalNamespace.mockWithdrawFromVault);
  after.run(baseline, 'frozen-native-baseline-bootstrap.js');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(after.ctx.__pocketBaselineNativeFixture.snapshot().ready, true);
  assert.equal(after.ctx.__r(100), namespace);
  assert.equal(after.ctx.__r.importAll(100), namespace);
  assert.equal(consumer.selected(), namespace.generateKeypair);
  const dummy = consumer.callSelected();
  const expected = actualSdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 23));
  assert.equal(dummy.publicKey, expected.publicKey()); assert.equal(dummy.secretKey, expected.secret());
  assert.equal(after.ctx.__pocketBaselineNativeFixture.snapshot().counters.generateKeypair, 1);
  assert.equal(after.calls.originalOperations, 0);
  assert.equal(record.factory, wrappedFactory);
  reports.push({ case: 'candidate-bootstrap-and-named-import', result: 'pass', ready: true, sameDeterministicSeed23: true, dummyGenerationCounter: 1, originalFunctionCalls: 0, requireImportAllAndNamedBindingAgree: true, allUnselectedExportDescriptorsAndGetterIdentitiesPreserved: true });

  await assert.rejects(namespace.mockDepositToVault(), /blocks deposit/);
  await assert.rejects(namespace.mockWithdrawFromVault(), /blocks withdraw/);
  assert.equal(await after.wallet.getState().setWallet(), false);
  await assert.rejects(after.clipboard.setStringAsync('DUMMY_GUARD_PROOF'), /Clipboard writes are disabled/);
  await after.storage.setItem('@guard-proof', 'DUMMY_MEMORY_ONLY');
  assert.equal(await after.storage.getItem('@guard-proof'), 'DUMMY_MEMORY_ONLY');
  await assert.rejects(after.server.submitTransaction(), /Broadcast disabled/);
  await assert.rejects(after.fixedSdk.rpc.Server.prototype.sendTransaction(), /Broadcast disabled/);
  assert.equal(await after.wallet.getState().getSecretKey(), null);
  await assert.rejects(after.ctx.fetch('https://dummy.invalid', { method: 'POST' }), /External HTTP disabled/);
  assert.throws(() => new after.ctx.XMLHttpRequest().open('POST', 'https://dummy.invalid'), /Native XHR disabled/);
  await assert.rejects(after.share.share({ message: { invalid: true } }), /resolve to text/);
  await assert.rejects(after.share.share({ message: JSON.stringify({ walletState: { publicKey: dummy.publicKey } }) }), /unredacted dummy diagnostics/);
  const transport = after.ctx.__pocketVaultNativeFixture.snapshot();
  assert.equal(transport.deposit, 1); assert.equal(transport.withdraw, 1);
  assert.equal(after.ctx.__pocketBaselineNativeFixture.snapshot().counters.walletSaveAttempts, 1);
  assert.equal(after.ctx.__pocketBaselineNativeFixture.snapshot().counters.clipboardAttempts, 1);
  assert.equal(after.calls.originalOperations, 0); assert.equal(after.calls.nativeShares, 0);
  reports.push({ case: 'existing-write-and-clipboard-blockers', result: 'pass', inducedLocalDepositRejections: 1, inducedLocalWithdrawRejections: 1, originalFunctionCalls: 0, nativeShareCalls: 0, writesUseFixtureMap: true });

  assert.throws(() => after.run(seam, 'late-install.js'), /before the source module loads/);
  const absent = environment(); absent.ctx.__r.getModules().delete(100);
  assert.throws(() => absent.run(seam, 'absent-module.js'), /one exact source module/);
  const duplicate = environment(); duplicate.ctx.__d(() => {}, 200, [], 'src/services/stellar.ts');
  assert.throws(() => duplicate.run(seam, 'duplicate-module.js'), /one exact source module/);
  const unavailable = environment(); unavailable.ctx.__r.getModules = undefined;
  assert.throws(() => unavailable.run(seam, 'missing-runtime.js'), /validation Metro dev runtime/);
  const malformed = environment(); malformed.ctx.__r.getModules().get(100).factory = (g, r, d, a, m) => { m.exports = { generateKeypair: null }; };
  malformed.run(seam, 'malformed-preload.js');
  assert.throws(() => malformed.ctx.__r(100), /pinned function export/);
  reports.push({ case: 'five-fail-closed-boundaries', result: 'pass', boundaries: ['late-load', 'missing-module', 'duplicate-module', 'missing-dev-runtime', 'non-function-export'] });

  for (const name of selectedNames) {
    const descriptor = Object.getOwnPropertyDescriptor(namespace, name);
    assert.equal(descriptor.configurable, false); assert.equal(descriptor.writable, true);
    assert.equal(Reflect.deleteProperty(namespace, name), false);
    assert.throws(() => Object.defineProperty(namespace, name, { get: () => null }), TypeError);
  }
  reports.push({ case: 'guard-slot-shape', result: 'pass', writableForExistingFixtures: true, deletionAndGetterRedefinitionRejected: true });
  const report = {
    sourceCommit: pins.sourceCommit, sourceTree: pins.sourceTree, sourceFilesVerified: Object.keys(pins.sourceFiles).length,
    packageLockSha256: sha(fs.readFileSync(path.join(product, 'package-lock.json'))),
    versions: { expoMetroConfig: req('@expo/metro-config/package.json').version, metroRuntime: req('metro-runtime/package.json').version, babelPresetExpo: req('babel-preset-expo/package.json').version },
    options, hashes: { sourceStellar: sha(source), transformedStellar: sha(compiled), actualMetroRuntime: sha(runtime), frozenVaultBootstrap: sha(vault), candidateVaultBootstrap: sha(candidateVault), frozenBaselineBootstrap: sha(baseline), candidateSeam: sha(seam), candidateEntry: sha(entry), namedConsumerTransformed: sha(consumerCode) },
    cases: reports,
    boundary: 'Installed Expo transform and Metro runtime in Node VM. Unmodified frozen baseline bootstrap; vault bootstrap only adds explicit blocker identity checks. Harmless stores/native transports, exact existing deterministic SDK seeds only. No Hermes/device/native UI, original random generator, real wallet, native persistence/clipboard/share, signing, broadcast, or network delivery.',
    nativeExecution: false,
  };
  fs.writeFileSync(path.join(__dirname, 'guard-install-regression-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
