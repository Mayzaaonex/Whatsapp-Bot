import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage, registerFont } from 'canvas'
import { TEMP_DIR, ensureTempDir } from '../../system/tempDir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BG_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/fakeDANA/dana.jpg'
const FONT_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/fakeDANA/nonename.ttf'
const EYE_URL = 'https://raw.githubusercontent.com/Mayzaaonex/assets-api/refs/heads/main/fakeDANA/eye.png'

export async function generateFakeDana(nominal) {
  const raw = parseInt(String(nominal).replace(/[^\d]/g, '')) || 0
  if (!raw) throw new Error('Nominal tidak valid')
  const formatted = raw.toLocaleString('id-ID')

  // Posisi
  const rpX = 60
  const rpY = 65
  const rpZ = 16
  const nominalY = 53
  const nominalZ = 40
  const eyeDistance = 10
  const eyeZ = 45
  const eyeY = 53

  // === Load assets langsung dari URL ===
  const bgImg = await loadImage(BG_URL)
  const canvas = createCanvas(bgImg.width, bgImg.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bgImg, 0, 0)

  // === Font — download ke tmp, register, hapus ===
  const fontRes = await axios.get(FONT_URL, { responseType: 'arraybuffer', timeout: 20000 })
  const fontPath = path.join(os.tmpdir(), `nonename_${Date.now()}.ttf`)
  fs.writeFileSync(fontPath, fontRes.data)
  registerFont(fontPath, { family: 'nonename' })

  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'top'

  const prefix = 'Rp '
  ctx.font = `${rpZ}px nonename`
  const prefixW = ctx.measureText(prefix).width
  ctx.fillText(prefix, rpX, rpY)

  ctx.font = `${nominalZ}px nonename`
  const numberW = ctx.measureText(formatted).width
  const actualNominalX = rpX + prefixW
  ctx.fillText(formatted, actualNominalX, nominalY)

  // === Eye icon ===
  const actualEyeX = actualNominalX + numberW + eyeDistance
  try {
    const eyeImg = await loadImage(EYE_URL)
    ctx.drawImage(eyeImg, actualEyeX, eyeY, eyeZ, eyeZ)
  } catch (err) {
    console.error('[fakedana] eye icon gagal:', err.message)
  }

  // Hapus font temp
  try { fs.unlinkSync(fontPath) } catch {}

  return canvas.toBuffer('image/png')
}

// ====== HANDLER ======
export const meta = {
  name: 'fakedana',
  category: 'maker'
}

export async function handler(client, { to, args }) {
  const nominalInput = args[0]
  if (!nominalInput) {
    await client.message.send(to, 'Kasih nominal: *.fakedana <jumlah>*\nContoh: *.fakedana 150000*')
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
    const buffer = await generateFakeDana(raw)
    pngPath = path.join(TEMP_DIR, `fakedana-${Date.now()}.png`)
    fs.writeFileSync(pngPath, buffer)
  } catch (err) {
    console.error('[fakedana] generate gagal:', err.message)
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
    console.error('[fakedana] kirim gagal:', err.message)
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
    const buffer = await generateFakeDana(nominal)
    const outPath = path.join(TEMP_DIR, `fakedana-cli-${Date.now()}.png`)
    fs.writeFileSync(outPath, buffer)
    console.log(JSON.stringify({ status: true, saved_to: outPath }))
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}