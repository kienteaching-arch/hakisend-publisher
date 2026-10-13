import test from 'node:test';
import assert from 'node:assert/strict';
import { atLeastVersion, evaluateProvenance } from '../scripts/release-provenance.mjs';

const approved = () => ({
  packageVersion: '0.1.9',
  manifestVersion: '0.1.9',
  sourceSha256: 's'.repeat(64),
  bundleSha256: 'b'.repeat(64),
  provenance: {
    owner_accepted_version: '0.1.9',
    source_sha256: 's'.repeat(64),
    bundle_sha256: 'b'.repeat(64),
    production_release_authorized: true,
  },
});

test('semantic comparison handles patch levels numerically', () => {
  assert.equal(atLeastVersion('0.1.10', '0.1.9'), true);
  assert.equal(atLeastVersion('0.1.3', '0.1.9'), false);
  assert.equal(atLeastVersion('invalid', '0.1.9'), false);
});

test('currently committed v0.1.3 can never be represented as v0.1.9 release', () => {
  const input = approved();
  input.packageVersion = '0.1.3';
  input.manifestVersion = '0.1.3';
  const result = evaluateProvenance(input);
  assert.equal(result.releaseReady, false);
  assert.ok(result.blockers.includes('REPOSITORY_SOURCE_BEHIND_OWNER_TESTED_V019'));
});

test('passing owner source-and-bundle provenance is necessary but not sufficient without explicit authorization', () => {
  const input = approved();
  input.provenance.production_release_authorized = false;
  const result = evaluateProvenance(input);
  assert.equal(result.releaseReady, false);
  assert.ok(result.blockers.includes('PRODUCTION_RELEASE_NOT_AUTHORIZED'));
});

test('missing reconciliation blocks release even with matching versions', () => {
  const input = approved();
  input.provenance = null;
  const result = evaluateProvenance(input);
  assert.ok(result.blockers.includes('OWNER_TESTED_SOURCE_RECONCILIATION_MISSING'));
});

test('mismatched TypeScript or compiled JavaScript checksum blocks release', () => {
  const input = approved();
  input.sourceSha256 = 'changed';
  input.bundleSha256 = 'changed';
  const result = evaluateProvenance(input);
  assert.ok(result.blockers.includes('SOURCE_SHA256_NOT_RECONCILED'));
  assert.ok(result.blockers.includes('BUNDLE_SHA256_NOT_RECONCILED'));
});

test('manifest/package version divergence blocks release', () => {
  const input = approved();
  input.manifestVersion = '0.1.10';
  const result = evaluateProvenance(input);
  assert.ok(result.blockers.includes('PACKAGE_MANIFEST_VERSION_MISMATCH'));
});

test('fully consistent owner-approved source passes the pure release contract', () => {
  const result = evaluateProvenance(approved());
  assert.equal(result.releaseReady, true);
  assert.deepEqual(result.blockers, []);
});
