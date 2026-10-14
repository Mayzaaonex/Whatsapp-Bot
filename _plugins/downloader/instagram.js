import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { io } from 'socket.io-client'
import { fileURLToPath } from 'node:url'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const IQSAVED_BASE = 'https://iqsaved.com'
const CDN_VIDEO = 'https://cdn.iqsaved.com/img.php'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'

let cookieJar = {}

function parseCookies(res) {
  const raw = res.headers.get('set-cookie')
  if (!raw) return
  const parts = raw.split(/,(?=[^;]+=)/)
  for (const part of parts) {
    const [pair] = part.split(';')
    const idx = pair.indexOf('=')
    if (idx > 0) {
      const name = pair.slice(0, idx).trim()
      const value = pair.slice(idx + 1).trim()
      if (name && value) cookieJar[name] = value
    }
  }
}

function cookieHeader() {
  return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function getSession() {
  const res = await fetch(`${IQSAVED_BASE}/en1/`, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': UA
    }
  })
  parseCookies(res)
  return cookieHeader()
}

function extractShortcode(url) {
  const m = url.match(/\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

async function getToken(igUrl) {
  const shortcode = extractShortcode(igUrl)
  const res = await fetch(`${IQSAVED_BASE}/connect/`, {
    headers: {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      referer: `${IQSAVED_BASE}/download-reels/${shortcode}/`,
      'user-agent': UA,
      cookie: cookieHeader()
    }
  })

  if (!res.ok) throw new Error(`Connect gagal: HTTP ${res.status}`)
  const data = await res.json()
  if (!data?.token) throw new Error('Token tidak ditemukan')
  return data.token
}

async function fetchFromIqsaved(igUrl, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const shortcode = extractShortcode(igUrl)
    if (!shortcode) return reject(new Error('URL Instagram tidak valid'))

    const socket = io(IQSAVED_BASE, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      extraHeaders: {
        'user-agent': UA,
        cookie: cookieHeader(),
        origin: IQSAVED_BASE,
        referer: `${IQSAVED_BASE}/download-reels/${shortcode}/`
      },
      reconnection: false,
      timeout: 15000
    })

    let resolved = false

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        socket.close()
        reject(new Error('Timeout menunggu searchResult'))
      }
    }, timeoutMs)

    socket.on('connect', async () => {
      try {
        const token = await getToken(igUrl)
        socket.emit('search', {
          date: Date.now(),
          token,
          requestType: '2',
          serverType: 'link',
          linkValue: igUrl
        })
      } catch (err) {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          socket.close()
          reject(err)
        }
      }
    })

    socket.on('searchResult', (payload) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      socket.close()
      resolve(payload)
    })

    socket.on('connect_error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        socket.close()
        reject(new Error(`Socket error: ${err.message}`))
      }
    })
  })
}

function buildCdnUrl(cdnBase, value) {
  if (!value || typeof value !== 'string') return null
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('img.php?') || value.startsWith('img2.php?')) {
    return `https://cdn.iqsaved.com/${value}`
  }
  const looksAlreadyEncoded = /%[0-9A-Fa-f]{2}/.test(value)
  if (looksAlreadyEncoded) return `${cdnBase}?url=${value}`
  return `${cdnBase}?url=${encodeURIComponent(value)}`
}

function parseSearchResult(payload) {
  const data = payload?.data
  if (!data || data.status !== 'success') {
    throw new Error(data?.message || 'Response tidak success')
  }

  const inner = data.data
  const items = inner?.items || []

  const result = {
    author: {
      username: inner?.username || null,
      avatar: inner?.avatarSrc || null
    },
    caption: inner?.text || null,
    stats: {
      likes: inner?.countLikes || 0,
      comments: inner?.countComments || 0,
      views: inner?.countViews || null
    },
    media: []
  }

  for (const item of items) {
    const dl = item?.downloadLink?.[0]
    if (!dl?.value || !dl?.filename) continue

    const videoUrl = buildCdnUrl(CDN_VIDEO, dl.value)
    const thumbnailUrl = buildCdnUrl(CDN_VIDEO, item.imageSrc)

    result.media.push({
      type: item.type || 'video',
      thumbnail: thumbnailUrl,
      url: videoUrl,
      filename: dl.filename
    })
  }

  if (result.media.length === 0) throw new Error('Tidak ada media yang bisa di-download')

  return result
}

async function fetchInstagram(igUrl) {
  await getSession()
  const payload = await fetchFromIqsaved(igUrl)
  const parsed = parseSearchResult(payload)

  const type = igUrl.includes('/reel/') ? 'reel' : igUrl.includes('/tv/') ? 'igtv' : 'post'
  const firstMedia = parsed.media[0]

  return {
    url: igUrl,
    platform: 'instagram',
    type,
    author: parsed.author,
    caption: parsed.caption,
    stats: parsed.stats,
    media: parsed.media,
    video: firstMedia?.type === 'video' ? firstMedia.url : null,
    image: firstMedia?.type !== 'video' ? firstMedia.url : null,
    thumbnail: firstMedia?.thumbnail || null,
    download_url: firstMedia?.url || null
  }
}

async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: { 'User-Agent': UA },
    maxContentLength: 100 * 1024 * 1024
  })
  return Buffer.from(res.data)
}

// ====== PLUGIN ======
export const meta = {
  name: 'instagram',
  alias: ['ig', 'igdl'],
  category: 'downloader'
}

export async function handler(client, { to, args }) {
  const url = args[0]

  if (!url) {
    await client.message.send(to, 'Kasih URL Instagram: *.instagram <url>*')
    return { ok: false }
  }

  const igRegex = /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\//i
  if (!igRegex.test(url)) {
    await client.message.send(to, '❌ URL Instagram tidak valid.')
    return { ok: false }
  }

  ensureTempDir()

  let result
  try {
    result = await fetchInstagram(url)
  } catch (err) {
    console.error('[instagram] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }

  // Caption
  const author = result.author?.username || 'unknown'
  const caption = (result.caption || '').slice(0, 500)
  const stats = result.stats || {}
  const statsLine = [
    stats.likes ? `❤️ ${stats.likes}` : null,
    stats.comments ? `💬 ${stats.comments}` : null,
    stats.views ? `▶️ ${stats.views}` : null
  ].filter(Boolean).join(' | ')

  const captionText =
    `📷 *@${author}*\n` +
    (statsLine ? `${statsLine}\n` : '') +
    (caption ? `\n${caption}` : '')

  // Kirim semua media
  let sent = 0
  for (const item of result.media) {
    let buf
    try {
      buf = await downloadBuffer(item.url)
    } catch (err) {
      console.error('[instagram] download item gagal:', err.message)
      continue
    }

    const ext = item.type === 'video' ? '.mp4' : '.jpg'
    const tempPath = path.join(TEMP_DIR, `ig-${Date.now()}-${sent}${ext}`)
    fs.writeFileSync(tempPath, buf)

    try {
      if (item.type === 'video') {
        await client.message.send(to, {
          type: 'video',
          media: tempPath,
          mimetype: 'video/mp4',
          caption: sent === 0 ? captionText : null
        })
      } else {
        await client.message.send(to, {
          type: 'image',
          media: tempPath,
          mimetype: 'image/jpeg',
          caption: sent === 0 ? captionText : null
        })
      }
      sent++
    } catch (err) {
      console.error('[instagram] kirim item gagal:', err.message)
    } finally {
      try { fs.unlinkSync(tempPath) } catch {}
    }
  }

  if (sent === 0) {
    await client.message.send(to, '❌ Gak ada media yang berhasil dikirim.')
    return { ok: false }
  }

  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const url = process.argv[2]
  if (!url) {
    console.error('Pemakaian: node instagram.js <url>')
    process.exit(1)
  }

  try {
    const result = await fetchInstagram(url)
    console.log(JSON.stringify({ status: true, result }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, message: err.message }, null, 2))
    process.exit(1)
  }
}