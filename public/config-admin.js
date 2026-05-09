(function attachConfigAdmin(globalScope) {
  function parseSseChunk(rawEvent) {
    const lines = String(rawEvent || '').split('\n');
    let eventName = '';
    const dataLines = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    return {
      eventName,
      dataText: dataLines.join('\n'),
    };
  }

  function parseResponsesEventStream(text) {
    const rawEvents = String(text || '')
      .replace(/\r\n/g, '\n')
      .split('\n\n');

    let completedResponse = null;
    let outputText = '';

    for (const rawEvent of rawEvents) {
      if (!rawEvent.trim()) {
        continue;
      }

      const parsed = parseSseChunk(rawEvent);
      if (!parsed.dataText || parsed.dataText === '[DONE]') {
        continue;
      }

      const payload = JSON.parse(parsed.dataText);
      const eventName = payload.type || parsed.eventName;

      if (eventName === 'response.output_text.delta' && typeof payload.delta === 'string') {
        outputText = `${outputText}${payload.delta}`;
      }

      if (!outputText && eventName === 'response.output_text.done' && typeof payload.text === 'string') {
        outputText = payload.text;
      }

      if (eventName === 'response.completed' && payload.response && typeof payload.response === 'object') {
        completedResponse = payload.response;
      }
    }

    if (completedResponse) {
      const hasStructuredOutput = Array.isArray(completedResponse.output) && completedResponse.output.length > 0;

      if (outputText && !hasStructuredOutput) {
        return {
          ...completedResponse,
          output_text: outputText,
        };
      }

      return completedResponse;
    }

    if (outputText) {
      return {
        output_text: outputText,
      };
    }

    return {};
  }

  function parseResponsesApiResponse(text, contentType) {
    const normalizedContentType = String(contentType || '').toLowerCase();
    const responseText = String(text || '');
    const looksLikeEventStream = responseText.startsWith('event: ') || responseText.includes('\nevent: ');

    if (!responseText) {
      return null;
    }

    if (normalizedContentType.includes('text/event-stream') || looksLikeEventStream) {
      return parseResponsesEventStream(responseText);
    }

    if (normalizedContentType.includes('application/json')) {
      return JSON.parse(responseText);
    }

    try {
      return JSON.parse(responseText);
    } catch (error) {
      return {
        message: responseText,
      };
    }
  }

  function extractErrorMessage(payload, fallbackMessage) {
    if (payload && typeof payload === 'object') {
      if (typeof payload.details === 'string' && payload.details) {
        return payload.details;
      }

      if (typeof payload.message === 'string' && payload.message) {
        return payload.message;
      }

      if (payload.error && typeof payload.error === 'object' && typeof payload.error.message === 'string' && payload.error.message) {
        return payload.error.message;
      }

      if (typeof payload.error === 'string' && payload.error) {
        return payload.error;
      }
    }

    return fallbackMessage;
  }

  function buildJsonRequestOptions(options) {
    const normalizedOptions = options && typeof options === 'object' ? options : {};

    return {
      ...normalizedOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(normalizedOptions.headers || {}),
      },
    };
  }

  function buildConfigSnapshotRequest(forceRefresh = false) {
    if (forceRefresh) {
      return {
        url: '/admin/api/configs/refresh',
        options: {
          method: 'POST',
        },
      };
    }

    return {
      url: '/admin/api/configs',
      options: {},
    };
  }

  function buildRequestUrl(url, options = {}) {
    const origin = options.origin || 'http://localhost';
    const adminAuthToken = typeof options.adminAuthToken === 'string' ? options.adminAuthToken : '';
    const resolved = new URL(url, origin);

    if (adminAuthToken && resolved.pathname.startsWith('/admin/')) {
      resolved.searchParams.set('auth_token', adminAuthToken);
    }

    return `${resolved.pathname}${resolved.search}`;
  }

  function getPreferredApiKey(snapshot) {
    const apikeys = Array.isArray(snapshot && snapshot.apikeys) ? snapshot.apikeys : [];
    return typeof apikeys[0] === 'string' ? apikeys[0] : '';
  }

  function maskSecret(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '-';
    }

    if (text.length <= 8) {
      return '***';
    }

    return `${text.slice(0, 3)}-...${text.slice(-4)}`;
  }

  function getConfigGuideContent(snapshot) {
    return {
      steps: [
        {
          title: '登录 ChatGPT',
          description: '先登录 ChatGPT，确保账号已经在线。',
          actionText: '打开 ChatGPT',
          actionHref: 'https://chatgpt.com/',
        },
        {
          title: '获取 AuthSession 或 API Key',
          description: 'Codex token 可粘贴 AuthSession JSON；第三方 API 可粘贴 apikey 配置项 JSON。apikey 默认支持 gpt；需要 Claude Messages 时加 support:["claude"]。',
          example: [
            JSON.stringify({
              type: 'apikey',
              base_url: 'https://api.example.com/v1',
              apikey: 'sk-xxx',
              description: 'third-party provider',
            }, null, 2),
            JSON.stringify({
              type: 'apikey',
              base_url: 'https://claude.example.com/v1',
              apikey: 'sk-xxx',
              support: ['claude'],
              description: 'claude messages provider',
            }, null, 2),
          ].join('\n\n// 或\n\n'),
          actionText: '打开 AuthSession 页面',
          actionHref: 'https://chatgpt.com/api/auth/session',
        },
      ],
      rawJsonPlaceholder: [
        JSON.stringify({
          user: {
            email: 'user@example.com',
          },
          account: {
            id: 'account-id',
          },
          accessToken: '...',
        }, null, 2),
        JSON.stringify({
          type: 'apikey',
          base_url: 'https://api.example.com/v1',
          apikey: 'sk-xxx',
          description: 'third-party provider',
        }, null, 2),
        JSON.stringify({
          type: 'apikey',
          base_url: 'https://claude.example.com/v1',
          apikey: 'sk-xxx',
          support: ['claude'],
          description: 'claude messages provider',
        }, null, 2),
      ].join('\n\n// 或\n\n'),
    };
  }

  function hasApiKeyConfig(snapshot) {
    const configs = Array.isArray(snapshot && snapshot.configs) ? snapshot.configs : [];
    return configs.some(item => {
      const configItem = item && item.item ? item.item : item;
      return configItem && configItem.type === 'apikey';
    });
  }

  function getConfigIdentityColumnLabel(snapshot) {
    return hasApiKeyConfig(snapshot) ? '上游配置' : 'account_id';
  }

  function getConfigIdentityValue(snapshot, item) {
    const configItem = item && item.item ? item.item : item;

    if (configItem && configItem.type === 'apikey') {
      const baseUrl = typeof configItem.base_url === 'string' && configItem.base_url.trim()
        ? configItem.base_url.trim()
        : '-';
      const apikey = configItem && configItem.apikey;

      return `${baseUrl} (${maskSecret(apikey)})`;
    }

    const value = configItem && configItem.account_id;

    return typeof value === 'string' && value.trim() ? value.trim() : '-';
  }

  function buildHelloTestRequest(snapshot) {
    return {
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
    };
  }

  function buildHelloTestHeaders(sessionId) {
    const normalizedSessionId = typeof sessionId === 'string' && sessionId.trim()
      ? sessionId.trim()
      : 'airouter-test-request';

    return {
      originator: 'codex_cli_rs',
      version: '1.0.1',
      session_id: normalizedSessionId,
      'x-client-request-id': normalizedSessionId,
    };
  }

  function getResponsesModelAliases(snapshot) {
    const aliases = snapshot && snapshot.responses && snapshot.responses.model_aliases;
    return aliases && typeof aliases === 'object' && !Array.isArray(aliases) ? aliases : {};
  }

  function formatResponsesModelAliasesInput(snapshot) {
    return JSON.stringify(getResponsesModelAliases(snapshot), null, 2);
  }

  function parseResponsesModelAliasesInput(rawText) {
    const normalizedText = String(rawText || '').trim();

    if (!normalizedText) {
      return {};
    }

    let parsed;
    try {
      parsed = JSON.parse(normalizedText);
    } catch (error) {
      throw new Error(`模型映射配置解析失败: ${error.message}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('模型映射配置必须是 JSON 对象');
    }

    const normalized = {};
    for (const [sourceModel, targetModel] of Object.entries(parsed)) {
      const normalizedSource = String(sourceModel || '').trim();
      const normalizedTarget = typeof targetModel === 'string'
        ? targetModel.trim()
        : String(targetModel ?? '').trim();

      if (!normalizedSource) {
        throw new Error('模型映射配置的键必须是非空字符串');
      }

      if (!normalizedTarget) {
        throw new Error('模型映射配置的值必须是非空字符串');
      }

      normalized[normalizedSource] = normalizedTarget;
    }

    return normalized;
  }

  function extractResponseSummary(payload) {
    if (payload && typeof payload.output_text === 'string' && payload.output_text.trim()) {
      return payload.output_text.trim();
    }

    const output = Array.isArray(payload && payload.output) ? payload.output : [];
    const textParts = [];

    for (const item of output) {
      const content = Array.isArray(item && item.content) ? item.content : [];
      for (const entry of content) {
        if (entry && typeof entry.text === 'string' && entry.text.trim()) {
          textParts.push(entry.text);
        }
      }
    }

    return textParts.join('').trim();
  }

  const exported = {
    buildConfigSnapshotRequest,
    buildRequestUrl,
    buildJsonRequestOptions,
    parseResponsesApiResponse,
    extractErrorMessage,
    getPreferredApiKey,
    buildHelloTestHeaders,
    getConfigGuideContent,
    getConfigIdentityColumnLabel,
    getConfigIdentityValue,
    buildHelloTestRequest,
    formatResponsesModelAliasesInput,
    parseResponsesModelAliasesInput,
    extractResponseSummary,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  globalScope.AirouterConfigAdmin = exported;
}(typeof globalThis !== 'undefined' ? globalThis : this));
