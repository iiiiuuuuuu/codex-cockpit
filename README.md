# ai-cockpit

ai-cockpit 是一个运行在本机的 AI API 路由器。它把 ChatGPT/Codex 登录态、OpenAI 兼容 API Key、Claude Messages 兼容 API Key 统一接到一个本地地址上，让 Codex、Claude Code、CC Switch 或其他 OpenAI/Anthropic 兼容客户端都可以通过 ai-cockpit 访问上游。

默认本地入口是：

```text
http://127.0.0.1:3009/v1
```

常用接口：

```text
POST http://127.0.0.1:3009/v1/responses
POST http://127.0.0.1:3009/v1/messages
GET  http://127.0.0.1:3009/health
```

## ai-cockpit 可以做什么

- 把 ChatGPT/Codex 账号登录态转成 OpenAI Responses 风格的本地代理入口。
- 接入任意 OpenAI 兼容 `/v1/*` 上游，例如第三方模型网关。
- 接入 Claude Messages 兼容上游，并把 `/v1/messages` 原样转发过去。
- 在多个 token 账号之间做额度检查、可用性判断和自动切换。
- 在 token 账号不可用时使用 API Key 上游兜底。
- 提供网页管理控制台，用来新增账号、查看额度、切换账号、配置入口 apikey、调整端口和模型别名。

路由规则可以简单理解为：

- `/v1/*`：token 配置会转到 ChatGPT Codex backend-api；`support` 包含 `gpt` 的 API Key 配置会直连它自己的 `base_url`。
- `/v1/responses`：支持 Responses 请求，并对 token 账号的部分额度类错误做自动切号。
- `/v1/messages`：优先使用 `support` 包含 `claude` 的 API Key 原样转发；没有可用 Claude 上游时，会把 Claude Messages 请求转换到 token 的 Responses 链路。
- `/wham/*`：token 配置会转到 ChatGPT wham backend-api；API Key 配置会直连它自己的 `base_url`。

## 命令行启动

也可以直接在仓库里运行 Node.js 版本：

```bash
git clone git@github.com:iiiiuuuuuu/ai-cockpit.git
cd ai-cockpit
npm install
npm start
```

常用命令：

```bash
npm start        # 启动服务
npm run stop     # 停止服务
npm run restart  # 重启服务
npm run logs     # 查看最近日志
npm test         # 运行测试
```

第一次启动时，如果项目根目录没有 `openai.json`，会进入配置引导：

1. 是否启用本地代理端口，默认代理端口是 `7890`。
2. 是否启用入口 `apikey` 校验。
3. 生成或写入基础配置。

启动成功后，日志会打印管理后台地址，类似：

```text
http://127.0.0.1:3009/admin/configs?auth_token=auth_xxx
```

管理后台必须带正确的 `auth_token` 访问，不要手动删掉 URL 后面的参数。

## 第一次配置

打开管理控制台后，通常按这个顺序配置：

1. 在“服务设置”里确认服务端口和本地代理端口。
2. 在“访问控制”里决定是否启用入口 `apikey`。
3. 在“新增配置项”里添加一个或多个上游账号。
4. 用页面里的“测试请求”或下面的 `curl` 验证代理是否可用。
5. 把本地入口地址配置到 Codex、Claude Code 或 CC Switch。

![ai-cockpit 管理控制台](docs/img/config_account.png)

### 服务端口和代理端口

- 服务端口：ai-cockpit 对客户端监听的端口，默认 `3009`。客户端通常填 `http://127.0.0.1:3009/v1`。
- 代理端口：ai-cockpit 访问上游时使用的本机代理端口，例如 Clash、Surge、V2RayN 常见的 `7890`。留空则直连。

### 入口 apikey

顶层 `apikeys` 是 ai-cockpit 的入口鉴权密钥，不是上游 API Key。

- `apikeys` 为空：本机客户端访问 ai-cockpit 时不校验 key。
- `apikeys` 非空：请求必须携带其中一个 key。

支持两种请求头：

```http
Authorization: Bearer <你的入口 apikey>
```

```http
x-api-key: <你的入口 apikey>
```

## 上游账号类型

ai-cockpit 支持两类配置项，写在 `openai.json` 的 `configs[]` 里，也可以直接通过管理页新增。

### 1. ChatGPT/Codex token

适合使用 ChatGPT/Codex 账号额度。管理页支持直接粘贴完整 AuthSession JSON，会自动提取：

- `accessToken` -> `access_token`
- `refreshToken` 或相关字段 -> `refresh_token`
- `account.id` -> `account_id`
- `user.email` -> `description`

最小配置：

```json
{
  "access_token": "chatgpt-access-token",
  "refresh_token": "chatgpt-refresh-token",
  "account_id": "account-id",
  "description": "your-email@example.com"
}
```

获取方式可以参考管理页提示：登录 ChatGPT 后打开 `https://chatgpt.com/api/auth/session`，复制完整 JSON 粘贴到 ai-cockpit。粘贴后不要退出对应 ChatGPT 登录态，否则 token 可能失效。

如果请求返回 `401 Unauthorized`、`token_revoked` 或管理页显示 token 失效，重新获取登录态并更新配置即可。

### 2. API Key 上游

适合接入 OpenAI 兼容接口、Claude Messages 兼容接口或自建网关。

```json
{
  "type": "apikey",
  "base_url": "https://api.example.com/v1",
  "apikey": "sk-xxx",
  "support": ["gpt"],
  "description": "OpenAI compatible provider"
}
```

字段说明：

- `type`：固定为 `apikey`。
- `base_url`：上游根地址，通常写到 `/v1`，例如 `https://api.example.com/v1`。
- `apikey`：访问上游时使用的 API Key。
- `support`：能力列表，只支持 `gpt` 和 `claude`。
- `probe_model`：可选，用来指定 API Key 可用性探测模型。

`support` 的含义：

- `["gpt"]`：参与 `/v1/*` OpenAI 兼容链路，包括 `/v1/responses`。
- `["claude"]`：参与 `/v1/messages` Claude Messages 原样转发。
- `["gpt", "claude"]`：两条链路都参与。

只支持 Claude Messages 的上游可以这样写：

```json
{
  "type": "apikey",
  "base_url": "https://claude.example.com/v1",
  "apikey": "sk-xxx",
  "support": ["claude"],
  "description": "Claude Messages provider"
}
```

## 配置文件示例

命令行版本默认读取项目根目录的 `openai.json`。

`openai.json.example` 是基础模板，一个完整示例：

```json
{
  "apikeys": ["sk-ai-cockpit-xxxx"],
  "auth_token": "auth_xxxx",
  "port": 3009,
  "proxy_port": 7890,
  "routing_preference": "token_first",
  "claude_code": {
    "model": "gpt-5.4",
    "reasoning_effort": "high"
  },
  "responses": {
    "model_aliases": {
      "gpt-5.2": "gpt-5.5"
    }
  },
  "configs": [
    {
      "access_token": "chatgpt-access-token",
      "refresh_token": "chatgpt-refresh-token",
      "account_id": "account-id",
      "description": "Codex token account"
    },
    {
      "type": "apikey",
      "base_url": "https://api.example.com/v1",
      "apikey": "sk-xxx",
      "support": ["gpt"],
      "description": "OpenAI compatible provider"
    },
    {
      "type": "apikey",
      "base_url": "https://claude.example.com/v1",
      "apikey": "sk-xxx",
      "support": ["claude"],
      "description": "Claude Messages provider"
    }
  ]
}
```

补充说明：

- `auth_token` 保护管理后台。
- `apikeys` 保护本地代理入口。
- `routing_preference` 支持 `token_first`、`apikey_first`、`token_only`、`apikey_only`，默认 `token_first`。
- `claude_code.model` 和 `claude_code.reasoning_effort` 只影响 `/v1/messages` 走 token 兼容转换时的实际 Responses 请求。
- `responses.model_aliases` 用来给 `/v1/responses` 的 `model` 做别名替换，匹配时忽略大小写。

更详细字段说明见 [docs/config-item-reference.md](docs/config-item-reference.md)。

## 账号切换规则

默认 `routing_preference` 是 `token_first`：

1. token 账号可用时优先使用 token。
2. token 账号每分钟检查额度和可用性。
3. 主额度低于 `3%` 或周额度不高于 `1%` 时，会标记为不可用并切到下一个账号。
4. `/v1/responses` 遇到部分额度类错误时，会自动切号并重放一次请求。
5. 所有 token 都不可用时，才使用 API Key 上游。
6. token 后续恢复可用后，会重新优先使用 token。

API Key 配置不参与 Codex 额度轮询；点击管理页刷新时，会做可用性探测。

## 验证代理

没有配置入口 `apikey` 时：

```bash
curl http://127.0.0.1:3009/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}'
```

配置了入口 `apikey` 时：

```bash
curl http://127.0.0.1:3009/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <你的入口 apikey>" \
  -d '{"model":"gpt-5.4","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}]}'
```

验证 Claude Messages 入口：

```bash
curl http://127.0.0.1:3009/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <你的入口 apikey>" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":128,"messages":[{"role":"user","content":"hello"}]}'
```

如果没有启用入口 `apikey`，删除 `Authorization` 这一行即可。

## 配合 Codex 使用

Codex 走 OpenAI Responses 风格入口，所以 Base URL 填：

```text
http://127.0.0.1:3009/v1
```

直接配置 `~/.codex/config.toml` 时，可以新增一个 provider：

```toml
model_provider = "ai_cockpit"
model = "gpt-5.5"
model_reasoning_effort = "high"

[model_providers.ai_cockpit]
name = "ai-cockpit"
base_url = "http://127.0.0.1:3009/v1"
wire_api = "responses"
requires_openai_auth = true
```

如果 ai-cockpit 开启了入口 `apikey`，改成环境变量传 key：

```toml
model_provider = "ai_cockpit"
model = "gpt-5.5"
model_reasoning_effort = "high"

[model_providers.ai_cockpit]
name = "ai-cockpit"
base_url = "http://127.0.0.1:3009/v1"
wire_api = "responses"
env_key = "AI_COCKPIT_API_KEY"
```

然后启动 Codex 前设置：

```bash
export AI_COCKPIT_API_KEY="sk-ai-cockpit-xxxx"
codex
```

也可以临时指定：

```bash
AI_COCKPIT_API_KEY="sk-ai-cockpit-xxxx" codex -c model_provider=\"ai_cockpit\"
```

## 配合 Claude Code 使用

Claude Code 走 Claude Messages 入口。配置时 Base URL 不要写 `/v1`，填到服务根地址即可：

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3009"
export ANTHROPIC_AUTH_TOKEN="sk-ai-cockpit-xxxx"
claude
```

`ANTHROPIC_AUTH_TOKEN` 会以 `Authorization: Bearer ...` 发送，正好匹配 ai-cockpit 的入口 `apikey` 校验。

如果没有启用入口 `apikey`，可以随便给一个占位值：

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3009"
export ANTHROPIC_AUTH_TOKEN="ai-cockpit-local"
claude
```

Claude Code 请求 `/v1/messages` 时，ai-cockpit 会按下面顺序处理：

1. 先找 `support` 包含 `claude` 的 API Key 上游，找到就原样转发。
2. 没有可用 Claude 上游时，把 Claude Messages 请求转换成 Responses 请求，走 token 账号。

如果你走 token 兼容转换链路，可以用 `openai.json` 的 `claude_code` 配置覆盖实际使用的 GPT 模型和推理强度。

## 配合 CC Switch 使用

CC Switch 适合同时管理 Codex、Claude Code 等工具的本地配置。可以在 CC Switch 里新增一个 Local/Custom Provider，统一指向 ai-cockpit。

Codex/OpenAI 类型：

```text
Base URL: http://127.0.0.1:3009/v1
API Key:  sk-ai-cockpit-xxxx
```

Claude/Anthropic 类型：

```text
Base URL: http://127.0.0.1:3009
API Key:  sk-ai-cockpit-xxxx
```

有些 CC Switch 版本的 Claude 配置项会要求填写到 `/v1`。如果它内部不会再追加 `/v1/messages`，可以填 `http://127.0.0.1:3009/v1`；如果出现 `/v1/v1/messages` 或 404，就改回 `http://127.0.0.1:3009`。

示例截图：

![CC Switch Codex 配置](docs/img/ccs_codex.png)

![CC Switch Claude 配置](docs/img/ccs_claude.png)

## 常见问题

### 管理页面打不开

先确认服务是否启动：

```bash
npm run logs
```

确认服务端口没有被其他进程占用；如果是通过封装应用启动，可以退出后重新打开。

### 提示 auth_token 无效

说明管理页 URL 里的 `auth_token` 不对。使用启动日志里打印的管理地址重新进入。

### 新增 API Key 后客户端该填哪个 key

客户端填入口 `apikeys` 里的 key。上游 API Key 只填在 ai-cockpit 配置项里，不直接给 Codex 或 Claude Code。

### 模型列表获取失败

ai-cockpit 主要代理 `/v1/responses` 和 `/v1/messages` 这类实际请求。部分客户端会先请求模型列表，如果上游或当前链路不支持模型列表，可能会显示获取失败。通常可以手动填写模型名继续使用，例如 Codex 用 `gpt-5.5`，Claude Code 用它自己的模型名或通过 `claude_code.model` 做转换。

### token 失效或 token_revoked

重新登录 ChatGPT，打开 `https://chatgpt.com/api/auth/session`，复制新的 AuthSession JSON 到管理页。更新后不要退出这个登录态。

## 开发者信息

项目包含一个 Tauri 外壳，只做本地服务的启动与窗口包装，不侵入现有 Node.js 服务逻辑。

Tauri 外壳开发：

```bash
cd desktop
npm install
npm run prepare
npm run dev
```

本地打包：

```bash
cd desktop
npm run build
```

只构建当前平台：

```bash
npm run build:macos
npm run build:windows
```

推送 `v*` tag 后，GitHub Actions 会构建 macOS 和 Windows 安装包并上传到 GitHub Releases。
