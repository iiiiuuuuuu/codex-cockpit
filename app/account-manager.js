const { requestBuffered } = require('./upstream-request');

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
    buildAuthHeadersForConfig,
    requestBufferedFn = requestBuffered,
    shouldUseQuotaMonitoring,
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
    return `#${config.index + 1} ${config.description}`;
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
      responses_insufficient_quota: 'responses 配额不足',
      responses_usage_limit_reached: 'responses 窗口额度已用尽',
      responses_usage_not_included: 'responses 套餐不支持',
      [`remaining_below_${minRemainingPercent}%`]: `剩余额度低于 ${minRemainingPercent}%`,
      quota_check_failed: '额度检查失败',
    };

    return reasonMap[reason] || reason || '未知';
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

  /**
   * 将额度接口返回转换为统一的运行时状态。
   */
  function evaluateQuotaPayload(payload) {
    const detail = payload && typeof payload.detail === 'string' ? payload.detail.trim().toLowerCase() : '';
    if (detail === 'unauthorized') {
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
    // 3% 阈值和对外汇总口径都跟随主额度窗口；周额度仅用于展示。
    const remainingPercent = primaryRemainingPercent !== null
      ? primaryRemainingPercent
      : secondaryRemainingPercent;

    let available = true;
    let reason = 'ok';

    if (rateLimit.allowed === false) {
      available = false;
      reason = 'rate_limit_not_allowed';
    } else if (rateLimit.limit_reached === true) {
      available = false;
      reason = 'rate_limit_reached';
    } else if (primaryRemainingPercent !== null && primaryRemainingPercent < minRemainingPercent) {
      available = false;
      reason = `remaining_below_${minRemainingPercent}%`;
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

  function getConfigPriority(config) {
    return config && config.type === 'token' ? 0 : 1;
  }

  function findHighestPriorityAvailableConfigIndex(predicate = () => true) {
    let selectedIndex = -1;
    let selectedConfig = null;

    for (let index = 0; index < configs.length; index += 1) {
      const config = configs[index];
      if (!predicate(config) || !isConfigAvailable(config)) {
        continue;
      }

      if (
        selectedIndex === -1 ||
        getConfigPriority(config) < getConfigPriority(selectedConfig) ||
        (getConfigPriority(config) === getConfigPriority(selectedConfig) && index === activeConfigIndex)
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
    return currentConfig && predicate(currentConfig) ? currentConfig : null;
  }

  function activateConfig(index, reason = 'manual') {
    if (!Number.isInteger(index) || index < 0 || index >= configs.length) {
      throw new Error('配置项索引不合法');
    }

    const previousConfig = configs[activeConfigIndex] || null;
    const nextConfig = configs[index];
    activeConfigIndex = index;

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

  /**
   * 保证活动账号可用，仅当当前账号不可用时才切换。
   */
  function ensureActiveConfig(reason = 'select') {
    if (configs.length === 0) {
      return null;
    }

    const currentConfig = configs[activeConfigIndex] || null;
    const priorityIndex = findHighestPriorityAvailableConfigIndex();
    if (priorityIndex !== -1) {
      const nextConfig = configs[priorityIndex];
      if (priorityIndex !== activeConfigIndex) {
        const previousConfig = currentConfig;
        activeConfigIndex = priorityIndex;
        if (reason !== 'startup') {
          warn(`账号切换: ${previousConfig ? getAccountLabel(previousConfig) : 'none'} -> ${getAccountLabel(nextConfig)} (${reason})`);
        }
      }

      return nextConfig;
    }
    if (currentConfig) {
      warn(`没有可用账号，继续使用当前账号 ${getAccountLabel(currentConfig)} (${reason})`);
      return currentConfig;
    }

    throw new Error('没有可用账号配置');
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
      const result = await withQuotaCheckTimeout(requestBufferedFn({
        method: 'GET',
        targetUrl,
        headers: buildAuthHeadersForConfig(config),
        timeoutMs: quotaCheckTimeoutMs,
        maxRedirects: 5,
      }));
      const payload = JSON.parse(result.bodyText);
      if (result.statusCode < 200 || result.statusCode >= 300) {
        const detail = payload && typeof payload.detail === 'string' ? payload.detail.trim().toLowerCase() : '';
        if (detail === 'unauthorized') {
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
   * 轮询所有 token 账号额度；token 永远优先于 apikey，token 全部不可用时才使用 apikey 兜底。
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
