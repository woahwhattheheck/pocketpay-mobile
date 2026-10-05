// Local read-only preparation checks. No guest, UI script or ADB operation runs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const root = path.resolve(process.argv[2] || '/workspace/scratch/ea8baa184658/pocketpay-retry321-build');
const fixture = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(fixture, 'source-manifest.json'), 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, expected] of Object.entries(manifest.sourceFiles)) {
  if (sha(path.join(root, file)) !== expected) throw new Error('Source mismatch: ' + file);
}
for (const [file, expected] of Object.entries(manifest.originalFixtureSha256)) {
  if (sha(path.join(fixture, file)) !== expected) throw new Error('Original fixture bytes changed: ' + file);
}
for (const file of ['native321-entry.js', 'native321-bootstrap.js', 'retry-gap-observer.js']) {
  cp.execFileSync(process.execPath, ['--check', path.join(fixture, 'fixtures', file)]);
}
const ts = require(path.join(root, 'node_modules/typescript'));
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const options = { ...parsed.options, noEmit: true, typeRoots: [path.join(root, 'node_modules/@types')] };
const virtual = new Map([
  [path.join(root, 'app/send/__retry-gap-native-fixture.tsx'), path.join(fixture, 'fixtures/native-fixture.tsx')],
  [path.join(root, 'app/__retry-gap-observer-native-fixture.tsx'), path.join(fixture, 'fixtures/retry-gap-launch-route.tsx')],
  [path.join(root, 'retry-gap-observer.js'), path.join(fixture, 'fixtures/retry-gap-observer.js')],
]);
const host = ts.createCompilerHost(options);
const originalRead = host.readFile.bind(host), originalExists = host.fileExists.bind(host);
host.getCurrentDirectory = () => root;
host.readFile = file => virtual.has(file) ? fs.readFileSync(virtual.get(file), 'utf8') : originalRead(file);
host.fileExists = file => virtual.has(file) || originalExists(file);
const program = ts.createProgram({ rootNames: [...virtual.keys()].filter(file => file.endsWith('.tsx'))
  .concat(path.join(root, 'src/types/pocketpay-sdk.d.ts')),
  options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  throw new Error('Virtual fixture TypeScript integration failed.');
}
const { getRoutes } = require(path.join(root, 'node_modules/expo-router/build/getRoutes'));
const keys = cp.execFileSync('rg', ['--files', 'app'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
  .filter(file => /\.[jt]sx?$/.test(file)).map(file => './' + file.slice(4));
keys.push('./send/__retry-gap-native-fixture.tsx', './__retry-gap-observer-native-fixture.tsx');
const context = () => ({ default: function RouteMetadataOnly() {} });
context.keys = () => keys; context.resolve = key => key; context.id = 'retry-gap-metadata-only';
const all = [];
const tree = getRoutes(context, { platform: 'android', importMode: 'lazy', ignoreEntryPoints: true, skipGenerated: true });
function walk(node) { if (!node) return; all.push(node.contextKey); (node.children || []).forEach(walk); }
walk(tree);
for (const key of ['./send.tsx', './send/__retry-gap-native-fixture.tsx', './__retry-gap-observer-native-fixture.tsx']) {
  if (!all.includes(key)) throw new Error('Expected Android route metadata: ' + key);
}
process.stdout.write(JSON.stringify({ pinnedSourceFiles: Object.keys(manifest.sourceFiles).length,
  originalFixtureFilesByteIdentical: 3, jsSyntaxChecks: 3, virtualTsxFiles: 2,
  typeScriptDiagnostics: 0, androidRouteMetadataResolved: true,
  productSourceWrites: false, nativeUiExecution: false }, null, 2) + '\n');
