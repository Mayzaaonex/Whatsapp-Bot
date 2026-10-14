import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MENU_CATEGORIES } from './menu.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PLUGINS_DIR = path.join(__dirname, '..', '_plugins')

function getCommandsFromFolder(folder) {
  const dir = path.join(PLUGINS_DIR, folder)
  if (!fs.existsSync(dir)) return []

  return fs.readdirSync(dir)
    .filter((f) => {
      if (f.startsWith('_')) return false
      return f.endsWith('.js') || f.endsWith('.cjs')
    })
    .map((f) => f.replace(/\.(c?js)$/, ''))
    .sort()
}

function formatRuntime(ms) {
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  return `${days}:${hours}:${mins}:${secs}`
}

function wrapReadMore(front, back, repeat = 4001) {
  const hidden = '‎'.repeat(repeat)
  return `${front}\n\n${hidden}\n\n${back}`
}

export function buildAllMenu({ prefix, userIsOwner, startTime, senderJid }) {
  const blocks = []
  let totalCmd = 0

  for (const cat of MENU_CATEGORIES) {
    if (cat.id === 'menu.owner' && !userIsOwner) continue

    const commands = getCommandsFromFolder(cat.folder)
    if (commands.length === 0) continue

    totalCmd += commands.length

    const lines = commands
      .map((cmd) => `│ ${prefix}${cmd}`)
      .join('\n')

    blocks.push(
      `╭─〔 ${cat.label} 〕\n` +
      `${lines}\n` +
      `╰──────────`
    )
  }

  const runtime = formatRuntime(Date.now() - startTime)

  // Tag pakai digit langsung dari senderJid (sama kayak menu.js) biar highlight mention match
  const tag = senderJid ? senderJid.split('@')[0] : null
  const userLine = tag
    ? `│ User: @${tag}\n`
    : `│ User: User\n`

  const header =
    `╭─〔 Whatsapp Bot 〕\n` +
    userLine +
    `│ Runtime: ${runtime}\n` +
    `│ Total Cmd: ${totalCmd}\n` +
    `╰──────────`

  const fullList = blocks.join('\n\n')

  return wrapReadMore(header, fullList)
}

export { formatRuntime, wrapReadMore }