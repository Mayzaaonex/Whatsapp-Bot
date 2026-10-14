import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from 'canvas'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = 'https://science.nasa.gov/specials/your-name-in-landsat/images'
const LETTER_W = 250
const LETTER_H = 600
const GAP = 10
const MAX_LETTERS = 20

async function downloadLetter(letter) {
  const url = `${BASE_URL}/${letter}_0.jpg`

  let retries = 3
  while (retries > 0) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
          'Referer': 'https://science.nasa.gov/specials/your-name-in-landsat/',
          'Accept': 'image/*'
        }
      })
      return response.data
    } catch (e) {
      retries--
      if (retries === 0) throw new Error(`Gagal download huruf: ${letter}`)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

async function generateNasaLand(name) {
  const letters = []
  let totalWidth = 0

  for (const letter of name) {
    const imgData = await downloadLetter(letter)
    const img = await loadImage(imgData)

    const canvas = createCanvas(LETTER_W, LETTER_H)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, LETTER_W, LETTER_H)

    letters.push(canvas)
    totalWidth += LETTER_W + GAP
  }

  totalWidth -= GAP
  if (totalWidth < 0) totalWidth = LETTER_W

  const finalCanvas = createCanvas(totalWidth, LETTER_H)
  const ctx = finalCanvas.getContext('2d')

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, totalWidth, LETTER_H)

  let x = 0
  for (const canvas of letters) {
    ctx.drawImage(canvas, x, 0, LETTER_W, LETTER_H)
    x += LETTER_W + GAP
  }

  return finalCanvas.toBuffer('image/jpeg', { quality: 0.95 })
}

// ====== HANDLER ======
export const meta = {
  name: 'nasaland',
  category: 'maker'
}

export async function handler(client, { to, args }) {
  let name = (args.join(' ') || '').toLowerCase().replace(/[^a-z]/g, '')

  if (!name) {
    await client.message.send(to, 'Kasih nama (huruf A-Z): *.nasaland <nama>*\nContoh: *.nasaland mayzaa*')
    return { ok: false }
  }

  if (name.length > MAX_LETTERS) {
    await client.message.send(to, `❌ Maksimal ${MAX_LETTERS} huruf. Nama kamu ${name.length} huruf.`)
    return { ok: false }
  }

  ensureTempDir()

  let jpgPath

  try {
    const buffer = await generateNasaLand(name)
    jpgPath = path.join(TEMP_DIR, `nasaland-${Date.now()}.jpg`)
    fs.writeFileSync(jpgPath, buffer)
  } catch (err) {
    console.error('[nasaland] generate gagal:', err.message)
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
    console.error('[nasaland] kirim gagal:', err.message)
    await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
    return { ok: false }
  } finally {
    try { fs.unlinkSync(jpgPath) } catch {}
  }

  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const name = (process.argv[2] || 'nasa').toLowerCase().replace(/[^a-z]/g, '')
  if (!name) {
    console.error('Pemakaian: node nasaland.js <nama>')
    process.exit(1)
  }

  ensureTempDir()

  try {
    const buffer = await generateNasaLand(name)
    const outPath = path.join(TEMP_DIR, `nasaland-cli-${Date.now()}.jpg`)
    fs.writeFileSync(outPath, buffer)
    console.log(JSON.stringify({ status: true, saved_to: outPath }))
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}