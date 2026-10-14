import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
const FORMAT = 'mp4'

let cookieJar = ''

function extractVideoId(url) {
  const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)
  return m ? m[1] : null
}

function rand() {
  return Math.random().toString().slice(2)
}

function browserHeaders(extra = {}) {
  const h = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.8',
    'Origin': 'https://ytmp3.mobi',
    'Referer': 'https://ytmp3.mobi/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'sec-ch-ua': '"Chromium";v="154", "Brave";v="154", "Not A(Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-GPC': '1',
    ...extra
  }
  if (cookieJar) h['Cookie'] = cookieJar
  return h
}

async function httpGet(url) {
  const res = await fetch(url, {
    method: 'GET',
    headers: browserHeaders(),
    redirect: 'manual'
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookieJar = setCookie.split(';')[0]
  return res
}

async function run(youtubeUrl) {
  const videoId = extractVideoId(youtubeUrl)
  if (!videoId) throw new Error('Invalid YouTube URL')

  const initRes = await httpGet(`https://a.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=${rand()}`)
  const initData = await initRes.json()
  if (initData.error !== 0 || !initData.convertURL) {
    throw new Error(`Init failed: ${JSON.stringify(initData)}`)
  }

  const convRes = await httpGet(`${initData.convertURL}&v=${videoId}&f=${FORMAT}`)
  const conv = await convRes.json()
  if (conv.error !== 0) throw new Error(`Convert failed: ${JSON.stringify(conv)}`)

  let progress = 0
  let attempts = 0
  while (progress < 3 && attempts < 60) {
    await new Promise((r) => setTimeout(r, 2000))
    attempts++
    const progRes = await httpGet(conv.progressURL)
    const prog = await progRes.json()
    progress = prog.progress ?? 0
  }
  if (progress < 3) throw new Error(`Timeout (progress=${progress})`)

  const redirRes = await httpGet(conv.downloadURL)
  let finalUrl = conv.downloadURL
  if ([301, 302, 303, 307, 308].includes(redirRes.status)) {
    finalUrl = redirRes.headers.get('location')
    if (!finalUrl) throw new Error('No Location header')
  }

  return {
    status: true,
    url: youtubeUrl,
    videoId,
    title: conv.title,
    format: FORMAT,
    downloadUrl: finalUrl
  }
}

async function downloadBuffer(url) {
  const res = await fetch(url, { headers: browserHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}

// ====== PLUGIN ======
export const meta = {
  name: 'ytmp4',
  alias: ['ytv', 'ytvideo'],
  category: 'downloader'
}

export async function handler(client, { to, args }) {
  const url = args[0]

  if (!url) {
    await client.message.send(to, 'Kasih URL YouTube: *.ytmp4 <url>*')
    return { ok: false }
  }

  const ytRegex = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i
  if (!ytRegex.test(url)) {
    await client.message.send(to, '❌ URL YouTube tidak valid.')
    return { ok: false }
  }

  ensureTempDir()

  await client.message.send(to, '⏳ Processing, tunggu sebentar...')

  let result
  try {
    result = await run(url)
  } catch (err) {
    console.error('[ytmp4] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }

  if (!result.downloadUrl) {
    await client.message.send(to, '❌ Gak dapet link download.')
    return { ok: false }
  }

  let videoBuffer
  try {
    videoBuffer = await downloadBuffer(result.downloadUrl)
  } catch (err) {
    console.error('[ytmp4] download gagal:', err.message)
    await client.message.send(to, `❌ Gagal download: ${err.message}`)
    return { ok: false }
  }

  const videoPath = path.join(TEMP_DIR, `ytmp4-${Date.now()}.mp4`)
  fs.writeFileSync(videoPath, videoBuffer)

  try {
    await client.message.send(to, {
      type: 'video',
      media: videoPath,
      mimetype: 'video/mp4',
      caption: `🎬 *${result.title}*`
    })
  } catch (err) {
    console.error('[ytmp4] kirim gagal:', err.message)
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
    console.error('Pemakaian: node ytmp4.js <url>')
    process.exit(1)
  }

  try {
    const result = await run(url)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, error: err.message }, null, 2))
    process.exit(1)
  }
}