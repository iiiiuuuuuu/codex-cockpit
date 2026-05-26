const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ConfigEditorError,
  addConfigItem,
  buildImportedConfigItem,
  updateConfigItem,
  updateConfigSortOrder,
  updateConfigSettings,
  deleteConfigItem,
  readParsedConfigFile,
  writeParsedConfigFile,
} = require('../app/config-editor');

function createTokenConfig(overrides = {}) {
  return {
    proxy_port: 7890,
    port: 3009,
    claude_code: {
      model: 'gpt-5.4',
      reasoning_effort: 'high',
    },
    configs: [
      {
        access_token: 'token-1',
        account_id: 'account-1',
        description: 'primary',
      },
    ],
    ...overrides,
  };
}

function createApiKeyConfig(overrides = {}) {
  return {
    configs: [
      {
        type: 'apikey',
        apikey: 'sk-primary',
        base_url: 'https://api.openai.com/v1',
        description: 'primary key',
      },
    ],
    ...overrides,
  };
}

function createFakeJwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');
}

test('addConfigItem appends a token config and preserves top-level settings', () => {
  const parsed = createTokenConfig();

  const next = addConfigItem(parsed, {
    access_token: 'token-2',
    account_id: 42,
    description: 'backup',
  });

  assert.equal(next.proxy_port, 7890);
  assert.equal(next.port, 3009);
  assert.equal(next.claude_code.model, 'gpt-5.4');
  assert.equal(next.configs.length, 2);
  assert.deepEqual(next.configs[1], {
    access_token: 'token-2',
    account_id: '42',
    description: 'backup',
  });
});

test('buildImportedConfigItem extracts token fields from auth session JSON', () => {
  const imported = buildImportedConfigItem('token', {
    type: 'codex',
    user: {
      email: 'user@example.com',
    },
    account: {
      id: 'account-from-session',
    },
    accessToken: 'access-token-from-session',
  });

  assert.deepEqual(imported, {
    description: 'user@example.com',
    account_id: 'account-from-session',
    access_token: 'access-token-from-session',
  });
});

test('buildImportedConfigItem preserves refresh_token from auth session JSON', () => {
  const imported = buildImportedConfigItem('token', {
    user: {
      email: 'user@example.com',
    },
    account: {
      id: 'account-from-session',
    },
    accessToken: 'access-token-from-session',
    refresh_token: 'refresh-token-from-session',
  });

  assert.deepEqual(imported, {
    description: 'user@example.com',
    account_id: 'account-from-session',
    access_token: 'access-token-from-session',
    refresh_token: 'refresh-token-from-session',
  });
});

test('buildImportedConfigItem preserves token started_at from auth session JSON', () => {
  const imported = buildImportedConfigItem('token', {
    user: {
      email: 'user@example.com',
    },
    account: {
      id: 'account-from-session',
    },
    accessToken: 'access-token-from-session',
    started_at: '2026-05-01',
  });

  assert.equal(imported.started_at, '2026-05-01');
});

test('buildImportedConfigItem preserves token started_at with hour and minute', () => {
  const imported = buildImportedConfigItem('token', {
    account: {
      id: 'account-from-session',
    },
    accessToken: 'access-token-from-session',
    started_at: '2026-05-01T09:30',
  });

  assert.equal(imported.started_at, '2026-05-01T09:30');
});

test('buildImportedConfigItem preserves token stopped_at from auth session JSON', () => {
  const imported = buildImportedConfigItem('token', {
    account: {
      id: 'account-from-session',
    },
    accessToken: 'access-token-from-session',
    stopped_at: '2026-05-08T18:20',
  });

  assert.equal(imported.stopped_at, '2026-05-08T18:20');
});

test('buildImportedConfigItem supports direct credential JSON with email and JWT client_id', () => {
  const imported = buildImportedConfigItem('token', {
    access_token: createFakeJwt({
      client_id: 'app-from-access-token',
    }),
    account_id: 'account-from-direct-json',
    email: 'user@example.com',
    refresh_token: 'refresh-token-from-direct-json',
  });

  assert.equal(imported.description, 'user@example.com');
  assert.equal(imported.account_id, 'account-from-direct-json');
  assert.equal(imported.refresh_token, 'refresh-token-from-direct-json');
  assert.equal(imported.client_id, 'app-from-access-token');
});

test('buildImportedConfigItem accepts camelCase and nested token refresh fields', () => {
  const camelCaseImported = buildImportedConfigItem('token', {
    account: {
      id: 'account-from-session',
    },
    accessToken: 'access-token-from-session',
    refreshToken: 'refresh-token-camel',
  });
  const nestedImported = buildImportedConfigItem('token', {
    account: {
      id: 'account-from-session',
    },
    accessToken: 'access-token-from-session',
    tokens: {
      refresh_token: 'refresh-token-nested',
    },
  });

  assert.equal(camelCaseImported.refresh_token, 'refresh-token-camel');
  assert.equal(nestedImported.refresh_token, 'refresh-token-nested');
});

test('buildImportedConfigItem keeps explicit token config fields when provided', () => {
  const imported = buildImportedConfigItem('token', {
    description: 'manual description',
    account_id: 'manual-account',
    access_token: 'manual-token',
    refresh_token: 'manual-refresh-token',
    accessToken: 'ignored-session-token',
  });

  assert.deepEqual(imported, {
    description: 'manual description',
    account_id: 'manual-account',
    access_token: 'manual-token',
    refresh_token: 'manual-refresh-token',
  });
});

test('buildImportedConfigItem rejects token input without required session fields', () => {
  assert.throws(() => {
    buildImportedConfigItem('token', {
      user: {
        email: 'user@example.com',
      },
    });
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /AuthSession JSON/);
    return true;
  });
});

test('buildImportedConfigItem keeps item-level apikey credentials', () => {
  const imported = buildImportedConfigItem({
    type: 'apikey',
    apikey: '  sk-third-party  ',
    base_url: ' https://api.example.com/v1/ ',
    description: ' third party ',
    support: [' gpt ', 'claude', 'gpt'],
  });

  assert.deepEqual(imported, {
    type: 'apikey',
    apikey: 'sk-third-party',
    base_url: 'https://api.example.com/v1',
    description: 'third party',
    support: ['gpt', 'claude'],
  });
});

test('updateConfigItem overwrites editable fields but keeps unknown keys on the item', () => {
  const parsed = createTokenConfig({
    configs: [
      {
        access_token: 'token-1',
        account_id: 'account-1',
        description: 'primary',
        alias: 'main',
        custom_note: 'keep-me',
      },
    ],
  });

  const next = updateConfigItem(parsed, 0, {
    access_token: 'token-9',
    account_id: 'account-9',
    description: 'rotated',
  });

  assert.deepEqual(next.configs[0], {
    access_token: 'token-9',
    account_id: 'account-9',
    description: 'rotated',
    alias: 'main',
    custom_note: 'keep-me',
  });
});

test('updateConfigItem normalizes auto switch disabled flags', () => {
  const parsed = createTokenConfig({
    configs: [
      {
        access_token: 'token-1',
        account_id: 'account-1',
        description: 'primary',
      },
    ],
  });

  const disabled = updateConfigItem(parsed, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    auto_switch_disabled: true,
  });

  assert.equal(disabled.configs[0].auto_switch_disabled, true);

  const enabled = updateConfigItem(disabled, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    auto_switch_disabled: false,
  });

  assert.equal(Object.prototype.hasOwnProperty.call(enabled.configs[0], 'auto_switch_disabled'), false);
});

test('updateConfigItem normalizes sort_order', () => {
  const parsed = createTokenConfig();

  const next = updateConfigItem(parsed, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    sort_order: ' 30 ',
  });

  assert.equal(next.configs[0].sort_order, 30);
});

test('updateConfigItem normalizes price_yuan and hides zero values', () => {
  const parsed = createTokenConfig();

  const priced = updateConfigItem(parsed, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    price_yuan: ' 20.5 ',
  });

  assert.equal(priced.configs[0].price_yuan, 20.5);

  const cleared = updateConfigItem(priced, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    price_yuan: '0',
  });

  assert.equal(Object.prototype.hasOwnProperty.call(cleared.configs[0], 'price_yuan'), false);
});

test('updateConfigItem normalizes started_at and allows clearing it', () => {
  const parsed = createTokenConfig();

  const dated = updateConfigItem(parsed, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    started_at: '2026-05-01',
  });

  assert.equal(dated.configs[0].started_at, '2026-05-01T00:00:00');

  const cleared = updateConfigItem(dated, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    started_at: '',
  });

  assert.equal(Object.prototype.hasOwnProperty.call(cleared.configs[0], 'started_at'), false);
});

test('updateConfigItem normalizes started_at with hour and minute', () => {
  const next = updateConfigItem(createTokenConfig(), 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    started_at: '2026-05-01T09:30',
  });

  assert.equal(next.configs[0].started_at, '2026-05-01T09:30:00');
});

test('updateConfigItem accepts started_at with seconds and stores second precision', () => {
  const next = updateConfigItem(createTokenConfig(), 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    started_at: '2026-05-01T09:30:45',
  });

  assert.equal(next.configs[0].started_at, '2026-05-01T09:30:45');
});

test('updateConfigItem rejects invalid started_at', () => {
  assert.throws(() => {
    updateConfigItem(createTokenConfig(), 0, {
      access_token: 'token-1',
      account_id: 'account-1',
      description: 'primary',
      started_at: '2026-02-31',
    });
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /started_at/);
    return true;
  });
});

test('updateConfigItem normalizes stopped_at and allows clearing it', () => {
  const parsed = createTokenConfig();

  const stopped = updateConfigItem(parsed, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    stopped_at: '2026-05-08T18:20',
  });

  assert.equal(stopped.configs[0].stopped_at, '2026-05-08T18:20:00');

  const cleared = updateConfigItem(stopped, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    stopped_at: '',
  });

  assert.equal(Object.prototype.hasOwnProperty.call(cleared.configs[0], 'stopped_at'), false);
});

test('updateConfigItem normalizes deleted_at and allows clearing it', () => {
  const parsed = createTokenConfig();

  const deleted = updateConfigItem(parsed, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    deleted_at: '2026-05-08T18:20',
  });

  assert.equal(deleted.configs[0].deleted_at, '2026-05-08T18:20:00');

  const restored = updateConfigItem(deleted, 0, {
    access_token: 'token-1',
    account_id: 'account-1',
    description: 'primary',
    deleted_at: null,
  });

  assert.equal(Object.prototype.hasOwnProperty.call(restored.configs[0], 'deleted_at'), false);
});

test('updateConfigItem rejects invalid stopped_at', () => {
  assert.throws(() => {
    updateConfigItem(createTokenConfig(), 0, {
      access_token: 'token-1',
      account_id: 'account-1',
      description: 'primary',
      stopped_at: '2026-02-31',
    });
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /stopped_at/);
    return true;
  });
});

test('updateConfigItem rejects invalid deleted_at', () => {
  assert.throws(() => {
    updateConfigItem(createTokenConfig(), 0, {
      access_token: 'token-1',
      account_id: 'account-1',
      description: 'primary',
      deleted_at: '2026-02-31',
    });
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /deleted_at/);
    return true;
  });
});

test('updateConfigItem rejects invalid price_yuan', () => {
  assert.throws(() => {
    updateConfigItem(createTokenConfig(), 0, {
      access_token: 'token-1',
      account_id: 'account-1',
      description: 'primary',
      price_yuan: '12.345',
    });
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /price_yuan/);
    return true;
  });
});

test('updateConfigSortOrder persists display order fields without moving configs', () => {
  const parsed = createTokenConfig({
    configs: [
      {
        access_token: 'token-1',
        account_id: 'account-1',
        description: 'first',
      },
      {
        access_token: 'token-2',
        account_id: 'account-2',
        description: 'second',
      },
      {
        access_token: 'token-3',
        account_id: 'account-3',
        description: 'third',
      },
    ],
  });

  const next = updateConfigSortOrder(parsed, [2, 0, 1]);

  assert.deepEqual(next.configs.map(item => item.description), ['first', 'second', 'third']);
  assert.deepEqual(next.configs.map(item => item.sort_order), [20, 30, 10]);
});

test('updateConfigSortOrder rejects duplicate indexes', () => {
  assert.throws(() => {
    updateConfigSortOrder(createTokenConfig(), [0, 0]);
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /重复索引/);
    return true;
  });
});

test('deleteConfigItem allows removing the last remaining config', () => {
  const next = deleteConfigItem(createTokenConfig(), 0);

  assert.deepEqual(next.configs, []);
});

test('updateConfigSettings normalizes top-level apikeys and auth_token', () => {
  const withSecuritySettings = updateConfigSettings(createTokenConfig(), {
    apikeys: ['  router-secret  ', '', 'backup-secret'],
    auth_token: '  admin-secret  ',
  });

  assert.deepEqual(withSecuritySettings.apikeys, ['router-secret', 'backup-secret']);
  assert.equal(withSecuritySettings.auth_token, 'admin-secret');

  const cleared = updateConfigSettings(withSecuritySettings, {
    apikeys: [],
    auth_token: '   ',
  });

  assert.deepEqual(cleared.apikeys, []);
  assert.equal(cleared.auth_token, '');
  assert.equal(cleared.configs.length, 1);
  assert.equal(cleared.configs[0].description, 'primary');
});

test('updateConfigSettings normalizes service port and proxy port settings', () => {
  const next = updateConfigSettings(createTokenConfig(), {
    port: ' 3010 ',
    proxy_port: ' 7890 ',
  });

  assert.equal(next.port, 3010);
  assert.equal(next.proxy_port, 7890);

  const clearedProxy = updateConfigSettings(next, {
    proxy_port: '',
  });

  assert.equal(clearedProxy.port, 3010);
  assert.equal(clearedProxy.proxy_port, undefined);
});

test('updateConfigSettings normalizes routing preference', () => {
  const next = updateConfigSettings(createTokenConfig(), {
    routing_preference: 'apikey_first',
  });

  assert.equal(next.routing_preference, 'apikey_first');

  assert.throws(() => {
    updateConfigSettings(createTokenConfig(), {
      routing_preference: 'apikey-random',
    });
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /routing_preference 仅支持/);
    return true;
  });
});

test('updateConfigSettings rejects invalid port settings', () => {
  assert.throws(() => {
    updateConfigSettings(createTokenConfig(), {
      port: '70000',
    });
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /port 必须是 1-65535/);
    return true;
  });
});

test('updateConfigSettings normalizes responses.model_aliases and preserves other settings', () => {
  const next = updateConfigSettings(createTokenConfig(), {
    responses: {
      codex_speed_mode: 'fast',
      model_aliases: {
        '  GPT-5.2  ': '  gpt-5.5  ',
        'o3-mini': ' gpt-5.4 ',
      },
    },
  });

  assert.deepEqual(next.responses, {
    codex_speed_mode: 'fast',
    model_aliases: {
      'GPT-5.2': 'gpt-5.5',
      'o3-mini': 'gpt-5.4',
    },
  });
  assert.equal(next.claude_code.model, 'gpt-5.4');
  assert.equal(next.configs.length, 1);
});

test('updateConfigSettings rejects invalid responses.codex_speed_mode', () => {
  assert.throws(() => {
    updateConfigSettings(createTokenConfig(), {
      responses: {
        codex_speed_mode: 'turbo',
      },
    });
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /responses\.codex_speed_mode 仅支持 standard 或 fast/);
    return true;
  });
});

test('updateConfigSettings rejects non-object responses.model_aliases', () => {
  assert.throws(() => {
    updateConfigSettings(createTokenConfig(), {
      responses: {
        model_aliases: 'gpt-5.2=gpt-5.5',
      },
    });
  }, err => {
    assert.equal(err instanceof ConfigEditorError, true);
    assert.match(err.message, /responses\.model_aliases 必须是对象/);
    return true;
  });
});

test('writeParsedConfigFile persists a validated config file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airouter-config-editor-'));
  const configPath = path.join(tempDir, 'openai.json');
  const parsed = addConfigItem(createTokenConfig(), {
    access_token: 'token-2',
    account_id: 'account-2',
    description: 'secondary',
  });

  writeParsedConfigFile(configPath, parsed);
  const loaded = readParsedConfigFile(configPath);

  assert.equal(loaded.configs.length, 2);
  assert.equal(loaded.configs[1].description, 'secondary');
});

test('writeParsedConfigFile rejects invalid apikey entries', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airouter-config-editor-'));
  const configPath = path.join(tempDir, 'openai.json');

  assert.throws(() => {
    writeParsedConfigFile(configPath, createApiKeyConfig({
      configs: [
        {
          type: 'apikey',
          apikey: '',
          base_url: '',
          description: 'broken',
        },
      ],
    }));
  }, err => {
    assert.equal(err instanceof Error, true);
    assert.match(err.message, /apikey 配置至少需要 apikey 和 base_url/);
    return true;
  });
});
