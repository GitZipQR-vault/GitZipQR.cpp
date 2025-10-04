const fs = require('fs');
const path = require('path');
const os = require('os');

const workDir = process.env.WORK_DIR || '.gzqr_tmp';
const creditsFile = path.join(workDir, 'credits.json');

function initCredits() {
  const firstLaunch = !fs.existsSync(creditsFile);

  if (firstLaunch) {
    // Создаем новый файл с данными
    const bonusExpire = Date.now() + 24 * 3600 * 1000; // через сутки бонус закончится

    const data = {
      credits: 0,
      bonusLeft: 2,  // Начальный бонус 2
      bonusExpireAt: bonusExpire,
      firstLaunch: true
    };

    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(creditsFile, JSON.stringify(data, null, 2));

    console.log("First launch - initialized credits file");
  } else {
    const data = JSON.parse(fs.readFileSync(creditsFile, 'utf-8'));
    console.log("Credits file already exists, loading data:", data);
  }
}

initCredits();
