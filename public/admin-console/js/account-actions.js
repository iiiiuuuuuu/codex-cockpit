function moveIndexValue(values, draggedValue, targetValue, insertAfter) {
  const withoutDragged = values.filter(value => value !== draggedValue);
  const targetPosition = withoutDragged.indexOf(targetValue);
  if (targetPosition === -1) {
    return values;
  }

  const insertPosition = targetPosition + (insertAfter ? 1 : 0);
  withoutDragged.splice(insertPosition, 0, draggedValue);
  return withoutDragged;
}

function buildPersistedOrderFromVisibleNonActive(nonActiveIndexes) {
  const nonActiveQueue = [...nonActiveIndexes];
  return getConfiguredOrderAccounts().map(item => {
    if (item.is_active) {
      return item.index;
    }
    return nonActiveQueue.shift();
  }).filter(index => index !== undefined);
}

async function saveAccountSortOrder(nonActiveIndexes) {
  const orderedIndexes = buildPersistedOrderFromVisibleNonActive(nonActiveIndexes);
  snapshot = await requestJson('/admin/api/configs/order', {
    method: 'POST',
    body: JSON.stringify({
      ordered_indexes: orderedIndexes,
    }),
  });
  renderAll();
  setMessage('info', '展示顺序已保存。');
}

async function activateConfig(index) {
  snapshot = await requestJson(`/admin/api/configs/${index}/activate`, {
    method: 'POST',
  });
  renderAll();
  setMessage('info', '当前账号已临时切换。');
}

async function deleteConfig(index) {
  snapshot = await requestJson(`/admin/api/configs/${index}`, {
    method: 'DELETE',
  });
  renderAll();
  setMessage('info', '配置项已删除并热重载。');
}

function findSnapshotConfig(index) {
  const targetIndex = Number.parseInt(String(index), 10);
  return getManagedConfigs().find(item => item.index === targetIndex) || null;
}

function mergeSingleRefreshSnapshot(index, response) {
  const targetIndex = Number.parseInt(String(index), 10);
  const latestConfigs = Array.isArray(response?.configs) ? response.configs : [];
  const currentConfigs = getManagedConfigs();
  const refreshedConfig = latestConfigs.find(item => item.index === targetIndex);

  if (!currentConfigs.length || !refreshedConfig) {
    snapshot = response;
    return;
  }

  const activeIndex = response && Object.prototype.hasOwnProperty.call(response, 'active_config_index')
    ? response.active_config_index
    : snapshot?.active_config_index;
  const mergedConfigs = currentConfigs.map(item => {
    const latestItem = latestConfigs.find(nextItem => nextItem.index === item.index);
    if (item.index === targetIndex) {
      return refreshedConfig;
    }
    if (!latestItem) {
      return item;
    }
    return {
      ...item,
      is_active: latestItem.is_active,
    };
  });

  snapshot = {
    ...snapshot,
    ...response,
    active_config_index: activeIndex,
    configs: mergedConfigs,
  };
}

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function refreshSingleConfigWithRetry(index, options = {}) {
  const { maxAttempts = 3 } = options;
  let attempt = 0;
  let target = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const response = await requestJson(`/admin/api/configs/${index}/refresh`, {
      method: 'POST',
    });
    mergeSingleRefreshSnapshot(index, response);
    target = findSnapshotConfig(index);
    renderAll();

    if (!target || !isRetryableNetworkProblem(target) || attempt >= maxAttempts) {
      break;
    }

    setMessage('info', `此账号网络异常，正在第 ${attempt + 1} 次重试刷新...`);
    await delay(500);
  }

  return {
    attempts: attempt,
    target,
  };
}

function setButtonLoading(button, loading) {
  if (!button) {
    return;
  }

  button.disabled = loading;
  button.classList.toggle('is-loading', loading);
  button.setAttribute('aria-busy', loading ? 'true' : 'false');
}

async function openExternalLink(url) {
  try {
    await requestJson('/admin/api/open-external', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  } catch (error) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.href = url;
    }
  }
}

function confirmDeleteAction(message) {
  return window.confirm(`${message} 点击“确定”就可以。`);
}
