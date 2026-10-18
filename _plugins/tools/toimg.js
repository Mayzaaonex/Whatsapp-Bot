import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'
import { getFfmpegPath } from '../../system/ffmpeg.js'

export const meta = {
  name: 'toimg',
  alias: ['toimage', 'tovid', 'tovideo'],
  category: 'tools'
}

function getFfmpeg() {
  return getFfmpegPath()
}

/**
 * Cek sticker animated atau statik.
 * Return { animated: bool }
 */
function checkStickerAnimated(filePath) {
  return new Promise((resolve) => {
    const ffmpeg = getFfmpeg()
    const child = spawn(ffmpeg, ['-i', filePath, '-v', 'error', '-f', 'null', '-'])

    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', () => resolve({ animated: false }))
    child.on('close', () => {
      // Cek di stderr: "Stream #0:0 ... Video" + "frames" banyak = animated
      // Sticker statik: cuma 1 frame
      // Cek dengan ffprobe lebih reliable
      resolve({ animated: stderr.includes('Video:') })
    })
  })
}

/**
 * Convert sticker statik ke PNG.
 */
function stickerToPng(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpeg()
    const child = spawn(ffmpeg, [
      '-y',
      '-i', inputPath,
      '-vframes', '1',
      '-f', 'image2',
      outputPath
    ])

    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => reject(new Error(`ffmpeg error: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve(outputPath)
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`))
    })
  })
}

/**
 * Convert sticker animasi ke MP4.
 */
function stickerToMp4(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpeg()
    const child = spawn(ffmpeg, [
      '-y',
      '-i', inputPath,
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-an',
      outputPath
    ])

    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => reject(new Error(`ffmpeg error: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve(outputPath)
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`))
    })
  })
}

/**
 * Cek sticker animated pakai ffprobe (lebih akurat).
 */
function isAnimatedSticker(filePath) {
  return new Promise((resolve) => {
    const ffprobe = getFfmpeg().replace(/ffmpeg(\.exe)?$/, 'ffprobe$1')
    const child = spawn(ffprobe, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ])

    let stdout = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.on('error', () => resolve(false))
    child.on('close', () => {
      // Kalau durasi > 0.1 detik, berarti animated
      const duration = parseFloat(stdout.trim())
      resolve(!isNaN(duration) && duration > 0.1)
    })
  })
}

export async function handler(client, { to, event }) {
  ensureTempDir()

  const msg = event.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

  const hasSticker = (m) => m && m.stickerMessage

  if (!hasSticker(msg) && !hasSticker(quoted)) {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Cara pakai:\n` +
      `• Reply sticker: *.toimg*\n` +
      `• Kirim sticker + caption *.toimg*`
    )
    return { ok: false }
  }

  const targetMessage = hasSticker(quoted) ? quoted : msg
  const downloadSource = hasSticker(quoted) ? quoted : msg

  const tempInput = path.join(TEMP_DIR, `toimg-in-${Date.now()}.webp`)

  // === 1. Download sticker ===
  try {
    await client.message.downloadToFile(downloadSource, tempInput)
  } catch (err) {
    console.error('[toimg] download gagal:', err.message)
    await client.message.send(to, `❌ Gagal download sticker: ${err.message}`)
    return { ok: false }
  }

  if (!fs.existsSync(tempInput)) {
    await client.message.send(to, '❌ File sticker gak ada.')
    return { ok: false }
  }

  const size = fs.statSync(tempInput).size
  if (size < 100) {
    try { fs.unlinkSync(tempInput) } catch {}
    await client.message.send(to, `❌ File sticker corrupt: ${size} bytes`)
    return { ok: false }
  }

  // === 2. Cek animated ===
  const animated = await isAnimatedSticker(tempInput)
  console.log(`[toimg] sticker animated: ${animated} (${size} bytes)`)

  // === 3. Convert ===
  if (animated) {
    // Sticker animasi → MP4
    const outputPath = path.join(TEMP_DIR, `toimg-${Date.now()}.mp4`)

    try {
      await client.message.send(to, '⏳ Convert sticker animasi ke video...')
      await stickerToMp4(tempInput, outputPath)
    } catch (err) {
      console.error('[toimg] convert MP4 gagal:', err.message)
      await client.message.send(to, `❌ Gagal convert: ${err.message}`)
      try { fs.unlinkSync(tempInput) } catch {}
      return { ok: false }
    } finally {
      try { fs.unlinkSync(tempInput) } catch {}
    }

    // Verify
    if (!fs.existsSync(outputPath)) {
      await client.message.send(to, '❌ File MP4 gak ada.')
      return { ok: false }
    }

    const mp4Size = fs.statSync(outputPath).size
    if (mp4Size < 1000) {
      try { fs.unlinkSync(outputPath) } catch {}
      await client.message.send(to, `❌ File MP4 terlalu kecil: ${mp4Size} bytes`)
      return { ok: false }
    }

    // Kirim video
    const buffer = fs.readFileSync(outputPath)

    try {
      await client.message.send(to, {
        type: 'video',
        media: buffer,
        mimetype: 'video/mp4',
        caption: '🎬 Sticker → Video'
      })
    } catch (err) {
      console.error('[toimg] kirim video gagal:', err.message)
      await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
      return { ok: false }
    } finally {
      try { fs.unlinkSync(outputPath) } catch {}
    }
  } else {
    // Sticker statik → PNG
    const outputPath = path.join(TEMP_DIR, `toimg-${Date.now()}.png`)

    try {
      await client.message.send(to, '⏳ Convert sticker ke gambar...')
      await stickerToPng(tempInput, outputPath)
    } catch (err) {
      console.error('[toimg] convert PNG gagal:', err.message)
      await client.message.send(to, `❌ Gagal convert: ${err.message}`)
      try { fs.unlinkSync(tempInput) } catch {}
      return { ok: false }
    } finally {
      try { fs.unlinkSync(tempInput) } catch {}
    }

    // Verify
    if (!fs.existsSync(outputPath)) {
      await client.message.send(to, '❌ File PNG gak ada.')
      return { ok: false }
    }

    const pngSize = fs.statSync(outputPath).size
    if (pngSize < 1000) {
      try { fs.unlinkSync(outputPath) } catch {}
      await client.message.send(to, `❌ File PNG terlalu kecil: ${pngSize} bytes`)
      return { ok: false }
    }

    // Kirim image
    const buffer = fs.readFileSync(outputPath)

    try {
      await client.message.send(to, {
        type: 'image',
        media: buffer,
        mimetype: 'image/png',
        caption: '🖼️ Sticker → Gambar'
      })
    } catch (err) {
      console.error('[toimg] kirim gambar gagal:', err.message)
      await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
      return { ok: false }
    } finally {
      try { fs.unlinkSync(outputPath) } catch {}
    }
  }

  return { ok: true }
}