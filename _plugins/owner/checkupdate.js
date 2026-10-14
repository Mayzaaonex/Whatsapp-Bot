import axios from 'axios'

export const meta = {
  name: 'checkupdate',
  alias: ['cu', 'cekupdate'],
  category: 'owner',
  ownerOnly: true
}

const REPO = 'Mayzaaonex/Whatsapp-Bot'
const BRANCH = 'main'
const LOGS_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/logs.md`
const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/package.json`

function parseLogs(logsText) {
  // Ambil entry setelah komentar, skip ---
  const lines = logsText.split('\n')
  const entries = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#') || trimmed.startsWith('<!--') || trimmed.startsWith('---')) continue

    const match = trimmed.match(/^\{(\d+):(\d+):(\d+):([^}]+)\}\s*(.+)$/)
    if (match) {
      entries.push({
        day: parseInt(match[1]),
        month: parseInt(match[2]),
        year: parseInt(match[3]),
        version: match[4],
        message: match[5],
        raw: trimmed
      })
    }
  }

  return entries
}

export async function handler(client, { to }) {
  try {
    // Ambil logs.md + package.json dari GitHub
    const [logsRes, pkgRes] = await Promise.all([
      axios.get(LOGS_URL, { timeout: 15000 }),
      axios.get(VERSION_URL, { timeout: 15000 })
    ])

    const logsText = logsRes.data
    const remotePkg = pkgRes.data

    const entries = parseLogs(logsText)
    if (!entries.length) {
      await client.message.send(to, '❌ Gak ada entry di logs.md.')
      return { ok: false }
    }

    // Ambil yang paling atas (terbaru)
    const latest = entries[0]

    // Baca version lokal
    const fs = await import('node:fs')
    const localPkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'))

    const isUpToDate = localPkg.version === latest.version

    const text =
      `📋 *Latest Release*\n` +
      `\n` +
      `🏷️ Version: *${latest.version}*\n` +
      `📅 ${latest.day}/${latest.month}/${latest.year}\n` +
      `📝 ${latest.message}\n` +
      `\n` +
      `━━━━━━━━━━━━━━━\n` +
      `📦 *Versi kamu:* ${localPkg.version}\n` +
      `📦 *Versi remote:* ${latest.version}\n` +
      `\n` +
      (isUpToDate
        ? `✅ Bot udah versi terbaru!`
        : `⚠️ Ada update baru! Ketik *.update* buat update.`)

    await client.message.send(to, text)
    return { ok: true }
  } catch (err) {
    console.error('[checkupdate] gagal:', err.message)
    await client.message.send(to, `❌ Gagal cek update: ${err.message}`)
    return { ok: false }
  }
}