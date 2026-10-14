export const meta = {
  name: 'unmute',
  alias: ['bisuoff', 'unbisukan'],
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
      `• Tag user: *.unmute @user*\n` +
      `• Reply pesan user: *.unmute*`
    )
    return { ok: false }
  }

  if (!config.muted) config.muted = {}
  if (!config.muted[to]) config.muted[to] = []

  if (!config.muted[to].includes(targetJid)) {
    await client.message.send(to, '❌ User ini gak di-mute.')
    return { ok: false }
  }

  config.muted[to] = config.muted[to].filter((x) => x !== targetJid)

  // Kalau array kosong, hapus key grup
  if (config.muted[to].length === 0) {
    delete config.muted[to]
  }

  const saved = saveConfig(config)
  if (!saved) {
    await client.message.send(to, '❌ Gagal simpan config.')
    return { ok: false }
  }

  const tag = targetJid.split('@')[0]
  await client.message.send(
    to,
    `🔊 @${tag} udah di-unmute. Pesannya gak dihapus lagi.`,
    { mentions: [targetJid] }
  )
  return { ok: true }
}