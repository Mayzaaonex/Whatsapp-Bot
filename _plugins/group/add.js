import { isUserAdmin } from '../../system/group.js'
import { normalizeOwnerInput } from '../../system/config.js'

export const meta = {
  name: 'add',
  alias: ['tambah', 'addmember'],
  category: 'group',
  onlyGroup: true
}

export async function handler(client, { to, args, senderJid }) {
  // Cek admin
  const senderIsAdmin = await isUserAdmin(client, to, senderJid)
  if (!senderIsAdmin) {
    await client.message.send(to, '❌ Cuma admin grup yang bisa pakai command ini.')
    return { ok: false }
  }

  // Ambil nomor dari args
  const input = args[0]
  if (!input) {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Cara pakai:\n` +
      `• *.add 6281234567890*\n` +
      `• *.add 081234567890*\n` +
      `• *.add +6281234567890*`
    )
    return { ok: false }
  }

  // Normalize nomor
  const number = normalizeOwnerInput(input)
  if (!number || number.length < 10 || number.length > 15) {
    await client.message.send(to, '❌ Nomor gak valid.')
    return { ok: false }
  }

  const targetJid = `${number}@s.whatsapp.net`

  // Cek udah di grup atau belum
  try {
    const metadata = await client.group.queryGroupMetadata(to)
    const existing = metadata.participants.find(
      (x) => x.jid === targetJid || x.phoneNumber === number
    )
    if (existing) {
      await client.message.send(to, `❌ @${number} udah ada di grup.`)
      return { ok: false }
    }
  } catch (err) {
    console.error('[add] cek metadata gagal:', err.message)
  }

  // Add
  try {
    const results = await client.group.addParticipants(to, [targetJid])
    const r = Array.isArray(results) ? results[0] : null

    if (!r) {
      await client.message.send(to, '❌ Gagal add member.')
      return { ok: false }
    }

    if (r.status === 'ok' || r.code === 200) {
      await client.message.send(to, `✅ @${number} berhasil ditambahin ke grup.`)
      return { ok: true }
    }

    // Pesan error berdasarkan code
    let reason = 'Gagal add member.'
    if (r.code === 403) reason = 'User nolak invite atau privacy setting-nya ngeblokir.'
    else if (r.code === 404) reason = 'Nomor gak kedaftar di WhatsApp.'
    else if (r.code === 409) reason = 'User udah ada di grup.'
    else if (r.code === 408) reason = 'User udah diundang tapi belum join.'

    await client.message.send(
      to,
      `❌ ${reason}\nStatus: ${r.status ?? '-'}\nCode: ${r.code ?? '-'}`
    )
    return { ok: false }
  } catch (err) {
    console.error('[add] gagal:', err.message)

    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('403') || msg.includes('not-authorized') || msg.includes('forbidden')) {
      await client.message.send(to, '❌ Bot harus jadi admin grup buat add member.')
    } else {
      await client.message.send(to, `❌ Gagal: ${err.message}`)
    }
    return { ok: false }
  }
}