import axios from 'axios';
import { fileURLToPath } from 'url';

const credit = { creator: 'Mayzaa' };

const sanitizeError = (error) => {
    const msg = error.message || '';
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) return 'Failed to connect to target';
    if (msg.includes(' certificate') || msg.includes('SSL')) return 'SSL error';
    return 'Internal error';
};

const isValidDomain = (domain) => {
    if (!domain || typeof domain !== 'string') return false;
    const cleaned = domain.replace(/https?:\/\//, '').replace(/\/$/, '');
    return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleaned);
};

async function scrape(domain) {
    domain = domain.replace(/https?:\/\//, '').replace(/\/$/, '');

    const dnsRes = await axios.get(`https://dns.google/resolve?name=${domain}&type=ANY`, { timeout: 10000 });
    const typeMap = { 1: 'A', 28: 'AAAA', 15: 'MX', 2: 'NS', 16: 'TXT', 5: 'CNAME', 13: 'HINFO' };
    const dnsRecords = (dnsRes.data.Answer || []).map(r => ({
        type: typeMap[r.type] || `TYPE${r.type}`,
        value: r.data,
        ttl: r.TTL
    }));

    const ipRes = await axios.get(`https://dns.google/resolve?name=${domain}&type=A`, { timeout: 10000 });
    const ipv6Res = await axios.get(`https://dns.google/resolve?name=${domain}&type=AAAA`, { timeout: 10000 });
    const ipAddresses = [
        ...(ipRes.data.Answer || []).filter(r => r.type === 1).map(r => ({ ip: r.data, type: 'IPv4' })),
        ...(ipv6Res.data.Answer || []).filter(r => r.type === 28).map(r => ({ ip: r.data, type: 'IPv6' }))
    ];

    let mxRecords = [];
    try {
        const mxRes = await axios.get(`https://dns.google/resolve?name=${domain}&type=MX`, { timeout: 10000 });
        mxRecords = (mxRes.data.Answer || []).map(r => {
            const parts = r.data.split(' ');
            return { priority: parseInt(parts[0]), server: parts[1]?.replace(/\.$/, '') };
        });
    } catch {}

    let nsRecords = [];
    try {
        const nsRes = await axios.get(`https://dns.google/resolve?name=${domain}&type=NS`, { timeout: 10000 });
        nsRecords = (nsRes.data.Answer || []).map(r => r.data.replace(/\.$/, ''));
    } catch {}

    let sslInfo = null;
    try {
        const sslRes = await axios.get(
            `https://api.certspotter.com/v1/issuances?domain=${domain}&expand=dns_names&expand=issuer`,
            { timeout: 10000 }
        );
        const cert = sslRes.data?.[0];
        if (cert) {
            sslInfo = {
                issuer: cert.issuer?.name || null,
                valid_from: cert.not_before || null,
                valid_to: cert.not_after || null,
                serial_number: cert.serial_number || null,
                fingerprint_sha256: cert.sha256 || null,
                alternative_names: cert.dns_names || []
            };
        }
    } catch {}

    let geoInfo = null;
    const firstIPv4 = ipAddresses.find(ip => ip.type === 'IPv4');
    if (firstIPv4) {
        try {
            const geoRes = await axios.get(`http://ip-api.com/json/${firstIPv4.ip}`, { timeout: 10000 });
            if (geoRes.data.status === 'success') {
                geoInfo = {
                    ip: geoRes.data.query,
                    country: geoRes.data.country,
                    countryCode: geoRes.data.countryCode,
                    region: geoRes.data.regionName,
                    city: geoRes.data.city,
                    zip: geoRes.data.zip,
                    isp: geoRes.data.isp,
                    org: geoRes.data.org,
                    timezone: geoRes.data.timezone,
                    coordinates: {
                        lat: geoRes.data.lat,
                        lon: geoRes.data.lon
                    }
                };
            }
        } catch {}
    }

    return {
        domain,
        dns: dnsRecords,
        ip: ipAddresses,
        mx: mxRecords,
        ns: nsRecords,
        ssl: sslInfo,
        geo: geoInfo
    };
}

export async function domaininfo(domain) {
    try {
        if (!isValidDomain(domain)) {
            return { ...credit, status: false, message: 'Parameter domain tidak valid' };
        }
        const result = await scrape(domain);
        return { ...credit, status: true, result };
    } catch (error) {
        return { ...credit, status: false, message: sanitizeError(error) };
    }
}

// === CLI MODE ===
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
    const domain = process.argv[2];

    if (!domain) {
        console.error('Pemakaian: node domaininfo.js <domain>');
        console.error('Contoh  : node domaininfo.js google.com');
        process.exit(1);
    }

    domaininfo(domain)
        .then((res) => {
            console.log(JSON.stringify(res, null, 2));
        })
        .catch((err) => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}