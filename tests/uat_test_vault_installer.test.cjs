const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const releaseRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(releaseRoot, 'scripts/uat-install-kienvu-test-vault.sh');
const files = ['main.js', 'manifest.json', 'styles.css'];

function invoke(vault, mode) {
  return spawnSync('bash', [scriptPath, mode], {
    cwd: releaseRoot,
    env: { ...process.env, HAKISEND_UAT_VAULT_PATH: vault },
    encoding: 'utf8'
  });
}

test('test-vault-only installer preserves data.json, backups, and refuses version drift', (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hakisend-0136-uat-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const vault = path.join(fixtureRoot, 'HakiSend-Test', 'HakiSend-Test');
  const pluginDir = path.join(vault, '.obsidian/plugins/hakisend-publisher');
  fs.mkdirSync(pluginDir, { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(releaseRoot, file), path.join(pluginDir, file));

  const installedManifest = path.join(pluginDir, 'manifest.json');
  const originalManifest = JSON.parse(fs.readFileSync(installedManifest, 'utf8'));
  originalManifest.version = '0.1.35';
  fs.writeFileSync(installedManifest, JSON.stringify(originalManifest));
  const dataJson = path.join(pluginDir, 'data.json');
  const privateFixture = '{"private_fixture":"do-not-modify"}\n';
  fs.writeFileSync(dataJson, privateFixture);

  const before = invoke(vault, '--preflight');
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /RESULT=OBSIDIAN_0136_TEST_VAULT_PREFLIGHT_PASS/);
  assert.equal(fs.readFileSync(installedManifest, 'utf8'), JSON.stringify(originalManifest));

  const install = invoke(vault, '--install');
  assert.equal(install.status, 0, install.stderr);
  assert.match(install.stdout, /RESULT=OBSIDIAN_0136_TEST_VAULT_INSTALLED/);
  assert.match(install.stdout, /KIENOS_VAULT=UNTOUCHED/);
  assert.equal(fs.readFileSync(dataJson, 'utf8'), privateFixture);
  for (const file of files) {
    assert.deepEqual(fs.readFileSync(path.join(pluginDir, file)), fs.readFileSync(path.join(releaseRoot, file)));
  }

  const backupPath = install.stdout.match(/^BACKUP=(.+)$/m)?.[1];
  assert.ok(backupPath, 'backup path must be printed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(backupPath, 'manifest.json'), 'utf8')).version, '0.1.35');

  const driftManifest = JSON.parse(fs.readFileSync(installedManifest, 'utf8'));
  driftManifest.version = '0.1.99';
  fs.writeFileSync(installedManifest, JSON.stringify(driftManifest));
  const drift = invoke(vault, '--install');
  assert.notEqual(drift.status, 0, 'must refuse unknown installed version');
  assert.equal(JSON.parse(fs.readFileSync(installedManifest, 'utf8')).version, '0.1.99');

  const forbidden = invoke(path.join(fixtureRoot, 'KIENOS', 'KIENOS'), '--install');
  assert.notEqual(forbidden.status, 0, 'must refuse KIENOS target');
});
