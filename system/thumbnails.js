import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const THUMBNAILS_PATH = path.join(__dirname, '..', 'assets', 'thumbnails.json')

/**
 * Baca assets/thumbnails.json.
 * Format: { "thumbnail 1": "url1", "thumbnail 2": "url2", ... }
 * Tinggal nambah key baru di JSON-nya, nggak perlu ubah kode.
 */
export function loadThumbnails() {
  if (!fs.existsSync(THUMBNAILS_PATH)) return {}
  try {
    const raw = fs.readFileSync(THUMBNAILS_PATH, 'utf8')
    const data = JSON.parse(raw)
    if (data && typeof data === 'object' && !Array.isArray(data)) return data
    return {}
  } catch (err) {
    console.error('[thumbnails] gagal baca/parse thumbnails.json:', err.message)
    return {}
  }
}

/**
 * Ambil satu URL random dari semua entry di thumbnails.json.
 * Return null kalau file kosong/gak ada/gagal baca.
 */
export function getRandomThumbnailUrl() {
  const data = loadThumbnails()
  const urls = Object.values(data).filter((v) => typeof v === 'string' && v.trim())
  if (urls.length === 0) return null
  return urls[Math.floor(Math.random() * urls.length)]
}