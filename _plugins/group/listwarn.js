export const meta = {
  name: 'listwarn',
  alias: ['listwarning', 'warnlist'],
  category: 'group',
  ownerOnly: true,
  onlyGroup: true
}

export async function handler(client, { to, config }) {
  const groupWarns = config.warns?.[to]

  if (!groupWarns || Object.keys(groupWarns).length === 0) {
    await client.message.send(to, '📋 Gak ada user yang kena warning di grup ini.')
    return { ok: true }
  }

  const entries = Object.entries(groupWarns)

  // Sort by count desc
  entries.sort((a, b) => (b[1].count || 0) - (a[1].count || 0))

  let totalCount = 0
  const lines = entries.map(([jid, data], i) => {
    const tag = jid.split('@')[0]
    const count = data.count || 0
    totalCount += count

    const reasons = Array.isArray(data.reasons) ? data.reasons : []
    const lastReason = reasons.length > 0 ? reasons[reasons.length - 1] : 'Gak disebutin'

    return (
      `${i + 1}. @${tag} — *${count}x*\n` +
      `   📝 ${lastReason.slice(0, 100)}`
    )
  })

  const header =
    `╭─〔 LIST WARNING 〕\n` +
    `│ Total user: ${entries.length}\n` +
    `│ Total warn: ${totalCount}\n` +
    `╰──────────\n\n`

  const text = header + lines.join('\n\n')

  // Ambil semua JID buat mentions
  const mentions = entries.map(([jid]) => jid)

  const MAX = 60000
  if (text.length > MAX) {
    await client.message.send(
      to,
      text.slice(0, MAX) + '\n\n...(dipotong)',
      { mentions }
    )
  } else {
    await client.message.send(to, text, { mentions })
  }

  return { ok: true }
}