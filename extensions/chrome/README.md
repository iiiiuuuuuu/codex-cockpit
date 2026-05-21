# ai-cockpit Chrome 插件

这是一个无需打包的解压版 Chrome 插件，用来从浏览器工具栏管理本机 ai-cockpit。

## 功能

- 查看服务是否可访问。
- 打开管理页。
- 刷新账号额度。
- 查看最近日志。
- 启动、重启、停止本地服务。
- 复制重启命令作为兜底。

## 安装插件

1. 打开 Chrome：`chrome://extensions/`
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录：`extensions/chrome`。
5. 点击工具栏里的 `ai-cockpit 控制台` 图标。

## 两种模式

### 浏览器模式

只加载插件即可。

可以使用：

- 查看状态
- 打开管理页
- 刷新额度
- 查看日志
- 复制重启命令

限制：服务必须已经启动，插件不能直接拉起本机进程。

### 本机控制模式

如果要在插件里直接点击“启动 / 重启 / 停止”，还需要安装 Chrome Native Messaging 本地宿主。

安装方式：

```text
extensions/chrome/native/Install.command
```

双击运行一次即可。之后重新加载插件或重启 Chrome。

插件的 `manifest.json` 内置了固定 `key`，所以扩展 ID 会稳定为：

```text
gcfmefhkgemdoeodobelhijffmdoaiap
```

安装脚本会自动计算这个 ID，通常不需要手工复制。

为什么需要这一步：Chrome 出于安全限制，不允许扩展仅靠自身执行本机命令。Native Messaging 宿主是 Chrome 官方提供的本机进程桥接方式。

卸载本地宿主：

```text
extensions/chrome/native/Uninstall.command
```

本地宿主只接受 `start`、`restart`、`stop` 三个固定动作，并且会校验仓库目录里存在 `package.json` 和 `run.js`。它不会执行插件传入的任意 shell 命令。

## 配置

- 服务地址：默认 `http://127.0.0.1:3009`。
- 管理 `auth_token`：从启动日志里的管理后台 URL 复制，例如：

```text
http://localhost:3009/admin/configs/v2?auth_token=auth_xxx
```

- 仓库路径：用于生成“复制启动命令”和“复制重启命令”。

如果已经安装本地宿主，仓库路径也会用于执行 `npm start`、`npm run restart` 和 `npm run stop`。
