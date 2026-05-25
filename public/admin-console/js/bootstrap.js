const messageEl = document.getElementById('message');
const accountsGrid = document.getElementById('accountsGrid');
const configModeButtons = [...document.querySelectorAll('[data-config-mode]')];
const addConfigModeTitle = document.getElementById('addConfigModeTitle');
const tokenConfigPanel = document.getElementById('tokenConfigPanel');
const apiKeyConfigPanel = document.getElementById('apiKeyConfigPanel');
const rawJsonInput = document.getElementById('rawJsonInput');
const apiKeyBaseUrlInput = document.getElementById('apiKeyBaseUrlInput');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyDescriptionInput = document.getElementById('apiKeyDescriptionInput');
const usageStartInput = document.getElementById('usageStartInput');
const addConfigButton = document.getElementById('addConfigButton');
const clearConfigButton = document.getElementById('clearConfigButton');
const addApiKeyButton = document.getElementById('addApiKeyButton');
const apiKeysListEl = document.getElementById('apiKeysList');
const apiKeyStatusTitle = document.getElementById('apiKeyStatusTitle');
const routingPreferenceCurrent = document.getElementById('routingPreferenceCurrent');
const editRoutingPreferenceButton = document.getElementById('editRoutingPreferenceButton');
const quotaHistoryPopover = document.getElementById('quotaHistoryPopover');
const quotaOverviewButton = document.getElementById('quotaOverviewButton');
const quotaOverviewModalBackdrop = document.getElementById('quotaOverviewModalBackdrop');
const quotaOverviewModalBody = document.getElementById('quotaOverviewModalBody');
const quotaOverviewModalCloseButton = document.getElementById('quotaOverviewModalCloseButton');
const refreshLogsButton = document.getElementById('refreshLogsButton');
const logsMeta = document.getElementById('logsMeta');
const logsOutput = document.getElementById('logsOutput');
const routingPreferenceModalBackdrop = document.getElementById('routingPreferenceModalBackdrop');
const routingPreferenceModalNote = document.getElementById('routingPreferenceModalNote');
const routingPreferenceModalCloseButton = document.getElementById('routingPreferenceModalCloseButton');
const routingPreferenceModalCancelButton = document.getElementById('routingPreferenceModalCancelButton');
const routingPreferenceModalSaveButton = document.getElementById('routingPreferenceModalSaveButton');
const routingPreferenceModalButtons = [...document.querySelectorAll('[data-routing-preference]')];
const codexSpeedModeCurrent = document.getElementById('codexSpeedModeCurrent');
const editCodexSpeedModeButton = document.getElementById('editCodexSpeedModeButton');
const codexSpeedModeModalBackdrop = document.getElementById('codexSpeedModeModalBackdrop');
const codexSpeedModeModalNote = document.getElementById('codexSpeedModeModalNote');
const codexSpeedModeModalCloseButton = document.getElementById('codexSpeedModeModalCloseButton');
const codexSpeedModeModalCancelButton = document.getElementById('codexSpeedModeModalCancelButton');
const codexSpeedModeModalSaveButton = document.getElementById('codexSpeedModeModalSaveButton');
const codexSpeedModeButtons = [...document.querySelectorAll('[data-codex-speed-mode]')];
const accountLayoutMenuButton = document.getElementById('accountLayoutMenuButton');
const accountLayoutMenu = document.getElementById('accountLayoutMenu');
const accountLayoutCurrentLabel = document.getElementById('accountLayoutCurrentLabel');
const accountGridColumnButtons = [...document.querySelectorAll('[data-account-grid-columns]')];
const servicePortInput = document.getElementById('servicePortInput');
const proxyPortInput = document.getElementById('proxyPortInput');
const proxyV1Url = document.getElementById('proxyV1Url');
const proxyEndpointMeta = document.getElementById('proxyEndpointMeta');
const saveProxySettingsButton = document.getElementById('saveProxySettingsButton');
const aliasModalBackdrop = document.getElementById('aliasModalBackdrop');
const aliasModalNote = document.getElementById('aliasModalNote');
const aliasInput = document.getElementById('aliasInput');
const accountPriceInput = document.getElementById('accountPriceInput');
const accountStartedAtInput = document.getElementById('accountStartedAtInput');
const accountStoppedAtInput = document.getElementById('accountStoppedAtInput');
const aliasSourceLabel = document.getElementById('aliasSourceLabel');
const aliasSourceValue = document.getElementById('aliasSourceValue');
const aliasIdLabel = document.getElementById('aliasIdLabel');
const aliasIdValue = document.getElementById('aliasIdValue');
const aliasModalCloseButton = document.getElementById('aliasModalCloseButton');
const aliasModalCancelButton = document.getElementById('aliasModalCancelButton');
const aliasModalSaveButton = document.getElementById('aliasModalSaveButton');
const adminAuthToken = new URLSearchParams(window.location.search).get('auth_token') || '';
const {
  buildConfigSnapshotRequest,
  buildJsonRequestOptions,
  buildRequestUrl,
  parseResponsesApiResponse,
  extractErrorMessage,
  buildConfigItemFromForm,
  getConfigGuideContent,
  normalizePortValue,
  buildProxyAccessInfo,
} = window.AirouterConfigAdmin;

let snapshot = null;
let messageTimer = null;
let editingAliasIndex = null;
let quotaHistoryPopoverIndex = null;
let quotaHistoryPopoverMode = 'primary';
let quotaHistoryPrimaryRange = '1h';
let quotaHistoryEchartsInstance = null;
let quotaOverviewMode = 'primary';
let quotaOverviewPrimaryRange = '1h';
let quotaOverviewEchartsInstance = null;
let echartsLoadPromise = null;
let routingPreferenceDraft = 'token_first';
let codexSpeedModeDraft = 'standard';
let codexSpeedModeSaving = false;
let draggedAccountIndex = null;
let logsRequestInFlight = false;
let logsPollTimer = null;
let snapshotPollTimer = null;
const ACCOUNT_GRID_COLUMNS_STORAGE_KEY = 'ai-cockpit.accountGridColumns';
const ACCOUNT_GRID_COLUMN_OPTIONS = new Set(['auto', '2', '3', '4', '5']);
let accountGridColumns = loadAccountGridColumns();
const SNAPSHOT_POLL_INTERVAL_MS = 60 * 1000;
const LOGS_REFRESH_LIMIT = 160;
const LOGS_POLL_INTERVAL_MS = 15 * 1000;
const QUOTA_OVERVIEW_COLORS = ['#2563eb', '#20c05c', '#f59e0b', '#0891b2', '#7c3aed', '#ef4444', '#0f766e', '#64748b'];
const PRIMARY_QUOTA_HISTORY_RANGES = {
  '1h': {
    label: '近 1 小时',
    windowMs: 60 * 60 * 1000,
    tickIntervalMs: 10 * 60 * 1000,
  },
  '5h': {
    label: '近 5 小时',
    windowMs: 5 * 60 * 60 * 1000,
    tickIntervalMs: 30 * 60 * 1000,
  },
  '1d': {
    label: '近 1 天',
    windowMs: 24 * 60 * 60 * 1000,
    tickIntervalMs: 2 * 60 * 60 * 1000,
  },
};
const QUOTA_HISTORY_VIEWS = {
  primary: {
    runtimeKey: 'quota_history',
    label: '5小时额度',
    title: '剩余额度趋势',
    emptyText: '等待额度轮询',
    historyWindowMs: 24 * 60 * 60 * 1000,
  },
  weekly: {
    runtimeKey: 'weekly_quota_history',
    label: '周额度',
    title: '剩余额度趋势',
    emptyText: '等待周额度轮询',
    historyWindowMs: 7 * 24 * 60 * 60 * 1000,
    displayWindowMs: 7 * 24 * 60 * 60 * 1000,
    tickIntervalMs: 24 * 60 * 60 * 1000,
  },
};

function loadAccountGridColumns() {
  try {
    const value = window.localStorage.getItem(ACCOUNT_GRID_COLUMNS_STORAGE_KEY);
    return ACCOUNT_GRID_COLUMN_OPTIONS.has(value) ? value : 'auto';
  } catch (error) {
    return 'auto';
  }
}

function saveAccountGridColumns(value) {
  try {
    window.localStorage.setItem(ACCOUNT_GRID_COLUMNS_STORAGE_KEY, value);
  } catch (error) {
    // Local storage may be unavailable in private or restricted browser contexts.
  }
}

function setAccountGridColumns(value) {
  accountGridColumns = ACCOUNT_GRID_COLUMN_OPTIONS.has(value) ? value : 'auto';
  saveAccountGridColumns(accountGridColumns);
  renderAccountLayoutControls();
  applyAccountGridLayout();
}

function getAccountGridColumnsLabel(value) {
  return value === 'auto' ? '每行 自动' : `每行 ${value}`;
}

function setAccountLayoutMenuOpen(open) {
  accountLayoutMenu.hidden = !open;
  accountLayoutMenuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeAccountLayoutMenu() {
  setAccountLayoutMenuOpen(false);
}

function renderAccountLayoutControls() {
  accountLayoutCurrentLabel.textContent = getAccountGridColumnsLabel(accountGridColumns);
  accountGridColumnButtons.forEach(button => {
    const active = button.dataset.accountGridColumns === accountGridColumns;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function applyAccountGridLayout() {
  if (accountGridColumns === 'auto') {
    delete accountsGrid.dataset.columns;
    return;
  }

  accountsGrid.dataset.columns = accountGridColumns;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function withAuthToken(url) {
  return buildRequestUrl(url, {
    adminAuthToken,
    origin: window.location.origin,
  });
}

function setMessage(type, text, options = {}) {
  if (messageTimer) {
    window.clearTimeout(messageTimer);
    messageTimer = null;
  }

  if (!text) {
    messageEl.className = 'message';
    messageEl.textContent = '';
    return;
  }

  messageEl.className = `message show ${type}`;
  messageEl.textContent = text;

  if (!options.persist) {
    const timeoutMs = type === 'error' ? 3000 : 1000;
    messageTimer = window.setTimeout(() => {
      setMessage('', '');
    }, timeoutMs);
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(withAuthToken(url), buildJsonRequestOptions(options));
  const contentType = response.headers.get('content-type') || '';
  const payload = parseResponsesApiResponse(await response.text(), contentType);

  if (!response.ok) {
    const error = new Error(extractErrorMessage(payload, `HTTP ${response.status}`));
    error.status = response.status;
    throw error;
  }

  return payload;
}

function switchSection(sectionId) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.toggle('active', section.id === sectionId);
  });
  document.querySelectorAll('[data-section-target]').forEach(button => {
    button.classList.toggle('active', button.dataset.sectionTarget === sectionId);
  });
  setMessage('', '');

  if (sectionId === 'logsSection') {
    void loadLogs({ force: true, silent: true });
  }
}
