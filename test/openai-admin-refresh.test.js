const test = require('node:test');
const assert = require('node:assert/strict');

const { activateConfigAdminResponse, refreshConfigAdminResponse } = require('../openai');

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

test('activateConfigAdminResponse switches the active runtime config without refreshing quotas', async () => {
  const calls = [];
  const manager = {
    activateConfig: (index, reason) => {
      calls.push(['activate', index, reason]);
    },
    refreshQuotas: async reason => {
      calls.push(['refresh', reason]);
    },
  };
  const expectedResponse = {
    active_config_index: 1,
  };

  const response = await activateConfigAdminResponse(1, {
    accountManager: manager,
    buildResponse: () => expectedResponse,
  });

  assert.deepEqual(calls, [['activate', 1, 'admin_manual_activate']]);
  assert.equal(response, expectedResponse);
});
