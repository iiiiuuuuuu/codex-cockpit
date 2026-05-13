# macOS Tauri 桌面包装设计

## 背景

airouter 目前是一个 Node.js 本地代理服务，通过 `node run.js start` 启动，管理页由服务自身暴露在 `/admin/configs`。这种方式适合开发者使用，但如果要交给不熟悉命令行或未安装 Node.js 的用户，就需要一个桌面应用包装层。

本次需求是用 Tauri 写一个 macOS 应用包装 airouter，并且不要侵入现有代码。用户已经明确第一版只支持 macOS，且应用必须自带 Node.js，不能要求用户机器预装 Node。

## 目标

- 新增一个 macOS Tauri 桌面应用包装层。
- 内置 macOS Node.js runtime，用户无需安装 Node.js。
- 保持现有 airouter 服务代码不变，不修改 `run.js`、`openai.js`、`app/`、`public/` 的运行逻辑。
- Tauri 应用可以启动、停止、重启 airouter 服务。
- Tauri 应用可以读取服务状态、端口、PID、管理地址和最近日志。
- Tauri 应用可以打开管理页，优先在应用内窗口展示，也提供外部浏览器打开能力。
- Tauri 应用使用独立 `desktop/` 目录承载前端、Rust/Tauri 配置、sidecar 和打包资源。

## 非目标

- 第一版不支持 Windows 或 Linux。
- 第一版不把 airouter 服务改写为 Rust。
- 第一版不把现有 Node 服务打成单个 server binary。
- 第一版不改现有配置文件格式。
- 第一版不迁移现有代理、调度、额度刷新、请求转发或管理 API 逻辑。
- 第一版不新增云同步、自动更新、菜单栏常驻、登录账号体系或多实例管理。

## 总体方案

采用“独立 Tauri 外壳 + bundled Node sidecar + 可写运行目录”的方案。

新增目录：

```text
desktop/
  package.json
  index.html
  src/
    main.js
    styles.css
  src-tauri/
    Cargo.toml
    tauri.conf.json
    src/
      main.rs
    binaries/
      node-aarch64-apple-darwin
      node-x86_64-apple-darwin
    resources/
      airouter/
        run.js
        openai.js
        package.json
        package-lock.json
        openai.json.example
        app/
        public/
        node_modules/
```

`desktop/` 是唯一新增的产品代码区域。现有 airouter 文件只作为打包资源复制进 `desktop/src-tauri/resources/airouter/`，不改变原文件的运行语义。

## 运行模型

Tauri app 启动后先进入本地控制台首页，而不是直接打开管理页。

控制台负责：

- 检查 app data 目录中是否已有 airouter 运行目录。
- 第一次启动时，把 bundled `resources/airouter` 复制到 app data 目录。
- 用 bundled Node 执行 app data 目录中的 `run.js start`。
- 用 bundled Node 执行 app data 目录中的 `run.js stop`。
- 从 app data 运行目录读取：
  - `openai.json`
  - `openai.pid`
  - `openai.control.json`
  - `openai.log`
- 根据 `openai.json` 的 `port` 和 `auth_token` 拼接管理页地址。

默认运行目录：

```text
~/Library/Application Support/Airouter/airouter/
```

该目录是可写目录，用于保存用户配置、pid、日志和运行时控制文件。应用更新时不能覆盖用户已有 `openai.json`。

## Node.js 打包策略

第一版内置 macOS Node.js sidecar：

- `node-aarch64-apple-darwin`
- `node-x86_64-apple-darwin`

Tauri 根据当前架构选择正确 sidecar。Rust 侧不假设系统 PATH 中存在 `node`。

服务启动命令等价于：

```bash
<bundled-node> run.js start
```

服务停止命令等价于：

```bash
<bundled-node> run.js stop
```

命令执行目录必须是 app data 中的 airouter 运行目录，而不是源码仓库目录，也不是 Tauri resource 只读目录。

## airouter 资源复制

第一次启动时：

1. 创建 app data 运行目录。
2. 复制 bundled `resources/airouter` 到该目录。
3. 如果 `openai.json` 不存在，复制 `openai.json.example` 为 `openai.json`，并由后续启动流程补齐 `auth_token` 或提示用户配置。

后续启动时：

- 如果 app data 目录已经存在，不覆盖 `openai.json`。
- 可以覆盖静态服务文件、`app/`、`public/`、`run.js` 和 `openai.js`，但第一版为了降低风险，默认不做自动覆盖。
- 后续版本如需升级运行目录，应单独设计“安全升级”流程。

## Tauri 命令接口

Rust 侧暴露给前端的命令：

- `get_status()`
  - 返回服务是否运行、pid、端口、管理 URL、是否有配置文件、最近日志摘要。
- `start_service()`
  - 初始化运行目录，然后启动 airouter。
- `stop_service()`
  - 停止 airouter。
- `restart_service()`
  - 顺序执行 stop 和 start。
- `open_admin_window()`
  - 在 Tauri WebView 中打开管理页。
- `open_admin_in_browser()`
  - 用系统浏览器打开管理页。
- `reveal_runtime_dir()`
  - 在 Finder 中打开 app data 运行目录。
- `read_recent_logs(limit)`
  - 读取最近日志内容，默认限制长度，避免 UI 卡顿。

所有命令都只操作 app data 运行目录，不操作源码仓库中的 `openai.json`、pid 或日志。

## 前端界面设计

使用 `frontend-design` 指定的高质量界面方向，但应用性质是本地运维工具，不做 landing page。

视觉方向：

- 精密本地控制台。
- 主色为深墨蓝，配合浅灰白背景和少量青绿色状态色。
- 首页直接展示服务状态和操作，不放营销介绍。
- 信息密度适中，桌面应用窗口内不需要滚动才能看到核心动作。

主界面区域：

1. 顶部标题栏
   - Airouter Desktop
   - 当前服务状态
   - 管理页快捷入口
2. 状态卡片
   - 服务状态：运行中/已停止/异常
   - 端口
   - PID
   - 配置状态
3. 操作区
   - 启动
   - 停止
   - 重启
   - 打开管理页
   - 打开运行目录
4. 日志区
   - 最近日志摘要
   - 刷新按钮
   - 错误状态突出显示

界面必须清楚区分“服务未启动”“配置缺失”“端口被占用”“启动失败”这几类状态。

## 管理页打开方式

第一版支持两种方式：

- 应用内打开：新建 Tauri WebView 窗口指向管理 URL。
- 浏览器打开：调用系统浏览器打开管理 URL。

应用内管理页只是加载现有 airouter 管理页，不复制或改写管理页 HTML。这样避免维护两套管理 UI。

## 错误处理

- 找不到 bundled Node：显示“应用打包不完整”，并提示重新安装。
- 运行目录初始化失败：显示具体文件路径和系统错误。
- `openai.json` 不存在或解析失败：显示配置错误，并提供打开运行目录按钮。
- 端口被占用：显示端口号，提示用户停止占用进程或修改配置。
- 启动后服务未在预期时间内可访问：显示最近日志。
- 停止失败：显示 PID 和最近日志。

错误信息应优先可操作，不只显示原始堆栈。

## 测试策略

自动测试：

- 保留现有 `node --test` 全量测试。
- 如果 Rust 侧逻辑可拆为纯函数，新增 Rust 单元测试覆盖：
  - 管理 URL 拼接。
  - 运行目录路径计算。
  - 日志截断。
  - 状态模型生成。

手工验证：

- macOS 上启动 Tauri dev app。
- 首次启动能创建 app data 运行目录。
- 启动服务后能读取 PID、端口和管理 URL。
- 能在应用内或浏览器打开管理页。
- 停止服务后状态变为已停止。
- 未安装系统 Node.js 的情况下，仍能通过 bundled Node 启动服务。

## 实施边界

本次实现允许新增：

- `desktop/`
- `desktop/src-tauri/`
- `desktop/src-tauri/resources/airouter/`
- `desktop/src-tauri/binaries/`
- 必要的 desktop README 或脚本

本次实现不允许修改：

- `run.js`
- `openai.js`
- `app/`
- `public/`
- 根目录现有 `package.json` 的服务脚本语义

如果确实需要根目录新增一个便利脚本，例如 `npm run desktop`，必须作为独立入口，不改变现有 `start`、`stop`、`restart`、`logs`、`test` 的行为。

## 验收标准

- 新增 Tauri app 代码都位于 `desktop/` 下。
- 用户不安装 Node.js 也能通过 Tauri app 启动 airouter。
- 现有 airouter 服务测试仍然通过。
- 应用能显示服务状态、端口、PID、管理 URL 和最近日志。
- 应用能启动、停止、重启服务。
- 应用能打开现有管理页。
- 源码仓库中的现有服务文件未被 Tauri 需求改写。
