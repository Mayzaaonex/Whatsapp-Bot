export const meta = {
  name: 'self',
  category: 'owner',
  ownerOnly: true,
  onlyGroup: true
}

export async function handler(client, { to, config, saveConfig }) {
  if (!Array.isArray(config.selfGroups)) config.selfGroups = []

  if (config.selfGroups.includes(to)) {
    await client.message.send(to, 'Grup ini udah dalam mode self.')
    return { ok: false }
  }

  config.selfGroups.push(to)
  const saved = saveConfig(config)

  if (!saved) {
    await client.message.send(to, 'Gagal menyimpan config.')
    return { ok: false }
  }

  await client.message.send(to, 'Bot dimatiin di grup ini. Cuma owner yang bisa akses.')
  return { ok: true }
}