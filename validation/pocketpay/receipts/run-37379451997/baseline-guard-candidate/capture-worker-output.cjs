// Capture raw installed-worker output without evaluating any module factory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const product = path.resolve(process.argv[2] || '../pocketpay-infra-repair');
const req = createRequire(path.join(product, 'package.json'));
const config = req(path.join(product, 'metro.config.js'));
const worker = req('@expo/metro-config/build/transform-worker/metro-transform-worker');
const report = JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence/peer-exact52-serializer-report.json'), 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
(async () => {
  const defaults = await config.transformer.getTransformOptions([], { dev: true, hot: false, platform: 'android' }, async () => []);
  const options = {
    ...defaults.transform, dev: true, hot: false, platform: 'android', type: 'module', minify: false,
    customTransformOptions: { engine: 'hermes', routerRoot: 'app' },
    unstable_transformProfile: 'hermes-stable', inlinePlatform: true,
  };
  const filename = path.join(product, 'src/services/stellar.ts');
  const transformed = await worker.transform(config.transformer, product, filename, fs.readFileSync(filename), options);
  const code = transformed.output[0].data.code;
  if (sha(code) !== report.actualWorkerOutputSha256) throw new Error('Peer raw worker hash did not match.');
  fs.writeFileSync(path.join(__dirname, 'evidence/actual-worker-output.js'), code);
  const effective = {
    projectRoot: config.projectRoot, serverRoot: config.server.unstable_serverRoot,
    sourceMetroConfigSha256: sha(fs.readFileSync(path.join(product, 'metro.config.js'))),
    getTransformOptions: defaults, actualWorkerOptions: options,
    babelTransformerPath: config.transformer.babelTransformerPath,
    sourceExts: config.resolver.sourceExts,
    actualWorkerOutputSha256: sha(code), factoriesExecuted: 0, nativeExecution: false,
  };
  fs.writeFileSync(path.join(__dirname, 'evidence/effective-actual-config.json'), JSON.stringify(effective, null, 2) + '\n');
  console.log(JSON.stringify(effective, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
