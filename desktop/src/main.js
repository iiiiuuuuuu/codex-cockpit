(function () {
  const selectors = {
    statusPill: '#statusPill',
    serviceState: '#serviceState',
    servicePort: '#servicePort',
    servicePid: '#servicePid',
    configState: '#configState',
    adminUrl: '#adminUrl',
    runtimeDir: '#runtimeDir',
    lastMessage: '#lastMessage',
    logOutput: '#logOutput',
    startBtn: '#startBtn',
    stopBtn: '#stopBtn',
    restartBtn: '#restartBtn',
    openAdminBtn: '#openAdminBtn',
    openBrowserBtn: '#openBrowserBtn',
    revealBtn: '#revealBtn',
    refreshBtn: '#refreshBtn'
  };

  const $ = (selector) => document.querySelector(selector);
  const invoke = (...args) => {
    const api = window.__TAURI__?.core;
    if (!api?.invoke) {
      throw new Error('Tauri API 尚未注入，请在桌面应用中打开此页面');
    }
    return api.invoke(...args);
  };

  const actionButtons = [
    selectors.startBtn,
    selectors.stopBtn,
    selectors.restartBtn,
    selectors.openAdminBtn,
    selectors.openBrowserBtn,
    selectors.revealBtn,
    selectors.refreshBtn
  ].map($);

  let busy = false;
  let latestStatus = null;

  function text(value, fallback = '-') {
    return value === undefined || value === null || value === '' ? fallback : String(value);
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    actionButtons.forEach((button) => {
      button.disabled = busy;
    });
  }

  function renderError(message) {
    const pill = $(selectors.statusPill);
    pill.dataset.status = 'error';
    pill.querySelector('strong').textContent = '异常';
    $(selectors.lastMessage).textContent = message;
  }

  function renderStatus(status) {
    latestStatus = status;
    const pill = $(selectors.statusPill);
    const pillLabel = pill.querySelector('strong');
    const statusName = status.running ? '运行中' : '已停止';

    pill.dataset.status = status.running ? 'running' : 'stopped';
    pillLabel.textContent = statusName;

    $(selectors.serviceState).textContent = statusName;
    $(selectors.servicePort).textContent = text(status.port);
    $(selectors.servicePid).textContent = text(status.pid);
    $(selectors.configState).textContent = status.hasConfig && status.configValid ? '已就绪' : '需检查';
    $(selectors.adminUrl).textContent = text(status.adminUrl);
    $(selectors.runtimeDir).textContent = text(status.runtimeDir);
    $(selectors.lastMessage).textContent = text(status.message);
    $(selectors.logOutput).textContent = text(status.logs, '暂无日志');
  }

  async function refreshStatus() {
    try {
      const status = await invoke('get_status');
      renderStatus(status);
    } catch (error) {
      renderError(String(error));
    }
  }

  async function refreshLogs() {
    try {
      const logs = await invoke('read_recent_logs', { limit: 160 });
      $(selectors.logOutput).textContent = text(logs, '暂无日志');
    } catch (error) {
      $(selectors.logOutput).textContent = String(error);
    }
  }

  async function runAction(command) {
    if (busy) {
      return;
    }

    setBusy(true);
    try {
      const status = await invoke(command);
      if (status) {
        renderStatus(status);
      } else {
        await refreshStatus();
      }
    } catch (error) {
      renderError(String(error));
      await refreshLogs();
    } finally {
      setBusy(false);
    }
  }

  $(selectors.startBtn).addEventListener('click', () => runAction('start_service'));
  $(selectors.stopBtn).addEventListener('click', () => runAction('stop_service'));
  $(selectors.restartBtn).addEventListener('click', () => runAction('restart_service'));
  $(selectors.openAdminBtn).addEventListener('click', () => runAction('open_admin_window'));
  $(selectors.openBrowserBtn).addEventListener('click', () => runAction('open_admin_in_browser'));
  $(selectors.revealBtn).addEventListener('click', () => runAction('reveal_runtime_dir'));
  $(selectors.refreshBtn).addEventListener('click', refreshStatus);

  window.addEventListener('focus', refreshStatus);
  refreshStatus();
  setInterval(() => {
    if (!busy && latestStatus?.running) {
      refreshStatus();
    }
  }, 5000);
})();
