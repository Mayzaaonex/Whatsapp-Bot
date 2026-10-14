export const meta = {
  name: 'mute',
  alias: ['bisukan'],
  category: 'group',
  ownerOnly: true,
  onlyGroup: true
}

/**
 * Ambil JID target dari mention atau quoted message.
 */
function resolveTarget(event) {
  const msg = event.message || {}

  const mentioned = msg.extendedTextMessage?.contextInfo?.mentionedJid
  if (Array.isArray(mentioned) && mentioned.length > 0) {
    return mentioned[0]
  }

  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage
  if (quoted) {
    const participant = msg.extendedTextMessage?.contextInfo?.participant
    if (participant) return participant
  }

  return null
}

export async function handler(client, { to, event, config, saveConfig }) {
  const targetJid = resolveTarget(event)
  if (!targetJid) {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Cara pakai:\n` +
      `• Tag user: *.mute @user*\n` +
      `• Reply pesan user: *.mute*`
    )
    return { ok: false }
  }

  if (!config.muted) config.muted = {}
  if (!config.muted[to]) config.muted[to] = []

  if (config.muted[to].includes(targetJid)) {
    await client.message.send(to, '❌ User ini udah di-mute.')
    return { ok: false }
  }

  config.muted[to].push(targetJid)

  const saved = saveConfig(config)
  if (!saved) {
    await client.message.send(to, '❌ Gagal simpan config.')
    return { ok: false }
  }

  const tag = targetJid.split('@')[0]
  await client.message.send(
    to,
    `🔇 @${tag} udah di-mute. Pesannya bakal auto-hapus.`,
    { mentions: [targetJid] }
  )
  return { ok: true }
}

/**
 * Auto handler — hapus pesan user yang di-mute.
 */
export async function autoHandler(client, { to, event, senderJid, isGroup, config }) {
  if (!isGroup) return false

  const muted = config.muted?.[to]
  if (!Array.isArray(muted) || !muted.includes(senderJid)) return false

  // Hapus pesan
  try {
    await client.message.send(to, { type: 'revoke', target: event })
  } catch (err) {
    console.error('[mute] gagal hapus:', err.message)
  }

  return true // consumed — stop proses command
}