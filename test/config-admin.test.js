const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildConfigSnapshotRequest,
  buildRequestUrl,
  buildHelloTestRequest,
  buildJsonRequestOptions,
  formatResponsesModelAliasesInput,
  parseResponsesModelAliasesInput,
  parseResponsesApiResponse,
  extractErrorMessage,
  getPreferredApiKey,
  buildHelloTestHeaders,
  getConfigGuideContent,
  getConfigIdentityColumnLabel,
  getConfigIdentityValue,
  buildConfigItemFromForm,
  buildAdminStatusSummary,
  extractRuntimeStatusTags,
  getActiveConfigLabel,
  hasRefreshTokenConfig,
  extractResponseSummary,
  normalizePortValue,
  buildProxyAccessInfo,
} = require('../public/config-admin.js');

test('config admin hides the responses settings module', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'config-admin.html'), 'utf8');
  const start = html.indexOf('<div id="responsesSettingsSection" class="hidden-settings" hidden>');
  const end = html.indexOf('</main>', start);
  const section = start >= 0 && end > start ? html.slice(start, end) : '';

  assert.ok(section, 'responses settings section should be wrapped in a hidden container');
  assert.match(section, /Responses 设置/);
  assert.match(section, /这里可以配置 `\/v1\/responses` 的模型别名映射/);
  assert.match(section, /saveResponsesSettingsButton/);
});

test('config admin shows upstream config before edit controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'config-admin.html'), 'utf8');
  const messageIndex = html.indexOf('<div id="message"');
  const upstreamIndex = html.indexOf('<section class="panel list-panel">');
  const consoleGridIndex = html.indexOf('<section class="console-grid">');
  const addConfigIndex = html.indexOf('<h2 class="panel-title">新增配置项</h2>');

  assert.ok(messageIndex >= 0, 'message area should be present');
  assert.ok(upstreamIndex > messageIndex, 'upstream config should follow the message area');
  assert.ok(consoleGridIndex > upstreamIndex, 'edit controls should appear after upstream config');
  assert.ok(addConfigIndex > upstreamIndex, 'add config panel should appear after upstream config');
});

test('config admin exposes manual runtime config activation controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'config-admin.html'), 'utf8');

  assert.match(html, /data-action="activate"/);
  assert.match(html, /\/admin\/api\/configs\/\$\{index\}\/activate/);
  assert.match(html, /当前账号已临时切换/);
});

test('config admin keeps the upstream config column compact after adding activation controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'config-admin.html'), 'utf8');

  assert.match(html, /min-width:\s*1040px;/);
  assert.match(html, /\.account-id-col,\s*\.account-id-cell\s*\{\s*width:\s*240px;\s*min-width:\s*240px;/);
  assert.match(html, /\.account-id-cell\s*\{\s*white-space:\s*normal;\s*word-break:\s*break-word;\s*overflow-wrap:\s*anywhere;/);
  assert.match(html, /\.action-cell\s*\{\s*width:\s*150px;\s*white-space:\s*nowrap;/);
});

test('config admin keeps all console controls after UI refresh', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'config-admin.html'), 'utf8');
  const accessControlStart = html.indexOf('<h2 class="panel-title">访问控制</h2>');
  const accessControlEnd = html.indexOf('<div id="responsesSettingsSection"', accessControlStart);
  const accessControlSection = accessControlStart >= 0 && accessControlEnd > accessControlStart
    ? html.slice(accessControlStart, accessControlEnd)
    : '';

  assert.match(html, /class="topbar"/);
  assert.doesNotMatch(html, /id="statusSummary"/);
  assert.match(html, /class="console-grid"/);
  assert.match(html, /id="addApiKeyButton"/);
  assert.match(html, /id="proxySettingsPanel"/);
  assert.match(html, /id="servicePortInput"/);
  assert.match(html, /id="proxyPortInput"/);
  assert.match(html, /id="proxyV1Url"/);
  assert.match(html, /id="saveProxySettingsButton"/);
  assert.match(html, /代理访问地址/);
  assert.match(html, /即时生效/);
  assert.doesNotMatch(html, /重启 App 后完整生效/);
  assert.match(html, /id="refreshButton"/);
  assert.match(html, /id="testResponseButton"/);
  assert.match(html, /id="addButton"/);
  assert.match(html, /config_type:\s*getSelectedConfigMode\(\)/);
  assert.match(html, /href="https:\/\/chatgpt\.com\/api\/auth\/session"/);
  assert.match(html, /data-open-external="true"/);
  assert.match(html, /\/admin\/api\/open-external/);
  assert.match(html, /隐私模式登录 ChatGPT/);
  assert.match(html, /不要退出该登录态/);
  assert.match(html, /name="configMode" value="token"/);
  assert.match(html, /name="configMode" value="apikey"/);
  assert.match(html, /name="apiKeySupport" value="gpt"/);
  assert.match(html, /name="apiKeySupport" value="claude"/);
  assert.match(html, /data-action="activate"/);
  assert.match(html, /data-action="delete"/);
  assert.match(html, /data-action="delete-apikey"/);
  assert.match(html, /可刷新/);
  assert.match(html, /确认删除/);
  assert.doesNotMatch(html, /window\.confirm/);
  assert.ok(accessControlSection, 'access control section should be present');
  assert.match(accessControlSection, /id="addApiKeyButton"/);
});

test('config admin v2 reuses existing admin APIs for accounts, access control, and proxy settings', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'codex-accounts.html'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'openai.js'), 'utf8');

  assert.match(server, /app\.get\('\/admin\/configs\/v2'/);
  assert.match(html, /Codex 配置 v2/);
  assert.match(html, /<script src="\/config-admin\.js"><\/script>/);
  assert.match(html, /buildConfigSnapshotRequest/);
  assert.match(html, /data-section-target="accountsSection"/);
  assert.match(html, /data-section-target="addAccountSection"/);
  assert.match(html, /data-section-target="accessSection"/);
  assert.match(html, /data-section-target="proxySection"/);
  assert.doesNotMatch(html, /id="listViewButton"/);
  assert.doesNotMatch(html, /id="gridViewButton"/);
  assert.doesNotMatch(html, /class="fake-check"/);
  assert.match(html, /data-config-mode="token"/);
  assert.match(html, /data-config-mode="apikey"/);
  assert.match(html, /id="rawJsonInput"/);
  assert.match(html, /id="apiKeyBaseUrlInput"/);
  assert.match(html, /id="apiKeyInput"/);
  assert.match(html, /id="apiKeyDescriptionInput"/);
  assert.match(html, /name="apiKeySupport" value="gpt"/);
  assert.match(html, /name="apiKeySupport" value="claude"/);
  assert.match(html, /id="addConfigButton"/);
  assert.match(html, /config_type: mode/);
  assert.match(html, /getSelectedConfigMode/);
  assert.match(html, /\/admin\/api\/configs'/);
  assert.match(html, /id="addApiKeyButton"/);
  assert.match(html, /\/admin\/api\/apikeys/);
  assert.match(html, /入口 apikey 用于保护 Airouter 本地代理入口/);
  assert.match(html, /Authorization: Bearer &lt;apikey&gt;/);
  assert.match(html, /x-api-key: &lt;apikey&gt;/);
  assert.match(html, /配置多个 key 时，任意一个匹配即可访问/);
  assert.match(html, /列表为空则不校验/);
  assert.match(html, /id="saveProxySettingsButton"/);
  assert.match(html, /\/admin\/api\/settings/);
  assert.match(html, /Airouter 在你本机监听的对外服务端口/);
  assert.match(html, /Codex、OpenAI SDK 或其他客户端/);
  assert.match(html, /本地 VPN\/代理软件正在监听的端口/);
  assert.match(html, /留空则直连/);
  assert.match(html, /填到 Codex\/OpenAI 客户端的 Base URL/);
  assert.match(html, /Responses 接口为/);
  assert.match(html, /\/admin\/api\/configs\/\$\{index\}\/activate/);
  assert.match(html, /\/admin\/api\/configs\/\$\{index\}/);
  assert.match(html, /data-action="activate"/);
  assert.match(html, /data-action="delete"/);
  assert.match(html, /data-action="refresh"/);
  assert.match(html, /\/admin\/api\/configs\/\$\{index\}\/refresh/);
  assert.match(html, /只刷新此账号额度/);
  assert.match(html, /mergeSingleRefreshSnapshot/);
  assert.match(html, /最后检查/);
  assert.match(html, /异常原因/);
  assert.match(html, /title="\$\{escapeHtml\(detailTitle\)\}"/);
  assert.match(html, /账号不可用/);
  assert.match(html, /网络异常，正在第/);
  assert.match(html, /窗口重置：约/);
  assert.match(html, /自动切换/);
  assert.match(html, /<ul class="rule-list">/);
  assert.doesNotMatch(html, /window-dots/);
  assert.doesNotMatch(html, /rules-heading-title/);
  assert.match(html, /<strong>顺序<\/strong>/);
  assert.match(html, /Token 优先于 API Key/);
  assert.match(html, /<strong>触发<\/strong>/);
  assert.match(html, /请求、额度轮询、手动刷新/);
  assert.match(html, /5小时 &lt; 3%/);
  assert.match(html, /周配额 ≤ 1%/);
  assert.match(html, /<strong>兜底<\/strong>/);
  assert.match(html, /没有可用 Token 时使用 API Key/);
  assert.match(html, /legacyLink\.href = withAuthToken\('\/admin\/configs'\)/);
});

test('buildProxyAccessInfo builds displayed proxy URLs from runtime and configured ports', () => {
  assert.equal(normalizePortValue(' 3009 '), 3009);
  assert.equal(normalizePortValue('70000'), null);

  const info = buildProxyAccessInfo({
    runtime_port: 3009,
    file_port: 3010,
    proxy_port: '7890',
  });

  assert.equal(info.runtimePort, 3009);
  assert.equal(info.configuredPort, 3010);
  assert.equal(info.proxyPort, 7890);
  assert.equal(info.v1Url, 'http://localhost:3009/v1');
  assert.equal(info.configuredV1Url, 'http://localhost:3010/v1');
  assert.equal(info.responsesUrl, 'http://localhost:3009/v1/responses');
  assert.equal(info.portPendingRestart, true);
});

test('buildConfigSnapshotRequest uses GET when only loading the latest snapshot', () => {
  assert.deepEqual(
    buildConfigSnapshotRequest(),
    {
      url: '/admin/api/configs',
      options: {},
    },
  );
});

test('buildConfigSnapshotRequest uses POST refresh endpoint when forcing a full quota refresh', () => {
  assert.deepEqual(
    buildConfigSnapshotRequest(true),
    {
      url: '/admin/api/configs/refresh',
      options: {
        method: 'POST',
      },
    },
  );
});

test('buildRequestUrl only appends admin auth token to admin endpoints', () => {
  assert.equal(
    buildRequestUrl('/admin/api/configs', {
      adminAuthToken: 'auth-secret',
      origin: 'http://localhost:3009',
    }),
    '/admin/api/configs?auth_token=auth-secret',
  );
  assert.equal(
    buildRequestUrl('/v1/responses', {
      adminAuthToken: 'auth-secret',
      origin: 'http://localhost:3009',
    }),
    '/v1/responses',
  );
});

test('buildHelloTestRequest matches the Codex CLI responses probe shape', () => {
  const requestBody = buildHelloTestRequest({});

  assert.deepEqual(requestBody, {
    model: 'gpt-5.5',
    instructions: '',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'hello',
          },
        ],
      },
    ],
    tools: [],
    tool_choice: 'auto',
    parallel_tool_calls: false,
    store: false,
    stream: true,
    include: [],
  });
});

test('buildHelloTestHeaders matches the Codex CLI probe headers', () => {
  assert.deepEqual(buildHelloTestHeaders('session-123'), {
    originator: 'codex_cli_rs',
    version: '1.0.1',
    session_id: 'session-123',
    'x-client-request-id': 'session-123',
  });
});

test('formatResponsesModelAliasesInput serializes configured responses aliases', () => {
  assert.equal(
    formatResponsesModelAliasesInput({
      responses: {
        model_aliases: {
          'gpt-5.2': 'gpt-5.5',
        },
      },
    }),
    '{\n  "gpt-5.2": "gpt-5.5"\n}',
  );
});

test('parseResponsesModelAliasesInput parses alias JSON and trims keys and values', () => {
  assert.deepEqual(
    parseResponsesModelAliasesInput('{\n  "  GPT-5.2  ": "  gpt-5.5  "\n}'),
    {
      'GPT-5.2': 'gpt-5.5',
    },
  );
});

test('parseResponsesModelAliasesInput returns an empty object for blank input', () => {
  assert.deepEqual(parseResponsesModelAliasesInput('   '), {});
});

test('parseResponsesModelAliasesInput rejects non-object JSON', () => {
  assert.throws(() => {
    parseResponsesModelAliasesInput('["gpt-5.2", "gpt-5.5"]');
  }, err => {
    assert.equal(err instanceof Error, true);
    assert.match(err.message, /必须是 JSON 对象/);
    return true;
  });
});

test('getPreferredApiKey returns the first configured apikey', () => {
  assert.equal(getPreferredApiKey({
    apikeys: ['router-key', 'backup-key'],
  }), 'router-key');
});

test('getConfigGuideContent explains token JSON and apikey form entry separately', () => {
  const guide = getConfigGuideContent({
    mode: 'token',
  });

  assert.match(guide.rawJsonPlaceholder, /"accessToken": "\.\.\."/);
  assert.match(guide.rawJsonPlaceholder, /"refresh_token": "\.\.\."/);
  assert.doesNotMatch(guide.rawJsonPlaceholder, /"type": "apikey"/);
  assert.equal(guide.steps.some(step => /apikey 模式/.test(step.description)), true);

  const tokenStep = guide.steps.find(step => step.title === 'Token 模式');
  assert.match(tokenStep.description, /AuthSession JSON/);
  assert.match(tokenStep.description, /隐私模式/);
  assert.match(tokenStep.description, /不要退出该登录态/);
  assert.match(tokenStep.example, /"accessToken": "\.\.\."/);
  assert.match(tokenStep.example, /"refresh_token": "\.\.\."/);
  assert.equal(tokenStep.actionText, '打开 AuthSession 页面');
  assert.equal(tokenStep.actionHref, 'https://chatgpt.com/api/auth/session');

  const apiKeyStep = guide.steps.find(step => step.title === 'API Key 模式');
  assert.match(apiKeyStep.description, /输入框/);
  assert.match(apiKeyStep.description, /Claude/);
  assert.match(apiKeyStep.description, /GPT/);
  assert.equal(apiKeyStep.example, undefined);
  assert.equal(apiKeyStep.actionHref, undefined);
});

test('hasRefreshTokenConfig detects token configs that can be refreshed', () => {
  assert.equal(hasRefreshTokenConfig({
    item: {
      refresh_token: 'refresh-token',
    },
  }), true);
  assert.equal(hasRefreshTokenConfig({
    item: {
      type: 'apikey',
      apikey: 'sk-1',
    },
  }), false);
});

test('buildConfigItemFromForm keeps token mode as pasted AuthSession JSON', () => {
  assert.deepEqual(
    buildConfigItemFromForm({
      mode: 'token',
      tokenRawJson: JSON.stringify({
        user: {
          email: 'user@example.com',
        },
        account: {
          id: 'account-1',
        },
        accessToken: 'token-1',
      }),
    }),
    {
      user: {
        email: 'user@example.com',
      },
      account: {
        id: 'account-1',
      },
      accessToken: 'token-1',
    },
  );
});

test('buildConfigItemFromForm builds an apikey config from normal form fields', () => {
  assert.deepEqual(
    buildConfigItemFromForm({
      mode: 'apikey',
      apiKey: '  sk-third-party  ',
      baseUrl: ' https://api.example.com/v1/ ',
      description: ' backup provider ',
      support: ['gpt', 'claude'],
    }),
    {
      type: 'apikey',
      apikey: 'sk-third-party',
      base_url: 'https://api.example.com/v1',
      description: 'backup provider',
      support: ['gpt', 'claude'],
    },
  );
});

test('buildConfigItemFromForm defaults apikey support to gpt when nothing is selected', () => {
  assert.deepEqual(
    buildConfigItemFromForm({
      mode: 'apikey',
      apiKey: 'sk-third-party',
      baseUrl: 'https://api.example.com/v1',
      support: [],
    }),
    {
      type: 'apikey',
      apikey: 'sk-third-party',
      base_url: 'https://api.example.com/v1',
      description: '',
      support: ['gpt'],
    },
  );
});

test('getActiveConfigLabel identifies the active config item', () => {
  assert.equal(
    getActiveConfigLabel({
      configs: [
        { index: 0, is_active: false },
        { index: 1, is_active: true },
      ],
    }),
    '配置 #2',
  );
});

test('getActiveConfigLabel returns default routing when no config is manually active', () => {
  assert.equal(
    getActiveConfigLabel({
      configs: [
        { index: 0, is_active: false },
      ],
    }),
    '自动调度',
  );
});

test('buildAdminStatusSummary summarizes apikeys, configs, active config, and health', () => {
  assert.deepEqual(
    buildAdminStatusSummary({
      apikeys: ['sk-airouter-one', 'sk-airouter-two'],
      configs: [
        {
          index: 0,
          is_active: false,
          runtime: {
            runtime_summary: '可用=否 | 额度=unknown | 刷新时间=unknown | 周额度=unknown | 刷新时间=unknown | 状态=额度检查失败 | 错误=request timeout after 10000ms',
          },
        },
        {
          index: 1,
          is_active: true,
          runtime: {
            runtime_summary: '可用=是 | 额度=83%',
          },
        },
      ],
    }),
    [
      {
        label: '入口 apikey',
        value: '2 个',
        tone: 'ok',
        detail: '请求会校验入口 apikey',
      },
      {
        label: '上游配置',
        value: '2 个',
        tone: 'ok',
        detail: 'Token 与 API Key 配置总数',
      },
      {
        label: '当前激活',
        value: '配置 #2',
        tone: 'active',
        detail: '手动切换会临时覆盖自动调度',
      },
      {
        label: '健康状态',
        value: '1 个异常',
        tone: 'warn',
        detail: '发现 timeout',
      },
    ],
  );
});

test('extractRuntimeStatusTags pulls readable status tags from runtime summary', () => {
  assert.deepEqual(
    extractRuntimeStatusTags({
      runtime_summary: '可用=否 | 额度=unknown | 刷新时间=unknown | 周额度=unknown | 状态=额度检查失败 | 错误=request timeout after 10000ms',
    }),
    [
      { label: '不可用', tone: 'danger' },
      { label: '额度 unknown', tone: 'warn' },
      { label: '刷新 unknown', tone: 'warn' },
      { label: 'timeout', tone: 'danger' },
    ],
  );
});

test('extractRuntimeStatusTags falls back when runtime data is missing', () => {
  assert.deepEqual(
    extractRuntimeStatusTags(null),
    [
      { label: '暂无运行态', tone: 'muted' },
    ],
  );
});

test('getConfigIdentityColumnLabel uses upstream config when any apikey item exists', () => {
  assert.equal(getConfigIdentityColumnLabel({
    configs: [
      {
        item: {
          type: 'apikey',
        },
      },
    ],
  }), '上游配置');
  assert.equal(getConfigIdentityColumnLabel({
    configs: [
      {
        item: {
          account_id: 'account-1',
        },
      },
    ],
  }), 'account_id');
});

test('getConfigIdentityValue shows base_url and masks apikey config secrets', () => {
  assert.equal(
    getConfigIdentityValue(
      { mode: 'mixed' },
      {
        item: {
          type: 'apikey',
          base_url: 'https://api.example.com/v1',
          apikey: 'sk-1234567890',
        },
      },
    ),
    'https://api.example.com/v1 (sk--...7890)',
  );
  assert.equal(
    getConfigIdentityValue(
      { mode: 'mixed' },
      {
        item: {
          type: 'apikey',
          base_url: 'https://claude.example.com/v1',
          apikey: 'sk-claude123456',
          support: ['claude'],
        },
      },
    ),
    'https://claude.example.com/v1 (sk--...3456)',
  );
});

test('extractResponseSummary prefers output_text when available', () => {
  assert.equal(extractResponseSummary({
    output_text: 'hello from upstream',
  }), 'hello from upstream');
});

test('extractResponseSummary falls back to nested output_text content', () => {
  assert.equal(extractResponseSummary({
    output: [
      {
        content: [
          {
            type: 'output_text',
            text: 'nested hello',
          },
        ],
      },
    ],
  }), 'nested hello');
});

test('extractResponseSummary concatenates multiple nested output_text parts', () => {
  assert.equal(extractResponseSummary({
    output: [
      {
        content: [
          {
            type: 'output_text',
            text: 'hello',
          },
          {
            type: 'output_text',
            text: ' world',
          },
        ],
      },
    ],
  }), 'hello world');
});

test('extractResponseSummary returns an empty string when no text is available', () => {
  assert.equal(
    extractResponseSummary({
      id: 'resp_123',
      status: 'completed',
    }),
    '',
  );
});

test('buildJsonRequestOptions preserves application/json when authorization header is added', () => {
  assert.deepEqual(
    buildJsonRequestOptions({
      method: 'POST',
      headers: {
        Authorization: 'Bearer router-key',
      },
      body: '{"hello":"world"}',
    }),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer router-key',
      },
      body: '{"hello":"world"}',
    },
  );
});

test('parseResponsesApiResponse returns the completed response from event-stream payloads', () => {
  const eventStreamText = [
    'event: response.created',
    'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-5.4"}}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"hel"}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"lo"}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.4","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hello"}]}]}}',
    '',
  ].join('\n');

  assert.deepEqual(
    parseResponsesApiResponse(eventStreamText, 'text/event-stream; charset=utf-8'),
    {
      id: 'resp_1',
      model: 'gpt-5.4',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'hello',
            },
          ],
        },
      ],
    },
  );
});

test('parseResponsesApiResponse keeps accumulated output_text when response.completed has an empty output array', () => {
  const eventStreamText = [
    'event: response.created',
    'data: {"type":"response.created","response":{"id":"resp_real","model":"gpt-5.4","output":[]}}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"Hello","item_id":"msg_1","content_index":0}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"! How can I help?","item_id":"msg_1","content_index":0}',
    '',
    'event: response.output_text.done',
    'data: {"type":"response.output_text.done","text":"Hello! How can I help?","item_id":"msg_1","content_index":0}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"id":"resp_real","model":"gpt-5.4","status":"completed","output":[]}}',
    '',
  ].join('\n');

  assert.deepEqual(
    parseResponsesApiResponse(eventStreamText, 'text/event-stream; charset=utf-8'),
    {
      id: 'resp_real',
      model: 'gpt-5.4',
      status: 'completed',
      output: [],
      output_text: 'Hello! How can I help?',
    },
  );
});

test('parseResponsesApiResponse detects event-stream bodies even when the content-type header is missing', () => {
  const eventStreamText = [
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"Hello"}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"!"}',
    '',
  ].join('\n');

  assert.deepEqual(
    parseResponsesApiResponse(eventStreamText, ''),
    {
      output_text: 'Hello!',
    },
  );
});

test('extractErrorMessage prefers nested upstream error messages', () => {
  assert.equal(
    extractErrorMessage({
      error: {
        message: '[trace_id: abc] Invalid param: invalid response id',
      },
    }, 'HTTP 400'),
    '[trace_id: abc] Invalid param: invalid response id',
  );
  assert.equal(extractErrorMessage({ error: 'plain error' }, 'HTTP 400'), 'plain error');
  assert.equal(extractErrorMessage({}, 'HTTP 400'), 'HTTP 400');
});
