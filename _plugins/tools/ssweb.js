import axios from 'axios';
import { fileURLToPath } from 'url';

const credit = { creator: 'Mayzaa' };

const PROXY_API = 'https://api.ikyyxd.my.id/v2l/proxy-free/ikyy-xsample';

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

// === Proxy helpers ===
let proxies = [];

async function fetchProxies() {
    const res = await axios.get(PROXY_API, { timeout: 10000 });
    if (!Array.isArray(res.data)) throw new Error('Invalid proxy format');
    proxies = res.data.filter(p => typeof p === 'string' && p.trim().split(':').length === 4);
    if (proxies.length === 0) throw new Error('No valid proxies found');
}

function getRandomProxyConfig() {
    const p = proxies[Math.floor(Math.random() * proxies.length)];
    const [host, port, user, pass] = p.trim().split(':');
    return {
        ip: host,
        config: {
            host,
            port: parseInt(port),
            auth: { username: user, password: pass },
            protocol: 'http'
        }
    };
}

async function doScreenshot(targetUrl, device, proxyConfig) {
    const deviceConfig = {
        desktop: { width: 1920, height: 1080 },
        tablet: { width: 768, height: 1024 },
        mobile: { width: 393, height: 852 }
    };

    const { width, height } = deviceConfig[device];
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&meta=false&screenshot.type=png&screenshot.fullPage=false&viewport.width=${width}&viewport.height=${height}&adblock=true&force=false`;

    const response = await axios.get(apiUrl, {
        proxy: proxyConfig || false,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        },
        timeout: 30000
    });

    if (response.data?.status === 'success' && response.data?.data?.screenshot) {
        return {
            target_url: targetUrl,
            screenshot_url: response.data.data.screenshot.url || '',
            format: response.data.data.screenshot.type || 'png',
            size: response.data.data.screenshot.size_pretty || '',
            dimensions: {
                width: response.data.data.screenshot.width || width,
                height: response.data.data.screenshot.height || height
            },
            device
        };
    }

    throw new Error('Gagal mengambil screenshot');
}

// useProxy: false = langsung tanpa proxy (default). true = retry lewat proxy gratis dari PROXY_API.
export async function ssweb(targetUrl, device = 'desktop', useProxy = false, maxRetries = 5) {
    try {
        if (!targetUrl) {
            return { ...credit, status: false, message: 'Parameter url wajib diisi' };
        }

        if (!isValidUrl(targetUrl)) {
            return { ...credit, status: false, message: 'URL tidak valid atau tidak diizinkan' };
        }

        const allowedDevices = ['desktop', 'tablet', 'mobile'];
        if (!allowedDevices.includes(device)) {
            return { ...credit, status: false, message: 'Device tidak valid. Pilih: ' + allowedDevices.join(', ') };
        }

        if (!useProxy) {
            const result = await doScreenshot(targetUrl, device, null);
            return { ...credit, status: true, result };
        }

        // Mode proxy: coba beberapa proxy gratis sampai berhasil
        await fetchProxies();

        let lastError = '';
        for (let i = 0; i < maxRetries; i++) {
            const proxyData = getRandomProxyConfig();
            try {
                const result = await doScreenshot(targetUrl, device, proxyData.config);
                return { ...credit, status: true, result: { ...result, proxy_ip: proxyData.ip } };
            } catch (err) {
                lastError = err.message;
            }
        }

        throw new Error(`Semua percobaan proxy gagal: ${lastError}`);

    } catch (error) {
        return { ...credit, status: false, message: sanitizeError(error) };
    }
}

// === CLI MODE ===
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

const DEVICE_ALIAS = {
    pc: 'desktop',
    tablet: 'tablet',
    hp: 'mobile'
};

if (isMain) {
    const args = process.argv.slice(2);
    const targetUrl = args[0];
    const rawDevice = args[1] || 'pc';
    const device = DEVICE_ALIAS[rawDevice];
    const useProxy = args.includes('--proxy');

    if (!targetUrl) {
        console.error('Pemakaian: node ssweb.js <url> [pc|tablet|hp] [--proxy]');
        console.error('Contoh  : node ssweb.js https://github.com pc');
        console.error('Contoh  : node ssweb.js https://github.com hp --proxy');
        process.exit(1);
    }

    if (!device) {
        console.error('Device tidak valid. Pilih: pc, tablet, hp');
        process.exit(1);
    }

    ssweb(targetUrl, device, useProxy)
        .then((res) => {
            console.log(JSON.stringify(res, null, 2));
            if (!res.status) process.exit(1);
        })
        .catch((err) => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}