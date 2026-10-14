import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = 'https://snaptik.fi'
const ENDPOINT = '/api/tiktok'

const HEADERS = {
  'Content-Type': 'application/json',
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/id/douyin-story-downloader`,
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  'Sec-Ch-Ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?1',
  'Sec-Ch-Ua-Platform': '"Android"'
}

const DOUYIN_REGEX = /^(https?:\/\/)?(www\.)?(douyin\.com|v\.douyin\.com)\//i

async function fetchDouyin(url) {
  const response = await axios.post(
    `${BASE_URL}${ENDPOINT}`,
    { url },
    { headers: HEADERS, timeout: 30000 }
  )

  const data = response.data

  if (!data || data.status !== 'tunnel') {
    throw new Error(`Gagal memproses video. Status: ${data?.status || 'unknown'}`)
  }

  return {
    status: true,
    title: data.title || 'No Title',
    description: data.description || '',
    artist: data.artist || 'Unknown',
    duration: data.duration ? `${Math.floor(data.duration / 1000)}s` : 'N/A',
    cover: data.cover || null,
    audio: data.audio || null,
    download_link: data.download_link || null,
    statistics: data.statistics || {},
    source: data.extract_source || 'web'
  }
}

async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: {
      'User-Agent': HEADERS['User-Agent'],
      'Referer': BASE_URL + '/'
    },
    maxContentLength: 100 * 1024 * 1024 // 100MB max
  })
  return Buffer.from(res.data)
}

// ====== PLUGIN ======
export const meta = {
  name: 'douyin',
  category: 'downloader'
}

export async function handler(client, { to, args }) {
  const url = args[0]

  if (!url) {
    await client.message.send(to, 'Kasih URL Douyin: *.douyin <url>*')
    return { ok: false }
  }

  if (!DOUYIN_REGEX.test(url)) {
    await client.message.send(to, '❌ URL Douyin tidak valid.')
    return { ok: false }
  }

  ensureTempDir()

  let result
  try {
    result = await fetchDouyin(url)
  } catch (err) {
    console.error('[douyin] api gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }

  if (!result.download_link) {
    await client.message.send(to, '❌ Gak dapet link download.')
    return { ok: false }
  }

  // Download video
  let videoBuffer
  try {
    videoBuffer = await downloadBuffer(result.download_link)
  } catch (err) {
    console.error('[douyin] download gagal:', err.message)
    await client.message.send(to, `❌ Gagal download video: ${err.message}`)
    return { ok: false }
  }

  const videoPath = path.join(TEMP_DIR, `douyin-${Date.now()}.mp4`)
  fs.writeFileSync(videoPath, videoBuffer)

  // Caption
  const stats = result.statistics || {}
  const statsLine = [
    stats.digg_count ? `❤️ ${stats.digg_count}` : null,
    stats.comment_count ? `💬 ${stats.comment_count}` : null,
    stats.share_count ? `🔁 ${stats.share_count}` : null,
    stats.play_count ? `▶️ ${stats.play_count}` : null
  ].filter(Boolean).join(' | ')

  const caption =
    `🎬 *${result.title}*\n` +
    `👤 ${result.artist}\n` +
    `⏱️ ${result.duration}\n` +
    (statsLine ? `${statsLine}\n` : '') +
    `📥 ${result.source}`

  try {
    await client.message.send(to, {
      type: 'video',
      media: videoPath,
      mimetype: 'video/mp4',
      caption
    })
  } catch (err) {
    console.error('[douyin] kirim gagal:', err.message)
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
    console.error('Pemakaian: node douyin.js <url>')
    process.exit(1)
  }

  if (!DOUYIN_REGEX.test(url)) {
    console.error('URL Douyin tidak valid')
    process.exit(1)
  }

  try {
    const result = await fetchDouyin(url)
    console.log(JSON.stringify({ status: true, result }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, message: err.message }, null, 2))
    process.exit(1)
  }
}