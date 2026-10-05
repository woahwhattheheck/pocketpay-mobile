const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = '/workspace/scratch/ea8baa184658/pocketpay-infra-repair';
const req = createRequire(root + '/package.json');
const transformer = req('@expo/metro-config/build/babel-transformer');
const { applyImportSupport } = req('@expo/metro-config/build/transform-worker/metro-transform-worker');
const generate = req('@babel/generator').default;
const options = {
  dev: true, platform: 'android', type: 'module', projectRoot: root,
  experimentalImportSupport: true, inlineRequires: false,
  customTransformOptions: { engine: 'hermes', routerRoot: 'app' },
  enableBabelRCLookup: true, unstable_transformProfile: 'hermes-stable',
};
const forbidden = () => { throw new Error('FORBIDDEN_ORIGINAL_OPERATION'); };
const reports = [];
function inspect(relative, exportedName, dependencies) {
  const filename = root + '/' + relative;
  const src = fs.readFileSync(filename, 'utf8');
  const { ast } = transformer.transform({ filename, src, options, plugins: [] });
  const esm = applyImportSupport(ast, {
    filename, options, importDefault: '_peerImportDefault',
    importAll: '_peerImportAll', collectLocations: false,
  });
  const code = generate(esm.ast || esm).code;
  const stubRequire = name => {
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
    if (name.startsWith('@babel/runtime/')) return req(name);
    throw new Error('UNEXPECTED_DEPENDENCY:' + name);
  };
  const context = vm.createContext({
    exports: {}, require: stubRequire, process: { env: {} }, console,
    _peerImportDefault: name => { const e = stubRequire(name); return e && e.__esModule ? e.default : e; },
    _peerImportAll: name => stubRequire(name),
    fetch: forbidden,
  });
  vm.runInContext(code, context, { timeout: 1000, filename: relative + '.transformed' });
  const descriptor = Object.getOwnPropertyDescriptor(context.exports, exportedName);
  const original = context.exports[exportedName];
  const replacement = () => 'HARMLESS_PEER_REPLACEMENT';
  context.replacement = replacement;
  vm.runInContext('exports[' + JSON.stringify(exportedName) + '] = replacement;', context);
  const sloppyAssignmentReplaced = context.exports[exportedName] === replacement;
  let strictAssignmentError = null;
  try {
    vm.runInContext('"use strict"; exports[' + JSON.stringify(exportedName) + '] = replacement;', context);
  } catch (error) { strictAssignmentError = error.name; }
  let redefineError = null;
  try { Object.defineProperty(context.exports, exportedName, { value: replacement }); }
  catch (error) { redefineError = error.name; }
  const report = {
    relative, sourceSha256: crypto.createHash('sha256').update(src).digest('hex'),
    transformedSha256: crypto.createHash('sha256').update(code).digest('hex'),
    descriptor: { enumerable: descriptor.enumerable, configurable: descriptor.configurable,
      hasGetter: typeof descriptor.get === 'function', hasSetter: typeof descriptor.set === 'function',
      hasValue: Object.prototype.hasOwnProperty.call(descriptor, 'value') },
    exportedName, exportedValueType: typeof original, sloppyAssignmentReplaced,
    originalIdentityRetained: context.exports[exportedName] === original,
    strictAssignmentError, redefineError, originalFunctionCalls: 0,
    boundary: 'Actual installed Expo Babel + import support transform; Node VM execution with harmless dependency stubs; not Hermes or native execution.',
  };
  fs.writeFileSync('/tmp/pocketpay-baseline-binding-peer-exact52-' + exportedName + '.transformed.js', code + '\n');
  reports.push(report);
}
const stellarDependencies = {
  '@stellar/stellar-sdk': {
    Horizon: { Server: class HarmlessServer { constructor() {} } },
    Keypair: { fromRawEd25519Seed: forbidden, fromSecret: forbidden },
    Networks: { TESTNET: 'DUMMY' },
  },
  'expo-crypto': { getRandomValues: forbidden },
  'buffer': { Buffer: { from: forbidden } },
  'expo/virtual/env': { env: {} },
};
inspect('src/services/stellar.ts', 'generateKeypair', stellarDependencies);
inspect('src/services/stellar.ts', 'mockDepositToVault', stellarDependencies);
inspect('src/services/stellar.ts', 'mockWithdrawFromVault', stellarDependencies);
inspect('node_modules/expo-clipboard/build/Clipboard.js', 'setStringAsync', {
  'expo-modules-core': { Platform: { OS: 'android' }, UnavailabilityError: class {} },
  './ClipboardPasteButton': {}, './ExpoClipboard': { setStringAsync: forbidden },
  './Clipboard.types': {},
});
const report = {
  options, packageVersions: {
    expoMetroConfig: req('@expo/metro-config/package.json').version,
    metroRuntime: req('metro-runtime/package.json').version,
    babelPresetExpo: req('babel-preset-expo/package.json').version,
  }, reports,
};
fs.writeFileSync('/tmp/pocketpay-baseline-binding-peer-exact52-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
