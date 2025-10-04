#!/usr/bin/env bash
set -u -o pipefail
LOG=".gzqr_hotfix_$(date +%Y%m%d_%H%M%S).log"
trap 'code=$?; echo -e "\n=== EXIT CODE: $code ===\nLog: $LOG"; read -rp "Press Enter to close..." _' EXIT
run(){ echo -e "\n▶ $*"; { eval "$@"; } 2>&1 | tee -a "$LOG"; return ${PIPESTATUS[0]}; }
cd "$(dirname "$0")/.." 2>/dev/null || cd ~/main/GitZipQR.pro

# 1) Бэкапы
for f in packages/ui/app/page.tsx packages/app/mainproc/main.ts packages/ui/app/lib/telegram.ts; do
  [[ -f "$f" ]] && cp -f "$f" "$f.fixbak.$(date +%s)"
done

# 2) UI: чинем кнопки 🇬🇧/🇷🇺 и убираем дублирующийся effect
run "sed -i -e 's/🇬🇧button>/🇬🇧<\\/button>/' -e 's/🇷🇺button>/🇷🇺<\\/button>/' packages/ui/app/page.tsx"
# убираем все старые синхронизации usePaperX с планом
run "sed -i '/sync toggle with plan/,+3d' packages/ui/app/page.tsx"

# 3) UI: PRO => PDF (книжка QR), OSS => PaperStorageX доступен; PaperStorageX скрыт в PRO
# - показываем тумблер PaperX только если !isPro
run "awk '
  BEGIN{p=0}
  {print}
  /const isPro =/ && p==0 {
    print \"  // Сброс PaperX при смене плана: в PRO скрыт и выключен\";
    print \"  useEffect(() => { try { if (plan === \\\"pro\\\") setUsePaperX(false); } catch {} }, [plan]);\";
    p=1
  }' packages/ui/app/page.tsx > /tmp/_gzqr_page.tsx && mv /tmp/_gzqr_page.tsx packages/ui/app/page.tsx"

# Скрываем тумблер и настройки PaperX в PRO
run "sed -i '0,/label className=\"tag\" style=.*paperxToggle/s//{(!isPro) && &}/' packages/ui/app/page.tsx"
run "sed -i '0,/\\{usePaperX && (/s//{(!isPro) && usePaperX && (/' packages/ui/app/page.tsx"

# При запуске кодирования: если не PaperX, то в PRO делаем makePdf: true
run \"perl -0777 -pe '
  s/(ipc\\?\\.invoke\\?\\(\\\"encoder.run\\\", \\{\\s*input: encIn, .*?)(makePdf: false)/\\1makePdf: (plan===\\\"pro\\\")?true:false/s
' -i packages/ui/app/page.tsx\"

# 4) Telegram заглушка: больше НЕ начисляет кредиты
cat > packages/ui/app/lib/telegram.ts <<'TS'
"use client";
// Заглушка без автодоначисления: имитируем ожидание и отдаём timeout=false/ok=false.
// Ничего не трогаем в кошельке — кредитов не добавляет.
export async function getCoinsTelegram(n: number): Promise<{ok: boolean; timeout?: boolean}> {
  try {
    const wait = (ms:number)=>new Promise(r=>setTimeout(r,ms));
    await wait(1500 + Math.floor(Math.random()*1500));
    return { ok: false, timeout: true };
  } catch {
    return { ok: false, timeout: true };
  }
}
TS

# 5) Backend: списание при decode; бонус при успешном encode; PaperX оставляем бесплатным, но управляет UI
run \"perl -0777 -pe '
  # decode: перед запуском — consume(1)
  s/ipcMain\\.handle\\(\\\"decoder\\.run\\\", async \\(_e, \\{ dir, outDir, pass, passFile \\}: \\{ dir: string; outDir\\?: string; pass\\?: string; passFile\\?: string \\}\\) => \\{\\n  try \\{/ipcMain.handle(\\\"decoder.run\\\", async (_e, { dir, outDir, pass, passFile }: { dir: string; outDir?: string; pass?: string; passFile?: string }) => {\\n  try {\\n    { const r = await (ipcMain as any).handle ? null : null; }/s;

  s/(const DEC = resolveBin\\(\\\"decode\\\"\\);)/$1\\n    {\\n      const c = await (async()=>ipcMain.handle?null:null) || null;\\n    }\\n    {\\n      const res = await (async()=>{ try { return await (global as any).__gzqr_consume?.(1) } catch{} return null; })();\\n    }/s
' -i packages/app/mainproc/main.ts\" || true

# Вставляем реальное consume(1) и бонус/персист helper (аккуратно, через метки)
run "awk '
  BEGIN{added=0}
  {print}
  /let { credits, bonusLeft, bonusExpireAt } = loadState\\(\\);/ && !added {
    print \"(globalThis as any).__gzqr_consume = async (n:number)=>{ try{ const need=Math.max(1,Number(n||1)); if(credits+bonusLeft<need) return {ok:false}; if(credits>=need){ credits-=need; } else { const left=need-credits; credits=0; bonusLeft=Math.max(0,bonusLeft-left); if(bonusLeft<=0) bonusExpireAt=null; } persist(); return {ok:true, credits, bonusLeft}; }catch{ return {ok:false}; }};\";
    added=1
  }
' packages/app/mainproc/main.ts > /tmp/_gzqr_main.ts && mv /tmp/_gzqr_main.ts packages/app/mainproc/main.ts"

# encoder.run: после успешного кодирования — +1 бонус и продление бонус-таймера
run \"perl -0777 -pe '
  s/(return \\{ ok: true, pngDir, pdf \\};)/{ bonusLeft = (bonusLeft||0) + 1; bonusExpireAt = Date.now() + (24*3600*1000); persist(); return { ok: true, pngDir, pdf }; }/s
' -i packages/app/mainproc/main.ts\"

# decoder.run: реальное consume(1) перед spawn
run \"perl -0777 -pe '
  s/(send\\(\\\"sys\\\", \\`decode ← \\$\\{real\\} → \\$\\{out\\}\\`\\);\\n\\s*const r = await runStreaming)/{ const take = (globalThis as any).__gzqr_consume ? await (globalThis as any).__gzqr_consume(1) : {ok:true}; if(!take||!take.ok) return { ok:false, error: \\\"no credits\\\" };\\n    send(\\\"sys\\\", \\`decode ← \\$\\{real\\} → \\$\\{out\\}\\`);\\n    const r = await runStreaming/s
' -i packages/app/mainproc/main.ts\"

# 6) Сборка UI и рестарт
if command -v pnpm >/dev/null 2>&1; then PM=pnpm; elif command -v yarn >/dev/null 2>&1; then PM=yarn; else PM=npm; fi
run "\$PM --prefix packages/ui install"
run "\$PM --prefix packages/ui run build || true"
run "bash ./run.sh"
