import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

assert.equal(manifest.id, 'hakisend-publisher');
assert.equal(manifest.version, '0.1.36');
assert.equal(manifest.minAppVersion, '1.11.4');
assert.equal(manifest.isDesktopOnly, false);
assert(existsSync('main.js'), 'main.js is required');
assert(existsSync('styles.css'), 'styles.css is required');
assert(existsSync('LICENSE'), 'LICENSE is required');
assert(existsSync('README.md'), 'README.md is required');

const runtime = readFileSync('main.js');
const expectedRuntimeHash = 'b0b955434340fc81bdd880544bf7ee99c216601dbade20dd35c70f529c77d12e';
const actualRuntimeHash = createHash('sha256').update(runtime).digest('hex');
assert.equal(actualRuntimeHash, expectedRuntimeHash, 'runtime drift from reviewed 0.1.36 archive');

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);
for (const path of tracked) {
  assert(!/(^|\/)(\.env(?:\..*)?|data\.json|id_rsa|id_ed25519)$/i.test(path),
    `Sensitive file tracked: ${path}`);
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

if (packageJson.version !== manifest.version) {
  console.log('SOURCE_BUILD_PARITY=BLOCKED');
  console.log(`SOURCE_PACKAGE_VERSION=${packageJson.version}`);
  console.log('Release is NOT authorized. Restore matching editable source and prove a reproducible build.');
} else {
  console.log('SOURCE_BUILD_PARITY=UNVERIFIED');
  console.log('Version agreement alone cannot establish source reproducibility.');
}

if (process.argv.includes('--release')) {
  throw new Error('Public release is blocked until matching source and live UAT are verified.');
}
