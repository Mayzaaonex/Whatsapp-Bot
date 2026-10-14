export const meta = {
  name: 'listgc',
  alias: ['listgroup', 'grouplist'],
  category: 'group',
  ownerOnly: true
  // Gak pakai onlyGroup — bisa di PM
}

export async function handler(client, { to }) {
  try {
    const groups = await client.group.queryAllGroups()

    if (!groups || groups.length === 0) {
      await client.message.send(to, '📋 Bot gak ada di grup manapun.')
      return { ok: true }
    }

    // Sort by nama
    const sorted = [...groups].sort((a, b) =>
      (a.subject || '').localeCompare(b.subject || '')
    )

    let totalMember = 0

    const lines = sorted.map((g, i) => {
      const name = g.subject || '(tanpa nama)'
      const jid = g.jid || '-'
      const memberCount = g.size ?? g.participants?.length ?? 0
      totalMember += memberCount

      return (
        `${i + 1}. *${name}*\n` +
        `   👥 ${memberCount} member\n` +
        `   🆔 \`${jid}\``
      )
    })

    const header =
      `╭─〔 LIST GROUP 〕\n` +
      `│ Total grup: ${sorted.length}\n` +
      `│ Total member: ${totalMember}\n` +
      `╰──────────\n\n`

    const text = header + lines.join('\n\n')

    const MAX = 60000
    if (text.length > MAX) {
      await client.message.send(to, text.slice(0, MAX) + '\n\n...(dipotong)')
    } else {
      await client.message.send(to, text)
    }

    return { ok: true }
  } catch (err) {
    console.error('[listgc] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }
}