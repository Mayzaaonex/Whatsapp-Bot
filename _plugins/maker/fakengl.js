import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage, registerFont } from 'canvas'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BG_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/random/jojYN.jpg'
const FONT_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/fonts/Poppins-SemiBold.ttf'

async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  return res.data
}

export async function generateFakeNgl(text) {
  // Frame config
  const frameX1 = 280
  const frameY1 = 1032
  const frameX2 = 2271
  const frameY2 = 1754
  const fontMax = 100
  const fontMin = 37
  const fontPadding = 30
  const offsetX = 0
  const offsetY = 50
  const textColorR = 0
  const textColorG = 0
  const textColorB = 0

  // Download background + font paralel
  const [bgBuffer, fontBuffer] = await Promise.all([
    downloadBuffer(BG_URL),
    downloadBuffer(FONT_URL)
  ])

  // Register font
  const fontPath = path.join(os.tmpdir(), `poppins_${Date.now()}.ttf`)
  fs.writeFileSync(fontPath, fontBuffer)
  registerFont(fontPath, { family: 'Poppins' })

  try {
    const bgImg = await loadImage(bgBuffer)
    const canvas = createCanvas(bgImg.width, bgImg.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bgImg, 0, 0)

    const areaW = frameX2 - frameX1 - (fontPadding * 2)
    const areaH = frameY2 - frameY1 - (fontPadding * 2)

    function measureText(text, fontSize) {
      ctx.font = `${fontSize}px Poppins`
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

    // Cari font size optimal
    let fontSize = fontMax
    let lines = []
    while (fontSize >= fontMin) {
      lines = wrapText(text, areaW, fontSize)
      const lineHeight = fontSize * 1.25
      const totalHeight = lines.length * lineHeight
      let widestLine = 0
      for (const line of lines) {
        const w = measureText(line, fontSize)
        if (w > widestLine) widestLine = w
      }
      if (widestLine <= areaW && totalHeight <= areaH) break
      fontSize--
    }

    ctx.textBaseline = 'middle'
    ctx.fillStyle = `rgb(${textColorR}, ${textColorG}, ${textColorB})`
    ctx.font = `${fontSize}px Poppins`

    const lineHeight = fontSize * 1.25
    const startY = frameY1 + (areaH - (lines.length * lineHeight)) / 2 + (lineHeight / 2) + offsetY

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineWidth = measureText(line, fontSize)
      const x = frameX1 + (areaW - lineWidth) / 2 + offsetX
      const y = startY + (i * lineHeight)
      ctx.fillText(line, x, y)
    }

    return canvas.toBuffer('image/jpeg', { quality: 0.95 })
  } finally {
    try { fs.unlinkSync(fontPath) } catch {}
  }
}

// ====== HANDLER ======
export const meta = {
  name: 'fakengl',
  category: 'maker'
}

export async function handler(client, { to, args }) {
  const text = args.join(' ').trim() || 'Gw tuh sebenarnya ultramen'

  ensureTempDir()

  let jpgPath

  try {
    const buffer = await generateFakeNgl(text)
    jpgPath = path.join(TEMP_DIR, `fakengl-${Date.now()}.jpg`)
    fs.writeFileSync(jpgPath, buffer)
  } catch (err) {
    console.error('[fakengl] generate gagal:', err.message)
    await client.message.send(to, `❌ Gagal generate: ${err.message}`)
    return { ok: false }
  }

  try {
    await client.message.send(to, {
      type: 'image',
      media: jpgPath,
      mimetype: 'image/jpeg'
    })
  } catch (err) {
    console.error('[fakengl] kirim gagal:', err.message)
    await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
    return { ok: false }
  } finally {
    if (jpgPath) try { fs.unlinkSync(jpgPath) } catch {}
  }

  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const text = process.argv.slice(2).join(' ').trim() || 'Gw tuh sebenarnya ultramen'

  ensureTempDir()

  try {
    const buffer = await generateFakeNgl(text)
    const outPath = path.join(TEMP_DIR, `fakengl-cli-${Date.now()}.jpg`)
    fs.writeFileSync(outPath, buffer)
    console.log(JSON.stringify({ status: true, saved_to: outPath }))
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}