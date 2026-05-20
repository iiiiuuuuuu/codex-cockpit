const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizeLineLimit, readRecentLogContent } = require('../app/log-reader');

test('normalizeLineLimit clamps invalid values and caps the maximum', () => {
  assert.equal(normalizeLineLimit(''), 100);
  assert.equal(normalizeLineLimit('0'), 100);
  assert.equal(normalizeLineLimit('-3'), 100);
  assert.equal(normalizeLineLimit('25'), 25);
  assert.equal(normalizeLineLimit('1200'), 1000);
});

test('readRecentLogContent returns the latest requested log lines', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airouter-log-reader-'));
  const logFile = path.join(tempDir, 'openai.log');
  fs.writeFileSync(logFile, ['line-1', 'line-2', 'line-3', 'line-4'].join('\n'));

  const snapshot = readRecentLogContent(logFile, 2);

  assert.equal(snapshot.exists, true);
  assert.equal(snapshot.lineCount, 2);
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.content, 'line-3\nline-4');
});

test('readRecentLogContent handles missing or empty files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airouter-log-reader-'));
  const logFile = path.join(tempDir, 'openai.log');

  assert.deepEqual(readRecentLogContent(logFile, 5), {
    content: '',
    lineCount: 0,
    truncated: false,
    exists: false,
  });

  fs.writeFileSync(logFile, '\n');

  assert.deepEqual(readRecentLogContent(logFile, 5), {
    content: '',
    lineCount: 0,
    truncated: false,
    exists: true,
  });
});
