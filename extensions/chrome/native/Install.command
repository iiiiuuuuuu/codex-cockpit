#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.ai_cockpit.control"
LAUNCHER="$SCRIPT_DIR/$HOST_NAME"
HOST_SCRIPT="$SCRIPT_DIR/host.js"
EXTENSION_MANIFEST="$(cd "$SCRIPT_DIR/.." && pwd)/manifest.json"
NODE_BIN="$(command -v node || true)"

if [ -z "$NODE_BIN" ]; then
  osascript -e 'display dialog "没有找到 node，请先安装 Node.js。" with title "ai-cockpit" buttons {"好"} default button "好" with icon caution'
  exit 1
fi

derive_extension_id() {
  node - "$EXTENSION_MANIFEST" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const key = String(manifest.key || '').trim();
if (!key) {
  process.exit(1);
}

const der = Buffer.from(key, 'base64');
const hash = crypto.createHash('sha256').update(der).digest();
const alphabet = 'abcdefghijklmnop';
let id = '';
for (const byte of hash.subarray(0, 16)) {
  id += alphabet[byte >> 4] + alphabet[byte & 0xf];
}
process.stdout.write(id);
NODE
}

EXTENSION_ID="${1:-${EXTENSION_ID:-}}"
if [ -z "$EXTENSION_ID" ]; then
  EXTENSION_ID="$(derive_extension_id || true)"
fi

if [ -z "$EXTENSION_ID" ]; then
  EXTENSION_ID="$(osascript <<'APPLESCRIPT'
display dialog "无法从 manifest 自动计算扩展 ID。打开 chrome://extensions/，复制 ai-cockpit 控制台的扩展 ID，然后粘贴到这里。" default answer "" with title "安装 ai-cockpit Native Host" buttons {"取消", "安装"} default button "安装"
text returned of result
APPLESCRIPT
)"
fi

if ! [[ "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  osascript -e 'display dialog "扩展 ID 格式不正确。请复制 chrome://extensions/ 里 32 位小写字母 ID。" with title "ai-cockpit" buttons {"好"} default button "好" with icon caution'
  exit 1
fi

cat > "$LAUNCHER" <<EOF
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:\$PATH"
exec "$NODE_BIN" "$HOST_SCRIPT"
EOF
chmod +x "$LAUNCHER"
chmod +x "$HOST_SCRIPT"

HOST_DIRS=(
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
)

INSTALLED=()
for HOST_DIR in "${HOST_DIRS[@]}"; do
  mkdir -p "$HOST_DIR"
  HOST_MANIFEST="$HOST_DIR/$HOST_NAME.json"
  cat > "$HOST_MANIFEST" <<EOF
{
  "name": "$HOST_NAME",
  "description": "ai-cockpit Chrome control host",
  "path": "$LAUNCHER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
  INSTALLED+=("$HOST_MANIFEST")
done

printf 'Installed native host for extension %s:\n' "$EXTENSION_ID"
printf '  %s\n' "${INSTALLED[@]}"

osascript -e 'display notification "本地宿主已安装，请重启浏览器或重新加载插件后再试。" with title "ai-cockpit"'
