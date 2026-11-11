import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

assert.equal(manifest.id, 'hakisend-publisher');
assert.equal(manifest.version, '0.1.43');
assert.equal(manifest.minAppVersion, '1.11.4');
assert.equal(manifest.isDesktopOnly, false);
assert.equal(packageJson.version, manifest.version, 'package.json and manifest.json must agree');
assert(existsSync('main.js'), 'main.js is required');
assert(existsSync('styles.css'), 'styles.css is required');
assert(existsSync('LICENSE'), 'LICENSE is required');
assert(existsSync('README.md'), 'README.md is required');

const runtime = readFileSync('main.js');
const canonicalSource = readFileSync('src/runtime/publisher-bundle.cjs');
assert(canonicalSource.equals(runtime), 'Canonical JavaScript source differs from release runtime');
const expectedRuntimeHash = '6ab70c1ffd0fabb9a8b29a51e97cbfbd34b2466a50182684b24d1351503e9df7';
const actualRuntimeHash = createHash('sha256').update(runtime).digest('hex');
assert.equal(actualRuntimeHash, expectedRuntimeHash, 'runtime drift from security-hardened 0.1.41 candidate');

function walk(directory = '.', prefix = '') {
  const paths = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(item.name)) continue;
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new Error(`Symlink not allowed in release tree: ${name}`);
    if (item.isDirectory()) paths.push(...walk(`${directory}/${item.name}`, name));
    else if (item.isFile() && statSync(`${directory}/${item.name}`).size < 300_000_000) paths.push(name);
  }
  return paths;
}
for (const path of walk()) {
  assert(!/(^|\/)(\.env(?:\..*)?|data\.json|id_rsa|id_ed25519)$/i.test(path),
    `Sensitive file in release tree: ${path}`);
}

const code = runtime.toString('utf8');
const secretPatterns = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsk-[A-Za-z0-9]{32,}\b/
];
for (const pattern of secretPatterns) {
  assert(!pattern.test(code), `Potential hard-coded credential: ${pattern}`);
}

console.log('CANDIDATE_RUNTIME_SHA256=' + actualRuntimeHash);
console.log('CANDIDATE_ASSET_CHECK=PASS');
console.log('CANDIDATE_SENSITIVE_FILE_GUARD=PASS');
console.log('JS_SOURCE_BUILD_PARITY=PASS');
console.log('LEGACY_TYPESCRIPT_BUILD=DISABLED');
console.log('Local artifact checks PASS; Community directory listing still requires its official review.');
