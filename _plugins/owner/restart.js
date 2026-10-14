import { saveRestartState } from '../../system/restart-state.js'

export const meta = {
  name: 'restart',
  alias: ['reboot', 'r'],
  category: 'owner',
  ownerOnly: true
}

export async function handler(client, { to }) {
  try {
    // 1. Kirim pesan countdown awal
    const sent = await client.message.send(to, '🔄 Restart dalam 5 detik...')
    const messageId = sent?.id || sent?.key?.id

    if (!messageId) {
      await client.message.send(to, '❌ Gagal dapet message ID.')
      return { ok: false }
    }

    // 2. Simpen state restart
    saveRestartState({ to, messageId })

    // Bot JID buat participant (kalau di grup)
    const botJid = client.meJid || client.credentials?.meJid
    const isGroup = to.endsWith('@g.us')

    // 3. Countdown
    for (let i = 5; i >= 1; i--) {
      await new Promise((r) => setTimeout(r, 1000))

      const text = `🔄 Restart dalam ${i} detik...`

      try {
        await client.message.send(to, text, {
          editKey: {
            id: messageId,
            ...(isGroup && botJid ? { participant: botJid } : {})
          }
        })
      } catch (err) {
        console.error('[restart] edit gagal:', err.message)
      }
    }

    // 4. Pesan terakhir
    await new Promise((r) => setTimeout(r, 1000))

    try {
      await client.message.send(to, '🔄 Restarting...', {
        editKey: {
          id: messageId,
          ...(isGroup && botJid ? { participant: botJid } : {})
        }
      })
    } catch (err) {
      console.error('[restart] edit terakhir gagal:', err.message)
    }

    // 5. Delay dikit sebelum exit
    await new Promise((r) => setTimeout(r, 1000))

    console.log('[restart] keluar, main.js bakal restart')
    process.exit(0)
  } catch (err) {
    console.error('[restart] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }
}