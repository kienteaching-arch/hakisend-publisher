const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync('src/runtime/main.js', 'utf8');
const normalizers = source.match(/function normalizeBaseUrl\(value\) \{[\s\S]*?\n\}\n[\s\S]*?function storedApiBaseUrl\(value\) \{[\s\S]*?\n\}/);
assert(normalizers, 'Strict API-origin and persisted-settings guards must exist');

const context = vm.createContext({
  URL,
  DEFAULT_SETTINGS: { apiBaseUrl: 'https://app.hakisend.com' },
});
vm.runInContext(normalizers[0], context);

test('HakiSend API origin accepts only credential-free HTTPS at the root', () => {
  for (const input of [
    'http://app.hakisend.com',
    'http://127.0.0.1:8080',
    'https://user:pass@app.hakisend.com',
    'https://app.hakisend.com/path',
    'https://app.hakisend.com/?test=1',
    'https://app.hakisend.com/#fragment',
    'ftp://app.hakisend.com',
    '//app.hakisend.com',
    'https://',
  ]) {
    assert.throws(() => context.normalizeBaseUrl(input), /HTTPS/);
  }
  assert.equal(context.normalizeBaseUrl('https://app.hakisend.com/'), 'https://app.hakisend.com');
  assert.equal(context.normalizeBaseUrl('https://example.com:8443'), 'https://example.com:8443');
  assert.equal(context.normalizeBaseUrl(''), 'https://app.hakisend.com');
});

test('Unsafe saved origin remains visible for correction but is never network-ready', () => {
  const stored = context.storedApiBaseUrl('http://old.example.com');
  assert.equal(stored, 'http://old.example.com');
  assert.throws(() => context.normalizeBaseUrl(stored), /HTTPS/);
});

test('Legacy plaintext bearerToken cannot authorize API network requests', () => {
  const method = source.match(/async getAccessToken\(\) \{[\s\S]*?\n  \}\n  hasSecureConnection\(/);
  assert(method, 'getAccessToken and hasSecureConnection boundaries missing');
  assert.match(method[0], /secretStorage\.getSecret/);
  assert.doesNotMatch(method[0], /this\.settings\.bearerToken/);
  assert.match(method[0], /return "";/);
});
