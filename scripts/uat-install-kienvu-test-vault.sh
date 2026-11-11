#!/usr/bin/env bash
set -Eeuo pipefail

# Local KIENVU desktop UAT only. Never targets the KIENOS production vault.
# Usage: bash scripts/uat-install-kienvu-test-vault.sh --preflight|--install

if [[ $# -ne 1 || ( "$1" != "--preflight" && "$1" != "--install" ) ]]; then
  echo 'Usage: bash scripts/uat-install-kienvu-test-vault.sh --preflight|--install' >&2
  exit 2
fi

mode="$1"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
release_dir="$(cd -- "$script_dir/.." && pwd -P)"
vault_dir="${HAKISEND_UAT_VAULT_PATH:-$HOME/HakiSend-Test/HakiSend-Test}"
target_dir="$vault_dir/.obsidian/plugins/hakisend-publisher"
expected_sha256='b0b955434340fc81bdd880544bf7ee99c216601dbade20dd35c70f529c77d12e'
files=(main.js manifest.json styles.css)

echo '=== OBSIDIAN PUBLISHER 0.1.36 TEST VAULT ==='
echo "MODE=$mode"

if [[ "$vault_dir" != /* || "$(basename -- "$vault_dir")" != 'HakiSend-Test' || "$(basename -- "$(dirname -- "$vault_dir")")" != 'HakiSend-Test' ]]; then
  echo 'STOP: Only a vault named HakiSend-Test inside a HakiSend-Test directory is allowed.' >&2
  exit 2
fi

test -d "$target_dir" || { echo 'STOP: Test vault plugin directory not found.' >&2; exit 2; }
test ! -L "$vault_dir" && test ! -L "$vault_dir/.obsidian" && test ! -L "$vault_dir/.obsidian/plugins" && test ! -L "$target_dir" || {
  echo 'STOP: A vault/plugin path is a symlink.' >&2; exit 2;
}

for file in "${files[@]}"; do
  test -f "$release_dir/$file" && test ! -L "$release_dir/$file" || {
    echo "STOP: Invalid release asset: $file" >&2; exit 2;
  }
  test -f "$target_dir/$file" && test ! -L "$target_dir/$file" || {
    echo "STOP: Invalid installed asset: $file" >&2; exit 2;
  }
done

command -v node >/dev/null 2>&1 || { echo 'STOP: Node.js is required to verify the package.' >&2; exit 2; }
node --check "$release_dir/main.js"

node - "$release_dir/manifest.json" "$target_dir/manifest.json" <<'NODE'
const fs = require('node:fs');
const [releaseFile, installedFile] = process.argv.slice(2);
const candidate = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
const installed = JSON.parse(fs.readFileSync(installedFile, 'utf8'));
if (candidate.id !== 'hakisend-publisher' || candidate.version !== '0.1.36') {
  throw new Error('Unexpected candidate plugin ID/version');
}
if (installed.id !== 'hakisend-publisher' || !/^0\.1\.(34|35|36)$/.test(installed.version)) {
  throw new Error('Unexpected installed plugin ID/version; do not overwrite');
}
console.log('INSTALLED_VERSION=' + installed.version);
console.log('CANDIDATE_VERSION=' + candidate.version);
NODE

actual_sha256="$(sha256sum "$release_dir/main.js")"
actual_sha256="${actual_sha256%% *}"
[[ "$actual_sha256" == "$expected_sha256" ]] || {
  echo 'STOP: Candidate main.js checksum mismatch.' >&2; exit 2;
}
echo 'CANDIDATE_SHA256=PASS'

data_file="$target_dir/data.json"
test ! -L "$data_file" || { echo 'STOP: data.json is a symlink.' >&2; exit 2; }
data_before='absent'
if [[ -f "$data_file" ]]; then
  data_before="$(sha256sum "$data_file")"
  data_before="${data_before%% *}"
fi

if [[ "$mode" == '--preflight' ]]; then
  echo 'DATA_JSON=UNCHANGED'
  echo 'RESULT=OBSIDIAN_0136_TEST_VAULT_PREFLIGHT_PASS'
  exit 0
fi

backup_parent="$vault_dir/.obsidian/uat-backups/hakisend-publisher"
test ! -L "$vault_dir/.obsidian/uat-backups" && test ! -L "$backup_parent" || {
  echo 'STOP: UAT backup directory is a symlink.' >&2; exit 2;
}
umask 077
mkdir -p -- "$backup_parent"
backup_dir="$(mktemp -d "$backup_parent/before-0.1.36.XXXXXXXX")"
backup_ready=0
stage_dir=''

on_exit() {
  exit_code=$?
  trap - EXIT
  if [[ $exit_code -ne 0 && $backup_ready -eq 1 ]]; then
    echo 'INSTALL_FAILED=ATTEMPTING_ROLLBACK' >&2
    for file in "${files[@]}"; do
      if [[ -f "$backup_dir/$file" ]]; then
        cp -p -- "$backup_dir/$file" "$target_dir/$file" || true
      fi
    done
    echo "BACKUP=$backup_dir" >&2
  fi
  if [[ -n "$stage_dir" && -d "$stage_dir" ]]; then
    for file in "${files[@]}"; do
      [[ ! -f "$stage_dir/$file" ]] || rm -f -- "$stage_dir/$file"
    done
    rmdir -- "$stage_dir" 2>/dev/null || true
  fi
  exit "$exit_code"
}
trap on_exit EXIT

for file in "${files[@]}"; do
  cp -p -- "$target_dir/$file" "$backup_dir/$file"
  cmp -s -- "$target_dir/$file" "$backup_dir/$file"
done
backup_ready=1

stage_dir="$(mktemp -d "$target_dir/.hs-0136-stage.XXXXXXXX")"
for file in "${files[@]}"; do
  install -m 0644 -- "$release_dir/$file" "$stage_dir/$file"
  cmp -s -- "$release_dir/$file" "$stage_dir/$file"
done

for file in "${files[@]}"; do
  mv -f -- "$stage_dir/$file" "$target_dir/$file"
  cmp -s -- "$release_dir/$file" "$target_dir/$file"
done

data_after='absent'
if [[ -f "$data_file" ]]; then
  data_after="$(sha256sum "$data_file")"
  data_after="${data_after%% *}"
fi
[[ "$data_after" == "$data_before" ]] || {
  echo 'STOP: data.json changed during install; review your test vault before continuing.' >&2
  exit 2
}

backup_ready=0
echo "BACKUP=$backup_dir"
echo 'DATA_JSON=UNCHANGED'
echo 'KIENOS_VAULT=UNTOUCHED'
echo 'RESULT=OBSIDIAN_0136_TEST_VAULT_INSTALLED'
echo 'Restart Obsidian and test the HakiSend-Test vault only.'
