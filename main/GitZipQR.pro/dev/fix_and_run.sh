#!/usr/bin/env bash
set -u -o pipefail     # без -e, чтобы не падать мгновенно
LOG=".gzqr_fix_$(date +%Y%m%d_%H%M%S).log"

pause() { echo; read -rp "⏸ Press Enter to close..." _; }
on_exit() {
  code=$?
  echo -e "\n=== EXIT CODE: $code ==="
  echo "Log saved to: $LOG"
  pause
}
on_err() { echo "❌ Error on line $1: $BASH_COMMAND" | tee -a "$LOG"; }
trap 'on_exit' EXIT
trap 'on_err $LINENO' ERR

run() { echo -e "\n▶ $*"; { eval "$@"; } 2>&1 | tee -a "$LOG"; return ${PIPESTATUS[0]}; }

# ——— шаги фикса ———
cd "$(dirname "$0")/.." 2>/dev/null || cd ~/main/GitZipQR.pro

# 1) бэкапы
[[ -f packages/ui/app/page.tsx ]] && cp -f packages/ui/app/page.tsx packages/ui/app/page.tsx.fixbak.$(date +%s)
[[ -f packages/app/mainproc/main.ts ]] && cp -f packages/app/mainproc/main.ts packages/app/mainproc/main.ts.fixbak.$(date +%s)

# 2) кнопки 🇬🇧/🇷🇺
if [[ -f packages/ui/app/page.tsx ]]; then
  run "sed -i -e 's/🇬🇧button>/🇬🇧<\\/button>/' -e 's/🇷🇺button>/🇷🇺<\\/button>/' packages/ui/app/page.tsx"
  # 3) PRO ⇒ PDF по умолчанию (синхронизация тумблера с планом)
  run "grep -q 'setUsePaperX(plan === \"pro\")' packages/ui/app/page.tsx || sed -i '/const isPro = /a \
  \
// PRO → PDF by default, OSS → QR (sync toggle with plan)\
  useEffect(() => { try { setUsePaperX(plan === \"pro\"); } catch {} }, [plan]);' packages/ui/app/page.tsx"
fi

# 4) Telegram-заглушка начисления кредитов
run "mkdir -p packages/ui/app/lib"
cat > packages/ui/app/lib/telegram.ts <<'TS'
"use client";
export async function getCoinsTelegram(n: number): Promise<{ok: boolean; timeout?: boolean}> {
  try {
    const add = Math.max(1, Math.min(1000, Number(n||1)));
    const res = await (window as any)?.gzqrExtra?.creditsAdd?.(add);
    return { ok: !!(res && res.ok) };
  } catch { return { ok: false }; }
}
TS

# 5) PaperStorageX бесплатный на бэкенде
run "sed -i 's/PRO_COST_PAPERX: *[0-9]\\+/PRO_COST_PAPERX: 0/' packages/app/mainproc/main.ts"

# 6) сборка UI (без фатала) и запуск
if command -v pnpm >/dev/null 2>&1; then PM=pnpm; elif command -v yarn >/dev/null 2>&1; then PM=yarn; else PM=npm; fi
run "\$PM --prefix packages/ui install"
run "\$PM --prefix packages/ui run build || true"
run "bash ./run.sh"
