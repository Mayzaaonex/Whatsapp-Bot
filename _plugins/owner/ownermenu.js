import { render } from '../../command/ownermenu.js'

export const meta = {
  name: 'ownermenu',
  category: 'owner',
  ownerOnly: true
}

export async function handler(client, { to, prefix }) {
  await client.message.send(to, render(prefix))
  return { ok: true }
}