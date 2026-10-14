// Cache admin grup (5 menit)
const adminCache = new Map()
const CACHE_TTL = 5 * 60 * 1000

/**
 * Cek apakah user admin di grup.
 */
export async function isUserAdmin(client, groupJid, senderJid) {
  try {
    const now = Date.now()
    let cached = adminCache.get(groupJid)

    if (!cached || now > cached.expiresAt) {
      const metadata = await client.group.queryGroupMetadata(groupJid)
      cached = { data: metadata, expiresAt: now + CACHE_TTL }
      adminCache.set(groupJid, cached)
    }

    const p = cached.data.participants.find(
      (x) => x.jid === senderJid || x.lid === senderJid
    )

    return p?.isAdmin === true || p?.isSuperAdmin === true
  } catch (err) {
    console.error('[group] gagal cek admin:', err.message)
    return false
  }
}

/**
 * Clear cache admin grup.
 */
export function clearAdminCache(groupJid) {
  if (groupJid) adminCache.delete(groupJid)
  else adminCache.clear()
}