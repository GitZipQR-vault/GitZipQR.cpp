#!/usr/bin/env bun
// English-only comments.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
type Meta = { type:string; version:string; chunk:number; total:number; hash:string; cipherHash:string; saltB64:string; nonceB64:string; name:string; ext:string; chunkSize:number; dataB64:string; };
const chunks = new Map<number, Buffer>();
let expectedTotal = -1;
let cipherHash = ""; let name="restored", ext="";
console.log("LiveScan: scan JSON payloads line-by-line; Ctrl+C to exit.");
const rl = new (await import("readline")).Interface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", line=>{
  try{
    const j = JSON.parse(line) as Meta;
    if(!j?.type?.endsWith("-CHUNK-ENC")) return;
    expectedTotal = expectedTotal<0 ? j.total : expectedTotal;
    cipherHash = cipherHash || j.cipherHash;
    name = name==="restored" ? j.name : name;
    ext = ext || j.ext;
    const buf = Buffer.from(j.dataB64, "base64");
    chunks.set(j.chunk, buf);
    process.stdout.write(`ok chunk ${j.chunk+1}/${j.total}\n`);
    if(chunks.size===expectedTotal){
      const tmp = path.join(os.tmpdir(), "gzqr-livecipher.bin");
      const fd = fs.openSync(tmp, "w");
      for(let i=0;i<expectedTotal;i++) fs.writeSync(fd, chunks.get(i)!);
      fs.closeSync(fd);
      console.log("Ready:", tmp, "→ run decoder GUI/CLI");
      process.exit(0);
    }
  }catch{}
});
