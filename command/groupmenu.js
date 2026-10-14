export function render(prefix) {
  return (
    `╭─〔 GROUP Commands 〕\n` +
    `│ • *${prefix}idgc*\n` +
    `│ • *${prefix}join <link>*\n` +
    `│ • *${prefix}listgc*\n` +
    `│ *ADMIN*\n` +
    `│ • *${prefix}linkgc*\n` +
    `│ • *${prefix}revokelink*\n` +
    `│ • *${prefix}kick @user*\n` +
    `│ • *${prefix}promote @user*\n` +
    `│ • *${prefix}demote @user*\n` +
    `│ • *${prefix}add 628xxx*\n` +
    `│ • *${prefix}addmeta*\n` +          // ← BARU
    `│ • *${prefix}open*\n` +
    `│ • *${prefix}close*\n` +
    `│ • *${prefix}leave*\n` +
    `│ • *${prefix}pin <reply>* [24h/7d/30d]\n` +
    `│ • *${prefix}unpin <reply>*\n` +
    `│ *MODERASI*\n` +
    `│ • *${prefix}mute @user*\n` +
    `│ • *${prefix}unmute @user*\n` +
    `│ • *${prefix}warn @user <alasan>*\n` +
    `│ • *${prefix}resetwarn @user*\n` +
    `│ • *${prefix}listwarn*\n` +
    `│ *AUTO*\n` +
    `│ • *${prefix}antilink all*\n` +
    `│ • *${prefix}antilink ch*\n` +
    `│ • *${prefix}antilink gb*\n` +
    `│ • *${prefix}antilink off*\n` +
    `╰──────────`
  )
}