export const meta = {
  name: 'restart',
  alias: ['reboot', 'r'],
  category: 'owner',
  ownerOnly: true
}

export async function handler(client, { to }) {
  try {
    await client.message.send(to, '🔄 Restarting bot...')

    // Delay dikit biar pesan terkirim
    await new Promise((r) => setTimeout(r, 1500))

    // Kalau dijalanin via main.js (child process), exit aja
    // Nanti main.js bakal auto-restart
    console.log('[restart] keluar, main.js bakal restart')
    process.exit(0)
  } catch (err) {
    console.error('[restart] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }
}