const test = require('node:test');
const assert = require('node:assert/strict');

const { refreshConfigAdminResponse } = require('../openai');

test('refreshConfigAdminResponse refreshes all quotas before building the admin snapshot in token mode', async () => {
  const calls = [];
  const manager = {
    refreshQuotas: async reason => {
      calls.push(reason);
    },
  };
  const expectedResponse = {
    mode: 'token',
    configs: [],
  };

  const response = await refreshConfigAdminResponse({
    accountManager: manager,
    shouldRefreshQuota: true,
    buildResponse: () => expectedResponse,
  });

  assert.deepEqual(calls, ['admin_refresh']);
  assert.equal(response, expectedResponse);
});

test('refreshConfigAdminResponse skips quota refresh when no token configs exist', async () => {
  let called = false;
  const manager = {
    refreshQuotas: async () => {
      called = true;
    },
  };
  const expectedResponse = {
    mode: 'apikey',
    configs: [],
  };

  const response = await refreshConfigAdminResponse({
    accountManager: manager,
    shouldRefreshQuota: false,
    buildResponse: () => expectedResponse,
  });

  assert.equal(called, false);
  assert.equal(response, expectedResponse);
});
