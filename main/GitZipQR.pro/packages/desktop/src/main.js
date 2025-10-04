import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from "electron";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import os from "os";
import { JsonRpcProvider, Interface } from "ethers";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

/* --------- CONSTS ---------- */
const BIN_ENC="/usr/local/bin/encode";
const BIN_DEC="/usr/local/bin/decode";
const ETH_RPC="https://cloudflare-eth.com";
const CRYPTO_ADDR="0xa8b3a40008edf9af21d981dc3a52aa0ed1ca88fd".toLowerCase();
const USDC_ERC20="0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48".toLowerCase();
const PRO_PRICE_USDT=1500;
/* -------------------------------------- */

let mainWin, startedAt=Date.now(), encProc=null, decProc=null;

const sha256hex = (buf)=>createHash("sha256").update(buf).digest("hex");

function hwFingerprint(){
  const parts=[];
  try{ parts.push(readFileSync("/proc/cpuinfo")); }catch{}
  try{ parts.push(readFileSync("/sys/class/dmi/id/board_serial")); }catch{}
  try{ parts.push(readFileSync("/sys/class/dmi/id/product_uuid")); }catch{}
  try{ parts.push(Buffer.from(os.hostname())); }catch{}
  try{
    const ifs = os.networkInterfaces();
    for(const k of Object.keys(ifs||{})){
      for(const it of ifs[k] || []){
        if(it && it.mac && it.mac !== "00:00:00:00:00:00") parts.push(Buffer.from(it.mac));
      }
    }
  }catch{}
  try{
    for(const p of ["/sys/block/sda/device/serial","/sys/block/vda/device/serial","/sys/block/nvme0n1/device/serial"]){
      try{ parts.push(readFileSync(p)); }catch{}
    }
  }catch{}
  const buf=Buffer.concat(parts.filter(Boolean));
  return sha256hex(buf.length?buf:Buffer.from("fallback"));
}

/* ---- Encrypted state (credits/trial/uptime) ---- */
const DATA_DIR=join(app.getPath("userData"),"secure");
const SEC_FILE=join(DATA_DIR,"credits.enc");
const ensureDir=(p)=>{try{mkdirSync(p,{recursive:true})}catch{}}
function encKeyIv(){
  const salt=Buffer.from(hwFingerprint(),"hex");
  const key=scryptSync(hwFingerprint(),salt,32,{N:1<<16,r:8,p:1,maxmem:1024*1024*1024});
  const iv=createHash("sha256").update(salt).digest().subarray(0,12);
  return {key,iv};
}
function freshState(){return{fph:hwFingerprint(),credits:0,bonusLeft:2,trial:{grantedAt:Date.now(),expiresAt:Date.now()+24*3600*1000},uptimeTotal:0,_nonce:randomBytes(12).toString("hex")}}
function loadState(){ensureDir(DATA_DIR);if(!existsSync(SEC_FILE))return freshState();try{const{key,iv}=encKeyIv();const blob=readFileSync(SEC_FILE);const tag=blob.subarray(0,16),ct=blob.subarray(16);const dec=createDecipheriv("aes-256-gcm",key,iv);dec.setAuthTag(tag);const json=Buffer.concat([dec.update(ct),dec.final()]).toString("utf8");const st=JSON.parse(json);if(st.fph!==hwFingerprint())throw new Error("HW mismatch");return st}catch{return freshState()}}
function saveState(st){ensureDir(DATA_DIR);const{key,iv}=encKeyIv();const enc=createCipheriv("aes-256-gcm",key,iv);const pt=Buffer.from(JSON.stringify(st));const ct=Buffer.concat([enc.update(pt),enc.final()]);const tag=enc.getAuthTag();writeFileSync(SEC_FILE,Buffer.concat([tag,ct]));}
function creditsConsume(n){const st=loadState(); if(st.credits<n && st.bonusLeft<=0) return {ok:false,error:"Not enough credits",credits:st.credits,bonusLeft:st.bonusLeft};
  let need=n|0;
  if(st.credits>=need){st.credits-=need;need=0;} else {need-=st.credits;st.credits=0;}
  if(need>0){const take=Math.min(need,st.bonusLeft);st.bonusLeft-=take;need-=take;}
  if(need>0){saveState(st);return{ok:false,error:"Not enough credits",credits:st.credits,bonusLeft:st.bonusLeft};}
  saveState(st);return{ok:true,credits:st.credits,bonusLeft:st.bonusLeft};}
function creditsAdd(n){const st=loadState();st.credits+=n;saveState(st);return{ok:true,credits:st.credits};}

/* ---- ETH/USDC verify with 10-minute TTL & self-transfer rule ---- */
const USDC_IFACE=new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
async function verifyPaymentStrict({txHash,needUsdt}){
  const provider=new JsonRpcProvider(ETH_RPC);
  const rcpt=await provider.getTransactionReceipt(txHash).catch(()=>null);
  if(!rcpt) return {ok:false,error:"Tx not found",pending:true,confirmations:0,need:1};
  if((rcpt.confirmations??0)<1) return {ok:false,error:"Pending",pending:true,confirmations:rcpt.confirmations||0,need:1};

  const blk = await provider.getBlock(rcpt.blockNumber).catch(()=>null);
  if(!blk) return {ok:false,error:"Block not found"};
  const ageSec = Math.max(0, Math.floor(Date.now()/1000 - Number(blk.timestamp)));
  if(ageSec>600) return {ok:false,error:"Tx too old (>10 min)"};

  let paidToOurWallet=0n, selfTransfer=false;
  for(const log of rcpt.logs||[]){
    if((log.address||"").toLowerCase()!==USDC_ERC20) continue;
    try{
      const evt=USDC_IFACE.parseLog({data:log.data,topics:log.topics});
      const from=(evt.args.from||"").toLowerCase();
      const to  =(evt.args.to  ||"").toLowerCase();
      const val = BigInt(evt.args.value.toString());
      if(from===to && val>0n) selfTransfer=true;
      if(to===CRYPTO_ADDR) paidToOurWallet += val;
    }catch{}
  }

  const need = BigInt(Math.round(Number(needUsdt) * 1e6)); // USDC 6 dec
  if(selfTransfer){
    creditsAdd(2);
    return {ok:true,mode:"self",confirmations:rcpt.confirmations||1,granted:2};
  }
  if(paidToOurWallet>=need){
    creditsAdd(2);
    return {ok:true,mode:"wallet",confirmations:rcpt.confirmations||1,granted:2};
  }
  return {ok:false,error:"Amount too small or wrong recipient"};
}

/* ---- piping child progress ---- */
function pipeProgress(child,label){
  const send=(line)=>mainWin?.webContents.send("progress-line",{line});
  child.stdout?.on("data",d=>String(d).split(/\r?\n/).forEach(s=>s&&send(s)));
  child.stderr?.on("data",d=>String(d).split(/\r?\n/).forEach(s=>s&&send(s)));
  child.on("close",code=>send(`${label} exited with code ${code}`));
}

/* ---- IPC ---- */
ipcMain.handle("uptime.get",async()=>{const now=Date.now();return {ok:true,sec:Math.floor((now-startedAt)/1000)}});
ipcMain.handle("credits.get",async()=>{const st=loadState();return {ok:true,credits:st.credits,bonusLeft:st.bonusLeft,bonusExpireSec:Math.max(0,Math.floor((st.trial.expiresAt-Date.now())/1000))}});
ipcMain.handle("credits.consume",async(_e,{n})=>creditsConsume(Math.max(1,Number(n||1))));

// aliases для UI
ipcMain.handle("pay.verify",async(_e,{txHash})=>{try{return await verifyPaymentStrict({txHash,needUsdt:PRO_PRICE_USDT})}catch(e){return {ok:false,error:String(e)}}});
ipcMain.handle("pay.verifyTx",async(_e,txHash)=>{try{return await verifyPaymentStrict({txHash,needUsdt:PRO_PRICE_USDT})}catch(e){return {ok:false,error:String(e)}}});

ipcMain.handle("file.pickImage",async()=>{const r=await dialog.showOpenDialog({properties:["openFile"],filters:[{name:"Images",extensions:["png","jpg","jpeg","webp"]}]});if(r.canceled||!r.filePaths[0])return{ok:false};return {ok:true,path:r.filePaths[0]};});
ipcMain.handle("file.pickPDF",async()=>{const r=await dialog.showOpenDialog({properties:["openFile"],filters:[{name:"PDF",extensions:["pdf"]}]});if(r.canceled||!r.filePaths[0])return{ok:false};return {ok:true,path:r.filePaths[0]};});
ipcMain.handle("file.pickPath",async(_e,{mode})=>{
  const props=mode==="dir"?["openDirectory"]:mode==="file"?["openFile"]:["openFile","openDirectory"];
  const r=await dialog.showOpenDialog({properties:props});
  if(r.canceled||!r.filePaths[0]) return {ok:false};
  return {ok:true,path:r.filePaths[0]};
});
ipcMain.handle("file.openPath",async(_e,p)=>{try{await shell.openPath(p);return {ok:true}}catch(e){return {ok:false,error:String(e)}}});
ipcMain.handle("file.showInFolder",async(_e,p)=>{try{shell.showItemInFolder(p);return {ok:true}}catch(e){return {ok:false,error:String(e)}}});

// Save WEBP из dataURL в ~/Downloads
ipcMain.handle("file.saveWebp",async(_e,{dataUrl,name})=>{
  try{
    const b64 = String(dataUrl||"").split(",")[1]; if(!b64) return {ok:false,error:"bad dataURL"};
    const buf = Buffer.from(b64,"base64");
    const outDir = app.getPath("downloads");
    const outPath = join(outDir, name && name.endsWith(".webp") ? name : (name||"stego.webp"));
    writeFileSync(outPath, buf);
    return {ok:true,path:outPath};
  }catch(e){return {ok:false,error:String(e)}}
});

// Clipboard copy
ipcMain.handle("clipboard.copy",async(_e,{text})=>{try{clipboard.writeText(String(text||""));return {ok:true}}catch(e){return {ok:false,error:String(e)}}});

// Заглушка PDF->PNGs (UI активирует кнопки)
ipcMain.handle("pdf.toPngs",async(_e,{pdf})=>{
  const outDir=join(app.getPath("temp"),"gzqr_png_"+Date.now());
  mkdirSync(outDir,{recursive:true});
  return {ok:true,dir:outDir};
});

ipcMain.handle("encoder.run",async(_e,{input,pass,makePdf,photo,outDir})=>{
  const debit=creditsConsume(1); if(!debit.ok) return {ok:false,error:debit.error};
  if(!existsSync(BIN_ENC)) return {ok:false,error:"Encoder binary not found"};
  const args=[input, pass]; if(makePdf) args.push("--pdf"); if(photo) args.push("--bind-photo",photo); if(outDir) args.push("--out",outDir);
  const ch=spawn(BIN_ENC,args,{env:process.env}); encProc=ch; pipeProgress(ch,"encoder");
  return await new Promise(res=>ch.on("close",code=>{encProc=null; code===0?res({ok:true}):res({ok:false,error:`exit ${code}`})}));
});
ipcMain.handle("decoder.run",async(_e,{dir,pass,photo,outDir})=>{
  const debit=creditsConsume(1); if(!debit.ok) return {ok:false,error:debit.error};
  if(!existsSync(BIN_DEC)) return {ok:false,error:"Decoder binary not found"};
  const args=["--dir",dir,"--pass",pass]; if(photo) args.push("--bind-photo",photo); if(outDir) args.push("--out",outDir);
  const ch=spawn(BIN_DEC,args,{env:process.env}); decProc=ch; pipeProgress(ch,"decoder");
  return await new Promise(res=>ch.on("close",code=>{decProc=null; code===0?res({ok:true}):res({ok:false,error:`exit ${code}`})}));
});
ipcMain.handle("encoder.cancel",async()=>{try{encProc?.kill("SIGINT");return {ok:true}}catch(e){return {ok:false,error:String(e)}}});
ipcMain.handle("decoder.cancel",async()=>{try{decProc?.kill("SIGINT");return {ok:true}}catch(e){return {ok:false,error:String(e)}}});

ipcMain.handle("live.scan",async()=>{
  try{
    const runner = existsSync("/usr/bin/bun") ? "/usr/bin/bun" : "node";
    const scriptPath = join(process.cwd(),"packages","app","scripts","scan_live.ts");
    const ch = spawn(runner, [scriptPath], { env: process.env, stdio: ["ignore","pipe","pipe"], detached: true });
    ch.unref(); return {ok:true,pid:ch.pid};
  }catch(e){return {ok:false,error:String(e)}}
});

/* ---- Wait for server & Window ---- */
async function waitServer(url, timeoutMs=20000){
  const t0=Date.now();
  while(Date.now()-t0 < timeoutMs){
    try{ const r = await fetch(url, { method:"HEAD" }); if(r.ok) return true; }catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  return false;
}
const preloadPath=resolve(__dirname,"preload.js");
async function createWin(){
  mainWin=new BrowserWindow({
    width:1200,height:800,backgroundColor:"#0b0b10",
    webPreferences:{preload:preloadPath,contextIsolation:true,nodeIntegration:false,sandbox:false}
  });
  const url = "http://127.0.0.1:5123";   // важно: не localhost
  await waitServer(url, 20000);
  mainWin.loadURL(url);
}
app.whenReady().then(()=>{createWin();app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWin();});});
app.on("window-all-closed",()=>{const st=loadState();st.uptimeTotal+=(Math.floor((Date.now()-startedAt)/1000));saveState(st);if(process.platform!=="darwin")app.quit();});
