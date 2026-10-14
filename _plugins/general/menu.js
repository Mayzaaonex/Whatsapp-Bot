import { sendMenu } from '../../command/menu.js'

export const meta = {
  name: 'menu',
  category: 'general'
}

export async function handler(client, { to, senderJid, senderNumber, event }) {
  const pushName = event.pushName ?? null
  await sendMenu(client, { to, senderJid, senderNumber, pushName })
  return { ok: true }
}