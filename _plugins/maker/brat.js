import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import https from 'node:https'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createCanvas, registerFont } from 'canvas'

import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'
import { imageToStickerWebp } from '../../system/sticker.js'
import { videoToAnimatedWebp, getFfmpegPath, checkFfmpeg } from '../../system/ffmpeg.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..', '..')

// ====== FONT ======
const FONT_PATH = path.join(__dirname, 'arial_narrow.ttf')
const FONT_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/main/fonts/arial_narrow.ttf'
let FONT_FAMILY = 'DejaVu Sans Condensed'

function downloadFont(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlink(dest, () => {})
        return downloadFont(res.headers.location, dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(dest, () => {})
        return reject(new Error(`status ${res.statusCode}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

async function ensureFont() {
  if (!fs.existsSync(FONT_PATH)) {
    try {
      console.log('[brat] Download font...')
      await downloadFont(FONT_URL, FONT_PATH)
    } catch (err) {
      console.log('[brat] Gagal download font:', err.message)
      return
    }
  }
  try {
    registerFont(FONT_PATH, { family: 'arial_narrowregular' })
    FONT_FAMILY = 'arial_narrowregular'
  } catch (err) {
    console.log('[brat] Font error:', err.message)
  }
}

// ====== CANVAS ======
const IMG_SIZE = 512
const PADDING = Math.round(28 * (IMG_SIZE / 640))

function greedyWrap(ctx, words, maxWidth) {
  const lines = []
  let i = 0
  while (i < words.length) {
    let line = [words[i]]
    i++
    while (i < words.length) {
      const test = [...line, words[i]].join(' ')
      if (ctx.measureText(test).width <= maxWidth) {
        line.push(words[i])
        i++
      } else break
    }
    lines.push(line)
  }
  return lines
}

function fitTextToBox(ctx, text, maxWidth, maxHeight) {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return { fontSize: 12, lines: [['...']] }
  const scale = IMG_SIZE / 320
  let low = Math.round(8 * scale)
  let high = Math.round(72 * scale)
  let bestSize = low
  let bestLines = [words]
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    ctx.font = `bold ${mid}px "${FONT_FAMILY}"`
    const lines = greedyWrap(ctx, words, maxWidth)
    const lineHeight = mid * 1.22
    const totalHeight = lines.length * lineHeight
    if (totalHeight <= maxHeight) {
      bestSize = mid
      bestLines = lines
      low = mid + 1
    } else high = mid - 1
  }
  return { fontSize: bestSize, lines: bestLines }
}

function drawJustifiedLine(ctx, words, fontSize, x, y, maxWidth, isLast) {
  const line = words.join(' ')
  if (words.length === 1 || isLast) {
    ctx.fillText(line, x, y)
    return
  }
  const wordWidths = words.map((w) => ctx.measureText(w).width)
  const totalTextW = wordWidths.reduce((a, b) => a + b, 0)
  const gap = (maxWidth - totalTextW) / (words.length - 1)
  let cx = x
  for (let i = 0; i < words.length; i++) {
    ctx.fillText(words[i], cx, y)
    cx += wordWidths[i] + gap
  }
}

function boxBlurHorizontal(data, w, h, radius) {
  const temp = new Uint8ClampedArray(data.length)
  const ws = radius * 2 + 1
  for (let y = 0; y < h; y++) {
    let rS = 0, gS = 0, bS = 0, aS = 0
    const rs = y * w * 4
    for (let i = -radius; i <= radius; i++) {
      const xi = Math.min(w - 1, Math.max(0, i))
      const idx = rs + xi * 4
      rS += data[idx]; gS += data[idx + 1]; bS += data[idx + 2]; aS += data[idx + 3]
    }
    for (let x = 0; x < w; x++) {
      const idx = rs + x * 4
      temp[idx] = rS / ws; temp[idx + 1] = gS / ws; temp[idx + 2] = bS / ws; temp[idx + 3] = aS / ws
      const aX = Math.min(w - 1, x + radius + 1)
      const sX = Math.max(0, x - radius)
      const ai = rs + aX * 4, si = rs + sX * 4
      rS += data[ai] - data[si]; gS += data[ai + 1] - data[si + 1]; bS += data[ai + 2] - data[si + 2]; aS += data[ai + 3] - data[si + 3]
    }
  }
  data.set(temp)
}

function boxBlurVertical(data, w, h, radius) {
  const temp = new Uint8ClampedArray(data.length)
  const ws = radius * 2 + 1
  for (let x = 0; x < w; x++) {
    let rS = 0, gS = 0, bS = 0, aS = 0
    for (let i = -radius; i <= radius; i++) {
      const yi = Math.min(h - 1, Math.max(0, i))
      const idx = (yi * w + x) * 4
      rS += data[idx]; gS += data[idx + 1]; bS += data[idx + 2]; aS += data[idx + 3]
    }
    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * 4
      temp[idx] = rS / ws; temp[idx + 1] = gS / ws; temp[idx + 2] = bS / ws; temp[idx + 3] = aS / ws
      const aY = Math.min(h - 1, y + radius + 1)
      const sY = Math.max(0, y - radius)
      const ai = (aY * w + x) * 4, si = (sY * w + x) * 4
      rS += data[ai] - data[si]; gS += data[ai + 1] - data[si + 1]; bS += data[ai + 2] - data[si + 2]; aS += data[ai + 3] - data[si + 3]
    }
  }
  data.set(temp)
}

function boxBlur(data, w, h, radius) {
  if (radius < 1) return
  for (let pass = 0; pass < 3; pass++) {
    boxBlurHorizontal(data, w, h, radius)
    boxBlurVertical(data, w, h, radius)
  }
}

function applyGrainyBlur(sourceCanvas) {
  const w = sourceCanvas.width
  const h = sourceCanvas.height
  const blurScale = IMG_SIZE / 320
  const radius = Math.round(1.5 * blurScale)
  const blurred = createCanvas(w, h)
  const bctx = blurred.getContext('2d')
  bctx.drawImage(sourceCanvas, 0, 0)
  const imgData = bctx.getImageData(0, 0, w, h)
  boxBlur(imgData.data, w, h, radius)
  bctx.putImageData(imgData, 0, 0)
  return blurred
}

export function generateBratImage(text, withBlur = true) {
  const canvas = createCanvas(IMG_SIZE, IMG_SIZE)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE)
  const boxWidth = IMG_SIZE - PADDING * 2
  const boxHeight = IMG_SIZE - PADDING * 2
  const { fontSize, lines } = fitTextToBox(ctx, text, boxWidth, boxHeight)
  ctx.font = `bold ${fontSize}px "${FONT_FAMILY}"`
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  const lineHeight = fontSize * 1.22
  const startY = PADDING
  lines.forEach((words, i) => {
    const y = startY + i * lineHeight
    const isLast = i === lines.length - 1
    drawJustifiedLine(ctx, words, fontSize, PADDING, y, boxWidth, isLast)
  })
  return withBlur ? applyGrainyBlur(canvas) : canvas
}

// ====== VIDEO ======
function buildIncrementalLines(text) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const stages = []
  for (let i = 1; i <= words.length; i++) stages.push(words.slice(0, i).join(' '))
  return stages.length ? stages : [text]
}

function toFfmpegPath(p) {
  return p.replace(/\\/g, '/')
}

export function generateBratVideo(text, maxDuration = 3) {
  return new Promise((resolve, reject) => {
    try {
      const stages = buildIncrementalLines(text)
      const perFrameDur = Math.max(0.15, maxDuration / stages.length)
      const tmpDir = path.join(os.tmpdir(), `brat-${crypto.randomBytes(6).toString('hex')}`)
      fs.mkdirSync(tmpDir, { recursive: true })
      const framePaths = stages.map((stage, i) => {
        const canvas = generateBratImage(stage, true)
        const framePath = path.join(tmpDir, `frame_${String(i).padStart(3, '0')}.png`)
        fs.writeFileSync(framePath, canvas.toBuffer('image/png'))
        return framePath
      })
      const listPath = path.join(tmpDir, 'list.txt')
      let listContent = ''
      framePaths.forEach((fp) => {
        listContent += `file '${toFfmpegPath(fp)}'\nduration ${perFrameDur}\n`
      })
      listContent += `file '${toFfmpegPath(framePaths[framePaths.length - 1])}'\n`
      fs.writeFileSync(listPath, listContent)
      const outputPath = path.join(tmpDir, 'output.mp4')
      execFile(getFfmpegPath(), [
        '-y', '-f', 'concat', '-safe', '0',
        '-i', listPath,
        '-fps_mode', 'vfr',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=512:512',
        outputPath
      ], (err) => {
        if (err) {
          cleanup(tmpDir)
          return reject(err)
        }
        const buffer = fs.readFileSync(outputPath)
        cleanup(tmpDir)
        resolve(buffer)
      })
    } catch (err) {
      reject(err)
    }
  })
}

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {})
}

// ====== HANDLER ======
async function sendBratSticker(client, to, text, mode) {
  if (!text) {
    await client.message.send(to, `Kasih teks: *.<cmd> <teks>*`)
    return { ok: false }
  }

  ensureTempDir()
  await ensureFont()

  let inputPath
  try {
    if (mode === 'vid') {
      const ffmpegOk = await checkFfmpeg()
      if (!ffmpegOk) {
        await client.message.send(to, '❌ ffmpeg gak ada di sistem.')
        return { ok: false }
      }
      const buffer = await generateBratVideo(text, 3)
      inputPath = path.join(TEMP_DIR, `brat-vid-${Date.now()}.mp4`)
      fs.writeFileSync(inputPath, buffer)
    } else {
      const withBlur = mode !== 'hd'
      const canvas = generateBratImage(text, withBlur)
      const buffer = canvas.toBuffer('image/png')
      inputPath = path.join(TEMP_DIR, `brat-img-${Date.now()}.png`)
      fs.writeFileSync(inputPath, buffer)
    }
  } catch (err) {
    console.error(`[brat:${mode}] generate gagal:`, err.message)
    await client.message.send(to, `❌ Gagal generate: ${err.message}`)
    return { ok: false }
  }

  let stickerPath
  try {
    if (mode === 'vid') {
      stickerPath = await videoToAnimatedWebp(inputPath, { maxDuration: 4 })
    } else {
      stickerPath = await imageToStickerWebp(inputPath)
    }

    await client.message.send(to, {
      type: 'sticker',
      media: stickerPath,
      mimetype: 'image/webp'
    })
  } catch (err) {
    console.error(`[brat:${mode}] convert gagal:`, err.message)
    await client.message.send(to, `❌ Gagal convert: ${err.message}`)
    return { ok: false }
  } finally {
    try { fs.unlinkSync(inputPath) } catch {}
    if (stickerPath) try { fs.unlinkSync(stickerPath) } catch {}
  }

  return { ok: true }
}

async function handlerBrat(client, { to, args }) {
  const text = args.join(' ').trim()
  if (!text) {
    await client.message.send(to, 'Kasih teks: *.brat <teks>*')
    return { ok: false }
  }
  return sendBratSticker(client, to, text, 'normal')
}

async function handlerBratHD(client, { to, args }) {
  const text = args.join(' ').trim()
  if (!text) {
    await client.message.send(to, 'Kasih teks: *.brathd <teks>*')
    return { ok: false }
  }
  return sendBratSticker(client, to, text, 'hd')
}

async function handlerBratVid(client, { to, args }) {
  const text = args.join(' ').trim()
  if (!text) {
    await client.message.send(to, 'Kasih teks: *.bratvid <teks>*')
    return { ok: false }
  }
  return sendBratSticker(client, to, text, 'vid')
}

export const plugins = [
  {
    meta: { name: 'brat', category: 'maker' },
    handler: handlerBrat
  },
  {
    meta: { name: 'brathd', category: 'maker' },
    handler: handlerBratHD
  },
  {
    meta: { name: 'bratvid', category: 'maker' },
    handler: handlerBratVid
  }
]

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const argv = process.argv.slice(2)

  if (!argv.length) {
    console.error('Pemakaian: node brat.js <teks> [--hd|--vid]')
    process.exit(1)
  }

  let mode = 'normal'
  const words = []
  for (const arg of argv) {
    const low = arg.toLowerCase()
    if (low === '--hd') mode = 'hd'
    else if (low === '--vid' || low === '--video' || low === '-v') mode = 'vid'
    else words.push(arg)
  }
  const text = words.join(' ').trim()
  if (!text) {
    console.error('Teks kosong')
    process.exit(1)
  }

  ensureTempDir()
  await ensureFont()

  try {
    let outPath
    if (mode === 'vid') {
      const ok = await checkFfmpeg()
      if (!ok) {
        console.error('ffmpeg gak ada')
        process.exit(1)
      }
      const buffer = await generateBratVideo(text, 3)
      outPath = path.join(TEMP_DIR, `brat-cli-${Date.now()}.mp4`)
      fs.writeFileSync(outPath, buffer)
    } else {
      const withBlur = mode !== 'hd'
      const canvas = generateBratImage(text, withBlur)
      const buffer = canvas.toBuffer('image/png')
      outPath = path.join(TEMP_DIR, `brat-cli-${Date.now()}.png`)
      fs.writeFileSync(outPath, buffer)
    }
    console.log(JSON.stringify({ status: true, saved_to: outPath, mode }))
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}