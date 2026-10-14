import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INDEX_PATH = path.join(__dirname, 'index.js')
const WATCH_DIRS = [
  path.join(__dirname, '_plugins'),
  path.join(__dirname, 'command'),
  path.join(__dirname, 'system')
]
const WATCH_FILES = [
  path.join(__dirname, 'index.js'),
  path.join(__dirname, 'config.json')
]

let child = null
let restarting = false
let restartTimeout = null

function startBot() {
  console.log('\n🚀 Starting bot...')
  child = spawn('node', [INDEX_PATH], {
    stdio: 'inherit',
    cwd: __dirname
  })

  child.on('exit', (code, signal) => {
    if (restarting) return
    console.log(`\n⚠️ Bot exited (code: ${code}, signal: ${signal})`)
    console.log('Restarting in 3 seconds...')
    setTimeout(startBot, 3000)
  })
}

function restartBot(reason = 'file berubah') {
  if (restarting) return
  restarting = true
  console.log(`\n🔄 Restarting bot (${reason})...`)

  if (child) {
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child && !child.killed) child.kill('SIGKILL')
    }, 5000)
  }

  setTimeout(() => {
    restarting = false
    startBot()
  }, 1000)
}

function debouncedRestart(reason) {
  if (restartTimeout) clearTimeout(restartTimeout)
  restartTimeout = setTimeout(() => restartBot(reason), 1500)
}

// Watch files
function watchDir(dir) {
  if (!fs.existsSync(dir)) return
  try {
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      if (filename.endsWith('.js') || filename.endsWith('.cjs') || filename.endsWith('.mjs')) {
        console.log(`\n📝 File changed: ${filename}`)
        debouncedRestart(`file ${filename} berubah`)
      }
    })
    console.log(`👀 Watching: ${path.relative(__dirname, dir)}`)
  } catch (err) {
    console.error(`[watch] gagal watch ${dir}:`, err.message)
  }
}

for (const dir of WATCH_DIRS) watchDir(dir)
for (const file of WATCH_FILES) {
  if (!fs.existsSync(file)) continue
  try {
    fs.watch(file, () => {
      console.log(`\n📝 File changed: ${path.basename(file)}`)
      debouncedRestart(`file ${path.basename(file)} berubah`)
    })
  } catch {}
}

// Handle exit
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...')
  if (child) child.kill('SIGTERM')
  process.exit(0)
})

process.on('SIGTERM', () => {
  if (child) child.kill('SIGTERM')
  process.exit(0)
})

// Listen perintah restart dari index.js (via stdin/exit)
process.on('message', (msg) => {
  if (msg === 'restart') restartBot('diminta owner')
})

// Start
console.log('🤖 Bot Manager — Auto-restart on file change')
console.log('─'.repeat(50))
startBot()