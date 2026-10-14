import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAllMenu } from '../../command/allmenu.js'
import { sendFotoLive } from '../../command/fotolive.js'
import { getRandomThumbnailUrl } from '../../system/thumbnails.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..', '..')
const FALLBACK_VIDEO_PATH = path.join(ROOT, 'assets', 'alya720.mp4')

export const meta = {
  name: 'allmenu',
  alias: ['all'],
  category: 'general'
}

export async function handler(client, { to, event, prefix, userIsOwner, senderJid, startTime }) {
  const caption = buildAllMenu({ prefix, userIsOwner, startTime, senderJid })

  try {
    const videoUrl = getRandomThumbnailUrl()
    const mentions = senderJid ? [senderJid] : []

    await sendFotoLive(client, {
      to,
      ...(videoUrl ? { videoUrl } : { videoPath: FALLBACK_VIDEO_PATH }),
      caption,
      mentions
    })
    return { ok: true }
  } catch (err) {
    console.error('[allmenu] foto live gagal:', err.message)
    // Fallback: kirim teks biasa
    await client.message.send(to, caption)
    return { ok: true }
  }
}