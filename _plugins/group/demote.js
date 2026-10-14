import { isUserAdmin } from '../../system/group.js'

export const meta = {
  name: 'demote',
  alias: ['cabutadmin', 'turunin'],
  category: 'group',
  onlyGroup: true
}

/**
 * Ambil JID target dari mention atau quoted message.
 */
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
      `• Tag user: *.demote @user*\n` +
      `• Reply pesan user: *.demote*`
    )
    return { ok: false }
  }

  // Gak bisa demote diri sendiri
  if (targetJid === senderJid) {
    await client.message.send(to, '❌ Gak bisa demote diri sendiri.')
    return { ok: false }
  }

  // Cek target admin atau bukan
  try {
    const metadata = await client.group.queryGroupMetadata(to)
    const target = metadata.participants.find(
      (x) => x.jid === targetJid || x.lid === targetJid
    )

    if (!target?.isAdmin && !target?.isSuperAdmin) {
      await client.message.send(to, '❌ User ini bukan admin.')
      return { ok: false }
    }

    // Gak bisa demote super admin (owner grup)
    if (target?.isSuperAdmin) {
      await client.message.send(to, '❌ Gak bisa demote owner/super admin grup.')
      return { ok: false }
    }
  } catch (err) {
    console.error('[demote] cek metadata gagal:', err.message)
  }

  // Demote
  try {
    const results = await client.group.demoteParticipants(to, [targetJid])
    const r = Array.isArray(results) ? results[0] : null

    if (!r) {
      await client.message.send(to, '❌ Gagal demote.')
      return { ok: false }
    }

    if (r.status === 'ok' || r.code === 200) {
      const tag = targetJid.split('@')[0]
      await client.message.send(
        to,
        `✅ @${tag} sekarang bukan admin lagi.`,
        { mentions: [targetJid] }
      )
      return { ok: true }
    }

    await client.message.send(
      to,
      `❌ Gagal demote.\nStatus: ${r.status ?? '-'}\nCode: ${r.code ?? '-'}`
    )
    return { ok: false }
  } catch (err) {
    console.error('[demote] gagal:', err.message)

    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('403') || msg.includes('not-authorized') || msg.includes('forbidden')) {
      await client.message.send(to, '❌ Bot harus jadi admin grup buat demote admin.')
    } else {
      await client.message.send(to, `❌ Gagal: ${err.message}`)
    }
    return { ok: false }
  }
}