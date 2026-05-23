const routingPreferenceMeta = {
  token_first: {
    label: 'Token 优先',
    note: 'Token 可用时优先使用，Token 不可用时回退到 API Key。',
  },
  apikey_first: {
    label: 'API Key 优先',
    note: 'API Key 可用时优先使用，Token 作为兜底。',
  },
  token_only: {
    label: '仅 Token',
    note: '只允许 Token 账号参与自动切换。',
  },
  apikey_only: {
    label: '仅 API Key',
    note: '只允许 API Key 账号参与自动切换。',
  },
};
const codexSpeedModeMeta = {
  standard: {
    label: '标准',
    message: 'Codex 速度模式已切换为标准。',
  },
  fast: {
    label: 'Fast',
    message: 'Codex 速度模式已切换为 Fast。',
  },
};

function getRoutingPreferenceValue(data) {
  const preference = data && typeof data.routing_preference === 'string'
    ? data.routing_preference
    : 'token_first';
  return routingPreferenceMeta[preference] ? preference : 'token_first';
}

function setRoutingPreferenceDraft(preference) {
  routingPreferenceDraft = routingPreferenceMeta[preference] ? preference : 'token_first';
  routingPreferenceModalButtons.forEach(button => {
    const active = button.dataset.routingPreference === routingPreferenceDraft;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  routingPreferenceModalNote.textContent = routingPreferenceMeta[routingPreferenceDraft].note;
}

function renderRoutingPreference(data) {
  const preference = getRoutingPreferenceValue(data);
  routingPreferenceCurrent.textContent = routingPreferenceMeta[preference].label;
  setRoutingPreferenceDraft(preference);
}

function getCodexSpeedModeValue(data) {
  const mode = data?.responses && typeof data.responses.codex_speed_mode === 'string'
    ? data.responses.codex_speed_mode
    : 'standard';
  return codexSpeedModeMeta[mode] ? mode : 'standard';
}

function renderCodexSpeedMode(data) {
  const mode = getCodexSpeedModeValue(data);
  codexSpeedModeButtons.forEach(button => {
    const active = button.dataset.codexSpeedMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.disabled = codexSpeedModeSaving;
  });
}

function renderAll() {
  const apikeys = Array.isArray(snapshot?.apikeys) ? snapshot.apikeys : [];
  renderAccountLayoutControls();
  renderAccounts();
  refreshQuotaHistoryPopover();
  refreshQuotaOverviewModal();
  renderApiKeys(apikeys);
  renderProxySettings(snapshot || {});
  renderRoutingPreference(snapshot || {});
  renderCodexSpeedMode(snapshot || {});
  rawJsonInput.placeholder = getConfigGuideContent(snapshot || {}).rawJsonPlaceholder;
}

function scrollLogsToBottom() {
  window.requestAnimationFrame(() => {
    logsOutput.scrollTop = logsOutput.scrollHeight;
  });
}

function renderLogs(snapshot) {
  const content = snapshot && typeof snapshot.content === 'string' ? snapshot.content : '';
  const lineCount = Number.isFinite(snapshot?.lineCount) ? snapshot.lineCount : 0;
  const limit = Number.isFinite(snapshot?.limit) ? snapshot.limit : LOGS_REFRESH_LIMIT;
  const exists = Boolean(snapshot?.exists);
  const truncated = Boolean(snapshot?.truncated);
  const fileLabel = snapshot && typeof snapshot.path === 'string' ? snapshot.path : 'openai.log';

  logsOutput.textContent = content || (exists ? '日志文件为空。' : '未找到日志文件。');
  logsOutput.classList.toggle('empty', !content);
  logsMeta.textContent = content
    ? `${fileLabel} · 最近 ${lineCount} 行${truncated ? `（最多 ${limit} 行）` : ''}`
    : `${fileLabel} · ${exists ? '文件存在但暂无内容' : '日志文件暂未生成'}`;
  scrollLogsToBottom();
}

async function loadLogs(options = {}) {
  if (logsRequestInFlight && !options.force) {
    return;
  }

  logsRequestInFlight = true;
  refreshLogsButton.disabled = true;

  try {
    const result = await requestJson(`/admin/api/logs?limit=${LOGS_REFRESH_LIMIT}`);
    renderLogs(result || {});
    if (options.message) {
      setMessage('info', options.message);
    }
  } catch (error) {
    logsOutput.textContent = error.message;
    logsOutput.classList.add('empty');
    logsMeta.textContent = '日志读取失败';
    scrollLogsToBottom();
    if (!options.silent) {
      setMessage('error', error.message);
    }
  } finally {
    logsRequestInFlight = false;
    refreshLogsButton.disabled = false;
  }
}

function startLogsPolling() {
  if (logsPollTimer) {
    window.clearInterval(logsPollTimer);
  }

  logsPollTimer = window.setInterval(() => {
    const logsSection = document.getElementById('logsSection');
    if (!logsSection || !logsSection.classList.contains('active')) {
      return;
    }

    void loadLogs({ silent: true, force: true });
  }, LOGS_POLL_INTERVAL_MS);
}

function closeAliasModal() {
  aliasModalBackdrop.classList.remove('show');
  aliasModalBackdrop.hidden = true;
  editingAliasIndex = null;
  aliasInput.value = '';
  accountPriceInput.value = '';
  accountStartedAtInput.value = '';
}

function closeRoutingPreferenceModal() {
  routingPreferenceModalBackdrop.classList.remove('show');
  routingPreferenceModalBackdrop.hidden = true;
}

function openRoutingPreferenceModal() {
  setRoutingPreferenceDraft(getRoutingPreferenceValue(snapshot || {}));
  routingPreferenceModalBackdrop.hidden = false;
  routingPreferenceModalBackdrop.classList.add('show');
  window.setTimeout(() => {
    const activeButton = routingPreferenceModalButtons.find(button => button.classList.contains('active'));
    if (activeButton) {
      activeButton.focus();
    }
  }, 0);
}

function openAliasModal(index) {
  const item = findSnapshotConfig(index);
  if (!item) {
    setMessage('error', '未找到要编辑的账号。');
    return;
  }

  const details = getAliasModalDetails(item);
  editingAliasIndex = item.index;
  aliasModalNote.textContent = details.note;
  aliasSourceLabel.textContent = details.sourceLabel;
  aliasSourceValue.textContent = details.sourceValue;
  aliasIdLabel.textContent = details.idLabel;
  aliasIdValue.textContent = details.idValue;
  aliasInput.value = details.aliasValue;
  accountPriceInput.value = details.priceValue === '' ? '' : String(details.priceValue);
  accountStartedAtInput.value = details.startedAtValue;
  aliasModalBackdrop.hidden = false;
  aliasModalBackdrop.classList.add('show');
  window.setTimeout(() => {
    aliasInput.focus();
    aliasInput.select();
  }, 0);
}

async function saveAlias() {
  if (!Number.isInteger(editingAliasIndex)) {
    return;
  }

  const rawPrice = accountPriceInput.value.trim();
  if (rawPrice && !/^\d+(\.\d{1,2})?$/.test(rawPrice)) {
    setMessage('error', '金额必须是非负数字，最多保留 2 位小数。');
    return;
  }
  const rawStartedAt = accountStartedAtInput.value.trim();

  aliasModalSaveButton.disabled = true;
  try {
    snapshot = await requestJson(`/admin/api/configs/${editingAliasIndex}`, {
      method: 'PATCH',
      body: JSON.stringify({
        alias: aliasInput.value.trim(),
        price_yuan: rawPrice ? Number(rawPrice) : null,
        started_at: rawStartedAt || null,
      }),
    });
    renderAll();
    closeAliasModal();
    setMessage('info', '账号信息已保存。');
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    aliasModalSaveButton.disabled = false;
  }
}

async function toggleAutoSwitch(index, disabled) {
  snapshot = await requestJson(`/admin/api/configs/${index}`, {
    method: 'PATCH',
    body: JSON.stringify({
      auto_switch_disabled: disabled,
    }),
  });
  renderAll();
  setMessage('info', disabled ? '已禁止自动切换到该账号。' : '已允许自动切换到该账号。');
}

function getSelectedConfigMode() {
  const selected = configModeButtons.find(button => button.classList.contains('active'));
  return selected ? selected.dataset.configMode : 'token';
}

function updateConfigMode(mode) {
  const nextMode = mode === 'apikey' ? 'apikey' : 'token';
  configModeButtons.forEach(button => {
    const active = button.dataset.configMode === nextMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  tokenConfigPanel.hidden = nextMode !== 'token';
  apiKeyConfigPanel.hidden = nextMode !== 'apikey';
  addConfigModeTitle.textContent = nextMode === 'token' ? 'Token 模式' : 'API Key 模式';
}

function getSelectedApiKeySupport() {
  return [...document.querySelectorAll('input[name="apiKeySupport"]:checked')]
    .map(input => input.value);
}

function clearConfigForm() {
  rawJsonInput.value = '';
  apiKeyBaseUrlInput.value = '';
  apiKeyInput.value = '';
  apiKeyDescriptionInput.value = '';
  usageStartInput.value = getCurrentDateTimeInputValue();
  document.querySelectorAll('input[name="apiKeySupport"]').forEach(input => {
    input.checked = input.value === 'gpt';
  });
}

async function loadSnapshot(message = '', options = {}) {
  const silent = Boolean(options.silent);
  const background = Boolean(options.background);

  try {
    const request = buildConfigSnapshotRequest(Boolean(options.forceRefresh));
    snapshot = await requestJson(request.url, request.options);
    renderAll();
    if (message) {
      setMessage('info', message);
    } else if (!silent) {
      setMessage('', '');
    }
  } catch (error) {
    if (background && error.status !== 401) {
      return;
    }

    if (error.status === 401) {
      setMessage('error', '当前管理地址缺少或带错 auth_token，请重新使用正确的管理后台链接访问。', { persist: true });
      accountsGrid.innerHTML = '<div class="empty">当前管理地址缺少或带错 auth_token。</div>';
      return;
    }

    setMessage('error', error.message);
    accountsGrid.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function startSnapshotPolling() {
  if (snapshotPollTimer) {
    window.clearInterval(snapshotPollTimer);
  }

  snapshotPollTimer = window.setInterval(() => {
    if (!aliasModalBackdrop.hidden) {
      return;
    }

    loadSnapshot('', {
      silent: true,
      background: true,
    });
  }, SNAPSHOT_POLL_INTERVAL_MS);
}

function buildConfigItemFromInput() {
  return buildConfigItemFromForm({
    mode: getSelectedConfigMode(),
    tokenRawJson: rawJsonInput.value,
    apiKey: apiKeyInput.value,
    baseUrl: apiKeyBaseUrlInput.value,
    description: apiKeyDescriptionInput.value,
    support: getSelectedApiKeySupport(),
    startedAt: usageStartInput.value,
  });
}

async function addConfig() {
  const mode = getSelectedConfigMode();
  const configItem = buildConfigItemFromInput();
  snapshot = await requestJson('/admin/api/configs', {
    method: 'POST',
    body: JSON.stringify({
      config_type: mode,
      raw_json: JSON.stringify(configItem),
    }),
  });

  clearConfigForm();
  renderAll();
  switchSection('accountsSection');
  setMessage('info', mode === 'token' ? 'Codex 账号已写入配置文件。' : 'API Key 上游已写入配置文件。');
}

async function addApiKey() {
  const result = await requestJson('/admin/api/apikeys', {
    method: 'POST',
  });

  snapshot = result;
  renderAll();
  setMessage('info', `已新增 apikey: ${result.generated_apikey}`);
}

async function deleteApiKey(index) {
  snapshot = await requestJson(`/admin/api/apikeys/${index}`, {
    method: 'DELETE',
  });
  renderAll();
  setMessage('info', 'apikey 已删除。');
}

function readPortSettingsFromInputs() {
  const port = normalizePortValue(servicePortInput.value);
  if (!port) {
    throw new Error('服务端口必须是 1-65535 之间的数字');
  }

  const rawProxyPort = proxyPortInput.value.trim();
  const proxyPort = rawProxyPort ? normalizePortValue(rawProxyPort) : null;
  if (rawProxyPort && !proxyPort) {
    throw new Error('代理端口必须是 1-65535 之间的数字，或留空');
  }

  return {
    port,
    proxy_port: proxyPort,
  };
}

async function saveProxySettings() {
  const result = await requestJson('/admin/api/settings', {
    method: 'POST',
    body: JSON.stringify(readPortSettingsFromInputs()),
  });

  snapshot = result;
  renderAll();

  const networkSettings = result && result.network_settings ? result.network_settings : {};
  if (networkSettings.port_changed && networkSettings.next_port) {
    setMessage('info', `端口配置已即时生效，正在跳转到 localhost:${networkSettings.next_port}。`);
    window.setTimeout(() => {
      const nextUrl = new URL(window.location.href);
      nextUrl.port = String(networkSettings.next_port);
      window.location.href = nextUrl.toString();
    }, 700);
    return;
  }

  setMessage('info', '端口配置已保存并即时生效。');
}

async function saveRoutingPreference() {
  const result = await requestJson('/admin/api/settings', {
    method: 'POST',
    body: JSON.stringify({
      routing_preference: routingPreferenceDraft,
    }),
  });

  snapshot = result;
  renderAll();
  closeRoutingPreferenceModal();
  setMessage('info', '使用偏好已保存，账号选择已按新规则校正。');
}

async function saveCodexSpeedMode(mode) {
  if (!codexSpeedModeMeta[mode] || mode === getCodexSpeedModeValue(snapshot || {}) || codexSpeedModeSaving) {
    return;
  }

  codexSpeedModeSaving = true;
  renderCodexSpeedMode(snapshot || {});
  try {
    const result = await requestJson('/admin/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        responses: {
          codex_speed_mode: mode,
        },
      }),
    });

    snapshot = result;
    renderAll();
    setMessage('info', codexSpeedModeMeta[mode].message);
  } finally {
    codexSpeedModeSaving = false;
    renderCodexSpeedMode(snapshot || {});
  }
}
