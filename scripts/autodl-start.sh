#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [ -s "$NVM_DIR/nvm.sh" ]; then
  # AutoDL 的非交互启动命令不会自动读取 .bashrc，需要显式加载 NVM。
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "未找到 Node.js/npm。请先安装 Node.js 25，并在保存镜像前执行 npm install。" >&2
  exit 1
fi

export PORT="${PORT:-6008}"
export HOST="${HOST:-0.0.0.0}"
cd "$PROJECT_DIR"
exec node src/server.js
