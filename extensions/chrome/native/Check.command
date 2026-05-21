#!/bin/bash
set -euo pipefail

HOST_NAME="com.ai_cockpit.control"
HOST_DIRS=(
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
)

for HOST_DIR in "${HOST_DIRS[@]}"; do
  HOST_MANIFEST="$HOST_DIR/$HOST_NAME.json"
  echo "--- $HOST_MANIFEST"
  if [ -f "$HOST_MANIFEST" ]; then
    cat "$HOST_MANIFEST"
    echo
  else
    echo "missing"
  fi
done
