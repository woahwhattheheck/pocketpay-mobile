// Read-only local preparation checks; these do not execute native UI.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const root = path.resolve(process.argv[2] || '/workspace/scratch/ea8baa184658/pocketpay-infra-repair');
const fixture = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(fixture, 'source-manifest.json'), 'utf8'));
for (const [relative, expected] of Object.entries(manifest.sourceFiles)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
  if (actual !== expected) throw new Error('Pinned source mismatch: ' + relative);
}
for (const name of ['native-baseline-entry.js', 'native-baseline-stellar-guard.js', 'native-baseline-bootstrap.js', 'native-vault-bootstrap.js']) {
  cp.execFileSync(process.execPath, ['--check', path.join(fixture, name)]);
}
const ts = require(path.join(root, 'node_modules/typescript'));
const virtual = new Map([
  [path.join(root, 'native-baseline-cases.tsx'), path.join(fixture, 'native-baseline-cases.tsx')],
  [path.join(root, 'native-baseline-observation-cases.tsx'), path.join(fixture, 'native-baseline-observation-cases.tsx')],
  [path.join(root, 'app/send/__baseline-native-fixture.tsx'), path.join(fixture, 'native-baseline-route.tsx')],
]);
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const options = { ...parsed.options, noEmit: true, typeRoots: [path.join(root, 'node_modules/@types')] };
const host = ts.createCompilerHost(options);
const originalRead = host.readFile.bind(host);
const originalExists = host.fileExists.bind(host);
host.getCurrentDirectory = () => root;
host.readFile = file => virtual.has(file) ? fs.readFileSync(virtual.get(file), 'utf8') : originalRead(file);
host.fileExists = file => virtual.has(file) || originalExists(file);
const program = ts.createProgram({ rootNames: [...virtual.keys(), path.join(root, 'src/types/pocketpay-sdk.d.ts')], options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  throw new Error('Fixture integration type check failed.');
}
const { getRoutes } = require(path.join(root, 'node_modules/expo-router/build/getRoutes'));
const keys = cp.execFileSync('rg', ['--files', 'app'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
  .filter(file => /\.[jt]sx?$/.test(file)).map(file => './' + file.slice(4));
keys.push('./send/__baseline-native-fixture.tsx');
// Only discovery metadata is checked; no production component is evaluated.
const context = () => ({ default: function RouteMetadataOnly() {} });
context.keys = () => keys;
context.resolve = key => key;
context.id = 'baseline-fixture-metadata-only';
const routeTree = getRoutes(context, { platform: 'android', importMode: 'lazy', ignoreEntryPoints: true, skipGenerated: true });
const routes = [];
function walk(node) {
  if (!node) return;
  if (node.contextKey === './send.tsx' || node.contextKey === './send/__baseline-native-fixture.tsx') {
    routes.push({ route: node.route, contextKey: node.contextKey });
  }
  (node.children || []).forEach(walk);
}
walk(routeTree);
if (routes.length !== 2) throw new Error('Send and fixture route metadata did not coexist.');
process.stdout.write(JSON.stringify({
  pinnedProductionFilesVerified: Object.keys(manifest.sourceFiles).length,
  jsSyntaxFilesPassed: 4, virtualFixtureFiles: virtual.size, typeScriptDiagnostics: 0,
  androidMetadataRoutes: routes, productSourceWrites: false, nativeUiExecution: false,
}, null, 2) + '\n');
