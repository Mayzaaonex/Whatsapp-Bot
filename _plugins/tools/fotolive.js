import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendFotoLive } from '../../command/fotolive.js'
import { getRandomThumbnailUrl } from '../../system/thumbnails.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..', '..')

// Fallback lokal kalau assets/thumbnails.json kosong/gak ada link yang jalan.
// JANGAN hardcode satu URL doang di sini — link remote bisa mati/404 kapan aja
// (ini yang kemarin bikin .fotolive error padahal .menu tetep jalan).
const FALLBACK_VIDEO_PATH = path.join(ROOT, 'assets', 'alya720.mp4')

export const meta = {
  name: 'fotolive',
  alias: ['livephoto', 'livepic'],
  category: 'tools'
}

export async function handler(client, { to, args }) {
  // .fotolive <url>  → pakai URL yang dikasih user
  // .fotolive         → random dari assets/thumbnails.json, fallback video lokal
  const explicitUrl = args[0]

  if (explicitUrl && !/^https?:\/\//.test(explicitUrl)) {
    await client.message.send(to, '⚠️ Format: *.fotolive [url-video]*')
    return { ok: false }
  }

  const videoUrl = explicitUrl || getRandomThumbnailUrl()

  try {
    if (videoUrl) {
      await sendFotoLive(client, { to, videoUrl })
    } else {
      await sendFotoLive(client, { to, videoPath: FALLBACK_VIDEO_PATH })
    }
    return { ok: true }
  } catch (err) {
    console.error('[fotolive] GAGAL:', err.message)

    // Kalau URL (dari thumbnails.json atau user) gagal di-fetch, coba sekali lagi
    // pakai video lokal sebelum nyerah — biar command ini gak gampang down cuma
    // gara-gara satu link remote mati.
    if (videoUrl) {
      try {
        await sendFotoLive(client, { to, videoPath: FALLBACK_VIDEO_PATH })
        return { ok: true }
      } catch (fallbackErr) {
        console.error('[fotolive] fallback lokal juga gagal:', fallbackErr.message)
      }
    }

    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }
}