const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const product = path.resolve(__dirname, 'disposable-source52');
const req = createRequire(path.join(product, 'package.json'));
const Metro = req('@expo/metro/metro');
const config = req(path.join(product, 'metro.config.js'));
// Direct runBuild needs the subject root in its watch list (CLI normalizes it).
// Also watch installed source52 dependencies behind the disposable symlink.
// These local proof adaptations do not change the resolver or source files.
config.watchFolders = [...config.watchFolders, product, fs.realpathSync(path.join(product, 'node_modules'))];
config.maxWorkers = 2;
config.reporter = { update(event) {
  if (event.type === 'bundling_error') console.error(event.error);
  if (event.type === 'bundle_build_started' || event.type === 'bundle_build_done') console.log(event.type);
} };
Metro.runBuild(config, {
  entry: './native-baseline-entry.js', platform: 'android', dev: true, minify: false,
  customTransformOptions: { engine: 'hermes', routerRoot: 'app' },
  unstable_transformProfile: 'hermes-stable',
  out: path.join(__dirname, 'candidate-android-dev.js'), sourceMap: false,
}).then(() => console.log('LOCAL_DEV_BUNDLE_EMITTED')).catch(error => {
  console.error(error.stack); process.exitCode = 1;
});
