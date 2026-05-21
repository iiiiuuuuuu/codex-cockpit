#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

choose_action() {
  osascript <<'APPLESCRIPT'
set choices to {"启动", "重启", "停止", "打开管理页", "查看日志", "打开目录"}
choose from list choices with title "ai-cockpit" with prompt "选择要执行的操作" default items {"重启"} OK button name "执行" cancel button name "取消"
APPLESCRIPT
}

open_terminal() {
  local command="$1"
  osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "cd $(printf '%q' "$REPO_ROOT") && $command"
end tell
APPLESCRIPT
}

run_and_notify() {
  local command="$1"
  local success_message="$2"
  local output

  if output="$(cd "$REPO_ROOT" && eval "$command" 2>&1)"; then
    osascript -e 'on run argv
display notification (item 1 of argv) with title "ai-cockpit"
end run' "$success_message"
  else
    osascript -e 'on run argv
display dialog (item 1 of argv) with title "ai-cockpit" buttons {"好"} default button "好" with icon caution
end run' "$output"
    exit 1
  fi
}

admin_url() {
  REPO_ROOT="$REPO_ROOT" node <<'NODE'
const fs = require('fs');
const path = require('path');
const repoRoot = process.env.REPO_ROOT;
let port = 3009;
let authToken = '';

try {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'openai.json'), 'utf8'));
  port = config.port || port;
  authToken = typeof config.auth_token === 'string' ? config.auth_token.trim() : '';
} catch (error) {
}

const suffix = authToken ? `?auth_token=${encodeURIComponent(authToken)}` : '';
console.log(`http://127.0.0.1:${port}/admin/configs/v2${suffix}`);
NODE
}

action="$(choose_action)"
if [ "$action" = "false" ]; then
  exit 0
fi

case "$action" in
  启动)
    run_and_notify "if [ ! -d node_modules ]; then npm install; fi; npm start" "启动完成"
    ;;
  重启)
    run_and_notify "if [ ! -d node_modules ]; then npm install; fi; npm run restart" "重启完成"
    ;;
  停止)
    run_and_notify "npm run stop" "已停止"
    ;;
  打开管理页)
    run_and_notify "if [ ! -d node_modules ]; then npm install; fi; npm start" "服务已就绪"
    open "$(admin_url)"
    ;;
  查看日志)
    open_terminal "npm run logs"
    ;;
  打开目录)
    open "$REPO_ROOT"
    ;;
esac
