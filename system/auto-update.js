import fs from 'node:fs'
import axios from 'axios'

const REPO = 'Mayzaaonex/Whatsapp-Bot'
const BRANCH = 'main'
const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/package.json`

// Simpen state biar gak spam notif
const NOTIFY_INTERVAL = 24 * 60 * 60 * 1000 // 24 jam
const CHECK_INTERVAL = 5 * 60 * 1000 // 5 menit

let lastNotifiedVersion = null
let lastNotifiedAt = 0

export function startAutoUpdate(client, config) {
  // Cek update tiap 5 menit
  setInterval(async () => {
    try {
      const res = await axios.get(VERSION_URL, { timeout: 15000 })
      const remoteVersion = res.data.version

      const localPkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'))
      const localVersion = localPkg.version

      if (remoteVersion === localVersion) return

      // Ada update
      const now = Date.now()
      const shouldNotify =
        remoteVersion !== lastNotifiedVersion ||
        now - lastNotifiedAt > NOTIFY_INTERVAL

      if (!shouldNotify) return

      // Kirim notif ke owner
      const owners = config.owner || []
      for (const owner of owners) {
        const ownerJid = `${owner}@s.whatsapp.net`
        try {
          await client.message.send(
            ownerJid,
            `🔔 *Update Baru Tersedia!*\n\n` +
            `📦 Versi lokal: ${localVersion}\n` +
            `📦 Versi remote: ${remoteVersion}\n\n` +
            `Ketik *.checkupdate* buat liat changelog.\n` +
            `Ketik *.update* buat update.`
          )
        } catch (err) {
          console.error('[auto-update] gagal kirim notif:', err.message)
        }
      }

      lastNotifiedVersion = remoteVersion
      lastNotifiedAt = now
    } catch (err) {
      // Silent error — biar gak spam log
      if (!err.message.includes('timeout')) {
        console.error('[auto-update] gagal cek:', err.message)
      }
    }
  }, CHECK_INTERVAL)

  console.log('[auto-update] aktif (cek tiap 5 menit)')
}