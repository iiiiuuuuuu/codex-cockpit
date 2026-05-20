const RESPONSES_DEFAULTS = {
    instructions: '',
    tools: [],
    tool_choice: 'auto',
    parallel_tool_calls: false,
    store: false,
    stream: true,
    include: []
};
const CODEX_SPEED_MODE_SERVICE_TIER = {
    fast: 'priority'
};

function isResponsesPath(requestPath) {
    if (typeof requestPath !== 'string' || requestPath.length === 0) {
        return false;
    }

    const pathname = new URL(requestPath, 'http://localhost').pathname;
    return pathname === '/responses' || pathname.endsWith('/responses');
}

function normalizeModelAlias(model, options = {}) {
    if (typeof model !== 'string') {
        return model;
    }

    const normalizedModel = model.trim();
    if (!normalizedModel) {
        return model;
    }

    const aliasKey = normalizedModel.toLowerCase();
    return options.modelAliases && options.modelAliases[aliasKey]
        ? options.modelAliases[aliasKey]
        : model;
}

function normalizeResponsesRequestBody(requestPath, body, options = {}) {
    if (!isResponsesPath(requestPath) || !body || Array.isArray(body) || typeof body !== 'object') {
        return body;
    }

    const normalizedBody = {
        ...RESPONSES_DEFAULTS,
        ...body
    };
    normalizedBody.model = normalizeModelAlias(body.model, options);
    if (options.codexSpeedMode === 'standard') {
        delete normalizedBody.service_tier;
    } else if (options.codexSpeedMode && CODEX_SPEED_MODE_SERVICE_TIER[options.codexSpeedMode]) {
        normalizedBody.service_tier = CODEX_SPEED_MODE_SERVICE_TIER[options.codexSpeedMode];
    }
    if (options.forceStoreFalse) {
        normalizedBody.store = false;
    }

    return normalizedBody;
}

module.exports = {
    RESPONSES_DEFAULTS,
    CODEX_SPEED_MODE_SERVICE_TIER,
    normalizeModelAlias,
    isResponsesPath,
    normalizeResponsesRequestBody
};
