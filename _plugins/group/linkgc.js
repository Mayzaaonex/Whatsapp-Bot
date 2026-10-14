export const meta = {
  name: 'linkgc',
  alias: ['linkgrup', 'gclink'],
  category: 'group',
  onlyGroup: true
}

export async function handler(client, { to, senderJid }) {
  try {
    const code = await client.group.queryInviteCode(to)
    if (!code) {
      await client.message.send(to, '❌ Gagal dapet invite link.')
      return { ok: false }
    }

    const link = `https://chat.whatsapp.com/${code}`
    await client.message.send(to, `🔗 *Invite Link:*\n${link}`)
    return { ok: true }
  } catch (err) {
    console.error('[linkgc] gagal:', err.message)

    // Deteksi kalau bot bukan admin
    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('403') || msg.includes('not-authorized') || msg.includes('forbidden')) {
      await client.message.send(to, '❌ Bot harus jadi admin grup buat dapetin invite link.')
    } else {
      await client.message.send(to, `❌ Gagal: ${err.message}`)
    }
    return { ok: false }
  }
}