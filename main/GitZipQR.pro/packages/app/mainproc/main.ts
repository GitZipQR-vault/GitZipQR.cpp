const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
import { execFile, execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONST = {
  UI_PORT: 5123,
  WORK_DIR: ".gzqr_tmp",
  PAY_RPC: "https://cloudflare-eth.com",
  // USDC on Ethereum (ERC-20)
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase(),
  RECEIVER: "0xa8b3A40008EDF9AF21D981Dc3A52aa0ed1cA88fD".toLowerCase(),
  // billing: each full 1500 USDC → +2 credits
  PRICE_USDT: 1500,
  CONFIRMATIONS: 1,
  BONUS_CREDITS: 2,
  BONUS_MS: 24 * 3600 * 1000,
  PEPPER_HEX: "c6f42a5d54a4f2f6b35d2e9c9b1d8e4af1a9c7b3e5d1c2f0c4e2a8b6d0f9a1c3",
};

function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }); return d; }
function workPath(...p: string[]) { return path.join(process.cwd(), CONST.WORK_DIR, ...p); }
function hasCmd(cmd: string) { try { execFileSync(cmd, ["-v"], { stdio: "ignore" }); return true; } catch { return false; } }

function resolvePreload(): string {
  const cands = [
    path.join(__dirname, "preload.cjs"),
    path.join(process.cwd(), "packages/app/mainproc/dist/preload.cjs"),
    path.join(process.cwd(), "packages/app/dist/preload.cjs"),
    path.join(process.cwd(), "dist/preload.cjs"),
  ];
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch { } }
  throw new Error("preload.cjs not found");
}

function findFileUp(start: string, rel: string): string | undefined {
  let cur = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    const cand = path.join(cur, rel);
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  return undefined;
}
function candidatesFor(binName: "encode" | "decode"): string[] {
  return [
    path.join(process.cwd(), "GitZipQR.cpp/build", binName),
    path.join(process.cwd(), "build", binName),
    path.join(process.cwd(), "dist", binName),
    findFileUp(__dirname, `../../GitZipQR.cpp/build/${binName}`) || "",
    findFileUp(__dirname, `../GitZipQR.cpp/build/${binName}`) || "",
    path.join(path.dirname(app.getPath("exe")), binName),
  ].filter(Boolean) as string[];
}
function candidatesForPaperx(): string[] {
  return [
    path.join(process.cwd(), "PaperStorageX/build/paperx"),
    path.join(process.cwd(), "build/paperx"),
    path.join(process.cwd(), "dist/paperx"),
    path.join(path.dirname(app.getPath("exe")), "paperx"),
  ].filter(Boolean);
}
function resolvePaperx(): string {
  const list = candidatesForPaperx();
  for (const p of list) {
    try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return fs.realpathSync.native(p); } catch { }
  }
  throw new Error(`paperx binary not found (searched: ${list.join(", ")})`);
}

function resolveBin(name: "encode" | "decode"): string {
  const list = candidatesFor(name);
  for (const p of list) { try { if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return fs.realpathSync.native(p); } catch { } }
  // scan workspace (skip node_modules/.git)
  try {
    const root = process.cwd(); const stack = [root];
    while (stack.length) {
      const d = stack.pop()!; const items = fs.readdirSync(d, { withFileTypes: true });
      for (const it of items) {
        const fp = path.join(d, it.name);
        if (it.isDirectory()) { if (it.name === "node_modules" || it.name === ".git") continue; stack.push(fp); }
        else if (it.isFile() && path.basename(fp) === name) return fs.realpathSync.native(fp);
      }
    }
  } catch { }
  throw new Error(`${name} binary not found (searched: ${candidatesFor(name).join(", ")})`);
}

let BIN_ENC = ""; let BIN_DEC = "";
function initBins() { BIN_ENC = resolveBin("encode"); BIN_DEC = resolveBin("decode"); }

let win: BrowserWindow | undefined;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitServer(url: string, timeout = 20000) {
  const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { const r = await fetch(url as any, { method: "HEAD" } as any); if (r) return; } catch { } await wait(250); }
}
async function createWindow() {
  initBins();
  win = new BrowserWindow({
    width: 1200, height: 800, backgroundColor: "#0b0b0f",
    webPreferences: { preload: resolvePreload(), contextIsolation: true, nodeIntegration: false }
  });
  await waitServer(`http://localhost:${CONST.UI_PORT}`, 20000).catch(() => { });
  await win.loadURL(`http://localhost:${CONST.UI_PORT}`);
  win?.on("closed", () => { win = undefined; });
}
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => { /* keep running */ });
  app.on("activate", () => { if (!win) createWindow(); });
}

// ---- helpers ----
function send(kind: "enc" | "dec" | "sys", line: string) { try { win?.webContents.send("progress", { kind, line }); } catch { } }
function runStreaming(cmd: string, args: string[], opts: any = {}, kind: "enc" | "dec") {
  return new Promise<{ code: number }>((resolve) => {
    const p = spawn(cmd, args, { ...opts });
    p.stdout.on("data", (d: Buffer) => d.toString().split(/\r?\n/).forEach(s => s && send(kind, s)));
    p.stderr.on("data", (d: Buffer) => d.toString().split(/\r?\n/).forEach(s => s && send("sys", s)));
    p.on("close", (code) => resolve({ code: code ?? -1 }));
  });
}
function ensurePathReal(p: string) { let r = p; try { r = fs.realpathSync.native(p); } catch { } return r; }

// ---- encrypted local state (credits/bonus) ----
function readFileSilent(p: string) { try { return fs.readFileSync(p, "utf8").trim(); } catch { return ""; } }
function hasCmdLocal(cmd: string) { try { execFileSync(cmd, ["-v"], { stdio: "ignore" }); return true; } catch { return false; } }
function getHW(): string {
  const parts: string[] = []; try { parts.push(os.platform(), os.arch()); } catch { }
  try { const c = os.cpus?.(); if (c?.length) parts.push(c[0].model, String(c.length)); } catch { }
  parts.push(readFileSilent("/etc/machine-id"));
  parts.push(readFileSilent("/sys/class/dmi/id/board_name"), readFileSilent("/sys/class/dmi/id/board_serial"), readFileSilent("/sys/class/dmi/id/product_uuid"));
  if (hasCmdLocal("lspci")) {
    try {
      const out = execFileSync("sh", ["-lc", "lspci | grep -i 'VGA\\|3D' | tr -s ' ' | cut -d' ' -f4- | tr -d '\\n'"], { encoding: "utf8" });
      parts.push(out.trim());
    } catch { }
  }
  return parts.filter(Boolean).join("|");
}
function deviceId() { return crypto.createHash("sha256").update(getHW()).digest("hex"); }
function kdf(): Buffer { return crypto.scryptSync(deviceId(), Buffer.from(CONST.PEPPER_HEX, "hex"), 32); }
const statePath = workPath("state.enc");
type Persist = { credits: number; bonusLeft: number; bonusExpireAt: number | null; hw: string; createdAt: number; };
function saveState(obj: Persist) {
  const json = JSON.stringify(obj);
  const key = kdf(); const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, Buffer.concat([iv, tag, enc]));
}
function loadState(): Persist {
  try {
    const buf = fs.readFileSync(statePath);
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
    const dec = crypto.createDecipheriv("aes-256-gcm", kdf(), iv); dec.setAuthTag(tag);
    const j = JSON.parse(Buffer.concat([dec.update(enc), dec.final()]).toString("utf8"));
    if (j.hw && j.hw !== deviceId()) throw new Error("HW mismatch");
    return { credits: +(j.credits || 0), bonusLeft: +(j.bonusLeft || 0), bonusExpireAt: j.bonusExpireAt ?? null, hw: deviceId(), createdAt: +(j.createdAt || Date.now()) };
  } catch {
    const init: Persist = { credits: 0, bonusLeft: CONST.BONUS_CREDITS, bonusExpireAt: Date.now() + CONST.BONUS_MS, hw: deviceId(), createdAt: Date.now() };
    saveState(init); return init;
  }
}
let { credits, bonusLeft, bonusExpireAt } = loadState();
const floorUsdt = CONST.PRICE_USDT;
let lastUsdt = 1.0000 as number;
let lastPriceDir: "up" | "down" | "same" = "same";
const startedAt = Date.now();
function bonusRemainSec(): number { if (!bonusExpireAt || bonusLeft <= 0) return 0; return Math.max(0, Math.floor((bonusExpireAt - Date.now()) / 1000)); }

function persist() { saveState({ credits, bonusLeft, bonusExpireAt, hw: deviceId(), createdAt: startedAt }); }

function broadcastPrice() {
  const old = lastUsdt; const delta = (Math.random() - 0.5) / 500;
  lastUsdt = Math.max(0.995, Math.min(1.005, lastUsdt + delta));
  lastPriceDir = lastUsdt > old ? "up" : lastUsdt < old ? "down" : "same";
  win?.webContents.send("price.update", { data: { "usd-coin": { usdt: lastUsdt, dir: lastPriceDir } }, floorUsdt });
}
setInterval(broadcastPrice, 5000);
setInterval(() => { if (bonusLeft > 0 && bonusExpireAt && bonusRemainSec() === 0) { bonusLeft = 0; bonusExpireAt = null; persist(); } }, 1000);

// ---- credit utils: PRO-only debit ----
function tryConsume(n: number, why?: string): { ok: boolean; err?: string } {
  const need = Math.max(0, Number(n || 0));
  if (need === 0) return { ok: true };
  let take = Math.min(credits, need);
  credits -= take;
  let left = need - take;
  if (left > 0 && bonusLeft > 0) {
    const b = Math.min(bonusLeft, left);
    bonusLeft -= b;
    left -= b;
    if (bonusLeft <= 0) bonusExpireAt = null;
  }
  if (left === 0) { persist(); return { ok: true }; }
  // rollback nothing to rollback (we subtracted optimistically) -> treat as failed consume and re-add what we took
  credits += take;
  bonusLeft += (need - take - left); // add back used bonus if any
  persist();
  return { ok: false, err: "no_credits" };
}

// ---- IPC basic FS ----
ipcMain.handle("file.openPath", async (_e, p: string) => shell.openPath(String(p || "")));
ipcMain.handle("file.showInFolder", async (_e, p: string) => shell.showItemInFolder(String(p || "")));
ipcMain.handle("file.pickPath", async (e, { mode }: { mode: "fileOrDir" | "dir" | "pdf" | "pass" | "file" }) => {
  const parent = BrowserWindow.fromWebContents(e.sender) || win;
  let props: any[] = [];
  let filters: any[] | undefined;

  switch (mode) {
    case "dir": props = ["openDirectory"]; break;
    case "pdf": props = ["openFile"]; filters = [{ name: "PDF", extensions: ["pdf"] }]; break;
    case "pass": props = ["openFile"]; filters = [{ name: "Pass", extensions: ["txt", "bin", "key", "pass"] }]; break;
    case "file": props = ["openFile"]; break;
    default: props = ["openFile", "openDirectory"]; break;
  }

  const r = await dialog.showOpenDialog(parent ?? undefined, { properties: props as any, filters });
  if (r.canceled || r.filePaths.length === 0) return { ok: false };
  return { ok: true, path: r.filePaths[0] };
});

ipcMain.handle("file.pickImage", async (e) => {
  const parent = BrowserWindow.fromWebContents(e.sender) || win;
  const r = await dialog.showOpenDialog(parent ?? undefined, { properties: ["openFile"], filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }] });
  if (r.canceled || r.filePaths.length === 0) return { ok: false };
  return { ok: true, path: r.filePaths[0] };
});

// ---- encoder (PRO: charge 1 credit)
ipcMain.handle("encoder.run", async (_e, { input, outDir, pass, makePdf, pro }: { input: string; outDir?: string; pass?: string; makePdf?: boolean; pro?: boolean }) => {
  try {
    // OSS is free; PRO requires debit
    if (pro === true) {
      const c = tryConsume(1, "encoder.run");
      if (!c.ok) return { ok: false, error: "No credits" };
    }
    const ENC = resolveBin("encode");
    if (!input) throw new Error("No input path");
    let real = ensurePathReal(input);
    if (!fs.existsSync(real)) throw new Error(`Input path not found: ${real}`);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    let pngDir: string;
    if (outDir && typeof outDir === "string") {
      pngDir = require("node:path").isAbsolute(outDir) ? outDir : workPath(outDir);
    } else {
      pngDir = workPath(`qrcodes-${ts}`);
    }
    ensureDir(pngDir);
    const env = { ...process.env, ...(pass ? { GZQR_PASS: String(pass) } : {}) };
    send("sys", `encode → ${real} → ${pngDir}`);
    const r = await runStreaming(ENC, [real, pngDir], { env }, "enc");
    if (r.code !== 0) return { ok: false, error: `encode exit ${r.code}` };

    let pdf: string | undefined;
    if (makePdf) {
      const PDFDocument = (await import("pdfkit")).default;
      const sharp = (await import("sharp")).default;
      const files = fs.readdirSync(pngDir).filter(f => f.endsWith(".png")).sort();
      const pdfOut = workPath(`QR_${ts}.pdf`);
      const doc = new PDFDocument({ size: "A4", margin: 18 });
      const ws = fs.createWriteStream(pdfOut); doc.pipe(ws);
      const cols = 3, rows = 3;
      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const pageH = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
      const cellW = Math.floor(pageW / cols), cellH = Math.floor(pageH / rows);
      let i = 0;
      for (const f of files) {
        if (i > 0 && i % (cols * rows) === 0) doc.addPage();
        const x = (i % cols) * cellW + doc.page.margins.left;
        const y = Math.floor(i / cols) % rows * cellH + doc.page.margins.top;
        const img = await (await import("sharp")).default(path.join(pngDir, f)).resize(cellW - 8, cellH - 28, { fit: "contain" }).png().toBuffer();
        doc.image(img, x + 4, y + 12);
        doc.fontSize(8).fillColor("#333").text(String(i + 1).padStart(6, "0"), x + 4, y + 2, { width: cellW - 8, align: "center" });
        i++;
      }
      doc.end(); await new Promise(res => ws.on("close", res));
      send("sys", `PDF ready: ${pdfOut}`);
      pdf = pdfOut;
    }
    return { ok: true, pngDir, pdf };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
});

// ---- decoder (+robust tar) — PRO: charge 1 credit
ipcMain.handle("decoder.run", async (_e, { dir, outDir, pass, pro }: { dir: string; outDir?: string; pass?: string; pro?: boolean }) => {
  try {
    if (pro) {
      const c = tryConsume(1, "decoder.run");
      if (!c.ok) return { ok: false, error: "No credits" };
    }
    const DEC = resolveBin("decode");
    let real = ensurePathReal(dir);
    if (!fs.existsSync(real)) throw new Error(`PNG folder not found: ${real}`);
    let out: string;
    if (outDir && typeof outDir === "string") {
      out = require("node:path").isAbsolute(outDir) ? outDir : workPath(outDir);
    } else {
      out = workPath("out");
    }
    ensureDir(out);
    const env = { ...process.env, ...(pass ? { GZQR_PASS: String(pass) } : {}) };
    send("sys", `decode ← ${real} → ${out}`);
    const r = await runStreaming(DEC, [real, out], { env }, "dec");
    if (r.code !== 0) return { ok: false, error: `decode exit ${r.code}` };

    let restoredFile: string | undefined;
    try {
      const files = fs.readdirSync(out).filter(f => !f.startsWith(".") && !f.endsWith(".tar"));
      const only = files.length === 1 ? path.join(out, files[0]) : undefined;
      if (only && fs.statSync(only).isFile()) restoredFile = only;
    } catch { }

    // make tar (system tar or archiver fallback)
    let tarPath: string | undefined;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    tarPath = workPath(`restored-${ts}.tar`);
    try {
      if (hasCmd("tar")) {
        await new Promise<void>((resolve, reject) => {
          const cmd = `tar -cf "${tarPath}" -C "${out}" . --exclude='*.tar'`;
          execFile("sh", ["-lc", cmd], (err) => err ? reject(err) : resolve());
        });
      } else {
        const { default: archiver } = await import("archiver");
        await new Promise<void>((resolve, reject) => {
          const output = fs.createWriteStream(tarPath!);
          const archive = archiver("tar", {});
          output.on("close", () => resolve());
          archive.on("error", err => reject(err));
          archive.pipe(output);
          archive.glob("**/*", { cwd: out, dot: false, ignore: ["**/*.tar"] });
          archive.finalize();
        });
      }
      send("sys", `tar ready: ${tarPath}`);
    } catch (e: any) { send("sys", `tar error: ${String(e?.message || e)}`); tarPath = undefined; }

    return { ok: true, outDir: out, tarPath, restoredFile };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
});

// ---- PDF → PNGs (used in decrypt): PRO: charge 1 credit when flagged
ipcMain.handle("pdf.toPngs", async (_e, { pdf, outDir, pro }: { pdf: string; outDir?: string; pro?: boolean }) => {
  try {
    if (pro) {
      const c = tryConsume(1, "pdf.toPngs");
      if (!c.ok) return { ok: false, error: "No credits" };
    }
    if (!pdf) throw new Error("No PDF path");
    let real = ensurePathReal(pdf);
    if (!fs.existsSync(real)) throw new Error(`PDF not found: ${real}`);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    let pngDir: string;
    if (outDir && typeof outDir === "string") {
      pngDir = require("node:path").isAbsolute(outDir) ? outDir : workPath(outDir);
    } else {
      pngDir = workPath(`qrcodes-${ts}`);
    }
    ensureDir(pngDir);
    await fsp.mkdir(pngDir, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const onErr = (e: any) => reject(new Error(String(e?.message || e)));
      if (hasCmd("pdftoppm")) {
        execFile("pdftoppm", [real, path.join(pngDir, "page"), "-png", "-r", "300"], (err) => err ? onErr(err) : resolve()); return;
      }
      if (hasCmd("gs")) {
        execFile("gs", ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=png16m", "-r300", "-sOutputFile=" + path.join(pngDir, "page-%04d.png"), real],
          (err) => err ? onErr(err) : resolve()); return;
      }
      reject(new Error("No converter found: install poppler-utils or Ghostscript."));
    });
    return { ok: true, dir: pngDir };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
});

// ---- Payments (unchanged)
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
async function rpc(method: string, params: any[]) {
  const res = await fetch(CONST.PAY_RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!res.ok) throw new Error("rpc http " + res.status);
  const j = await res.json(); if (j.error) throw new Error(j.error.message || String(j.error));
  return j.result;
}
function padAddr(a: string) { return "0x" + a.replace(/^0x/, "").toLowerCase().padStart(64, "0"); }

ipcMain.handle("payment.verifyTx", async (_e, txHash: string) => {
  try {
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ""))) return { ok: false, error: "Bad tx hash" };
    const tx = await rpc("eth_getTransactionByHash", [txHash]);
    const rcp = await rpc("eth_getTransactionReceipt", [txHash]);
    if (!rcp || !rcp.blockNumber) return { ok: false, pending: true, error: "Receipt not found yet" };

    const latestHex = await rpc("eth_blockNumber", []); const latest = parseInt(latestHex, 16), mined = parseInt(rcp.blockNumber, 16);
    const conf = latest - mined + 1;
    if (conf < CONST.CONFIRMATIONS) return { ok: false, pending: true, confirmations: conf, need: CONST.CONFIRMATIONS };

    // accept ONLY USDC Transfer to RECEIVER
    let creditsAdded = 0;
    for (const lg of (rcp.logs || [])) {
      const addr = String(lg.address || "").toLowerCase();
      if (addr !== CONST.USDC) continue;
      const topics = lg.topics || [];
      if (!topics.length || String(topics[0]).toLowerCase() !== TRANSFER_TOPIC) continue;
      if (String(topics[2] || "").toLowerCase() !== padAddr(CONST.RECEIVER)) continue;
      const val = BigInt(String(lg.data || "0"));             // 6 decimals
      const need = BigInt(Math.trunc(CONST.PRICE_USDT * (10 ** 6)));
      if (val >= need) {
        const mult = Number(val / need);                      // full 1500 chunks
        creditsAdded = Math.max(creditsAdded, Math.max(1, mult) * 2);
      }
    }

    if (creditsAdded > 0) {
      credits += creditsAdded; persist();
      return { ok: true, confirmations: conf, creditsAdded };
    }
    return { ok: false, error: "No qualifying USDC transfer to receiver" };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
});

// ---- Credits / Bonus / Uptime / Price ----
ipcMain.handle("credits.add", async (_e, n: number) => {
  try {
    const add = Math.max(0, Number(n || 0));
    if (add <= 0) return { ok: false, error: "amount<=0" };
    credits += add;
    persist();
    return { ok: true, credits, bonusLeft };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle("credits.get", async () => ({ ok: true, credits, bonusLeft, bonusExpireSec: Math.max(0, Math.floor((bonusExpireAt ? (bonusExpireAt - Date.now()) : 0) / 1000)) }));
ipcMain.handle("credits.consume", async (_e, { n }: { n: number, why?: string }) => {
  const c = tryConsume(Math.max(0, Number(n || 0)));
  return { ok: c.ok, credits, bonusLeft };
});
ipcMain.handle("uptime.get", async () => ({ ok: true, sec: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) }));
ipcMain.handle("bonus.tick", async () => ({ ok: true, bonusSec: Math.max(0, Math.floor((bonusExpireAt ? (bonusExpireAt - Date.now()) : 0) / 1000)), bonusLeft }));
ipcMain.handle("price.subscribe", async () => { broadcastPrice(); return { ok: true }; });

// ---- Live Scan helper (PRO: charge 1 credit)
ipcMain.handle("live.scan", async () => {
  try {
    const c = tryConsume(1, "live.scan");
    if (!c.ok) return { ok: false, error: "No credits" };
    const p = spawn("bun", ["packages/app/scripts/scan_live.ts"], { cwd: process.cwd() });
    const send = (line: string) => { try { win?.webContents.send("progress", { kind: "sys", line }); } catch { } };
    p.stdout.on("data", (d: Buffer) => String(d).split(/\r?\n/).forEach(s => s && send(s)));
    p.stderr.on("data", (d: Buffer) => String(d).split(/\r?\n/).forEach(s => s && send("[scan] " + s)));
    p.on("close", (code) => send("live scan exited: " + code));
    return { ok: true };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
});

// ---- utils: find zip in a dir ----
ipcMain.handle("dir.findZip", async (_e, dir: string) => {
  try {
    const d = String(dir || "");
    if (!d || !fs.existsSync(d) || !fs.statSync(d).isDirectory()) return { ok: false, error: "bad dir" };
    const list = fs.readdirSync(d).filter(f => f.toLowerCase().endsWith(".zip"))
      .map(f => ({ f, t: fs.statSync(require("node:path").join(d, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (!list.length) return { ok: false };
    const path = require("node:path").join(d, list[0].f);
    return { ok: true, path };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// ---- Cancel helpers ----
function pkillLike(needle: string) { try { if (hasCmd("pkill")) execFile("pkill", ["-f", needle], () => { }); } catch { } }
ipcMain.handle("enc-cancel", async () => { pkillLike("GitZipQR.cpp/build/encode"); return { ok: true }; });
ipcMain.handle("dec-cancel", async () => { pkillLike("GitZipQR.cpp/build/decode"); return { ok: true }; });

// ---- STEGO: save WEBP (PRO: charge 1 credit always)
try {
  const _path = require("path");
  const _fs = require("fs");
  const _fsp = require("fs/promises");
  if (!(globalThis as any).__gzqr_stego_registered) {
    (globalThis as any).__gzqr_stego_registered = true;
    
ipcMain.handle("stego.saveWebp", async (_e, { dataUrl, outName, pro }: { dataUrl: string; outName?: string; pro?: boolean }) => {
      try {
        if (pro) { if (pro) { const c = tryConsume(1, "stego.saveWebp"); if (!c.ok) return { ok: false, error: "No credits" }; } }

        if (!/^data:image\/webp;base64,/.test(String(dataUrl || ""))) throw new Error("Bad data URL");
        const buf = Buffer.from(String(dataUrl).split(",", 2)[1] || "", "base64");
        if (!buf.length) throw new Error("Empty data");
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const safeName = (outName || `stego-${ts}.webp`).replace(/[\\/:*?"<>|]/g, "");
        const outDir = workPath("stego");
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, safeName);
        await fsp.writeFile(outPath, buf);
        send("sys", "Stego WEBP saved: " + outPath);
        return { ok: true, path: outPath };
      } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
    });


    // ---- JSONL manual decoder (no charge unless you decide later)
    ipcMain.handle("jsonl.decode", async (_e, payload: { text: string; pass?: string }) => {
      try {
        const text = String(payload?.text || "").trim();
        if (!text) return { ok: false, error: "Empty JSONL" };
        const lines = text.split(/\r?\n|\s{2,}|\s*;\s*|\s*\\n\s*/).filter(Boolean); // терпимо к пробелам/переносам
        type Meta = {
          type: string; version: string; chunk: number; total: number; hash: string; cipherHash: string;
          saltB64: string; nonceB64: string; name: string; ext: string; chunkSize: number; dataB64: string;
        };
        const chunks = new Map<number, Buffer>();
        let expectedTotal = -1, name = "restored", ext = "", cipherHash = "";
        let salt = Buffer.alloc(0), nonce = Buffer.alloc(0);
        const sha256hex = (b: Buffer) => require("crypto").createHash("sha256").update(b).digest("hex");

        for (const raw of lines) {
          try {
            const j = JSON.parse(raw) as Meta;
            if (!j?.type || !/-CHUNK-ENC$/.test(j.type)) continue;
            if (expectedTotal < 0) expectedTotal = j.total;
            cipherHash = cipherHash || j.cipherHash;
            name = (name === "restored" && j.name) ? j.name : name;
            ext = ext || j.ext || "";
            if (salt.length === 0 && j.saltB64) salt = Buffer.from(j.saltB64, "base64");
            if (nonce.length === 0 && j.nonceB64) nonce = Buffer.from(j.nonceB64, "base64");
            const buf = Buffer.from(j.dataB64, "base64");
            if (sha256hex(buf) !== j.hash) throw new Error("per-chunk sha256 mismatch");
            chunks.set(j.chunk, buf);
          } catch { }
        }
        if (expectedTotal < 0 || chunks.size !== expectedTotal) return { ok: false, error: `Missing chunks ${chunks.size}/${expectedTotal < 0 ? "?" : expectedTotal}` };

        const cipher = Buffer.concat([...Array(expectedTotal).keys()].map(i => chunks.get(i)!));
        if (sha256hex(cipher) !== cipherHash) return { ok: false, error: "Global sha256 mismatch" };

        const tag = cipher.subarray(cipher.length - 16);
        const body = cipher.subarray(0, cipher.length - 16);
        const pass = String(payload?.pass || process.env.GZQR_PASS || "");
        if (!pass || pass.length < 8) return { ok: false, error: "Set password (>=8)" };

        const cryptoNode = require("crypto");
        const key = cryptoNode.scryptSync(pass, salt, 32, { N: 1 << 15, r: 8, p: 8, maxmem: 512 * 1024 * 1024 });
        const dec = cryptoNode.createDecipheriv("aes-256-gcm", key, nonce);
        dec.setAuthTag(tag);
        const plain = Buffer.concat([dec.update(body), dec.final()]);

        const outDir = workPath("out");
        ensureDir(outDir);
        const base = (name || "restored") + (ext || "");
        const outPath = require("node:path").join(outDir, base);
        require("node:fs").writeFileSync(outPath, plain);
        send("sys", "manual JSONL restored → " + outPath);
        return { ok: true, outPath, outDir };
      } catch (e: any) {
        return { ok: false, error: String(e?.message || e) };
      }
    });
    ipcMain.handle("paperx.run", async (_e, payload: any) => {
      try {
        const PXP = resolvePaperx();
        const mode = String(payload?.mode || "encode");           // "encode" | "decode"
        const work = workPath("paperx");
        ensureDir(work);

        const env = { ...process.env };
        // пароль: берем из passFile или pass
        if (payload?.passFile && fs.existsSync(payload.passFile)) {
          env.GZQR_PASS = fs.readFileSync(payload.passFile, "utf8");
        } else if (payload?.pass) {
          env.GZQR_PASS = String(payload.pass);
        }

        if (mode === "encode") {
          // ожидаем: input (директория/файл), outBase, type, page, dpi, marginMM, cell, nanotech
          const inPath = ensurePathReal(String(payload?.input || ""));
          if (!inPath) throw new Error("paperx.encode: no input");
          const base = String(payload?.outBase || "PAPERX");
          const page = String(payload?.page || "A4");
          const dpi = String(Math.max(72, Math.min(1200, Number(payload?.dpi || 600))));
          const mm = String(Math.max(0, Math.min(50, Number(payload?.marginMM || 5))));
          const cell = String(Math.max(1, Math.min(4, Number(payload?.cell || 1))));
          const type = (payload?.type === "zip") ? "zip" : "tar";
          const args = [
            "encode",
            "--page", page,
            "--dpi", dpi,
            "--margin-mm", mm,
            "--cell", cell,
            "--type", type,
          ];
          if (payload?.nanotech) args.push("--nanotech");
          if (env.GZQR_PASS) args.push("--password", "__ENV__"); // просто маркер для лога
          args.push(inPath, base);

          send("sys", `paperx encode → ${inPath} → ${base}.pdf`);
          const { code } = await runStreaming(PXP, args, { cwd: work, env }, "enc");
          if (code !== 0) return { ok: false, error: `paperx encode exit ${code}` };

          const pdfPath = path.join(work, base.endsWith(".pdf") ? base : `${base}.pdf`);
          if (!fs.existsSync(pdfPath)) return { ok: true, pdfPath: undefined }; // возможно, tool сам назвал файл
          return { ok: true, pdfPath };
        }

        if (mode === "decode") {
          // ожидаем: inputPdf(s) (string | string[]), outFile (базовое имя)
          const list = ([] as string[]).concat(payload?.input || payload?.pdf || []).filter(Boolean);
          if (!list.length) throw new Error("paperx.decode: no PDF input");
          for (let i = 0; i < list.length; i++) list[i] = ensurePathReal(String(list[i]));
          const outBase = String(payload?.outFile || payload?.outBase || "restored.bin");
          const args = ["decode"];
          if (env.GZQR_PASS) args.push("--password", "__ENV__");
          // CLI из репо ожидает 1..N PDF и конечный out_file
          args.push(...list, outBase);

          send("sys", `paperx decode ← ${list.join(", ")} → ${outBase}`);
          const { code } = await runStreaming(PXP, args, { cwd: work, env }, "dec");
          if (code !== 0) return { ok: false, error: `paperx decode exit ${code}` };

          const outPath = path.join(work, outBase);
          return { ok: true, outPath, outDir: work };
        }

        return { ok: false, error: "paperx.run: bad mode" };
      } catch (e: any) {
        return { ok: false, error: String(e?.message || e) };
      }
    });

  }
} catch (_e) { }
