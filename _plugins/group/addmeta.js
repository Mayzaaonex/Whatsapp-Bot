export const meta = {
  name: 'addmeta',
  alias: ['addmetai', 'metai'],
  category: 'group',
  onlyGroup: true
}

const META_AI_JID = '867051314767696@bot'

export async function handler(client, { to }) {
  try {
    console.log('[addmeta] adding', META_AI_JID, 'to', to)

    const results = await client.group.addParticipants(to, [META_AI_JID])
    console.log('[addmeta] results:', JSON.stringify(results))

    const r = Array.isArray(results)
      ? results.find((x) => x.jid === META_AI_JID)
      : null

    if (!r) {
      await client.message.send(to, '❌ Gak ada hasil dari server.')
      return { ok: false }
    }

    if (r.status === 'ok' || r.code === 200) {
      await client.message.send(to, '✅ Sukses add Meta AI ke grup.')
      return { ok: true }
    }

    // Pesan error
    let reason = 'Gagal add Meta AI.'
    if (r.code === 403) reason = 'Meta AI nolak invite atau privacy setting-nya.'
    else if (r.code === 404) reason = 'Meta AI gak kedaftar.'
    else if (r.code === 409) reason = 'Meta AI udah ada di grup.'
    else if (r.code === 408) reason = 'Meta AI udah diundang, belum join.'

    await client.message.send(
      to,
      `❌ ${reason}\n\n` +
      `Status: ${r.status ?? '-'}\n` +
      `Code: ${r.code ?? '-'}`
    )
    return { ok: false }
  } catch (err) {
    console.error('[addmeta] gagal:', err.message)

    const msg = err.message?.toLowerCase() || ''
    if (msg.includes('403') || msg.includes('not-authorized') || msg.includes('forbidden')) {
      await client.message.send(to, '❌ Bot harus jadi admin grup buat add Meta AI.')
    } else {
      await client.message.send(to, `❌ Gagal: ${err.message}`)
    }
    return { ok: false }
  }
}