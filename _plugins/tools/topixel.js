import { createCanvas, loadImage } from 'canvas'
import { writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..', '..')
const TMP_DIR = path.join(ROOT, 'tmp')

const credit = { creator: 'Mayzaa' }

const isValidUrl = (url) => {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' ||
        parsed.hostname.startsWith('10.') || parsed.hostname.startsWith('192.168.') ||
        parsed.hostname.startsWith('172.') || parsed.hostname.startsWith('169.254.')) return false
    return true
  } catch { return false }
}

const isHttpUrl = (str) => {
  try {
    const parsed = new URL(str)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch { return false }
}

export async function topixel(imageInput, pixelLevel = 30) {
  try {
    if (!imageInput) {
      return { ...credit, status: false, message: 'Parameter url atau path file wajib diisi' }
    }

    if (isHttpUrl(imageInput) && !isValidUrl(imageInput)) {
      return { ...credit, status: false, message: 'URL tidak valid atau ditolak' }
    }

    const block = Math.min(Math.max(41 - Math.min(Math.max(pixelLevel, 1), 40), 1), 40)

    const img = await loadImage(imageInput)
    const canvas = createCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)

    const imageData = ctx.getImageData(0, 0, img.width, img.height)
    const data = imageData.data

    // Pixelate
    for (let y = 0; y < img.height; y += block) {
      for (let x = 0; x < img.width; x += block) {
        let r = 0, g = 0, b = 0, a = 0, count = 0
        const maxY = Math.min(y + block, img.height)
        const maxX = Math.min(x + block, img.width)

        for (let yy = y; yy < maxY; yy++) {
          for (let xx = x; xx < maxX; xx++) {
            const idx = (yy * img.width + xx) * 4
            r += data[idx]
            g += data[idx + 1]
            b += data[idx + 2]
            a += data[idx + 3]
            count++
          }
        }

        r = Math.round(r / count)
        g = Math.round(g / count)
        b = Math.round(b / count)
        a = Math.round(a / count)

        for (let yy = y; yy < maxY; yy++) {
          for (let xx = x; xx < maxX; xx++) {
            const idx = (yy * img.width + xx) * 4
            data[idx] = r
            data[idx + 1] = g
            data[idx + 2] = b
            data[idx + 3] = a
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)

    const buffer = canvas.toBuffer('image/png', { compressionLevel: 9 })
    return { ...credit, status: true, buffer }
  } catch (error) {
    console.error('[topixel]', error.message)
    return { ...credit, status: false, message: error.message }
  }
}

// === CLI MODE ===
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const imageInput = process.argv[2]
  const outPath = process.argv[3] || path.join(TMP_DIR, `topixel-${Date.now()}.png`)
  const pixelLevel = 30

  if (!imageInput) {
    console.error('Pemakaian: node topixel.js <url-atau-path-foto> [output.png]')
    console.error('Contoh  : node topixel.js https://contoh.com/foto.jpg hasil.png')
    console.error('Contoh  : node topixel.js ./foto.jpg hasil.png')
    process.exit(1)
  }

  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true })
  }

  topixel(imageInput, pixelLevel)
    .then(async (res) => {
      if (!res.status) {
        console.error('Error:', res.message)
        process.exit(1)
      }
      await writeFile(outPath, res.buffer)
      console.log(JSON.stringify({ ...credit, status: true, saved_to: outPath }, null, 2))
    })
    .catch((err) => {
      console.error('Error:', err.message)
      process.exit(1)
    })
}