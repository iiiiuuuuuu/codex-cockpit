# macOS Tauri Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated macOS Tauri desktop wrapper that starts, stops, monitors, and opens the existing airouter service with a bundled Node.js runtime.

**Architecture:** Add all product code under `desktop/`. The Tauri backend copies an airouter resource bundle into `~/Library/Application Support/Airouter/airouter/`, runs `run.js` from that writable directory with a bundled macOS Node sidecar, and exposes service-control commands to a polished local console UI. Existing service files remain source-of-truth and are copied by build/prep scripts, not edited for desktop behavior.

**Tech Stack:** Tauri v2, Rust 2024 edition, vanilla HTML/CSS/JavaScript, Tauri JavaScript API, macOS Node.js sidecar binaries, Node.js build helper scripts.

---

## File Structure

- Create: `desktop/package.json`
  - Defines desktop-only scripts: `prepare:resources`, `prepare:node`, `prepare`, `tauri`, `dev`, and `build`.
- Create: `desktop/README.md`
  - Explains macOS scope, bundled Node preparation, local dev, and build commands.
- Create: `desktop/index.html`
  - Static shell for the Tauri console.
- Create: `desktop/src/main.js`
  - Calls Tauri commands, renders service status, triggers actions, and polls logs.
- Create: `desktop/src/styles.css`
  - Implements the “precise local console” visual system using focused operational controls.
- Create: `desktop/scripts/prepare-resources.mjs`
  - Copies root airouter service files into `desktop/src-tauri/resources/airouter/` without modifying root files.
- Create: `desktop/scripts/prepare-node.mjs`
  - Downloads or reuses a macOS Node.js binary and writes Tauri sidecar names into `desktop/src-tauri/binaries/`.
- Create: `desktop/src-tauri/Cargo.toml`
  - Defines the Tauri Rust app and dependencies.
- Create: `desktop/src-tauri/build.rs`
  - Runs Tauri build metadata generation.
- Create: `desktop/src-tauri/tauri.conf.json`
  - Defines the macOS app, frontend dev path, bundled resources, sidecar binaries, and permissions.
- Create: `desktop/src-tauri/capabilities/default.json`
  - Grants the frontend access to the app commands needed by this wrapper.
- Create: `desktop/src-tauri/src/main.rs`
  - Implements runtime initialization, service command execution, status detection, log reading, admin URL creation, and Finder/browser open commands.
- Create: `desktop/src-tauri/icons/.gitkeep`
  - Keeps icon directory present without committing generated icons in this first version.
- Modify: `.gitignore`
  - Ignore generated desktop resources, sidecar binaries, Tauri build outputs, and desktop dependency folders.

Do not modify:

- `run.js`
- `openai.js`
- `app/`
- `public/`
- Root `package.json` service script semantics

## Task 1: Create Desktop Scaffold

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/README.md`
- Create: `desktop/index.html`
- Create: `desktop/src/main.js`
- Create: `desktop/src/styles.css`
- Create: `desktop/src-tauri/icons/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Create desktop package metadata**

Create `desktop/package.json`:

```json
{
  "name": "airouter-desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "prepare:resources": "node scripts/prepare-resources.mjs",
    "prepare:node": "node scripts/prepare-node.mjs",
    "prepare": "npm run prepare:resources && npm run prepare:node",
    "tauri": "tauri",
    "dev": "npm run prepare && tauri dev",
    "build": "npm run prepare && tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0"
  }
}
```

- [ ] **Step 2: Add desktop README**

Create `desktop/README.md`:

```markdown
# Airouter Desktop

macOS-only Tauri wrapper for the existing airouter Node.js service.

The desktop app keeps all runtime state in:

```text
~/Library/Application Support/Airouter/airouter/
```

It does not modify the root service files. Build preparation copies the service into `desktop/src-tauri/resources/airouter/` and places macOS Node.js sidecars in `desktop/src-tauri/binaries/`.

## Development

```bash
cd desktop
npm install
npm run prepare
npm run dev
```

If `npm` is unavailable in the shell, use a Node.js distribution that includes npm for desktop dependency installation. The packaged app itself does not rely on system Node.js.

## Build

```bash
cd desktop
npm run build
```
```

- [ ] **Step 3: Add static HTML shell**

Create `desktop/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Airouter Desktop</title>
    <link rel="stylesheet" href="./src/styles.css" />
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Local Control Surface</p>
          <h1>Airouter Desktop</h1>
        </div>
        <div class="status-pill" data-status="unknown" id="statusPill">
          <span></span>
          <strong>检查中</strong>
        </div>
      </header>

      <section class="status-grid" aria-label="服务状态">
        <article class="metric">
          <span>服务</span>
          <strong id="serviceState">-</strong>
        </article>
        <article class="metric">
          <span>端口</span>
          <strong id="servicePort">-</strong>
        </article>
        <article class="metric">
          <span>PID</span>
          <strong id="servicePid">-</strong>
        </article>
        <article class="metric">
          <span>配置</span>
          <strong id="configState">-</strong>
        </article>
      </section>

      <section class="workspace">
        <section class="panel control-panel" aria-label="服务操作">
          <div class="section-heading">
            <p class="eyebrow">Service</p>
            <h2>运行控制</h2>
          </div>
          <div class="action-grid">
            <button class="primary" id="startBtn" type="button">启动</button>
            <button id="stopBtn" type="button">停止</button>
            <button id="restartBtn" type="button">重启</button>
            <button id="openAdminBtn" type="button">应用内打开管理页</button>
            <button id="openBrowserBtn" type="button">浏览器打开</button>
            <button id="revealBtn" type="button">打开运行目录</button>
          </div>
          <dl class="details">
            <div>
              <dt>管理地址</dt>
              <dd id="adminUrl">-</dd>
            </div>
            <div>
              <dt>运行目录</dt>
              <dd id="runtimeDir">-</dd>
            </div>
            <div>
              <dt>最近消息</dt>
              <dd id="lastMessage">-</dd>
            </div>
          </dl>
        </section>

        <section class="panel log-panel" aria-label="最近日志">
          <div class="section-heading row">
            <div>
              <p class="eyebrow">Logs</p>
              <h2>最近日志</h2>
            </div>
            <button class="ghost" id="refreshBtn" type="button">刷新</button>
          </div>
          <pre id="logOutput">正在读取日志...</pre>
        </section>
      </section>
    </main>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Add temporary frontend logic**

Create `desktop/src/main.js` with a mocked status renderer. The real Tauri command wiring is added in Task 4.

```js
const state = {
  running: false,
  pid: null,
  port: null,
  hasConfig: false,
  adminUrl: null,
  runtimeDir: null,
  message: '等待 Tauri 后端连接',
  logs: 'Tauri 后端尚未连接。'
};

function text(value, fallback = '-') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function renderStatus(status) {
  const pill = document.querySelector('#statusPill');
  const pillLabel = pill.querySelector('strong');

  pill.dataset.status = status.running ? 'running' : 'stopped';
  pillLabel.textContent = status.running ? '运行中' : '已停止';

  document.querySelector('#serviceState').textContent = status.running ? '运行中' : '已停止';
  document.querySelector('#servicePort').textContent = text(status.port);
  document.querySelector('#servicePid').textContent = text(status.pid);
  document.querySelector('#configState').textContent = status.hasConfig ? '已就绪' : '缺失';
  document.querySelector('#adminUrl').textContent = text(status.adminUrl);
  document.querySelector('#runtimeDir').textContent = text(status.runtimeDir);
  document.querySelector('#lastMessage').textContent = text(status.message);
  document.querySelector('#logOutput').textContent = text(status.logs, '暂无日志');
}

renderStatus(state);
```

- [ ] **Step 5: Add operational styling**

Create `desktop/src/styles.css`:

```css
:root {
  color-scheme: light;
  --ink: #10202a;
  --muted: #61707a;
  --line: #d9e1e5;
  --paper: #f5f7f8;
  --panel: #ffffff;
  --panel-strong: #eaf0f2;
  --accent: #0b806f;
  --accent-dark: #075b50;
  --warn: #a54916;
  --stop: #7c2432;
  --shadow: 0 18px 48px rgba(16, 32, 42, 0.12);
  font-family: ui-rounded, "SF Pro Rounded", "Avenir Next", "Helvetica Neue", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 900px;
  min-height: 680px;
  color: var(--ink);
  background:
    linear-gradient(135deg, rgba(11, 128, 111, 0.08), transparent 34%),
    repeating-linear-gradient(90deg, rgba(16, 32, 42, 0.035) 0 1px, transparent 1px 74px),
    var(--paper);
}

button {
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 0 14px;
  color: var(--ink);
  background: var(--panel);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

button:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

button:disabled {
  cursor: wait;
  opacity: 0.58;
  transform: none;
}

.primary {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}

.ghost {
  min-height: 34px;
  background: transparent;
}

.shell {
  width: min(1180px, calc(100vw - 48px));
  margin: 0 auto;
  padding: 34px 0;
}

.topbar,
.workspace,
.status-grid {
  display: grid;
  gap: 18px;
}

.topbar {
  grid-template-columns: 1fr auto;
  align-items: end;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--accent-dark);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
  letter-spacing: 0;
}

h1 {
  font-size: 34px;
  line-height: 1.05;
}

h2 {
  font-size: 19px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-width: 112px;
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
}

.status-pill span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--warn);
  box-shadow: 0 0 0 5px rgba(165, 73, 22, 0.12);
}

.status-pill[data-status="running"] span {
  background: var(--accent);
  box-shadow: 0 0 0 5px rgba(11, 128, 111, 0.13);
}

.status-pill[data-status="stopped"] span {
  background: var(--stop);
  box-shadow: 0 0 0 5px rgba(124, 36, 50, 0.12);
}

.status-grid {
  grid-template-columns: repeat(4, 1fr);
  margin-bottom: 18px;
}

.metric,
.panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: var(--shadow);
}

.metric {
  padding: 18px;
}

.metric span {
  display: block;
  margin-bottom: 9px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.metric strong {
  display: block;
  min-height: 31px;
  overflow-wrap: anywhere;
  font-size: 24px;
}

.workspace {
  grid-template-columns: 420px 1fr;
  align-items: stretch;
}

.panel {
  padding: 20px;
}

.section-heading {
  margin-bottom: 18px;
}

.section-heading.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.details {
  display: grid;
  gap: 12px;
  margin: 20px 0 0;
}

.details div {
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

dt {
  margin-bottom: 5px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: "SF Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.45;
}

pre {
  min-height: 420px;
  max-height: 520px;
  margin: 0;
  padding: 16px;
  overflow: auto;
  border: 1px solid #20323d;
  border-radius: 8px;
  color: #dbe8e5;
  background: #10202a;
  font-family: "SF Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}
```

- [ ] **Step 6: Keep icon directory and ignore generated artifacts**

Create `desktop/src-tauri/icons/.gitkeep`.

Modify `.gitignore` by appending:

```gitignore

# Desktop wrapper generated artifacts
desktop/node_modules
desktop/package-lock.json
desktop/src-tauri/target
desktop/src-tauri/resources/airouter
desktop/src-tauri/binaries/node-*
```

- [ ] **Step 7: Commit scaffold**

Run:

```bash
git add .gitignore desktop/package.json desktop/README.md desktop/index.html desktop/src/main.js desktop/src/styles.css desktop/src-tauri/icons/.gitkeep
git commit -m "feat: scaffold macos desktop wrapper"
```

Expected: commit succeeds and no root service file is staged.

## Task 2: Add Resource and Node Preparation Scripts

**Files:**
- Create: `desktop/scripts/prepare-resources.mjs`
- Create: `desktop/scripts/prepare-node.mjs`

- [ ] **Step 1: Create airouter resource copier**

Create `desktop/scripts/prepare-resources.mjs`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(desktopDir, '..');
const destinationDir = path.join(desktopDir, 'src-tauri', 'resources', 'airouter');

const entries = [
  'run.js',
  'openai.js',
  'package.json',
  'package-lock.json',
  'openai.json.example',
  'openai-api-key.json.example',
  'app',
  'public',
  'node_modules'
];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyEntry(entry) {
  const source = path.join(rootDir, entry);
  const destination = path.join(destinationDir, entry);

  if (!(await exists(source))) {
    throw new Error(`Missing required airouter resource: ${source}`);
  }

  await fs.rm(destination, { recursive: true, force: true });
  await fs.cp(source, destination, {
    recursive: true,
    dereference: true,
    filter(sourcePath) {
      const base = path.basename(sourcePath);
      return base !== '.DS_Store';
    }
  });
}

await fs.rm(destinationDir, { recursive: true, force: true });
await fs.mkdir(destinationDir, { recursive: true });

for (const entry of entries) {
  await copyEntry(entry);
}

console.log(`Prepared airouter resources at ${destinationDir}`);
```

- [ ] **Step 2: Create macOS Node sidecar preparer**

Create `desktop/scripts/prepare-node.mjs`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const binariesDir = path.join(desktopDir, 'src-tauri', 'binaries');
const nodeVersion = process.env.AIROUTER_DESKTOP_NODE_VERSION || 'v22.15.1';
const platform = os.platform();
const arch = os.arch();

const targets = {
  arm64: {
    archiveArch: 'arm64',
    tauriName: 'node-aarch64-apple-darwin'
  },
  x64: {
    archiveArch: 'x64',
    tauriName: 'node-x86_64-apple-darwin'
  }
};

if (platform !== 'darwin') {
  throw new Error(`Airouter Desktop currently prepares bundled Node only on macOS, got ${platform}`);
}

if (!targets[arch]) {
  throw new Error(`Unsupported macOS architecture for bundled Node: ${arch}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, bytes);
}

const target = targets[arch];
const archiveName = `node-${nodeVersion}-darwin-${target.archiveArch}.tar.gz`;
const cacheDir = path.join(os.homedir(), '.cache', 'airouter-desktop');
const archivePath = path.join(cacheDir, archiveName);
const extractedDir = path.join(cacheDir, archiveName.replace(/\.tar\.gz$/, ''));
const sourceNode = path.join(extractedDir, 'bin', 'node');
const destinationNode = path.join(binariesDir, target.tauriName);
const url = `https://nodejs.org/dist/${nodeVersion}/${archiveName}`;

await fs.mkdir(cacheDir, { recursive: true });
await fs.mkdir(binariesDir, { recursive: true });

if (!(await exists(sourceNode))) {
  if (!(await exists(archivePath))) {
    console.log(`Downloading ${url}`);
    await download(url, archivePath);
  }

  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('tar', ['-xzf', archivePath, '-C', cacheDir], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Failed to extract ${archivePath}`);
  }
}

await fs.copyFile(sourceNode, destinationNode);
await fs.chmod(destinationNode, 0o755);

console.log(`Prepared bundled Node sidecar at ${destinationNode}`);
```

- [ ] **Step 3: Run resource preparation**

Run:

```bash
node desktop/scripts/prepare-resources.mjs
```

Expected: prints `Prepared airouter resources...` and creates `desktop/src-tauri/resources/airouter/`.

- [ ] **Step 4: Run Node sidecar preparation**

Run:

```bash
node desktop/scripts/prepare-node.mjs
```

Expected on macOS: downloads or reuses Node and creates either `desktop/src-tauri/binaries/node-aarch64-apple-darwin` or `desktop/src-tauri/binaries/node-x86_64-apple-darwin`.

- [ ] **Step 5: Commit scripts without generated resources**

Run:

```bash
git add desktop/scripts/prepare-resources.mjs desktop/scripts/prepare-node.mjs
git commit -m "feat: prepare desktop runtime resources"
```

Expected: generated `desktop/src-tauri/resources/airouter/` and `desktop/src-tauri/binaries/node-*` are ignored.

## Task 3: Implement Tauri Backend

**Files:**
- Create: `desktop/src-tauri/Cargo.toml`
- Create: `desktop/src-tauri/build.rs`
- Create: `desktop/src-tauri/tauri.conf.json`
- Create: `desktop/src-tauri/capabilities/default.json`
- Create: `desktop/src-tauri/src/main.rs`

- [ ] **Step 1: Create Rust package manifest**

Create `desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "airouter-desktop"
version = "0.1.0"
description = "Airouter Desktop"
authors = ["Airouter"]
edition = "2024"

[lib]
name = "airouter_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
dirs = "6"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: Add Tauri build script**

Create `desktop/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: Add Tauri configuration**

Create `desktop/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Airouter",
  "version": "0.1.0",
  "identifier": "local.airouter.desktop",
  "build": {
    "beforeDevCommand": "node scripts/prepare-resources.mjs && node scripts/prepare-node.mjs",
    "beforeBuildCommand": "node scripts/prepare-resources.mjs && node scripts/prepare-node.mjs",
    "devUrl": "../index.html",
    "frontendDist": "../"
  },
  "app": {
    "windows": [
      {
        "title": "Airouter Desktop",
        "width": 1120,
        "height": 760,
        "minWidth": 920,
        "minHeight": 680
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "resources": ["resources/airouter"],
    "externalBin": [
      "binaries/node-aarch64-apple-darwin",
      "binaries/node-x86_64-apple-darwin"
    ],
    "macOS": {
      "minimumSystemVersion": "11.0"
    }
  }
}
```

- [ ] **Step 4: Add command capability**

Create `desktop/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for Airouter Desktop",
  "windows": ["main", "admin"],
  "permissions": [
    "core:default",
    "opener:default"
  ]
}
```

- [ ] **Step 5: Implement backend commands**

Create `desktop/src-tauri/src/main.rs`:

```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const APP_DIR_NAME: &str = "Airouter";
const RUNTIME_DIR_NAME: &str = "airouter";
const CONFIG_FILE: &str = "openai.json";
const CONFIG_TEMPLATE_FILE: &str = "openai.json.example";
const PID_FILE: &str = "openai.pid";
const LOG_FILE: &str = "openai.log";
const DEFAULT_PORT: u16 = 3009;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStatus {
    running: bool,
    pid: Option<u32>,
    port: Option<u16>,
    has_config: bool,
    config_valid: bool,
    admin_url: Option<String>,
    runtime_dir: String,
    message: String,
    logs: String,
}

#[derive(Debug, Deserialize)]
struct ConfigShape {
    port: Option<Value>,
    auth_token: Option<String>,
}

fn app_data_root() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|dir| dir.join(APP_DIR_NAME).join(RUNTIME_DIR_NAME))
        .ok_or_else(|| "无法定位 macOS Application Support 目录".to_string())
}

fn resource_airouter_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let resolver = app.path();
    let resource_dir = resolver
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录: {error}"))?;
    Ok(resource_dir.join("resources").join("airouter"))
}

fn node_sidecar_path(app: &AppHandle) -> Result<PathBuf, String> {
    let resolver = app.path();
    let resource_dir = resolver
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录: {error}"))?;

    let name = if cfg!(target_arch = "aarch64") {
        "node-aarch64-apple-darwin"
    } else if cfg!(target_arch = "x86_64") {
        "node-x86_64-apple-darwin"
    } else {
        return Err("当前 macOS 架构暂未内置 Node.js".to_string());
    };

    let candidates = [
        resource_dir.join(name),
        resource_dir.join("binaries").join(name),
        resource_dir.join("..").join("Frameworks").join(name),
    ];

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| format!("找不到 bundled Node.js sidecar: {name}"))
}

fn copy_dir_if_missing(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        return Ok(());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| format!("无法定位目标父目录: {}", destination.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("无法创建目录 {}: {error}", parent.display()))?;

    copy_dir_recursive(source, destination)
        .map_err(|error| format!("复制运行资源失败 {} -> {}: {error}", source.display(), destination.display()))
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn ensure_runtime(app: &AppHandle) -> Result<PathBuf, String> {
    let runtime_dir = app_data_root()?;
    if !runtime_dir.exists() {
        let resources = resource_airouter_dir(app)?;
        copy_dir_if_missing(&resources, &runtime_dir)?;
    }

    let config_path = runtime_dir.join(CONFIG_FILE);
    let template_path = runtime_dir.join(CONFIG_TEMPLATE_FILE);
    if !config_path.exists() && template_path.exists() {
        fs::copy(&template_path, &config_path).map_err(|error| {
            format!(
                "无法从模板创建配置 {} -> {}: {error}",
                template_path.display(),
                config_path.display()
            )
        })?;
    }

    Ok(runtime_dir)
}

fn read_pid(runtime_dir: &Path) -> Option<u32> {
    let raw = fs::read_to_string(runtime_dir.join(PID_FILE)).ok()?;
    raw.trim().parse::<u32>().ok()
}

fn process_exists(pid: u32) -> bool {
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn parse_port(value: Option<Value>) -> Option<u16> {
    match value? {
        Value::Number(number) => number.as_u64().and_then(|port| u16::try_from(port).ok()),
        Value::String(text) => text.trim().parse::<u16>().ok(),
        _ => None,
    }
}

fn read_config(runtime_dir: &Path) -> Result<ConfigShape, String> {
    let raw = fs::read_to_string(runtime_dir.join(CONFIG_FILE))
        .map_err(|error| format!("无法读取 openai.json: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("openai.json 解析失败: {error}"))
}

fn build_admin_url(port: u16, auth_token: Option<&str>) -> String {
    let base = format!("http://localhost:{port}/admin/configs/v2");
    match auth_token.filter(|token| !token.trim().is_empty()) {
        Some(token) => format!("{base}?auth_token={token}"),
        None => base,
    }
}

fn tail_text(path: &Path, limit: usize) -> String {
    let Ok(raw) = fs::read_to_string(path) else {
        return "暂无日志".to_string();
    };

    let max = limit.max(1);
    let mut lines = raw.lines().rev().take(max).collect::<Vec<_>>();
    lines.reverse();
    lines.join("\n")
}

fn status_for_runtime(runtime_dir: PathBuf) -> ServiceStatus {
    let pid = read_pid(&runtime_dir);
    let running = pid.map(process_exists).unwrap_or(false);
    let has_config = runtime_dir.join(CONFIG_FILE).exists();
    let logs = tail_text(&runtime_dir.join(LOG_FILE), 160);

    let mut port = None;
    let mut admin_url = None;
    let mut config_valid = false;
    let mut message = if running { "服务运行中".to_string() } else { "服务未运行".to_string() };

    if has_config {
        match read_config(&runtime_dir) {
            Ok(config) => {
                config_valid = true;
                let selected_port = parse_port(config.port).unwrap_or(DEFAULT_PORT);
                port = Some(selected_port);
                admin_url = Some(build_admin_url(selected_port, config.auth_token.as_deref()));
            }
            Err(error) => {
                message = error;
            }
        }
    } else {
        message = "运行目录中缺少 openai.json".to_string();
    }

    ServiceStatus {
        running,
        pid,
        port,
        has_config,
        config_valid,
        admin_url,
        runtime_dir: runtime_dir.display().to_string(),
        message,
        logs,
    }
}

fn run_service_command(app: &AppHandle, action: &str) -> Result<(), String> {
    let runtime_dir = ensure_runtime(app)?;
    let node = node_sidecar_path(app)?;
    let mut command = Command::new(node);
    command.current_dir(&runtime_dir).arg("run.js");
    if action != "start" {
        command.arg(action);
    }
    command.env("AIROUTER_FORCE_INTERACTIVE", "0");
    command.env("RUN_STARTUP_CHECK_DELAY_MS", "1500");
    command.env("RUN_STARTUP_LOG_WAIT_MS", "800");
    command.env("RUN_STOP_WAIT_TIMEOUT_MS", "2500");
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let output = command
        .output()
        .map_err(|error| format!("执行服务命令失败: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    Err(format!("服务命令失败: {stdout}{stderr}"))
}

#[tauri::command]
fn get_status(app: AppHandle) -> Result<ServiceStatus, String> {
    let runtime_dir = ensure_runtime(&app)?;
    Ok(status_for_runtime(runtime_dir))
}

#[tauri::command]
fn start_service(app: AppHandle) -> Result<ServiceStatus, String> {
    run_service_command(&app, "start")?;
    get_status(app)
}

#[tauri::command]
fn stop_service(app: AppHandle) -> Result<ServiceStatus, String> {
    run_service_command(&app, "stop")?;
    get_status(app)
}

#[tauri::command]
fn restart_service(app: AppHandle) -> Result<ServiceStatus, String> {
    run_service_command(&app, "restart")?;
    get_status(app)
}

#[tauri::command]
fn read_recent_logs(app: AppHandle, limit: Option<usize>) -> Result<String, String> {
    let runtime_dir = ensure_runtime(&app)?;
    Ok(tail_text(&runtime_dir.join(LOG_FILE), limit.unwrap_or(160)))
}

#[tauri::command]
fn open_admin_window(app: AppHandle) -> Result<(), String> {
    let status = get_status(app.clone())?;
    let url = status
        .admin_url
        .ok_or_else(|| "管理地址不可用，请先检查配置".to_string())?;
    let parsed = tauri::Url::parse(&url).map_err(|error| format!("管理地址无效: {error}"))?;

    if let Some(window) = app.get_webview_window("admin") {
        window.set_focus().map_err(|error| format!("无法聚焦管理窗口: {error}"))?;
        window.navigate(parsed).map_err(|error| format!("无法打开管理页: {error}"))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "admin", WebviewUrl::External(parsed))
        .title("Airouter Admin")
        .inner_size(1240.0, 820.0)
        .build()
        .map_err(|error| format!("无法创建管理窗口: {error}"))?;
    Ok(())
}

#[tauri::command]
fn open_admin_in_browser(app: AppHandle) -> Result<(), String> {
    let status = get_status(app.clone())?;
    let url = status
        .admin_url
        .ok_or_else(|| "管理地址不可用，请先检查配置".to_string())?;
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|error| format!("无法打开浏览器: {error}"))
}

#[tauri::command]
fn reveal_runtime_dir(app: AppHandle) -> Result<(), String> {
    let runtime_dir = ensure_runtime(&app)?;
    tauri_plugin_opener::reveal_item_in_dir(runtime_dir)
        .map_err(|error| format!("无法在 Finder 中打开运行目录: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_service,
            stop_service,
            restart_service,
            open_admin_window,
            open_admin_in_browser,
            reveal_runtime_dir,
            read_recent_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running Airouter Desktop");
}

fn main() {
    run();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_admin_url_with_auth_token() {
        assert_eq!(
            build_admin_url(3009, Some("auth_abc")),
            "http://localhost:3009/admin/configs/v2?auth_token=auth_abc"
        );
    }

    #[test]
    fn builds_admin_url_without_empty_auth_token() {
        assert_eq!(
            build_admin_url(3009, Some("")),
            "http://localhost:3009/admin/configs/v2"
        );
    }

    #[test]
    fn parses_numeric_and_string_ports() {
        assert_eq!(parse_port(Some(Value::from(3010))), Some(3010));
        assert_eq!(parse_port(Some(Value::from("3011"))), Some(3011));
        assert_eq!(parse_port(Some(Value::from("bad"))), None);
    }

    #[test]
    fn tails_last_lines() {
        let temp = tempfile::tempdir().expect("tempdir");
        let log = temp.path().join("openai.log");
        fs::write(&log, "a\nb\nc\nd\n").expect("write log");
        assert_eq!(tail_text(&log, 2), "c\nd");
    }
}
```

- [ ] **Step 6: Run Rust formatting**

Run:

```bash
cd desktop/src-tauri && cargo fmt
```

Expected: formatting completes without output.

- [ ] **Step 7: Run Rust tests**

Run:

```bash
cd desktop/src-tauri && cargo test
```

Expected: Rust tests pass. If Tauri config generation requires prepared resources, run `node ../scripts/prepare-resources.mjs && node ../scripts/prepare-node.mjs` first and rerun.

- [ ] **Step 8: Commit backend**

Run:

```bash
git add desktop/src-tauri/Cargo.toml desktop/src-tauri/build.rs desktop/src-tauri/tauri.conf.json desktop/src-tauri/capabilities/default.json desktop/src-tauri/src/main.rs
git commit -m "feat: add desktop service backend"
```

Expected: commit succeeds.

## Task 4: Wire Frontend to Tauri Commands

**Files:**
- Modify: `desktop/src/main.js`
- Modify: `desktop/src/styles.css`

- [ ] **Step 1: Replace mocked frontend logic with command integration**

Replace `desktop/src/main.js` with:

```js
import { invoke } from '@tauri-apps/api/core';

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
  $(selectors.statusPill).dataset.status = 'error';
  $(selectors.statusPill).querySelector('strong').textContent = '异常';
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

async function refreshLogs() {
  try {
    const logs = await invoke('read_recent_logs', { limit: 160 });
    $(selectors.logOutput).textContent = text(logs, '暂无日志');
  } catch (error) {
    $(selectors.logOutput).textContent = String(error);
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
await refreshStatus();
setInterval(() => {
  if (!busy && latestStatus?.running) {
    refreshStatus();
  }
}, 5000);
```

- [ ] **Step 2: Add error-state styling and button focus**

Append to `desktop/src/styles.css`:

```css
button:focus-visible {
  outline: 3px solid rgba(11, 128, 111, 0.28);
  outline-offset: 2px;
}

.status-pill[data-status="error"] span {
  background: var(--warn);
  box-shadow: 0 0 0 5px rgba(165, 73, 22, 0.14);
}
```

- [ ] **Step 3: Run frontend syntax check**

Run:

```bash
node --check desktop/src/main.js
```

Expected: no syntax errors.

- [ ] **Step 4: Commit frontend wiring**

Run:

```bash
git add desktop/src/main.js desktop/src/styles.css
git commit -m "feat: wire desktop console actions"
```

Expected: commit succeeds.

## Task 5: Verify End-to-End Behavior

**Files:**
- No product files unless verification exposes a bug.

- [ ] **Step 1: Verify root service tests still pass**

Run:

```bash
node --test
```

Expected: existing service tests pass.

- [ ] **Step 2: Verify generated resources can be created from root files**

Run:

```bash
node desktop/scripts/prepare-resources.mjs
```

Expected: resource copy succeeds and root service files remain unmodified.

- [ ] **Step 3: Verify bundled Node sidecar can be created**

Run:

```bash
node desktop/scripts/prepare-node.mjs
desktop/src-tauri/binaries/node-$(uname -m | sed 's/arm64/aarch64/; s/x86_64/x86_64/')-apple-darwin --version
```

Expected: prints the configured Node version.

- [ ] **Step 4: Verify Rust tests**

Run:

```bash
cd desktop/src-tauri && cargo test
```

Expected: Rust tests pass.

- [ ] **Step 5: Verify Tauri build tooling if dependencies are installed**

Run:

```bash
cd desktop && npm install && npm run build
```

Expected: Tauri build completes on macOS. If `npm` is not available in the shell, record that the packaged runtime is still prepared by scripts but Tauri JavaScript dependencies could not be installed in this environment.

- [ ] **Step 6: Visual check the static console**

Open `desktop/index.html` in a browser or Tauri dev window. Verify:

- Core actions are visible without scrolling at 1120 x 760.
- Text does not overflow buttons, metrics, or details.
- Error/running/stopped states are visually distinct.
- The page is an operational console, not a landing page.

- [ ] **Step 7: Final non-intrusion check**

Run:

```bash
git diff --name-only HEAD~4..HEAD
```

Expected: changed product files are under `desktop/`, plus `.gitignore` and this plan. No changes to `run.js`, `openai.js`, `app/`, `public/`, or root service script semantics.

## Self-Review

- Spec coverage: The plan covers an isolated `desktop/` app, bundled macOS Node sidecar preparation, writable app data runtime directory, start/stop/restart/status/log commands, admin page opening, frontend control panel, and non-intrusion boundaries.
- Placeholder scan: No `TBD`, `TODO`, “implement later”, or “similar to” placeholders are present in implementation steps.
- Type consistency: Frontend expects camelCase fields from `ServiceStatus`; Rust uses `#[serde(rename_all = "camelCase")]`. Commands match the spec names: `get_status`, `start_service`, `stop_service`, `restart_service`, `open_admin_window`, `open_admin_in_browser`, `reveal_runtime_dir`, and `read_recent_logs`.
