import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendFotoLive } from '../../command/fotolive.js'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const meta = {
  name: 'fotolive',
  alias: ['livephoto', 'livepic'],
  category: 'tools'
}

const USAGE_TEXT =
  `⚠️ *Cara pakai .fotolive:*\n\n` +
  `• Reply video + ketik *.fotolive*\n` +
  `• Atau kirim video + caption *.fotolive*`

// Video wajib dari reply, ATAU dari video yang dikirim langsung bareng
// caption ".fotolive" — gak ada sumber lain (gak ada URL, gak ada random).
function findQuotedVideo(event) {
  const msg = event?.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

  if (quoted?.videoMessage) return { videoMessage: quoted.videoMessage }
  if (msg.videoMessage) return { videoMessage: msg.videoMessage }
  return null
}

export async function handler(client, { to, event }) {
  const quotedVideo = findQuotedVideo(event)

  if (!quotedVideo) {
    await client.message.send(to, USAGE_TEXT)
    return { ok: false }
  }

  ensureTempDir()
  const downloadedPath = path.join(TEMP_DIR, `fotolive-reply-${Date.now()}.mp4`)

  try {
    try {
      await client.message.downloadToFile(quotedVideo, downloadedPath)
    } catch (err) {
      console.error('[fotolive] gagal download video:', err.message)
      await client.message.send(to, `❌ Gagal download video: ${err.message}`)
      return { ok: false }
    }

    await sendFotoLive(client, { to, videoPath: downloadedPath })
    return { ok: true }
  } catch (err) {
    console.error('[fotolive] GAGAL:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  } finally {
    try { fs.unlinkSync(downloadedPath) } catch {}
  }
}