const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8');

test('release workflow builds macOS DMGs for Apple Silicon and Intel Macs', () => {
  assert.match(workflow, /platform:\s+macos-arm64/);
  assert.match(workflow, /runner:\s+macos-latest/);
  assert.match(workflow, /platform:\s+macos-x64/);
  assert.match(workflow, /runner:\s+macos-15-intel/);
  assert.match(workflow, /bundle\/dmg\/\*\.dmg/);
  assert.doesNotMatch(workflow, /-\s+platform:\s+macos\s*\n/);
  assert.doesNotMatch(workflow, /bundle\/macos\/\*\.zip/);
});

test('release workflow renames the Windows installer with version and architecture', () => {
  assert.match(workflow, /Normalize Windows installer name/);
  assert.match(workflow, /Airouter_\$\{version\}_x64-setup\.exe/);
  assert.match(workflow, /desktop\/src-tauri\/target\/release\/bundle\/nsis\/\*\.exe/);
});
