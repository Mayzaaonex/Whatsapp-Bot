import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import axios from 'axios'
import { URL, URLSearchParams, fileURLToPath } from 'node:url'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'
import { convertToMp3, transcodeToH264 } from '../../system/ffmpeg.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE = 'https://fdown.one'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const FB_REGEX = /https?:\/\/(?:www\.|m\.|mbasic\.|web\.)?(?:facebook\.com|fb\.watch|fb\.me|fb\.com|fb\.gg|fbwat\.ch)\/[^\s]+/i

const STANDARD_QUALITIES = [
  { label: '1080p', desc: 'Full HD' },
  { label: '720p', desc: 'HD' },
  { label: '640p', desc: 'SD+' },
  { label: '540p', desc: 'SD' },
  { label: '480p', desc: 'SD' },
  { label: '360p', desc: 'Low' },
  { label: '270p', desc: 'Very Low' },
  { label: '240p', desc: 'Very Low' },
  { label: 'audio', desc: 'Audio (MP3)' }
]

// ============================================================
// === RETRY HELPER (buat ngatasin "operation was aborted" dkk) ===
// ============================================================

function isTransientSendError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    err?.code === 'ECONNRESET' ||
    err?.code === 'ETIMEDOUT' ||
    err?.name === 'AbortError'
  )
}

async function retrySend(fn, { attempts = 3, baseDelayMs = 1500 } = {}) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const transient = isTransientSendError(err)
      console.error(`[facebook] kirim gagal (percobaan ${i}/${attempts}):`, err.message)
      if (!transient || i === attempts) throw err
      const delay = baseDelayMs * i
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}

// ============================================================
// === LOGIC fbdown ===
// ============================================================

function fmtBytes(n) {
  if (!n && n !== 0) return '-'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(2) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function normalizeFbUrl(input) {
  if (!input) return null
  let u = String(input).trim()
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  try {
    const p = new URL(u)
    const h = p.hostname.toLowerCase()
    const ok = ['facebook.com','www.facebook.com','m.facebook.com','web.facebook.com','mbasic.facebook.com','fb.watch','fbwat.ch','www.fb.watch','fb.com','fb.me','fb.gg']
    if (!ok.some(x => h === x || h.endsWith('.' + x))) return null
    return p.toString()
  } catch { return null }
}

function resolveUrl(rel) {
  if (!rel) return null
  if (/^https?:\/\//i.test(rel)) return rel
  if (rel.startsWith('//')) return 'https:' + rel
  return BASE + (rel.startsWith('/') ? rel : '/' + rel)
}

function toDate(input) {
  if (input == null) return null
  if (typeof input === 'number') return new Date(input < 1e12 ? input * 1000 : input)
  const d = new Date(input)
  return isNaN(d) ? null : d
}

function formatWib(input) {
  const d = toDate(input)
  if (!d) return null
  const s = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d)
  return s.replace(/\.(\d{2})(?!\d)/, ':$1') + ' WIB'
}

function toIso(input) {
  const d = toDate(input)
  return d ? d.toISOString() : null
}

function extractFromTitle(title, fallbackDesc) {
  if (!title) return { author: null, description: fallbackDesc || null }
  const parts = title.split('|').map(s => s.trim()).filter(Boolean)
  let author = null
  let description = fallbackDesc || null

  if (parts.length >= 3) {
    author = parts[parts.length - 1]
    description = parts.slice(1, -1).join(' | ') || fallbackDesc || null
  } else if (parts.length === 2) {
    const first = parts[0], second = parts[1]
    const statsLike = /\bviews?\b|\breactions?\b|\bcomments?\b|\bshares?\b/i.test(first)
    if (statsLike) {
      if (/#\w+/.test(second) || second.length > 40) description = second
      else author = second
    } else {
      description = first
      author = second
    }
  } else {
    description = parts[0]
  }

  const clean = s => s ? s.replace(/\.{2,}\s*$/, '').replace(/\s*(See more|Lihat selengkapnya)\s*$/i, '').trim() : s
  author = clean(author)
  description = clean(description)
  if (author && author.length > 60) {
    if (!description) description = author
    author = null
  }
  return { author, description }
}

function makeClient() {
  const jar = {}
  const c = axios.create({
    baseURL: BASE,
    timeout: 60000,
    maxRedirects: 0,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8' },
    validateStatus: s => s < 600
  })
  c.interceptors.response.use(r => {
    const sc = r.headers['set-cookie']
    if (sc) for (const ck of sc) {
      const [kv] = ck.split(';')
      const i = kv.indexOf('=')
      if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim()
    }
    return r
  })
  c.interceptors.request.use(cfg => {
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ')
    if (ck) cfg.headers['Cookie'] = ck
    return cfg
  })
  return { client: c, jar }
}

async function getCsrf(client) {
  const home = await client.get('/')
  const m = String(home.data).match(/name="csrf_token"\s+value="([a-f0-9]{32,})"/)
  return m ? m[1] : null
}

async function callApi(client, fbUrl, csrf) {
  const body = new URLSearchParams({ url: fbUrl, csrf_token: csrf })
  const res = await client.post('/api/facebook.php', body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': csrf,
      'Origin': BASE,
      'Referer': BASE + '/download'
    }
  })
  return res.data
}

function toOutput(apiRes, inputUrl) {
  if (!apiRes || !apiRes.success) {
    return { success: false, creator: null, url: inputUrl, error: apiRes?.message || 'API failed' }
  }
  const d = apiRes.data || {}
  const v = d.video || {}

  let qualities = Array.isArray(d.qualities) ? d.qualities.slice() : []
  let audio = Array.isArray(d.audio) ? d.audio.slice() : []
  if (!qualities.length && Array.isArray(d.media_items)) {
    for (const it of d.media_items) {
      if (Array.isArray(it.qualities)) qualities.push(...it.qualities)
      if (Array.isArray(it.audio)) audio.push(...it.audio)
    }
  }

  const seenQ = new Set(), seenA = new Set()
  qualities = qualities.filter(q => { const k=q.id||q.url; if(!k||seenQ.has(k))return false; seenQ.add(k); return true })
  audio = audio.filter(a => { const k=a.id||a.url; if(!k||seenA.has(k))return false; seenA.add(k); return true })

  const parseRes = q => {
    const lbl = String(q.quality_label || q.quality || '')
    const m = lbl.match(/(\d{3,4})p/i)
    if (m) return parseInt(m[1], 10)
    if (q.height) return Number(q.height)
    return 0
  }
  const score = q => [parseRes(q), Number(q.bandwidth) || 0, Number(q.file_size_bytes) || 0]
  qualities.sort((a, b) => {
    const A = score(a), B = score(b)
    for (let i = 0; i < A.length; i++) if (B[i] !== A[i]) return B[i] - A[i]
    return 0
  })

  const extracted = extractFromTitle(v.title, v.description)

  const authorCandidates = [
    v.author_name, v.author_username,
    v.owner_name, v.owner_username, v.username,
    extracted.author
  ].filter(Boolean).map(s => String(s).trim())

  let creator = authorCandidates.sort((a, b) => b.length - a.length)[0] || null
  if (!creator && v.owner_id) creator = `User ${v.owner_id}`

  const description = v.description || extracted.description || null

  const mkVariant = q => ({
    quality: q.quality_label || q.quality || 'unknown',
    class: q.quality_class || null,
    mime: q.mime_type || null,
    size: q.file_size_text || null,
    bytes: q.file_size_bytes || null,
    width: q.width || null,
    height: q.height || null,
    url: resolveUrl(q.url)
  })

  const rawTime = v.publish_time ?? v.publish_text ?? null

  return {
    creator,
    title: v.title || null,
    description,
    duration: v.duration_text || (v.duration_seconds ? `${v.duration_seconds}s` : null),
    waktu_upload: rawTime ? formatWib(rawTime) : (v.publish_text || null),
    waktu_iso: rawTime ? toIso(rawTime) : null,
    permalink: v.permalink_url || null,
    thumbnail: v.thumbnail || null,
    url: inputUrl,
    success: true,
    result: {
      video: qualities.map(mkVariant),
      audio: audio.map(mkVariant)
    }
  }
}

// ============================================================
// === DOWNLOAD ===
// ============================================================

async function pipeTo(res, outPath) {
  const total = parseInt(res.headers['content-length'] || '0', 10)

  await pipeline(res.data, fs.createWriteStream(outPath))

  if (total > 0) {
    const maxWait = 15000
    const start = Date.now()
    while (Date.now() - start < maxWait) {
      const size = fs.statSync(outPath).size
      if (size >= total) break
      await new Promise(r => setTimeout(r, 200))
    }
  }

  const fileSize = fs.statSync(outPath).size
  if (total > 0 && fileSize < total) {
    try { fs.unlinkSync(outPath) } catch {}
    throw new Error(`File gak komplit: ${fileSize}/${total} bytes`)
  }
  if (fileSize < 1000) {
    try { fs.unlinkSync(outPath) } catch {}
    throw new Error(`File terlalu kecil: ${fileSize} bytes`)
  }

  return outPath
}

async function download(client, url, outPath) {
  const res = await client.get(url, { responseType: 'stream' })

  if (res.status >= 300 && res.status < 400 && res.headers.location) {
    const loc = res.headers.location.startsWith('http') ? res.headers.location : BASE + res.headers.location
    const r2 = await axios.get(loc, {
      responseType: 'stream',
      maxRedirects: 5,
      headers: { 'User-Agent': UA, 'Accept': '*/*' }
    })
    return pipeTo(r2, outPath)
  }

  const ct = String(res.headers['content-type'] || '').toLowerCase()
  if (ct.includes('text/html')) {
    let b = ''
    res.data.on('data', c => b += c.toString())
    await new Promise(ok => res.data.on('end', ok))
    throw new Error(b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'invalid')
  }

  return pipeTo(res, outPath)
}

function pickByLabel(out, label) {
  if (label === 'audio') {
    const a = out.result.audio[0]
    return a ? { kind: 'audio', target: a } : null
  }
  const wanted = String(label).toLowerCase().replace(/\s+/g, '')
  const v = out.result.video.find(x =>
    String(x.quality).toLowerCase().replace(/\s+/g, '') === wanted
  )
  return v ? { kind: 'video', target: v } : null
}

async function fetchInfo(fbUrl) {
  const { client } = makeClient()
  const csrf = await getCsrf(client)
  if (!csrf) throw new Error('Gagal ambil csrf_token')
  const apiRes = await callApi(client, fbUrl, csrf)
  const out = toOutput(apiRes, fbUrl)
  if (!out.success) throw new Error(out.error || 'API failed')
  return { out, client }
}

async function downloadToTmp(fbUrl, label) {
  const { out, client } = await fetchInfo(fbUrl)

  const choice = pickByLabel(out, label)
  if (!choice) {
    const avail = out.result.video.map(v => v.quality).concat(out.result.audio.length ? ['audio'] : []).join(', ')
    throw new Error(`"${label}" gak ada. Tersedia: ${avail}`)
  }

  const { kind, target } = choice
  const ext = kind === 'audio' ? '.m4a' : (target.mime?.includes('image') ? '.jpg' : '.mp4')

  ensureTempDir()
  const outPath = path.join(TEMP_DIR, `fb-${Date.now()}${ext}`)

  await download(client, target.url, outPath)

  let finalPath = outPath

  // AUDIO: convert M4A → MP3
  if (kind === 'audio') {
    try {
      const mp3Path = await convertToMp3(outPath)
      try { fs.unlinkSync(outPath) } catch {}
      finalPath = mp3Path
    } catch (err) {
      console.error('[facebook] convert MP3 gagal:', err.message)
    }
  }

  // VIDEO: transcode ke H.264
  if (kind === 'video') {
    try {
      const h264Path = await transcodeToH264(outPath)
      if (h264Path !== outPath) {
        try { fs.unlinkSync(outPath) } catch {}
      }
      finalPath = h264Path
    } catch (err) {
      console.error('[facebook] transcode gagal:', err.message)
    }
  }

  if (!fs.existsSync(finalPath)) {
    throw new Error('File gak ada setelah download')
  }

  const size = fs.statSync(finalPath).size
  if (size < 1000) {
    throw new Error(`File terlalu kecil: ${size} bytes`)
  }

  return {
    filePath: finalPath,
    kind,
    quality: target.quality,
    size: fmtBytes(size),
    bytes: size,
    out,
    client
  }
}

// ============================================================
// === STATE ===
// ============================================================

function saveState(buttonId, data) {
  ensureTempDir()
  const filePath = path.join(TEMP_DIR, `fb-state-${buttonId.replace(/:/g, '-')}.json`)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

function loadState(buttonId) {
  const filePath = path.join(TEMP_DIR, `fb-state-${buttonId.replace(/:/g, '-')}.json`)
  if (!fs.existsSync(filePath)) return null
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

function deleteState(buttonId) {
  const filePath = path.join(TEMP_DIR, `fb-state-${buttonId.replace(/:/g, '-')}.json`)
  try { fs.unlinkSync(filePath) } catch {}
}

// ============================================================
// === KIRIM TOMBOL ===
// ============================================================

async function sendSelectButtons(client, to, fbUrl) {
  const buttonId = `fbdl:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`

  const rows = STANDARD_QUALITIES.map((q, i) => ({
    id: `${buttonId}:${i}`,
    title: q.label === 'audio' ? `🎵 Audio (MP3)` : `🎬 ${q.label}`,
    description: q.desc
  }))

  saveState(buttonId, {
    fbUrl,
    createdAt: Date.now(),
    total: rows.length
  })

  await client.message.send(to, {
    interactiveMessage: {
      body: {
        text: `📘 *Facebook Downloader*\n\nPilih kualitas di bawah 👇`
      },
      footer: { text: 'Bot WA' },
      nativeFlowMessage: {
        buttons: [{
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: 'Pilih Jenis',
            sections: [{ title: 'Kualitas', rows }]
          })
        }],
        messageVersion: 1
      }
    }
  })

  return true
}

// ============================================================
// === KIRIM HASIL DOWNLOAD ===
// ============================================================

async function sendDownloaded(client, to, meta, result, isAudio) {
  if (!fs.existsSync(result.filePath)) {
    throw new Error('File gak ada')
  }

  const stat = fs.statSync(result.filePath)
  if (stat.size < 1000) {
    throw new Error(`File corrupt: cuma ${stat.size} bytes`)
  }

  const sizeMB = stat.size / 1024 / 1024

  const creator = meta.creator || '-'
  const title = (meta.title || '-').slice(0, 300)
  const desc = (meta.description || '').slice(0, 500)
  const duration = meta.duration || '-'
  const waktu = meta.waktu_upload || '-'

  const caption =
    `📘 *Facebook Downloader*\n` +
    `\n` +
    `👤 *Creator:* ${creator}\n` +
    `🎬 *Title:* ${title}\n` +
    (desc && desc !== title ? `📝 *Desc:* ${desc}\n` : '') +
    `⏱️ *Duration:* ${duration}\n` +
    `🕐 *Upload:* ${waktu}\n` +
    `📐 *Quality:* ${result.quality}\n` +
    `📦 *Size:* ${result.size}`

  try {
    const buffer = fs.readFileSync(result.filePath)

    if (buffer.length !== stat.size) {
      throw new Error(`Buffer size mismatch: ${buffer.length} vs ${stat.size}`)
    }

    if (isAudio) {
      const safeTitle = (meta.title || 'audio').replace(/[^\w\s.-]/g, '').trim().slice(0, 100) || 'audio'
      await retrySend(() => client.message.send(to, {
        type: 'audio',
        media: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${safeTitle}.mp3`,
        caption
      }))
    } else {
      await retrySend(() => client.message.send(to, {
        type: 'video',
        media: buffer,
        mimetype: 'video/mp4',
        caption
      }))
    }
  } finally {
    try { fs.unlinkSync(result.filePath) } catch {}
  }
}

// ============================================================
// === PLUGIN META ===
// ============================================================

export const meta = {
  name: 'facebook',
  alias: ['fb', 'fbdl'],
  category: 'downloader',
  autoHandler: true,
  buttonPrefix: 'fbdl:'
}

// ============================================================
// === AUTO HANDLER ===
// ============================================================

export async function autoHandler(client, { to, text, config }) {
  const prefix = config.prefix || '.'
  const trimmed = (text || '').trim()

  if (trimmed.startsWith(prefix)) return false
  if (!FB_REGEX.test(trimmed)) return false

  const fbUrl = normalizeFbUrl(trimmed.match(FB_REGEX)[0])
  if (!fbUrl) return false

  await sendSelectButtons(client, to, fbUrl)
  return true
}

// ============================================================
// === HANDLER .facebook / .fb ===
// ============================================================

export async function handler(client, { to, args }) {
  const input = args[0]
  if (!input || !FB_REGEX.test(input)) {
    await client.message.send(to, 'Kasih URL Facebook: *.facebook <url>* [resolusi]\nContoh: *.facebook https://fb.watch/xxx 720p*')
    return { ok: false }
  }

  const fbUrl = normalizeFbUrl(input)
  if (!fbUrl) {
    await client.message.send(to, '❌ URL Facebook gak valid.')
    return { ok: false }
  }

  const label = args[1] || null

  if (label) {
    await client.message.send(to, `⏳ Downloading ${label}...`)
    try {
      const result = await downloadToTmp(fbUrl, label)
      const metaInfo = {
        creator: result.out.creator,
        title: result.out.title,
        description: result.out.description,
        duration: result.out.duration,
        waktu_upload: result.out.waktu_upload,
        permalink: result.out.permalink
      }
      await sendDownloaded(client, to, metaInfo, result, result.kind === 'audio')
      return { ok: true }
    } catch (err) {
      console.error('[facebook] gagal:', err)
      await client.message.send(to, `❌ Gagal: ${err.message}`)
      return { ok: false }
    }
  }

  await sendSelectButtons(client, to, fbUrl)
  return { ok: true }
}

// ============================================================
// === ON BUTTON ===
// ============================================================

export async function onButton(client, { to, selectedId }) {
  if (!selectedId.startsWith('fbdl:')) return false

  const parts = selectedId.split(':')
  if (parts.length < 4) return false

  const idx = parseInt(parts[parts.length - 1], 10)
  const buttonId = parts.slice(0, -1).join(':')

  const state = loadState(buttonId)
  if (!state) {
    await client.message.send(to, '❌ Link udah expired. Kirim ulang link Facebook-nya.')
    return true
  }

  if (Date.now() - state.createdAt > 5 * 60 * 1000) {
    deleteState(buttonId)
    await client.message.send(to, '❌ Link udah expired. Kirim ulang link Facebook-nya.')
    return true
  }

  if (isNaN(idx) || idx < 0 || idx >= state.total) {
    await client.message.send(to, '❌ Pilihan gak valid.')
    return true
  }

  const quality = STANDARD_QUALITIES[idx]
  if (!quality) {
    await client.message.send(to, '❌ Pilihan gak valid.')
    return true
  }

  const label = quality.label

  await client.message.send(to, `⏳ Downloading ${label}...`)

  try {
    const result = await downloadToTmp(state.fbUrl, label)
    const metaInfo = {
      creator: result.out.creator,
      title: result.out.title,
      description: result.out.description,
      duration: result.out.duration,
      waktu_upload: result.out.waktu_upload,
      permalink: result.out.permalink
    }
    await sendDownloaded(client, to, metaInfo, result, result.kind === 'audio')
    deleteState(buttonId)
    return true
  } catch (err) {
    console.error('[facebook:button] gagal:', err)
    await client.message.send(to, `❌ Gagal download: ${err.message}`)
    return true
  }
}

// ============================================================
// === CLI MODE ===
// ============================================================

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const args = process.argv.slice(2)
  const input = args[0]
  const label = args[1] || '720p'

  if (!input) {
    console.error('Pemakaian: node facebook.js <url> [720p|audio]')
    process.exit(1)
  }

  const fbUrl = normalizeFbUrl(input)
  if (!fbUrl) {
    console.error('URL gak valid')
    process.exit(1)
  }

  console.log('Processing...')
  try {
    const result = await downloadToTmp(fbUrl, label)
    console.log(JSON.stringify({
      status: true,
      filePath: result.filePath,
      quality: result.quality,
      size: result.size,
      title: result.out.title,
      creator: result.out.creator
    }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, error: err.message }, null, 2))
    process.exit(1)
  }
}