import https from 'node:https'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)

const RSS_URL = 'https://www.theguardian.com/world/rss'

function decode(v = '') {
  return v.replace(/&(#x[\da-fA-F]+|#\d+|\w+);/g, (_, k) => {
    if (k[0] === '#') {
      return String.fromCodePoint(
        k[1].toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : +k.slice(1)
      )
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[k] ?? `&${k};`
  }).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return decode(m?.[1] ?? '')
}

function attr(xml, tagName, attribute) {
  const m = xml.match(new RegExp(`<${tagName}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, 'i'))
  return decode(m?.[1] ?? '')
}

function largestImage(item) {
  const urls = [...item.matchAll(/<media:content\b[^>]*\burl=["']([^"']+)["']/gi)].map((m) => decode(m[1]))
  for (const u of urls) if (u.includes('width=700') || u.includes('width=1000')) return u
  for (const u of urls) if (u.includes('width=460')) return u
  return urls[0] ?? ''
}

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (RSS reader)' } }, (r) => {
      let b = ''
      r.setEncoding('utf8')
      r.on('data', (c) => { b += c })
      r.on('end', () => {
        if (r.statusCode >= 200 && r.statusCode < 300) res(b)
        else rej(new Error('HTTP ' + r.statusCode))
      })
    }).on('error', rej)
  })
}

function parse(xml, limit = 10) {
  const ch = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i)?.[1] ?? ''
  const items = [...ch.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, it]) => ({
    id: tag(it, 'guid'),
    title: tag(it, 'title'),
    url: tag(it, 'link'),
    publishedAt: tag(it, 'pubDate'),
    imageUrl: largestImage(it),
    summary: tag(it, 'description')
  }))
  return items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, limit)
}

async function fetchGuardian(limit = 10) {
  const xml = await get(RSS_URL)
  return parse(xml, limit)
}

function formatDate(pubDate) {
  const d = new Date(pubDate)
  if (isNaN(d.getTime())) return pubDate
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// ====== PLUGIN ======
export const meta = {
  name: 'guardian',
  alias: ['theguardian'],
  category: 'berita'
}

export async function handler(client, { to, args }) {
  const n = Number.parseInt(args[0], 10)
  const limit = Number.isFinite(n) && n > 0 && n <= 20 ? n : 10

  try {
    const items = await fetchGuardian(limit)

    if (!items.length) {
      await client.message.send(to, '❌ Gak ada berita.')
      return { ok: false }
    }

    const lines = items.map((item, i) => {
      const date = formatDate(item.publishedAt)
      return (
        `${i + 1}. *${item.title}*\n` +
        `   📅 ${date}\n` +
        `   🔗 ${item.url}`
      )
    }).join('\n\n')

    const text =
      `╭─〔 THE GUARDIAN 〕\n` +
      `│ Total: ${items.length} berita\n` +
      `╰──────────\n\n` +
      lines

    const MAX = 60000
    if (text.length > MAX) {
      await client.message.send(to, text.slice(0, MAX) + '\n\n...(dipotong)')
    } else {
      await client.message.send(to, text)
    }

    return { ok: true }
  } catch (err) {
    console.error('[guardian] gagal:', err.message)
    await client.message.send(to, `❌ Gagal: ${err.message}`)
    return { ok: false }
  }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  try {
    const n = Number.parseInt(process.argv[2], 10)
    const limit = Number.isFinite(n) && n > 0 ? n : 10
    const items = await fetchGuardian(limit)
    console.log(JSON.stringify(items, null, 2))
  } catch (e) {
    console.error('Gagal: ' + e.message)
    process.exit(1)
  }
}