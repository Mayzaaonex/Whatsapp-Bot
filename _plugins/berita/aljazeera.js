import https from 'node:https'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)

const RSS_URL = 'https://www.aljazeera.com/xml/rss/all.xml'
const XML_ESCAPES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[\da-fA-F]+|#\d+|\w+);/g, (_, key) => {
      if (key[0] === '#') {
        return String.fromCodePoint(
          key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : +key.slice(1)
        )
      }
      return XML_ESCAPES[key] ?? `&${key};`
    }).trim()
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return decodeXml(match?.[1] ?? '')
}

function imageUrl(item) {
  const html = tag(item, 'description')
  const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)
  return decodeXml(match?.[1] ?? '')
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (RSS reader)' } }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(body)
        else reject(new Error(`HTTP ${response.statusCode}`))
      })
    }).on('error', reject)
  })
}

function parse(xml, limit = 10) {
  const channel = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i)?.[1] ?? ''
  const items = [...channel.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const description = tag(item, 'description')
    return {
      id: tag(item, 'link'),
      title: tag(item, 'title'),
      url: tag(item, 'link'),
      publishedAt: tag(item, 'pubDate'),
      category: tag(item, 'category'),
      imageUrl: imageUrl(item),
      summary: description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
  })
  return items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, limit)
}

async function fetchAljazeera(limit = 10) {
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
  name: 'aljazeera',
  alias: ['aljazeera'],
  category: 'berita'
}

export async function handler(client, { to, args }) {
  const n = Number.parseInt(args[0], 10)
  const limit = Number.isFinite(n) && n > 0 && n <= 20 ? n : 10

  try {
    const items = await fetchAljazeera(limit)

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
      `╭─〔 AL JAZEERA 〕\n` +
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
    console.error('[aljazeera] gagal:', err.message)
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
    const items = await fetchAljazeera(limit)
    console.log(JSON.stringify(items, null, 2))
  } catch (error) {
    console.error(`Gagal: ${error.message}`)
    process.exit(1)
  }
}