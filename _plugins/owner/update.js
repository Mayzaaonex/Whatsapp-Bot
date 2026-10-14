import fs from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import axios from 'axios'

const execAsync = promisify(exec)

export const meta = {
  name: 'update',
  alias: ['pull', 'gitpull'],
  category: 'owner',
  ownerOnly: true
}

const REPO = 'Mayzaaonex/Whatsapp-Bot'
const BRANCH = 'main'
const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/package.json`

export async function handler(client, { to }) {
  await client.message.send(to, '⏳ Narik update dari GitHub...')

  try {
    // 1. Ambil version remote dulu
    const versionRes = await axios.get(VERSION_URL, { timeout: 15000 })
    const remoteVersion = versionRes.data.version

    // 2. Git pull
    const { stdout, stderr } = await execAsync('git pull origin main', { timeout: 120000 })
    console.log('[update] git pull stdout:', stdout)
    if (stderr) console.log('[update] git pull stderr:', stderr)

    // Cek apakah ada perubahan
    const hasChanges = !stdout.includes('Already up to date') && !stdout.includes('Already up-to-date')

    if (!hasChanges) {
      await client.message.send(
        to,
        `✅ Bot udah versi terbaru (*${remoteVersion}*).\n` +
        `Gak ada yang perlu di-update.`
      )
      return { ok: true }
    }

    // 3. Install dependency baru (kalau ada)
    try {
      await client.message.send(to, '📦 Install dependency baru...')
      await execAsync('npm install', { timeout: 300000 })
    } catch (err) {
      console.error('[update] npm install gagal:', err.message)
    }

    // 4. Kirim pesan sukses
    await client.message.send(
      to,
      `✅ *Bot berhasil di-update ke versi ${remoteVersion}!*\n\n` +
      `🔄 Restart bot buat apply perubahan.\n` +
      `Ketik: *.restart*`
    )

    return { ok: true }
  } catch (err) {
    console.error('[update] gagal:', err.message)
    await client.message.send(to, `❌ Gagal update: ${err.message}`)
    return { ok: false }
  }
}