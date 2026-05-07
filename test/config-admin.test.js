const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildConfigSnapshotRequest,
  buildHelloTestRequest,
  buildJsonRequestOptions,
  formatResponsesModelAliasesInput,
  parseResponsesModelAliasesInput,
  parseResponsesApiResponse,
  getPreferredApiKey,
  getConfigGuideContent,
  getConfigIdentityColumnLabel,
  getConfigIdentityValue,
  extractResponseSummary,
} = require('../public/config-admin.js');

test('config admin hides the responses settings module', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'config-admin.html'), 'utf8');
  const start = html.indexOf('<div id="responsesSettingsSection" hidden>');
  const end = html.indexOf('<div class="composer-title">新增配置项</div>');
  const section = start >= 0 && end > start ? html.slice(start, end) : '';

  assert.ok(section, 'responses settings section should be wrapped in a hidden container');
  assert.match(section, /Responses 设置/);
  assert.match(section, /这里可以配置 `\/v1\/responses` 的模型别名映射/);
  assert.match(section, /saveResponsesSettingsButton/);
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

test('buildHelloTestRequest uses the configured Claude Code model and fixed hello input', () => {
  const requestBody = buildHelloTestRequest({
    claude_code: {
      model: 'gpt-5-mini',
    },
  });

  assert.deepEqual(requestBody, {
    model: 'gpt-5-mini',
    stream: true,
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
  });
});

test('buildHelloTestRequest falls back to gpt-5.4 when no Claude Code model is configured', () => {
  assert.equal(buildHelloTestRequest({}).model, 'gpt-5.4');
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

test('getConfigGuideContent always includes token and apikey examples', () => {
  const guide = getConfigGuideContent({
    mode: 'token',
  });

  assert.match(guide.rawJsonPlaceholder, /"accessToken": "\.\.\."/);
  assert.match(guide.rawJsonPlaceholder, /"type": "apikey"/);
  assert.match(guide.rawJsonPlaceholder, /"apikey": "sk-xxx"/);
  assert.match(guide.rawJsonPlaceholder, /"base_url": "https:\/\/api\.example\.com\/v1"/);
  assert.equal(guide.steps.some(step => /第三方 API/.test(step.description)), true);
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
