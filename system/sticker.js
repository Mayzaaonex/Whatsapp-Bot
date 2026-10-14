import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { TEMP_DIR, ensureTempDir } from './tempDir.js'

const CANVAS_SIZE = 512
const PAD = 1
const INNER_SIZE = CANVAS_SIZE - PAD * 2

async function toVP8X(innerBuffer, quality) {
  return sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: innerBuffer, left: PAD, top: PAD }])
    .webp({ quality })
    .toBuffer()
}

async function resize(buffer, transparent) {
  let s = sharp(buffer).resize(INNER_SIZE, INNER_SIZE, {
    fit: 'contain',
    background: transparent
      ? { r: 0, g: 0, b: 0, alpha: 0 }
      : { r: 255, g: 255, b: 255, alpha: 1 }
  })
  if (!transparent) s = s.flatten({ background: { r: 255, g: 255, b: 255 } })
  return s.png().toBuffer()
}

export async function bufferToWebp(buffer, quality = 90) {
  return toVP8X(await resize(buffer, false), quality)
}

export async function bufferToWebpTransparent(buffer, quality = 90) {
  return toVP8X(await resize(buffer, true), quality)
}

/**
 * Gambar (jpg/png/webp) → sticker webp 512x512 transparan.
 */
export async function imageToStickerWebp(inputPath, opts = {}) {
  ensureTempDir()
  const quality = opts.quality ?? 90
  const outputPath =
    opts.outputPath ||
    path.join(TEMP_DIR, `sticker-img-${Date.now()}.webp`)

  const buffer = fs.readFileSync(inputPath)
  const webp = await bufferToWebpTransparent(buffer, quality)
  fs.writeFileSync(outputPath, webp)
  return outputPath
}