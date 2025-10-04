import { contextBridge, ipcRenderer } from "electron";
let onProgressCb=null;
ipcRenderer.on("progress-line",(_e,d)=>{try{onProgressCb?.(d)}catch{}});

contextBridge.exposeInMainWorld("electron",{ipc:{
  invoke:(ch,payload)=>ipcRenderer.invoke(ch,payload),
  onProgress:(cb)=>{onProgressCb=cb; return ()=>{onProgressCb=null;}}
}});

contextBridge.exposeInMainWorld("gzqrExtra",{
  creditsGet:()=>ipcRenderer.invoke("credits.get"),
  creditsConsume:(n=1)=>ipcRenderer.invoke("credits.consume",{n}),
  uptimeGet:()=>ipcRenderer.invoke("uptime.get"),
  payVerify:(txHash)=>ipcRenderer.invoke("pay.verify",{txHash}),
  payVerifyTx:(txHash)=>ipcRenderer.invoke("pay.verifyTx",txHash),
  pickImage:()=>ipcRenderer.invoke("file.pickImage"),
  pickPDF:()=>ipcRenderer.invoke("file.pickPDF"),
  encCancel:()=>ipcRenderer.invoke("encoder.cancel"),
  decCancel:()=>ipcRenderer.invoke("decoder.cancel"),
  copy:(text)=>ipcRenderer.invoke("clipboard.copy",{text}),
  saveWebp:(dataUrl,name)=>ipcRenderer.invoke("file.saveWebp",{dataUrl,name}),
  liveScan:()=>ipcRenderer.invoke("live.scan"),
});
