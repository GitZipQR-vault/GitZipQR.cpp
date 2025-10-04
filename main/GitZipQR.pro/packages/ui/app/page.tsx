// -----------------------------
"use client";
import { useEffect, useState } from "react";
import "./globals.css";

// Backend is hardcoded; no IP field in UI

type Plan = "oss" | "pro";
type Lang = "en" | "ru";

const T: Record<Lang, any> = {
  en: {
    enc: "Encrypt → QR", dec: "Decrypt from QR", pick: "Browse…",
    selected: "Selected", dropFile: "Click/Drop a file or folder", outName: "Output name",
    runEncode: "Run Encode", cancel: "Cancel",
    openPdf: "Open PDF", open: "Open", showInFolder: "Show in folder",
    browsePdf: "Browse… PDF / Images", collect: "Assemble & Decrypt",
    logs: "Logs", bindPhoto: "Bind to photo", choosePhoto: "Choose photo",
    pass: "Password (≥20 chars)", passFile: "Use .txt/.bin", passText: "Type text",
    paperxToggle: "Enable PaperStorageX (all your data in page formatted A)",
    pxType: "Archive type", pxPage: "Page", pxDpi: "DPI", pxMargin: "Margin (mm)", pxCell: "Cell (px)", pxNano: "Nanotech",
    wallet: "Wallet", copy: "Copy", copied: "Copied!", credits: "Credits",
    liveScan: "Live Scan", stego: "Stego (WEBP)", txhash: "Tx hash", verify: "Verify",
    teleCoins: "Get coins via Telegram",
    buy: "Get credits", enterCoins: "Credits to buy", BACKEND_URL: "Server URL", confirmBuy: "Confirm", buying: "Waiting Telegram…", approved: "Approved", declined: "Declined", timeout: "Timeout", neterr: "Network error", saved: "Saved",
  },
  ru: {
    enc: "Шифрование → QR", dec: "Расшифровка из QR", pick: "Выбрать…",
    selected: "Выбрано", dropFile: "Клик/Перетащите файл или папку", outName: "Имя выходного файла",
    runEncode: "Запустить шифрование", cancel: "Отмена",
    openPdf: "Открыть PDF", open: "Открыть", showInFolder: "Показать в папке",
    browsePdf: "Выбрать… PDF / Изображения", collect: "Собрать и Расшифровать",
    logs: "Логи", bindPhoto: "Привязать к фото", choosePhoto: "Выбрать фото",
    pass: "Пароль (≥20 символов)", passFile: "Файл .txt/.bin", passText: "Текстом",
    paperxToggle: "Включить PaperStorageX (Все ваши данные в листах формата A)",
    pxType: "Тип архива", pxPage: "Страница", pxDpi: "DPI", pxMargin: "Поле (мм)", pxCell: "Ячейка (px)", pxNano: "Nanotech",
    wallet: "Кошелёк", copy: "Скопировать", copied: "Скопировано!", credits: "Кредиты",
    liveScan: "Live Scan", stego: "Стего (WEBP)", txhash: "Хэш транзакции", verify: "Подтвердить",
    teleCoins: "Получить коины через Telegram",
    buy: "Получить кредиты", enterCoins: "Сколько кредитов", BACKEND_URL: "Адрес сервера", confirmBuy: "Подтвердить", buying: "Ждём подтверждение…", approved: "Подтверждено", declined: "Отклонено", timeout: "Таймаут", neterr: "Ошибка сети", saved: "Сохранено",
  }
};

const WALLET_ADDR = "0xa8b3A40008EDF9AF21D981Dc3A52aa0ed1cA88fD";
const BACKEND_URL = "https://84.39.243.205:8787";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const useIPC = (ch: string) => async (payload?: any) => await (window as any)?.electron?.ipc?.invoke?.(ch, payload);

function Toast({ msg, kind }: { msg: string; kind?: "ok" | "err" }) {
  if (!msg) return null;
  return <div className={`toast ${kind === "err" ? "err" : ""}`}>{msg}</div>;
}
function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value | 0));
  return (<div><div className="progress"><span style={{ width: `${v}%` }} /></div><div style={{ marginTop: 6, fontSize: 12 }}>{v}%</div></div>);
}
const fmtUptime = (sec: number) => `${(sec / 3600 | 0)}h ${((sec % 3600) / 60 | 0)}m`;
const fmtTimeLeft = (sec: number) => !sec || sec <= 0 ? "" : `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;

export default function Page() {
  const [lang, setLang] = useState<Lang>("ru"); const tr = T[lang];
  const [plan, setPlan] = useState<Plan>("pro"); // default PRO UI
  const [toast, setToast] = useState<{ m: string; k?: "ok" | "err" } | null>(null);
  const notify = (m: string, k?: "ok" | "err") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };

  const hasIPC = typeof window !== "undefined" && Boolean((window as any)?.electron?.ipc);

  // resilient open helpers (Electron IPC -> gzqrExtra fallback)
  const openPath = async (path: string) => {
    try {
      const w: any = window as any;
      if (w?.gzqrExtra?.openPath) return await w.gzqrExtra.openPath(path);
      return await w?.electron?.ipc?.invoke?.("file.openPath", path);
    } catch (e) { notify("Open error: " + String((e as any)?.message || e), "err"); }
  };
  const showInFolder = async (path: string) => {
    try {
      const w: any = window as any;
      if (w?.gzqrExtra?.showInFolder) return await w.gzqrExtra.showInFolder(path);
      return await w?.electron?.ipc?.invoke?.("file.showInFolder", path);
    } catch (e) { notify("Show error: " + String((e as any)?.message || e), "err"); }
  };

  // password
  const [passMode, setPassMode] = useState<"text" | "file">("text");
  const [pass, setPass] = useState(""); const passOk = pass.length >= 20;
  const [passFile, setPassFile] = useState<string>("");

  // IO
  const [encIn, setEncIn] = useState("");
  const [outName, setOutName] = useState("1"); // default numbering base
  const [bindPhoto, setBindPhoto] = useState(false); const [photoPath, setPhotoPath] = useState("");

  // PaperX (FREE only)
  const [usePaperX, setUsePaperX] = useState<boolean>(false);
  const [pxType, setPxType] = useState<"zip" | "tar">("tar");
  const [pxPage, setPxPage] = useState<string>("A4");
  const [pxDpi, setPxDpi] = useState<number>(600);
  const [pxMargin, setPxMargin] = useState<number>(5);
  const [pxCell, setPxCell] = useState<number>(1);
  const [pxNano, setPxNano] = useState<boolean>(false);

  // progress & results
  const [pEnc, setPEnc] = useState(0), [pDec, setPDec] = useState(0);
  const [logs, setLogs] = useState("⛔");
  const [pdf, setPdf] = useState(""); const [pngDir, setPngDir] = useState("");
  const [decOutDir, setDecOutDir] = useState(""), [decTar, setDecTar] = useState(""), [decFile, setDecFile] = useState("");

  // credits/bonus
  const [credits, setCredits] = useState(0), [bonusLeft, setBonusLeft] = useState(0), [bonusSec, setBonusSec] = useState(0), [uptime, setUptime] = useState(0);

  // buy via Telegram-confirmed backend
  const [buyCoins, setBuyCoins] = useState<number>(10);
  const [buying, setBuying] = useState<boolean>(false);
  const refreshCredits = async () => {
    try {
      const c = await (window as any).gzqrExtra?.creditsGet?.();
      if (c?.ok) {
        setCredits(c.credits || 0);
        setBonusLeft(c.bonusLeft || 0);
        setBonusSec(c.bonusExpireSec || 0);
      }
    } catch { }
  };

  useEffect(() => {
  (async () => {
    try {
      await refreshCredits();
      const u = await (window as any).gzqrExtra?.uptimeGet?.(); if (u?.ok) setUptime(u.sec || 0);
    } catch {}
  })();
  const t = setInterval(async () => {
    try {
      const u = await (window as any).gzqrExtra?.uptimeGet?.(); if (u?.ok) setUptime(u.sec || 0);
      const b = await (window as any).gzqrExtra?.bonusTick?.(); if (b?.ok) { setBonusSec(b.bonusSec || 0); setBonusLeft(b.bonusLeft || 0); }
      await refreshCredits();
    } catch {}
  }, 5000);
  return () => clearInterval(t);
}, []);

  // hook progress streams
  useEffect(() => {
    if (!hasIPC) return; const off = (window as any).electron?.ipc?.onProgress?.((d: any) => {
      setLogs(p => p === "—" ? d.line : (p + "\n" + d.line));
      let m = d.line.match(/chunk\s+(\d+)\/(\d+)/i); if (m) setPEnc(Math.floor(+m[1] * 100 / +m[2]));
      m = d.line.match(/collected chunk\s+(\d+)\/(\d+)/i); if (m) setPDec(Math.floor(+m[1] * 100 / +m[2]));
    }); return () => { try { off?.(); } catch { } };
  }, [hasIPC]);

  const totalCredits = credits + bonusLeft;
  const havePass = passMode === "file" ? !!passFile : passOk;

  // ⛏️ Главное: НЕ блочим кнопки по кредитам ни в OSS, ни в PRO.
  const canEncode = !!encIn && havePass && (!bindPhoto || !!photoPath);

  const ipcPick = useIPC("file.pickPath"), ipcPdf = useIPC("pdf.toPngs");

  // pay verify
  const [tx, setTx] = useState("");
  const verifyTx = async () => {
    try {
      const r = await (window as any).gzqrExtra?.payVerifyTx?.(tx.trim());
      if (r?.ok) { notify(`+${r.creditsAdded || 0} ${tr.credits}`, "ok"); await refreshCredits(); }
      else if (r?.pending) { notify("⏳ Pending confirmations", "ok"); }
      else { notify(String(r?.error || "Verify error"), "err"); }
    } catch (e: any) { notify(String(e?.message || e), "err"); }
  };

  // helpers (оставляем, но НЕ используем для предсписания)
  const doConsume = async (n: number, why: string) => {
    const r = await (window as any).gzqrExtra?.creditsConsume?.(n, why);
    if (!r?.ok) { notify(lang === "ru" ? "Нет кредитов" : "No credits", "err"); return false; }
    setCredits(r.credits || 0); setBonusLeft(r.bonusLeft || 0);
    return true;
  };

  // clamp PaperX for stability
  const safePxDpi = clamp(pxDpi, 72, 1200);
  const safePxCell = clamp(pxCell, 1, 4);
  const safePxMargin = clamp(pxMargin, 0, 20);

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 980, margin: "16px auto" }}>
      <Toast msg={toast?.m || ""} kind={toast?.k} />
      {/* Top controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>GitZipQR</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="tag">{T[lang].credits}: <b>{totalCredits}</b> <small style={{ opacity: .7 }}>{bonusLeft > 0 ? `(${bonusLeft}, ${fmtTimeLeft(bonusSec)})` : `(${fmtUptime(uptime)})`}</small></div>
          <div><button className={`tag ${lang === "en" ? "active" : ""}`} onClick={() => setLang("en")}>EN</button><button className={`tag ${lang === "ru" ? "active" : ""}`} onClick={() => setLang("ru")}>RU</button></div>
          <div><button className={`tag ${plan === "oss" ? "active" : ""}`} onClick={() => setPlan("oss")}>OSS</button><button className={`tag ${plan === "pro" ? "active" : ""}`} onClick={() => setPlan("pro")}>PRO</button></div>
        </div>
      </div>

      {/* Payments */}
      <section className="card" style={{ display: "grid", gap: 10 }}>
        <h3>💳 {tr.wallet}</h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="link-pill">{WALLET_ADDR}</div>
          <button onClick={async () => { await (window as any).gzqrExtra?.copy?.(WALLET_ADDR); notify(tr.copied, "ok"); }}>{tr.copy}</button>
        </div>
        <div className="card" style={{ display: "grid", gap: 10, padding: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <strong>🧾 {tr.buy}</strong>
            <label className="tag">
              {tr.enterCoins}:&nbsp;
              <input type="number" min={1} step={1} value={buyCoins}
                onChange={e => setBuyCoins(Math.max(1, parseInt(e.target.value || "1", 10) || 1))}
                style={{ width: 110, marginLeft: 6 }} />
            </label>
            <button className="btn-primary" disabled={buying || !(buyCoins > 0)} onClick={async () => {
              try {
                setBuying(true);
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 170000);
                const r = await fetch(BACKEND_URL.replace(/\/$/, "") + "/GitZipQR/getCoins", {
                  method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ coins: buyCoins }),
                  credentials: "include", signal: ctrl.signal
                }).catch((e) => { throw e; });
                clearTimeout(t);
                let j: any = null; try { j = await r.json(); } catch { }
                if (j && j.bool === 202) {
                  const add = await (window as any).gzqrExtra?.creditsAdd?.(buyCoins);
                  await refreshCredits();
                  notify(tr.approved + (add?.ok ? "" : " (local add warn)"), "ok");
                } else if (j && j.bool === 403) {
                  notify(tr.declined, "err");
                } else if (j && j.error === "timeout") {
                  notify(tr.timeout, "err");
                } else {
                  notify(String(j?.error || "HTTP " + r.status), "err");
                }
              } catch (e: any) {
                if (String(e?.name) === "AbortError") notify(tr.timeout, "err");
                else notify(tr.neterr + ": " + String(e?.message || e), "err");
              } finally {
                setBuying(false);
                await refreshCredits();
              }
            }}>{buying ? ("⏳ " + tr.buying) : ("✅ " + tr.confirmBuy)}</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={tx} onChange={e => setTx(e.target.value)} placeholder={tr.txhash} style={{ minWidth: 320 }} />
          <button onClick={verifyTx}>{tr.verify}</button>
          <div style={{ fontSize: 12, opacity: .7 }}>Rule: 1500 USDC (Ethereum, ERC-20) → +1 credits (multiples apply)</div>
        </div>
      </section>

      {/* Bind to photo */}
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label className="ios-switch" title="Stego binding">
          <input type="checkbox" checked={bindPhoto} onChange={e => setBindPhoto(e.target.checked)} />
          <span className="label">{tr.bindPhoto}</span>
        </label>
        <button disabled={!bindPhoto} onClick={async () => { const r = await (window as any).gzqrExtra?.pickImage?.(); if (r?.ok) setPhotoPath(r.path); }}>{tr.choosePhoto}</button>
        <div style={{ fontSize: 12, opacity: .85 }}>Фото: <code>{photoPath || "—"}</code></div>
      </div>

      {/* Encrypt */}
      <section className="card" style={{ display: "grid", gap: 12 }}>
        <h3>🔒 {tr.enc} {plan === "pro" && <small style={{ opacity: .6 }}> (PDF grid only)</small>}</h3>

        {plan === 'oss' && (
          <label className="ios-switch" title="PaperStorageX (FREE)">
            <input type="checkbox" checked={plan === "oss" && usePaperX} onChange={e => setUsePaperX(e.target.checked)} />
            <span className="label">{tr.paperxToggle}</span>
          </label>
        )}

        {/* Password source */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="tag"><input type="radio" checked={passMode === "text"} onChange={() => setPassMode("text")} /> {tr.passText}</label>
          <label className="tag"><input type="radio" checked={passMode === "file"} onChange={() => setPassMode("file")} /> {tr.passFile}</label>
          {passMode === "file" ? (
            <>
              <button onClick={async () => { const r = await (window as any).gzqrExtra?.pickPassFile?.(); if (r?.ok) setPassFile(r.path); }}>Browse…</button>
              <code style={{ fontSize: 12, opacity: .85 }}>{passFile || `⛔`}</code>
            </>
          ) : (
            <>
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder={tr.pass} style={{ minWidth: 280 }} />
              {(!passOk) && <div style={{ color: "#ff7b7b", fontSize: 12 }}>{tr.pass}</div>}
            </>
          )}
        </div>

        {/* Input + outName */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={async () => { const r = await useIPC("file.pickPath")({ mode: "fileOrDir" }); if (r?.ok) setEncIn(r.path); }}>{tr.pick}</button>
          <div style={{ fontSize: 12, opacity: .85 }}>{tr.selected}: <code>{encIn || "⛔"}</code></div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, opacity: .85 }}>{tr.outName}</span>
            <input value={outName} onChange={e => setOutName(e.target.value)} style={{ width: 180 }} />
          </div>
        </div>
        <div className="drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = (e.dataTransfer!.files || [])[0] as any; const p = (f?.path || ""); if (p) setEncIn(p); }}>{tr.dropFile}</div>

        {/* PaperX settings */}
        {plan === "oss" && usePaperX && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <div><div style={{ fontSize: 12, opacity: .8 }}>{tr.pxType}</div><select value={pxType} onChange={e => setPxType(e.target.value as any)}><option value="tar">tar</option><option value="zip">zip</option></select></div>
              <div><div style={{ fontSize: 12, opacity: .8 }}>{tr.pxPage}</div><select value={pxPage} onChange={e => setPxPage(e.target.value)}>{["A0", "A1", "A2", "A3", "A4"].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              <div><div style={{ fontSize: 12, opacity: .8 }}>{tr.pxDpi}</div><input type="number" min={72} max={1200} step={50} value={safePxDpi} onChange={e => setPxDpi(parseInt(e.target.value || "600", 10) || 600)} /></div>
              <div><div style={{ fontSize: 12, opacity: .8 }}>{tr.pxMargin}</div><input type="number" min={0} max={20} step={1} value={safePxMargin} onChange={e => setPxMargin(parseInt(e.target.value || "5", 10) || 5)} /></div>
              <div><div style={{ fontSize: 12, opacity: .8 }}>{tr.pxCell}</div><input type="number" min={1} max={4} step={1} value={safePxCell} onChange={e => setPxCell(parseInt(e.target.value || "1", 10) || 1)} /></div>
            </div>
            <label className="tag"><input type="checkbox" checked={pxNano} onChange={e => setPxNano(e.target.checked)} /> {tr.pxNano}</label>
          </div>
        )}

        {/* Action row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn-primary" disabled={!canEncode} onClick={async () => {
            try {
              setPEnc(0); setPdf(""); setPngDir("");
              if (plan === "pro") {
                const r = await (window as any).gzqrExtra?.encRun?.({ input: encIn, ...(passMode === "file" ? { passFile } : { pass }), makePdf: true, photo: bindPhoto ? photoPath : undefined, outName, pro: true });
                if (!r?.ok) { notify("Encode error", "err"); await refreshCredits(); return; }
                if (r.pdf) setPdf(r.pdf);
                notify(lang === "ru" ? "Готово: PDF создан" : "Done: PDF ready", "ok");
              } else {
                if (usePaperX) {
                  const r = await (window as any).gzqrExtra?.paperxRun?.({
                    mode: "encode", input: encIn, ...(passMode === "file" ? { passFile } : { pass }),
                    outBase: outName, type: pxType, page: pxPage, dpi: safePxDpi, marginMM: safePxMargin, cell: safePxCell, nanotech: pxNano, outDir: ".gzqr_tmp/paperx"
                  });
                  if (!r?.ok) { notify("PaperStorageX error", "err"); await refreshCredits(); return; }
                  if (r.pdfPath) setPdf(r.pdfPath);
                  notify("PaperStorageX PDF ready", "ok");
                } else {
                  const r = await (window as any).gzqrExtra?.encRun?.({ input: encIn, ...(passMode === "file" ? { passFile } : { pass }), makePdf: false, photo: bindPhoto ? photoPath : undefined, outName, pro: false });
                  if (!r?.ok) { notify("Encode error", "err"); await refreshCredits(); return; }
                  if (r.pngDir) setPngDir(r.pngDir);
                  if (r.pdf) setPdf(r.pdf);
                  notify("QR PNG ready", "ok");
                }
              }
              await refreshCredits();
            } catch (e: any) { notify(String(e?.message || e), "err"); await refreshCredits(); }
          }}>🧩 {tr.runEncode}</button>

          <button onClick={() => { (window as any).gzqrExtra?.encCancel?.(); }}>{tr.cancel}</button>

          {(plan === "pro") && (
            <>
              <button disabled={!pdf} onClick={() => openPath(pdf)}>{tr.openPdf}</button>
              <button disabled={!(pngDir || pdf)} onClick={() => showInFolder(pngDir || pdf)}>{tr.showInFolder}</button>
              <button disabled={!pngDir && !pdf} onClick={async () => {
                const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d")!;
                canvas.width = 2048; canvas.height = 2048; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 2048, 2048);
                const data = canvas.toDataURL("image/webp", 0.95);
                const save = await (window as any).gzqrExtra?.saveWebp?.(data, (outName || "backup") + ".webp");
                if (save?.ok) notify("WEBP saved: " + save.path, "ok"); else notify("Stego save error", "err");
              }}>{tr.stego}</button>
            </>
          )}
          {(plan === "oss" && usePaperX) && (
            <>
              <button disabled={!pdf} onClick={() => openPath(pdf)}>{tr.openPdf}</button>
              <button disabled={!pdf} onClick={() => showInFolder(pdf)}>{tr.showInFolder}</button>
            </>
          )}
          {(plan === "oss" && !usePaperX) && (
            <>
              <button disabled={!pngDir} onClick={() => showInFolder(pngDir)}>{tr.showInFolder}</button>
            </>
          )}
        </div>
        <Progress value={pEnc} />
      </section>

      {/* Decrypt */}
      <section className="card" style={{ display: "grid", gap: 12 }}>
        <h3>🔓 {tr.dec}</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={async () => { const r = await (window as any).gzqrExtra?.pickPDF?.(); if (r?.ok) { const x = await ipcPdf({ pdf: r.path, pro: plan === "pro" }); if (x?.dir) { setPngDir(x.dir); setPdf(r.path); } } }}>{tr.browsePdf}</button>
          <button onClick={async () => { const r = await useIPC("file.pickPath")({ mode: "dir" }); if (r?.ok) { setPngDir(r.path); setPdf(""); } }}>{tr.pick}</button>
          <div style={{ fontSize: 12, opacity: .85 }}><code>{pdf || pngDir || "⛔"}</code></div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="tag"><input type="radio" checked={passMode === "text"} onChange={() => setPassMode("text")} /> {tr.passText}</label>
          <label className="tag"><input type="radio" checked={passMode === "file"} onChange={() => setPassMode("file")} /> {tr.passFile}</label>
          {passMode === "file"
            ? (<><button onClick={async () => { const r = await (window as any).gzqrExtra?.pickPassFile?.(); if (r?.ok) setPassFile(r.path); }}>Browse…</button><code style={{ fontSize: 12, opacity: .85 }}>{passFile || "⛔"}</code></>)
            : (<input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder={tr.pass} style={{ minWidth: 280 }} />)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn-primary" onClick={async () => {
            try {
              setPDec(0);
              const r = await (window as any).gzqrExtra?.decRun?.({ dir: pngDir, ...(passMode === "file" ? { passFile } : { pass }), photo: bindPhoto ? photoPath : undefined, outName, pro: plan === "pro" });
              if (!r?.ok) { notify("Decode error", "err"); await refreshCredits(); return; }
              setDecOutDir(r.outDir || ""); setDecTar(r.tarPath || ""); setDecFile(r.restoredFile || "");
              notify(lang === "ru" ? "Готово: можно открыть" : "Done: you may open", "ok");
              await refreshCredits();
            } catch (e: any) { notify(String(e?.message || e), "err"); await refreshCredits(); }
          }}>{tr.collect}</button>
          <button onClick={() => { (window as any).gzqrExtra?.decCancel?.(); }}>{tr.cancel}</button>
          {plan === "pro" && <button onClick={async () => { const r = await (window as any).gzqrExtra?.liveScan?.(); if (!r?.ok) notify("Live scan error", "err"); else notify("Live scan started", "ok"); }}>{tr.liveScan}</button>}
          <button disabled={!decFile && !decOutDir && !pdf} onClick={() => openPath(decFile || decOutDir || pdf)}>{tr.open}</button>
          <button disabled={!decOutDir && !pngDir} onClick={() => showInFolder(decOutDir || pngDir)}>{tr.showInFolder}</button>
        </div>
        <Progress value={pDec} />
        {(decTar || decOutDir || decFile) && <div style={{ fontSize: 12, opacity: .9 }}>
          {decTar && <>TAR: <code>{decTar}</code><br /></>}
          {decFile && <>File: <code>{decFile}</code><br /></>}
          {decOutDir && <>Dir: <code>{decOutDir}</code></>}
        </div>}
      </section>

      <section className="card"><h3>{tr.logs}</h3><pre className="logs">{logs}</pre></section>
    </div>
  );
}
// -----------------------------
