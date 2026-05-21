#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

if [ ! -d node_modules ]; then
  echo "node_modules not found, running npm install..."
  npm install
fi

npm run restart
