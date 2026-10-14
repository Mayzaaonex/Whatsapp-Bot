import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

export const meta = {
  name: 'ping',
  category: 'general'
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const parts = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

function getCpuUsage() {
  const cpus = os.cpus()
  let totalIdle = 0
  let totalTick = 0

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type]
    }
    totalIdle += cpu.times.idle
  }

  return { idle: totalIdle / cpus.length, total: totalTick / cpus.length }
}

function getCpuPercent() {
  return new Promise((resolve) => {
    const start = getCpuUsage()
    setTimeout(() => {
      const end = getCpuUsage()
      const idleDiff = end.idle - start.idle
      const totalDiff = end.total - start.total
      const usage = 100 - Math.floor((100 * idleDiff) / totalDiff)
      resolve(usage)
    }, 200)
  })
}

function getRamUsage() {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  const percent = Math.round((used / total) * 100)
  return { total, used, free, percent }
}

function getStorageUsage() {
  try {
    let cmd
    if (process.platform === 'win32') {
      cmd = 'wmic logicaldisk get size,freespace,caption'
    } else {
      cmd = 'df -k /'
    }

    const output = execSync(cmd, { encoding: 'utf8', timeout: 5000 })

    if (process.platform === 'win32') {
      const lines = output.split('\n').filter((l) => l.trim() && !l.includes('Caption'))
      let totalSize = 0
      let totalFree = 0
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 3) continue
        const free = parseInt(parts[0])
        const size = parseInt(parts[1])
        if (!isNaN(free) && !isNaN(size)) {
          totalSize += size
          totalFree += free
        }
      }
      const used = totalSize - totalFree
      return {
        total: totalSize,
        used,
        free: totalFree,
        percent: totalSize > 0 ? Math.round((used / totalSize) * 100) : 0
      }
    } else {
      const lines = output.split('\n').filter((l) => l.trim())
      if (lines.length < 2) throw new Error('df output kosong')
      const parts = lines[1].trim().split(/\s+/)
      const total = parseInt(parts[1]) * 1024
      const used = parseInt(parts[2]) * 1024
      const free = parseInt(parts[3]) * 1024
      return { total, used, free, percent: Math.round((used / total) * 100) }
    }
  } catch (err) {
    return { total: 0, used: 0, free: 0, percent: 0, error: err.message }
  }
}

function getPlatform() {
  const p = process.platform
  const isTermux = !!process.env.PREFIX && process.env.PREFIX.includes('com.termux')
  const isPterodactyl = !!process.env.PTERODACTYL || fs.existsSync('/.dockerenv')

  if (isTermux) return 'Termux (Android)'
  if (isPterodactyl) return 'Pterodactyl (Docker)'
  if (p === 'win32') return 'Windows'
  if (p === 'linux') return 'Linux'
  if (p === 'darwin') return 'macOS'
  return p
}

export async function handler(client, { to, event }) {
  // === Latency test ===
  const startTime = Date.now()
  const pingMsg = await client.message.send(to, '🏓 Pinging...')
  const latency = Date.now() - startTime

  // === Specs ===
  const cpuPercent = await getCpuPercent()
  const ram = getRamUsage()
  const storage = getStorageUsage()
  const cpus = os.cpus()
  const platform = getPlatform()
  const uptime = os.uptime()
  const processUptime = process.uptime()

  const text =
    `🏓 *Pong!*\n\n` +
    `╭─〔 SERVER INFO 〕\n` +
    `│ Platform: ${platform}\n` +
    `│ CPU: ${cpus[0]?.model ?? 'Unknown'}\n` +
    `│ Cores: ${cpus.length}\n` +
    `│ CPU Usage: ${cpuPercent}%\n` +
    `│ RAM: ${formatBytes(ram.used)} / ${formatBytes(ram.total)} (${ram.percent}%)\n` +
    `│ Storage: ${formatBytes(storage.used)} / ${formatBytes(storage.total)} (${storage.percent}%)\n` +
    `│ OS Uptime: ${formatUptime(uptime)}\n` +
    `│ Bot Uptime: ${formatUptime(processUptime)}\n` +
    `╰──────────\n\n` +
    `⚡ *Latency:* ${latency}ms\n` +
    `📡 *Hostname:* ${os.hostname()}`

  // Hapus "Pinging..." atau edit
  try {
    await client.message.send(to, text)
  } catch (err) {
    console.error('[ping] gagal kirim:', err.message)
    await client.message.send(to, `Pong! Latency: ${latency}ms`)
  }

  return { ok: true }
}