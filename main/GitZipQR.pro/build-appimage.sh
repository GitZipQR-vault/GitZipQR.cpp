#!/usr/bin/env bash
set -euo pipefail
# 1) Сборка C++ и TS
make -C GitZipQR.cpp
npm run -s build:main || (echo "Expected script build:main to bundle Electron main"; exit 1)

# 2) Установка electron-builder локально и сборка AppImage
pushd packages/app/mainproc >/dev/null
  if ! jq . >/dev/null 2>&1 < package.json ; then echo "package.json missing here"; exit 1; fi
  npm i -D electron-builder >/dev/null
  # Мини-конфиг на лету (не трогаем ваш package.json)
  cat > electron-builder.yml <<YML
appId: com.gizipqr.pro
productName: GitZipQR Pro
directories:
  output: dist-app
files:
  - dist/**
  - ../../../../GitZipQR.cpp/build/**
asar: false
linux:
  target:
    - AppImage
  category: Utility
  artifactName: ${productName}-${version}.${ext}
YML
  npx electron-builder -c electron-builder.yml --linux AppImage
  echo "AppImage готово в: packages/app/mainproc/dist-app/"
popd >/dev/null
