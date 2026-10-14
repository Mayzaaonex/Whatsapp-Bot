import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import axios from 'axios'
import { TEMP_DIR, ensureTempDir } from './tempDir.js'

/**
 * Download file dari URL ke TEMP_DIR, return path lokalnya.
 * Dipake buat ambil video dari thumbnails.json sebelum diproses sendFotoLive
 * (yang butuh local file path, bukan URL langsung).
 */
export async function downloadToTemp(url, opts = {}) {
  ensureTempDir()
  const ext = opts.ext || path.extname(new URL(url).pathname) || '.mp4'
  const outPath = opts.outputPath || path.join(TEMP_DIR, `dl-${Date.now()}${ext}`)

  const res = await axios.get(url, {
    responseType: 'stream',
    timeout: opts.timeout || 60000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })

  await pipeline(res.data, fs.createWriteStream(outPath))

  const size = fs.statSync(outPath).size
  if (size < 1000) {
    try { fs.unlinkSync(outPath) } catch {}
    throw new Error(`File hasil download kekecilan/gagal: ${size} bytes`)
  }

  return outPath
}