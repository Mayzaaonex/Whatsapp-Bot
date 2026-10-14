import QRCode from 'qrcode'
import { fileURLToPath } from 'url'
import { writeFile } from 'fs/promises'
import path from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..', '..')
const TMP_DIR = path.join(ROOT, 'tmp')

const credit = { creator: 'Mayzaa' }

export async function qrgenerator(text) {
  try {
    if (!text) {
      return { ...credit, status: false, message: 'Parameter text atau url wajib diisi' }
    }

    const qrBuffer = await QRCode.toBuffer(text, {
      type: 'png',
      width: 512,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    })

    return { ...credit, status: true, buffer: qrBuffer }
  } catch (error) {
    console.error('[qrgenerator]', error.message)
    return { ...credit, status: false, message: error.message }
  }
}

// === CLI MODE ===
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const text = process.argv[2]
  const outPath = process.argv[3] || path.join(TMP_DIR, `qr-${Date.now()}.png`)

  if (!text) {
    console.error('Pemakaian: node qrgenerator.js <text/url> [output.png]')
    console.error('Contoh  : node qrgenerator.js https://google.com qr.png')
    process.exit(1)
  }

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

  qrgenerator(text)
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