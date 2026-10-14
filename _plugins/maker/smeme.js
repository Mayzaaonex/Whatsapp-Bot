import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage, registerFont } from 'canvas'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEFAULT_IMAGE_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/fonts/194d010c04d9fd01868055c2f26a5771.png'
const FONT_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/fonts/Impact.ttf'

async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  return res.data
}

export async function generateSmeme({ top, bottom, imageBuffer }) {
  // Font
  const fontBuffer = await downloadBuffer(FONT_URL)
  const fontPath = path.join(os.tmpdir(), `impact_${Date.now()}.ttf`)
  fs.writeFileSync(fontPath, fontBuffer)
  registerFont(fontPath, { family: 'Impact' })

  try {
    // Image
    if (!imageBuffer) {
      imageBuffer = await downloadBuffer(DEFAULT_IMAGE_URL)
    }

    const img = await loadImage(imageBuffer)
    const width = img.width
    const height = img.height

    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, width, height)

    const padding = Math.round(Math.min(width, height) * 0.04)
    const maxWidth = width - (padding * 2)
    const fontRatio = Math.round(Math.min(width, height) * 0.10)

    function measureText(text, fontSize) {
      ctx.font = `${fontSize}px Impact`
      return ctx.measureText(text).width
    }

    function wrapText(text, maxWidth, fontSize) {
      const words = text.split(' ')
      const lines = []
      let line = ''
      for (const word of words) {
        const test = line ? line + ' ' + word : word
        if (measureText(test, fontSize) > maxWidth) {
          if (line) lines.push(line)
          line = word
        } else {
          line = test
        }
      }
      if (line) lines.push(line)
      return lines
    }

    function fitText(text, maxWidth, startSize) {
      let size = startSize
      let lines = []
      while (size > 12) {
        lines = wrapText(text, maxWidth, size)
        let widest = 0
        for (const line of lines) {
          const w = measureText(line, size)
          if (w > widest) widest = w
        }
        if (widest <= maxWidth) break
        size -= 2
      }
      return {
        size,
        lines: wrapText(text, maxWidth, size),
        lineHeight: size * 1.15
      }
    }

    function drawTextWithStroke(text, x, y, fontSize, strokeColor, fillColor) {
      const stroke = Math.max(2, Math.round(fontSize * 0.08))
      ctx.font = `${fontSize}px Impact`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      ctx.lineWidth = stroke
      ctx.strokeStyle = strokeColor
      for (let sx = -stroke; sx <= stroke; sx++) {
        for (let sy = -stroke; sy <= stroke; sy++) {
          ctx.strokeText(text, x + sx, y + sy)
        }
      }

      ctx.fillStyle = fillColor
      ctx.fillText(text, x, y)
    }

    if (top) {
      const topFit = fitText(top, maxWidth, fontRatio)
      const startY = padding
      for (let i = 0; i < topFit.lines.length; i++) {
        const line = topFit.lines[i]
        const y = startY + (i * topFit.lineHeight)
        drawTextWithStroke(line, width / 2, y, topFit.size, '#000000', '#ffffff')
      }
    }

    if (bottom) {
      const bottomFit = fitText(bottom, maxWidth, fontRatio)
      const lineCount = bottomFit.lines.length
      const startY = height - padding - (lineCount * bottomFit.lineHeight)
      for (let i = 0; i < lineCount; i++) {
        const line = bottomFit.lines[i]
        const y = startY + (i * bottomFit.lineHeight)
        drawTextWithStroke(line, width / 2, y, bottomFit.size, '#000000', '#ffffff')
      }
    }

    return canvas.toBuffer('image/png')
  } finally {
    try { fs.unlinkSync(fontPath) } catch {}
  }
}

// ====== HANDLER ======
export const meta = {
  name: 'smeme',
  category: 'maker'
}

export async function handler(client, { to, event, args }) {
  // Parse args: "atas | bawah" atau "atas|bawah"
  const raw = args.join(' ').trim()
  let top = 'FOR'
  let bottom = 'YOU'

  if (raw) {
    const parts = raw.split('|').map((s) => s.trim())
    if (parts[0]) top = parts[0].toUpperCase()
    if (parts[1]) bottom = parts[1].toUpperCase()
  }

  // Cek media (kirim/reply)
  const msg = event.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

  const hasImage = (m) => m && (m.imageMessage || m.stickerMessage)
  const adaMedia = hasImage(msg) || hasImage(quoted)

  ensureTempDir()

  let imageBuffer = null
  let tempInput = null

  if (adaMedia) {
    const downloadSource = hasImage(quoted) ? quoted : msg
    tempInput = path.join(TEMP_DIR, `smeme-in-${Date.now()}.jpg`)

    try {
      await client.message.downloadToFile(downloadSource, tempInput)
      imageBuffer = fs.readFileSync(tempInput)
    } catch (err) {
      console.error('[smeme] download gagal:', err.message)
      await client.message.send(to, `❌ Gagal download media: ${err.message}`)
      return { ok: false }
    }
  }

  let pngPath

  try {
    const buffer = await generateSmeme({ top, bottom, imageBuffer })
    pngPath = path.join(TEMP_DIR, `smeme-${Date.now()}.png`)
    fs.writeFileSync(pngPath, buffer)
  } catch (err) {
    console.error('[smeme] generate gagal:', err.message)
    await client.message.send(to, `❌ Gagal generate: ${err.message}`)
    return { ok: false }
  } finally {
    if (tempInput) try { fs.unlinkSync(tempInput) } catch {}
  }

  try {
    await client.message.send(to, {
      type: 'image',
      media: pngPath,
      mimetype: 'image/png'
    })
  } catch (err) {
    console.error('[smeme] kirim gagal:', err.message)
    await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
    return { ok: false }
  } finally {
    if (pngPath) try { fs.unlinkSync(pngPath) } catch {}
  }

  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const raw = process.argv.slice(2).join(' ').trim()
  let top = 'FOR'
  let bottom = 'YOU'

  if (raw) {
    const parts = raw.split('|').map((s) => s.trim())
    if (parts[0]) top = parts[0].toUpperCase()
    if (parts[1]) bottom = parts[1].toUpperCase()
  }

  ensureTempDir()

  try {
    const buffer = await generateSmeme({ top, bottom, imageBuffer: null })
    const outPath = path.join(TEMP_DIR, `smeme-cli-${Date.now()}.png`)
    fs.writeFileSync(outPath, buffer)
    console.log(JSON.stringify({ status: true, saved_to: outPath }))
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}