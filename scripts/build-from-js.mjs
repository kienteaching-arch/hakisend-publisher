import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, renameSync, unlinkSync, watch } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const sourcePath = 'src/runtime/main.js';
const outputPath = 'main.js';
const verifyOnly = process.argv.includes('--verify');
const watchMode = process.argv.includes('--watch');

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

function verify() {
  const source = readFileSync(sourcePath);
  const output = readFileSync(outputPath);
  assert(source.equals(output), `Build mismatch: ${sourcePath} differs from ${outputPath}`);
  console.log(`JS_RUNTIME_BUILD=PASS SHA256=${digest(output)}`);
}

function build() {
  const temporary = join(dirname(outputPath), `.${basename(outputPath)}.${randomUUID()}.tmp`);
  try {
    copyFileSync(sourcePath, temporary);
    renameSync(temporary, outputPath);
  } catch (error) {
    // Failed builds must not leave an incomplete output at main.js.
    try { unlinkSync(temporary); } catch { /* cleanup best effort */ }
    throw error;
  }
  verify();
}

if (verifyOnly) {
  verify();
} else {
  build();
  if (watchMode) {
    console.log(`Watching ${sourcePath} for updates...`);
    let pending = false;
    watch(sourcePath, () => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        try { build(); } catch (error) { console.error(error); }
      }, 100);
    });
  }
}
