const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  collectQuotaHistories,
  getQuotaHistoryAccountKey,
  hydrateQuotaHistories,
  readQuotaHistoryFile,
  writeQuotaHistoryFile,
} = require('../app/quota-history-store');

function createConfig(overrides = {}) {
  return {
    type: 'token',
    index: 0,
    baseUrl: 'https://chatgpt.com',
    account_id: 'account-1',
    access_token: 'token-old',
    runtime: {
      quotaHistory: [],
      weeklyQuotaHistory: [],
    },
    ...overrides,
  };
}

test('quota history account key stays stable across token refreshes', () => {
  const beforeRefresh = createConfig({ access_token: 'token-old' });
  const afterRefresh = createConfig({ access_token: 'token-new' });

  assert.equal(getQuotaHistoryAccountKey(beforeRefresh), getQuotaHistoryAccountKey(afterRefresh));
  assert.doesNotMatch(getQuotaHistoryAccountKey(afterRefresh), /token-new/);
});

test('quota history store persists primary and weekly history with separate retention windows', () => {
  const now = 1713337200000;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airouter-quota-history-'));
  const filePath = path.join(dir, 'quota-history.json');
  const config = createConfig({
    runtime: {
      quotaHistory: [
        { at: now - (24 * 60 * 60 * 1000) - 1, remainingPercent: 80, resetAt: 1713350000, reason: 'ok', available: true },
        { at: now - 60 * 1000, remainingPercent: 70, resetAt: 1713350000, reason: 'ok', available: true },
      ],
      weeklyQuotaHistory: [
        { at: now - (7 * 24 * 60 * 60 * 1000) - 1, remainingPercent: 90, resetAt: 1713360000, reason: 'ok', available: true },
        { at: now - 60 * 1000, remainingPercent: 85, resetAt: 1713360000, reason: 'ok', available: true },
      ],
    },
  });

  writeQuotaHistoryFile(filePath, [config], { now: () => now });
  const persisted = readQuotaHistoryFile(filePath);
  const restoredConfig = createConfig({ access_token: 'token-new' });
  hydrateQuotaHistories([restoredConfig], persisted, { now: () => now });

  assert.deepEqual(
    collectQuotaHistories([restoredConfig], { now: () => now }).accounts[getQuotaHistoryAccountKey(restoredConfig)],
    {
      primary: [
        { at: now - 60 * 1000, remainingPercent: 70, resetAt: 1713350000, reason: 'ok', available: true },
      ],
      weekly: [
        { at: now - 60 * 1000, remainingPercent: 85, resetAt: 1713360000, reason: 'ok', available: true },
      ],
    }
  );
});
