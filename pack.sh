#!/usr/bin/env bash
#
# Wisteria 打包脚本
#
# 用法:
#   ./pack.sh            完整打包: .app + dmg + zip
#   ./pack.sh --app      只生成 .app
#   ./pack.sh --clean    打包前清理 release/ 目录

set -euo pipefail

cd "$(dirname "$0")"

APP_DIR="release/mac-arm64"
APP_PATH="$APP_DIR/Wisteria.app"
ONLY_APP=false
CLEAN=false

usage() {
  cat <<'EOF'
用法: ./pack.sh [选项]

选项:
  -a, --app      只生成 .app（不生成 dmg/zip）
  -c, --clean    打包前清理 release/ 目录
  -h, --help     显示帮助
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -a | --app)   ONLY_APP=true ;;
    -c | --clean) CLEAN=true ;;
    -h | --help)  usage ;;
    *) echo "未知参数: $1" >&2; usage ;;
  esac
  shift
done

if [[ "$CLEAN" == true ]]; then
  echo "==> 清理 release/"
  rm -rf release
fi

echo "==> 构建渲染层 (vite build)"
npm run build

echo "==> 打包 .app"
npx electron-builder --dir

echo "==> ad-hoc 签名"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"
echo "    签名验证通过"

if [[ "$ONLY_APP" == true ]]; then
  echo ""
  echo "完成: $APP_PATH"
  exit 0
fi

echo "==> 生成 dmg / zip"
npx electron-builder --mac dmg zip --prepackaged "$APP_PATH"

echo ""
echo "完成:"
echo "  $APP_PATH"
echo "  release/Wisteria-*.dmg"
echo "  release/Wisteria-*-mac.zip"
