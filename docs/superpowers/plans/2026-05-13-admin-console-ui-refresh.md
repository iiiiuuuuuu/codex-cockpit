# Admin Console UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing config admin page into a status-first operations console while preserving every current management feature.

**Architecture:** Keep the static HTML page and plain browser JavaScript model. Add small pure display helpers to `public/config-admin.js`, test them with Node's built-in test runner, then use those helpers from `public/config-admin.html` to render status summary cards and more readable runtime badges. Do not add a framework, bundler, or backend endpoint.

**Tech Stack:** Plain HTML/CSS/JavaScript, Express-served static assets, Node `node:test`, existing `npm test`, Codex in-app browser for visual verification.

---

## File Structure

- Modify `public/config-admin.js`
  - Owns pure parsing and display helpers.
  - Add helpers for admin summary cards, active config labeling, and runtime status tags.
  - Export helpers for tests and for the browser page.
- Modify `public/config-admin.html`
  - Owns page markup, CSS, DOM rendering, and event wiring.
  - Rework the layout into top control bar, status summary, console grid, and config table.
  - Keep all existing element IDs that current JavaScript and tests depend on, or update tests when an ID deliberately moves.
- Modify `test/config-admin.test.js`
  - Preserve current behavior coverage.
  - Add pure function tests for summary and runtime presentation.
  - Update static HTML assertions to match the new layout without weakening feature preservation checks.

Existing uncommitted changes in these files already add the Token/API Key mode form and `buildConfigItemFromForm`. Treat that work as part of the baseline. Do not revert it.

---

### Task 1: Add Pure Display Helper Tests

**Files:**
- Modify: `test/config-admin.test.js`
- Modify later: `public/config-admin.js`

- [ ] **Step 1: Add imports for new helpers**

In `test/config-admin.test.js`, extend the destructuring import from `../public/config-admin.js` to include:

```js
  buildAdminStatusSummary,
  extractRuntimeStatusTags,
  getActiveConfigLabel,
```

The import block should include both the existing `buildConfigItemFromForm` import and these new helper imports.

- [ ] **Step 2: Write failing tests for active config labels and status summary**

Add these tests after the `buildConfigItemFromForm` tests:

```js
test('getActiveConfigLabel identifies the active config item', () => {
  assert.equal(
    getActiveConfigLabel({
      configs: [
        { index: 0, is_active: false },
        { index: 1, is_active: true },
      ],
    }),
    '配置 #2',
  );
});

test('getActiveConfigLabel returns default routing when no config is manually active', () => {
  assert.equal(
    getActiveConfigLabel({
      configs: [
        { index: 0, is_active: false },
      ],
    }),
    '自动调度',
  );
});

test('buildAdminStatusSummary summarizes apikeys, configs, active config, and health', () => {
  assert.deepEqual(
    buildAdminStatusSummary({
      apikeys: ['sk-airouter-one', 'sk-airouter-two'],
      configs: [
        {
          index: 0,
          is_active: false,
          runtime: {
            runtime_summary: '可用=否 | 额度=unknown | 刷新时间=unknown | 周额度=unknown | 刷新时间=unknown | 状态=额度检查失败 | 错误=request timeout after 10000ms',
          },
        },
        {
          index: 1,
          is_active: true,
          runtime: {
            runtime_summary: '可用=是 | 额度=83%',
          },
        },
      ],
    }),
    [
      {
        label: '入口 apikey',
        value: '2 个',
        tone: 'ok',
        detail: '请求会校验入口 apikey',
      },
      {
        label: '上游配置',
        value: '2 个',
        tone: 'ok',
        detail: 'Token 与 API Key 配置总数',
      },
      {
        label: '当前激活',
        value: '配置 #2',
        tone: 'active',
        detail: '手动切换会临时覆盖自动调度',
      },
      {
        label: '健康状态',
        value: '1 个异常',
        tone: 'warn',
        detail: '发现 timeout',
      },
    ],
  );
});
```

- [ ] **Step 3: Write failing tests for runtime status tag extraction**

Add these tests after the summary tests:

```js
test('extractRuntimeStatusTags pulls readable status tags from runtime summary', () => {
  assert.deepEqual(
    extractRuntimeStatusTags({
      runtime_summary: '可用=否 | 额度=unknown | 刷新时间=unknown | 周额度=unknown | 状态=额度检查失败 | 错误=request timeout after 10000ms',
    }),
    [
      { label: '不可用', tone: 'danger' },
      { label: '额度 unknown', tone: 'warn' },
      { label: '刷新 unknown', tone: 'warn' },
      { label: 'timeout', tone: 'danger' },
    ],
  );
});

test('extractRuntimeStatusTags falls back when runtime data is missing', () => {
  assert.deepEqual(
    extractRuntimeStatusTags(null),
    [
      { label: '暂无运行态', tone: 'muted' },
    ],
  );
});
```

- [ ] **Step 4: Run the focused test and verify failure**

Run:

```bash
npm test -- test/config-admin.test.js
```

Expected: FAIL because `buildAdminStatusSummary`, `extractRuntimeStatusTags`, and `getActiveConfigLabel` are not exported yet.

---

### Task 2: Implement Display Helpers

**Files:**
- Modify: `public/config-admin.js`
- Test: `test/config-admin.test.js`

- [ ] **Step 1: Add helper functions near existing display helpers**

In `public/config-admin.js`, place these functions after `getConfigIdentityValue` and before `buildHelloTestRequest`:

```js
  function getRuntimeSummaryText(runtime) {
    return typeof runtime?.runtime_summary === 'string' ? runtime.runtime_summary : '';
  }

  function hasRuntimeProblem(runtime) {
    const text = getRuntimeSummaryText(runtime).toLowerCase();

    return text.includes('可用=否')
      || text.includes('timeout')
      || text.includes('401')
      || text.includes('quota')
      || text.includes('失败')
      || text.includes('错误=');
  }

  function getActiveConfigLabel(snapshot) {
    const configs = Array.isArray(snapshot && snapshot.configs) ? snapshot.configs : [];
    const active = configs.find(item => item && item.is_active);

    return active && Number.isInteger(active.index) ? `配置 #${active.index + 1}` : '自动调度';
  }

  function extractRuntimeStatusTags(runtime) {
    const text = getRuntimeSummaryText(runtime);

    if (!text) {
      return [
        { label: '暂无运行态', tone: 'muted' },
      ];
    }

    const tags = [];
    const lower = text.toLowerCase();

    if (text.includes('可用=是')) {
      tags.push({ label: '可用', tone: 'ok' });
    } else if (text.includes('可用=否')) {
      tags.push({ label: '不可用', tone: 'danger' });
    }

    const quotaMatch = text.match(/额度=([^|]+)/);
    if (quotaMatch && quotaMatch[1]) {
      const value = quotaMatch[1].trim();
      tags.push({
        label: `额度 ${value}`,
        tone: value === 'unknown' ? 'warn' : 'ok',
      });
    }

    const refreshMatch = text.match(/刷新时间=([^|]+)/);
    if (refreshMatch && refreshMatch[1]) {
      const value = refreshMatch[1].trim();
      tags.push({
        label: `刷新 ${value}`,
        tone: value === 'unknown' ? 'warn' : 'muted',
      });
    }

    if (lower.includes('timeout')) {
      tags.push({ label: 'timeout', tone: 'danger' });
    } else if (lower.includes('401')) {
      tags.push({ label: '401', tone: 'danger' });
    } else if (text.includes('失败') || text.includes('错误=')) {
      tags.push({ label: '异常', tone: 'danger' });
    }

    return tags.length ? tags.slice(0, 4) : [
      { label: '已读取', tone: 'muted' },
    ];
  }

  function buildAdminStatusSummary(snapshot) {
    const apikeys = Array.isArray(snapshot && snapshot.apikeys) ? snapshot.apikeys : [];
    const configs = Array.isArray(snapshot && snapshot.configs) ? snapshot.configs : [];
    const problemCount = configs.filter(item => hasRuntimeProblem(item && item.runtime)).length;
    const problemTags = [];
    const runtimeText = configs
      .map(item => getRuntimeSummaryText(item && item.runtime).toLowerCase())
      .join(' ');

    if (runtimeText.includes('timeout')) {
      problemTags.push('timeout');
    }

    if (runtimeText.includes('401')) {
      problemTags.push('401');
    }

    if (runtimeText.includes('quota') || runtimeText.includes('额度')) {
      problemTags.push('额度');
    }

    return [
      {
        label: '入口 apikey',
        value: apikeys.length ? `${apikeys.length} 个` : '未配置',
        tone: apikeys.length ? 'ok' : 'warn',
        detail: apikeys.length ? '请求会校验入口 apikey' : '请求不会校验入口 apikey',
      },
      {
        label: '上游配置',
        value: `${configs.length} 个`,
        tone: configs.length ? 'ok' : 'warn',
        detail: 'Token 与 API Key 配置总数',
      },
      {
        label: '当前激活',
        value: getActiveConfigLabel(snapshot),
        tone: configs.some(item => item && item.is_active) ? 'active' : 'muted',
        detail: '手动切换会临时覆盖自动调度',
      },
      {
        label: '健康状态',
        value: problemCount ? `${problemCount} 个异常` : '未发现异常',
        tone: problemCount ? 'warn' : 'ok',
        detail: problemCount ? `发现 ${problemTags.slice(0, 2).join(' / ') || '运行态异常'}` : '基于当前运行态摘要',
      },
    ];
  }
```

- [ ] **Step 2: Export the new helpers**

In the `exported` object in `public/config-admin.js`, add:

```js
    buildAdminStatusSummary,
    extractRuntimeStatusTags,
    getActiveConfigLabel,
```

- [ ] **Step 3: Run the focused test and verify pass**

Run:

```bash
npm test -- test/config-admin.test.js
```

Expected: PASS for `test/config-admin.test.js`.

- [ ] **Step 4: Commit helper and test work**

Run:

```bash
git add public/config-admin.js test/config-admin.test.js
git commit -m "test: cover admin console display helpers"
```

Only commit these files if the focused test passes. Existing user changes in the same files are part of the current feature baseline; do not revert them.

---

### Task 3: Rework Admin HTML Structure and CSS

**Files:**
- Modify: `public/config-admin.html`
- Test: `test/config-admin.test.js`

- [ ] **Step 1: Update static HTML tests to preserve feature anchors**

In `test/config-admin.test.js`, add or update a test to assert the new major layout markers and the preserved controls:

```js
test('config admin keeps all console controls after UI refresh', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'config-admin.html'), 'utf8');

  assert.match(html, /class="topbar"/);
  assert.match(html, /id="statusSummary"/);
  assert.match(html, /class="console-grid"/);
  assert.match(html, /id="addApiKeyButton"/);
  assert.match(html, /id="refreshButton"/);
  assert.match(html, /id="testResponseButton"/);
  assert.match(html, /id="addButton"/);
  assert.match(html, /name="configMode" value="token"/);
  assert.match(html, /name="configMode" value="apikey"/);
  assert.match(html, /name="apiKeySupport" value="gpt"/);
  assert.match(html, /name="apiKeySupport" value="claude"/);
  assert.match(html, /data-action="activate"/);
  assert.match(html, /data-action="delete"/);
  assert.match(html, /data-action="delete-apikey"/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm test -- test/config-admin.test.js
```

Expected: FAIL because `topbar`, `statusSummary`, and `console-grid` are not in the HTML yet.

- [ ] **Step 3: Replace the CSS theme and layout blocks**

In `public/config-admin.html`, update the CSS inside `<style>` to establish these classes. Keep existing form, table, badge, message, and hidden section semantics, but replace the current large glassmorphism layout with this control-console structure:

```css
    :root {
      --page: #f4f7f9;
      --surface: #ffffff;
      --surface-muted: #f8fafb;
      --surface-strong: #eef3f6;
      --line: #dbe3e8;
      --line-strong: #c7d2da;
      --text: #16212b;
      --muted: #647382;
      --accent: #123447;
      --accent-soft: #e6eef2;
      --active: #0f766e;
      --active-soft: #dff5ef;
      --success: #216843;
      --success-soft: #e4f4ea;
      --warning: #9b5d16;
      --warning-soft: #fff2d8;
      --danger: #a23636;
      --danger-soft: #f9e6e6;
      --shadow: 0 18px 44px rgba(22, 33, 43, 0.08);
      --radius: 12px;
      --mono: "SFMono-Regular", "Menlo", "Monaco", "Courier New", monospace;
      --sans: "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--sans);
      color: var(--text);
      background:
        linear-gradient(135deg, rgba(18, 52, 71, 0.05), transparent 32%),
        linear-gradient(180deg, #fbfcfd 0%, var(--page) 48%, #edf3f6 100%);
    }

    .page {
      max-width: 1280px;
      margin: 0 auto;
      padding: 28px 24px 48px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 16px;
    }

    .page-title {
      margin: 0 0 4px;
      font-size: 26px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .page-subtitle {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
      font-size: 14px;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
      margin: 0;
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .status-card,
    .panel,
    .table-wrap {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    .status-card {
      padding: 16px;
      min-height: 112px;
      display: grid;
      align-content: space-between;
      gap: 12px;
    }

    .status-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .status-value {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.15;
    }

    .status-detail {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .console-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.85fr);
      gap: 16px;
      align-items: start;
      margin-bottom: 16px;
    }
```

Also update related selectors:

```css
    .panel {
      padding: 18px;
    }

    .panel-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .panel-title {
      margin: 0;
      font-size: 18px;
      line-height: 1.25;
    }

    .panel-note {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .runtime-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tag.ok,
    .status-card.ok {
      background: var(--success-soft);
      color: var(--success);
    }

    .tag.warn,
    .status-card.warn {
      background: var(--warning-soft);
      color: var(--warning);
    }

    .tag.danger {
      background: var(--danger-soft);
      color: var(--danger);
    }

    .tag.active,
    .status-card.active {
      background: var(--active-soft);
      color: var(--active);
    }

    .tag.muted,
    .status-card.muted {
      background: var(--surface-muted);
      color: var(--muted);
    }
```

Keep `input`, `textarea`, `.mode-switch`, `.mode-option`, `.support-options`, `.key-list`, `.table-wrap`, `table`, `.account-id-cell`, and `.action-cell` definitions, but tune radii and spacing to the new `--radius` scale. Keep this responsive block:

```css
    @media (max-width: 980px) {
      .topbar,
      .panel-head {
        align-items: stretch;
        flex-direction: column;
      }

      .toolbar {
        justify-content: flex-start;
      }

      .status-grid,
      .console-grid,
      .form-grid,
      .mode-switch {
        grid-template-columns: 1fr;
      }
    }

    @media (min-width: 700px) and (max-width: 980px) {
      .status-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
```

- [ ] **Step 4: Rework body markup into console regions**

Replace the current `<main class="page">` contents with this structure, preserving all IDs:

```html
    <header class="topbar">
      <div>
        <h1 class="page-title">Airouter 管理控制台</h1>
        <p class="page-subtitle">管理入口 apikey、上游账号和当前运行态。</p>
      </div>
      <div class="toolbar">
        <button class="secondary" type="button" id="refreshButton">刷新</button>
        <button class="secondary" type="button" id="testResponseButton">测试请求</button>
        <button class="primary" type="button" id="addApiKeyButton">新增随机 apikey</button>
      </div>
    </header>

    <div id="message" class="message" role="status" aria-live="polite"></div>
    <section class="status-grid" id="statusSummary" aria-label="管理状态摘要"></section>

    <section class="console-grid">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">新增配置项</h2>
            <p class="panel-note">Token 适合 ChatGPT Codex 登录态；API Key 适合兼容上游或 Claude Messages。</p>
          </div>
        </div>

        <div class="mode-switch" role="radiogroup" aria-label="配置模式">
          <!-- keep the two existing label.mode-option blocks -->
        </div>

        <!-- keep tokenConfigPanel, apiKeyConfigPanel, and addButton action -->
      </div>

      <aside class="panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">访问控制</h2>
            <p class="panel-note">入口 apikey 为空时，请求不会校验 apikey。</p>
          </div>
          <span id="apiKeyStatusBadge" class="badge note">未读取</span>
        </div>
        <div id="apiKeysList" class="key-list"></div>
      </aside>
    </section>

    <section class="panel list-panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">上游配置</h2>
          <p class="panel-note">查看运行态、手动切换当前配置，或删除不再使用的上游。</p>
        </div>
      </div>
      <section id="cards"></section>
    </section>
```

Move the hidden `responsesSettingsSection` below the console grid or keep it inside the page with `hidden`; do not remove it. It must still contain `saveResponsesSettingsButton` and `responsesModelAliasesInput`.

- [ ] **Step 5: Run the focused test and verify the static anchors pass**

Run:

```bash
npm test -- test/config-admin.test.js
```

Expected: PASS for static HTML anchor tests and pure helper tests.

---

### Task 4: Wire Summary Rendering and Runtime Tags

**Files:**
- Modify: `public/config-admin.html`
- Test: `test/config-admin.test.js`

- [ ] **Step 1: Add DOM reference and helper imports in the inline script**

In `public/config-admin.html`, add:

```js
    const statusSummaryEl = document.getElementById('statusSummary');
```

Extend the `window.AirouterConfigAdmin` destructuring with:

```js
      buildAdminStatusSummary,
      extractRuntimeStatusTags,
```

- [ ] **Step 2: Add rendering functions for summary cards and tags**

Add these functions after `renderHeader`:

```js
    function renderStatusSummary(data) {
      statusSummaryEl.innerHTML = buildAdminStatusSummary(data).map(item => `
        <article class="status-card ${escapeHtml(item.tone)}">
          <div class="status-label">${escapeHtml(item.label)}</div>
          <div class="status-value">${escapeHtml(item.value)}</div>
          <div class="status-detail">${escapeHtml(item.detail)}</div>
        </article>
      `).join('');
    }

    function renderRuntimeTags(runtime) {
      return `
        <div class="runtime-tags">
          ${extractRuntimeStatusTags(runtime).map(tag => `
            <span class="tag ${escapeHtml(tag.tone)}">${escapeHtml(tag.label)}</span>
          `).join('')}
        </div>
      `;
    }
```

- [ ] **Step 3: Call summary rendering whenever snapshot changes**

In `renderHeader(data)`, after `snapshot = data;`, add:

```js
      renderStatusSummary(data);
```

This ensures load, add, delete, refresh, and activate paths all update the summary through their existing `renderHeader(snapshot)` calls.

- [ ] **Step 4: Replace runtime summary display inside `renderSummary`**

Change `renderSummary(runtime)` to:

```js
    function renderSummary(runtime) {
      const summaryText = runtime && runtime.runtime_summary ? runtime.runtime_summary : '暂无运行态数据';

      return `
        <div class="summary-cell">
          ${renderRuntimeTags(runtime)}
          <div class="summary-raw">${escapeHtml(summaryText)}</div>
        </div>
      `;
    }
```

Add CSS for `.summary-raw`:

```css
    .summary-raw {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
```

- [ ] **Step 5: Ensure auth failure clears summary safely**

In the `error.status === 401` branch of `loadSnapshot`, add:

```js
          statusSummaryEl.innerHTML = '<article class="status-card warn"><div class="status-label">管理鉴权</div><div class="status-value">无效</div><div class="status-detail">请使用正确的 auth_token 链接访问</div></article>';
```

- [ ] **Step 6: Run the focused test**

Run:

```bash
npm test -- test/config-admin.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit HTML structure and rendering work**

Run:

```bash
git add public/config-admin.html test/config-admin.test.js
git commit -m "feat: refresh admin console layout"
```

Only commit if the focused test passes.

---

### Task 5: Full Verification and Browser QA

**Files:**
- Verify: `public/config-admin.html`
- Verify: `public/config-admin.js`
- Verify: `test/config-admin.test.js`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Open the local admin page in the browser**

Use the existing local service at `http://127.0.0.1:3009/admin/configs/v2?auth_token=<local token>`. Do not print the token in the final answer.

Expected desktop checks:

- Topbar shows title plus `刷新`, `测试请求`, and `新增随机 apikey`.
- Status summary shows four cards.
- `新增配置项` panel shows Token/API Key mode switch.
- `访问控制` panel shows the apikey status badge and list or empty state.
- `上游配置` table shows current config, identity, description, runtime tags, and actions.
- Hidden Responses settings still does not visually appear.

- [ ] **Step 3: Check desktop screenshot**

Capture a desktop screenshot.

Expected:

- No overlapping text.
- Topbar controls stay in one row at desktop width.
- Summary cards have stable heights.
- Table text wraps within its cells.
- Delete buttons remain visually dangerous but not oversized.

- [ ] **Step 4: Check narrow viewport**

Set viewport around `390x844` or use the browser viewport capability if available, then reload.

Expected:

- Topbar actions wrap cleanly.
- Status cards stack or form a two-column grid.
- New config and access-control panels stack vertically.
- Table remains horizontally scrollable in its container.
- Buttons and labels do not overflow their parent controls.

- [ ] **Step 5: Run a feature preservation smoke check**

From the visible page, verify without performing destructive actions:

- `刷新` button is visible and enabled.
- `测试请求` button is visible and enabled.
- `新增随机 apikey` button is visible and enabled.
- Token/API Key radio controls toggle the visible form panel.
- Existing config rows still show `切换` or disabled `当前`.
- Existing config rows still show `删除`.
- Existing apikey rows, if present, still show `删除`.

Do not delete live entries during smoke testing.

- [ ] **Step 6: Commit verification fixes if needed**

If browser QA reveals layout defects, patch the relevant CSS/HTML and rerun:

```bash
npm test
```

Then commit:

```bash
git add public/config-admin.html public/config-admin.js test/config-admin.test.js
git commit -m "fix: polish admin console responsive layout"
```

Skip this commit if no fixes are needed after Task 4.

---

## Self-Review Notes

- Spec coverage:
  - Status-first layout is covered by Tasks 3 and 4.
  - Function preservation is covered by Task 3 static anchors and Task 5 smoke checks.
  - Runtime readability is covered by Tasks 1, 2, and 4.
  - No backend/API/config changes are included.
  - Responsive verification is covered by Task 5.
- Placeholder scan: no placeholder markers are present.
- Type consistency:
  - `buildAdminStatusSummary(snapshot)` returns `{ label, value, tone, detail }[]`.
  - `extractRuntimeStatusTags(runtime)` returns `{ label, tone }[]`.
  - `getActiveConfigLabel(snapshot)` returns a display string.
  - These names are used consistently in tests, exports, and inline rendering.
