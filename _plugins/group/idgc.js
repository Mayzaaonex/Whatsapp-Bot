export const meta = {
  name: 'idgc',
  alias: ['groupid', 'gcid'],
  category: 'group',
  onlyGroup: true
}

export async function handler(client, { to }) {
  await client.message.send(to, `🆔 *ID Grup:*\n\`${to}\``)
  return { ok: true }
}