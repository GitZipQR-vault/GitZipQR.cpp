#!/usr/bin/env bun
// English-only comments.
import fs from "node:fs";
import path from "node:path";
const dir = process.argv[2] || "qrcodes";
const out = process.argv[3] || "QR_A4.pdf";
const PDFDocument = (await import("pdfkit")).default;
const sharp = (await import("sharp")).default;
if (!fs.existsSync(dir)) throw new Error("No PNG directory");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort();
if (files.length === 0) throw new Error("No PNG files");
const doc = new PDFDocument({ size: "A4", margin: 18 });
const ws = fs.createWriteStream(out);
doc.pipe(ws);
const cols = 3, rows = 3;
const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
const pageH = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
const cellW = Math.floor(pageW / cols), cellH = Math.floor(pageH / rows);
let i = 0;
for (const f of files) {
  if (i > 0 && i % (cols * rows) === 0) doc.addPage();
  const x = (i % cols) * cellW + doc.page.margins.left;
  const y = Math.floor(i / cols) % rows * cellH + doc.page.margins.top;
  const p = path.join(dir, f);
  const img = await sharp(p).resize(cellW - 8, cellH - 28, { fit: "contain" }).png().toBuffer();
  doc.image(img, x + 4, y + 12);
  doc.fontSize(8).fillColor("#333").text(f, x + 4, y + 2, { width: cellW - 8, align: "center" });
  i++;
}
doc.end();
await new Promise(res => ws.on("close", res));
console.log("PDF ready:", out);
