export const meta = {
  name: 'setauthor',
  category: 'owner',
  ownerOnly: true
}

export async function handler(client, { to, args, prefix, config, saveConfig }) {
  const author = args.join(' ').trim()
  if (!author) {
    await client.message.send(to, `Format: *${prefix}setauthor <nama author>*`)
    return { ok: false }
  }
  if (author.length > 50) {
    await client.message.send(to, 'Author maksimal 50 karakter.')
    return { ok: false }
  }

  config.sticker = { ...config.sticker, author }
  const saved = saveConfig(config)

  if (!saved) {
    await client.message.send(to, 'Gagal menyimpan config.')
    return { ok: false }
  }
  await client.message.send(to, `Author diganti ke: *${author}*`)
  return { ok: true }
}