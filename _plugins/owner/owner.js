import { normalizeOwnerInput } from '../../system/config.js'
import { render as renderOwnerMenu } from '../../command/ownermenu.js'

export const meta = {
  name: 'owner',
  category: 'owner',
  special: true
}

function buildVCard(number) {
  const normalized = normalizeOwnerInput(number)
  return (
    'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    'FN:Bot Owner\n' +
    'ORG:Bot Owner\n' +
    `TEL;type=CELL;type=VOICE;waid=${normalized}:+${normalized}\n` +
    'END:VCARD'
  )
}

export async function handler(client, { to, config, userIsOwner, prefix }) {
  // Owner: kirim menu owner
  if (userIsOwner) {
    await client.message.send(to, renderOwnerMenu(prefix))
    return { ok: true }
  }

  // Non-owner: kirim vCard
  if (!config.owner?.length) {
    await client.message.send(to, 'Belum ada owner yang terdaftar.')
    return { ok: false }
  }

  if (config.owner.length === 1) {
    await client.message.send(to, {
      contactMessage: {
        displayName: 'Bot Owner',
        vcard: buildVCard(config.owner[0])
      }
    })
  } else {
    await client.message.send(to, {
      contactsArrayMessage: {
        displayName: 'Bot Owners',
        contacts: config.owner.map((n) => ({
          displayName: 'Bot Owner',
          vcard: buildVCard(n)
        }))
      }
    })
  }

  return { ok: true }
}