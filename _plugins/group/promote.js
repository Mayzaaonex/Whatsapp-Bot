import { isUserAdmin } from '../../system/group.js'

export const meta = {
  name: 'promote',
  alias: ['jadiadmin', 'adminin'],
  category: 'group',
  onlyGroup: true
}

/**
 * Ambil JID target dari mention atau quoted message.
 */
function resolveTarget(event) {
  const msg = event.message || {}

  // 1. Dari mention
  const mentioned = msg.extendedTextMessage?.contextInfo?.mentionedJid
  if (Array.isArray(mentioned) && mentioned.length > 0) {
    return mentioned[0]
  }

  // 2. Dari quoted message
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage
  if (quoted) {
    const participant = msg.extendedTextMessage?.contextInfo?.participant
    if (participant) return participant
  }

  return null
}

export async function handler(client, { to, event, senderJid }) {
  // Cek admin
  const senderIsAdmin = await isUserAdmin(client, to, senderJid)
  if (!senderIsAdmin) {
    await client.message.send(to, '❌ Cuma admin grup yang bisa pakai command ini.')
    return { ok: false }
  }

  // Ambil target
  const targetJid = resolveTarget(event)
  if (!targetJid) {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Cara pakai:\n` +
      `• Tag user: *.promote @user*\n` +
      `• Reply pesan user: *.promote*`
    )
    return { ok: false }
  }

  // Gak bisa promote diri sendiri
  if (targetJid === senderJid) {
    await client.message.send(to, '❌ Gak bisa promote diri sendiri.')
    return { ok: false }
  }

  // Cek udah admin atau belum
  try {
    const metadata = await client.group.queryGroupMetadata(to)
    const target = metadata.participants.find(
      (x) => x.jid === targetJid || x.lid === targetJid
    )
    if (target?.isAdmin || target?.isSuperAdmin) {
      await client.message.send(to, '❌ User ini udah jadi admin.')
      return { ok: false }
    }
  } catch (err) {
    console.error('[promote] cek metadata gagal:', err.message)
  }

  // Promote
  try {
    const results = await client.group.promoteParticipants(to, [targetJid])
    const r = Array.isArray(results) ? results[0] : null

    if (!r) {
      await client.message.send(to, '❌ Gagal promote.')
      return { ok: false }
    }

    if (r.status === 'ok' || r.code === 200) {
      const tag = targetJid.split('@')[0]
      await client.message.send(
        to,
        `✅ @${tag} sekarang jadi admin grup!`,
        { mentions: [targetJid] }
      )
      return { ok: true }
    }

    await client.message.send(
      to,
      `❌ Gagal promote.\nStatus: ${r.status ?? '-'}\nCode: ${r.code ?? '-'}`
    )
    return { ok: false }
  } catch (err) {
    console.error('[promote] gagal:', err.message)

    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('403') || msg.includes('not-authorized') || msg.includes('forbidden')) {
      await client.message.send(to, '❌ Bot harus jadi admin grup buat promote member.')
    } else {
      await client.message.send(to, `❌ Gagal: ${err.message}`)
    }
    return { ok: false }
  }
}