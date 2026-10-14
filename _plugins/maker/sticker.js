import fs from 'node:fs'
import path from 'node:path'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'
import { videoToAnimatedWebp } from '../../system/ffmpeg.js'
import { imageToStickerWebp } from '../../system/sticker.js'
import { addStickerMeta } from '../../system/stickermeta.js'

export const meta = {
  name: 'sticker',
  alias: ['s'],
  category: 'maker'
}

function getMediaInfo(message) {
  if (!message) return null
  if (message.imageMessage) return { type: 'image', mime: message.imageMessage.mimetype }
  if (message.videoMessage) return { type: 'video', mime: message.videoMessage.mimetype }
  if (message.stickerMessage) return { type: 'sticker', mime: message.stickerMessage.mimetype }
  if (message.audioMessage) return { type: 'audio', mime: message.audioMessage.mimetype }
  if (message.documentMessage) return { type: 'document', mime: message.documentMessage.mimetype }
  return null
}

function extFromMime(mime) {
  if (!mime) return 'bin'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('quicktime')) return 'mov'
  return 'bin'
}

function resolveMediaSource(event) {
  const msg = event.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage
  if (quoted) return { targetMessage: quoted, downloadSource: quoted }
  return { targetMessage: msg, downloadSource: msg }
}

export async function handler(client, { to, event }) {
  ensureTempDir()

  const { targetMessage, downloadSource } = resolveMediaSource(event)
  const mediaInfo = getMediaInfo(targetMessage)

  if (!mediaInfo) {
    await client.message.send(to, 'Kirim/reply gambar atau video dengan caption *.sticker*')
    return { ok: false }
  }

  if (!['image', 'video', 'sticker'].includes(mediaInfo.type)) {
    await client.message.send(to, `Tipe media *${mediaInfo.type}* gak didukung.`)
    return { ok: false }
  }

  const ext = extFromMime(mediaInfo.mime)
  const tempInput = path.join(TEMP_DIR, `sticker-in-${Date.now()}.${ext}`)

  try {
    await client.message.downloadToFile(downloadSource, tempInput)
  } catch (err) {
    console.error('[sticker] download gagal:', err.message)
    await client.message.send(to, `Gagal download media: ${err.message}`)
    return { ok: false }
  }

  let stickerPath

  try {
    if (mediaInfo.type === 'image' || mediaInfo.type === 'sticker') {
      stickerPath = await imageToStickerWebp(tempInput)
    } else {
      stickerPath = await videoToAnimatedWebp(tempInput)
    }

    const webpBuffer = fs.readFileSync(stickerPath)
    const stamped = addStickerMeta(webpBuffer)
    fs.writeFileSync(stickerPath, stamped)

    await client.message.send(to, {
      type: 'sticker',
      media: stickerPath,
      mimetype: 'image/webp'
    })
  } finally {
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput)
    if (stickerPath && fs.existsSync(stickerPath)) fs.unlinkSync(stickerPath)
  }

  return { ok: true }
}