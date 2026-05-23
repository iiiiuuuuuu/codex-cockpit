document.querySelectorAll('[data-section-target]').forEach(button => {
  button.addEventListener('click', () => switchSection(button.dataset.sectionTarget));
});

document.querySelectorAll('[data-jump-section]').forEach(button => {
  button.addEventListener('click', () => switchSection(button.dataset.jumpSection));
});

document.querySelectorAll('[data-open-external]').forEach(button => {
  button.addEventListener('click', async () => openExternalLink(button.dataset.openExternal));
});

configModeButtons.forEach(button => {
  button.addEventListener('click', () => updateConfigMode(button.dataset.configMode));
});

addConfigButton.addEventListener('click', async () => {
  addConfigButton.disabled = true;
  try {
    await addConfig();
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    addConfigButton.disabled = false;
  }
});

clearConfigButton.addEventListener('click', () => {
  clearConfigForm();
  setMessage('', '');
});

addApiKeyButton.addEventListener('click', async () => {
  addApiKeyButton.disabled = true;
  try {
    await addApiKey();
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    addApiKeyButton.disabled = false;
  }
});

saveProxySettingsButton.addEventListener('click', async () => {
  saveProxySettingsButton.disabled = true;
  try {
    await saveProxySettings();
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    saveProxySettingsButton.disabled = false;
  }
});

refreshLogsButton.addEventListener('click', () => {
  void loadLogs({
    force: true,
    message: '日志已刷新。',
  });
});

editRoutingPreferenceButton.addEventListener('click', () => {
  openRoutingPreferenceModal();
});

quotaOverviewButton.addEventListener('click', () => {
  openQuotaOverviewModal();
});

routingPreferenceModalButtons.forEach(button => {
  button.addEventListener('click', () => {
    setRoutingPreferenceDraft(button.dataset.routingPreference);
  });
});

codexSpeedModeButtons.forEach(button => {
  button.addEventListener('click', async () => {
    try {
      await saveCodexSpeedMode(button.dataset.codexSpeedMode);
    } catch (error) {
      setMessage('error', error.message);
    }
  });
});

accountLayoutMenuButton.addEventListener('click', () => {
  setAccountLayoutMenuOpen(accountLayoutMenu.hidden);
});

accountGridColumnButtons.forEach(button => {
  button.addEventListener('click', () => {
    setAccountGridColumns(button.dataset.accountGridColumns);
    closeAccountLayoutMenu();
  });
});

aliasModalBackdrop.addEventListener('click', event => {
  if (event.target === aliasModalBackdrop) {
    closeAliasModal();
  }
});

routingPreferenceModalBackdrop.addEventListener('click', event => {
  if (event.target === routingPreferenceModalBackdrop) {
    closeRoutingPreferenceModal();
  }
});

quotaOverviewModalBackdrop.addEventListener('click', event => {
  if (event.target === quotaOverviewModalBackdrop) {
    closeQuotaOverviewModal();
  }
});

aliasModalCloseButton.addEventListener('click', closeAliasModal);
aliasModalCancelButton.addEventListener('click', closeAliasModal);
aliasModalSaveButton.addEventListener('click', saveAlias);
quotaOverviewModalCloseButton.addEventListener('click', closeQuotaOverviewModal);
routingPreferenceModalCloseButton.addEventListener('click', closeRoutingPreferenceModal);
routingPreferenceModalCancelButton.addEventListener('click', closeRoutingPreferenceModal);
routingPreferenceModalSaveButton.addEventListener('click', async () => {
  routingPreferenceModalSaveButton.disabled = true;
  try {
    await saveRoutingPreference();
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    routingPreferenceModalSaveButton.disabled = false;
  }
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && (!aliasModalBackdrop.hidden || !routingPreferenceModalBackdrop.hidden || !quotaOverviewModalBackdrop.hidden || !quotaHistoryPopover.hidden || !accountLayoutMenu.hidden)) {
    closeAliasModal();
    closeRoutingPreferenceModal();
    closeQuotaOverviewModal();
    closeQuotaHistoryPopover();
    closeAccountLayoutMenu();
  }
});

document.addEventListener('click', event => {
  if (!accountLayoutMenu.hidden && !event.target.closest('.account-layout-bar')) {
    closeAccountLayoutMenu();
  }

  if (
    quotaHistoryPopover.hidden ||
    quotaHistoryPopover.contains(event.target) ||
    event.target.closest('[data-action="quota-history"]')
  ) {
    return;
  }

  closeQuotaHistoryPopover();
});

quotaHistoryPopover.addEventListener('click', event => {
  event.stopPropagation();

  const closeButton = event.target.closest('[data-action="close-quota-history"]');
  if (closeButton) {
    closeQuotaHistoryPopover();
    return;
  }

  const modeButton = event.target.closest('[data-action="quota-history-mode"]');
  if (modeButton) {
    const nextMode = modeButton.dataset.mode;
    if (!QUOTA_HISTORY_VIEWS[nextMode] || nextMode === quotaHistoryPopoverMode) {
      return;
    }

    const item = findSnapshotConfig(quotaHistoryPopoverIndex);
    if (!item) {
      return;
    }

    quotaHistoryPopoverMode = nextMode;
    destroyQuotaHistoryChart();
    quotaHistoryPopover.innerHTML = renderQuotaHistoryPopoverContent(item);
    bindQuotaHistoryPopoverInteractions();
    return;
  }

  const rangeButton = event.target.closest('[data-action="quota-history-range"]');
  if (rangeButton) {
    const nextRange = rangeButton.dataset.range;
    if (!PRIMARY_QUOTA_HISTORY_RANGES[nextRange] || nextRange === quotaHistoryPrimaryRange) {
      return;
    }

    const item = findSnapshotConfig(quotaHistoryPopoverIndex);
    if (!item) {
      return;
    }

    quotaHistoryPrimaryRange = nextRange;
    destroyQuotaHistoryChart();
    quotaHistoryPopover.innerHTML = renderQuotaHistoryPopoverContent(item);
    bindQuotaHistoryPopoverInteractions();
  }
});

quotaOverviewModalBody.addEventListener('click', event => {
  const modeButton = event.target.closest('[data-action="quota-overview-mode"]');
  if (modeButton) {
    const nextMode = modeButton.dataset.mode;
    if (!QUOTA_HISTORY_VIEWS[nextMode] || nextMode === quotaOverviewMode) {
      return;
    }

    quotaOverviewMode = nextMode;
    destroyQuotaOverviewChart();
    quotaOverviewModalBody.innerHTML = renderQuotaOverview();
    bindQuotaOverviewModalInteractions();
    return;
  }

  const rangeButton = event.target.closest('[data-action="quota-overview-range"]');
  if (rangeButton) {
    const nextRange = rangeButton.dataset.range;
    if (!PRIMARY_QUOTA_HISTORY_RANGES[nextRange] || nextRange === quotaOverviewPrimaryRange) {
      return;
    }

    quotaOverviewPrimaryRange = nextRange;
    destroyQuotaOverviewChart();
    quotaOverviewModalBody.innerHTML = renderQuotaOverview();
    bindQuotaOverviewModalInteractions();
  }
});

window.addEventListener('resize', closeQuotaHistoryPopover);
window.addEventListener('scroll', closeQuotaHistoryPopover, true);

accountsGrid.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  if (action === 'quota-history') {
    event.stopPropagation();
    openQuotaHistoryPopover(button.dataset.index, button, button.dataset.historyMode);
    return;
  }

  button.disabled = true;
  try {
    if (action === 'activate') {
      await activateConfig(button.dataset.index);
      return;
    }
    if (action === 'edit') {
      openAliasModal(button.dataset.index);
      return;
    }
    if (action === 'refresh') {
      setButtonLoading(button, true);
      const result = await refreshSingleConfigWithRetry(button.dataset.index);
      const target = result.target;
      const retryText = result.attempts > 1 ? ` 已重试 ${result.attempts - 1} 次。` : '';
      if (target && target.runtime?.available === false) {
        const reason = getUnavailableReasonText(target, getHealthText(target), getRuntimeError(target.runtime, target));
        setMessage('error', `仅刷新此账号完成：账号不可用，${reason}。${retryText}`);
      } else {
        setMessage('info', `仅刷新此账号完成：账号可用。${retryText}`);
      }
      return;
    }
    if (action === 'toggle-auto-switch') {
      const disabled = button.dataset.autoSwitchDisabled !== 'true';
      await toggleAutoSwitch(button.dataset.index, disabled);
      return;
    }
    if (action === 'delete') {
      if (!confirmDeleteAction('确认删除这个配置项吗？')) {
        return;
      }
      await deleteConfig(button.dataset.index);
    }
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    setButtonLoading(button, false);
  }
});

accountsGrid.addEventListener('dragstart', event => {
  const interactiveTarget = event.target.closest('button, input, textarea, select, a, [data-action]');
  const card = event.target.closest('[data-account-card]');
  if (interactiveTarget) {
    event.preventDefault();
    return;
  }
  if (!card || card.dataset.draggableAccount !== 'true') {
    event.preventDefault();
    return;
  }

  draggedAccountIndex = Number(card.dataset.index);
  card.classList.add('dragging');
  accountsGrid.classList.add('drag-active');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(draggedAccountIndex));
});

accountsGrid.addEventListener('dragover', event => {
  const card = event.target.closest('[data-account-card]');
  if (!card || card.dataset.draggableAccount !== 'true' || draggedAccountIndex === null || Number(card.dataset.index) === draggedAccountIndex) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const rect = card.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2 || event.clientX > rect.left + rect.width / 2;
  document.querySelectorAll('[data-account-card].drag-over').forEach(item => {
    if (item !== card) {
      item.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
    }
  });
  card.classList.add('drag-over');
  card.classList.toggle('drag-over-before', !insertAfter);
  card.classList.toggle('drag-over-after', insertAfter);
});

accountsGrid.addEventListener('dragleave', event => {
  const card = event.target.closest('[data-account-card]');
  if (card && !card.contains(event.relatedTarget)) {
    card.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
  }
});

accountsGrid.addEventListener('drop', async event => {
  const card = event.target.closest('[data-account-card]');
  if (!card || card.dataset.draggableAccount !== 'true' || draggedAccountIndex === null) {
    return;
  }

  event.preventDefault();
  const targetIndex = Number(card.dataset.index);
  if (targetIndex === draggedAccountIndex) {
    return;
  }

  const rect = card.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2 || event.clientX > rect.left + rect.width / 2;
  const nonActiveIndexes = getVisibleAccounts()
    .filter(item => !item.is_active)
    .map(item => item.index);
  const nextNonActiveIndexes = moveIndexValue(nonActiveIndexes, draggedAccountIndex, targetIndex, insertAfter);
  try {
    await saveAccountSortOrder(nextNonActiveIndexes);
  } catch (error) {
    setMessage('error', error.message);
  }
});

accountsGrid.addEventListener('dragend', () => {
  draggedAccountIndex = null;
  accountsGrid.classList.remove('drag-active');
  document.querySelectorAll('[data-account-card].dragging, [data-account-card].drag-over, [data-account-card].drag-over-before, [data-account-card].drag-over-after').forEach(card => {
    card.classList.remove('dragging', 'drag-over', 'drag-over-before', 'drag-over-after');
  });
});

apiKeysListEl.addEventListener('click', async event => {
  const button = event.target.closest('[data-action="delete-apikey"]');
  if (!button) {
    return;
  }

  if (!confirmDeleteAction('确认删除这个 apikey 吗？')) {
    return;
  }

  button.disabled = true;
  try {
    await deleteApiKey(button.dataset.index);
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    button.disabled = false;
  }
});

updateConfigMode('token');
usageStartInput.value = getCurrentDateTimeInputValue();
loadSnapshot();
startSnapshotPolling();
startLogsPolling();
