import { spawn, execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TEMP_DIR, ensureTempDir } from './tempDir.js'

// ============================================================
// === AUTO-DETECT FFMPEG ===
// ============================================================

const CANDIDATE_PATHS = {
  win32: [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(os.homedir(), 'ffmpeg', 'bin', 'ffmpeg.exe'),
    path.join(os.homedir(), 'scoop', 'shims', 'ffmpeg.exe')
  ],
  linux: [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/snap/bin/ffmpeg',
    '/opt/ffmpeg/bin/ffmpeg',
    '/data/data/com.termux/files/usr/bin/ffmpeg'
  ],
  darwin: [
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/opt/local/bin/ffmpeg'
  ]
}

let _cachedFfmpegPath = null

export function getFfmpegPath() {
  if (_cachedFfmpegPath) return _cachedFfmpegPath

  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    _cachedFfmpegPath = process.env.FFMPEG_PATH
    return _cachedFfmpegPath
  }

  const platform = process.platform
  const candidates = CANDIDATE_PATHS[platform] || CANDIDATE_PATHS.linux

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      _cachedFfmpegPath = p
      return _cachedFfmpegPath
    }
  }

  _cachedFfmpegPath = 'ffmpeg'
  return _cachedFfmpegPath
}

export function checkFfmpeg() {
  return new Promise((resolve) => {
    execFile(getFfmpegPath(), ['-version'], (err) => resolve(!err))
  })
}

// ============================================================
// === AUTO-DETECT FFPROBE ===
// ============================================================

let _cachedFfprobePath = null

export function getFfprobePath() {
  if (_cachedFfprobePath) return _cachedFfprobePath

  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    _cachedFfprobePath = process.env.FFPROBE_PATH
    return _cachedFfprobePath
  }

  // Coba derive dari path ffmpeg kalau itu path lengkap (bukan cuma "ffmpeg")
  const ffmpegPath = getFfmpegPath()
  if (ffmpegPath !== 'ffmpeg') {
    const isExe = /\.exe$/i.test(ffmpegPath)
    const guess = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, isExe ? 'ffprobe.exe' : 'ffprobe')
    if (guess !== ffmpegPath && fs.existsSync(guess)) {
      _cachedFfprobePath = guess
      return _cachedFfprobePath
    }
  }

  _cachedFfprobePath = 'ffprobe'
  return _cachedFfprobePath
}

// ============================================================
// === PROBE: CEK CODEC VIDEO ===
// ============================================================

export function probeVideoCodec(inputPath, opts = {}) {
  const ffprobePath = opts.ffprobePath ?? getFfprobePath()
  return new Promise((resolve) => {
    execFile(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'csv=p=0',
      inputPath
    ], (err, stdout) => {
      if (err) {
        // Kalau ffprobe gagal/gak ada, anggap aja gak tau codecnya — biar tetep lanjut transcode (aman)
        return resolve(null)
      }
      resolve(stdout.trim().toLowerCase() || null)
    })
  })
}

// ============================================================
// === CEK HARDWARE ENCODER YANG BENERAN JALAN ===
// ============================================================

const HW_ENCODERS = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox']

let _cachedWorkingHwEncoder // undefined = belum dicek, null = gak ada yang jalan, string = nama encoder

function tryHwEncoder(ffmpegPath, encoderName) {
  return new Promise((resolve) => {
    const ff = spawn(ffmpegPath, [
      '-y',
      '-f', 'lavfi', '-i', 'color=black:s=64x64:d=0.1',
      '-c:v', encoderName,
      '-frames:v', '1',
      '-f', 'null', '-'
    ])
    let failed = false
    ff.on('error', () => { failed = true })
    ff.on('close', (code) => resolve(!failed && code === 0))
    // Jaga-jaga kalau nyangkut
    setTimeout(() => { try { ff.kill() } catch {} }, 8000)
  })
}

export async function detectWorkingHwEncoder(opts = {}) {
  if (_cachedWorkingHwEncoder !== undefined && !opts.force) return _cachedWorkingHwEncoder

  const ffmpegPath = opts.ffmpegPath ?? getFfmpegPath()

  for (const enc of HW_ENCODERS) {
    const ok = await tryHwEncoder(ffmpegPath, enc)
    if (ok) {
      _cachedWorkingHwEncoder = enc
      return enc
    }
  }

  _cachedWorkingHwEncoder = null
  return null
}

// ============================================================
// === RUN ===
// ============================================================

export function runFfmpeg(args, ffmpegPath = getFfmpegPath()) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, ['-y', ...args])
    let stderr = ''
    ff.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 4000) stderr = stderr.slice(-2000)
    })
    ff.on('error', (err) => {
      reject(new Error(`Gagal jalanin ffmpeg: ${err.message} (path: ${ffmpegPath})`))
    })
    ff.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg keluar dengan kode ${code}\n${stderr.slice(-500)}`))
    })
  })
}

// ============================================================
// === VIDEO → ANIMATED WEBP ===
// ============================================================

export async function videoToAnimatedWebp(inputPath, opts = {}) {
  ensureTempDir()
  const fps = opts.fps ?? 15
  const maxDuration = opts.maxDuration ?? 6
  const ffmpegPath = opts.ffmpegPath ?? getFfmpegPath()
  const outputPath =
    opts.outputPath ||
    path.join(TEMP_DIR, `sticker-vid-${Date.now()}.webp`)

  const filter =
    `fps=${fps},` +
    `scale=512:512:force_original_aspect_ratio=decrease,` +
    `format=rgba,` +
    `pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x000000@0`

  await runFfmpeg([
    '-i', inputPath,
    '-t', String(maxDuration),
    '-vf', filter,
    '-loop', '0',
    '-preset', 'default',
    '-an',
    '-fps_mode', 'vfr',
    '-c:v', 'libwebp',
    '-quality', '75',
    outputPath
  ], ffmpegPath)

  return outputPath
}

// ============================================================
// === AUDIO: M4A → MP3 ===
// ============================================================

export async function convertToMp3(inputPath, opts = {}) {
  ensureTempDir()
  const ffmpegPath = opts.ffmpegPath ?? getFfmpegPath()
  const outputPath =
    opts.outputPath ||
    path.join(TEMP_DIR, `audio-${Date.now()}.mp3`)

  await runFfmpeg([
    '-i', inputPath,
    '-vn',
    '-ar', '44100',
    '-ac', '2',
    '-b:a', '192k',
    '-f', 'mp3',
    outputPath
  ], ffmpegPath)

  return outputPath
}

// ============================================================
// === VIDEO: TRANSCODE → H.264 ===
// ============================================================
//
// Alur baru:
// 1) Cek codec video sumber via ffprobe. Kalau udah h264 (dan bukan dipaksa),
//    SKIP transcode — langsung return file asli (hemat waktu total).
// 2) Kalau bukan h264 (misal av1/vp9/hevc), coba hardware encoder
//    (nvenc/qsv/amf/videotoolbox) dulu — jauh lebih cepat dari software.
// 3) Kalau hardware encoder gak ada / gagal di tengah jalan, fallback
//    otomatis ke software libx264.
//
export async function transcodeToH264(inputPath, opts = {}) {
  ensureTempDir()
  const ffmpegPath = opts.ffmpegPath ?? getFfmpegPath()
  const outputPath =
    opts.outputPath ||
    path.join(TEMP_DIR, `video-h264-${Date.now()}.mp4`)

  // --- 1) Skip kalau udah H.264 ---
  if (!opts.force) {
    const codec = await probeVideoCodec(inputPath, { ffprobePath: opts.ffprobePath })
    if (codec === 'h264') {
      // Udah H.264, gak perlu transcode. Copy aja (atau remux cepat kalau perlu faststart).
      if (opts.skipCopyWhenAlreadyH264) {
        return inputPath
      }
      await runFfmpeg([
        '-i', inputPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath
      ], ffmpegPath)
      return outputPath
    }
  }

  const crf = String(opts.crf ?? 23)
  const preset = opts.preset || 'fast'

  // --- 2) Coba hardware encoder dulu ---
  if (!opts.forceSoftware) {
    const hwEncoder = await detectWorkingHwEncoder({ ffmpegPath })
    if (hwEncoder) {
      try {
        const hwArgs = buildHwArgs(hwEncoder, inputPath, outputPath, opts)
        await runFfmpeg(hwArgs, ffmpegPath)
        return outputPath
      } catch (err) {
        console.error(`[ffmpeg] hardware encoder (${hwEncoder}) gagal, fallback ke software:`, err.message)
        // lanjut ke software fallback di bawah
      }
    }
  }

  // --- 3) Fallback: software libx264 ---
  await runFfmpeg([
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', crf,
    '-profile:v', 'high',
    '-level', '4.1',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], ffmpegPath)

  return outputPath
}

function buildHwArgs(encoderName, inputPath, outputPath, opts) {
  const base = ['-i', inputPath]

  switch (encoderName) {
    case 'h264_nvenc':
      return [
        ...base,
        '-c:v', 'h264_nvenc',
        '-preset', opts.nvencPreset || 'p4', // p1(fastest)..p7(slowest) — p4 seimbang
        '-rc', 'vbr',
        '-cq', String(opts.crf ?? 23),
        '-profile:v', 'high',
        '-level', '4.1',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        outputPath
      ]
    case 'h264_qsv':
      return [
        ...base,
        '-c:v', 'h264_qsv',
        '-preset', opts.qsvPreset || 'fast',
        '-global_quality', String(opts.crf ?? 23),
        '-profile:v', 'high',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        outputPath
      ]
    case 'h264_amf':
      return [
        ...base,
        '-c:v', 'h264_amf',
        '-quality', 'speed',
        '-rc', 'cqp',
        '-qp_i', String(opts.crf ?? 23),
        '-qp_p', String(opts.crf ?? 23),
        '-profile:v', 'high',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        outputPath
      ]
    case 'h264_videotoolbox':
      return [
        ...base,
        '-c:v', 'h264_videotoolbox',
        '-q:v', String(opts.crf ?? 23),
        '-profile:v', 'high',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        outputPath
      ]
    default:
      throw new Error(`Encoder hardware gak dikenal: ${encoderName}`)
  }
}