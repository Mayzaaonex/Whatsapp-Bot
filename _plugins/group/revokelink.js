import { isUserAdmin } from '../../system/group.js'

export const meta = {
  name: 'revokelink',
  alias: ['revoke', 'resetlink'],
  category: 'group',
  onlyGroup: true
}

export async function handler(client, { to, senderJid }) {
  // Cek admin grup
  const senderIsAdmin = await isUserAdmin(client, to, senderJid)
  if (!senderIsAdmin) {
    await client.message.send(to, '❌ Cuma admin grup yang bisa pakai command ini.')
    return { ok: false }
  }

  try {
    const result = await client.group.revokeInvite(to)
    const code = result?.code
    if (!code || typeof code !== 'string') {
      await client.message.send(to, '❌ Gagal dapet link baru.')
      return { ok: false }
    }

    const link = `https://chat.whatsapp.com/${code}`

    await client.message.send(
      to,
      `🔄 *Link grup sudah di-revoke!*\n\n` +
      `Ini link yang sekarang:\n${link}`
    )
    return { ok: true }
  } catch (err) {
    console.error('[revokelink] gagal:', err.message)

    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('403') || msg.includes('not-authorized') || msg.includes('forbidden')) {
      await client.message.send(to, '❌ Bot harus jadi admin grup buat reset invite link.')
    } else {
      await client.message.send(to, `❌ Gagal: ${err.message}`)
    }
    return { ok: false }
  }
}