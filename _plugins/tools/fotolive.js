import { sendFotoLive } from '../../command/fotolive.js'

export const meta = {
  name: 'fotolive',
  alias: ['livephoto', 'livepic'],
  category: 'tools'
}

const DEFAULT_VIDEO_URL = 'https://mayzaa.netlify.app/api/upload/alya720.mp4'

export async function handler(client, { to, args, event }) {
  // Bisa: .fotolive (default) atau .fotolive <url>
  const videoUrl = args[0] || DEFAULT_VIDEO_URL

  if (!/^https?:\/\//.test(videoUrl)) {
    await client.message.send(to, '⚠️ Format: *.fotolive [url-video]*')
    return { ok: false }
  }

  try {
    await sendFotoLive(client, { to, videoUrl })
    return { ok: true }
  } catch (err) {
    console.error('[fotolive] GAGAL:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }
}