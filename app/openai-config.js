const CHATGPT_BASE_URL = 'https://chatgpt.com';
const CODEX_API_BASE_PATH = '/backend-api/codex';
const DEFAULT_CLAUDE_CODE_MODEL = 'gpt-5.4';
const DEFAULT_CLAUDE_CODE_REASONING_EFFORT = 'high';
const DEFAULT_CLAUDE_API_KEY_PROBE_MODEL = 'claude-opus-4-7';
const DEFAULT_GPT_API_KEY_PROBE_MODEL = 'gpt-5.5';
const DEFAULT_GPT_API_KEY_FALLBACK_PROBE_MODEL = 'gpt-5.4';
const DEFAULT_ROUTING_PREFERENCE = 'token_first';
const DEFAULT_CODEX_SPEED_MODE = 'standard';
const SUPPORTED_REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);
const SUPPORTED_APIKEY_CAPABILITIES = new Set(['gpt', 'claude']);
const SUPPORTED_ROUTING_PREFERENCES = new Set(['token_first', 'apikey_first', 'token_only', 'apikey_only']);
const SUPPORTED_CODEX_SPEED_MODES = new Set(['standard', 'fast']);

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createDefaultTokenRuntime(isEnabled) {
    return {
        enabled: isEnabled,
        available: isEnabled,
        lastCheckedAt: null,
        remainingPercent: null,
        primaryRemainingPercent: null,
        primaryResetAt: null,
        primaryResetAfterSeconds: null,
        secondaryRemainingPercent: null,
        secondaryResetAt: null,
        secondaryResetAfterSeconds: null,
        reason: isEnabled ? 'unchecked' : 'missing_credentials',
        lastError: null,
        lastSelectionReason: null,
        lastSelectedAt: null,
        quotaHistory: [],
        weeklyQuotaHistory: []
    };
}

function createDefaultApiKeyRuntime() {
    return {
        enabled: true,
        available: true,
        lastCheckedAt: null,
        remainingPercent: null,
        primaryRemainingPercent: null,
        primaryResetAt: null,
        primaryResetAfterSeconds: null,
        secondaryRemainingPercent: null,
        secondaryResetAt: null,
        secondaryResetAfterSeconds: null,
        reason: 'apikey',
        lastError: null,
        lastSelectionReason: null,
        lastSelectedAt: null,
        quotaHistory: [],
        weeklyQuotaHistory: []
    };
}

function normalizeString(value) {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (value === null || typeof value === 'undefined') {
        return '';
    }

    return String(value).trim();
}

function getConfigItemType(config) {
    const type = normalizeString(config && config.type);
    return type || 'token';
}

function normalizeApiKeySupport(value) {
    if (typeof value === 'undefined' || value === null) {
        return ['gpt'];
    }

    if (!Array.isArray(value)) {
        throw new Error('apikey support 必须是字符串数组');
    }

    const support = [];
    for (const item of value) {
        const capability = normalizeString(item).toLowerCase();
        if (!SUPPORTED_APIKEY_CAPABILITIES.has(capability)) {
            throw new Error('apikey support 仅支持 gpt 或 claude');
        }

        if (!support.includes(capability)) {
            support.push(capability);
        }
    }

    if (support.length === 0) {
        throw new Error('apikey support 至少需要包含 gpt 或 claude');
    }

    return support;
}

function configSupportsCapability(config, capability) {
    if (!config || config.type !== 'apikey') {
        return false;
    }

    return normalizeApiKeySupport(config.support).includes(capability);
}

function normalizeRoutingPreference(value) {
    if (value === undefined || value === null || normalizeString(value) === '') {
        return DEFAULT_ROUTING_PREFERENCE;
    }

    const preference = normalizeString(value);
    if (!SUPPORTED_ROUTING_PREFERENCES.has(preference)) {
        throw new Error('配置文件 routing_preference 仅支持 token_first、apikey_first、token_only、apikey_only');
    }

    return preference;
}

function normalizeCodexSpeedMode(value) {
    if (value === undefined || value === null || normalizeString(value) === '') {
        return DEFAULT_CODEX_SPEED_MODE;
    }

    const mode = normalizeString(value);
    if (!SUPPORTED_CODEX_SPEED_MODES.has(mode)) {
        throw new Error('配置文件 responses.codex_speed_mode 仅支持 standard 或 fast');
    }

    return mode;
}

function isValidStartedAt(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const normalized = value.trim().replace(' ', 'T');
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) {
        return false;
    }

    const [, yearText, monthText, dayText, hourText = '00', minuteText = '00', secondText = '00'] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    return hour <= 23 &&
        minute <= 59 &&
        second <= 59 &&
        !Number.isNaN(date.getTime()) &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day &&
        date.getUTCHours() === hour &&
        date.getUTCMinutes() === minute &&
        date.getUTCSeconds() === second;
}

function parseOpenAiConfigFile(raw) {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('配置文件必须是包含 configs 的对象');
    }

    if (!Array.isArray(parsed.configs)) {
        throw new Error('配置文件 configs 必须是数组');
    }

    for (const [index, config] of parsed.configs.entries()) {
        if (!isPlainObject(config)) {
            throw new Error(`配置文件 configs[${index}] 必须是对象`);
        }

        const configType = getConfigItemType(config);
        if (configType !== 'token' && configType !== 'apikey') {
            throw new Error('配置项 type 仅支持 token 或 apikey');
        }

        if (configType === 'apikey') {
            normalizeApiKeySupport(config.support);
            if (
                config.probe_model !== undefined &&
                (typeof config.probe_model !== 'string' || config.probe_model.trim().length === 0)
            ) {
                throw new Error('配置项 probe_model 必须是非空字符串');
            }
        }

        if (
            config.auto_switch_disabled !== undefined &&
            typeof config.auto_switch_disabled !== 'boolean'
        ) {
            throw new Error('配置项 auto_switch_disabled 必须是布尔值');
        }

        if (config.sort_order !== undefined) {
            const rawSortOrder = typeof config.sort_order === 'number' ? String(config.sort_order) : config.sort_order;
            if (
                typeof rawSortOrder !== 'string' ||
                !/^\d+$/.test(rawSortOrder.trim()) ||
                !Number.isSafeInteger(Number.parseInt(rawSortOrder.trim(), 10))
            ) {
                throw new Error('配置项 sort_order 必须是非负整数');
            }
        }

        if (config.price_yuan !== undefined) {
            const rawPriceYuan = typeof config.price_yuan === 'number' ? String(config.price_yuan) : config.price_yuan;
            if (
                typeof rawPriceYuan !== 'string' ||
                !/^\d+(\.\d{1,2})?$/.test(rawPriceYuan.trim()) ||
                !Number.isFinite(Number.parseFloat(rawPriceYuan.trim()))
            ) {
                throw new Error('配置项 price_yuan 必须是非负金额，最多保留 2 位小数');
            }
        }

        if (config.started_at !== undefined && !isValidStartedAt(config.started_at)) {
            throw new Error('配置项 started_at 必须是 YYYY-MM-DD、YYYY-MM-DDTHH:mm 或 YYYY-MM-DDTHH:mm:ss 有效日期时间');
        }

        if (config.stopped_at !== undefined && !isValidStartedAt(config.stopped_at)) {
            throw new Error('配置项 stopped_at 必须是 YYYY-MM-DD、YYYY-MM-DDTHH:mm 或 YYYY-MM-DDTHH:mm:ss 有效日期时间');
        }
    }

    if (parsed.apikeys !== undefined) {
        if (!Array.isArray(parsed.apikeys)) {
            throw new Error('配置文件 apikeys 必须是字符串数组');
        }

        if (parsed.apikeys.some(item => typeof item !== 'string')) {
            throw new Error('配置文件 apikeys 必须是字符串数组');
        }
    }

    if (parsed.auth_token !== undefined && typeof parsed.auth_token !== 'string') {
        throw new Error('配置文件 auth_token 必须是字符串');
    }

    if (parsed.routing_preference !== undefined) {
        normalizeRoutingPreference(parsed.routing_preference);
    }

    for (const fieldName of ['port', 'proxy_port']) {
        if (parsed[fieldName] === undefined) {
            continue;
        }

        const rawPort = parsed[fieldName];
        const normalizedPort = typeof rawPort === 'number' ? String(rawPort) : rawPort;
        if (typeof normalizedPort !== 'string' || !/^\d+$/.test(normalizedPort.trim())) {
            throw new Error(`配置文件 ${fieldName} 必须是 1-65535 之间的端口号`);
        }

        const port = Number.parseInt(normalizedPort.trim(), 10);
        if (port < 1 || port > 65535) {
            throw new Error(`配置文件 ${fieldName} 必须是 1-65535 之间的端口号`);
        }
    }

    if (parsed.claude_code !== undefined) {
        if (!isPlainObject(parsed.claude_code)) {
            throw new Error('配置文件 claude_code 必须是对象');
        }

        if (
            parsed.claude_code.model !== undefined &&
            (typeof parsed.claude_code.model !== 'string' || parsed.claude_code.model.trim().length === 0)
        ) {
            throw new Error('配置文件 claude_code.model 必须是非空字符串');
        }

        if (parsed.claude_code.reasoning_effort !== undefined) {
            if (
                typeof parsed.claude_code.reasoning_effort !== 'string' ||
                !SUPPORTED_REASONING_EFFORTS.has(parsed.claude_code.reasoning_effort)
            ) {
                throw new Error('配置文件 claude_code.reasoning_effort 仅支持 none、minimal、low、medium、high、xhigh');
            }
        }
    }

    if (parsed.responses !== undefined) {
        if (!isPlainObject(parsed.responses)) {
            throw new Error('配置文件 responses 必须是对象');
        }

        if (parsed.responses.model_aliases !== undefined) {
            if (!isPlainObject(parsed.responses.model_aliases)) {
                throw new Error('配置文件 responses.model_aliases 必须是对象');
            }

            for (const [sourceModel, targetModel] of Object.entries(parsed.responses.model_aliases)) {
                if (typeof sourceModel !== 'string' || sourceModel.trim().length === 0) {
                    throw new Error('配置文件 responses.model_aliases 的键必须是非空字符串');
                }

                if (typeof targetModel !== 'string' || targetModel.trim().length === 0) {
                    throw new Error('配置文件 responses.model_aliases 的值必须是非空字符串');
                }
            }
        }

        if (parsed.responses.codex_speed_mode !== undefined) {
            normalizeCodexSpeedMode(parsed.responses.codex_speed_mode);
        }
    }

    return parsed;
}

function resolveClaudeCodeOptions(parsed) {
    const claudeCode = parsed && isPlainObject(parsed.claude_code)
        ? parsed.claude_code
        : {};

    return {
        model: typeof claudeCode.model === 'string' && claudeCode.model.trim().length > 0
            ? claudeCode.model.trim()
            : DEFAULT_CLAUDE_CODE_MODEL,
        reasoningEffort: typeof claudeCode.reasoning_effort === 'string' && claudeCode.reasoning_effort.length > 0
            ? claudeCode.reasoning_effort
            : DEFAULT_CLAUDE_CODE_REASONING_EFFORT
    };
}

function resolveResponsesOptions(parsed) {
    const responses = parsed && isPlainObject(parsed.responses)
        ? parsed.responses
        : {};
    const modelAliases = {};

    if (isPlainObject(responses.model_aliases)) {
        for (const [sourceModel, targetModel] of Object.entries(responses.model_aliases)) {
            modelAliases[sourceModel.trim().toLowerCase()] = targetModel.trim();
        }
    }

    return {
        modelAliases,
        codexSpeedMode: normalizeCodexSpeedMode(responses.codex_speed_mode)
    };
}

function resolveRoutingPreference(parsed) {
    return normalizeRoutingPreference(parsed && parsed.routing_preference);
}

function createTokenRuntimeConfig(config, index) {
    const enabled = Boolean(config.access_token && config.account_id);

    return {
        type: 'token',
        index,
        autoSwitchDisabled: config.auto_switch_disabled === true,
        baseUrl: CHATGPT_BASE_URL,
        apiBasePath: CODEX_API_BASE_PATH,
        access_token: config.access_token || '',
        refresh_token: config.refresh_token || '',
        client_id: config.client_id || '',
        account_id: config.account_id || '',
        alias: config.alias || '',
        description: config.description || `OpenAI 配置 #${index + 1}`,
        runtime: createDefaultTokenRuntime(enabled)
    };
}

function createApiKeyRuntimeConfig(config, index) {
    const apikey = normalizeString(config && config.apikey);
    const baseUrl = normalizeString(config && config.base_url).replace(/\/+$/, '');
    const support = normalizeApiKeySupport(config.support);
    const explicitProbeModel = normalizeString(config.probe_model);
    const defaultProbeModels = support.includes('claude')
        ? [DEFAULT_CLAUDE_API_KEY_PROBE_MODEL]
        : [DEFAULT_GPT_API_KEY_PROBE_MODEL, DEFAULT_GPT_API_KEY_FALLBACK_PROBE_MODEL];
    const probeModels = explicitProbeModel ? [explicitProbeModel] : defaultProbeModels;

    if (!apikey || !baseUrl) {
        throw new Error('apikey 配置至少需要 apikey 和 base_url');
    }

    return {
        type: 'apikey',
        index,
        autoSwitchDisabled: config.auto_switch_disabled === true,
        baseUrl,
        apiBasePath: '',
        apiKey: apikey,
        support,
        probeModel: probeModels[0],
        probeModels,
        alias: config.alias || '',
        description: config.description || `APIKey 配置 #${index + 1}`,
        runtime: createDefaultApiKeyRuntime()
    };
}

function createRuntimeConfigs(parsed) {
    return parsed.configs.map((config, index) => {
        const configType = getConfigItemType(config);

        if (configType === 'apikey') {
            return createApiKeyRuntimeConfig(config, index);
        }

        return createTokenRuntimeConfig(config, index);
    });
}

function buildAuthHeadersForConfig(config) {
    if (config.type === 'apikey') {
        return {
            authorization: `Bearer ${config.apiKey}`
        };
    }

    return {
        authorization: `Bearer ${config.access_token}`,
        'chatgpt-account-id': config.account_id
    };
}

function shouldUseQuotaMonitoring(type) {
    return type === 'token';
}

module.exports = {
    CHATGPT_BASE_URL,
    CODEX_API_BASE_PATH,
    DEFAULT_CLAUDE_CODE_MODEL,
    DEFAULT_CLAUDE_CODE_REASONING_EFFORT,
    DEFAULT_CLAUDE_API_KEY_PROBE_MODEL,
    DEFAULT_GPT_API_KEY_PROBE_MODEL,
    DEFAULT_GPT_API_KEY_FALLBACK_PROBE_MODEL,
    DEFAULT_ROUTING_PREFERENCE,
    parseOpenAiConfigFile,
    resolveClaudeCodeOptions,
    resolveResponsesOptions,
    resolveRoutingPreference,
    createRuntimeConfigs,
    createTokenRuntimeConfig,
    createApiKeyRuntimeConfig,
    getConfigItemType,
    normalizeApiKeySupport,
    normalizeRoutingPreference,
    normalizeCodexSpeedMode,
    configSupportsCapability,
    buildAuthHeadersForConfig,
    shouldUseQuotaMonitoring
};
