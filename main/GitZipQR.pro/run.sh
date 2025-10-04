#!/usr/bin/env bash
set -euo pipefail


LOGDIR=".gzqr_tmp/logs"
mkdir -p "$LOGDIR" .gzqr_tmp packages/app/mainproc/dist

say(){ printf "%s\n" "$*"; }

die(){
  say ""
  say "[!] Ошибка: $*"
  say "[i] Хвост UI-логов:"
  tail -n 120 "$LOGDIR/ui.log" 2>/dev/null || true
  say ""
  say "[i] Хвост Electron-логов:"
  tail -n 120 "$LOGDIR/electron.log" 2>/dev/null || true
  exit 1
}

say "[1/8] Гашу старые процессы и освобождаю порт :5123…"
# по pid-файлам
( test -f .gzqr_tmp/ui.pid       && kill "$(cat .gzqr_tmp/ui.pid)" )       >/dev/null 2>&1 || true
( test -f .gzqr_tmp/electron.pid && kill "$(cat .gzqr_tmp/electron.pid)" ) >/dev/null 2>&1 || true
# по имени процессов
pkill -f "next dev -p 5123"                              >/dev/null 2>&1 || true
pkill -f "PORT=5123 .*bun run dev"                       >/dev/null 2>&1 || true
pkill -f "electron .*packages/app/mainproc/dist/main.cjs" >/dev/null 2>&1 || true
# по порту
( command -v fuser >/dev/null && fuser -k 5123/tcp ) >/dev/null 2>&1 || true
( command -v lsof  >/dev/null && lsof -t -i:5123 | xargs -r kill ) >/dev/null 2>&1 || true
sleep 0.5

say "[2/8] Сборка C++…"
make -C GitZipQR.cpp || true

say "[3/8] Транспайл TS → CJS…"
bun build packages/app/mainproc/main.ts    --minify --target=node --format=cjs --external electron --outfile=packages/app/mainproc/dist/main.cjs
bun build packages/app/mainproc/preload.ts --minify --target=node --format=cjs --external electron --outfile=packages/app/mainproc/dist/preload.cjs

# страховочный package.json рядом
cat > packages/app/mainproc/package.json <<'JSON'
{ "name":"gitzipqr-mainproc","private":true,"type":"commonjs","main":"dist/main.cjs" }
JSON

# проверка сборок
test -s packages/app/mainproc/dist/main.cjs    || die "Нет dist/main.cjs"
test -s packages/app/mainproc/dist/preload.cjs || die "Нет dist/preload.cjs"

say "[4/8] Запускаю UI (Next) на :5123…"
# чистим старый лог
: > "$LOGDIR/ui.log"
nohup bash -lc '(cd packages/ui && PORT=5123 bun run dev)' >> "$LOGDIR/ui.log" 2>&1 &
echo $! > .gzqr_tmp/ui.pid

say "[5/8] Жду поднятия UI-порта :5123…"
# ждём до 120*0.5=60 сек; каждые 5 сек печатаем прогресс; если упало — покажем хвост логов и умрём.
ATTEMPTS=120
for i in $(seq 1 $ATTEMPTS); do
  ok=1
  if command -v nc >/dev/null 2>&1; then nc -z 127.0.0.1 5123 >/dev/null 2>&1 || ok=0
  elif command -v curl >/dev/null 2>&1; then curl -sfI http://127.0.0.1:5123 >/dev/null 2>&1 || ok=0
  elif command -v ss >/dev/null 2>&1; then ss -ltn | grep -q ":5123" || ok=0
  else ok=0; fi

  if [ "$ok" -eq 1 ]; then
    say "    → UI слушает :5123"
    break
  fi
  # если UI-процесс внезапно умер — сразу ошибка
  if ! kill -0 "$(cat .gzqr_tmp/ui.pid 2>/dev/null || echo 0)" 2>/dev/null; then
    die "UI-процесс завершился до открытия порта"
  fi

  # каждые 5 секунд короткий статус
  if [ $((i%10)) -eq 0 ]; then
    say "    … всё ещё ждём (попытка $i/$ATTEMPTS)"
    tail -n 3 "$LOGDIR/ui.log" 2>/dev/null || true
  fi
  sleep 0.5
done
# если порт так и не открылся — падаем с логами
if [ "$ok" -ne 1 ]; then
  die "UI не поднялся на :5123 за отведённое время"
fi

say "[6/8] Запускаю Electron (dist/main.cjs)…"
: > "$LOGDIR/electron.log"
E_MAIN="packages/app/mainproc/dist/main.cjs"
nohup bash -lc "ELECTRON_DISABLE_SANDBOX=1 bunx --bun electron --no-sandbox '$E_MAIN'" >> "$LOGDIR/electron.log" 2>&1 &
echo $! > .gzqr_tmp/electron.pid

# быстрая проверка старта Electron (5 сек)
sleep 1
if ! kill -0 "$(cat .gzqr_tmp/electron.pid 2>/dev/null || echo 0)" 2>/dev/null; then
  die "Electron не стартовал (см. логи)"
fi

say "[7/8] PID-ы:"
say "      UI PID:       $(cat .gzqr_tmp/ui.pid 2>/dev/null || echo '?')"
say "      Electron PID:  $(cat .gzqr_tmp/electron.pid 2>/dev/null || echo '?')"

say "[8/8] tail -f логов (Ctrl+C — только остановить tail; приложения продолжат работать)"
trap 'echo; echo "[i] tail остановлен. UI/Electron продолжают работать."; echo' INT
tail -n +1 -f "$LOGDIR/ui.log" "$LOGDIR/electron.log"
