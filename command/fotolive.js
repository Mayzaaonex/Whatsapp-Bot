import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getFfmpegPath } from '../system/ffmpeg.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')
const TEMP_DIR = path.join(ROOT, 'tmp')

function extractFrame(videoPath, ffmpegPath = getFfmpegPath()) {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

  const outputPath = path.join(TEMP_DIR, `fotolive-${Date.now()}.jpg`)

  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, [
      '-y',
      '-i', videoPath,
      '-ss', '0',
      '-vframes', '1',
      '-q:v', '2',
      outputPath
    ])

    let stderr = ''
    ff.stderr.on('data', (d) => { stderr += d.toString() })

    ff.on('error', (err) => {
      reject(new Error(`Gagal jalanin ffmpeg: ${err.message} (path: ${ffmpegPath})`))
    })
    ff.on('close', (code) => {
      if (code === 0) resolve(outputPath)
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`))
    })
  })
}

function removeFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
}

/**
 * Siapin video (download dari URL / copy dari local path) + extract frame
 * + upload image & video ke WA CDN. Dipake bareng sama sendFotoLive dan
 * sendFotoLiveInteractive biar logicnya gak duplikat.
 */
async function prepareFotoLiveMedia(client, { videoUrl, videoPath: inputPath }) {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

  const videoPath = path.join(TEMP_DIR, `fotolive-vid-${Date.now()}.mp4`)
  let imagePath = null

  try {
    // === 1. Siapin video ===
    if (videoUrl) {
      const vidRes = await fetch(videoUrl)
      if (!vidRes.ok) throw new Error(`fetch video: HTTP ${vidRes.status}`)
      const vidBuffer = Buffer.from(await vidRes.arrayBuffer())
      fs.writeFileSync(videoPath, vidBuffer)
    } else if (inputPath) {
      if (!fs.existsSync(inputPath)) throw new Error(`File gak ada: ${inputPath}`)
      fs.copyFileSync(inputPath, videoPath)
    } else {
      throw new Error('Wajib kasih videoUrl atau videoPath')
    }

    // === 2. Extract frame → image (pake ffmpeg auto-detect dari system/ffmpeg.js) ===
    imagePath = await extractFrame(videoPath)

    // === 3. Upload image ke WA CDN ===
    const imgBuffer = fs.readFileSync(imagePath)
    const imgMedia = await client.message.upload(imgBuffer, {
      type: 'image',
      mimetype: 'image/jpeg'
    })

    // === 4. Upload video ke WA CDN ===
    const vidBuffer2 = fs.readFileSync(videoPath)
    const vidMedia = await client.message.upload(vidBuffer2, {
      type: 'video',
      mimetype: 'video/mp4'
    })

    return { imgMedia, vidMedia }
  } finally {
    removeFile(imagePath)
    removeFile(videoPath)
  }
}

/**
 * Kirim video sebagai "child" yang nempel di belakang pesan parent
 * (image biasa ATAU interactiveMessage), bikin efek foto live.
 */
async function sendFotoLiveChild(client, to, vidMedia, parentKey) {
  await client.message.send(to, {
    videoMessage: {
      ...vidMedia,
      contextInfo: {
        pairedMediaType: 6,
        statusSourceType: 0
      }
    },
    messageContextInfo: {
      messageAssociation: {
        associationType: 12,
        parentMessageKey: parentKey
      }
    }
  })
}

/**
 * Kirim foto live: image (frame video) + video digabung jadi 1 pesan.
 * Support: URL (http/https) ATAU local file path.
 */
export async function sendFotoLive(client, { to, videoUrl, videoPath: inputPath, caption, mentions }) {
  const { imgMedia, vidMedia } = await prepareFotoLiveMedia(client, { videoUrl, videoPath: inputPath })

  // === Kirim image (parent) — INI yang keliatan di chat, caption taro di sini ===
  const first = await client.message.send(
    to,
    {
      imageMessage: {
        ...imgMedia,
        ...(caption ? { caption } : {}),
        contextInfo: {
          pairedMediaType: 5,
          statusSourceType: 0
        }
      }
    },
    mentions ? { mentions } : undefined
  )

  const parentKey = first.key ?? {
    remoteJid: to,
    fromMe: true,
    id: first.id
  }

  // === Kirim video (child, nempel di belakang gambar) dengan association ===
  await sendFotoLiveChild(client, to, vidMedia, parentKey)

  return { ok: true }
}

/**
 * Sama kayak sendFotoLive, tapi parent-nya dikirim sebagai interactiveMessage
 * (ada header foto-live + tombol/single_select), bukan imageMessage polos.
 * Dipake buat .menu yang butuh foto live SEKALIGUS tombol pilih kategori.
 *
 * body     = teks utama (sebelumnya "caption")
 * footer   = teks kecil di bawah (opsional)
 * buttons  = hasil dari buildCategorySelect() / array nativeFlowMessage.buttons
 * mentions = array JID buat di-mention (opsional)
 */
export async function sendFotoLiveInteractive(client, {
  to,
  videoUrl,
  videoPath: inputPath,
  body,
  footer,
  buttons,
  mentions
}) {
  const { imgMedia, vidMedia } = await prepareFotoLiveMedia(client, { videoUrl, videoPath: inputPath })

  const first = await client.message.send(
    to,
    {
      interactiveMessage: {
        header: {
          hasMediaAttachment: true,
          imageMessage: {
            url: imgMedia.url,
            directPath: imgMedia.directPath,
            mediaKey: imgMedia.mediaKey,
            fileSha256: imgMedia.fileSha256,
            fileEncSha256: imgMedia.fileEncSha256,
            fileLength: imgMedia.fileLength,
            mediaKeyTimestamp: imgMedia.mediaKeyTimestamp,
            mimetype: imgMedia.mimetype ?? 'image/jpeg'
          }
        },
        body: { text: body },
        ...(footer ? { footer: { text: footer } } : {}),
        nativeFlowMessage: {
          buttons,
          messageVersion: 1
        }
      }
    },
    mentions ? { mentions } : undefined
  )

  const parentKey = first.key ?? {
    remoteJid: to,
    fromMe: true,
    id: first.id
  }

  await sendFotoLiveChild(client, to, vidMedia, parentKey)

  return { ok: true }
}