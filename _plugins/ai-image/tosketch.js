import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import FormData from 'form-data'
import { fileURLToPath } from 'node:url'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE = 'https://artyde.com'
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
const UPLOAD_FIELDS = ['file', 'image', 'img', 'photo', 'source_image', 'upload']

async function toSketch(imageBuffer, filename, mimetype) {
  let uploaded = null

  for (const field of UPLOAD_FIELDS) {
    const form = new FormData()
    form.append(field, imageBuffer, { filename, contentType: mimetype })

    try {
      const result = await axios.post(`${BASE}/upload_photoToSketch_website`, form, {
        headers: {
          ...form.getHeaders(),
          'User-Agent': UA,
          'Origin': BASE,
          'Referer': `${BASE}/photo_to_sketch`
        },
        timeout: 30000
      })

      if (result.data?.status === 'success' && result.data?.file_id) {
        uploaded = result.data
        break
      }
    } catch {}
  }

  if (!uploaded) throw new Error('Upload gagal')

  const fileId = uploaded.file_id
  const outputName = fileId.replace(/\.[^.]+$/, '.png')
  const outputUrl = `${BASE}/output/${outputName}`

  let done = false
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    try {
      const headRes = await axios.head(outputUrl, {
        headers: { 'User-Agent': UA, 'Referer': `${BASE}/` },
        timeout: 10000
      })
      if (headRes.status === 200) {
        done = true
        break
      }
    } catch {}
  }

  if (!done) throw new Error('Timeout menunggu hasil')

  return { outputUrl, fileId }
}

async function downloadImage(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': UA, 'Referer': `${BASE}/` }
  })
  return Buffer.from(res.data)
}

// ====== PLUGIN ======
export const meta = {
  name: 'tosketch',
  category: 'tools'
}

export async function handler(client, { to, event }) {
  const msg = event.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

  const hasImage = (m) => m && m.imageMessage
  const adaMedia = hasImage(msg) || hasImage(quoted)

  if (!adaMedia) {
    await client.message.send(to, 'Kirim/reply gambar dengan caption *.tosketch*')
    return { ok: false }
  }

  ensureTempDir()

  const downloadSource = hasImage(quoted) ? quoted : msg
  const tempInput = path.join(TEMP_DIR, `tosketch-in-${Date.now()}.jpg`)

  try {
    await client.message.downloadToFile(downloadSource, tempInput)
  } catch (err) {
    console.error('[tosketch] download gagal:', err.message)
    await client.message.send(to, `❌ Gagal download: ${err.message}`)
    return { ok: false }
  }

  await client.message.send(to, '⏳ Processing, tunggu sebentar...')

  let result
  try {
    const buffer = fs.readFileSync(tempInput)
    const mimetype = 'image/jpeg'
    result = await toSketch(buffer, 'input.jpg', mimetype)
  } catch (err) {
    console.error('[tosketch] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    try { fs.unlinkSync(tempInput) } catch {}
    return { ok: false }
  } finally {
    try { fs.unlinkSync(tempInput) } catch {}
  }

  // Download hasil
  let outputBuffer
  try {
    outputBuffer = await downloadImage(result.outputUrl)
  } catch (err) {
    console.error('[tosketch] download hasil gagal:', err.message)
    await client.message.send(to, `❌ Gagal download hasil: ${err.message}`)
    return { ok: false }
  }

  const outPath = path.join(TEMP_DIR, `tosketch-out-${Date.now()}.png`)
  fs.writeFileSync(outPath, outputBuffer)

  try {
    await client.message.send(to, {
      type: 'image',
      media: outPath,
      mimetype: 'image/png'
    })
  } catch (err) {
    console.error('[tosketch] kirim gagal:', err.message)
    await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
    return { ok: false }
  } finally {
    try { fs.unlinkSync(outPath) } catch {}
  }

  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const imgpath = process.argv[2]
  if (!imgpath || !fs.existsSync(imgpath)) {
    console.error('Pemakaian: node tosketch.js <imgpath>')
    process.exit(1)
  }

  console.log('Processing...')
  try {
    const buffer = fs.readFileSync(imgpath)
    const result = await toSketch(buffer, path.basename(imgpath), 'image/jpeg')
    console.log(JSON.stringify({ status: true, ...result }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, error: err.message }, null, 2))
    process.exit(1)
  }
}