export function render(prefix) {
  return (
    `╭─〔 TOOLS Commands 〕\n` +
    `│ • *${prefix}shortlink <url>*\n` +
    `│ • *${prefix}domaininfo <domain>*\n` +
    `│ • *${prefix}iplocation <ip>*\n` +
    `│ • *${prefix}qrgenerator <text/url>*\n` +
    `│ • *${prefix}qrdecode* (kirim/reply gambar QR)\n` +
    `│ • *${prefix}recordweb <url> [hp|desktop|tablet|laptop]*\n` +
    `│ • *${prefix}removebg* (kirim/reply gambar, atau URL)\n` +
    `│ • *${prefix}ssweb <url> [pc|tablet|hp] [--proxy]*\n` +
    `│ • *${prefix}topixel* (kirim/reply gambar, atau URL)\n` +
    `│ • *${prefix}fotolive [url-video]*\n` +
    `╰──────────`
  )
}