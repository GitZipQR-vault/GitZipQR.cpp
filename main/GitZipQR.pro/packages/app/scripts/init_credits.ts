import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STATE_PATH = path.join(process.cwd(), '.gzqr_tmp', 'state.json');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-secret-key';

function encrypt(data: string): string {
    const cipher = crypto.createCipher('aes-256-gcm', ENCRYPTION_KEY);
    return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
}

function decrypt(encrypted: string): string {
    const decipher = crypto.createDecipher('aes-256-gcm', ENCRYPTION_KEY);
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

export function initCredits() {
    const dir = path.dirname(STATE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(STATE_PATH)) {
        const initialState = {
            credits: 0,
            bonus: 2,
            firstLaunch: Date.now(),
            bonusExpires: Date.now() + 24 * 60 * 60 * 1000 // 24 часа
        };
        fs.writeFileSync(STATE_PATH, encrypt(JSON.stringify(initialState)));
    }

    return JSON.parse(decrypt(fs.readFileSync(STATE_PATH, 'utf8')));
}

export function updateCredits(updates: any) {
    const current = initCredits();
    const newState = { ...current, ...updates };
    fs.writeFileSync(STATE_PATH, encrypt(JSON.stringify(newState)));
    return newState;
}
