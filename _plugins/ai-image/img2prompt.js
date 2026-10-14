import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif', '.bmp': 'image/bmp'
  }
  return mimeTypes[ext] || 'image/jpeg'
}

async function generateImg2Prompt(imageBuffer, filename) {
  const base64 = imageBuffer.toString('base64')
  const mimeType = getMimeType(filename)

  const submitRes = await axios.post('https://aiconvert.online/api/submit-prompt-job', {
    imageData: base64,
    mimeType,
    language: 'en',
    promptType: 'concise'
  }, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
      'Referer': 'https://aiconvert.online/prompt-generator'
    },
    timeout: 30000
  })

  const taskId = submitRes.data?.taskId
  if (!taskId) throw new Error(submitRes.data?.message || 'Gagal submit gambar')

  let prompt = null
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const statusRes = await axios.get(`https://aiconvert.online/api/check-status-kv?taskId=${taskId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
        'Referer': 'https://aiconvert.online/prompt-generator'
      },
      timeout: 10000
    })

    if (statusRes.data?.status === 'SUCCESS' && statusRes.data?.result?.generatedPrompt) {
      prompt = statusRes.data.result.generatedPrompt
      break
    }
  }

  if (!prompt) throw new Error('Waktu habis, prompt tidak kunjung selesai')

  return { prompt, taskId }
}

// ====== PLUGIN ======
export const meta = {
  name: 'img2prompt',
  alias: ['i2p'],
  category: 'ai-image'
}

export async function handler(client, { to, event }) {
  const msg = event.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

  const hasImage = (m) => m && m.imageMessage
  const adaMedia = hasImage(msg) || hasImage(quoted)

  if (!adaMedia) {
    await client.message.send(to, 'Kirim/reply gambar dengan caption *.img2prompt*')
    return { ok: false }
  }

  ensureTempDir()

  const downloadSource = hasImage(quoted) ? quoted : msg
  const tempInput = path.join(TEMP_DIR, `img2prompt-in-${Date.now()}.jpg`)

  try {
    await client.message.downloadToFile(downloadSource, tempInput)
  } catch (err) {
    console.error('[img2prompt] download gagal:', err.message)
    await client.message.send(to, `❌ Gagal download: ${err.message}`)
    return { ok: false }
  }

  await client.message.send(to, '⏳ Analyzing gambar, tunggu sebentar...')

  let result
  try {
    const buffer = fs.readFileSync(tempInput)
    result = await generateImg2Prompt(buffer, tempInput)
  } catch (err) {
    console.error('[img2prompt] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    try { fs.unlinkSync(tempInput) } catch {}
    return { ok: false }
  } finally {
    try { fs.unlinkSync(tempInput) } catch {}
  }

  const text =
    `╭─〔 IMAGE TO PROMPT 〕\n` +
    `│ Task ID: ${result.taskId}\n` +
    `│\n` +
    `│ ${result.prompt}\n` +
    `╰──────────`

  await client.message.send(to, text)
  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const imgpath = process.argv[2]
  if (!imgpath || !fs.existsSync(imgpath)) {
    console.error('Pemakaian: node img2prompt.js <imgpath>')
    process.exit(1)
  }

  console.log('Processing...')
  try {
    const buffer = fs.readFileSync(imgpath)
    const result = await generateImg2Prompt(buffer, imgpath)
    console.log(JSON.stringify({ status: true, ...result }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, error: err.message }, null, 2))
    process.exit(1)
  }
}