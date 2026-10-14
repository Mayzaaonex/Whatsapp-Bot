import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendFotoLiveInteractive } from './fotolive.js'
import { getRandomThumbnailUrl } from '../system/thumbnails.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PLUGINS_DIR = path.join(__dirname, '..', '_plugins')

export const MENU_IMAGE_URL = 'https://mayzaa.netlify.app/api/upload/alya.jpg'

export const MENU_CATEGORIES = [
  { id: 'menu.ai', label: 'AI', folder: 'ai' },
  { id: 'menu.aiimage', label: 'AI-IMAGE', folder: 'ai-image' },
  { id: 'menu.maker', label: 'MAKER', folder: 'maker' },
  { id: 'menu.downloader', label: 'DOWNLOADER', folder: 'downloader' },
  { id: 'menu.stream', label: 'STREAM', folder: 'stream' },
  { id: 'menu.search', label: 'SEARCH', folder: 'search' },
  { id: 'menu.stalker', label: 'STALKER', folder: 'stalker' },
  { id: 'menu.tools', label: 'TOOLS', folder: 'tools' },
  { id: 'menu.random', label: 'RANDOM', folder: 'random' },
  { id: 'menu.uploader', label: 'UPLOADER', folder: 'uploader' },
  { id: 'menu.game', label: 'GAME', folder: 'game' },
  { id: 'menu.group', label: 'GROUP', folder: 'group' },       // ← BARU
  { id: 'menu.berita', label: 'BERITA', folder: 'berita' },
  { id: 'menu.owner', label: 'OWNER', folder: 'owner', ownerOnly: true },
  { id: 'menu.general', label: 'GENERAL', folder: 'general', hide: true }
]

function countCommands(folder) {
  const dir = path.join(PLUGINS_DIR, folder)
  if (!fs.existsSync(dir)) return 0

  const files = fs.readdirSync(dir).filter((f) => {
    if (f.startsWith('_')) return false
    return f.endsWith('.js') || f.endsWith('.cjs')
  })

  return files.length
}

let cachedMedia = null
let cacheExpiry = 0
const CACHE_TTL = 6 * 60 * 60 * 1000

// Fallback gambar statis — dipake kalau foto live gagal / gak ada video di thumbnails.json
async function getMenuMedia(client) {
  if (cachedMedia && Date.now() < cacheExpiry) return cachedMedia
  const res = await fetch(MENU_IMAGE_URL)
  if (!res.ok) throw new Error(`gagal fetch gambar menu: HTTP ${res.status}`)
  const imageBytes = new Uint8Array(await res.arrayBuffer())
  cachedMedia = await client.message.upload(imageBytes, {
    type: 'image',
    mimetype: 'image/jpeg'
  })
  cacheExpiry = Date.now() + CACHE_TTL
  return cachedMedia
}

function buildCategorySelect() {
  const visible = MENU_CATEGORIES
    .filter((c) => !c.hide)
    .sort((a, b) => {
      if (a.ownerOnly && !b.ownerOnly) return 1
      if (!a.ownerOnly && b.ownerOnly) return -1
      return 0
    })

  const sections = [{
    title: 'Kategori Menu',
    rows: visible.map((c) => {
      const count = countCommands(c.folder)
      return {
        id: c.id,
        title: c.label,
        description: `${count} command`
      }
    })
  }]

  return [{
    name: 'single_select',
    buttonParamsJson: JSON.stringify({
      title: 'Pilih Kategori Menu',
      sections
    })
  }]
}

export async function sendMenu(client, { to, senderJid, senderNumber, pushName }) {
  // Tag pakai digit langsung dari senderJid biar highlight mention match (lihat allmenu)
  const tag = senderJid ? senderJid.split('@')[0] : null

  const caption = tag
    ? `Halo @${tag}`
    : `Halo`

  const footer = 'Bot By: https://github.com/Mayzaaonex'
  const buttons = buildCategorySelect()
  const mentions = senderJid ? [senderJid] : []

  // === Coba foto live pake video random dari assets/thumbnails.json ===
  const videoUrl = getRandomThumbnailUrl()

  if (videoUrl) {
    try {
      await sendFotoLiveInteractive(client, {
        to,
        videoUrl,
        body: caption,
        footer,
        buttons,
        mentions
      })
      return
    } catch (err) {
      console.error('[menu] foto live gagal, fallback ke gambar statis:', err.message)
    }
  }

  // === Fallback: gambar statis biasa (behavior lama) ===
  const media = await getMenuMedia(client)

  await client.message.send(
    to,
    {
      interactiveMessage: {
        header: {
          hasMediaAttachment: true,
          imageMessage: {
            url: media.url,
            directPath: media.directPath,
            mediaKey: media.mediaKey,
            fileSha256: media.fileSha256,
            fileEncSha256: media.fileEncSha256,
            fileLength: media.fileLength,
            mediaKeyTimestamp: media.mediaKeyTimestamp,
            mimetype: media.mimetype ?? 'image/jpeg'
          }
        },
        body: { text: caption },
        footer: { text: footer },
        nativeFlowMessage: {
          buttons,
          messageVersion: 1
        }
      }
    },
    { mentions }
  )
}

export function getCategory(categoryId) {
  return MENU_CATEGORIES.find((c) => c.id === categoryId) ?? null
}