import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

const credit = { creator: 'Mayzaa' };

const sanitizeError = (error) => {
    const msg = error.message || '';
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) return 'Failed to connect to target';
    if (msg.includes(' certificate') || msg.includes('SSL')) return 'SSL error';
    return 'Internal error';
};

const isValidIP = (ip) => {
    if (!ip || typeof ip !== 'string') return false;
    const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    const v6 = /^[0-9a-fA-F:]+$/;
    return v4.test(ip) || (ip.includes(':') && v6.test(ip));
};

async function scrape(ip) {
    const url = `https://browserleaks.com/ip/${ip}`;
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
    });
    const $ = cheerio.load(data);

    const getValue = (label) => {
        const el = $(`td:contains("${label}")`).next();
        return el.text().trim() || el.find('a').text().trim() || '';
    };

    let hostname = $('td:contains("Hostname")').next().text().trim();
    if (hostname.includes('<iframe') || hostname.includes('n/a') || hostname === '') {
        hostname = null;
    }

    let asn = $('td:contains("ASN")').next().text().trim();
    if (!asn) {
        asn = $('td:contains("Network")').next().text().trim();
    }
    if (asn.includes('AS')) {
        asn = asn.match(/AS\d+/)?.[0] || asn;
    }

    const coords = $('td:contains("Coordinates")').next().text().trim();
    let latitude = null, longitude = null;
    if (coords) {
        const parts = coords.split(',').map(s => s.trim());
        if (parts.length === 2) {
            latitude = parts[0];
            longitude = parts[1];
        }
    }

    let country = getValue('Country');
    const countryCode = country.match(/\(([A-Z]{2})\)/)?.[1] || '';
    const countryName = country.replace(/\s*\([A-Z]{2}\)\s*/, '').trim();

    return {
        ip: getValue('IP') || ip,
        hostname,
        location: {
            country: countryName,
            country_code: countryCode,
            region: getValue('State/Region') || getValue('Region'),
            city: getValue('City'),
            coordinates: { latitude, longitude }
        },
        network: {
            isp: getValue('ISP'),
            asn,
            network: getValue('Network'),
            usage_type: getValue('Usage Type')
        },
        time: {
            timezone: getValue('Timezone'),
            local_time: getValue('Local Time')
        }
    };
}

export async function iplocations(ip) {
    try {
        if (!isValidIP(ip)) {
            return { ...credit, status: false, message: 'Parameter ip tidak valid' };
        }
        const result = await scrape(ip);
        return { ...credit, status: true, result };
    } catch (error) {
        return { ...credit, status: false, message: sanitizeError(error) };
    }
}

// === CLI MODE ===
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
    const ip = process.argv[2];

    if (!ip) {
        console.error('Pemakaian: node iplocation.js <ip>');
        console.error('Contoh  : node iplocation.js 8.8.8.8');
        process.exit(1);
    }

    iplocations(ip)
        .then((res) => {
            console.log(JSON.stringify(res, null, 2));
        })
        .catch((err) => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}