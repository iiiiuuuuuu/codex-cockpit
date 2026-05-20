const { requestBuffered } = require('./upstream-request');
const { formatAccountLabel } = require('./account-label');
const {
  PRIMARY_QUOTA_HISTORY_WINDOW_MS,
  WEEKLY_QUOTA_HISTORY_WINDOW_MS,
} = require('./quota-history-store');

const QUOTA_HISTORY_MIN_SAMPLE_INTERVAL_MS = 30 * 1000;

/**
 * 封装账号状态、额度刷新和活动账号切换逻辑。
 */
function createAccountManager(options) {
  const {
    configs,
    initialActiveConfigIndex = 0,
    quotaCheckPath,
    quotaCheckTimeoutMs = 0,
    quotaCheckIntervalMs,
    minRemainingPercent,
    minWeeklyRemainingPercent = 1,
    routingPreference = 'token_first',
    buildAuthHeadersForConfig,
    requestBufferedFn = requestBuffered,
    shouldUseQuotaMonitoring,
    refreshTokenFn = null,
    persistTokenRefreshFn = async () => {},
    persistQuotaHistoryFn = () => {},
    log,
    warn,
    now,
  } = options;

  let activeConfigIndex = Number.isInteger(initialActiveConfigIndex) && initialActiveConfigIndex >= 0
    ? Math.min(initialActiveConfigIndex, Math.max(configs.length - 1, 0))
    : 0;
  let quotaMonitorRunning = false;
  let quotaMonitorTimer = null;

  /**
   * 生成日志里使用的账号标识。
   */
  function getAccountLabel(config) {
    return formatAccountLabel(config);
  }

  /**
   * 将额度百分比格式化为日志文本。
   */
  function formatQuotaPercent(value) {
    return value === null || typeof value === 'undefined' ? 'unknown' : `${value}%`;
  }

  /**
   * 将额度重置时间格式化为上海时区文本。
   */
  function formatQuotaResetTime(epochSeconds) {
    if (epochSeconds === null || typeof epochSeconds === 'undefined') {
      return 'unknown';
    }

    return new Date(epochSeconds * 1000).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    });
  }

  /**
   * 将布尔值转换为中文日志文案。
   */
  function formatBooleanText(value) {
    return value ? '是' : '否';
  }

  /**
   * 将内部原因码转换为日志可读文案。
   */
  function formatReasonText(reason) {
    const reasonMap = {
      ok: '正常',
      unchecked: '未检查',
      apikey: 'API Key 模式',
      missing_credentials: '缺少凭证',
      rate_limit_not_allowed: '额度不可用',
      rate_limit_reached: '额度已用尽',
      membership_expired: '会员已过期',
      responses_insufficient_quota: 'responses 配额不足',
      responses_usage_limit_reached: 'responses 窗口额度已用尽',
      responses_usage_not_included: 'responses 套餐不支持',
      [`remaining_below_${minRemainingPercent}%`]: `剩余额度低于 ${minRemainingPercent}%`,
      [`secondary_remaining_not_above_${minWeeklyRemainingPercent}%`]: `周额度不高于 ${minWeeklyRemainingPercent}%`,
      quota_check_failed: '额度检查失败',
      apikey_check_failed: 'API Key 检查失败',
    };

    return reasonMap[reason] || reason || '未知';
  }

  function getQuotaHistory(config, runtimeKey) {
    if (!config.runtime || !Array.isArray(config.runtime[runtimeKey])) {
      config.runtime[runtimeKey] = [];
    }

    return config.runtime[runtimeKey];
  }

  function pruneQuotaHistory(config, timestamp, runtimeKey, windowMs) {
    const history = getQuotaHistory(config, runtimeKey);
    const cutoff = timestamp - windowMs;

    while (history.length && history[0].at < cutoff) {
      history.shift();
    }

    return history;
  }

  function recordQuotaHistorySeries(config, options) {
    const value = config.runtime[options.valueKey];

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return false;
    }

    const timestamp = config.runtime.lastCheckedAt || now();
    const history = pruneQuotaHistory(config, timestamp, options.runtimeKey, options.windowMs);
    const lastSample = history[history.length - 1];
    const sample = {
      at: timestamp,
      remainingPercent: Math.max(0, Math.min(100, value)),
      resetAt: config.runtime[options.resetKey],
      reason: config.runtime.reason,
      available: config.runtime.available,
    };

    if (
      lastSample &&
      timestamp - lastSample.at < QUOTA_HISTORY_MIN_SAMPLE_INTERVAL_MS
    ) {
      history[history.length - 1] = sample;
      return true;
    }

    history.push(sample);
    return true;
  }

  function recordQuotaHistorySample(config) {
    const changedPrimary = recordQuotaHistorySeries(config, {
      runtimeKey: 'quotaHistory',
      valueKey: 'primaryRemainingPercent',
      resetKey: 'primaryResetAt',
      windowMs: PRIMARY_QUOTA_HISTORY_WINDOW_MS,
    });
    const changedWeekly = recordQuotaHistorySeries(config, {
      runtimeKey: 'weeklyQuotaHistory',
      valueKey: 'secondaryRemainingPercent',
      resetKey: 'secondaryResetAt',
      windowMs: WEEKLY_QUOTA_HISTORY_WINDOW_MS,
    });

    return changedPrimary || changedWeekly;
  }

  function getQuotaHistorySnapshot(config, runtimeKey, windowMs) {
    const timestamp = now();

    return pruneQuotaHistory(config, timestamp, runtimeKey, windowMs).map(sample => ({ ...sample }));
  }

  /**
   * 汇总单个账号当前的运行时状态，供日志打印。
   */
  function getRuntimeSummary(config) {
    const runtime = config.runtime;
    const parts = [
      `可用=${formatBooleanText(runtime.available)}`,
      `额度=${formatQuotaPercent(runtime.primaryRemainingPercent)}`,
      `刷新时间=${formatQuotaResetTime(runtime.primaryResetAt)}`,
      `周额度=${formatQuotaPercent(runtime.secondaryRemainingPercent)}`,
      `刷新时间=${formatQuotaResetTime(runtime.secondaryResetAt)}`,
      `状态=${formatReasonText(runtime.reason)}`,
    ];

    if (runtime.lastError) {
      parts.push(`错误=${runtime.lastError}`);
    }

    return parts.join(' | ');
  }

  /**
   * 返回账号对外展示所需的只读视图数据。
   */
  function getAccountStatus(config) {
    if (!config) {
      return null;
    }

    return {
      index: config.index,
      description: config.description,
      label: getAccountLabel(config),
      available: config.runtime.available,
      remainingPercent: config.runtime.remainingPercent,
      primaryRemainingPercent: config.runtime.primaryRemainingPercent,
      primaryResetAt: config.runtime.primaryResetAt,
      primaryResetAfterSeconds: config.runtime.primaryResetAfterSeconds,
      secondaryRemainingPercent: config.runtime.secondaryRemainingPercent,
      secondaryResetAt: config.runtime.secondaryResetAt,
      secondaryResetAfterSeconds: config.runtime.secondaryResetAfterSeconds,
      lastCheckedAt: config.runtime.lastCheckedAt,
      reason: config.runtime.reason,
      lastError: config.runtime.lastError,
      lastSelectionReason: config.runtime.lastSelectionReason,
      lastSelectedAt: config.runtime.lastSelectedAt,
      quotaHistory: getQuotaHistorySnapshot(config, 'quotaHistory', PRIMARY_QUOTA_HISTORY_WINDOW_MS),
      weeklyQuotaHistory: getQuotaHistorySnapshot(config, 'weeklyQuotaHistory', WEEKLY_QUOTA_HISTORY_WINDOW_MS),
      runtimeSummary: getRuntimeSummary(config),
      summaryLine: `${getAccountLabel(config)} | ${getRuntimeSummary(config)}`,
    };
  }

  /**
   * 从额度窗口结构中计算剩余额度百分比。
   */
  function computeRemainingPercent(windowData) {
    if (!windowData || typeof windowData.used_percent !== 'number') {
      return null;
    }

    return Math.max(0, 100 - windowData.used_percent);
  }

  function normalizePlanText(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function pickFirstPlanText(values) {
    for (const value of values) {
      const normalized = normalizePlanText(value);
      if (normalized) {
        return normalized;
      }
    }

    return '';
  }

  function getSubscriptionActiveSignal(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const subscription = payload.subscription && typeof payload.subscription === 'object'
      ? payload.subscription
      : payload.account?.subscription && typeof payload.account.subscription === 'object'
        ? payload.account.subscription
        : payload.billing?.subscription && typeof payload.billing.subscription === 'object'
          ? payload.billing.subscription
          : null;

    const activeValues = [
      payload.has_active_subscription,
      payload.active_subscription,
      payload.is_subscribed,
      payload.is_plus_user,
      subscription?.active,
      subscription?.is_active,
    ];

    if (activeValues.some(value => value === false)) {
      return false;
    }

    if (activeValues.some(value => value === true)) {
      return true;
    }

    const status = normalizePlanText(subscription?.status ?? payload.subscription_status);
    if (['expired', 'inactive', 'canceled', 'cancelled', 'past_due', 'unpaid', 'not_subscribed'].includes(status)) {
      return false;
    }

    if (['active', 'trialing'].includes(status)) {
      return true;
    }

    return null;
  }

  function getPlanType(payload, rateLimit) {
    return pickFirstPlanText([
      payload?.plan_type,
      payload?.plan?.type,
      payload?.account?.plan_type,
      payload?.account?.plan?.type,
      payload?.subscription?.plan_type,
      payload?.subscription?.plan?.type,
      payload?.billing?.plan_type,
      rateLimit?.plan_type,
    ]);
  }

  function getPaidPlanSignal(planType) {
    if (!planType) {
      return null;
    }

    if (['free', 'none', 'unknown', 'expired', 'not_subscribed', 'no_subscription', 'unsubscribed'].includes(planType)) {
      return false;
    }

    if (['plus', 'pro', 'team', 'business', 'enterprise', 'edu'].includes(planType)) {
      return true;
    }

    return null;
  }

  /**
   * 将额度接口返回转换为统一的运行时状态。
   */
  function evaluateQuotaPayload(payload) {
    const detail = payload && typeof payload.detail === 'string' ? payload.detail.trim().toLowerCase() : '';
    const errorCode = payload && payload.error && typeof payload.error.code === 'string' ? payload.error.code.trim().toLowerCase() : '';
    if (detail === 'unauthorized' || detail.includes('token_revoked') || detail.includes('invalidated oauth token') || errorCode === 'token_revoked') {
      return {
        available: false,
        reason: 'missing_credentials',
        remainingPercent: null,
        primaryRemainingPercent: null,
        primaryResetAt: null,
        primaryResetAfterSeconds: null,
        secondaryRemainingPercent: null,
        secondaryResetAt: null,
        secondaryResetAfterSeconds: null,
      };
    }

    const rateLimit = payload && typeof payload === 'object' ? payload.rate_limit || {} : {};
    const primaryRemainingPercent = computeRemainingPercent(rateLimit.primary_window);
    const secondaryRemainingPercent = computeRemainingPercent(rateLimit.secondary_window);
    const subscriptionActiveSignal = getSubscriptionActiveSignal(payload);
    const paidPlanSignal = getPaidPlanSignal(getPlanType(payload, rateLimit));
    const hasPrimaryWindow = Boolean(rateLimit.primary_window);
    const hasSecondaryWindow = Boolean(rateLimit.secondary_window);
    // 对外汇总口径跟随主额度窗口；周额度单独作为可用性保护条件。
    const remainingPercent = primaryRemainingPercent !== null
      ? primaryRemainingPercent
      : secondaryRemainingPercent;

    let available = true;
    let reason = 'ok';

    if (subscriptionActiveSignal === false || paidPlanSignal === false || (hasPrimaryWindow && !hasSecondaryWindow && paidPlanSignal !== true)) {
      available = false;
      reason = 'membership_expired';
    } else if (rateLimit.allowed === false) {
      available = false;
      reason = 'rate_limit_not_allowed';
    } else if (rateLimit.limit_reached === true) {
      available = false;
      reason = 'rate_limit_reached';
    } else if (primaryRemainingPercent !== null && primaryRemainingPercent < minRemainingPercent) {
      available = false;
      reason = `remaining_below_${minRemainingPercent}%`;
    } else if (secondaryRemainingPercent !== null && secondaryRemainingPercent <= minWeeklyRemainingPercent) {
      available = false;
      reason = `secondary_remaining_not_above_${minWeeklyRemainingPercent}%`;
    }

    return {
      available,
      reason,
      remainingPercent,
      primaryRemainingPercent,
      primaryResetAt: rateLimit.primary_window?.reset_at ?? null,
      primaryResetAfterSeconds: rateLimit.primary_window?.reset_after_seconds ?? null,
      secondaryRemainingPercent,
      secondaryResetAt: rateLimit.secondary_window?.reset_at ?? null,
      secondaryResetAfterSeconds: rateLimit.secondary_window?.reset_after_seconds ?? null,
    };
  }

  /**
   * 将统一额度状态写回账号运行时对象。
   */
  function applyQuotaState(config, quotaState) {
    config.runtime.available = quotaState.available;
    config.runtime.reason = quotaState.reason;
    config.runtime.lastCheckedAt = now();
    config.runtime.remainingPercent = quotaState.remainingPercent;
    config.runtime.primaryRemainingPercent = quotaState.primaryRemainingPercent;
    config.runtime.primaryResetAt = quotaState.primaryResetAt;
    config.runtime.primaryResetAfterSeconds = quotaState.primaryResetAfterSeconds;
    config.runtime.secondaryRemainingPercent = quotaState.secondaryRemainingPercent;
    config.runtime.secondaryResetAt = quotaState.secondaryResetAt;
    config.runtime.secondaryResetAfterSeconds = quotaState.secondaryResetAfterSeconds;
    config.runtime.lastError = null;
    if (recordQuotaHistorySample(config)) {
      try {
        persistQuotaHistoryFn(configs);
      } catch (err) {
        warn(`额度历史持久化失败: ${err.message}`);
      }
    }
  }

  /**
   * 应用实时额度信息；默认在当前账号失效时立即校正活动账号。
   */
  function applyQuotaPayload(config, payload, options = {}) {
    const { allowSwitch = config === getActiveConfig() } = options;
    const quotaState = evaluateQuotaPayload(payload);
    applyQuotaState(config, quotaState);

    if (allowSwitch && config === getActiveConfig()) {
      return ensureActiveConfig('quota_update');
    }

    return config;
  }

  /**
   * 在非额度查询场景下，将账号直接标记为不可用，并按需切换活动账号。
   */
  function markConfigUnavailable(config, reason, options = {}) {
    const {
      allowSwitch = config === getActiveConfig(),
      lastError = null,
      switchReason = 'runtime_unavailable',
    } = options;

    if (!config || !config.runtime) {
      return getActiveConfig();
    }

    config.runtime.available = false;
    config.runtime.reason = reason;
    config.runtime.lastCheckedAt = now();
    config.runtime.lastError = lastError;

    if (allowSwitch && config === getActiveConfig()) {
      return ensureActiveConfig(switchReason);
    }

    return config;
  }

  /**
   * 判断账号当前是否可用。
   */
  function isConfigAvailable(config) {
    return Boolean(config && config.runtime && config.runtime.enabled && config.runtime.available);
  }

  function isAutoSwitchTarget(config) {
    return Boolean(config) && config.autoSwitchDisabled !== true;
  }

  function getConfigPriority(config) {
    if (routingPreference === 'apikey_first') {
      if (config && config.type === 'apikey') {
        return 0;
      }

      if (config && config.type === 'token') {
        return 1;
      }

      return 2;
    }

    if (config && config.type === 'token') {
      return 0;
    }

    if (config && config.type === 'apikey') {
      return 1;
    }

    return 2;
  }

  function isAllowedByRoutingPreference(config) {
    if (!config) {
      return false;
    }

    if (routingPreference === 'token_only') {
      return config.type === 'token';
    }

    if (routingPreference === 'apikey_only') {
      return config.type === 'apikey';
    }

    return true;
  }

  function isEligibleConfig(config, predicate) {
    return isAllowedByRoutingPreference(config) && predicate(config);
  }

  function getRemainingValue(config, key) {
    const value = config && config.runtime ? config.runtime[key] : null;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function compareQuotaValue(left, right, key) {
    const leftValue = getRemainingValue(left, key);
    const rightValue = getRemainingValue(right, key);

    if (leftValue === null && rightValue === null) {
      return 0;
    }
    if (leftValue === null) {
      return 1;
    }
    if (rightValue === null) {
      return -1;
    }
    return rightValue - leftValue;
  }

  function compareAvailableConfig(left, right) {
    const priorityDiff = getConfigPriority(left) - getConfigPriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    if (left.index === activeConfigIndex) {
      return -1;
    }
    if (right.index === activeConfigIndex) {
      return 1;
    }

    if (left.type === 'token') {
      const primaryDiff = compareQuotaValue(left, right, 'primaryRemainingPercent');
      if (primaryDiff !== 0) {
        return primaryDiff;
      }

      const weeklyDiff = compareQuotaValue(left, right, 'secondaryRemainingPercent');
      if (weeklyDiff !== 0) {
        return weeklyDiff;
      }
    }

    return left.index - right.index;
  }

  function recordActiveSelection(config, reason) {
    if (!config || !config.runtime) {
      return;
    }

    config.runtime.lastSelectionReason = reason;
    config.runtime.lastSelectedAt = now();
  }

  function findHighestPriorityAvailableConfigIndex(predicate = () => true) {
    let selectedIndex = -1;
    let selectedConfig = null;

    for (let index = 0; index < configs.length; index += 1) {
      const config = configs[index];
      if (!isAutoSwitchTarget(config) || !isEligibleConfig(config, predicate) || !isConfigAvailable(config)) {
        continue;
      }

      if (
        selectedIndex === -1 ||
        compareAvailableConfig(config, selectedConfig) < 0
      ) {
        selectedIndex = index;
        selectedConfig = config;
      }
    }

    return selectedIndex;
  }

  /**
   * 返回当前活动账号，不做切换，也不做任何 I/O。
   */
  function getActiveConfig(predicate = () => true) {
    const currentConfig = configs[activeConfigIndex] || null;
    return currentConfig && isEligibleConfig(currentConfig, predicate) ? currentConfig : null;
  }

  function activateConfig(index, reason = 'manual') {
    if (!Number.isInteger(index) || index < 0 || index >= configs.length) {
      throw new Error('配置项索引不合法');
    }

    const previousConfig = configs[activeConfigIndex] || null;
    const nextConfig = configs[index];
    if (!isAllowedByRoutingPreference(nextConfig)) {
      throw new Error('当前使用偏好不允许切换到该账号模式');
    }

    activeConfigIndex = index;
    recordActiveSelection(nextConfig, reason);

    if (previousConfig !== nextConfig && reason !== 'startup') {
      warn(`账号切换: ${previousConfig ? getAccountLabel(previousConfig) : 'none'} -> ${getAccountLabel(nextConfig)} (${reason})`);
    }

    return nextConfig;
  }

  function withQuotaCheckTimeout(promise) {
    if (!Number.isFinite(quotaCheckTimeoutMs) || quotaCheckTimeoutMs <= 0) {
      return promise;
    }

    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`quota check timeout after ${quotaCheckTimeoutMs}ms`));
      }, quotaCheckTimeoutMs);
    });

    return Promise.race([promise, timeoutPromise])
      .finally(() => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      });
  }

  function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  }

  function isMissingCredentialsPayload(payload) {
    return evaluateQuotaPayload(payload).reason === 'missing_credentials';
  }

  async function requestQuotaPayload(config, targetUrl) {
    const result = await withQuotaCheckTimeout(requestBufferedFn({
      method: 'GET',
      targetUrl,
      headers: buildAuthHeadersForConfig(config),
      timeoutMs: quotaCheckTimeoutMs,
      maxRedirects: 5,
    }));

    return {
      result,
      payload: JSON.parse(result.bodyText),
    };
  }

  function parseJsonBody(text) {
    try {
      return JSON.parse(String(text || ''));
    } catch (err) {
      return null;
    }
  }

  function extractProbeError(result) {
    const statusCode = Number(result && result.statusCode) || 0;
    const payload = parseJsonBody(result && result.bodyText);
    const upstreamMessage = payload && typeof payload === 'object'
      ? payload.error?.message || payload.message || payload.error
      : '';
    const message = typeof upstreamMessage === 'string' && upstreamMessage.trim()
      ? upstreamMessage.trim()
      : `API Key probe status ${statusCode}`;

    return message;
  }

  function isRetryableProbeModelError(message) {
    const normalized = normalizeString(message).toLowerCase();
    return normalized.includes('no available channels for model') ||
      normalized.includes('model_not_found') ||
      normalized.includes('model not found') ||
      normalized.includes('model does not exist') ||
      normalized.includes('model is not available') ||
      normalized.includes('model not supported') ||
      normalized.includes('unsupported model');
  }

  function getApiKeyProbeModels(config) {
    if (Array.isArray(config.probeModels) && config.probeModels.length > 0) {
      return config.probeModels.filter(model => normalizeString(model));
    }

    if (normalizeString(config.probeModel)) {
      return [normalizeString(config.probeModel)];
    }

    return Array.isArray(config.support) && config.support.includes('claude')
      ? ['claude-opus-4-7']
      : ['gpt-5.5', 'gpt-5.4'];
  }

  function buildApiKeyProbeRequest(config, model) {
    const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
    const probeModel = normalizeString(model) || normalizeString(config.probeModel);

    if (Array.isArray(config.support) && config.support.includes('claude')) {
      const body = Buffer.from(JSON.stringify({
        model: probeModel || 'claude-opus-4-7',
        max_tokens: 16,
        messages: [
          {
            role: 'user',
            content: 'ping',
          },
        ],
      }));

      return {
        method: 'POST',
        targetUrl: `${baseUrl}/messages`,
        headers: {
          ...buildAuthHeadersForConfig(config),
          'content-type': 'application/json',
          accept: 'application/json',
          'anthropic-version': '2023-06-01',
          'content-length': String(body.length),
        },
        body,
      };
    }

    const body = Buffer.from(JSON.stringify({
      model: probeModel || 'gpt-5.5',
      messages: [
        {
          role: 'user',
          content: 'ping',
        },
      ],
      max_tokens: 16,
    }));

    return {
      method: 'POST',
      targetUrl: `${baseUrl}/chat/completions`,
      headers: {
        ...buildAuthHeadersForConfig(config),
        'content-type': 'application/json',
        accept: 'application/json',
        'content-length': String(body.length),
      },
      body,
    };
  }

  async function checkApiKeyConfig(config) {
    try {
      const probeModels = getApiKeyProbeModels(config);
      let lastError = null;

      for (let index = 0; index < probeModels.length; index += 1) {
        const result = await withQuotaCheckTimeout(requestBufferedFn({
          ...buildApiKeyProbeRequest(config, probeModels[index]),
          timeoutMs: quotaCheckTimeoutMs,
          maxRedirects: 2,
        }));

        if (result.statusCode >= 200 && result.statusCode < 300) {
          config.runtime.available = true;
          config.runtime.reason = 'apikey';
          config.runtime.lastCheckedAt = now();
          config.runtime.lastError = null;
          return config.runtime;
        }

        lastError = extractProbeError(result);
        if (index === probeModels.length - 1 || !isRetryableProbeModelError(lastError)) {
          break;
        }
      }

      config.runtime.available = false;
      config.runtime.reason = 'apikey_check_failed';
      config.runtime.lastCheckedAt = now();
      config.runtime.lastError = lastError || 'API Key probe failed';
    } catch (err) {
      config.runtime.available = false;
      config.runtime.reason = 'apikey_check_failed';
      config.runtime.lastCheckedAt = now();
      config.runtime.lastError = err.message;
    }

    return config.runtime;
  }

  async function refreshConfigAccessToken(config) {
    const refreshToken = normalizeString(config.refresh_token);

    if (!refreshToken || typeof refreshTokenFn !== 'function') {
      return false;
    }

    const refreshed = await refreshTokenFn({
      config,
      refreshToken,
      clientId: normalizeString(config.client_id),
    });
    const accessToken = normalizeString(refreshed && (refreshed.access_token || refreshed.accessToken));
    const nextRefreshToken = normalizeString(refreshed && (refreshed.refresh_token || refreshed.refreshToken)) || refreshToken;
    const clientId = normalizeString(refreshed && (refreshed.client_id || refreshed.clientId)) || normalizeString(config.client_id);

    if (!accessToken) {
      throw new Error('token refresh response missing access_token');
    }

    config.access_token = accessToken;
    config.refresh_token = nextRefreshToken;
    if (clientId) {
      config.client_id = clientId;
    }

    await persistTokenRefreshFn({
      config,
      accessToken,
      refreshToken: nextRefreshToken,
      ...(clientId ? { clientId } : {}),
    });

    return true;
  }

  /**
   * 保证活动账号可用，并按使用偏好、当前同级账号优先、额度较高优先的顺序校正。
   */
  function ensureActiveConfig(reason = 'select', predicate = () => true) {
    if (configs.length === 0) {
      return null;
    }

    const currentConfig = configs[activeConfigIndex] || null;
    const priorityIndex = findHighestPriorityAvailableConfigIndex(predicate);
    if (priorityIndex !== -1) {
      const nextConfig = configs[priorityIndex];
      if (priorityIndex !== activeConfigIndex) {
        const previousConfig = currentConfig;
        activeConfigIndex = priorityIndex;
        recordActiveSelection(nextConfig, reason);
        if (reason !== 'startup') {
          warn(`账号切换: ${previousConfig ? getAccountLabel(previousConfig) : 'none'} -> ${getAccountLabel(nextConfig)} (${reason})`);
        }
      }

      return nextConfig;
    }
    if (currentConfig && isEligibleConfig(currentConfig, predicate)) {
      warn(`没有可用账号，继续使用当前账号 ${getAccountLabel(currentConfig)} (${reason})`);
      return currentConfig;
    }

    return null;
  }

  /**
   * 刷新单个账号的额度状态。
   */
  async function checkSingleAccountQuota(config, options = {}) {
    const { allowSwitch = true } = options;

    if (!shouldUseQuotaMonitoring(config.type)) {
      return config.runtime;
    }

    if (!config.runtime.enabled) {
      config.runtime.available = false;
      config.runtime.reason = 'missing_credentials';
      return config.runtime;
    }

    const targetUrl = new URL(quotaCheckPath, config.baseUrl).toString();

    try {
      let { result, payload } = await requestQuotaPayload(config, targetUrl);
      if (result.statusCode < 200 || result.statusCode >= 300) {
        if (isMissingCredentialsPayload(payload)) {
          const refreshed = await refreshConfigAccessToken(config);
          if (refreshed) {
            ({ result, payload } = await requestQuotaPayload(config, targetUrl));
            if (result.statusCode >= 200 && result.statusCode < 300) {
              applyQuotaPayload(config, payload, { allowSwitch });
              return config.runtime;
            }
          }

          applyQuotaPayload(config, payload, { allowSwitch });
          return config.runtime;
        }

        throw new Error(`quota check status ${result.statusCode}`);
      }

      applyQuotaPayload(config, payload, { allowSwitch });
    } catch (err) {
      config.runtime.available = false;
      config.runtime.reason = 'quota_check_failed';
      config.runtime.lastCheckedAt = now();
      config.runtime.lastError = err.message;
    }

    return config.runtime;
  }

  /**
   * 刷新单个账号并按状态变化输出日志。
   */
  async function refreshSingleConfigWithLogging(config, reason) {
    const previousAvailability = config.runtime.available;
    const previousReason = config.runtime.reason;

    await checkSingleAccountQuota(config, { allowSwitch: false });

    const availabilityChanged = previousAvailability !== config.runtime.available || previousReason !== config.runtime.reason;
    if (availabilityChanged && !config.runtime.available && reason !== 'startup') {
      warn(`账号不可用: ${getAccountLabel(config)} (${config.runtime.reason}${config.runtime.lastError ? `: ${config.runtime.lastError}` : ''})`);
    } else if (availabilityChanged && config.runtime.available && previousAvailability === false && reason !== 'startup') {
      warn(`账号恢复可用: ${getAccountLabel(config)} (remaining=${config.runtime.remainingPercent ?? 'unknown'}%)`);
    }
  }

  /**
   * 轮询所有 token 账号额度，并按当前使用偏好校正活动账号。
   */
  async function refreshQuotas(reason = 'poll') {
    if (!configs.some(config => shouldUseQuotaMonitoring(config.type))) {
      return;
    }

    if (quotaMonitorRunning) {
      return;
    }

    quotaMonitorRunning = true;
    const previousActiveIndex = activeConfigIndex;

    try {
      for (const config of configs) {
        if (shouldUseQuotaMonitoring(config.type)) {
          await refreshSingleConfigWithLogging(config, reason);
        }
      }

      const currentConfig = ensureActiveConfig(reason);

      if (previousActiveIndex !== activeConfigIndex && currentConfig) {
        warn(`当前活动账号: ${getAccountLabel(currentConfig)}`);
      }

      if (reason === 'poll' && currentConfig) {
        log(`轮询额度: ${getAccountStatus(currentConfig).summaryLine}`);
      }
    } finally {
      quotaMonitorRunning = false;
    }
  }

  async function refreshConfig(index, reason = 'manual_refresh') {
    if (!Number.isInteger(index) || index < 0 || index >= configs.length) {
      throw new Error('配置项索引不合法');
    }

    const config = configs[index];
    if (shouldUseQuotaMonitoring(config.type)) {
      await refreshSingleConfigWithLogging(config, reason);
      ensureActiveConfig(reason);
    } else if (config.type === 'apikey') {
      await checkApiKeyConfig(config);
      ensureActiveConfig(reason);
    }

    return config;
  }

  /**
   * 启动后台额度轮询定时器。
   */
  function startQuotaMonitor() {
    if (!configs.some(config => shouldUseQuotaMonitoring(config.type))) {
      return;
    }

    if (quotaMonitorTimer) {
      clearInterval(quotaMonitorTimer);
    }

    quotaMonitorTimer = setInterval(() => {
      void refreshQuotas('poll');
    }, quotaCheckIntervalMs);
  }

  /**
   * 停止后台额度轮询定时器。
   */
  function stopQuotaMonitor() {
    if (quotaMonitorTimer) {
      clearInterval(quotaMonitorTimer);
      quotaMonitorTimer = null;
    }
  }

  return {
    ensureActiveConfig,
    refreshQuotas,
    refreshConfig,
    startQuotaMonitor,
    stopQuotaMonitor,
    getActiveConfig,
    activateConfig,
    getAccountStatus,
    applyQuotaPayload,
    markConfigUnavailable,
  };
}

module.exports = {
  createAccountManager,
};
