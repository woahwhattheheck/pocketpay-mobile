const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = '/workspace/scratch/ea8baa184658/pocketpay-infra-repair';
const req = createRequire(root + '/package.json');
const transformer = req('@expo/metro-config/build/babel-transformer');
const { applyImportSupport } = req('@expo/metro-config/build/transform-worker/metro-transform-worker');
const generate = req('@babel/generator').default;
const options = { dev: true, platform: 'android', type: 'module', projectRoot: root,
  experimentalImportSupport: true, inlineRequires: false,
  customTransformOptions: { engine: 'hermes', routerRoot: 'app' },
  enableBabelRCLookup: true, unstable_transformProfile: 'hermes-stable' };
const namedSource = "import { generateKeypair } from './src/services/stellar'; export const callSelected = () => generateKeypair(); export const readSelected = () => generateKeypair;";
const namedAst = transformer.transform({ filename: root + '/peer-named-consumer.ts', src: namedSource, options, plugins: [] }).ast;
const namedEsm = applyImportSupport(namedAst, { filename: root + '/peer-named-consumer.ts', options,
  importDefault: '_peerImportDefault', importAll: '_peerImportAll', collectLocations: false });
const namedCode = generate(namedEsm.ast).code;
const shimSource = fs.readFileSync(root + '/shim.js', 'utf8');
const shimAst = transformer.transform({ filename: root + '/shim.js', src: shimSource, options, plugins: [] }).ast;
const shimEsm = applyImportSupport(shimAst, { filename: root + '/shim.js', options,
  importDefault: '_peerImportDefault', importAll: '_peerImportAll', collectLocations: false });
const shimCode = generate(shimEsm.ast).code;
const runtimePath = root + '/node_modules/metro-runtime/src/polyfills/require.js';
const runtime = fs.readFileSync(runtimePath, 'utf8');
const code = fs.readFileSync('/tmp/pocketpay-baseline-binding-peer-exact52-generateKeypair.transformed.js', 'utf8');
const never = () => { throw new Error('ORIGINAL_OPERATION_FORBIDDEN'); };
const deps = {
  '@stellar/stellar-sdk': { Horizon: { Server: class HarmlessServer {} },
    Keypair: { fromRawEd25519Seed: never, fromSecret: never }, Networks: { TESTNET: 'DUMMY' } },
  'expo-crypto': { getRandomValues: never },
  'buffer': { Buffer: { from: never } }, 'expo/virtual/env': { env: {} },
};
const stubRequire = name => {
  if (name.startsWith('@babel/runtime/helpers/')) return req(name);
  if (!(name in deps)) throw new Error('Unexpected dependency: ' + name);
  return deps[name];
};
function fresh() {
  const ctx = vm.createContext({ __DEV__: true, __METRO_GLOBAL_PREFIX__: '', console,
    process: { env: {} }, _peerImportDefault: name => stubRequire(name),
    _peerImportAll: name => stubRequire(name), stubRequire });
  ctx.global = ctx;
  vm.runInContext(runtime, ctx, { timeout: 1000 });
  const realTransformedBody = vm.runInContext('(function(global, require, importDefault, importAll, module, exports, dependencyMap){' + code + '\n})', ctx);
  ctx.__d(function(global, ignoredMetroRequire, importDefault, importAll, module, exports, dependencyMap) {
    return realTransformedBody(global, stubRequire, importDefault, importAll, module, exports, dependencyMap);
  }, 100, [], 'src/services/stellar.ts');
  const shimRequests = [];
  const shimDependencies = {
    'react-native-get-random-values': {}, 'expo-crypto': deps['expo-crypto'],
    'text-encoding': {}, buffer: { Buffer: req('buffer').Buffer },
    'process/browser': { env: {} },
  };
  const transformedShimBody = vm.runInContext('(function(global, require, importDefault, importAll, module, exports, dependencyMap){' + shimCode + '\n})', ctx);
  ctx.__d(function(global, ignoredMetroRequire, importDefault, importAll, module, exports, dependencyMap) {
    const shimRequire = name => {
      if (!(name in shimDependencies)) throw new Error('Unexpected shim dependency: ' + name);
      shimRequests.push(name);
      return shimDependencies[name];
    };
    return transformedShimBody(global, shimRequire, importDefault, importAll, module, exports, dependencyMap);
  }, 99, [], 'shim.js');
  ctx.shimRequests = shimRequests;
  ctx.__d(function(global, require, importDefault, importAll, module) {
    const captured = require(100);
    module.exports = { captured, callSelected: () => captured.generateKeypair() };
  }, 101, [100], 'harmless-peer-consumer.js');
  const transformedNamedBody = vm.runInContext('(function(global, require, importDefault, importAll, module, exports, dependencyMap){' + namedCode + '\n})', ctx);
  ctx.__d(function(global, metroRequire, importDefault, importAll, module, exports, dependencyMap) {
    const namedRequire = name => {
      if (name !== './src/services/stellar') throw new Error('Unexpected named consumer dependency');
      return metroRequire(100);
    };
    return transformedNamedBody(global, namedRequire, importDefault, importAll, module, exports, dependencyMap);
  }, 102, [100], 'harmless-transformed-peer-named-consumer.ts');
  return ctx;
}
function installBeforeLoad(ctx) {
  const matches = [...ctx.__r.getModules()].filter(([, record]) => record.verboseName === 'src/services/stellar.ts');
  if (matches.length !== 1) throw new Error('unique module precondition');
  const [, record] = matches[0];
  if (record.isInitialized || record.hasError || typeof record.factory !== 'function') throw new Error('uninitialized module precondition');
  const originalFactory = record.factory;
  const selected = new Set(['generateKeypair', 'mockDepositToVault', 'mockWithdrawFromVault']);
  record.factory = function(...args) {
    originalFactory.apply(this, args);
    const module = args[4];
    const originalNamespace = module.exports;
    ctx.originalNamespace = originalNamespace;
    const replacementNamespace = {};
    for (const key of Reflect.ownKeys(originalNamespace)) {
      const descriptor = Object.getOwnPropertyDescriptor(originalNamespace, key);
      if (selected.has(key)) {
        if (typeof originalNamespace[key] !== 'function') throw new Error('function export precondition');
        Object.defineProperty(replacementNamespace, key, {
          enumerable: descriptor.enumerable, configurable: false, writable: true, value: never,
        });
      } else Object.defineProperty(replacementNamespace, key, descriptor);
    }
    for (const key of selected) if (replacementNamespace[key] !== never) throw new Error('blocking export precondition');
    module.exports = replacementNamespace;
  };
}
const old = fresh();
const oldConsumer = old.__r(101);
const oldExport = oldConsumer.captured.generateKeypair;
oldConsumer.captured.generateKeypair = () => 'not installed';
if (oldConsumer.captured.generateKeypair !== oldExport) throw new Error('old failure did not reproduce');
const repaired = fresh();
repaired.__r(99);
if (repaired.__r.getModules().get(100).isInitialized) throw new Error('shim initialized stellar');
installBeforeLoad(repaired);
const repairedConsumer = repaired.__r(101);
const cachedNamespaceBeforeSlotReplacement = repaired.__r.importAll(100);
const namedConsumer = repaired.__r(102);
let dummyCalls = 0;
const harmlessDummy = () => { dummyCalls++; return 'HARMLESS_DUMMY_RESULT'; };
repairedConsumer.captured.generateKeypair = harmlessDummy;
if (repairedConsumer.callSelected() !== 'HARMLESS_DUMMY_RESULT' || dummyCalls !== 1) throw new Error('replacement not used by consumer');
if (namedConsumer.readSelected() !== harmlessDummy || namedConsumer.callSelected() !== 'HARMLESS_DUMMY_RESULT' || dummyCalls !== 2) throw new Error('replacement not used by actual-transformed named consumer');
if (repaired.__r(100) !== repairedConsumer.captured || repaired.__r.importAll(100) !== repairedConsumer.captured) throw new Error('namespace identity not retained');
if (cachedNamespaceBeforeSlotReplacement.generateKeypair !== harmlessDummy) throw new Error('pre-existing namespace cache stale');
const selected = new Set(['generateKeypair', 'mockDepositToVault', 'mockWithdrawFromVault']);
const selectedSlotChecks = {};
for (const key of selected) {
  const descriptor = Object.getOwnPropertyDescriptor(repairedConsumer.captured, key);
  if (!descriptor.writable || descriptor.configurable || !('value' in descriptor)) throw new Error('invalid writable slot descriptor');
  const deletionRejected = !Reflect.deleteProperty(repairedConsumer.captured, key);
  let accessorRedefinitionRejected = false;
  try { Object.defineProperty(repairedConsumer.captured, key, { get: () => never }); }
  catch (error) { accessorRedefinitionRejected = error.name === 'TypeError'; }
  if (!deletionRejected || !accessorRedefinitionRejected) throw new Error('slot deletion/accessor redefine allowed');
  const keep = repairedConsumer.captured[key];
  Object.defineProperty(repairedConsumer.captured, key, { value: keep });
  selectedSlotChecks[key] = { writable: true, configurable: false,
    deletionRejected, accessorRedefinitionRejected, valueDefinitionAllowedWhileWritable: true };
}
for (const key of Reflect.ownKeys(repaired.originalNamespace)) {
  const a = Object.getOwnPropertyDescriptor(repaired.originalNamespace, key);
  const b = Object.getOwnPropertyDescriptor(repairedConsumer.captured, key);
  if (!selected.has(key) && Reflect.ownKeys(a).some(field => a[field] !== b[field])) throw new Error('unselected descriptor changed:' + String(key));
}
let earlyLoadRejected = false;
try { installBeforeLoad(old); } catch (_) { earlyLoadRejected = true; }
if (!earlyLoadRejected) throw new Error('late installation did not fail closed');
const report = {
  runtimePath, runtimeSha256: crypto.createHash('sha256').update(runtime).digest('hex'),
  actualTransformedStellarSourceSha256: '8a83fd1ec619ca90b199811368d47edbb5a0c4db4609f7be04fab089597561ab',
  actualShimSourceSha256: crypto.createHash('sha256').update(shimSource).digest('hex'),
  actualShimTransformSha256: crypto.createHash('sha256').update(shimCode).digest('hex'),
  actualTransformedShimDependenciesRequested: repaired.shimRequests,
  stellarUninitializedAfterTransformedShimWithDependencyStubs: true, selectedSlotChecks,
  originalAssignmentFailed: true, preLoadFactorySeamConsumerUsesReplacement: true,
  requireAndImportAllShareReplacementNamespace: true, earlyLoadedModuleRejected: earlyLoadRejected,
  preExistingImportAllCacheObservesReplacement: true, actualTransformedNamedConsumerUsesReplacement: true,
  allUnselectedDescriptorsIdentical: true,
  namedConsumerTransformedSha256: crypto.createHash('sha256').update(namedCode).digest('hex'),
  harmlessDummyCalls: dummyCalls, originalFunctionCalls: 0, nativeExecution: false,
  boundary: 'Installed Metro0.83.3 runtime and actual installed Expo transformed stellar/shim sources in Node VM with harmless SDK/crypto/shim dependency stubs. External shim dependency bodies were not executed. No Hermes/device/native persistence/network/signing.'
};
fs.writeFileSync('/tmp/pocketpay-baseline-binding-peer-exact52-runtime-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
