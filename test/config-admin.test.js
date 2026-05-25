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

function readPublicFile(filename) {
  return fs.readFileSync(path.join(__dirname, '..', 'public', filename), 'utf8');
}

const adminConsoleScriptFiles = [
  'bootstrap.js',
  'account-format.js',
  'quota-charts.js',
  'account-cards.js',
  'settings-logs.js',
  'account-actions.js',
  'events.js',
];

function readAdminConsoleAssets() {
  return [
    readPublicFile(path.join('admin-console', 'index.html')),
    readPublicFile(path.join('admin-console', 'styles.css')),
    ...adminConsoleScriptFiles.map(fileName => readPublicFile(path.join('admin-console', 'js', fileName))),
  ].join('\n');
}

test('config admin console uses a stable admin configs entry while preserving the old v2 link', () => {
  const html = readAdminConsoleAssets();
  const server = fs.readFileSync(path.join(__dirname, '..', 'openai.js'), 'utf8');

  assert.match(server, /app\.get\('\/admin'/);
  assert.match(server, /app\.get\('\/admin\/configs'/);
  assert.match(server, /app\.get\('\/admin\/configs\/v2'/);
  assert.match(server, /res\.redirect\(308, `\/admin\/configs\$\{getOriginalQueryString\(req\)\}`\)/);
  assert.match(server, /return `\/admin\/configs\?auth_token=/);
  assert.match(server, /'admin-console', 'index\.html'/);
  assert.match(server, /'admin-console', 'styles\.css'/);
  assert.match(server, /ADMIN_CONSOLE_SCRIPT_FILES/);
  assert.match(server, /'admin-console', 'js', scriptFile/);
  assert.match(server, /app\.patch\('\/admin\/api\/configs\/:index'/);
  assert.match(html, /<title>AI Cockpit<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="\/admin-console\/styles\.css">/);
  assert.match(html, /<h1 class="brand-title">AI Cockpit<\/h1>/);
  assert.match(html, /账号与入口管理/);
  assert.match(html, /统一管理 Token 账号、API Key 上游、访问密钥和本地代理入口。/);
  assert.match(html, />账号与密钥<\/span>/);
  assert.match(html, />新增接入<\/span>/);
  assert.match(html, /<script src="\/config-admin\.js"><\/script>/);
  assert.match(html, /<script src="\/admin-console\/js\/bootstrap\.js"><\/script>/);
  assert.match(html, /<script src="\/admin-console\/js\/events\.js"><\/script>/);
  assert.match(html, /buildConfigSnapshotRequest/);
  assert.match(html, /data-section-target="accountsSection"/);
  assert.match(html, /data-section-target="addAccountSection"/);
  assert.match(html, /data-section-target="accessSection"/);
  assert.match(html, /data-section-target="proxySection"/);
  assert.doesNotMatch(html, /id="searchInput"/);
  assert.doesNotMatch(html, /id="filterSelect"/);
  assert.doesNotMatch(html, /id="sortSelect"/);
  assert.doesNotMatch(html, /id="refreshButton"/);
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
  assert.match(html, /入口 apikey 保护 ai-cockpit 本地代理入口/);
  assert.match(html, /Authorization: Bearer &lt;apikey&gt;/);
  assert.match(html, /x-api-key: &lt;apikey&gt;/);
  assert.match(html, /任意一个匹配都能访问/);
  assert.match(html, /列表为空则不校验/);
  assert.match(html, /id="saveProxySettingsButton"/);
  assert.match(html, /id="routingPreferenceCurrent"/);
  assert.match(html, /id="editRoutingPreferenceButton"/);
  assert.match(html, /Codex 速度模式/);
  assert.match(html, /id="codexSpeedModeCurrent"/);
  assert.match(html, /id="editCodexSpeedModeButton"/);
  assert.match(html, /data-codex-speed-mode="standard"/);
  assert.match(html, /data-codex-speed-mode="fast"/);
  assert.match(html, /默认速度/);
  assert.match(html, /1\.5x speed, increased usage/);
  assert.match(html, /saveCodexSpeedMode/);
  assert.match(html, /codex_speed_mode: nextMode/);
  assert.match(html, /id="routingPreferenceModalBackdrop"/);
  assert.match(html, /id="routingPreferenceModalSaveButton"/);
  assert.match(html, /id="codexSpeedModeModalBackdrop"/);
  assert.match(html, /id="codexSpeedModeModalSaveButton"/);
  assert.match(html, /id="logsSection"/);
  assert.match(html, /id="refreshLogsButton"/);
  assert.match(html, /id="logsOutput"/);
  assert.match(html, /\/admin\/api\/settings/);
  assert.match(html, /\/admin\/api\/logs/);
  assert.match(html, /ai-cockpit 在你本机监听的对外服务端口/);
  assert.match(html, /Codex、OpenAI SDK 或其他客户端/);
  assert.match(html, /本地 VPN\/代理软件正在监听的端口/);
  assert.match(html, /留空则直连/);
  assert.match(html, /填到 Codex\/OpenAI 客户端的 Base URL/);
  assert.match(html, /Responses 接口为/);
  assert.match(html, /\/admin\/api\/configs\/\$\{index\}\/activate/);
  assert.match(html, /\/admin\/api\/configs\/\$\{index\}/);
  assert.match(html, /data-action="edit"/);
  assert.match(html, /data-action="activate"/);
  assert.match(html, /data-action="delete"/);
  assert.match(html, /data-action="refresh"/);
  assert.match(html, /data-action="toggle-auto-switch"/);
  assert.match(html, /sort_order/);
  assert.match(html, /data-draggable-account/);
  assert.match(html, /\/admin\/api\/configs\/order/);
  assert.match(html, /auto_switch_disabled/);
  assert.match(html, /不自动切入/);
  assert.match(html, /\/admin\/api\/configs\/\$\{index\}\/refresh/);
  assert.match(html, /window\.confirm/);
  assert.match(html, /aliasModalBackdrop/);
  assert.match(html, /编辑账号信息/);
  assert.match(html, /id="accountPriceInput"/);
  assert.match(html, /price_yuan/);
  assert.match(html, /id="usageStartInput"/);
  assert.match(html, /id="accountStartedAtInput"/);
  assert.match(html, /id="accountStoppedAtInput"/);
  assert.match(html, /type="datetime-local"/);
  assert.match(html, /started_at/);
  assert.match(html, /stopped_at/);
  assert.match(html, /停止使用时间/);
  assert.match(html, /已使用/);
  assert.match(html, /已使用 <1 小时/);
  assert.match(html, /已使用 \$\{displayHours\} 小时/);
  assert.match(html, /已使用 \$\{Math\.floor\(days\)\} 天/);
  assert.doesNotMatch(html, /已使用 <1 天/);
  assert.doesNotMatch(html, /Math\.floor\(days \* 10\) \/ 10/);
  assert.match(html, /status-chip current/);
  assert.match(html, /pill price/);
  assert.match(html, /data-account-grid-columns="auto"/);
  assert.match(html, /data-account-grid-columns="5"/);
  assert.match(html, /id="accountLayoutMenuButton"/);
  assert.match(html, /id="accountLayoutMenu"/);
  assert.match(html, /id="accountLayoutCurrentLabel">每行 自动<\/span>/);
  assert.match(html, /role="menuitemradio"/);
  assert.match(html, /getAccountGridColumnsLabel/);
  assert.match(html, /setAccountLayoutMenuOpen/);
  assert.match(html, /routing-rules \{\s+display: flex;[\s\S]*?width: 100%;/);
  assert.ok(
    html.indexOf('class="account-layout-bar"') < html.indexOf('id="quotaOverviewButton"'),
    'account layout controls should appear with the page actions before quota overview',
  );
  assert.ok(
    html.indexOf('id="quotaOverviewButton"') < html.indexOf('class="routing-rules"'),
    'account layout controls should stay in the section header instead of the account grid area',
  );
  assert.match(html, /ai-cockpit\.accountGridColumns/);
  assert.match(html, /accounts-grid\[data-columns="2"\] \.account-card/);
  assert.match(html, /min-height: 304px/);
  assert.match(html, /accounts-grid\[data-columns="2"\] \.card-action/);
  assert.match(html, /width: 30px/);
  assert.match(html, /accounts-grid\[data-columns="2"\] \.quota-block/);
  assert.match(html, /gap: 16px/);
  assert.doesNotMatch(html, /align-content: space-between/);
  assert.match(html, /accounts-grid\[data-columns="2"\] \.account-name/);
  assert.match(html, /font-size: 15px/);
  assert.match(html, /accounts-grid\[data-columns="3"\] \.card-action/);
  assert.match(html, /width: 28px/);
  assert.match(html, /gap: 14px/);
  assert.match(html, /accounts-grid\[data-columns="3"\] \.account-name/);
  assert.match(html, /font-size: 14px/);
  assert.match(html, /accounts-grid\[data-columns="5"\] \.account-card/);
  assert.match(html, /min-height: 202px/);
  assert.match(html, /accounts-grid\[data-columns="5"\] \.account-name/);
  assert.match(html, /font-size: 11\.5px/);
  assert.match(html, /accounts-grid\[data-columns="5"\] \.card-action/);
  assert.match(html, /width: 22px/);
  assert.match(html, /accounts-grid\[data-columns="5"\] \.api-key-note\.compact/);
  assert.match(html, /font-size: 9\.5px/);
  assert.doesNotMatch(html, /data-action="toggle-card-size"/);
  assert.match(html, /只刷新此账号额度/);
  assert.match(html, /mergeSingleRefreshSnapshot/);
  assert.match(html, /api-key-note compact/);
  assert.match(html, /不做额度检查；点击刷新会检测 API Key 上游是否可用；默认优先用较新的 GPT 模型探测，不支持时自动降级重试。/);
  assert.match(html, /id="quotaOverviewButton"/);
  assert.match(html, /查看 Token 额度总览/);
  assert.match(html, />额度总览<\/span>/);
  assert.match(html, /quota-overview-trigger/);
  assert.match(html, /Token 额度总览/);
  assert.match(html, /对比所有 Token 账号的 5 小时与周额度走势。/);
  assert.match(html, /renderQuotaOverviewChart/);
  assert.match(html, /data-action="quota-overview-mode"/);
  assert.match(html, /data-action="quota-overview-range"/);
  assert.match(html, /SNAPSHOT_POLL_INTERVAL_MS = 60 \* 1000/);
  assert.match(html, /startSnapshotPolling/);
  assert.match(html, /silent: true/);
  assert.match(html, /background: true/);
  assert.match(html, /最后检查/);
  assert.match(html, /不可用原因/);
  assert.match(html, /detail-line error/);
  assert.match(html, /不可用原因：\$\{escapeHtml\(getUnavailableReasonText\(item, healthText, errorText\)\)\}/);
  assert.match(html, /getUnavailableReasonText/);
  assert.match(html, /stripDiagnosticIds/);
  assert.match(html, /鉴权失败 401，请重新登录或更新 Token/);
  assert.match(html, /上游鉴权失败 401，请检查 API Key 或 Base URL/);
  assert.match(html, /额度检查失败，请稍后重试或重新登录该 Token/);
  assert.match(html, /当前使用：/);
  assert.match(html, /formatSelectionReason/);
  assert.match(html, /formatRuntimeErrorText/);
  assert.match(html, /上游月度额度已用完/);
  assert.match(html, /title="\$\{escapeHtml\(detailTitle\)\}"/);
  assert.match(html, /账号不可用/);
  assert.match(html, /网络异常，正在第/);
  assert.match(html, /窗口重置：约/);
  assert.match(html, /自动切换/);
  assert.match(html, /使用偏好/);
  assert.match(html, /routing-rules-top/);
  assert.match(html, /routing_preference: routingPreferenceDraft/);
  assert.match(html, /<ul class="rule-list">/);
  assert.doesNotMatch(html, /window-dots/);
  assert.match(html, /<strong>顺序<\/strong>/);
  assert.match(html, /按使用偏好选择/);
  assert.match(html, /当前同模式可用账号保持/);
  assert.match(html, /5 小时配额更高的 Token/);
  assert.match(html, /<strong>兜底<\/strong>/);
  assert.match(html, /优先模式没有可用账号时/);
  assert.match(html, /<strong>触发<\/strong>/);
  assert.match(html, /请求、额度轮询、手动刷新/);
  assert.match(html, /上游额度\/凭证错误后校正/);
  assert.match(html, /<strong>不可用<\/strong>/);
  assert.match(html, /5小时 &lt; 3%/);
  assert.match(html, /周配额 ≤ 1%/);
  assert.doesNotMatch(html, /legacyLink/);
  assert.doesNotMatch(html, /返回旧版配置页/);
});

test('config admin v2 auto-dismisses ordinary messages while keeping auth errors visible', () => {
  const html = [
    readPublicFile(path.join('admin-console', 'js', 'bootstrap.js')),
    readPublicFile(path.join('admin-console', 'js', 'settings-logs.js')),
    readPublicFile(path.join('admin-console', 'js', 'events.js')),
  ].join('\n');

  assert.match(html, /function setMessage\(type, text, options = \{\}\)/);
  assert.match(html, /if \(!options\.persist\)/);
  assert.match(html, /const timeoutMs = type === 'error' \? 3000 : 1000/);
  assert.match(html, /setMessage\('error', '当前管理地址缺少或带错 auth_token，请重新使用正确的管理后台链接访问。', \{ persist: true \}\)/);
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

test('buildConfigItemFromForm adds started_at to token configs when provided', () => {
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
      startedAt: '2026-05-01',
    }),
    {
      user: {
        email: 'user@example.com',
      },
      account: {
        id: 'account-1',
      },
      accessToken: 'token-1',
      started_at: '2026-05-01T00:00:00',
    },
  );
});

test('buildConfigItemFromForm adds started_at with hour and minute to token configs', () => {
  assert.deepEqual(
    buildConfigItemFromForm({
      mode: 'token',
      tokenRawJson: JSON.stringify({
        account: {
          id: 'account-1',
        },
        accessToken: 'token-1',
      }),
      startedAt: '2026-05-01T09:30',
    }),
    {
      account: {
        id: 'account-1',
      },
      accessToken: 'token-1',
      started_at: '2026-05-01T09:30:00',
    },
  );
});

test('buildConfigItemFromForm accepts started_at with seconds and stores second precision', () => {
  assert.deepEqual(
    buildConfigItemFromForm({
      mode: 'token',
      tokenRawJson: JSON.stringify({
        account: {
          id: 'account-1',
        },
        accessToken: 'token-1',
      }),
      startedAt: '2026-05-01T09:30:45',
    }),
    {
      account: {
        id: 'account-1',
      },
      accessToken: 'token-1',
      started_at: '2026-05-01T09:30:45',
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

test('buildConfigItemFromForm adds started_at to apikey configs when provided', () => {
  assert.deepEqual(
    buildConfigItemFromForm({
      mode: 'apikey',
      apiKey: 'sk-third-party',
      baseUrl: 'https://api.example.com/v1',
      support: ['gpt'],
      startedAt: '2026-05-01',
    }),
    {
      type: 'apikey',
      apikey: 'sk-third-party',
      base_url: 'https://api.example.com/v1',
      description: '',
      support: ['gpt'],
      started_at: '2026-05-01T00:00:00',
    },
  );
});

test('buildConfigItemFromForm adds started_at with hour and minute to apikey configs', () => {
  assert.deepEqual(
    buildConfigItemFromForm({
      mode: 'apikey',
      apiKey: 'sk-third-party',
      baseUrl: 'https://api.example.com/v1',
      support: ['gpt'],
      startedAt: '2026-05-01T09:30',
    }),
    {
      type: 'apikey',
      apikey: 'sk-third-party',
      base_url: 'https://api.example.com/v1',
      description: '',
      support: ['gpt'],
      started_at: '2026-05-01T09:30:00',
    },
  );
});

test('buildConfigItemFromForm rejects invalid started_at values', () => {
  assert.throws(() => {
    buildConfigItemFromForm({
      mode: 'apikey',
      apiKey: 'sk-third-party',
      baseUrl: 'https://api.example.com/v1',
      startedAt: '2026-02-31',
    });
  }, /开始使用时间/);
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
      apikeys: ['sk-ai-cockpit-one', 'sk-ai-cockpit-two'],
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
