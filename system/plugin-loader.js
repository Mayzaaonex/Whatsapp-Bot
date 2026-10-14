import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { TEMP_DIR, ensureTempDir } from './tempDir.js'

// === Button handler registry ===
const buttonHandlers = new Map()

export function getButtonHandler(selectedId) {
  for (const [prefix, handler] of buttonHandlers) {
    if (selectedId.startsWith(prefix)) return handler
  }
  return null
}

// === Auto handler registry ===
const autoHandlers = []

export function getAutoHandlers() {
  return autoHandlers
}

export async function loadPlugins(pluginDir) {
  const plugins = new Map()

  if (!fs.existsSync(pluginDir)) {
    console.warn(`[plugin] folder ${pluginDir} gak ada`)
    return plugins
  }

  const categories = fs.readdirSync(pluginDir, { withFileTypes: true })

  for (const cat of categories) {
    if (!cat.isDirectory()) continue

    const catPath = path.join(pluginDir, cat.name)
    const files = fs.readdirSync(catPath).filter((f) => {
      if (f.startsWith('_')) return false
      return f.endsWith('.js') || f.endsWith('.cjs')
    })

    for (const file of files) {
      const filePath = path.join(catPath, file)
      const scriptName = file.replace(/\.(c?js)$/, '')

      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const isPlugin = /export\s+(const|default|async\s+function|function)\s+(meta|handler|plugins|autoHandler)/.test(content)

        if (isPlugin) {
          const mod = await import(pathToFileURL(filePath).href)

          // === Multi-plugin ===
          if (Array.isArray(mod.plugins)) {
            for (const p of mod.plugins) {
              if (!p.meta || typeof p.handler !== 'function') continue
              const plugin = { ...p.meta, handler: p.handler, filePath }
              plugins.set(p.meta.name, plugin)
              if (Array.isArray(p.meta.alias)) {
                for (const a of p.meta.alias) plugins.set(a, plugin)
              }
              console.log(`[plugin] loaded: ${p.meta.name} (${cat.name})`)

              if (typeof p.onButton === 'function' && p.meta.buttonPrefix) {
                buttonHandlers.set(p.meta.buttonPrefix, p.onButton)
                console.log(`[plugin] button handler: ${p.meta.buttonPrefix} (${cat.name})`)
              }
            }
            continue
          }

          let registered = false

          // === Auto handler (bisa bareng handler) ===
          if (typeof mod.autoHandler === 'function' && mod.meta?.autoHandler) {
            autoHandlers.push({
              name: mod.meta.name,
              category: cat.name,
              handler: mod.autoHandler,
              filePath
            })
            console.log(`[plugin] auto handler: ${mod.meta.name} (${cat.name})`)
            registered = true
          }

          // === Handler biasa ===
          if (typeof mod.handler === 'function' && mod.meta) {
            const plugin = { ...mod.meta, handler: mod.handler, filePath }
            plugins.set(mod.meta.name, plugin)
            if (Array.isArray(mod.meta.alias)) {
              for (const a of mod.meta.alias) plugins.set(a, plugin)
            }
            console.log(`[plugin] loaded: ${mod.meta.name} (${cat.name})`)

            if (typeof mod.onButton === 'function' && mod.meta.buttonPrefix) {
              buttonHandlers.set(mod.meta.buttonPrefix, mod.onButton)
              console.log(`[plugin] button handler: ${mod.meta.buttonPrefix} (${cat.name})`)
            }
            registered = true
          }

          if (!registered) {
            console.warn(`[plugin] skip ${file}: gak ada handler/autoHandler`)
          }
        } else {
          const metaPath = filePath.replace(/\.(c?js)$/, '.meta.json')
          let scriptMeta = {}
          if (fs.existsSync(metaPath)) {
            try {
              scriptMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
            } catch (err) {
              console.warn(`[plugin] meta invalid ${metaPath}: ${err.message}`)
            }
          }

          const plugin = {
            name: scriptName,
            category: cat.name,
            filePath,
            requireMedia: scriptMeta.requireMedia === true,
            mediaWarning: scriptMeta.mediaWarning ?? null,
            forcePng: scriptMeta.forcePng === true,
            handler: createCliHandler(filePath, scriptName, scriptMeta)
          }
          plugins.set(scriptName, plugin)
          console.log(`[plugin] loaded CLI: ${scriptName} (${cat.name})${scriptMeta.requireMedia ? ' [media]' : ''}${scriptMeta.forcePng ? ' [png]' : ''}`)
        }
      } catch (err) {
        console.error(`[plugin] gagal load ${file}:`, err.message)
      }
    }
  }

  return plugins
}

function createCliHandler(filePath, scriptName, meta = {}) {
  return async (client, { to, event, args }) => {
    const msg = event.message || {}
    const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

    const hasMedia = (m) => m && (
      m.imageMessage || m.videoMessage || m.documentMessage || m.audioMessage || m.stickerMessage
    )

    const adaMedia = hasMedia(msg) || hasMedia(quoted)

    if (meta.requireMedia && !adaMedia) {
      const warning = meta.mediaWarning
        ?? `Command *.${scriptName}* butuh media. Kirim/reply media dengan caption *.${scriptName}*`
      await client.message.send(to, warning)
      return { ok: false }
    }

    if (adaMedia) {
      const mediaMessage = hasMedia(quoted) ? quoted : msg
      const downloadSource = hasMedia(quoted) ? quoted : msg

      ensureTempDir()

      const ext = mediaMessage.imageMessage ? '.jpg'
        : mediaMessage.videoMessage ? '.mp4'
        : mediaMessage.audioMessage ? '.ogg'
        : mediaMessage.stickerMessage ? '.webp'
        : '.bin'

      const tempInput = path.join(TEMP_DIR, `${scriptName}-${Date.now()}${ext}`)

      try {
        await client.message.downloadToFile(downloadSource, tempInput)
      } catch (err) {
        console.error(`[cli:${scriptName}] download gagal:`, err.message)
        await client.message.send(to, `❌ Gagal download media: ${err.message}`)
        return { ok: false }
      }

      let finalInput = tempInput
      let convertedPath = null

      if (meta.forcePng) {
        try {
          convertedPath = path.join(TEMP_DIR, `${scriptName}-${Date.now()}-converted.png`)
          await sharp(tempInput).png().toFile(convertedPath)
          finalInput = convertedPath
        } catch (err) {
          console.error(`[cli:${scriptName}] convert PNG gagal:`, err.message)
          try { fs.unlinkSync(tempInput) } catch {}
          await client.message.send(to, `❌ Gagal convert gambar: ${err.message}`)
          return { ok: false }
        }
      }

      try {
        const res = await runCli(filePath, [finalInput])

        if (res?.status === false) {
          const errMsg = res?.message ?? res?.result?.error ?? 'Unknown error'
          await client.message.send(to, `❌ Error: ${errMsg}`)
          return { ok: false }
        }

        await sendOutput(client, to, res)
        return { ok: true }
      } catch (err) {
        console.error(`[cli:${scriptName}]`, err.message)
        await client.message.send(to, `❌ Error: ${err.message}`)
        return { ok: false }
      } finally {
        try { fs.unlinkSync(tempInput) } catch {}
        if (convertedPath) try { fs.unlinkSync(convertedPath) } catch {}
      }
    }

    const query = args.join(' ').trim()

    if (!query) {
      await client.message.send(to, `Kasih input: *.${scriptName} <query>*`)
      return { ok: false }
    }

    try {
      const res = await runCli(filePath, args)

      if (res?.status === false) {
        const errMsg = res?.message ?? res?.result?.error ?? res?.result?.text ?? 'Unknown error'
        await client.message.send(to, `❌ Error: ${errMsg}`)
        return { ok: false }
      }

      await sendOutput(client, to, res)
      return { ok: true }
    } catch (err) {
      console.error(`[cli:${scriptName}]`, err.message)
      await client.message.send(to, `❌ Error: ${err.message}`)
      return { ok: false }
    }
  }
}

async function sendOutput(client, to, res) {
  // Case 0: screenshot_url
  if (res?.result?.screenshot_url) {
    const r = res.result
    try {
      const imgResp = await fetch(r.screenshot_url)
      if (!imgResp.ok) throw new Error(`HTTP ${imgResp.status}`)
      const buffer = Buffer.from(await imgResp.arrayBuffer())

      ensureTempDir()
      const tempImg = path.join(TEMP_DIR, `ssweb-${Date.now()}.png`)
      fs.writeFileSync(tempImg, buffer)

      const caption =
        `╭─〔 SCREENSHOT WEB 〕\n` +
        `│ URL: ${r.target_url}\n` +
        `│ Device: ${r.device}\n` +
        `│ Resolusi: ${r.dimensions?.width}×${r.dimensions?.height}\n` +
        `│ Ukuran: ${r.size}\n` +
        `╰──────────`

      await client.message.send(to, {
        type: 'image',
        media: tempImg,
        mimetype: 'image/png',
        caption
      })

      try { fs.unlinkSync(tempImg) } catch {}
      return
    } catch (err) {
      console.error('[ssweb] gagal download screenshot:', err.message)
      await client.message.send(to, `📸 ${r.screenshot_url}`)
      return
    }
  }

  // Case 1: saved_to
  if (res?.saved_to && fs.existsSync(res.saved_to)) {
    try {
      await client.message.send(to, {
        type: 'image',
        media: res.saved_to,
        mimetype: 'image/png'
      })
    } finally {
      try { fs.unlinkSync(res.saved_to) } catch {}
    }
    return
  }

  // Case 2: text
  let output = null

  if (res?.result?.text) {
    output = res.result.text
  } else if (res?.result_url) {
    output = res.result_url
  } else if (typeof res?.result === 'string') {
    output = res.result
  } else if (res?.url) {
    output = res.url
  } else if (res?.result && typeof res.result === 'object') {
    output = formatNestedResult(res.result)
  } else if (res) {
    output = JSON.stringify(res, null, 2)
  } else {
    await client.message.send(to, '❌ Output kosong.')
    return
  }

  const MAX = 60000
  if (output.length > MAX) {
    await client.message.send(to, output.slice(0, MAX) + '\n\n...(dipotong)')
  } else {
    await client.message.send(to, output)
  }
}

function formatNestedResult(obj) {
  if (obj.domain && obj.dns) {
    let text = `╭─〔 DOMAIN INFO 〕\n`
    text += `│ Domain: ${obj.domain}\n`
    if (obj.ip?.length) text += `│ IP: ${obj.ip.map(i => i.ip).join(', ')}\n`
    if (obj.ns?.length) text += `│ NS: ${obj.ns.join(', ')}\n`
    if (obj.mx?.length) text += `│ MX: ${obj.mx.map(m => m.server).join(', ')}\n`
    if (obj.geo) {
      text += `│ Country: ${obj.geo.country ?? '-'}\n`
      text += `│ City: ${obj.geo.city ?? '-'}\n`
      text += `│ ISP: ${obj.geo.isp ?? '-'}\n`
    }
    if (obj.ssl) {
      text += `│ SSL Issuer: ${obj.ssl.issuer ?? '-'}\n`
      text += `│ SSL Valid: ${obj.ssl.valid_to ?? '-'}\n`
    }
    text += `╰──────────`
    return text
  }

  if (obj.ip && obj.location) {
    let text = `╭─〔 IP LOCATION 〕\n`
    text += `│ IP: ${obj.ip}\n`
    if (obj.hostname) text += `│ Hostname: ${obj.hostname}\n`
    text += `│ Country: ${obj.location.country ?? '-'} (${obj.location.country_code ?? '-'})\n`
    if (obj.location.region) text += `│ Region: ${obj.location.region}\n`
    if (obj.location.city) text += `│ City: ${obj.location.city}\n`
    if (obj.location.coordinates?.latitude) {
      text += `│ Coordinates: ${obj.location.coordinates.latitude}, ${obj.location.coordinates.longitude}\n`
    }
    if (obj.network) {
      if (obj.network.isp) text += `│ ISP: ${obj.network.isp}\n`
      if (obj.network.asn) text += `│ ASN: ${obj.network.asn}\n`
      if (obj.network.network) text += `│ Network: ${obj.network.network}\n`
      if (obj.network.usage_type) text += `│ Usage: ${obj.network.usage_type}\n`
    }
    if (obj.time) {
      if (obj.time.timezone) text += `│ Timezone: ${obj.time.timezone}\n`
      if (obj.time.local_time) text += `│ Local Time: ${obj.time.local_time}\n`
    }
    text += `╰──────────`
    return text
  }

  if (obj.text && obj.location) {
    return (
      `╭─〔 QR DECODE 〕\n` +
      `│ Text: ${obj.text}\n` +
      `╰──────────`
    )
  }

  return JSON.stringify(obj, null, 2)
}

export function runCli(scriptPath, args = [], opts = {}) {
  const { timeoutMs = 60000, parseJson = true } = opts

  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      timeout: timeoutMs
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })

    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Exit ${code}: ${stderr || stdout || 'unknown'}`))
      }
      if (!parseJson) return resolve(stdout.trim())
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch {
        reject(new Error(`Gagal parse JSON: ${stdout.slice(0, 200)}`))
      }
    })
  })
}