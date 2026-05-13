(function () {
  const panel = document.querySelector('#bootPanel');
  const headline = document.querySelector('#headline');
  const message = document.querySelector('#message');
  const actions = document.querySelector('#actions');
  const retryBtn = document.querySelector('#retryBtn');
  const logBtn = document.querySelector('#logBtn');
  const revealBtn = document.querySelector('#revealBtn');
  const logOutput = document.querySelector('#logOutput');

  function invoke(command, args) {
    const api = window.__TAURI__?.core;
    if (!api?.invoke) {
      throw new Error('请在 Airouter 桌面应用中打开');
    }
    return api.invoke(command, args);
  }

  function showLoading(text = '启动本地服务') {
    panel.dataset.state = 'loading';
    headline.textContent = text;
    message.textContent = '服务就绪后会直接进入管理配置页面。';
    actions.hidden = true;
    logOutput.hidden = true;
  }

  function showError(error) {
    panel.dataset.state = 'error';
    headline.textContent = '没有打开配置页';
    message.textContent = String(error || '本地服务启动失败，请查看最近日志。');
    actions.hidden = false;
  }

  async function retry() {
    showLoading('重新连接配置页');
    try {
      await invoke('show_config_page');
    } catch (error) {
      showError(error);
    }
  }

  async function showLogs() {
    try {
      const logs = await invoke('read_recent_logs', { limit: 120 });
      logOutput.textContent = logs || '暂无日志';
    } catch (error) {
      logOutput.textContent = String(error);
    }
    logOutput.hidden = false;
  }

  retryBtn.addEventListener('click', retry);
  logBtn.addEventListener('click', showLogs);
  revealBtn.addEventListener('click', () => invoke('reveal_runtime_dir').catch(showError));

  window.__TAURI__?.event
    ?.listen('airouter-startup-error', (event) => showError(event.payload))
    .catch(showError);

  window.setTimeout(() => {
    if (panel.dataset.state === 'loading') {
      headline.textContent = '仍在等待本地服务';
      message.textContent = '如果长时间停留在这里，可以重新进入配置页或查看日志。';
      actions.hidden = false;
    }
  }, 12000);
})();
