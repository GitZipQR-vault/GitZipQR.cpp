#!/usr/bin/env bash
# Keep terminal open on exit + show code
set +e
trap 'code=$?; echo; echo "*** exit code: $code ***"; read -rp "Press Enter to close..." _' EXIT
echo "[run] Starting UI (Next) & Electron..."
# Если у тебя отдельные команды — подставь свои:
# 1) UI on 5123
( bun --version >/dev/null 2>&1 && bun run -q -y ui:dev ) || npm run ui:dev &
sleep 2
# 2) Electron
( bun --version >/dev/null 2>&1 && bun run -q -y app:dev ) || npm run app:dev
