import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'
import { getFfmpegPath } from '../../system/ffmpeg.js'

export const meta = {
  name: 'swgc',
  alias: ['statusgrup', 'upsw'],
  category: 'owner',
  ownerOnly: true,
  onlyGroup: true
}

const tmpPath = (ext = 'bin') => {
  ensureTempDir()
  return path.join(TEMP_DIR, `swgc_${randomBytes(6).toString('hex')}.${ext}`)
}

const cleanup = (p) => {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p) } catch {}
}

function softUnwrap(content) {
  if (!content || typeof content !== 'object') return content
  for (const k of [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage'
  ]) {
    if (content[k]?.message) return softUnwrap(content[k].message)
  }
  return content
}

function findQuoted(event) {
  const msg = event?.message || {}
  const bags = [
    msg.extendedTextMessage?.contextInfo,
    msg.imageMessage?.contextInfo,
    msg.videoMessage?.contextInfo,
    msg.documentMessage?.contextInfo
  ]
  for (const c of bags) {
    if (c?.quotedMessage) {
      return { payload: softUnwrap(c.quotedMessage) }
    }
  }
  return null
}

const toBytes = (v) => {
  if (v == null || v instanceof Uint8Array) return v
  if (typeof v === 'string') return Uint8Array.from(Buffer.from(v, 'base64'))
  if (v?.type === 'Buffer' && Array.isArray(v.data)) return Uint8Array.from(v.data)
  if (typeof v === 'object') {
    const vals = Object.values(v)
    if (vals.length && vals.every((n) => typeof n === 'number')) return Uint8Array.from(vals)
  }
  return v
}

const normalizeMedia = (m) => ({
  ...m,
  mediaKey: toBytes(m.mediaKey),
  fileSha256: toBytes(m.fileSha256),
  fileEncSha256: toBytes(m.fileEncSha256),
  waveform: toBytes(m.waveform)
})

const hasMediaKeys = (m) => !!(m?.mediaKey && m?.directPath)

function baseMedia(m) {
  const out = {
    url: m.url,
    directPath: m.directPath,
    mediaKey: m.mediaKey,
    fileSha256: m.fileSha256,
    fileEncSha256: m.fileEncSha256,
    fileLength: m.fileLength,
    mediaKeyTimestamp: m.mediaKeyTimestamp,
    mimetype: m.mimetype
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

function runCmd(cmd, args) {
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

function fakeWaveform(bars = 64) {
  return Uint8Array.from(
    { length: bars },
    (_, i) => 20 + Math.round(60 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)))
  )
}

async function prepareVoiceNote(file) {
  const ffmpegPath = getFfmpegPath()
  const out = tmpPath('ogg')
  try {
    await runCmd(ffmpegPath, [
      '-v', 'error', '-y', '-i', file, '-vn',
      '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1',
      '-f', 'ogg', out
    ])
    const pcm = await runCmd(ffmpegPath, [
      '-v', 'error', '-i', out, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'
    ])
    return {
      file: out,
      mimetype: 'audio/ogg; codecs=opus',
      waveform: makeWaveform(pcm),
      tmp: out
    }
  } catch (e) {
    await cleanup(out)
    throw e
  }
}

export async function handler(client, { to, event, args }) {
  const found = findQuoted(event)
  if (!found) {
    await client.message.send(to, 'Reply pesan yang mau dijadikan group status.')
    return { ok: false }
  }

  const quoted = found.payload

  const rawArgs = args || []
  const userText = rawArgs.join(' ').trim()

  const mediaKind = ['imageMessage', 'videoMessage', 'audioMessage'].find((k) => quoted[k])

  try {
    if (mediaKind) {
      const orig = quoted[mediaKind]
      const src = normalizeMedia(orig)

      if (!hasMediaKeys(src)) {
        await client.message.send(to, '❌ Media yang di-reply gak punya mediaKey/directPath.')
        return { ok: false }
      }

      // === Download ===
      const ext = mediaKind === 'imageMessage' ? 'jpg'
        : mediaKind === 'videoMessage' ? 'mp4'
        : 'ogg'
      const file = tmpPath(ext)

      try {
        await client.message.downloadToFile({ [mediaKind]: src }, file)
      } catch (e) {
        await client.message.send(to, `❌ Gagal download media: ${e.message}`)
        cleanup(file)
        return { ok: false }
      }

      // === Prepare voice note (kalau audio asli emang ptt/voice note) ===
      // PENTING: ikutin flag ptt ASLI dari pesan yang di-reply, jangan dipaksa true.
      // Kalau dipaksa true buat semua audioMessage, file musik/MP3 biasa (misal
      // hasil .tomp3) bakal diupload dengan type "ptt" (voice note) padahal isinya
      // bukan Opus/OGG — WA nolak muter itu sebagai voice note meski file MP3-nya
      // sendiri valid (makanya bisa diputer normal di luar swgc).
      let prep = null
      const isPtt = !!orig.ptt

      if (mediaKind === 'audioMessage' && isPtt) {
        try {
          prep = await prepareVoiceNote(file)
        } catch (e) {
          console.log('[swgc] ffmpeg gagal:', e.message)
        }

        // Kalau convert ke opus gagal, JANGAN lanjut ngaku-ngaku ptt pakai data
        // mentah yang belum ke-convert — itu bakal upload file salah format
        // dengan label ptt, bikin audio-nya error pas diputer. Mending gagal
        // jelas drpd ngirim pesan yang keliatan "berhasil" tapi gak bisa diputer.
        if (!prep) {
          await client.message.send(to, '❌ Gagal convert voice note ke format Opus. Coba lagi.')
          cleanup(file)
          return { ok: false }
        }
      }

      // === Upload ===
      const uploadType = mediaKind === 'imageMessage' ? 'image'
        : mediaKind === 'videoMessage' ? 'video'
        : (isPtt ? 'ptt' : 'audio')

      const fallbackMime = mediaKind === 'imageMessage' ? 'image/jpeg'
        : mediaKind === 'videoMessage' ? 'video/mp4'
        : (isPtt ? 'audio/ogg; codecs=opus' : 'audio/mpeg')

      let desc
      try {
        desc = await client.message.upload(prep?.file || file, {
          type: uploadType,
          mimetype: prep?.mimetype || src.mimetype || fallbackMime
        })
      } catch (e) {
        await client.message.send(to, `❌ Gagal upload media: ${e.message}`)
        cleanup(file)
        if (prep?.tmp) cleanup(prep.tmp)
        return { ok: false }
      }

      cleanup(file)
      if (prep?.tmp) cleanup(prep.tmp)

      const base = baseMedia(desc)

      // === Build status message ===
      let statusMessage
      if (mediaKind === 'imageMessage') {
        statusMessage = {
          imageMessage: {
            ...base,
            caption: userText || orig.caption || ''
          }
        }
        for (const k of Object.keys(statusMessage.imageMessage)) {
          if (statusMessage.imageMessage[k] === undefined || statusMessage.imageMessage[k] === '') {
            delete statusMessage.imageMessage[k]
          }
        }
      } else if (mediaKind === 'videoMessage') {
        statusMessage = {
          videoMessage: {
            ...base,
            caption: userText || orig.caption || ''
          }
        }
        for (const k of Object.keys(statusMessage.videoMessage)) {
          if (statusMessage.videoMessage[k] === undefined || statusMessage.videoMessage[k] === '') {
            delete statusMessage.videoMessage[k]
          }
        }
      } else {
        statusMessage = {
          audioMessage: {
            ...base,
            ptt: true,
            seconds: orig.seconds,
            waveform: prep?.waveform || (orig.waveform?.length ? toBytes(orig.waveform) : fakeWaveform())
          }
        }
        for (const k of Object.keys(statusMessage.audioMessage)) {
          if (statusMessage.audioMessage[k] === undefined) delete statusMessage.audioMessage[k]
        }
      }

      await client.message.send(to, { groupStatusMessageV2: { message: statusMessage } })
      return { ok: true }
    }

    // === Teks ===
    if (quoted.conversation || quoted.extendedTextMessage?.text) {
      const content = userText || quoted.conversation || quoted.extendedTextMessage.text
      await client.message.send(to, { groupStatusMessageV2: { message: { conversation: content } } })
      return { ok: true }
    }

    const type = Object.keys(quoted).find((k) => k !== 'messageContextInfo') || 'unknown'
    await client.message.send(to, `❌ Tipe pesan gak didukung: ${type}`)
    return { ok: false }
  } catch (err) {
    console.error('[swgc] error:', err)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }
}