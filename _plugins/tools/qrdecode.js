import sharp from 'sharp'
import jsQR from 'jsqr'
import { fileURLToPath } from 'url'

const credit = { creator: 'Mayzaa' }

export async function qrdecode(filePath) {
  try {
    if (!filePath) {
      return { ...credit, status: false, message: 'Parameter filePath wajib diisi' }
    }

    // Sharp handle semua format (JPG/PNG/WebP) → raw RGBA
    const { data, info } = await sharp(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height)

    if (!code) {
      return { ...credit, status: false, message: 'QR code tidak terdeteksi di gambar' }
    }

    return {
      ...credit,
      status: true,
      result: {
        text: code.data,
        location: code.location
      }
    }
  } catch (error) {
    return { ...credit, status: false, message: error.message }
  }
}

// === CLI MODE ===
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const filePath = process.argv[2]

  if (!filePath) {
    console.error('Pemakaian: node qrdecode.js <path-gambar>')
    console.error('Contoh  : node qrdecode.js ./qr.png')
    process.exit(1)
  }

  qrdecode(filePath)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2))
      if (!res.status) process.exit(1)
    })
    .catch((err) => {
      console.error('Error:', err.message)
      process.exit(1)
    })
}