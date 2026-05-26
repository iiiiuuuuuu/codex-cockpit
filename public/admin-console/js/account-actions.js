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
  setMessage('info', '配置项已彻底删除并热重载。');
}

async function markConfigDeleted(index) {
  snapshot = await requestJson(`/admin/api/configs/${index}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deleted_at: formatDateTimeInputValue(new Date()),
    }),
  });
  renderAll();
  setMessage('info', '账号已标记删除，不会再参与自动切换或请求转发。');
}

async function restoreDeletedConfig(index) {
  snapshot = await requestJson(`/admin/api/configs/${index}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deleted_at: null,
    }),
  });
  renderAll();
  setMessage('info', '账号删除标记已清除。');
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

function getDeleteModalAccountMeta(item) {
  if (!item) {
    return '';
  }

  const configItem = item.item || {};
  if (isApiKeyConfig(item)) {
    return configItem.base_url || maskSecret(configItem.apikey);
  }

  return configItem.description || configItem.account_id || '';
}

function setDeleteModalLoading(loading) {
  deleteModalSoftButton.disabled = loading;
  deleteModalHardButton.disabled = loading;
  deleteModalCancelButton.disabled = loading;
  deleteModalCloseButton.disabled = loading;
}

function setDeleteChoiceButton(button, title, note) {
  button.innerHTML = `
    <span class="delete-choice-title">${escapeHtml(title)}</span>
    <span class="delete-choice-note">${escapeHtml(note)}</span>
  `;
}

function closeDeleteModal() {
  deleteModalBackdrop.classList.remove('show');
  deleteModalBackdrop.hidden = true;
  deletingConfigIndex = null;
  deleteModalBackdrop.dataset.deleteMode = '';
  setDeleteModalLoading(false);
}

function openDeleteModal(index) {
  const item = findSnapshotConfig(index);
  if (!item) {
    setMessage('error', '未找到要删除的账号。');
    return;
  }

  const deleted = isDeletedConfig(item);
  deletingConfigIndex = item.index;
  deleteModalTitle.textContent = deleted ? '彻底删除账号' : '删除账号';
  deleteModalNote.textContent = deleted
    ? '这个账号已经有删除标记，再删除会从配置文件中移除。'
    : '先标记删除可以保留记录并停止使用；彻底删除会直接从配置文件移除。';
  deleteModalAccountName.textContent = getDisplayName(item);
  deleteModalAccountMeta.textContent = getDeleteModalAccountMeta(item);
  deleteModalBackdrop.dataset.deleteMode = deleted ? 'hard' : 'choice';
  deleteModalSoftButton.hidden = deleted;
  deleteModalSoftButton.className = 'delete-choice soft';
  deleteModalHardButton.className = 'delete-choice hard';
  setDeleteChoiceButton(deleteModalSoftButton, '标记删除', '保留记录，立即停止使用');
  setDeleteChoiceButton(
    deleteModalHardButton,
    deleted ? '彻底删除' : '直接彻底删除',
    '从配置文件移除，不能在页面恢复'
  );
  deleteModalBackdrop.hidden = false;
  deleteModalBackdrop.classList.add('show');
  window.setTimeout(() => {
    (deleted ? deleteModalHardButton : deleteModalSoftButton).focus();
  }, 0);
}

function openRestoreDeleteModal(index) {
  const item = findSnapshotConfig(index);
  if (!item) {
    setMessage('error', '未找到要恢复的账号。');
    return;
  }

  deletingConfigIndex = item.index;
  deleteModalTitle.textContent = '恢复账号';
  deleteModalNote.textContent = '恢复后会清除删除标记，这个账号可以重新参与手动切换和使用偏好选择。';
  deleteModalAccountName.textContent = getDisplayName(item);
  deleteModalAccountMeta.textContent = getDeleteModalAccountMeta(item);
  deleteModalBackdrop.dataset.deleteMode = 'restore';
  deleteModalSoftButton.hidden = true;
  deleteModalHardButton.className = 'delete-choice restore-confirm';
  setDeleteChoiceButton(deleteModalHardButton, '恢复账号', '清除删除标记，恢复后可重新使用');
  deleteModalBackdrop.hidden = false;
  deleteModalBackdrop.classList.add('show');
  window.setTimeout(() => {
    deleteModalHardButton.focus();
  }, 0);
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
