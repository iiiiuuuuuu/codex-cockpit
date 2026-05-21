const DEFAULT_SETTINGS = {
  baseUrl: 'http://127.0.0.1:3009',
  authToken: '',
  repoPath: '/Users/liujingping137365/workspace/ai-cockpit',
};

const els = {
  baseUrlInput: document.querySelector('#baseUrlInput'),
  authTokenInput: document.querySelector('#authTokenInput'),
  repoPathInput: document.querySelector('#repoPathInput'),
  saveBtn: document.querySelector('#saveBtn'),
  openAdminBtn: document.querySelector('#openAdminBtn'),
  checkBtn: document.querySelector('#checkBtn'),
  refreshBtn: document.querySelector('#refreshBtn'),
  logsBtn: document.querySelector('#logsBtn'),
  startBtn: document.querySelector('#startBtn'),
  restartBtn: document.querySelector('#restartBtn'),
  stopBtn: document.querySelector('#stopBtn'),
  copyRestartBtn: document.querySelector('#copyRestartBtn'),
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  activeAccountText: document.querySelector('#activeAccountText'),
  activeAccountMeta: document.querySelector('#activeAccountMeta'),
  quotaText: document.querySelector('#quotaText'),
  quotaMeta: document.querySelector('#quotaMeta'),
  message: document.querySelector('#message'),
  logPanel: document.querySelector('#logPanel'),
  output: document.querySelector('#output'),
};

let serviceRunning = null;

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_SETTINGS.baseUrl).trim().replace(/\/+$/, '');
}

function normalizeSettings(raw = {}) {
  return {
    baseUrl: normalizeBaseUrl(raw.baseUrl),
    authToken: String(raw.authToken || '').trim(),
    repoPath: String(raw.repoPath || DEFAULT_SETTINGS.repoPath).trim(),
  };
}

function getFormSettings() {
  return normalizeSettings({
    baseUrl: els.baseUrlInput.value,
    authToken: els.authTokenInput.value,
    repoPath: els.repoPathInput.value,
  });
}

function fillForm(settings) {
  els.baseUrlInput.value = settings.baseUrl;
  els.authTokenInput.value = settings.authToken;
  els.repoPathInput.value = settings.repoPath;
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return normalizeSettings(saved);
}

async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
}

async function getSettingsFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    return null;
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch (error) {
    return null;
  }

  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.startsWith('/admin/')) {
    return null;
  }

  const authToken = url.searchParams.get('auth_token') || '';
  return normalizeSettings({
    baseUrl: `${url.protocol}//${url.host}`,
    authToken,
  });
}

function setMessage(text, tone = '') {
  els.message.textContent = text || '';
  els.message.className = `message${tone ? ` ${tone}` : ''}`;
}

function setStatus(ok, text) {
  els.statusDot.className = `status-dot${ok === true ? ' ok' : ok === false ? ' bad' : ''}`;
  els.statusText.textContent = text;
}

function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return `${Math.round(value)}%`;
}

function getShortId(value) {
  const text = String(value || '').trim();
  if (text.length <= 18) {
    return text;
  }

  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function setServiceRunning(running) {
  serviceRunning = running;
  els.startBtn.disabled = running === true;
  els.stopBtn.disabled = running === false;
  els.openAdminBtn.disabled = running === false;
  els.refreshBtn.disabled = running === false;
  els.logsBtn.disabled = running === false;
}

function setLogsVisible(visible) {
  els.logsBtn.textContent = visible ? '收起日志' : '查看日志';
}

async function withBusy(button, busyText, task) {
  const originalText = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = busyText;

  try {
    return await task();
  } finally {
    if (button === els.logsBtn) {
      setLogsVisible(!els.logPanel.hidden && els.logPanel.open);
    } else {
      button.textContent = originalText;
    }
    button.removeAttribute('aria-busy');
    if (button === els.startBtn && serviceRunning === true) {
      button.disabled = true;
    } else if (button === els.stopBtn && serviceRunning === false) {
      button.disabled = true;
    } else if ([els.openAdminBtn, els.refreshBtn, els.logsBtn].includes(button) && serviceRunning === false) {
      button.disabled = true;
    } else {
      button.disabled = false;
    }
  }
}

function buildUrl(settings, path) {
  const url = new URL(path, `${settings.baseUrl}/`);
  if (settings.authToken) {
    url.searchParams.set('auth_token', settings.authToken);
  }
  return url.toString();
}

async function requestJson(settings, path, options = {}) {
  if (!settings.authToken) {
    throw new Error('请先填写管理 auth_token');
  }

  const response = await fetch(buildUrl(settings, path), {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.message || payload.details || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function renderSnapshot(snapshot) {
  const active = Array.isArray(snapshot.configs)
    ? snapshot.configs.find(item => item.is_active)
    : null;
  const runtime = active && active.runtime;
  const accountName = active?.item?.description || runtime?.label || runtime?.description || '-';
  const accountId = active?.item?.account_id || runtime?.description || '';
  const primaryQuota = formatPercent(runtime?.primary_remaining_percent ?? runtime?.remaining_percent);
  const weeklyQuota = formatPercent(runtime?.secondary_remaining_percent);

  setStatus(true, `运行中 :${snapshot.runtime_port || '-'}`);
  setServiceRunning(true);
  els.activeAccountText.textContent = accountName;
  els.activeAccountMeta.textContent = accountId ? `ID ${getShortId(accountId)}` : '-';
  els.quotaText.textContent = `主额度 ${primaryQuota} · 周额度 ${weeklyQuota}`;
  els.quotaMeta.textContent = runtime?.reason ? `状态 ${runtime.reason}` : '状态正常';
}

async function checkStatus() {
  const settings = getFormSettings();
  setMessage('正在检查状态...');
  try {
    const snapshot = await requestJson(settings, '/admin/api/configs');
    renderSnapshot(snapshot);
    setMessage(`状态已更新：运行中 :${snapshot.runtime_port || '-'}`, 'ok');
  } catch (error) {
    setStatus(false, '不可用');
    setServiceRunning(false);
    els.activeAccountText.textContent = '-';
    els.activeAccountMeta.textContent = '-';
    els.quotaText.textContent = '-';
    els.quotaMeta.textContent = '-';
    setMessage(error.message || String(error), 'error');
  }
}

async function openAdmin() {
  const settings = getFormSettings();
  await saveSettings(settings);
  if (!settings.authToken) {
    setMessage('请先填写管理 auth_token', 'warn');
    return;
  }
  await chrome.tabs.create({ url: buildUrl(settings, '/admin/configs/v2') });
}

async function refreshQuotas() {
  const settings = getFormSettings();
  try {
    setMessage('正在刷新额度...');
    const snapshot = await requestJson(settings, '/admin/api/configs/refresh', { method: 'POST' });
    renderSnapshot(snapshot);
    setMessage('额度已刷新');
  } catch (error) {
    setMessage(error.message || String(error), 'error');
  }
}

async function showLogs() {
  const settings = getFormSettings();
  if (!els.logPanel.hidden && els.logPanel.open) {
    els.logPanel.open = false;
    setLogsVisible(false);
    return;
  }

  try {
    setMessage('正在读取日志...');
    const payload = await requestJson(settings, '/admin/api/logs?limit=80');
    els.output.textContent = payload.content || '暂无日志';
    els.logPanel.hidden = false;
    els.logPanel.open = true;
    setLogsVisible(true);
    requestAnimationFrame(() => {
      els.output.scrollTop = els.output.scrollHeight;
    });
    setMessage('已读取最近日志');
  } catch (error) {
    setMessage(error.message || String(error), 'error');
  }
}

async function runNative(action) {
  const settings = getFormSettings();
  await saveSettings(settings);
  setMessage(`正在${action === 'start' ? '启动' : action === 'restart' ? '重启' : '停止'}...`);

  if (typeof chrome.runtime.sendNativeMessage !== 'function') {
    throw new Error('当前插件没有 nativeMessaging 权限，请在 chrome://extensions/ 里点击本插件的重新加载按钮；如果重新加载后扩展 ID 变化，请重新运行 native/Install.command');
  }

  const response = await chrome.runtime.sendNativeMessage('com.ai_cockpit.control', {
    action,
    repoPath: settings.repoPath,
  });

  if (!response || response.ok !== true) {
    const details = response?.stderr || response?.stdout || response?.error || 'Native host 未返回成功';
    throw new Error(details);
  }

  setMessage(response.stdout || '操作完成');
  if (action === 'stop') {
    setStatus(false, '已停止');
    setServiceRunning(false);
    els.activeAccountText.textContent = '-';
    els.activeAccountMeta.textContent = '-';
    els.quotaText.textContent = '-';
    els.quotaMeta.textContent = '-';
    return;
  }
  window.setTimeout(checkStatus, 800);
}

async function runNativeAction(action) {
  try {
    await runNative(action);
  } catch (error) {
    setMessage(`${error.message || String(error)}。如果提示找不到本地宿主，请运行 extensions/chrome/native/Install.command。`, 'error');
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function copyCommand(command) {
  const settings = getFormSettings();
  const fullCommand = `cd ${shellQuote(settings.repoPath)} && ${command}`;
  await navigator.clipboard.writeText(fullCommand);
  setMessage('命令已复制，粘到终端执行即可');
}

async function initialize() {
  let settings = await loadSettings();
  const tabSettings = await getSettingsFromActiveTab();
  if (tabSettings?.authToken) {
    settings = normalizeSettings({
      ...settings,
      baseUrl: tabSettings.baseUrl,
      authToken: tabSettings.authToken,
    });
    await saveSettings(settings);
  }

  fillForm(settings);
  setStatus(null, '未检查');
  setServiceRunning(null);
  setLogsVisible(false);
  els.saveBtn.addEventListener('click', async () => {
    await saveSettings(getFormSettings());
    setMessage('配置已保存');
  });
  els.openAdminBtn.addEventListener('click', openAdmin);
  els.checkBtn.addEventListener('click', () => withBusy(els.checkBtn, '检查中...', checkStatus));
  els.refreshBtn.addEventListener('click', () => withBusy(els.refreshBtn, '刷新中...', refreshQuotas));
  els.logsBtn.addEventListener('click', () => withBusy(els.logsBtn, '读取中...', showLogs));
  els.startBtn.addEventListener('click', () => withBusy(els.startBtn, '启动中...', () => runNativeAction('start')));
  els.restartBtn.addEventListener('click', () => withBusy(els.restartBtn, '重启中...', () => runNativeAction('restart')));
  els.stopBtn.addEventListener('click', () => withBusy(els.stopBtn, '停止中...', () => runNativeAction('stop')));
  els.copyRestartBtn.addEventListener('click', () => copyCommand('npm run restart'));
  await checkStatus();
}

initialize().catch(error => {
  setStatus(false, '初始化失败');
  setMessage(error.message || String(error), 'error');
});
