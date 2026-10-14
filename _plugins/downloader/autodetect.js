import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PATTERNS = {
  youtube: /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/i,
  tiktok: /https?:\/\/(?:www\.)?(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)\/[^\s]+/i,
  instagram: /https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/[^\s]+/i,
  pinterest: /https?:\/\/(?:www\.)?(?:pinterest\.com|pin\.it)\/[^\s]+/i,
  spotify: /https?:\/\/(?:open\.)?spotify\.com\/[^\s]+/i,
  douyin: /https?:\/\/(?:www\.)?(?:douyin\.com|v\.douyin\.com)\/[^\s]+/i
}

function detectPlatform(text) {
  if (!text) return null
  for (const [platform, regex] of Object.entries(PATTERNS)) {
    const match = text.match(regex)
    if (match) return { platform, url: match[0] }
  }
  return null
}

function saveState(buttonId, data) {
  ensureTempDir()
  const filePath = path.join(TEMP_DIR, `autodetect-${buttonId.replace(/:/g, '-')}.json`)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  return filePath
}

function loadState(buttonId) {
  const filePath = path.join(TEMP_DIR, `autodetect-${buttonId.replace(/:/g, '-')}.json`)
  if (!fs.existsSync(filePath)) return null
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

function deleteState(buttonId) {
  const filePath = path.join(TEMP_DIR, `autodetect-${buttonId.replace(/:/g, '-')}.json`)
  try { fs.unlinkSync(filePath) } catch {}
}

// === Spawn CLI ===
function runCli(scriptName, args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName)
    if (!fs.existsSync(scriptPath)) return reject(new Error(`Script ${scriptName} gak ada`))

    const child = spawn('node', [scriptPath, ...args], { timeout: 180000 })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.slice(-300) || `exit ${code}`))
      try { resolve(JSON.parse(stdout.trim())) }
      catch { reject(new Error(`Parse gagal: ${stdout.slice(0, 200)}`)) }
    })
    child.on('error', reject)
  })
}

function extractDownloadUrl(result) {
  return (
    result.result?.download_url ||
    result.result?.video_url ||
    result.result?.download_link ||
    result.result?.media?.[0]?.url ||
    result.result?.video ||
    result.result?.image ||
    null
  )
}

function detectMediaType(result, platform) {
  const r = result.result || {}

  // Spotify → audio
  if (platform === 'spotify') return 'audio'

  // Ada video_url / video → video
  if (r.video_url || r.video || r.type === 'video') return 'video'

  // Ada download_url .mp3 → audio
  if (r.download_url?.includes('.mp3')) return 'audio'

  // Ada media array dengan type
  if (r.media?.[0]?.type === 'video') return 'video'
  if (r.media?.[0]?.type === 'image') return 'image'

  // Default: video
  return 'video'
}

// === Plugin ===
export const meta = {
  name: 'autodetect',
  category: 'downloader',
  autoHandler: true,
  buttonPrefix: 'autodetect:'
}

// === Auto handler ===
export async function autoHandler(client, { to, event, text, config, userIsOwner, isGroup, senderJid }) {
  const prefix = config.prefix || '.'
  const trimmed = (text || '').trim()

  // Skip kalau command manual
  if (trimmed.startsWith(prefix)) return false

  const detected = detectPlatform(trimmed)
  if (!detected) return false

  const { platform, url } = detected

  // === YouTube → kirim tombol ===
  if (platform === 'youtube') {
    const buttonId = `autodetect:yt:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`

    saveState(buttonId, { platform: 'youtube', url, createdAt: Date.now() })

    await client.message.send(to, {
      interactiveMessage: {
        body: {
          text:
            `╭─〔 YOUTUBE DOWNLOADER 〕\n` +
            `│\n` +
            `│ Link: ${url.slice(0, 100)}\n` +
            `│\n` +
            `│ Pilih format di bawah 👇\n` +
            `╰──────────`
        },
        footer: { text: 'Bot WA' },
        nativeFlowMessage: {
          buttons: [
            {
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({
                display_text: '🎵 MP3',
                id: `${buttonId}:mp3`
              })
            },
            {
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({
                display_text: '🎬 MP4',
                id: `${buttonId}:mp4`
              })
            }
          ],
          messageVersion: 1
        }
      }
    })

    return true
  }

  // === Platform lain → langsung download + reaction ===
  const cmdMap = {
    tiktok: 'tiktok.js',
    instagram: 'instagram.js',
    pinterest: 'pinterest.js',
    spotify: 'spotify.js',
    douyin: 'douyin.js'
  }

  const scriptName = cmdMap[platform]
  if (!scriptName) return false

  // Reaction loading
  try {
    await client.message.send(to, {
      type: 'reaction',
      emoji: '⏳',
      target: event.key
    })
  } catch {}

  try {
    const result = await runCli(scriptName, [url])

    if (!result.status) {
      throw new Error(result.message || result.error || 'Gagal download')
    }

    const downloadUrl = extractDownloadUrl(result)
    if (!downloadUrl) throw new Error('Gak ada link media')

    // Download buffer
    const resp = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buffer = Buffer.from(await resp.arrayBuffer())

    const mediaType = detectMediaType(result, platform)
    const ext = mediaType === 'audio' ? '.mp3' : mediaType === 'image' ? '.jpg' : '.mp4'
    const tempPath = path.join(TEMP_DIR, `auto-${platform}-${Date.now()}${ext}`)
    fs.writeFileSync(tempPath, buffer)

    // Caption
    const title = result.result?.title || result.result?.caption || result.result?.author || platform
    const author = result.result?.author || result.result?.artist || ''
    const caption =
      `📥 *${platform}*\n` +
      (author ? `👤 ${author}\n` : '') +
      `🎬 ${title.slice(0, 200)}`

    // Kirim
    if (mediaType === 'audio') {
      const safeTitle = (title || 'audio').replace(/[^\w\s.-]/g, '').trim().slice(0, 100) || 'audio'
      await client.message.send(to, {
        type: 'audio',
        media: tempPath,
        mimetype: 'audio/mpeg',
        fileName: `${safeTitle}.mp3`,
        caption
      })
    } else if (mediaType === 'image') {
      await client.message.send(to, {
        type: 'image',
        media: tempPath,
        mimetype: 'image/jpeg',
        caption
      })
    } else {
      await client.message.send(to, {
        type: 'video',
        media: tempPath,
        mimetype: 'video/mp4',
        caption
      })
    }

    try { fs.unlinkSync(tempPath) } catch {}

    // Reaction sukses
    try {
      await client.message.send(to, {
        type: 'reaction',
        emoji: '✅',
        target: event.key
      })
    } catch {}

    return true
  } catch (err) {
    console.error(`[autodetect:${platform}] gagal:`, err.message)

    // Reaction gagal
    try {
      await client.message.send(to, {
        type: 'reaction',
        emoji: '❌',
        target: event.key
      })
    } catch {}

    // Kirim error
    await client.message.send(to, `❌ Gagal download ${platform}: ${err.message}`)
    return true
  }
}

// === onButton ===
export async function onButton(client, { to, selectedId }) {
  if (!selectedId.startsWith('autodetect:')) return false

  const parts = selectedId.split(':')
  if (parts.length < 5) return false

  const format = parts[parts.length - 1]
  const buttonId = parts.slice(0, -1).join(':')

  if (!['mp3', 'mp4'].includes(format)) return false

  const state = loadState(buttonId)
  if (!state) {
    await client.message.send(to, '❌ Link udah expired. Kirim ulang link YouTube-nya.')
    return true
  }

  if (Date.now() - state.createdAt > 5 * 60 * 1000) {
    deleteState(buttonId)
    await client.message.send(to, '❌ Link udah expired. Kirim ulang link YouTube-nya.')
    return true
  }

  const { url } = state
  const scriptName = format === 'mp3' ? 'ytmp3.js' : 'ytmp4.js'

  await client.message.send(to, `⏳ Processing ${format.toUpperCase()}...`)

  try {
    const result = await runCli(scriptName, [url])

    if (!result.status || !result.downloadUrl) {
      throw new Error(result.error || 'Gak dapet link')
    }

    const buffer = await fetch(result.downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.arrayBuffer()
    })

    const ext = format === 'mp3' ? '.mp3' : '.mp4'
    const tempPath = path.join(TEMP_DIR, `autodetect-${format}-${Date.now()}${ext}`)
    fs.writeFileSync(tempPath, Buffer.from(buffer))

    const safeTitle = (result.title || 'audio').replace(/[^\w\s.-]/g, '').trim().slice(0, 100) || 'audio'

    if (format === 'mp3') {
      await client.message.send(to, {
        type: 'audio',
        media: tempPath,
        mimetype: 'audio/mpeg',
        fileName: `${safeTitle}.mp3`,
        caption: `🎵 *${result.title}*`
      })
    } else {
      await client.message.send(to, {
        type: 'video',
        media: tempPath,
        mimetype: 'video/mp4',
        caption: `🎬 *${result.title}*`
      })
    }

    try { fs.unlinkSync(tempPath) } catch {}
    deleteState(buttonId)

    return true
  } catch (err) {
    console.error(`[autodetect:${format}] gagal:`, err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return true
  }
}