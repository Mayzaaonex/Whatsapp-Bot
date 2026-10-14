import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from 'canvas'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const WASTED_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/random/wasted.jpg'

async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  return res.data
}

export async function generateWasted(imageBuffer) {
  const wastedBuffer = await downloadBuffer(WASTED_URL)

  const image = await loadImage(imageBuffer)
  const wasted = await loadImage(wastedBuffer)

  const imgW = image.width
  const imgH = image.height

  const canvas = createCanvas(imgW, imgH)
  const ctx = canvas.getContext('2d')

  // Gambar asli
  ctx.drawImage(image, 0, 0, imgW, imgH)

  // Grayscale
  const imageData = ctx.getImageData(0, 0, imgW, imgH)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
  }
  ctx.putImageData(imageData, 0, 0)

  // Overlay WASTED — resize 80% lebar
  const wastedW = wasted.width
  const wastedH = wasted.height
  const targetW = Math.floor(imgW * 0.8)
  const targetH = Math.floor(wastedH * (targetW / wastedW))

  // Posisi tengah
  const textX = Math.floor((imgW - targetW) / 2)
  const textY = Math.floor((imgH - targetH) / 2)

  ctx.drawImage(wasted, textX, textY, targetW, targetH)

  return canvas.toBuffer('image/png')
}

// ====== HANDLER ======
export const meta = {
  name: 'wasted',
  category: 'maker'
}

export async function handler(client, { to, event, args }) {
  // Cek media (kirim/reply)
  const msg = event.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

  const hasImage = (m) => m && (m.imageMessage || m.stickerMessage)
  const adaMedia = hasImage(msg) || hasImage(quoted)

  const urlArg = args[0] && /^https?:\/\//.test(args[0]) ? args[0] : null

  if (!adaMedia && !urlArg) {
    await client.message.send(to, 'Kirim/reply gambar dengan caption *.wasted*\nAtau: *.wasted <url-gambar>*')
    return { ok: false }
  }

  ensureTempDir()

  let imageBuffer = null
  let tempInput = null

  if (adaMedia) {
    const downloadSource = hasImage(quoted) ? quoted : msg
    tempInput = path.join(TEMP_DIR, `wasted-in-${Date.now()}.jpg`)

    try {
      await client.message.downloadToFile(downloadSource, tempInput)
      imageBuffer = fs.readFileSync(tempInput)
    } catch (err) {
      console.error('[wasted] download gagal:', err.message)
      await client.message.send(to, `❌ Gagal download: ${err.message}`)
      return { ok: false }
    }
  } else if (urlArg) {
    try {
      imageBuffer = await downloadBuffer(urlArg)
    } catch (err) {
      console.error('[wasted] download URL gagal:', err.message)
      await client.message.send(to, `❌ Gagal download URL: ${err.message}`)
      return { ok: false }
    }
  }

  let pngPath

  try {
    const buffer = await generateWasted(imageBuffer)
    pngPath = path.join(TEMP_DIR, `wasted-${Date.now()}.png`)
    fs.writeFileSync(pngPath, buffer)
  } catch (err) {
    console.error('[wasted] generate gagal:', err.message)
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
    console.error('[wasted] kirim gagal:', err.message)
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
  const url = process.argv[2]
  if (!url) {
    console.error('Pemakaian: node wasted.js <url-gambar>')
    process.exit(1)
  }

  ensureTempDir()

  try {
    const buffer = await downloadBuffer(url)
    const out = await generateWasted(buffer)
    const outPath = path.join(TEMP_DIR, `wasted-cli-${Date.now()}.png`)
    fs.writeFileSync(outPath, out)
    console.log(JSON.stringify({ status: true, saved_to: outPath }))
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}