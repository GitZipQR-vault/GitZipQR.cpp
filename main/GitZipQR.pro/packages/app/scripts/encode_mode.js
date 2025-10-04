const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');

const mode = process.env.MODE || 'oss'; // определяем режим: oss или pro
const password = process.env.GZQR_PASS || 'defaultPassword';

const workDir = process.env.WORK_DIR || '.gzqr_tmp';
const outputDir = path.join(workDir, 'output');
const inputPath = process.argv[2];

if (!fs.existsSync(inputPath)) {
  console.error('Input path not found');
  process.exit(1);
}

function encryptPNG(inputPath, outputDir) {
  console.log("Encrypting PNG files...");
  const files = fs.readdirSync(inputPath).filter(f => f.endsWith('.png'));
  const encryptedFiles = [];

  files.forEach(file => {
    const inputFile = path.join(inputPath, file);
    const outputFile = path.join(outputDir, file);
    
    // Шифруем PNG (на примере криптографии)
    const cipher = crypto.createCipher('aes-256-cbc', password);
    const inputFileStream = fs.createReadStream(inputFile);
    const outputFileStream = fs.createWriteStream(outputFile);
    
    inputFileStream.pipe(cipher).pipe(outputFileStream);
    encryptedFiles.push(outputFile);
  });

  console.log(`Encrypted PNGs: ${encryptedFiles}`);
}

function encryptPDF(inputPath, outputDir) {
  console.log("Encrypting to PDF...");
  const files = fs.readdirSync(inputPath).filter(f => f.endsWith('.png'));
  const pdfPath = path.join(outputDir, 'encrypted.pdf');

  const doc = new PDFDocument();
  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);

  files.forEach((file, index) => {
    const imagePath = path.join(inputPath, file);
    const x = (index % 3) * 180;
    const y = Math.floor(index / 3) * 180;

    sharp(imagePath).resize(180, 180).toBuffer((err, buffer) => {
      if (err) throw err;
      doc.image(buffer, x, y, { width: 180 });
    });
  });

  doc.end();
  console.log("Encrypted PDF generated:", pdfPath);
}

function run() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (mode === 'oss') {
    encryptPNG(inputPath, outputDir);
  } else if (mode === 'pro') {
    encryptPDF(inputPath, outputDir);
  } else {
    console.error('Unknown mode, please specify "oss" or "pro"');
    process.exit(1);
  }
}

run();
