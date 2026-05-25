function isTokenConfig(item) {
  const configItem = item && item.item ? item.item : item;
  return !configItem || configItem.type !== 'apikey';
}

function isApiKeyConfig(item) {
  const configItem = item && item.item ? item.item : item;
  return Boolean(configItem && configItem.type === 'apikey');
}

function isAutoSwitchDisabled(item) {
  const configItem = item && item.item ? item.item : item;
  return Boolean(configItem && configItem.auto_switch_disabled === true);
}

function getAccountPriceYuan(item) {
  const configItem = item && item.item ? item.item : item;
  const price = Number(configItem?.price_yuan);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function formatAccountPriceYuan(item) {
  const price = getAccountPriceYuan(item);
  if (price <= 0) {
    return '';
  }

  return Number.isInteger(price) ? `¥${price}` : `¥${price.toFixed(2)}`;
}

function formatDateTimeInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function getCurrentDateTimeInputValue() {
  return formatDateTimeInputValue(new Date());
}

function getStartedAtValue(item) {
  const configItem = item && item.item ? item.item : item;
  const value = typeof configItem?.started_at === 'string' ? configItem.started_at.trim().replace(' ', 'T') : '';
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    return '';
  }

  const [, dateText, hourText = '00', minuteText = '00', secondText = '00'] = match;
  return `${dateText}T${hourText}:${minuteText}:${secondText}`;
}

function getStartedAtInputValue(item) {
  const value = getStartedAtValue(item);
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/);
  return match ? `${match[1]}T${match[2]}:${match[3]}` : '';
}

function getStoppedAtValue(item) {
  const configItem = item && item.item ? item.item : item;
  const value = typeof configItem?.stopped_at === 'string' ? configItem.stopped_at.trim().replace(' ', 'T') : '';
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    return '';
  }

  const [, dateText, hourText = '00', minuteText = '00', secondText = '00'] = match;
  return `${dateText}T${hourText}:${minuteText}:${secondText}`;
}

function getStoppedAtInputValue(item) {
  const value = getStoppedAtValue(item);
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/);
  return match ? `${match[1]}T${match[2]}:${match[3]}` : '';
}

function formatStartedAtDisplay(item) {
  const value = getStartedAtValue(item);
  if (!value) {
    return '';
  }

  return value.replace('T', ' ');
}

function formatStoppedAtDisplay(item) {
  const value = getStoppedAtValue(item);
  if (!value) {
    return '';
  }

  return value.replace('T', ' ');
}

function getStartedAtTime(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText = '00', minuteText = '00', secondText = '00'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }

  return date.getTime();
}

function getUsageDays(item) {
  const startedAt = getStartedAtValue(item);
  const startTime = getStartedAtTime(startedAt);
  if (startTime === null) {
    return null;
  }

  const stoppedAt = getStoppedAtValue(item);
  const stopTime = stoppedAt ? getStartedAtTime(stoppedAt) : null;
  const endTime = stopTime === null ? Date.now() : stopTime;
  const elapsedDays = (endTime - startTime) / (24 * 60 * 60 * 1000);
  if (elapsedDays <= 0) {
    return 0;
  }

  return elapsedDays;
}

function formatUsageDays(item) {
  const days = getUsageDays(item);
  if (days === null) {
    return '';
  }

  if (days <= 0) {
    return '未开始使用';
  }

  if (days < 1) {
    const hours = days * 24;
    if (hours < 1) {
      return '已使用 <1 小时';
    }

    const displayHours = Math.floor(hours);
    return `已使用 ${displayHours} 小时`;
  }

  return `已使用 ${Math.floor(days)} 天`;
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

function getDisplayName(item) {
  const configItem = item.item || {};
  return configItem.alias || configItem.description || configItem.account_id || `配置 #${item.index + 1}`;
}

function getAliasModalDetails(item) {
  const configItem = item.item || {};

  if (isApiKeyConfig(item)) {
    return {
      note: '别名只会影响这个页面里的展示，不会修改上游地址或 API Key。',
      sourceLabel: '上游地址',
      sourceValue: configItem.base_url || '未设置',
      idLabel: 'API Key',
      idValue: maskSecret(configItem.apikey),
      aliasValue: configItem.alias || configItem.description || '',
      priceValue: getAccountPriceYuan(item) || '',
      startedAtValue: getStartedAtInputValue(item),
      stoppedAtValue: getStoppedAtInputValue(item),
    };
  }

  return {
    note: '别名只会影响这个页面里的展示，邮箱账号和账号 ID 会继续保留。',
    sourceLabel: '邮箱账号',
    sourceValue: configItem.description || '未设置',
    idLabel: '账号 ID',
    idValue: configItem.account_id || '未设置',
    aliasValue: configItem.alias || '',
    priceValue: getAccountPriceYuan(item) || '',
    startedAtValue: getStartedAtInputValue(item),
    stoppedAtValue: getStoppedAtInputValue(item),
  };
}

function getPlanLabel(item) {
  if (isApiKeyConfig(item)) {
    return 'API KEY';
  }

  const configItem = item.item || {};
  const plan = String(
    configItem.plan_type
    || configItem.plan
    || configItem.subscription?.plan_type
    || configItem.user?.plan_type
    || ''
  ).trim().toUpperCase();

  if (['PLUS', 'PRO', 'TEAM', 'BUSINESS', 'ENTERPRISE'].includes(plan)) {
    return plan;
  }

  return 'TOKEN';
}

function getRuntimeValue(runtime, key) {
  return runtime && Object.prototype.hasOwnProperty.call(runtime, key) ? runtime[key] : null;
}

function parsePercentFromSummary(summary, label) {
  const match = String(summary || '').match(new RegExp(`${label}=([^|]+)`));
  if (!match) {
    return null;
  }

  const value = match[1].trim();
  if (!/%$/.test(value)) {
    return null;
  }

  const percent = Number.parseFloat(value.replace('%', ''));
  return Number.isFinite(percent) ? percent : null;
}

function getPrimaryPercent(runtime) {
  const value = getRuntimeValue(runtime, 'primary_remaining_percent');
  return typeof value === 'number' ? value : parsePercentFromSummary(runtime?.runtime_summary, '额度');
}

function getWeeklyPercent(runtime) {
  const value = getRuntimeValue(runtime, 'secondary_remaining_percent');
  return typeof value === 'number' ? value : parsePercentFromSummary(runtime?.runtime_summary, '周额度');
}

function formatPercent(value) {
  return typeof value === 'number' ? `${Math.round(value)}%` : '--';
}

function getPercentTone(value) {
  if (typeof value !== 'number') {
    return 'unknown';
  }
  if (value <= 0) {
    return 'zero';
  }
  return value < 55 ? 'low' : '';
}

function clampPercent(value) {
  if (typeof value !== 'number') {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function formatEpochSeconds(epochSeconds) {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds)) {
    return '';
  }

  return new Date(epochSeconds * 1000).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '';
  }

  const minutes = Math.round(seconds / 60);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const restMinutes = minutes % 60;
  const parts = [];

  if (days) {
    parts.push(`${days}天`);
  }
  if (hours) {
    parts.push(`${hours}小时`);
  }
  if (!days && restMinutes) {
    parts.push(`${restMinutes}分钟`);
  }

  return parts.join('') || '不到1分钟';
}

function formatResetText(runtime, prefix) {
  const resetAfter = getRuntimeValue(runtime, `${prefix}_reset_after_seconds`);
  const resetAt = getRuntimeValue(runtime, `${prefix}_reset_at`);
  const duration = formatDuration(resetAfter);
  const time = formatEpochSeconds(resetAt);

  if (duration && time) {
    return `窗口重置：约 ${duration}后 (${time})`;
  }
  if (time) {
    return `窗口重置：${time}`;
  }
  return '窗口重置：--';
}

function getQuotaHistory(runtime, view) {
  const rawHistory = Array.isArray(runtime?.[view.runtimeKey]) ? runtime[view.runtimeKey] : [];
  const cutoff = Date.now() - view.historyWindowMs;

  return rawHistory
    .map(sample => {
      const at = Number(sample && sample.at);
      const value = Number(sample && sample.remaining_percent);
      if (!Number.isFinite(at) || !Number.isFinite(value)) {
        return null;
      }

      return {
        at,
        value: Math.max(0, Math.min(100, value)),
      };
    })
    .filter(Boolean)
    .filter(sample => sample.at >= cutoff)
    .sort((left, right) => left.at - right.at);
}

function getPrimaryQuotaHistoryRange() {
  return PRIMARY_QUOTA_HISTORY_RANGES[quotaHistoryPrimaryRange] || PRIMARY_QUOTA_HISTORY_RANGES['5h'];
}

function getOverviewPrimaryQuotaHistoryRange() {
  return PRIMARY_QUOTA_HISTORY_RANGES[quotaOverviewPrimaryRange] || PRIMARY_QUOTA_HISTORY_RANGES['1h'];
}

function getQuotaHistoryDisplayWindow(mode, view) {
  if (mode === 'primary') {
    return getPrimaryQuotaHistoryRange().windowMs;
  }

  return view.displayWindowMs || view.historyWindowMs;
}

function getQuotaOverviewDisplayWindow(mode, view) {
  if (mode === 'primary') {
    return getOverviewPrimaryQuotaHistoryRange().windowMs;
  }

  return view.displayWindowMs || view.historyWindowMs;
}

function shouldShowQuotaHistoryDate(startTime, endTime, scale) {
  if (scale === 'week') {
    return true;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  return start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate();
}

function formatQuotaHistoryTime(timestamp, scale, options = {}) {
  if (scale === 'week') {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  if (options.withDate) {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatQuotaHistoryAxisTime(timestamp, scale, options = {}) {
  if (scale === 'week') {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    });
  }

  if (options.range === '1d') {
    const date = new Date(timestamp);
    const hourText = `${String(date.getHours()).padStart(2, '0')}:00`;

    if (date.getHours() === 0) {
      const dateText = date.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
      });
      return `${dateText}\n${hourText}`;
    }

    return hourText;
  }

  return formatQuotaHistoryTime(timestamp, scale, options);
}

function getHistoryTone(value) {
  if (value === null || !Number.isFinite(value)) {
    return 'unknown';
  }
  if (value <= 3) {
    return 'critical';
  }
  return value < 55 ? 'low' : 'healthy';
}
