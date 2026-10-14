import { isUserAdmin } from '../../system/group.js'

export const meta = {
  name: 'pin',
  alias: ['sematkan'],
  category: 'group',
  onlyGroup: true
}

// Durasi preset WA
const DURATION_MAP = {
  '24h': 86400,
  '7d': 604800,
  '30d': 2592000
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

export async function handler(client, { to, event, args, senderJid }) {
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
      `Reply pesan yang mau di-pin, terus ketik:\n` +
      `• *.pin* → 24 jam (default)\n` +
      `• *.pin 7d* → 7 hari\n` +
      `• *.pin 30d* → 30 hari`
    )
    return { ok: false }
  }

  // Parse durasi
  const rawDuration = (args[0] || '24h').toLowerCase()
  const durationSecs = DURATION_MAP[rawDuration]

  if (!durationSecs) {
    await client.message.send(
      to,
      `❌ Durasi *${rawDuration}* gak valid.\n\n` +
      `Pilihan: *24h*, *7d*, *30d*`
    )
    return { ok: false }
  }

  // Pin
  try {
    await client.message.send(to, {
      type: 'pin',
      target: targetKey,
      durationSecs
    })

    const durationLabel = rawDuration === '24h' ? '24 jam'
      : rawDuration === '7d' ? '7 hari'
      : '30 hari'

    await client.message.send(to, `📌 Pesan udah di-pin selama *${durationLabel}*.`)
    return { ok: true }
  } catch (err) {
    console.error('[pin] gagal:', err.message)

    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('403') || msg.includes('not-authorized') || msg.includes('forbidden')) {
      await client.message.send(to, '❌ Bot harus jadi admin grup buat pin pesan.')
    } else {
      await client.message.send(to, `❌ Gagal: ${err.message}`)
    }
    return { ok: false }
  }
}