import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE = 'https://prithivmlmods-qwen-image-edit-object-manipulator.hf.space'
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
const PROXY_API = 'https://api.ikyyxd.my.id/v2l/proxy-free/ikyy-xsample'

const WM = {
  Creator: 'IzzXd',
  Saluran: 'https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K'
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

const PROMPT = 'tolong rubah warna kulitnyua menjadi hitam, apapun jenis warna kulitnya rubah menjadi hitam aja, jangan rubah a;papun selain kulit pada gambar tersebut!.'

let proxies = []
let proxyIndex = 0
let proxyReady = false
let defaultLora = null

class QuotaError extends Error {
  constructor(msg) {
    super(msg)
    this.name = 'QuotaError'
  }
}

function mimeFromBuffer(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.slice(8, 12).toString() === 'WEBP') return 'image/webp'
  return 'image/png'
}

function decodeDataUrl(str) {
  const m = str.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s)
  if (m) return { buffer: Buffer.from(m[2], 'base64'), mime: m[1] }
  const buffer = Buffer.from(str, 'base64')
  return { buffer, mime: mimeFromBuffer(buffer) }
}

async function fetchConfig() {
  const r = await axios.get(BASE + '/api/config', {
    headers: { 'User-Agent': UA },
    timeout: 15000
  })
  const loras = r.data && r.data.loras
  defaultLora = (loras && loras.length) ? loras[0] : 'Qwen-Image-Edit-2511-Object-Adder'
}

async function fetchProxies() {
  if (proxyReady && proxies.length) return
  const res = await axios.get(PROXY_API, { timeout: 10000 })
  if (!Array.isArray(res.data)) throw new Error('Format proxy tidak valid')
  proxies = res.data.filter((p) => typeof p === 'string' && p.split(':').length === 4)
  proxyReady = true
}

function rotateProxy() {
  if (proxies.length) proxyIndex = (proxyIndex + 1) % proxies.length
}

function currentProxy() {
  if (!proxies.length) return null
  const p = proxies[proxyIndex]
  const parts = p.split(':')
  if (parts.length !== 4) return null
  return {
    host: parts[0],
    port: parseInt(parts[1], 10),
    auth: { username: parts[2], password: parts[3] },
    protocol: 'http'
  }
}

function proxyAgent() {
  if (!proxies.length) return null
  const p = proxies[proxyIndex]
  const parts = p.split(':')
  if (parts.length !== 4) return null
  const agentUrl = 'http://' + parts[2] + ':' + parts[3] + '@' + parts[0] + ':' + parts[1]
  try { return new HttpsProxyAgent(agentUrl) } catch { return null }
}

async function callEdit(b64, prompt, useProxy) {
  const payload = {
    data: [JSON.stringify([b64]), prompt, defaultLora, 0, true, 1.0, 8]
  }

  const cfg = {
    method: 'post',
    url: BASE + '/gradio_api/call/edit_image',
    data: payload,
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      'Origin': BASE,
      'Referer': BASE + '/'
    },
    timeout: 60000,
    proxy: false
  }

  if (useProxy) {
    const pc = currentProxy()
    if (pc) cfg.proxy = pc
  }

  const r = await axios(cfg)
  const eventId = (r.data && r.data.event_id) || r.data
  if (!eventId || typeof eventId !== 'string') {
    throw new Error('event_id invalid: ' + JSON.stringify(r.data).slice(0, 200))
  }
  return eventId
}

function pollResult(eventId, useProxy) {
  return new Promise((resolve, reject) => {
    if (!eventId || typeof eventId !== 'string') {
      return reject(new Error('eventId bukan string: ' + eventId))
    }

    const full = BASE + '/gradio_api/call/edit_image/' + encodeURIComponent(eventId)
    let urlObj
    try { urlObj = new URL(full) }
    catch { return reject(new Error('Invalid URL: ' + full)) }

    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/event-stream',
        'Origin': BASE,
        'Referer': BASE + '/'
      }
    }

    if (useProxy && proxies.length) {
      const agent = proxyAgent()
      if (agent) opts.agent = agent
    }

    const req = https.request(opts, (res) => {
      let buf = ''
      let lastEvent = ''

      res.on('data', (chunk) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop()

        for (const line of lines) {
          if (line.indexOf('event: ') === 0) {
            lastEvent = line.slice(7).trim()
            continue
          }
          if (line.indexOf('data: ') !== 0) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          try {
            const j = JSON.parse(raw)
            const errMsg = (j && (j.error || j.message)) || ''

            if (String(errMsg).toLowerCase().indexOf('quota') !== -1) {
              return reject(new QuotaError(errMsg))
            }
            if (errMsg) return reject(new Error(errMsg))

            if (lastEvent === 'complete' || lastEvent === 'process_completed') {
              const out = Array.isArray(j) ? j[0] : (j && j.data && j.data[0])
              if (out && out.image) return resolve(out.image)
              if (out && out.url) return resolve({ url: out.url })
              if (typeof out === 'string' && out.length > 100) return resolve(out)
            }

            if (Array.isArray(j)) {
              const out = j[0]
              if (out && out.image) return resolve(out.image)
              if (out && out.url) return resolve({ url: out.url })
              if (typeof out === 'string' && out.length > 100) return resolve(out)
            }

            if (j && j.msg === 'process_completed') {
              const out = j.output && j.output.data && j.output.data[0]
              if (out && out.image) return resolve(out.image)
              if (out && out.url) return resolve({ url: out.url })
            }
          } catch {}
        }
      })

      res.on('end', () => reject(new Error('stream ended tanpa hasil')))
      res.on('error', (e) => {
        if (/hang|socket|ECONNRESET/i.test(e.message)) return reject(new QuotaError(e.message))
        reject(e)
      })
    })

    req.on('error', (e) => {
      if (/hang|socket|ECONNRESET/i.test(e.message)) return reject(new QuotaError(e.message))
      reject(e)
    })

    req.setTimeout(120000, () => {
      req.destroy()
      reject(new Error('poll timeout'))
    })

    req.end()
  })
}

async function qwenEdit(imgpath, prompt, useProxy) {
  const buf = fs.readFileSync(imgpath)
  const mime = mimeFromBuffer(buf)
  const b64 = 'data:' + mime + ';base64,' + buf.toString('base64')
  const eventId = await callEdit(b64, prompt, useProxy)
  return pollResult(eventId, useProxy)
}

async function downloadBuffer(url) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('download URL invalid: ' + url)
  }
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, proxy: false })
  return Buffer.from(r.data)
}

async function runHitam(imgpath) {
  const prompt = PROMPT

  await fetchConfig()

  let result
  let usingProxy = false
  const maxAttempts = 8

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      result = await qwenEdit(imgpath, prompt, usingProxy)
      break
    } catch (e) {
      if (e instanceof QuotaError) {
        try { await fetchProxies() } catch {}
        usingProxy = true
        if (attempt > 1) rotateProxy()
        continue
      }
      if (attempt >= maxAttempts) throw e
      if (usingProxy) rotateProxy()
    }
  }

  let resultBuf

  if (typeof result === 'string' && /^https?:\/\//.test(result)) {
    resultBuf = await downloadBuffer(result)
  } else if (typeof result === 'string') {
    const dec = decodeDataUrl(result)
    resultBuf = dec.buffer
  } else if (result && result.url) {
    resultBuf = await downloadBuffer(result.url)
  } else {
    throw new Error('format output tidak dikenali: ' + JSON.stringify(result).slice(0, 150))
  }

  return resultBuf
}

// ====== PLUGIN ======
export const meta = {
  name: 'hitam',
  category: 'ai-image',
  requireMedia: true
}

export async function handler(client, { to, event }) {
  const msg = event.message || {}
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage

  const hasImage = (m) => m && m.imageMessage
  const adaMedia = hasImage(msg) || hasImage(quoted)

  if (!adaMedia) {
    await client.message.send(to, 'Kirim/reply gambar dengan caption *.hitam*')
    return { ok: false }
  }

  ensureTempDir()

  const downloadSource = hasImage(quoted) ? quoted : msg
  const tempInput = path.join(TEMP_DIR, `hitam-in-${Date.now()}.jpg`)

  try {
    await client.message.downloadToFile(downloadSource, tempInput)
  } catch (err) {
    console.error('[hitam] download gagal:', err.message)
    await client.message.send(to, `❌ Gagal download: ${err.message}`)
    return { ok: false }
  }

  await client.message.send(to, '⏳ Processing, tunggu sebentar...')

  let resultBuf
  try {
    resultBuf = await runHitam(tempInput)
  } catch (err) {
    console.error('[hitam] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    try { fs.unlinkSync(tempInput) } catch {}
    return { ok: false }
  }

  const outPath = path.join(TEMP_DIR, `hitam-out-${Date.now()}.png`)
  fs.writeFileSync(outPath, resultBuf)
  try { fs.unlinkSync(tempInput) } catch {}

  try {
    await client.message.send(to, {
      type: 'image',
      media: outPath,
      mimetype: 'image/png'
    })
  } catch (err) {
    console.error('[hitam] kirim gagal:', err.message)
    await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
    return { ok: false }
  } finally {
    try { fs.unlinkSync(outPath) } catch {}
  }

  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const imgpath = process.argv[2]
  if (!imgpath || !fs.existsSync(imgpath)) {
    console.error('Pemakaian: node hitam.js <imgpath>')
    process.exit(1)
  }

  console.log('Processing...')
  try {
    const buf = await runHitam(imgpath)
    const outPath = path.join(process.cwd(), 'hitam_' + Date.now() + '.png')
    fs.writeFileSync(outPath, buf)
    console.log(JSON.stringify({ status: true, result_path: outPath }, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ status: false, error: err.message }, null, 2))
    process.exit(1)
  }
}