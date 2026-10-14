import { isUserAdmin } from '../../system/group.js'

export const meta = {
  name: 'leave',
  alias: ['keluar', 'exitgc'],
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
    // Kirim pesan dulu sebelum keluar
    await client.message.send(to, '👋 Bot pamit dulu ya, bye!')

    // Delay dikit biar pesan terkirim
    await new Promise((r) => setTimeout(r, 1000))

    await client.group.leaveGroup([to])
    console.log(`[leave] bot keluar dari grup: ${to}`)
    return { ok: true }
  } catch (err) {
    console.error('[leave] gagal:', err.message)
    await client.message.send(to, `❌ Gagal keluar: ${err.message}`)
    return { ok: false }
  }
}