export const meta = {
  name: 'resetwarn',
  alias: ['resetwarning', 'hapuswarn'],
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

export async function handler(client, { to, event, config, saveConfig }) {
  const targetJid = resolveTarget(event)
  if (!targetJid) {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Cara pakai:\n` +
      `• Tag user: *.resetwarn @user*\n` +
      `• Reply pesan user: *.resetwarn*`
    )
    return { ok: false }
  }

  const userWarn = config.warns?.[to]?.[targetJid]
  if (!userWarn) {
    await client.message.send(to, '❌ User ini gak punya warning.')
    return { ok: false }
  }

  const count = userWarn.count

  // Hapus user dari warns
  delete config.warns[to][targetJid]

  // Kalau grup kosong, hapus key grup
  if (Object.keys(config.warns[to]).length === 0) {
    delete config.warns[to]
  }

  const saved = saveConfig(config)
  if (!saved) {
    await client.message.send(to, '❌ Gagal simpan config.')
    return { ok: false }
  }

  const tag = targetJid.split('@')[0]
  await client.message.send(
    to,
    `✅ Warning @${tag} udah di-reset.\n_(sebelumnya ${count}x warning)_`,
    { mentions: [targetJid] }
  )
  return { ok: true }
}