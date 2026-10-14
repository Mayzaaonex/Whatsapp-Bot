export function render(prefix) {
  return (
    `╭─〔 OWNER Commands 〕\n` +
    `│ • *${prefix}setprefix*\n` +
    `│ • *${prefix}setpack*\n` +
    `│ • *${prefix}setauthor*\n` +
    `│ • *${prefix}self*\n` +
    `│ • *${prefix}unself*\n` +
    `│ • *${prefix}swgc*\n` +
    `│ • *${prefix}owner*\n` +
    `│ • *${prefix}ownermenu*\n` +
    `│ *SYSTEM*\n` +
    `│ • *${prefix}checkupdate*\n` +
    `│ • *${prefix}update*\n` +
    `│ • *${prefix}restart*\n` +
    `╰──────────`
  )
}