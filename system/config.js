import fs from 'node:fs'

const CONFIG_PATH = './config.json'

const DEFAULT_CONFIG = {
  owner: [],
  prefix: '.',
  sticker: {
    pack: 'Bot Sticker',
    author: '@bot'
  },
  selfGroups: [],
  antilink: {},
  muted: {}
}

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      owner: Array.isArray(parsed.owner) ? parsed.owner : [],
      prefix: typeof parsed.prefix === 'string' && parsed.prefix.length > 0
        ? parsed.prefix
        : '.',
      sticker: {
        pack: parsed.sticker?.pack ?? DEFAULT_CONFIG.sticker.pack,
        author: parsed.sticker?.author ?? DEFAULT_CONFIG.sticker.author
      },
      selfGroups: Array.isArray(parsed.selfGroups) ? parsed.selfGroups : [],
      antilink: (parsed.antilink && typeof parsed.antilink === 'object') ? parsed.antilink : {},
      muted: (parsed.muted && typeof parsed.muted === 'object') ? parsed.muted : {}
    }
  } catch (err) {
    console.error('[config] gagal baca, pakai default:', err)
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  }
}

export function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
    return true
  } catch (err) {
    console.error('[config] gagal simpan:', err)
    return false
  }
}

function normalizeNumber(n) {
  if (!n) return ''
  let s = String(n).replace(/[^0-9]/g, '')
  if (s.startsWith('0')) s = '62' + s.slice(1)
  return s
}

export function isOwner(config, senderNumber) {
  if (!senderNumber || !config.owner?.length) return false
  const target = normalizeNumber(senderNumber)
  return config.owner.some((o) => normalizeNumber(o) === target)
}

export function normalizeOwnerInput(n) {
  return normalizeNumber(n)
}