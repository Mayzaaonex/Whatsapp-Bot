export const meta = {
  name: 'setpack',
  category: 'owner',
  ownerOnly: true
}

export async function handler(client, { to, args, prefix, config, saveConfig }) {
  const pack = args.join(' ').trim()
  if (!pack) {
    await client.message.send(to, `Format: *${prefix}setpack <nama pack>*`)
    return { ok: false }
  }
  if (pack.length > 50) {
    await client.message.send(to, 'Nama pack maksimal 50 karakter.')
    return { ok: false }
  }

  config.sticker = { ...config.sticker, pack }
  const saved = saveConfig(config)

  if (!saved) {
    await client.message.send(to, 'Gagal menyimpan config.')
    return { ok: false }
  }
  await client.message.send(to, `Pack name diganti ke: *${pack}*`)
  return { ok: true }
}