import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MINIMUM_OWNER_TESTED_VERSION = '0.1.9';
const PROVENANCE_FILE = 'docs/RELEASE_SOURCE_PROVENANCE.json';

function parseVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) return null;
  return value.split('.').map(Number);
}

export function atLeastVersion(current, minimum) {
  const a = parseVersion(current);
  const b = parseVersion(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

export function evaluateProvenance(input) {
  const blockers = [];
  if (input.packageVersion !== input.manifestVersion) {
    blockers.push('PACKAGE_MANIFEST_VERSION_MISMATCH');
  }
  if (!atLeastVersion(input.manifestVersion, MINIMUM_OWNER_TESTED_VERSION)) {
    blockers.push('REPOSITORY_SOURCE_BEHIND_OWNER_TESTED_V019');
  }
  if (!input.provenance || typeof input.provenance !== 'object') {
    blockers.push('OWNER_TESTED_SOURCE_RECONCILIATION_MISSING');
  } else {
    if (input.provenance.owner_accepted_version !== input.manifestVersion) {
      blockers.push('OWNER_ACCEPTED_VERSION_MISMATCH');
    }
    if (!input.sourceSha256 || input.provenance.source_sha256 !== input.sourceSha256) {
      blockers.push('SOURCE_SHA256_NOT_RECONCILED');
    }
    if (!input.bundleSha256 || input.provenance.bundle_sha256 !== input.bundleSha256) {
      blockers.push('BUNDLE_SHA256_NOT_RECONCILED');
    }
    if (input.provenance.production_release_authorized !== true) {
      blockers.push('PRODUCTION_RELEASE_NOT_AUTHORIZED');
    }
  }
  return { releaseReady: blockers.length === 0, blockers };
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}
function sha256File(path) {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function inspectRepository(root = ROOT) {
  const manifest = readJson(resolve(root, 'manifest.json'));
  const pkg = readJson(resolve(root, 'package.json'));
  const provenance = readJson(resolve(root, PROVENANCE_FILE));
  const input = {
    manifestVersion: manifest?.version ?? null,
    packageVersion: pkg?.version ?? null,
    sourceSha256: sha256File(resolve(root, 'src/main.ts')),
    bundleSha256: sha256File(resolve(root, 'main.js')),
    provenance,
  };
  const result = evaluateProvenance(input);
  return {
    ...result,
    manifestVersion: input.manifestVersion,
    packageVersion: input.packageVersion,
    minimumOwnerTestedVersion: MINIMUM_OWNER_TESTED_VERSION,
    sourceSha256: input.sourceSha256,
    bundleSha256: input.bundleSha256,
    provenancePresent: provenance !== null,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? '--status';
  if (!['--status', '--release'].includes(mode)) {
    process.stderr.write('Usage: node scripts/release-provenance.mjs [--status|--release]\n');
    process.exitCode = 2;
  } else {
    const result = inspectRepository();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (mode === '--release' && !result.releaseReady) process.exitCode = 3;
  }
}
