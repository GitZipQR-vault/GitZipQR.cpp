import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  ipc: {
    invoke: (ch:string, payload?:any) => ipcRenderer.invoke(ch, payload),
    onProgress: (cb:(data:{kind:"enc"|"dec"|"sys"; line:string})=>void) => {
      const h = (_:any, d:any) => cb(d);
      ipcRenderer.on("progress", h);
      return () => ipcRenderer.off("progress", h);
    }
  }
});

const api: any = (globalThis as any).api || {};
api.onPrice = (fn:(p:any)=>void) => {
  const h = (_:any, d:any) => fn(d);
  ipcRenderer.on("price.update", h);
  return () => ipcRenderer.off("price.update", h);
};
api.invoke = (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args);
api.on = (channel: string, listener: (data: any) => void) => {
  const handler = (_: any, payload: any) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("api", api);

contextBridge.exposeInMainWorld("gzqrExtra", {
  saveWebp:   (dataUrl:string, outName?:string) => ipcRenderer.invoke("stego.saveWebp", {dataUrl, outName}),
  encCancel:  () => ipcRenderer.invoke("enc-cancel"),
  decCancel:  () => ipcRenderer.invoke("dec-cancel"),
  payVerifyTx:(txHash:string) => ipcRenderer.invoke("payment.verifyTx", txHash),

  creditsGet:     () => ipcRenderer.invoke("credits.get"),
  creditsConsume: (n:number, why?:string) => ipcRenderer.invoke("credits.consume", {n, why}),
  creditsAdd:     (n:number) => ipcRenderer.invoke("credits.add", n),
  uptimeGet:      () => ipcRenderer.invoke("uptime.get"),
  bonusTick:      () => ipcRenderer.invoke("bonus.tick"),
  priceSubscribe: (ids:string[]) => ipcRenderer.invoke("price.subscribe", ids),

  decodeJSONL: (text:string, pass?:string) => ipcRenderer.invoke("jsonl.decode", { text, pass }),

  pickPDF:     () => ipcRenderer.invoke("file.pickPath", {mode:"pdf"}),
  pickImage:   () => ipcRenderer.invoke("file.pickImage"),
  pickPath:    (mode:"fileOrDir"|"dir"|"pdf") => ipcRenderer.invoke("file.pickPath", {mode}),
  pickPassFile:() => ipcRenderer.invoke("file.pickPath", {mode:"pass"}),

  // добавили поле pro для явного указания тарифа
  encRun: (payload:{ input:string; outDir?:string; pass?:string; passFile?:string; makePdf?:boolean; photo?:string; pro?:boolean }) =>
    ipcRenderer.invoke("encoder.run", payload),
  decRun: (payload:{ dir:string; outDir?:string; pass?:string; passFile?:string; photo?:string; pro?:boolean }) =>
    ipcRenderer.invoke("decoder.run", payload),

  paperxRun: (payload:any) => ipcRenderer.invoke("paperx.run", payload),

  // PRO live scan списывается на стороне main
  liveScan:   () => ipcRenderer.invoke("live.scan"),
  copy: async (text:string) => { await navigator.clipboard.writeText(String(text||"")); return {ok:true}; },
});
