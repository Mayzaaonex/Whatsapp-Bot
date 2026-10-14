export const meta = {
  name: 'setprefix',
  category: 'owner',
  ownerOnly: true
}

export async function handler(client, { to, args, prefix, config, saveConfig }) {
  const newPrefix = args[0]

  if (!newPrefix) {
    await client.message.send(to, `Format: *${prefix}setprefix <prefix baru>*`)
    return { ok: false }
  }
  if (newPrefix.length > 5) {
    await client.message.send(to, 'Prefix maksimal 5 karakter.')
    return { ok: false }
  }
  if (/\s/.test(newPrefix)) {
    await client.message.send(to, 'Prefix tidak boleh mengandung spasi.')
    return { ok: false }
  }

  config.prefix = newPrefix
  const saved = saveConfig(config)

  if (!saved) {
    await client.message.send(to, 'Gagal menyimpan config.')
    return { ok: false }
  }

  await client.message.send(to, `Prefix berhasil diganti ke: *${newPrefix}*`)
  return { ok: true }
}