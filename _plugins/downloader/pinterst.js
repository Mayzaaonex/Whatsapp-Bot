import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import FormData from 'form-data'
import { fileURLToPath } from 'node:url'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'

function generateRandomIP() {
  const r = () => Math.floor(Math.random() * 254) + 1
  return `${r()}.${r()}.${r()}.${r()}`
}

async function downloadPinterest(pinUrl) {
  const apiUrl = 'https://pintsave.net/api/fetch-media'
  const randomIp = generateRandomIP()
  const form = new FormData()
  form.append('url', pinUrl)

  const response = await axios.post(apiUrl, form, {
    headers: {
      ...form.getHeaders(),
      'Host': 'pintsave.net',
      'Origin': 'https://pintsave.net',
      'Referer': 'https://pintsave.net/id/download',
      'User-Agent': UA,
      'X-Client-Ipv4': randomIp,
      'X-Forwarded-For': randomIp
    },
    timeout: 30000
  })

  const resData = response.data

  if (!resData || !resData.media) {
    throw new Error('Gagal mendapatkan data media. Pastikan URL Pinterest benar.')
  }

  return {
    status: true,
    ip_used: randomIp,
    title: resData.title || null,
    description: resData.description || null,
    author: resData.creator_username || null,
    statistics: {
      likes: resData.reaction_counts?.likes || 0,
      comments: resData.reaction_counts?.comments || 0
    },
    media: resData.media.map((item) => ({
      url: item.url,
      type: item.type,
      quality: item.quality || null,
      thumbnail: item.thumbnail || null
    }))
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
  name: 'pinterest',
  alias: ['pin', 'pindl'],
  category: 'downloader'
}

export async function handler(client, { to, args }) {
  const url = args[0]

  if (!url) {
    await client.message.send(to, 'Kasih URL Pinterest: *.pinterest <url>*')
    return { ok: false }
  }

  const pinRegex = /^(https?:\/\/)?(www\.)?(pinterest\.com|pin\.it)\//i
  if (!pinRegex.test(url)) {
    await client.message.send(to, '❌ URL Pinterest tidak valid.')
    return { ok: false }
  }

  ensureTempDir()

  let result
  try {
    result = await downloadPinterest(url)
  } catch (err) {
    console.error('[pinterest] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }

  if (!result.media?.length) {
    await client.message.send(to, '❌ Gak ada media.')
    return { ok: false }
  }

  // Caption
  const author = result.author || 'unknown'
  const title = (result.title || '').slice(0, 200)
  const desc = (result.description || '').slice(0, 300)
  const stats = result.statistics || {}
  const statsLine = [
    stats.likes ? `❤️ ${stats.likes}` : null,
    stats.comments ? `💬 ${stats.comments}` : null
  ].filter(Boolean).join(' | ')

  const captionText =
    `📌 *@${author}*\n` +
    (statsLine ? `${statsLine}\n` : '') +
    (title ? `\n${title}` : '') +
    (desc && desc !== title ? `\n\n${desc}` : '')

  let sent = 0
  for (const item of result.media) {
    let buf
    try {
      buf = await downloadBuffer(item.url)
    } catch (err) {
      console.error('[pinterest] download item gagal:', err.message)
      continue
    }

    const isVideo = item.type === 'video'
    const ext = isVideo ? '.mp4' : '.jpg'
    const tempPath = path.join(TEMP_DIR, `pin-${Date.now()}-${sent}${ext}`)
    fs.writeFileSync(tempPath, buf)

    try {
      if (isVideo) {
        await client.message.send(to, {
          type: 'video',
          media: tempPath,
          mimetype: 'video/mp4',
          caption: sent === 0 ? captionText : null
        })
      } else {
        await client.message.send(to, {
          type: 'image',
          media: tempPath,
          mimetype: 'image/jpeg',
          caption: sent === 0 ? captionText : null
        })
      }
      sent++
    } catch (err) {
      console.error('[pinterest] kirim item gagal:', err.message)
    } finally {
      try { fs.unlinkSync(tempPath) } catch {}
    }
  }

  if (sent === 0) {
    await client.message.send(to, '❌ Gak ada media yang berhasil dikirim.')
    return { ok: false }
  }

  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const url = process.argv[2]
  if (!url) {
    console.error('Pemakaian: node pinterest.js <url>')
    process.exit(1)
  }

  try {
    const result = await downloadPinterest(url)
    console.log(JSON.stringify({ status: true, result }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, message: err.message }, null, 2))
    process.exit(1)
  }
}