import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INDEX_PATH = path.join(__dirname, 'index.js')

let child = null
let restarting = false

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

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...')
  if (child) child.kill('SIGTERM')
  process.exit(0)
})

process.on('SIGTERM', () => {
  if (child) child.kill('SIGTERM')
  process.exit(0)
})

console.log('🤖 Bot Manager')
console.log('─'.repeat(50))
startBot()