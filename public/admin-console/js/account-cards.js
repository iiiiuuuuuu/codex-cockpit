function formatLastChecked(runtime) {
  const value = getRuntimeValue(runtime, 'last_checked_at');
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '尚未检查';
  }

  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getAvailability(item) {
  if (isDeletedConfig(item)) {
    return 'unavailable';
  }
  if (item.runtime && item.runtime.available === false) {
    return 'unavailable';
  }
  return 'available';
}

function getRuntimeError(runtime, item = null) {
  let errorText = '';
  if (runtime && typeof runtime.last_error === 'string' && runtime.last_error.trim()) {
    errorText = runtime.last_error.trim();
  } else {
    const summary = runtime && typeof runtime.runtime_summary === 'string' ? runtime.runtime_summary : '';
    const match = summary.match(/错误=(.+)$/);
    errorText = match ? match[1].trim() : '';
  }

  return formatRuntimeErrorText(errorText, item);
}

function formatRuntimeErrorText(errorText, item = null) {
  if (!errorText) {
    return '';
  }

  const normalizedText = stripDiagnosticIds(errorText);
  const lowerText = normalizedText.toLowerCase();
  if (/\bquota check status\s+401\b/i.test(normalizedText) || /\b401\b/.test(normalizedText) && /auth|unauthorized|鉴权|认证/.test(lowerText)) {
    if (item && isApiKeyConfig(item)) {
      return '上游鉴权失败 401，请检查 API Key 或 Base URL';
    }
    return '鉴权失败 401，请重新登录或更新 Token';
  }
  if (/api key|apikey/.test(lowerText) && /\b401\b|unauthorized|invalid|鉴权|认证/.test(lowerText)) {
    return '上游鉴权失败 401，请检查 API Key 或 Base URL';
  }
  if (/monthly quota exceeded/i.test(normalizedText)) {
    return '上游月度额度已用完';
  }
  if (/insufficient quota/i.test(normalizedText)) {
    return '上游额度不足';
  }
  if (/quota exceeded|usage limit/i.test(normalizedText)) {
    return '上游额度已用完';
  }
  if (/timeout|timed out|超时/.test(lowerText)) {
    return '检查请求超时，请稍后重试';
  }
  if (/network|socket|tls|econnreset|etimedout|connection|连接/.test(lowerText)) {
    return '网络连接失败，请检查代理或上游连通性';
  }

  return normalizedText
    .replace(/\bquota check status\s+401\b/gi, '额度检查接口鉴权失败（401）')
    .replace(/\bmonthly quota exceeded\b/gi, '上游月度额度已用完')
    .replace(/\binsufficient quota\b/gi, '上游额度不足')
    .replace(/\bquota exceeded\b/gi, '上游额度已用完');
}

function stripDiagnosticIds(errorText) {
  return String(errorText || '')
    .replace(/\s*\(request_id:\s*[^)]+\)/gi, '')
    .replace(/\s*\[request_id:\s*[^\]]+\]/gi, '')
    .replace(/\s*\[trace_id:\s*[^\]]+\]/gi, '')
    .replace(/\s*request[_ -]?id[:=]\s*\S+/gi, '')
    .replace(/\s*trace[_ -]?id[:=]\s*\S+/gi, '')
    .trim();
}

function getUnavailableReasonText(item, healthText, errorText) {
  if (errorText) {
    return errorText;
  }

  if (isApiKeyConfig(item)) {
    return '上游不可用，请检查 API Key 或 Base URL';
  }

  if (item.runtime?.reason === 'quota_check_failed') {
    return '额度检查失败，请稍后重试或重新登录该 Token';
  }

  return healthText || '当前账号不可用，请查看运行日志';
}

function formatReasonText(reason) {
  const reasonMap = {
    ok: '正常',
    unchecked: '未检查',
    apikey: 'API Key 上游',
    missing_credentials: '缺少凭证',
    rate_limit_not_allowed: '额度不可用',
    rate_limit_reached: '额度已用尽',
    membership_expired: '会员已过期',
    responses_insufficient_quota: 'Responses 配额不足',
    responses_usage_limit_reached: 'Responses 窗口额度已用尽',
    responses_usage_not_included: 'Responses 套餐不支持',
    quota_check_failed: '额度检查失败',
    apikey_check_failed: 'API Key 检查失败',
    deleted: '已标记删除',
  };

  if (typeof reason === 'string' && reason.startsWith('remaining_below_')) {
    return '5小时配额过低';
  }

  if (typeof reason === 'string' && reason.startsWith('secondary_remaining_not_above_')) {
    return '周配额过低';
  }

  return reasonMap[reason] || reason || '未知';
}

function formatSelectionReason(reason) {
  const reasonMap = {
    admin_manual_activate: '手动切换',
    admin_refresh_single: '单账号刷新后校正',
    admin_refresh: '全量刷新后校正',
    poll: '额度轮询校正',
    proxy_request: '代理请求校正',
    claude_request: 'Claude 请求校正',
    quota_update: '额度更新校正',
    admin_update_config: '配置变更后自动选择',
    admin_update_settings: '设置变更后自动选择',
    responses_failover: 'Responses 错误自动切换',
    claude_responses_failover: 'Claude Responses 错误自动切换',
    runtime_unavailable: '运行时不可用自动切换',
    startup: '启动初始化',
  };

  return reasonMap[reason] || reason || '';
}

function getHealthText(item) {
  if (isDeletedConfig(item)) {
    return '已标记删除';
  }

  if (isApiKeyConfig(item)) {
    if (item.runtime?.available === false) {
      return formatReasonText(item.runtime?.reason);
    }

    return '不检查额度';
  }

  if (item.runtime?.available === false) {
    return formatReasonText(item.runtime?.reason);
  }

  return formatReasonText(item.runtime?.reason || 'ok');
}

function getStatusBadgeText(item, availability, healthText) {
  if (isDeletedConfig(item)) {
    return '已删除';
  }

  if (availability !== 'unavailable') {
    return '可用';
  }

  const genericReasons = new Set([
    '额度不可用',
    '额度检查失败',
    '未知',
  ]);

  return genericReasons.has(healthText) ? '不可用' : healthText || '不可用';
}

function isRetryableNetworkProblem(item) {
  const text = `${getRuntimeError(item && item.runtime)} ${item?.runtime?.runtime_summary || ''}`.toLowerCase();
  return /network|socket|tls|econnreset|etimedout|timeout|connection/.test(text);
}

function renderQuota(label, icon, value, resetText, options = {}) {
  const tone = getPercentTone(value);
  const toneClass = tone ? ` ${tone}` : '';
  const actionAttrs = options.action
    ? ` data-action="${escapeHtml(options.action)}" data-index="${escapeHtml(String(options.index))}"${options.historyMode ? ` data-history-mode="${escapeHtml(options.historyMode)}"` : ''}`
    : '';
  const tagName = options.action ? 'button' : 'div';
  const typeAttr = options.action ? ' type="button"' : '';
  const titleAttr = options.title ? ` title="${escapeHtml(options.title)}"` : '';
  const className = options.action ? 'quota-row quota-row-button' : 'quota-row';
  return `
    <${tagName} class="${className}"${typeAttr}${actionAttrs}${titleAttr}>
      <div class="quota-meta">
        <div class="quota-label">${icon}<span>${escapeHtml(label)}</span></div>
        <div class="quota-percent${toneClass}">${escapeHtml(formatPercent(value))}</div>
      </div>
      <div class="bar" aria-hidden="true">
        <div class="bar-fill${toneClass}" style="--value: ${clampPercent(value)}%"></div>
      </div>
      <div class="reset-text" title="${escapeHtml(resetText)}">${escapeHtml(resetText)}</div>
    </${tagName}>
  `;
}

function renderAccountCard(item) {
  const availability = getAvailability(item);
  const primaryPercent = getPrimaryPercent(item.runtime);
  const weeklyPercent = getWeeklyPercent(item.runtime);
  const planLabel = getPlanLabel(item);
  const priceLabel = formatAccountPriceYuan(item);
  const errorText = getRuntimeError(item.runtime, item);
  const healthText = getHealthText(item);
  const autoSwitchDisabled = isAutoSwitchDisabled(item);
  const deleted = isDeletedConfig(item);
  const deletedAtDisplay = formatDeletedAtDisplay(item);
  const startedAtDisplay = formatStartedAtDisplay(item);
  const stoppedAtDisplay = formatStoppedAtDisplay(item);
  const usageText = startedAtDisplay ? formatUsageDays(item) : '';
  const usageTitle = stoppedAtDisplay
    ? `开始使用：${startedAtDisplay}；停止使用：${stoppedAtDisplay}`
    : `开始使用：${startedAtDisplay}`;
  const statusBadgeText = getStatusBadgeText(item, availability, healthText);
  const cardClass = [
    'account-card',
    item.is_active ? 'current' : '',
    availability === 'unavailable' ? 'unavailable' : '',
    deleted ? 'deleted' : '',
  ].filter(Boolean).join(' ');
  const planClass = planLabel === 'TEAM' ? 'team' : 'plan';
  const quotaContent = isApiKeyConfig(item)
    ? '<div class="api-key-note compact">不做额度检查；点击刷新会检测 API Key 上游是否可用；默认优先用较新的 GPT 模型探测，不支持时自动降级重试。</div>'
    : `
      <div class="quota-block">
        ${renderQuota('5小时配额', '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>', primaryPercent, formatResetText(item.runtime, 'primary'), {
          action: 'quota-history',
          index: item.index,
          historyMode: 'primary',
          title: '查看最近 5 小时配额走势',
        })}
        ${renderQuota('周配额', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>', weeklyPercent, formatResetText(item.runtime, 'secondary'), {
          action: 'quota-history',
          index: item.index,
          historyMode: 'weekly',
          title: '查看周配额走势',
        })}
      </div>
    `;
  const selectionReason = item.is_active ? formatSelectionReason(item.runtime?.last_selection_reason) : '';
  const deletedReason = deletedAtDisplay ? `删除标记：${deletedAtDisplay}` : '删除标记已设置';
  const detailTitle = deleted
    ? deletedReason
    : availability === 'unavailable'
    ? `不可用原因：${getUnavailableReasonText(item, healthText, errorText)}`
    : selectionReason
      ? `当前使用：${selectionReason}`
      : `状态：${healthText}`;
  const detailLine = deleted
    ? `<div class="detail-line deleted" title="${escapeHtml(deletedReason)}">${escapeHtml(deletedReason)}</div>`
    : availability === 'unavailable'
    ? `<div class="detail-line error" title="${escapeHtml(detailTitle)}">不可用原因：${escapeHtml(getUnavailableReasonText(item, healthText, errorText))}</div>`
    : selectionReason
      ? `<div class="detail-line" title="${escapeHtml(detailTitle)}">当前使用：${escapeHtml(selectionReason)}</div>`
      : `<div class="detail-line" title="${escapeHtml(detailTitle)}">状态：${escapeHtml(healthText)}</div>`;
  const statusRow = `
      <div class="status-row">
        ${item.is_active ? '<span class="status-chip current">当前使用</span>' : ''}
        ${usageText ? `<span class="status-chip usage" title="${escapeHtml(usageTitle)}">${escapeHtml(usageText)}</span>` : ''}
        <span class="status-chip ${availability === 'unavailable' ? 'bad' : 'ok'}">${escapeHtml(statusBadgeText)}</span>
        ${deleted ? '<span class="status-chip deleted">已标记删除</span>' : ''}
        ${autoSwitchDisabled ? '<span class="status-chip auto-disabled">不自动切入</span>' : ''}
      </div>`;
  const footerInfo = `
    <div class="stamp">最后检查：${escapeHtml(formatLastChecked(item.runtime))}</div>
    ${detailLine}
  `;
  const canDrag = !item.is_active;
  const dragTitle = canDrag ? '拖动调整展示顺序' : '当前使用固定置顶';
  const deleteActionButton = `
          <button class="card-action danger" type="button" data-action="delete" data-index="${item.index}" title="${deleted ? '彻底删除' : '删除'}" aria-label="${deleted ? '彻底删除' : '删除'}">
            <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v6M14 11v6"/></svg>
          </button>`;
  const accountActions = deleted
    ? `
          <button class="card-action restore" type="button" data-action="restore-delete" data-index="${item.index}" title="恢复" aria-label="恢复">
            <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/></svg>
          </button>
          ${deleteActionButton}
    `
    : `
          <button class="card-action" type="button" data-action="activate" data-index="${item.index}" ${item.is_active ? 'disabled' : ''} title="${item.is_active ? '当前使用' : '切换'}" aria-label="${item.is_active ? '当前使用' : '切换'}">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="card-action" type="button" data-action="refresh" data-index="${item.index}" title="${isApiKeyConfig(item) ? '测试此 API Key 上游是否可用' : '只刷新此账号额度'}" aria-label="${isApiKeyConfig(item) ? '测试此 API Key 上游是否可用' : '只刷新此账号额度'}">
            <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v6h-6"/></svg>
          </button>
          <button class="card-action ${autoSwitchDisabled ? 'auto-disabled' : ''}" type="button" data-action="toggle-auto-switch" data-index="${item.index}" data-auto-switch-disabled="${autoSwitchDisabled ? 'true' : 'false'}" title="${autoSwitchDisabled ? '允许自动切换到此账号' : '禁止自动切换到此账号'}" aria-label="${autoSwitchDisabled ? '允许自动切换到此账号' : '禁止自动切换到此账号'}">
            ${autoSwitchDisabled
              ? '<svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'
              : '<svg viewBox="0 0 24 24"><path d="M6 6l12 12"/><path d="M8 8a7 7 0 0 0 8 8"/><path d="M16 8a7 7 0 0 0-8 8"/></svg>'}
          </button>
          <button class="card-action" type="button" data-action="edit" data-index="${item.index}" title="编辑别名" aria-label="编辑别名">
            <svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13 7l4 4"/></svg>
          </button>
          ${deleteActionButton}
    `;

  return `
    <article class="${cardClass}" data-account-card data-index="${item.index}" data-draggable-account="${canDrag ? 'true' : 'false'}" ${canDrag ? 'draggable="true"' : ''}>
      <div class="account-head">
        <div class="account-topline">
          <div class="account-title-group">
            <div class="account-name" title="${escapeHtml(getDisplayName(item))}">${escapeHtml(getDisplayName(item))}</div>
          </div>
          <div class="pill-row">
            <span class="pill ${planClass}">${escapeHtml(planLabel)}</span>
            ${priceLabel ? `<span class="pill price">${escapeHtml(priceLabel)}</span>` : ''}
          </div>
        </div>
      </div>

      ${statusRow}

      ${quotaContent}

      <div class="card-footer">
        <div>
          ${footerInfo}
        </div>
        <div class="card-actions">
          ${accountActions}
        </div>
      </div>
    </article>
  `;
}

function getManagedConfigs() {
  return Array.isArray(snapshot?.configs) ? snapshot.configs : [];
}

function getAccountSortOrder(item) {
  const rawValue = item?.item?.sort_order;
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue === 'string' && rawValue.trim() && !Number.isNaN(Number(rawValue))) {
    return Number(rawValue);
  }
  return item.index;
}

function getConfiguredOrderAccounts() {
  return [...getManagedConfigs()].sort((left, right) => {
    const orderDiff = getAccountSortOrder(left) - getAccountSortOrder(right);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return left.index - right.index;
  });
}

function getVisibleAccounts() {
  return getConfiguredOrderAccounts().sort((left, right) => {
    if (left.is_active !== right.is_active) {
      return left.is_active ? -1 : 1;
    }
    return 0;
  });
}

function renderAccounts() {
  accountsGrid.className = 'accounts-grid';
  applyAccountGridLayout();
  const accounts = getVisibleAccounts();
  const tokenAccountCount = accounts.filter(item => isTokenConfig(item)).length;
  quotaOverviewButton.disabled = tokenAccountCount === 0;
  quotaOverviewButton.title = tokenAccountCount ? '查看所有 Token 账号额度总览' : '当前没有 Token 账号';

  if (!accounts.length) {
    accountsGrid.innerHTML = '<div class="empty">当前没有匹配的 Codex 账号。</div>';
    return;
  }

  accountsGrid.innerHTML = accounts.map(renderAccountCard).join('');
}

function renderApiKeys(apikeys) {
  apiKeyStatusTitle.textContent = apikeys.length ? `入口 apikey (${apikeys.length})` : '入口 apikey';

  if (!apikeys.length) {
    apiKeysListEl.innerHTML = '<div class="empty">当前没有入口 apikey，请求不会校验 apikey。</div>';
    return;
  }

  apiKeysListEl.innerHTML = apikeys.map((apikey, index) => `
    <div class="key-item">
      <div>
        <div class="key-meta">apikey #${index + 1}</div>
        <div class="key-value">${escapeHtml(apikey)}</div>
      </div>
      <button class="command danger" type="button" data-action="delete-apikey" data-index="${index}">删除</button>
    </div>
  `).join('');
}

function renderProxySettings(data) {
  const info = buildProxyAccessInfo(data || {});
  servicePortInput.value = String(info.configuredPort);
  proxyPortInput.value = info.proxyPort ? String(info.proxyPort) : '';
  proxyV1Url.textContent = info.portPendingRestart ? info.configuredV1Url : info.v1Url;

  const proxyText = info.proxyPort
    ? `ai-cockpit 访问上游时会通过本机代理端口 ${info.proxyPort} 出网。`
    : '未配置上游代理端口';
  const restartText = info.portPendingRestart
    ? `正在切换到 ${info.configuredPort}；当前连接仍在 ${info.runtimePort}。`
    : `把上方地址填到 Codex/OpenAI 客户端的 Base URL；Responses 接口为 ${info.responsesUrl}。`;

  proxyEndpointMeta.textContent = `${restartText} ${proxyText}`;
}
