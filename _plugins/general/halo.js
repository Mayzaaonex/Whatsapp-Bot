export const meta = {
  name: 'halo',
  alias: ['hi'],
  category: 'general'
}

export async function handler(client, { to, prefix }) {
  await client.message.send(to, `Halo juga! Ketik *${prefix}menu* buat liat menu 🙂`)
  return { ok: true }
}