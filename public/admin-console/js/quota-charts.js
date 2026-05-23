function destroyQuotaHistoryChart() {
  if (quotaHistoryEchartsInstance) {
    quotaHistoryEchartsInstance.dispose();
    quotaHistoryEchartsInstance = null;
  }
}

function destroyQuotaOverviewChart() {
  if (quotaOverviewEchartsInstance) {
    quotaOverviewEchartsInstance.dispose();
    quotaOverviewEchartsInstance = null;
  }
}

function getCssColor(element, name, fallback) {
  const value = window.getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

function buildQuotaHistorySeriesData(points, startTime, endTime) {
  if (!points.length) {
    return [];
  }

  const firstPoint = points[0];
  if (points.length === 1) {
    return [
      { value: [startTime, firstPoint.y], symbol: 'none' },
      [endTime, firstPoint.y],
    ];
  }

  const chartData = points.map(point => [point.x, point.y]);
  if (firstPoint.x > startTime) {
    chartData.unshift({
      value: [startTime, firstPoint.y],
      symbol: 'none',
    });
  }

  return chartData;
}

function getEchartsGlobal() {
  return window.echarts || globalThis.echarts || null;
}

function loadEcharts() {
  const loaded = getEchartsGlobal();
  if (loaded && typeof loaded.init === 'function') {
    return Promise.resolve(loaded);
  }

  if (echartsLoadPromise) {
    return echartsLoadPromise;
  }

  echartsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      reject(new Error('echarts load timeout'));
    }, 6000);

    script.src = `/vendor/echarts.min.js?retry=${Date.now()}`;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      const echartsApi = getEchartsGlobal();
      if (echartsApi && typeof echartsApi.init === 'function') {
        resolve(echartsApi);
        return;
      }
      reject(new Error('echarts global missing'));
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('echarts script failed'));
    };
    document.head.appendChild(script);
  }).catch(error => {
    echartsLoadPromise = null;
    throw error;
  });

  return echartsLoadPromise;
}

async function renderQuotaHistoryChart(chartElement) {
  const chartNode = chartElement.querySelector('.history-echarts');
  if (!chartNode) {
    return;
  }

  function showChartFallback(message) {
    const fallback = document.createElement('div');
    fallback.className = 'history-empty';
    fallback.textContent = message;
    chartNode.replaceWith(fallback);
  }

  let echartsApi = null;
  try {
    echartsApi = await loadEcharts();
  } catch (error) {
    showChartFallback('图表暂不可用');
    return;
  }

  if (!chartNode.isConnected) {
    return;
  }

  const points = (() => {
    try {
      return JSON.parse(chartNode.dataset.points || '[]');
    } catch (error) {
      return [];
    }
  })();
  if (!points.length) {
    return;
  }

  destroyQuotaHistoryChart();

  const startTime = Number(chartElement.dataset.axisStartTime || chartElement.dataset.startTime);
  const endTime = Number(chartElement.dataset.axisEndTime || chartElement.dataset.endTime);
  const timeScale = chartElement.dataset.timeScale || 'day';
  const quotaRange = chartElement.dataset.range || '';
  const showDate = chartElement.dataset.showDate === 'true';
  const xIntervalMs = Number(chartElement.dataset.xIntervalMs);
  const hasFixedXInterval = Number.isFinite(xIntervalMs) && xIntervalMs > 0;
  const lineA = getCssColor(chartElement, '--history-line-a', '#2563eb');
  const lineB = getCssColor(chartElement, '--history-line-b', '#0891b2');
  const accent = getCssColor(chartElement, '--history-accent', 'rgba(37, 99, 235, 0.18)');
  const latestText = chartElement.dataset.latestText || '--';
  const chartData = buildQuotaHistorySeriesData(points, startTime, endTime);

  try {
    quotaHistoryEchartsInstance = echartsApi.init(chartNode, null, {
      renderer: 'canvas',
    });
    quotaHistoryEchartsInstance.setOption({
      animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationDuration: 900,
      animationEasing: 'cubicOut',
      grid: {
        top: 18,
        right: 12,
        bottom: 30,
        left: 10,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: lineA,
            width: 1,
            type: 'dashed',
            opacity: 0.7,
          },
        },
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        borderColor: 'rgba(194, 208, 227, 0.96)',
        borderWidth: 1,
        padding: [8, 10],
        textStyle: {
          color: '#243041',
          fontSize: 11,
          fontWeight: 800,
        },
        formatter(params) {
          const first = Array.isArray(params) ? params[0] : params;
          const value = Array.isArray(first?.value) ? first.value : [];
          return `${formatQuotaHistoryTime(value[0], timeScale, { withDate: showDate })}<br/>剩余 <strong>${Math.round(value[1])}%</strong>`;
        },
      },
      xAxis: {
        type: 'value',
        min: startTime,
        max: endTime,
        interval: hasFixedXInterval ? xIntervalMs : undefined,
        minInterval: hasFixedXInterval ? xIntervalMs : undefined,
        maxInterval: hasFixedXInterval ? xIntervalMs : undefined,
        splitNumber: hasFixedXInterval
          ? Math.max(1, Math.round((endTime - startTime) / xIntervalMs))
          : undefined,
        boundaryGap: false,
        axisLine: {
          lineStyle: {
            color: 'rgba(198, 211, 231, 0.92)',
          },
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: '#8f9db1',
          fontSize: 10,
          fontWeight: 800,
          hideOverlap: false,
          showMinLabel: true,
          showMaxLabel: true,
          formatter(value) {
            return formatQuotaHistoryAxisTime(value, timeScale, {
              range: quotaRange,
              withDate: showDate,
            });
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: 'rgba(198, 211, 231, 0.5)',
            type: 'dashed',
          },
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 25,
        axisLabel: {
          color: '#8f9db1',
          fontSize: 10,
          fontWeight: 800,
          formatter: '{value}%',
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(198, 211, 231, 0.8)',
          },
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['rgba(32, 192, 92, 0.045)', 'rgba(245, 158, 11, 0.04)'],
          },
        },
      },
      series: [{
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: points.length <= 12 ? 7 : 6,
        showSymbol: points.length <= 12,
        data: chartData,
        lineStyle: {
          width: 2.6,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: lineA },
              { offset: 1, color: lineB },
            ],
          },
          shadowColor: accent,
          shadowBlur: 8,
          shadowOffsetY: 4,
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: lineA,
          borderWidth: 2,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: accent },
              { offset: 1, color: 'rgba(255, 255, 255, 0.02)' },
            ],
          },
        },
        markArea: {
          silent: true,
          itemStyle: {
            opacity: 1,
          },
          data: [
            [
              { yAxis: 55, itemStyle: { color: 'rgba(32, 192, 92, 0.04)' } },
              { yAxis: 100 },
            ],
            [
              { yAxis: 3, itemStyle: { color: 'rgba(245, 158, 11, 0.055)' } },
              { yAxis: 55 },
            ],
            [
              { yAxis: 0, itemStyle: { color: 'rgba(239, 68, 68, 0.065)' } },
              { yAxis: 3 },
            ],
          ],
        },
      }],
    });
    chartNode.dataset.chartRendered = 'true';
  } catch (error) {
    showChartFallback('图表暂不可用');
  }
}

function getQuotaOverviewAccounts() {
  return getVisibleAccounts().filter(item => isTokenConfig(item));
}

function getQuotaOverviewSeriesName(item, usedNames) {
  const baseName = getDisplayName(item);
  const name = usedNames.has(baseName) ? `${baseName} #${item.index + 1}` : baseName;
  usedNames.add(name);
  return name;
}

function buildQuotaOverviewSeries(mode) {
  const view = QUOTA_HISTORY_VIEWS[mode] || QUOTA_HISTORY_VIEWS.primary;
  const endTime = Date.now();
  const displayWindowMs = getQuotaOverviewDisplayWindow(mode, view);
  const startTime = endTime - displayWindowMs;
  const usedNames = new Set();

  return getQuotaOverviewAccounts().map((item, position) => {
    const history = getQuotaHistory(item.runtime, view);
    const displayHistory = history.filter(sample => sample.at >= startTime);
    const chartHistory = displayHistory.length ? displayHistory : history.slice(-1);
    const points = chartHistory.map(sample => ({
      x: Math.max(startTime, Math.min(endTime, sample.at)),
      y: sample.value,
    }));
    const latestValue = chartHistory.length ? Math.round(chartHistory[chartHistory.length - 1].value) : null;

    return {
      name: getQuotaOverviewSeriesName(item, usedNames),
      index: item.index,
      active: Boolean(item.is_active),
      available: item.runtime?.available !== false,
      color: QUOTA_OVERVIEW_COLORS[position % QUOTA_OVERVIEW_COLORS.length],
      latestText: latestValue === null ? '--' : `${latestValue}%`,
      points,
    };
  });
}

async function renderQuotaOverviewChart(chartElement) {
  const chartNode = chartElement.querySelector('.history-echarts');
  if (!chartNode) {
    return;
  }

  function showChartFallback(message) {
    const fallback = document.createElement('div');
    fallback.className = 'history-empty';
    fallback.textContent = message;
    chartNode.replaceWith(fallback);
  }

  let echartsApi = null;
  try {
    echartsApi = await loadEcharts();
  } catch (error) {
    showChartFallback('图表暂不可用');
    return;
  }

  if (!chartNode.isConnected) {
    return;
  }

  const seriesItems = (() => {
    try {
      return JSON.parse(chartNode.dataset.series || '[]');
    } catch (error) {
      return [];
    }
  })();
  const drawableSeries = seriesItems.filter(item => Array.isArray(item.points) && item.points.length);
  if (!drawableSeries.length) {
    return;
  }

  destroyQuotaOverviewChart();

  const startTime = Number(chartElement.dataset.axisStartTime || chartElement.dataset.startTime);
  const endTime = Number(chartElement.dataset.axisEndTime || chartElement.dataset.endTime);
  const timeScale = chartElement.dataset.timeScale || 'day';
  const quotaRange = chartElement.dataset.range || '';
  const showDate = chartElement.dataset.showDate === 'true';
  const xIntervalMs = Number(chartElement.dataset.xIntervalMs);
  const hasFixedXInterval = Number.isFinite(xIntervalMs) && xIntervalMs > 0;
  const accent = getCssColor(chartElement, '--history-accent', 'rgba(37, 99, 235, 0.18)');
  const markArea = {
    silent: true,
    itemStyle: {
      opacity: 1,
    },
    data: [
      [
        { yAxis: 55, itemStyle: { color: 'rgba(32, 192, 92, 0.035)' } },
        { yAxis: 100 },
      ],
      [
        { yAxis: 3, itemStyle: { color: 'rgba(245, 158, 11, 0.045)' } },
        { yAxis: 55 },
      ],
      [
        { yAxis: 0, itemStyle: { color: 'rgba(239, 68, 68, 0.055)' } },
        { yAxis: 3 },
      ],
    ],
  };

  try {
    quotaOverviewEchartsInstance = echartsApi.init(chartNode, null, {
      renderer: 'canvas',
    });
    quotaOverviewEchartsInstance.setOption({
      animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationDuration: 700,
      animationEasing: 'cubicOut',
      color: drawableSeries.map(item => item.color),
      grid: {
        top: 58,
        right: 14,
        bottom: 32,
        left: 10,
        containLabel: true,
      },
      legend: {
        type: 'scroll',
        top: 0,
        left: 0,
        right: 0,
        itemWidth: 16,
        itemHeight: 8,
        textStyle: {
          color: '#56657a',
          fontSize: 11,
          fontWeight: 800,
        },
        data: drawableSeries.map(item => item.name),
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: '#64748b',
            width: 1,
            type: 'dashed',
            opacity: 0.72,
          },
        },
        backgroundColor: 'rgba(255, 255, 255, 0.97)',
        borderColor: 'rgba(194, 208, 227, 0.96)',
        borderWidth: 1,
        padding: [8, 10],
        textStyle: {
          color: '#243041',
          fontSize: 11,
          fontWeight: 800,
        },
        formatter(params) {
          const rows = (Array.isArray(params) ? params : [params]).filter(item => {
            const value = Array.isArray(item?.value) ? item.value : [];
            return Number.isFinite(Number(value[1]));
          });
          const firstValue = Array.isArray(rows[0]?.value) ? rows[0].value : [];
          const timeText = formatQuotaHistoryTime(firstValue[0], timeScale, { withDate: showDate });
          const body = rows.map(item => {
            const value = Array.isArray(item.value) ? item.value : [];
            return `${item.marker}${escapeHtml(item.seriesName)} <strong>${Math.round(value[1])}%</strong>`;
          }).join('<br/>');

          return `${timeText}<br/>${body}`;
        },
      },
      xAxis: {
        type: 'value',
        min: startTime,
        max: endTime,
        interval: hasFixedXInterval ? xIntervalMs : undefined,
        minInterval: hasFixedXInterval ? xIntervalMs : undefined,
        maxInterval: hasFixedXInterval ? xIntervalMs : undefined,
        splitNumber: hasFixedXInterval
          ? Math.max(1, Math.round((endTime - startTime) / xIntervalMs))
          : undefined,
        boundaryGap: false,
        axisLine: {
          lineStyle: {
            color: 'rgba(198, 211, 231, 0.92)',
          },
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: '#8f9db1',
          fontSize: 10,
          fontWeight: 800,
          hideOverlap: false,
          showMinLabel: true,
          showMaxLabel: true,
          formatter(value) {
            return formatQuotaHistoryAxisTime(value, timeScale, {
              range: quotaRange,
              withDate: showDate,
            });
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: 'rgba(198, 211, 231, 0.48)',
            type: 'dashed',
          },
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 25,
        axisLabel: {
          color: '#8f9db1',
          fontSize: 10,
          fontWeight: 800,
          formatter: '{value}%',
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(198, 211, 231, 0.78)',
          },
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['rgba(32, 192, 92, 0.035)', 'rgba(245, 158, 11, 0.032)'],
          },
        },
      },
      series: drawableSeries.map((item, index) => ({
        name: item.name,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: item.points.length <= 12 ? 6 : 4,
        showSymbol: item.points.length <= 12,
        data: buildQuotaHistorySeriesData(item.points, startTime, endTime),
        lineStyle: {
          width: item.active ? 3 : 2,
          opacity: item.available ? 0.92 : 0.48,
          type: 'solid',
          color: item.color,
          shadowColor: item.active ? accent : 'transparent',
          shadowBlur: item.active ? 8 : 0,
          shadowOffsetY: item.active ? 4 : 0,
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: item.color,
          borderWidth: item.active ? 2 : 1.5,
          opacity: item.available ? 1 : 0.65,
        },
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 3.4,
          },
        },
        markArea: index === 0 ? markArea : undefined,
      })),
    });
    chartNode.dataset.chartRendered = 'true';
  } catch (error) {
    showChartFallback('图表暂不可用');
  }
}

function renderQuotaOverview() {
  const view = QUOTA_HISTORY_VIEWS[quotaOverviewMode] || QUOTA_HISTORY_VIEWS.primary;
  const mode = QUOTA_HISTORY_VIEWS[quotaOverviewMode] ? quotaOverviewMode : 'primary';
  const endTime = Date.now();
  const displayWindowMs = getQuotaOverviewDisplayWindow(mode, view);
  const activeRange = mode === 'primary' ? getOverviewPrimaryQuotaHistoryRange() : null;
  const startTime = endTime - displayWindowMs;
  const timeScale = mode === 'weekly' ? 'week' : 'day';
  const showDate = shouldShowQuotaHistoryDate(startTime, endTime, timeScale);
  const seriesItems = buildQuotaOverviewSeries(mode);
  const drawableCount = seriesItems.filter(item => item.points.length).length;
  const activeItem = seriesItems.find(item => item.active);
  const chartContent = drawableCount
    ? `<div class="history-echarts" data-series="${escapeHtml(JSON.stringify(seriesItems))}" role="img" aria-label="所有 Token 账号${escapeHtml(view.label)}趋势对比图"></div>`
    : `<div class="history-empty">${escapeHtml(view.emptyText)}</div>`;
  const modeButtons = Object.entries(QUOTA_HISTORY_VIEWS).map(([nextMode, nextView]) => `
    <button class="quota-history-mode${nextMode === mode ? ' active' : ''}" type="button" data-action="quota-overview-mode" data-mode="${escapeHtml(nextMode)}" aria-pressed="${nextMode === mode ? 'true' : 'false'}">
      ${escapeHtml(nextView.label)}
    </button>
  `).join('');
  const rangeSwitch = mode === 'primary'
    ? `<div class="quota-history-range-switch" role="tablist" aria-label="总览 5小时额度时间范围">
        ${Object.entries(PRIMARY_QUOTA_HISTORY_RANGES).map(([range, option]) => `
          <button class="quota-history-range${range === quotaOverviewPrimaryRange ? ' active' : ''}" type="button" data-action="quota-overview-range" data-range="${escapeHtml(range)}" aria-pressed="${range === quotaOverviewPrimaryRange ? 'true' : 'false'}">
            ${escapeHtml(option.label)}
          </button>
        `).join('')}
      </div>`
    : '';

  return `
    <div class="quota-overview-controls">
      <div class="quota-history-mode-switch" role="tablist" aria-label="总览配额类型">
        ${modeButtons}
      </div>
      <div class="quota-overview-range-slot" aria-hidden="${rangeSwitch ? 'false' : 'true'}">
        ${rangeSwitch}
      </div>
    </div>
    <div class="history-chart quota-overview-chart" data-start-time="${startTime}" data-end-time="${endTime}" data-axis-start-time="${startTime}" data-axis-end-time="${endTime}" data-time-scale="${escapeHtml(timeScale)}" data-range="${mode === 'primary' ? escapeHtml(quotaOverviewPrimaryRange) : ''}" data-show-date="${showDate ? 'true' : 'false'}" data-x-interval-ms="${activeRange?.tickIntervalMs || view.tickIntervalMs || ''}">
      <div class="history-chart-head">
        <div class="history-title-group">
          <div class="history-title">${escapeHtml(view.label)}趋势总览</div>
        </div>
        <div class="history-head-metrics">
          <div class="history-latest" title="有历史点的账号数">${drawableCount}/${seriesItems.length} 个账号</div>
        </div>
      </div>
      <div class="quota-overview-meta">
        <span>当前使用：${escapeHtml(activeItem?.name || '--')}</span>
      </div>
      <div class="history-echarts-wrap">
        ${chartContent}
      </div>
    </div>
  `;
}

function bindQuotaOverviewModalInteractions() {
  const chart = quotaOverviewModalBody.querySelector('.history-chart');
  if (!chart) {
    return;
  }

  void renderQuotaOverviewChart(chart);
}

function refreshQuotaOverviewModal() {
  if (quotaOverviewModalBackdrop.hidden) {
    return;
  }

  destroyQuotaOverviewChart();
  quotaOverviewModalBody.innerHTML = renderQuotaOverview();
  bindQuotaOverviewModalInteractions();
}

function openQuotaOverviewModal() {
  closeQuotaHistoryPopover();
  quotaOverviewMode = 'primary';
  quotaOverviewPrimaryRange = '1h';
  quotaOverviewModalBody.innerHTML = renderQuotaOverview();
  quotaOverviewModalBackdrop.hidden = false;
  quotaOverviewModalBackdrop.classList.add('show');
  bindQuotaOverviewModalInteractions();
}

function closeQuotaOverviewModal() {
  destroyQuotaOverviewChart();
  quotaOverviewModalBackdrop.classList.remove('show');
  quotaOverviewModalBackdrop.hidden = true;
}

function renderQuotaHistory(runtime, mode = quotaHistoryPopoverMode) {
  const view = QUOTA_HISTORY_VIEWS[mode] || QUOTA_HISTORY_VIEWS.primary;
  const history = getQuotaHistory(runtime, view);
  const endTime = Date.now();
  const displayWindowMs = getQuotaHistoryDisplayWindow(mode, view);
  const activeRange = mode === 'primary' ? getPrimaryQuotaHistoryRange() : null;
  const startTime = endTime - displayWindowMs;
  const displayHistory = history.filter(sample => sample.at >= startTime);
  const chartHistory = displayHistory.length ? displayHistory : history.slice(-1);
  const timeScale = mode === 'weekly' ? 'week' : 'day';
  const showDate = shouldShowQuotaHistoryDate(startTime, endTime, timeScale);
  const chartPoints = chartHistory.map(sample => ({
    x: Math.max(startTime, Math.min(endTime, sample.at)),
    y: sample.value,
  }));
  const latestValue = chartHistory.length ? Math.round(chartHistory[chartHistory.length - 1].value) : null;
  const latestTone = getHistoryTone(latestValue);
  const latestText = latestValue === null ? '--' : `${latestValue}%`;
  const chartContent = chartPoints.length
    ? `<div class="history-echarts" data-points="${escapeHtml(JSON.stringify(chartPoints))}" role="img" aria-label="${escapeHtml(view.label)}剩余额度趋势平滑折线图"></div>`
    : `<div class="history-empty">${escapeHtml(view.emptyText)}</div>`;
  const rangeSwitch = mode === 'primary'
    ? `<div class="quota-history-range-switch" role="tablist" aria-label="5小时额度时间范围">
        ${Object.entries(PRIMARY_QUOTA_HISTORY_RANGES).map(([range, option]) => `
          <button class="quota-history-range${range === quotaHistoryPrimaryRange ? ' active' : ''}" type="button" data-action="quota-history-range" data-range="${escapeHtml(range)}" aria-pressed="${range === quotaHistoryPrimaryRange ? 'true' : 'false'}">
            ${escapeHtml(option.label)}
          </button>
        `).join('')}
      </div>`
    : '';

  return `
    <div class="history-chart ${latestTone}" data-history="${escapeHtml(JSON.stringify(history))}" data-start-time="${startTime}" data-end-time="${endTime}" data-axis-start-time="${startTime}" data-axis-end-time="${endTime}" data-time-scale="${escapeHtml(timeScale)}" data-range="${mode === 'primary' ? escapeHtml(quotaHistoryPrimaryRange) : ''}" data-show-date="${showDate ? 'true' : 'false'}" data-x-interval-ms="${activeRange?.tickIntervalMs || view.tickIntervalMs || ''}" data-latest-text="${escapeHtml(latestText)}">
      <div class="history-chart-head">
        <div class="history-title-group">
          <div class="history-title">${escapeHtml(view.title)}</div>
        </div>
        <div class="history-head-metrics">
          <div class="history-latest" title="当前剩余额度">剩余 ${escapeHtml(latestText)}</div>
        </div>
      </div>
      ${rangeSwitch ? `<div class="history-range-row">${rangeSwitch}</div>` : ''}
      <div class="history-echarts-wrap">
        ${chartContent}
      </div>
    </div>
  `;
}

function renderQuotaHistoryPopoverContent(item) {
  const modeButtons = Object.entries(QUOTA_HISTORY_VIEWS).map(([mode, view]) => `
    <button class="quota-history-mode${mode === quotaHistoryPopoverMode ? ' active' : ''}" type="button" data-action="quota-history-mode" data-mode="${escapeHtml(mode)}" aria-pressed="${mode === quotaHistoryPopoverMode ? 'true' : 'false'}">
      ${escapeHtml(view.label)}
    </button>
  `).join('');

  return `
    <div class="quota-history-popover-head">
      <div>
        <h3 class="quota-history-popover-title">${escapeHtml(getDisplayName(item))}</h3>
      </div>
      <div class="quota-history-mode-switch" role="tablist" aria-label="配额历史类型">
        ${modeButtons}
      </div>
      <button class="icon-button" type="button" data-action="close-quota-history" aria-label="关闭配额走势">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6l-12 12"/></svg>
      </button>
    </div>
    ${renderQuotaHistory(item.runtime, quotaHistoryPopoverMode)}
  `;
}

function bindQuotaHistoryPopoverInteractions() {
  const chart = quotaHistoryPopover.querySelector('.history-chart');
  if (!chart) {
    return;
  }

  void renderQuotaHistoryChart(chart);
}

function positionQuotaHistoryPopover(anchor) {
  const rect = anchor.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(720, window.innerWidth - (margin * 2));
  const popoverHeight = quotaHistoryPopover.offsetHeight || 180;
  let left = rect.left;
  let top = rect.bottom + 8;

  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - margin - width;
  }
  if (top + popoverHeight > window.innerHeight - margin) {
    top = rect.top - popoverHeight - 8;
  }

  quotaHistoryPopover.style.width = `${width}px`;
  quotaHistoryPopover.style.left = `${Math.max(margin, left)}px`;
  quotaHistoryPopover.style.top = `${Math.max(margin, top)}px`;
}

function openQuotaHistoryPopover(index, anchor, mode = 'primary') {
  const item = findSnapshotConfig(index);
  if (!item || isApiKeyConfig(item)) {
    return;
  }

  quotaHistoryPopoverIndex = item.index;
  quotaHistoryPopoverMode = QUOTA_HISTORY_VIEWS[mode] ? mode : 'primary';
  if (quotaHistoryPopoverMode === 'primary') {
    quotaHistoryPrimaryRange = '1h';
  }
  destroyQuotaHistoryChart();
  quotaHistoryPopover.innerHTML = renderQuotaHistoryPopoverContent(item);
  quotaHistoryPopover.hidden = false;
  positionQuotaHistoryPopover(anchor);
  bindQuotaHistoryPopoverInteractions();
}

function closeQuotaHistoryPopover() {
  destroyQuotaHistoryChart();
  quotaHistoryPopover.hidden = true;
  quotaHistoryPopoverIndex = null;
}

function refreshQuotaHistoryPopover() {
  if (quotaHistoryPopover.hidden || quotaHistoryPopoverIndex === null) {
    return;
  }

  const item = findSnapshotConfig(quotaHistoryPopoverIndex);
  if (!item || isApiKeyConfig(item)) {
    closeQuotaHistoryPopover();
    return;
  }

  destroyQuotaHistoryChart();
  quotaHistoryPopover.innerHTML = renderQuotaHistoryPopoverContent(item);
  bindQuotaHistoryPopoverInteractions();
}
