import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage, registerFont } from 'canvas'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const IMG_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/fakeOVO/ovo.jpg'
const FONT_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/fakeOVO/Poppins.ttf'

export async function generateFakeOvo(nominal) {
  const raw = parseInt(String(nominal).replace(/[^\d]/g, '')) || 0
  if (!raw) throw new Error('Nominal tidak valid')
  const formatted = raw.toLocaleString('id-ID')

  // Posisi
  const rpX = 70
  const rpY = 315
  const rpZ = 20
  const nominalY = 315
  const nominalZ = 32

  // Load background
  const bgImg = await loadImage(IMG_URL)
  const canvas = createCanvas(bgImg.width, bgImg.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bgImg, 0, 0)

  // Download font
  const fontRes = await axios.get(FONT_URL, { responseType: 'arraybuffer', timeout: 20000 })
  const fontPath = path.join(os.tmpdir(), `ovo_${Date.now()}.ttf`)
  fs.writeFileSync(fontPath, fontRes.data)
  registerFont(fontPath, { family: 'Poppins' })

  try {
    ctx.fillStyle = 'white'
    ctx.textBaseline = 'top'

    const prefix = 'Rp '

    ctx.font = `${rpZ}px Poppins`
    const prefixW = ctx.measureText(prefix).width
    ctx.fillText(prefix, rpX, rpY)

    ctx.font = `${nominalZ}px Poppins`
    const actualNominalX = rpX + prefixW
    ctx.fillText(formatted, actualNominalX, nominalY)

    return canvas.toBuffer('image/png')
  } finally {
    try { fs.unlinkSync(fontPath) } catch {}
  }
}

// ====== HANDLER ======
export const meta = {
  name: 'fakeovo',
  category: 'maker'
}

export async function handler(client, { to, args }) {
  const nominalInput = args[0]

  if (!nominalInput) {
    await client.message.send(to, 'Kasih nominal: *.fakeovo <jumlah>*\nContoh: *.fakeovo 150000*')
    return { ok: false }
  }

  const raw = parseInt(String(nominalInput).replace(/[^\d]/g, ''))
  if (!raw || raw <= 0) {
    await client.message.send(to, '❌ Nominal gak valid.')
    return { ok: false }
  }

  ensureTempDir()

  let pngPath

  try {
    const buffer = await generateFakeOvo(raw)
    pngPath = path.join(TEMP_DIR, `fakeovo-${Date.now()}.png`)
    fs.writeFileSync(pngPath, buffer)
  } catch (err) {
    console.error('[fakeovo] generate gagal:', err.message)
    await client.message.send(to, `❌ Gagal generate: ${err.message}`)
    return { ok: false }
  }

  try {
    await client.message.send(to, {
      type: 'image',
      media: pngPath,
      mimetype: 'image/png'
    })
  } catch (err) {
    console.error('[fakeovo] kirim gagal:', err.message)
    await client.message.send(to, `❌ Gagal kirim: ${err.message}`)
    return { ok: false }
  } finally {
    if (pngPath) try { fs.unlinkSync(pngPath) } catch {}
  }

  return { ok: true }
}

// ====== CLI MODE ======
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const nominal = process.argv[2] || '150000'
  ensureTempDir()

  try {
    const buffer = await generateFakeOvo(nominal)
    const outPath = path.join(TEMP_DIR, `fakeovo-cli-${Date.now()}.png`)
    fs.writeFileSync(outPath, buffer)
    console.log(JSON.stringify({ status: true, saved_to: outPath }))
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}