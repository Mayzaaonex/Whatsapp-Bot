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

const BRANCH = 'main'

// Baca versi LANGSUNG dari package.json di disk — bukan dari raw.githubusercontent.com
// (itu kena cache CDN, bisa basi beberapa menit abis push baru).
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

// Status code dari `git diff --name-status` → label yang enak dibaca
const STATUS_LABEL = {
  A: '🆕 Ditambah',
  M: '✏️ Diubah',
  D: '🗑️ Dihapus',
  R: '🔀 Dipindah',
  C: '📄 Disalin'
}

function formatChangedFiles(diffOutput) {
  const lines = diffOutput
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (!lines.length) return null

  const entries = lines.map((line) => {
    // format: "M\tpath/to/file.js" (atau "R100\told\tnew" buat rename)
    const parts = line.split('\t')
    const statusChar = parts[0][0] // ambil huruf pertama (R100 -> R)
    const label = STATUS_LABEL[statusChar] || '•'
    const filePath = parts.length > 2 ? `${parts[1]} → ${parts[2]}` : parts[1]
    return `${label} ${filePath}`
  })

  return entries.join('\n')
}

export async function handler(client, { to }) {
  await client.message.send(to, '⏳ Narik update dari GitHub...')

  try {
    // 1. Fetch dulu (gak langsung merge/pull) biar bisa dibandingin & dilist dulu
    await execAsync(`git fetch origin ${BRANCH}`, { timeout: 60000 })

    const { stdout: localHead } = await execAsync('git rev-parse HEAD')
    const { stdout: remoteHead } = await execAsync(`git rev-parse origin/${BRANCH}`)

    if (localHead.trim() === remoteHead.trim()) {
      const versionLabel = readLocalVersion() ?? '(gak kebaca)'
      await client.message.send(
        to,
        `✅ Bot udah versi terbaru (*${versionLabel}*).\n` +
        `Gak ada yang perlu di-update.`
      )
      return { ok: true }
    }

    // 2. List file yang bakal berubah SEBELUM di-reset, biar owner tau apa aja yang diganti
    const { stdout: diffOutput } = await execAsync(
      `git diff --name-status HEAD origin/${BRANCH}`
    )
    const changedList = formatChangedFiles(diffOutput)

    if (changedList) {
      await client.message.send(
        to,
        `📝 *Mengganti file:*\n${changedList}`
      )
    }

    // 3. Reset paksa ke origin/main — ini yang bikin .update selalu konsisten,
    // gak gampang ketolak gara-gara ada perubahan lokal yang belum di-commit
    // (misal file yang dipaste manual tapi belum sempet push.sh). Source of
    // truth buat bot yang auto-update kayak gini harus GitHub, bukan file lokal.
    // Catatan: ini CUMA nimpa file yang di-track git — session/, node_modules/,
    // tmp/ (yang ada di .gitignore) tetep aman gak keikut kehapus/ketimpa.
    await execAsync(`git reset --hard origin/${BRANCH}`, { timeout: 60000 })

    // 4. Install dependency baru (kalau ada)
    try {
      await client.message.send(to, '📦 Install dependency baru...')
      await execAsync('npm install', { timeout: 300000 })
    } catch (err) {
      console.error('[update] npm install gagal:', err.message)
    }

    // 5. Baca ulang versi dari package.json lokal (udah ke-reset ke versi baru)
    const versionLabel = readLocalVersion() ?? '(gak kebaca)'

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