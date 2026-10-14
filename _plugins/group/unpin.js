import { isUserAdmin } from '../../system/group.js'

export const meta = {
  name: 'unpin',
  alias: ['lepaspin'],
  category: 'group',
  onlyGroup: true
}

/**
 * Ambil target key dari quoted message.
 */
function resolveQuotedKey(event) {
  const msg = event.message || {}
  const contextInfo = msg.extendedTextMessage?.contextInfo

  if (!contextInfo?.stanzaId) return null

  const remoteJid = event.key?.remoteJid
  const participant = contextInfo.participant || undefined

  return {
    remoteJid,
    fromMe: false,
    id: contextInfo.stanzaId,
    ...(participant ? { participant } : {})
  }
}

export async function handler(client, { to, event, senderJid }) {
  // Cek admin
  const senderIsAdmin = await isUserAdmin(client, to, senderJid)
  if (!senderIsAdmin) {
    await client.message.send(to, '❌ Cuma admin grup yang bisa pakai command ini.')
    return { ok: false }
  }

  // Ambil target key dari reply
  const targetKey = resolveQuotedKey(event)
  if (!targetKey) {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Reply pesan yang mau di-unpin, terus ketik:\n` +
      `• *.unpin*`
    )
    return { ok: false }
  }

  // Unpin
  try {
    await client.message.send(to, {
      type: 'unpin',
      target: targetKey
    })

    await client.message.send(to, '📌 Pesan udah di-unpin.')
    return { ok: true }
  } catch (err) {
    console.error('[unpin] gagal:', err.message)

    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('403') || msg.includes('not-authorized') || msg.includes('forbidden')) {
      await client.message.send(to, '❌ Bot harus jadi admin grup buat unpin pesan.')
    } else {
      await client.message.send(to, `❌ Gagal: ${err.message}`)
    }
    return { ok: false }
  }
}