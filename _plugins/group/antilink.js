import { isUserAdmin } from '../../system/group.js'

export const meta = {
  name: 'antilink',
  category: 'group',
  ownerOnly: true,
  onlyGroup: true,
  autoHandler: true,
  handler: true
}

const WA_CHANNEL_REGEX = /https?:\/\/(?:www\.)?whatsapp\.com\/channel\/[^\s]+/i
const WA_GROUP_REGEX = /https?:\/\/chat\.whatsapp\.com\/[^\s]+/i
const ALL_URL_REGEX = /https?:\/\/[^\s]+/i

const MODE_ALIAS = {
  all: 'all',
  ch: 'ch',
  channel: 'ch',
  gb: 'gb',
  grup: 'gb',
  group: 'gb',
  off: 'off'
}

function detectLinks(text) {
  if (!text) return []
  const links = []
  if (WA_CHANNEL_REGEX.test(text)) links.push({ mode: 'ch', label: 'channel WA' })
  if (WA_GROUP_REGEX.test(text)) links.push({ mode: 'gb', label: 'grup WA' })
  if (ALL_URL_REGEX.test(text)) links.push({ mode: 'all', label: 'link' })
  return links
}

/**
 * Handler command .antilink <mode>
 */
export async function handler(client, { to, args, config, saveConfig }) {
  const rawArg = (args[0] || '').toLowerCase()
  const mode = MODE_ALIAS[rawArg]

  if (!rawArg) {
    const current = config.antilink?.[to] ?? 'off'
    await client.message.send(to, `Mode antilink grup ini: *${current}*`)
    return { ok: true }
  }

  if (!mode) {
    await client.message.send(
      to,
      `❌ Mode gak valid.\n\n` +
      `Pilihan:\n` +
      `• *.antilink all* — semua link\n` +
      `• *.antilink ch* — cuma channel WA\n` +
      `• *.antilink gb* — cuma grup WA\n` +
      `• *.antilink off* — matiin`
    )
    return { ok: false }
  }

  if (!config.antilink) config.antilink = {}

  if (mode === 'off') {
    delete config.antilink[to]
  } else {
    config.antilink[to] = mode
  }

  const saved = saveConfig(config)
  if (!saved) {
    await client.message.send(to, '❌ Gagal simpan config.')
    return { ok: false }
  }

  await client.message.send(to, `✅ Mode antilink grup ini di-set ke: *${mode}*`)
  return { ok: true }
}

/**
 * Auto handler — cek link sesuai mode grup.
 */
export async function autoHandler(client, { to, event, senderJid, text, userIsOwner, isGroup, config }) {
  if (!isGroup) return false
  if (userIsOwner) return false

  const mode = config.antilink?.[to]
  if (!mode || mode === 'off') return false

  const links = detectLinks(text)
  if (!links.length) return false

  let matched = null
  if (mode === 'all') {
    matched = links.find((l) => l.mode === 'all') ?? links[0]
  } else if (mode === 'ch') {
    matched = links.find((l) => l.mode === 'ch')
  } else if (mode === 'gb') {
    matched = links.find((l) => l.mode === 'gb')
  }

  if (!matched) return false

  const senderIsAdmin = await isUserAdmin(client, to, senderJid)
  if (senderIsAdmin) return false

  // Tag pakai digit mentah dari senderJid — sama persis pola di allmenu/menu,
  // biar WA resolve ke nama kontak (bukan nampilin digit polos).
  const tag = senderJid ? senderJid.split('@')[0] : null

  try {
    // 1. Hapus pesan user
    await client.message.send(to, {
      type: 'revoke',
      target: event
    })

    // 2. Warning + tag
    const warningText = tag
      ? `@${tag} Oupss si bro ngirim link ${matched.label}`
      : `Oupss si bro ngirim link ${matched.label}`

    await client.message.send(
      to,
      warningText,
      { mentions: senderJid ? [senderJid] : [] }
    )
  } catch (err) {
    console.error('[antilink] gagal:', err.message)
  }

  return true
}