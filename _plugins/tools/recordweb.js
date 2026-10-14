import axios from 'axios'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'
import { runCli } from '../../system/plugin-loader.js'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const credit = { creator: 'Mayzaa' }

const VALID_DEVICES = [
  'desktop_hd', 'desktop_fhd', 'desktop_4k', 'desktop_wide',
  'laptop_13', 'laptop_15', 'macbook_air', 'macbook_pro',
  'ipad', 'ipad_pro', 'ipad_mini', 'samsung_tab',
  'iphone_se', 'iphone_14', 'iphone_14_pro', 'iphone_15_pro',
  'samsung_s24', 'pixel_8', 'xiaomi_14'
]

const DEVICE_SHORTCUTS = {
  hp: 'iphone_15_pro',
  desktop: 'desktop_fhd',
  tablet: 'ipad_pro',
  laptop: 'macbook_pro'
}

const isValidUrl = (url) => {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
    if (ipPattern.test(hostname)) {
      const octets = hostname.split('.').map(Number)
      if (octets[0] === 169 && octets[1] === 254) return false
      if (octets[0] === 10 || octets[0] === 127 || octets[0] === 0) return false
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false
      if (octets[0] === 192 && octets[1] === 168) return false
    }
    if (hostname.includes('localhost') || hostname.includes('metadata.google.internal') || hostname.includes('169.254.169.254')) return false
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch { return false }
}

const sanitizeError = (error) => {
  const msg = error.message || ''
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) return 'Failed to connect to target'
  if (msg.includes(' certificate') || msg.includes('SSL')) return 'SSL error'
  return 'Internal error'
}

export async function recordWeb(url, device = 'desktop_fhd', scroll = true, darkMode = true) {
  try {
    if (!url) return { ...credit, status: false, message: 'Parameter url wajib diisi' }
    if (!isValidUrl(url)) return { ...credit, status: false, message: 'URL tidak valid atau tidak diizinkan' }
    if (!VALID_DEVICES.includes(device)) return { ...credit, status: false, message: 'Device tidak valid' }

    const response = await axios.post('https://shinana-bentosnap.hf.space/api/record', {
      url, device, duration_ms: 8000, scroll, dark_mode: darkMode, wait_ms: 1000
    }, {
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 120000
    })

    return { ...credit, status: true, result: response.data }
  } catch (error) {
    return { ...credit, status: false, message: sanitizeError(error) }
  }
}

// ============================================================
// === PLUGIN HANDLER ===
// ============================================================

export const meta = {
  name: 'recordweb',
  category: 'tools'
}

export async function handler(client, { to, args }) {
  const url = args[0]
  if (!url) {
    await client.message.send(to, 'Kasih URL: *.recordweb <url> [hp|desktop|tablet|laptop]*')
    return { ok: false }
  }

  const rawDevice = args[1]
  const device = rawDevice ? (DEVICE_SHORTCUTS[rawDevice] || rawDevice) : 'desktop_fhd'

  // === 1. Panggil recordWeb ===
  const res = await recordWeb(url, device, true, true)

  if (!res?.status) {
    await client.message.send(to, `❌ ${res?.message ?? 'Error'}`)
    return { ok: false }
  }

  const r = res.result
  const videoUrl = r.url
  const expiresIn = r.expires_in_seconds ?? 300

  // === 2. Download video + shortlink PARALEL ===
  ensureTempDir()

  let videoBuffer
  let shortUrl = null

  try {
    const [videoResp, short] = await Promise.all([
      fetch(videoUrl),
      runCli('./_plugins/tools/shortlink.js', [videoUrl]).catch((err) => {
        console.error('[recordweb] shortlink gagal:', err.message)
        return null
      })
    ])

    if (!videoResp.ok) throw new Error(`HTTP ${videoResp.status}`)
    videoBuffer = Buffer.from(await videoResp.arrayBuffer())
    shortUrl = short?.result_url ?? null
  } catch (err) {
    await client.message.send(to, `❌ Gagal download video: ${err.message}`)
    return { ok: false }
  }

  // === 3. Simpen video sementara ke tmp ===
  const videoPath = path.join(TEMP_DIR, `recordweb-video-${Date.now()}.mp4`)
  fs.writeFileSync(videoPath, videoBuffer)

  // === 4. Bikin caption ===
  const linkText = shortUrl
    ? `\n🔗 ${shortUrl}`
    : '\n⚠️ Shortlink gagal, link gak tersedia'

  const caption =
    `📹 *${r.device_label}*\n` +
    `📐 ${r.width}×${r.height}\n` +
    `⏱️ Expire: ${Math.round(expiresIn / 60)} menit\n` +
    `📁 ${r.filename}` +
    linkText

  // === 5. Kirim video ===
  try {
    await client.message.send(to, {
      type: 'video',
      media: videoPath,
      mimetype: 'video/mp4',
      caption
    })
  } catch (err) {
    console.error('[recordweb] gagal kirim video:', err.message)
    await client.message.send(to, `❌ Gagal kirim video: ${err.message}`)
    return { ok: false }
  } finally {
    try { fs.unlinkSync(videoPath) } catch {}
  }

  return { ok: true }
}

// ============================================================
// === CLI MODE ===
// ============================================================

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const args = process.argv.slice(2)

  if (args.includes('--list') || args.includes('-l')) {
    console.log('Shortcut jenis:')
    Object.entries(DEVICE_SHORTCUTS).forEach(([k, v]) => console.log(`  - ${k.padEnd(8)} -> ${v}`))
    console.log('\nAtau device spesifik:')
    VALID_DEVICES.forEach((d) => console.log('  - ' + d))
    process.exit(0)
  }

  const url = args[0]
  const rawDevice = args[1]
  const device = rawDevice ? (DEVICE_SHORTCUTS[rawDevice] || rawDevice) : 'desktop_fhd'

  if (!url) {
    console.error('Pemakaian: node recordweb.js <url> [hp|desktop|tablet|laptop]')
    console.error('Contoh  : node recordweb.js https://github.com/mayzaaonex hp')
    console.error('Default : desktop_fhd, scroll aktif, dark mode aktif')
    console.error('Lihat semua jenis: node recordweb.js --list')
    process.exit(1)
  }

  recordWeb(url, device, true, true)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2))
      if (!res.status) process.exit(1)
    })
    .catch((err) => {
      console.error('Error:', err.message)
      process.exit(1)
    })
}