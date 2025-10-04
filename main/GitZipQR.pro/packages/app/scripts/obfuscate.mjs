// English-only comments.
// Obfuscate compiled JS in dist/*.js using javascript-obfuscator.
import fs from "node:fs";
import path from "node:path";
import obf from "javascript-obfuscator";
const dist = path.join(process.cwd(), "dist");
if(!fs.existsSync(dist)) process.exit(0);
const files = fs.readdirSync(dist).filter(f=>f.endsWith(".js"));
for(const f of files){
  const fp = path.join(dist,f);
  const src = fs.readFileSync(fp,"utf8");
  const res = obf.obfuscate(src, {
    compact: true,
    controlFlowFlattening: true,
    deadCodeInjection: true,
    debugProtection: true,
    disableConsoleOutput: true,
    identifierNamesGenerator: "hexadecimal",
    splitStrings: true,
    stringArray: true,
    stringArrayRotate: true,
    stringArrayThreshold: 1,
    target: "node"
  }).getObfuscatedCode();
  fs.writeFileSync(fp, res);
}
console.log("[obfuscate] dist/*.js hardened");
