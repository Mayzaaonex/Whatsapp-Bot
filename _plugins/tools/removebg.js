import axios from 'axios';
import crypto from 'crypto';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { extname } from 'path';
import { fileURLToPath } from 'url';

const credit = { creator: 'Mayzaa' };

const MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
};

const isHttpUrl = (str) => {
    try {
        const parsed = new URL(str);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch { return false; }
};

const isValidUrl = (url) => {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipPattern.test(hostname)) {
            const octets = hostname.split('.').map(Number);
            if (octets[0] === 169 && octets[1] === 254) return false;
            if (octets[0] === 10 || octets[0] === 127 || octets[0] === 0) return false;
            if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
            if (octets[0] === 192 && octets[1] === 168) return false;
        }
        if (hostname.includes('localhost') || hostname.includes('metadata.google.internal') || hostname.includes('169.254.169.254')) return false;
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch { return false; }
};

const sanitizeError = (error) => {
    const msg = error.message || '';
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) return 'Failed to connect to target';
    if (msg.includes(' certificate') || msg.includes('SSL')) return 'SSL error';
    return 'Internal error';
};

// Menerima: URL (http/https) ATAU path file lokal di disk.
// File lokal otomatis diubah jadi base64 data URI sebelum dikirim ke API.
export async function removebg(imageInput) {
    try {
        if (!imageInput) {
            return { ...credit, status: false, message: 'Parameter url atau path file wajib diisi' };
        }

        let imagePayload;

        if (isHttpUrl(imageInput)) {
            if (!isValidUrl(imageInput)) {
                return { ...credit, status: false, message: 'URL tidak valid atau tidak diizinkan' };
            }
            imagePayload = imageInput;
        } else {
            // Dianggap path file lokal
            if (!existsSync(imageInput)) {
                return { ...credit, status: false, message: 'File tidak ditemukan: ' + imageInput };
            }
            const ext = extname(imageInput).toLowerCase();
            const mime = MIME_BY_EXT[ext];
            if (!mime) {
                return { ...credit, status: false, message: 'Format file tidak didukung (gunakan png/jpg/jpeg/webp/gif)' };
            }
            const fileBuffer = await readFile(imageInput);
            imagePayload = `data:${mime};base64,${fileBuffer.toString('base64')}`;
        }

        // Remove background
        const deviceId = crypto.randomBytes(8).toString('hex');
        const resultRes = await axios.post('https://www.dreamai.art/api/background-remover', {
            images: [imagePayload]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
                'Origin': 'https://www.dreamai.art',
                'Referer': 'https://www.dreamai.art/en/ai-background-remover',
                'X-Device-Id': deviceId
            },
            timeout: 30000
        });

        if (!resultRes.data?.success) throw new Error('Remove background gagal');

        const imgRes = await axios.get(resultRes.data.processedImage, {
            responseType: 'arraybuffer',
            timeout: 30000
        });

        return { ...credit, status: true, buffer: imgRes.data };

    } catch (error) {
        return { ...credit, status: false, message: sanitizeError(error) };
    }
}

// === CLI MODE ===
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
    const imageInput = process.argv[2];
    const outPath = process.argv[3] || 'removebg.png';

    if (!imageInput) {
        console.error('Pemakaian: node removebg.js <url-atau-path-foto> [output.png]');
        console.error('Contoh  : node removebg.js https://contoh.com/foto.jpg hasil.png');
        console.error('Contoh  : node removebg.js ./foto.jpg hasil.png');
        process.exit(1);
    }

    removebg(imageInput)
        .then(async (res) => {
            if (!res.status) {
                console.error('Error:', res.message);
                process.exit(1);
            }
            await writeFile(outPath, res.buffer);
            console.log(JSON.stringify({ ...credit, status: true, saved_to: outPath }, null, 2));
        })
        .catch((err) => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}