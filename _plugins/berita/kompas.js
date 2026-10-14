import https from 'node:https'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)

const URL = 'https://indeks.kompas.com/'

function decode(value = '') {
  return value.replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-fA-F]+|#\d+|\w+);/g, (_, key) => {
      if (key[0] === '#') {
        return String.fromCodePoint(
          key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : +key.slice(1)
        )
      }
      return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key] ?? `&${key};`
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (news reader)' } }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body)
        else reject(new Error(`HTTP ${res.statusCode}`))
      })
    }).on('error', reject)
  })
}

function attr(html, name) {
  const match = html.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))
  return decode(match?.[1] ?? '')
}

function text(html, className) {
  const match = html.match(new RegExp(`<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'i'))
  return decode(match?.[1] ?? '')
}

function parse(html, limit = 10) {
  return [...html.matchAll(/<a\s+class=["']article-link["'][^>]*>[\s\S]*?<\/a>/gi)]
    .map(([block]) => ({
      title: text(block, 'articleTitle'),
      url: attr(block, 'href'),
      imageUrl: attr((block.match(/<img\b[^>]*>/i) ?? [''])[0], 'src'),
      category: text(block, 'articlePost-subtitle'),
      publishedAt: text(block, 'articlePost-date')
    }))
    .filter((item) => item.title && item.url)
    .slice(0, limit)
}

async function fetchKompas(limit = 10) {
  const html = await get(URL)
  return parse(html, limit)
}

// ====== PLUGIN ======
export const meta = {
  name: 'kompas',
  alias: ['kompasnews'],
  category: 'berita'
}

export async function handler(client, { to, args }) {
  const n = Number.parseInt(args[0], 10)
  const limit = Number.isFinite(n) && n > 0 && n <= 20 ? n : 10

  try {
    const items = await fetchKompas(limit)

    if (!items.length) {
      await client.message.send(to, '❌ Gak ada berita.')
      return { ok: false }
    }

    const lines = items.map((item, i) => {
      const cat = item.category ? `   🏷️ ${item.category}\n` : ''
      const date = item.publishedAt ? `   📅 ${item.publishedAt}\n` : ''
      return (
        `${i + 1}. *${item.title}*\n` +
        cat +
        date +
        `   🔗 ${item.url}`
      )
    }).join('\n\n')

    const text =
      `╭─〔 KOMPAS NEWS 〕\n` +
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
    console.error('[kompas] gagal:', err.message)
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
    const items = await fetchKompas(limit)
    console.log(JSON.stringify(items, null, 2))
  } catch (error) {
    console.error(`Gagal: ${error.message}`)
    process.exit(1)
  }
}