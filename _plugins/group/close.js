import { isUserAdmin } from '../../system/group.js'

export const meta = {
  name: 'close',
  alias: ['tutupgrup', 'closegc'],
  category: 'group',
  onlyGroup: true
}

export async function handler(client, { to, senderJid }) {
  const senderIsAdmin = await isUserAdmin(client, to, senderJid)
  if (!senderIsAdmin) {
    await client.message.send(to, '❌ Cuma admin grup yang bisa pakai command ini.')
    return { ok: false }
  }

  try {
    await client.group.setSetting(to, 'announce', true)
    await client.message.send(to, '🔒 *Grup ditutup!*\nCuma admin yang bisa kirim pesan sekarang.')
    return { ok: true }
  } catch (err) {
    console.error('[close] gagal:', err.message)

    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('403') || msg.includes('not-authorized') || msg.includes('forbidden')) {
      await client.message.send(to, '❌ Bot harus jadi admin grup buat tutup grup.')
    } else {
      await client.message.send(to, `❌ Gagal: ${err.message}`)
    }
    return { ok: false }
  }
}