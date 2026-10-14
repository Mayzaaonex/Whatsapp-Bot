import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')
const TMP_DIR = path.join(ROOT, 'tmp')
const RESTART_FILE = path.join(TMP_DIR, 'restart.json')

function ensureTmp() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
}

export function saveRestartState({ to, messageId }) {
  ensureTmp()
  const state = { to, messageId, at: Date.now() }
  fs.writeFileSync(RESTART_FILE, JSON.stringify(state, null, 2))
  console.log('[restart-state] saved:', state)
}

export function loadRestartState() {
  try {
    if (!fs.existsSync(RESTART_FILE)) return null
    const raw = fs.readFileSync(RESTART_FILE, 'utf8')
    const state = JSON.parse(raw)

    // Expired > 10 menit
    if (Date.now() - (state.at || 0) > 10 * 60 * 1000) {
      deleteRestartState()
      return null
    }

    return state
  } catch (err) {
    console.error('[restart-state] gagal baca:', err.message)
    return null
  }
}

export function deleteRestartState() {
  try {
    if (fs.existsSync(RESTART_FILE)) fs.unlinkSync(RESTART_FILE)
    console.log('[restart-state] deleted')
  } catch (err) {
    console.error('[restart-state] gagal hapus:', err.message)
  }
}