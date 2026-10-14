export function jidType(jid) {
  if (!jid) return 'unknown'
  if (jid.endsWith('@g.us')) return 'group'
  if (jid.endsWith('@newsletter')) return 'newsletter'
  if (jid.endsWith('@lid')) return 'lid'
  if (jid.endsWith('@broadcast')) return 'broadcast'
  if (jid.endsWith('@s.whatsapp.net')) return 'personal'
  return 'unknown'
}

export function jidToNumber(jid) {
  if (!jid) return null
  if (jidType(jid) !== 'personal') return null
  const [user] = jid.split('@')
  return user.split(':')[0]
}

export function resolveDisplayNumber(jid, altJid) {
  return jidToNumber(jid) ?? jidToNumber(altJid) ?? null
}

export function formatJidForLog(jid, altJid) {
  const type = jidType(jid)
  const number = resolveDisplayNumber(jid, altJid)
  return number ? `${number} (${type})` : `${jid} (${type})`
}