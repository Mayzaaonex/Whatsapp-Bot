import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import axios from 'axios'
import { pipeline } from 'node:stream/promises'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'
import { convertToMp3, getFfmpegPath } from '../../system/ffmpeg.js'

export const meta = {
  name: 'tomp3',
  alias: ['tomp3', 'tomp4', 'mp3', 'tovn', 'vn', 'toptt', 'ptt'],
  category: 'tools'
}

// Command yang masuk ke grup "voice note" — dikirim sebagai ptt (Opus/48k),
// sisanya (tomp3/tomp4/mp3) tetep dikirim sebagai audio file biasa (MP3).
const VN_COMMANDS = new Set(['tovn', 'vn', 'toptt', 'ptt'])

function getMediaInfo(message) {
  if (!message) return null
  if (message.videoMessage) return { type: 'video', mime: message.videoMessage.mimetype }
  if (message.audioMessage) return { type: 'audio', mime: message.audioMessage.mimetype }
  if (message.documentMessage) return { type: 'document', mime: message.documentMessage.mimetype }
  return null
}

function extFromMime(mime) {
  if (!mime) return 'bin'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('quicktime')) return 'mov'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mkv')) return 'mkv'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('m4a')) return 'm4a'
  return 'bin'
}

// Deteksi command apa yang sebenernya dipake (tomp3 vs tovn dkk) — handler gak
// dikasih tau langsung oleh index.js, jadi kita parsing ulang teksnya sendiri
// dari event mentah, sama persis caranya kayak index.js milah command.
function detectCmd(event, prefix) {
  const text =
    event?.message?.conversation ??
    event?.message?.extendedTextMessage?.text ??
    event?.message?.imageMessage?.caption ??
    event?.message?.videoMessage?.caption ??
    event?.message?.documentMessage?.caption ??
    ''
  const trimmed = text.trim()
  if (!prefix || !trimmed.startsWith(prefix)) return null
  const withoutPrefix = trimmed.slice(prefix.length).trim()
  const [cmdRaw] = withoutPrefix.split(/\s+/)
  return (cmdRaw || '').toLowerCase()
}

function runCmdCaptureStdout(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args)
    const out = []
    let err = ''
    p.stdout.on('data', (d) => out.push(d))
    p.stderr.on('data', (d) => { err += d })
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out))
      else reject(new Error(err.slice(-200) || `${cmd} exit ${code}`))
    })
  })
}

function makeWaveform(pcm, bars = 64) {
  const samples = Math.floor(pcm.length / 2)
  if (!samples) return null
  const per = Math.max(1, Math.floor(samples / bars))
  const vals = []
  for (let b = 0; b < bars; b++) {
    let sum = 0
    let n = 0
    const end = Math.min((b + 1) * per, samples)
    for (let i = b * per; i < end; i++) {
      sum += Math.abs(pcm.readInt16LE(i * 2))
      n++
    }
    vals.push(n ? sum / n : 0)
  }
  const max = Math.max(...vals, 1)
  return Uint8Array.from(vals.map((v) => Math.round((v / max) * 100)))
}

// Convert APAPUN input (video, audio apa aja, bahkan hasil convert-an sebelumnya)
// ke Opus/OGG 48kHz mono — format yang WAJIB buat voice note (ptt:true) di WA,
// apapun sumbernya. Sama persis pendekatan yang udah kebukti kerja di .swgc:
// convert paksa, jangan ngarep format asalnya udah sesuai.
async function convertToVoiceNote(inputPath) {
  ensureTempDir()
  const ffmpegPath = getFfmpegPath()
  const outPath = path.join(TEMP_DIR, `tovn-${Date.now()}.ogg`)

  await new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, [
      '-y', '-v', 'error', '-i', inputPath, '-vn',
      '-map_metadata', '-1',
      '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', '-compression_level', '10',
      '-application', 'voip', '-frame_duration', '60',
      '-ar', '48000', '-ac', '1',
      '-f', 'ogg', outPath
    ])
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.slice(-300) || `ffmpeg exit ${code}`))
    })
  })

  // PCM 8kHz mono — dipake buat hitung waveform SEKALIGUS durasi (gak perlu ffprobe
  // terpisah: durasi = jumlah sample / sample rate).
  const pcm = await runCmdCaptureStdout(ffmpegPath, [
    '-v', 'error', '-i', outPath, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'
  ])

  const samples = Math.floor(pcm.length / 2)
  const seconds = Math.max(1, Math.round(samples / 8000))

  return {
    file: outPath,
    mimetype: 'audio/ogg; codecs=opus',
    waveform: makeWaveform(pcm),
    seconds,
    tmp: outPath
  }
}

export async function handler(client, { to, event, args, prefix }) {
  ensureTempDir()

  const cmd = detectCmd(event, prefix)
  const isVn = VN_COMMANDS.has(cmd)

  const msg = event.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

  const hasMedia = (m) => m && (m.videoMessage || m.audioMessage || m.documentMessage)

  let inputPath = null
  let cleanupInput = false

  // === Cara 1 & 2: kirim/reply media ===
  if (hasMedia(msg) || hasMedia(quoted)) {
    const targetMessage = hasMedia(quoted) ? quoted : msg
    const downloadSource = hasMedia(quoted) ? quoted : msg

    const mediaInfo = getMediaInfo(targetMessage)
    const ext = extFromMime(mediaInfo.mime)
    inputPath = path.join(TEMP_DIR, `tomp3-in-${Date.now()}.${ext}`)
    cleanupInput = true

    try {
      await client.message.downloadToFile(downloadSource, inputPath)
    } catch (err) {
      console.error('[tomp3] download gagal:', err.message)
      await client.message.send(to, `❌ Gagal download media: ${err.message}`)
      return { ok: false }
    }
  }
  // === Cara 3: URL ===
  else if (args[0] && /^https?:\/\//i.test(args[0])) {
    const url = args[0]
    inputPath = path.join(TEMP_DIR, `tomp3-url-${Date.now()}.bin`)
    cleanupInput = true

    try {
      const res = await axios.get(url, {
        responseType: 'stream',
        timeout: 120000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxContentLength: 200 * 1024 * 1024
      })

      await pipeline(res.data, fs.createWriteStream(inputPath))

      const size = fs.statSync(inputPath).size
      if (size < 1000) throw new Error(`File terlalu kecil: ${size} bytes`)
    } catch (err) {
      console.error('[tomp3] download URL gagal:', err.message)
      await client.message.send(to, `❌ Gagal download: ${err.message}`)
      return { ok: false }
    }
  }
  // === Gak ada media & URL ===
  else {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Cara pakai:\n` +
      `• Kirim video/audio + caption *${prefix}tomp3* (atau *${prefix}tovn*)\n` +
      `• Reply video/audio: *${prefix}tomp3* (atau *${prefix}tovn*)\n` +
      `• *${prefix}tomp3 https://contoh.com/video.mp4*`
    )
    return { ok: false }
  }

  // === Convert ===
  let outPath = null
  let vnResult = null

  try {
    await client.message.send(to, isVn ? '⏳ Convert ke Voice Note...' : '⏳ Convert ke MP3...')
    if (isVn) {
      vnResult = await convertToVoiceNote(inputPath)
      outPath = vnResult.file
    } else {
      outPath = await convertToMp3(inputPath)
    }
  } catch (err) {
    console.error('[tomp3] convert gagal:', err.message)
    await client.message.send(to, `❌ Gagal convert: ${err.message}`)
    if (cleanupInput && inputPath) try { fs.unlinkSync(inputPath) } catch {}
    return { ok: false }
  } finally {
    if (cleanupInput && inputPath) try { fs.unlinkSync(inputPath) } catch {}
  }

  // === Cek hasil ===
  if (!fs.existsSync(outPath)) {
    await client.message.send(to, `❌ File ${isVn ? 'voice note' : 'MP3'} gak ada.`)
    return { ok: false }
  }

  const outSize = fs.statSync(outPath).size
  if (outSize < 1000) {
    try { fs.unlinkSync(outPath) } catch {}
    await client.message.send(to, `❌ File ${isVn ? 'voice note' : 'MP3'} terlalu kecil (${outSize} bytes).`)
    return { ok: false }
  }

  // === Kirim ===
  const buffer = fs.readFileSync(outPath)

  try {
    if (isVn) {
      await client.message.send(to, {
        type: 'audio',
        media: buffer,
        mimetype: vnResult.mimetype,
        ptt: true,
        seconds: vnResult.seconds,
        waveform: vnResult.waveform
      })
    } else {
      await client.message.send(to, {
        type: 'audio',
        media: buffer,
        mimetype: 'audio/mpeg',
        fileName: `tomp3-${Date.now()}.mp3`
      })
    }
  } catch (err) {
    console.error('[tomp3] kirim gagal:', err.message)
    await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
    return { ok: false }
  } finally {
    try { fs.unlinkSync(outPath) } catch {}
  }

  return { ok: true }
}

// ====== CLI MODE ======
import { fileURLToPath } from 'node:url'
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const input = process.argv[2]
  if (!input) {
    console.error('Pemakaian: node tomp3.js <input-path-or-url>')
    process.exit(1)
  }

  ensureTempDir()

  try {
    let inputPath = input

    // Kalau URL, download dulu
    if (/^https?:\/\//i.test(input)) {
      const urlPath = path.join(TEMP_DIR, `tomp3-url-${Date.now()}.bin`)
      const res = await axios.get(input, {
        responseType: 'stream',
        timeout: 120000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      await pipeline(res.data, fs.createWriteStream(urlPath))
      inputPath = urlPath
    }

    const mp3Path = await convertToMp3(inputPath)
    console.log(JSON.stringify({ status: true, saved_to: mp3Path }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, error: err.message }, null, 2))
    process.exit(1)
  }
}