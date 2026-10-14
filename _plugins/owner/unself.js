export const meta = {
  name: 'unself',
  category: 'owner',
  ownerOnly: true,
  onlyGroup: true
}

export async function handler(client, { to, config, saveConfig }) {
  if (!Array.isArray(config.selfGroups)) config.selfGroups = []

  if (!config.selfGroups.includes(to)) {
    await client.message.send(to, 'Grup ini gak dalam mode self.')
    return { ok: false }
  }

  config.selfGroups = config.selfGroups.filter((g) => g !== to)
  const saved = saveConfig(config)

  if (!saved) {
    await client.message.send(to, 'Gagal menyimpan config.')
    return { ok: false }
  }

  await client.message.send(to, 'Bot diaktifin lagi di grup ini.')
  return { ok: true }
}