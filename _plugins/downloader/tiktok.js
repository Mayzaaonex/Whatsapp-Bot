import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const UA = 'Mozilla/5.0 (Linux; Android 11; Termux) AppleWebKit/537.36'

function generateTT() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

function extractData(html) {
  const data = {}
  const vidMatch = html.match(/href="(https:\/\/tikcdn\.io\/ssstik\/\d+[^"]+)"\s+class="[^"]*without_watermark[^"]*vignette_active[^"]*"/)
  if (vidMatch) data.video_tanpa_watermark = vidMatch[1]
  const audMatch = html.match(/href="(https:\/\/tikcdn\.io\/ssstik\/m\/[^"]+)"\s+class="[^"]*music[^"]*"/)
  if (audMatch) data.audio_mp3 = audMatch[1]
  const capMatch = html.match(/<p class="maintext">([^<]+)<\/p>/)
  if (capMatch) data.caption = capMatch[1]
  const authMatch = html.match(/<h2>([^<]+)<\/h2>/)
  if (authMatch) data.author = authMatch[1]
  return data
}

async function fetchTiktok(url) {
  const tt = generateTT()
  const response = await axios.post(
    'https://ssstik.io/abc?url=dl',
    new URLSearchParams({ id: url, locale: 'en', tt }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'HX-Request': 'true',
        'HX-Trigger': '_gcaptcha_pt',
        'HX-Target': 'target',
        'HX-Current-URL': 'https://ssstik.io/en',
        'User-Agent': UA,
        'Referer': 'https://ssstik.io/en'
      },
      timeout: 30000
    }
  )

  const hasil = extractData(response.data)
  if (!hasil.video_tanpa_watermark) {
    throw new Error('Gagal mendapatkan link download')
  }

  return {
    author: hasil.author || 'Unknown',
    caption: hasil.caption || '',
    video_url: hasil.video_tanpa_watermark,
    audio_url: hasil.audio_mp3 || null
  }
}

async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: { 'User-Agent': UA },
    maxContentLength: 100 * 1024 * 1024
  })
  return Buffer.from(res.data)
}

// ====== PLUGIN ======
export const meta = {
  name: 'tiktok',
  alias: ['tt', 'ttdl'],
  category: 'downloader'
}

export async function handler(client, { to, args }) {
  const url = args[0]

  if (!url) {
    await client.message.send(to, 'Kasih URL TikTok: *.tiktok <url>*')
    return { ok: false }
  }

  const ttRegex = /^(https?:\/\/)?(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)\//i
  if (!ttRegex.test(url)) {
    await client.message.send(to, '❌ URL TikTok tidak valid.')
    return { ok: false }
  }

  ensureTempDir()

  let result
  try {
    result = await fetchTiktok(url)
  } catch (err) {
    console.error('[tiktok] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }

  // Download video
  let videoBuffer
  try {
    videoBuffer = await downloadBuffer(result.video_url)
  } catch (err) {
    console.error('[tiktok] download gagal:', err.message)
    await client.message.send(to, `❌ Gagal download video: ${err.message}`)
    return { ok: false }
  }

  const videoPath = path.join(TEMP_DIR, `tiktok-${Date.now()}.mp4`)
  fs.writeFileSync(videoPath, videoBuffer)

  const caption =
    `🎵 *@${result.author}*\n` +
    (result.caption ? `\n${result.caption.slice(0, 500)}` : '')

  try {
    await client.message.send(to, {
      type: 'video',
      media: videoPath,
      mimetype: 'video/mp4',
      caption
    })
  } catch (err) {
    console.error('[tiktok] kirim gagal:', err.message)
    await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
    return { ok: false }
  } finally {
    try { fs.unlinkSync(videoPath) } catch {}
  }

  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const url = process.argv[2]
  if (!url) {
    console.error('Pemakaian: node tiktok.js <url>')
    process.exit(1)
  }

  try {
    const result = await fetchTiktok(url)
    console.log(JSON.stringify({ status: true, result }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, message: err.message }, null, 2))
    process.exit(1)
  }
}