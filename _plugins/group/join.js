const JOIN_REGEX = /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i
const JOIN_COOLDOWN = 10000 // 10 detik

// Global cooldown — biar bot gak kena ban WA
let lastJoinAt = 0

export const meta = {
  name: 'join',
  alias: ['joingc', 'masukgc'],
  category: 'group'
  // Gak pakai onlyGroup — bisa di PM + grup
}

export async function handler(client, { to, args }) {
  const input = args[0]

  if (!input) {
    await client.message.send(
      to,
      `❌ *Format salah.*\n\n` +
      `Cara pakai:\n` +
      `• *.join https://chat.whatsapp.com/xxxxx*`
    )
    return { ok: false }
  }

  // Cooldown global (biar bot gak spam join → kena ban WA)
  const now = Date.now()
  const elapsed = now - lastJoinAt
  if (elapsed < JOIN_COOLDOWN) {
    const wait = Math.ceil((JOIN_COOLDOWN - elapsed) / 1000)
    await client.message.send(to, `⏳ Tunggu *${wait} detik* lagi ya sebelum join grup berikutnya.`)
    return { ok: false }
  }

  // Extract code
  const match = input.match(JOIN_REGEX)
  const code = match?.[1]

  if (!code) {
    await client.message.send(
      to,
      `❌ *Link gak valid.*\n\n` +
      `Pastiin format: *.join https://chat.whatsapp.com/xxxxx*`
    )
    return { ok: false }
  }

  // Set cooldown
  lastJoinAt = now

  try {
    const metadata = await client.group.joinGroupViaInvite(code)

    if (!metadata) {
      await client.message.send(to, '❌ Gagal join grup.')
      return { ok: false }
    }

    const groupName = metadata.subject || 'Grup'
    const groupJid = metadata.jid || '(unknown)'

    console.log(`[join] bot join grup: ${groupName} (${groupJid})`)

    await client.message.send(
      to,
      `✅ *Berhasil join!*\n\n` +
      `📛 Nama grup: ${groupName}\n` +
      `🆔 ID: \`${groupJid}\``
    )
    return { ok: true }
  } catch (err) {
    console.error('[join] gagal:', err.message)

    // Reset cooldown kalau gagal, biar user bisa retry cepet
    lastJoinAt = 0

    const msg = err.message?.toLowerCase() || ''
    let reason = `❌ Gagal join: ${err.message}`

    if (msg.includes('expired') || msg.includes('revoked')) {
      reason = '❌ Link expired atau udah di-revoke.'
    } else if (msg.includes('already') || msg.includes('409')) {
      reason = '❌ Bot udah ada di grup ini.'
    } else if (msg.includes('full')) {
      reason = '❌ Grup udah penuh.'
    } else if (msg.includes('invalid') || msg.includes('404')) {
      reason = '❌ Link gak valid.'
    }

    await client.message.send(to, reason)
    return { ok: false }
  }
}