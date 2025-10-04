// Usage:
//   bun packages/app/scripts/decrypt_jsonl.ts <jsonl.txt> [outDir]
//   GZQR_PASS="your-pass" bun packages/app/scripts/decrypt_jsonl.ts scans.jsonl out
//
// Файл jsonl.txt — построчно JSON, который возвращают наши QR-коды при скане.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

type Meta = {
  type:string;version:string;chunk:number;total:number;hash:string;cipherHash:string;
  saltB64:string;nonceB64:string;name:string;ext:string;chunkSize:number;dataB64:string;
};

const file = process.argv[2];
if(!file){ console.error("Usage: bun decrypt_jsonl.ts <jsonl.txt> [outDir]"); process.exit(2); }
const outDir = process.argv[3] || path.join(process.cwd(), ".gzqr_tmp", "out");
const pass = process.env.GZQR_PASS || "";
if(!pass || pass.length<8){ console.error("Error: set GZQR_PASS (>=8 chars)"); process.exit(2); }

function b64(s:string){ return Buffer.from(s,"base64"); }
function sha256hex(b:Buffer){ return crypto.createHash("sha256").update(b).digest("hex"); }

const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
const chunks = new Map<number, Buffer>();
let expectedTotal=-1, name="restored", ext="", cipherHash="", salt=Buffer.alloc(0), nonce=Buffer.alloc(0);

for(const line of lines){
  try{
    const j = JSON.parse(line) as Meta;
    if(!j?.type?.endsWith("-CHUNK-ENC")) continue;
    if(expectedTotal<0) expectedTotal=j.total;
    cipherHash = cipherHash || j.cipherHash;
    name = name==="restored" ? j.name : name;
    ext = ext || j.ext;
    if(salt.length===0)  salt  = b64(j.saltB64);
    if(nonce.length===0) nonce = b64(j.nonceB64);
    const buf = Buffer.from(j.dataB64, "base64");
    if(sha256hex(buf)!==j.hash) throw new Error("per-chunk sha256 mismatch");
    chunks.set(j.chunk, buf);
    const p = Math.floor((chunks.size*100)/expectedTotal);
    process.stdout.write(`progress ${p}%  | chunk ${j.chunk+1}/${j.total}\n`);
  }catch(e:any){
    process.stdout.write(`skip line (${e?.message||e})\n`);
  }
}

if(chunks.size!==expectedTotal){ console.error(`Error: missing chunks ${chunks.size}/${expectedTotal}`); process.exit(1); }

const cipher = Buffer.concat([...Array(expectedTotal).keys()].map(i=>chunks.get(i)!));
if(sha256hex(cipher)!==cipherHash){ console.error("Error: global sha256 mismatch"); process.exit(1); }

const tag = cipher.subarray(cipher.length-16);
const body = cipher.subarray(0, cipher.length-16);
const key = crypto.scryptSync(pass, salt, 32, { N: 1<<15, r: 8, p: 8, maxmem: 512*1024*1024 });

const dec = crypto.createDecipheriv("aes-256-gcm", key, nonce);
dec.setAuthTag(tag);
const plain = Buffer.concat([dec.update(body), dec.final()]);

fs.mkdirSync(outDir, {recursive:true});
const outPath = path.join(outDir, (name||"restored")+(ext||""));

fs.writeFileSync(outPath, plain);
console.log(`\n✅ Restored file → ${outPath}`);
