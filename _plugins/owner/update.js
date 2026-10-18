import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..', '..')
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json')

export const meta = {
  name: 'update',
  alias: ['pull', 'gitpull'],
  category: 'owner',
  ownerOnly: true
}

// Baca versi LANGSUNG dari package.json di disk — jangan dari raw.githubusercontent.com,
// soalnya itu di-cache CDN (Fastly) dan bisa basi beberapa menit abis push baru.
// Setelah git pull, package.json lokal udah pasti akurat (itu file yang beneran
// ke-overwrite sama pull-nya), jadi ini satu-satunya sumber yang bisa dipercaya.
function readLocalVersion() {
  try {
    const raw = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')
    const pkg = JSON.parse(raw)
    return pkg.version || null
  } catch (err) {
    console.error('[update] gagal baca package.json lokal:', err.message)
    return null
  }
}

export async function handler(client, { to }) {
  await client.message.send(to, '⏳ Narik update dari GitHub...')

  try {
    // 1. Git pull dulu — ini yang beneran narik perubahan ke disk
    const { stdout, stderr } = await execAsync('git pull origin main', { timeout: 120000 })
    console.log('[update] git pull stdout:', stdout)
    if (stderr) console.log('[update] git pull stderr:', stderr)

    // Cek apakah ada perubahan
    const hasChanges = !stdout.includes('Already up to date') && !stdout.includes('Already up-to-date')

    // 2. Baru BACA ULANG package.json LOKAL setelah pull — ini versi yang akurat,
    // gak kena cache CDN kayak fetch raw.githubusercontent.com
    const currentVersion = readLocalVersion()
    const versionLabel = currentVersion ?? '(gak kebaca)'

    if (!hasChanges) {
      await client.message.send(
        to,
        `✅ Bot udah versi terbaru (*${versionLabel}*).\n` +
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

    // 4. Kirim pesan sukses — pakai versi hasil baca ulang, bukan hasil fetch sebelum pull
    await client.message.send(
      to,
      `✅ *Bot berhasil di-update ke versi ${versionLabel}!*\n\n` +
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