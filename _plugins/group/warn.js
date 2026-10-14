export const meta = {
  name: 'warn',
  alias: ['peringatan'],
  category: 'group',
  ownerOnly: true,
  onlyGroup: true
}

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

export async function handler(client, { to, event, args, config, saveConfig }) {
  const targetJid = resolveTarget(event)
  if (!targetJid) {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Cara pakai:\n` +
      `• *.warn @user <alasan>*\n` +
      `• Reply pesan user: *.warn <alasan>*`
    )
    return { ok: false }
  }

  // Alasan — ambil dari args, buang mention
  const reason = args
    .filter((a) => !a.startsWith('@'))
    .join(' ')
    .trim() || 'Gak disebutin'

  if (!config.warns) config.warns = {}
  if (!config.warns[to]) config.warns[to] = {}
  if (!config.warns[to][targetJid]) {
    config.warns[to][targetJid] = { count: 0, reasons: [] }
  }

  const userWarn = config.warns[to][targetJid]
  userWarn.count++
  userWarn.reasons.push(reason)

  const saved = saveConfig(config)
  if (!saved) {
    await client.message.send(to, '❌ Gagal simpan config.')
    return { ok: false }
  }

  const tag = targetJid.split('@')[0]

  await client.message.send(
    to,
    `⚠️ @${tag} kena warning *(${userWarn.count}x)*\n` +
    `📝 *Alasan:* ${reason}`,
    { mentions: [targetJid] }
  )
  return { ok: true }
}