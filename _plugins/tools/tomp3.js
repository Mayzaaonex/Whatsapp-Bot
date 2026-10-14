import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { pipeline } from 'node:stream/promises'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'
import { convertToMp3 } from '../../system/ffmpeg.js'

export const meta = {
  name: 'tomp3',
  alias: ['tomp3', 'tomp4', 'mp3'],
  category: 'tools'
}

function getMediaInfo(message) {
  if (!message) return null
  if (message.videoMessage) return { type: 'video', mime: message.videoMessage.mimetype }
  if (message.audioMessage) return { type: 'audio', mime: message.audioMessage.mimetype }
  if (message.documentMessage) return { type: 'document', mime: message.documentMessage.mimetype }
  return null
}

function extFromMime(mime) {
  if (!mime) return 'bin'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('quicktime')) return 'mov'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mkv')) return 'mkv'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('m4a')) return 'm4a'
  return 'bin'
}

export async function handler(client, { to, event, args }) {
  ensureTempDir()

  const msg = event.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

  const hasMedia = (m) => m && (m.videoMessage || m.audioMessage || m.documentMessage)

  let inputPath = null
  let cleanupInput = false

  // === Cara 1 & 2: kirim/reply media ===
  if (hasMedia(msg) || hasMedia(quoted)) {
    const targetMessage = hasMedia(quoted) ? quoted : msg
    const downloadSource = hasMedia(quoted) ? quoted : msg

    const mediaInfo = getMediaInfo(targetMessage)
    const ext = extFromMime(mediaInfo.mime)
    inputPath = path.join(TEMP_DIR, `tomp3-in-${Date.now()}.${ext}`)
    cleanupInput = true

    try {
      await client.message.downloadToFile(downloadSource, inputPath)
    } catch (err) {
      console.error('[tomp3] download gagal:', err.message)
      await client.message.send(to, `❌ Gagal download media: ${err.message}`)
      return { ok: false }
    }
  }
  // === Cara 3: URL ===
  else if (args[0] && /^https?:\/\//i.test(args[0])) {
    const url = args[0]
    inputPath = path.join(TEMP_DIR, `tomp3-url-${Date.now()}.bin`)
    cleanupInput = true

    try {
      const res = await axios.get(url, {
        responseType: 'stream',
        timeout: 120000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxContentLength: 200 * 1024 * 1024
      })

      await pipeline(res.data, fs.createWriteStream(inputPath))

      const size = fs.statSync(inputPath).size
      if (size < 1000) throw new Error(`File terlalu kecil: ${size} bytes`)
    } catch (err) {
      console.error('[tomp3] download URL gagal:', err.message)
      await client.message.send(to, `❌ Gagal download: ${err.message}`)
      return { ok: false }
    }
  }
  // === Gak ada media & URL ===
  else {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Cara pakai:\n` +
      `• Kirim video + caption *.tomp3*\n` +
      `• Reply video: *.tomp3*\n` +
      `• *.tomp3 https://contoh.com/video.mp4*`
    )
    return { ok: false }
  }

  // === Convert ke MP3 ===
  let mp3Path = null

  try {
    await client.message.send(to, '⏳ Convert ke MP3...')
    mp3Path = await convertToMp3(inputPath)
  } catch (err) {
    console.error('[tomp3] convert gagal:', err.message)
    await client.message.send(to, `❌ Gagal convert: ${err.message}`)
    if (cleanupInput && inputPath) try { fs.unlinkSync(inputPath) } catch {}
    return { ok: false }
  } finally {
    if (cleanupInput && inputPath) try { fs.unlinkSync(inputPath) } catch {}
  }

  // === Cek hasil ===
  if (!fs.existsSync(mp3Path)) {
    await client.message.send(to, '❌ File MP3 gak ada.')
    return { ok: false }
  }

  const mp3Size = fs.statSync(mp3Path).size
  if (mp3Size < 1000) {
    try { fs.unlinkSync(mp3Path) } catch {}
    await client.message.send(to, `❌ File MP3 terlalu kecil (${mp3Size} bytes).`)
    return { ok: false }
  }

  // === Kirim sebagai audio ===
  const buffer = fs.readFileSync(mp3Path)

  try {
    await client.message.send(to, {
      type: 'audio',
      media: buffer,
      mimetype: 'audio/mpeg',
      fileName: `tomp3-${Date.now()}.mp3`
    })
  } catch (err) {
    console.error('[tomp3] kirim gagal:', err.message)
    await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
    return { ok: false }
  } finally {
    try { fs.unlinkSync(mp3Path) } catch {}
  }

  return { ok: true }
}

// ====== CLI MODE ======
import { fileURLToPath } from 'node:url'
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const input = process.argv[2]
  if (!input) {
    console.error('Pemakaian: node tomp3.js <input-path-or-url>')
    process.exit(1)
  }

  ensureTempDir()

  try {
    let inputPath = input

    // Kalau URL, download dulu
    if (/^https?:\/\//i.test(input)) {
      const urlPath = path.join(TEMP_DIR, `tomp3-url-${Date.now()}.bin`)
      const res = await axios.get(input, {
        responseType: 'stream',
        timeout: 120000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      await pipeline(res.data, fs.createWriteStream(urlPath))
      inputPath = urlPath
    }

    const mp3Path = await convertToMp3(inputPath)
    console.log(JSON.stringify({ status: true, saved_to: mp3Path }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, error: err.message }, null, 2))
    process.exit(1)
  }
}