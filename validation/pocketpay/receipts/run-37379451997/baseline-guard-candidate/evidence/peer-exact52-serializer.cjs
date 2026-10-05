const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = '/workspace/scratch/ea8baa184658/pocketpay-infra-repair';
const req = createRequire(root + '/package.json');
const worker = req('@expo/metro-config/build/transform-worker/metro-transform-worker');
const metroRoot = path.dirname(req.resolve('metro/package.json'));
const serializerPath = req.resolve('@expo/metro-config/build/serializer/fork/js');
const serializer = req(serializerPath);
const upstreamSerializer = req(metroRoot + '/src/DeltaBundler/Serializers/helpers/js.js');
const parse = req('@babel/parser').parse;
const config = req(root + '/metro.config.js');
const sourceRelative = 'src/services/stellar.ts';
const sourcePath = root + '/' + sourceRelative;
const source = fs.readFileSync(sourcePath);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
(async () => {
  const defaultTransform = await config.transformer.getTransformOptions([], { dev: true, hot: false, platform: 'android' }, async () => []);
  const options = {
    ...defaultTransform.transform, dev: true, hot: false, platform: 'android', type: 'module',
    minify: false, customTransformOptions: { engine: 'hermes', routerRoot: 'app' },
    unstable_transformProfile: 'hermes-stable', inlinePlatform: true,
  };
  // This is the actual installed Expo worker; it creates the factory and
  // dependency collection. It runs no module factory and writes no transform cache.
  const transformed = await worker.transform(config.transformer, root, sourcePath, source, options);
  const dependencies = new Map(transformed.dependencies.map((data, i) => [data.name, {
    absolutePath: path.join('/tmp/pocketpay-peer-dependency-fixtures', String(i) + '.js'), data,
  }]));
  const module = { path: sourcePath, dependencies, output: transformed.output };
  const ids = new Map([[sourcePath, 100]]);
  const createModuleId = filename => {
    if (!ids.has(filename)) ids.set(filename, ids.size + 100);
    return ids.get(filename);
  };
  // Only dependency IDs use non-executed placeholders. The actual source path,
  // worker output and serializer are real; name construction is not simulated.
  if (config.projectRoot !== root) throw new Error('installed project root mismatch');
  const serializerOptions = { createModuleId, dev: true, includeAsyncPaths: false,
    projectRoot: config.projectRoot, serverRoot: config.server.unstable_serverRoot };
  const params = serializer.getModuleParams(module, serializerOptions).params;
  const emitted = serializer.wrapModule(module, serializerOptions).src;
  const upstreamEmitted = upstreamSerializer.wrapModule(module, serializerOptions);
  if (emitted !== upstreamEmitted) throw new Error('Expo/upstream dev wrapper difference');
  const ast = parse(emitted, { sourceType: 'script' });
  const defineCall = ast.program.body[0].expression;
  const factoryParameters = defineCall.arguments[0].params.map(p => p.name);
  if (factoryParameters[4] !== 'module' || params[2] !== sourceRelative) throw new Error('actual serializer binding mismatch');
  const runtimePath = req.resolve('metro-runtime/src/polyfills/require.js');
  const runtime = fs.readFileSync(runtimePath, 'utf8');
  const ctx = vm.createContext({ __DEV__: true, __METRO_GLOBAL_PREFIX__: '', console });
  ctx.global = ctx;
  vm.runInContext(runtime, ctx, { timeout: 1000 });
  vm.runInContext(emitted, ctx, { timeout: 1000 });
  const record = ctx.__r.getModules().get(100);
  if (record.verboseName !== sourceRelative || record.isInitialized || record.factory.length !== 7) throw new Error('installed runtime registration mismatch');
  const jsName = '/tmp/pocketpay-baseline-binding-peer-exact52-emitted-registration.js';
  fs.writeFileSync(jsName, emitted + '\n');
  const report = {
    sourcePath, sourceCommit: '52ce8006a2d091a4c9f29852a1a530750ff9b3cc', sourceSha256: hash(source),
    actualConfigProjectRoot: config.projectRoot,
    actualConfigServerRoot: config.server.unstable_serverRoot,
    installedDefaultTransformOptions: defaultTransform.transform,
    activeConfigHasCustomSerializer: typeof config.serializer.customSerializer === 'function',
    activeCustomSerializerOwnProperties: Object.getOwnPropertyNames(config.serializer.customSerializer),
    serializerCallPathEvidence: 'Installed Expo getDefaultConfig source returns withExpoSerializers; its outer processor wrapper lacks the inner __expoSerializer marker.',
    originalCustomSerializerPresent: Boolean(config.serializer.customSerializer.__originalSerializer),
    activeSerializerCallPath: ['metro.config.js getDefaultConfig',
      '@expo/metro-config/build/ExpoMetroConfig.js withExpoSerializers',
      'serializer/withExpoSerializers.js defaultSerializer for dev/non-static request',
      'serializer/fork/baseJSBundle.js', 'serializer/fork/processModules.js',
      'serializer/fork/js.js wrapModule → getModuleParams → addParamsToDefineCall'],
    expoAndUpstreamEmittedRegistrationsIdentical: true,
    actualWorkerOutputSha256: hash(transformed.output[0].data.code),
    emittedRegistrationPath: jsName, emittedRegistrationSha256: hash(emitted + '\n'),
    emittedRegistrationTail: emitted.slice(-130),
    actualSerializerParameters: params, factoryParameters, moduleFactoryArgumentIndex: 4,
    runtimeRecordVerboseName: record.verboseName, runtimeRecordIsInitialized: record.isInitialized,
    runtimeFactoryArity: record.factory.length, actualDependenciesCollected: transformed.dependencies.map(d => d.name),
    registrationCount: ctx.__r.getModules().size, factoriesExecuted: 0,
    sourceBoundary: 'Actual exact52 stellar source transformed by installed Expo worker and emitted by installed Metro wrapModule serializer. Dependency ID paths are explicit unexecuted fixtures, so this is not a full dependency graph/dev bundle.',
    primarySources: {
      worker: req.resolve('@expo/metro-config/build/transform-worker/metro-transform-worker'),
      serializer: serializerPath,
      factoryBuilder: metroRoot + '/src/ModuleGraph/worker/JsFileWrapping.js', runtime: runtimePath,
    }, nativeExecution: false,
  };
  fs.writeFileSync('/tmp/pocketpay-baseline-binding-peer-exact52-serializer-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
