/**
 * Magic Link token utilities.
 * Uses Web Crypto API (available in Cloudflare Workers).
 */

/** Generate a 256-bit URL-safe random token */
export function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

function base64url(bytes: Uint8Array): string {
  let str = ''
  bytes.forEach((b) => (str += String.fromCharCode(b)))
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Compute expiry timestamp from now + hours */
export function tokenExpiry(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() + hours)
  return d.toISOString()
}

/** Check whether a token record is currently valid */
export function isTokenValid(booking: {
  access_token: string | null
  token_expiry: string | null
  token_used: boolean
  status: string
}): boolean {
  if (!booking.access_token) return false
  if (!booking.token_expiry) return false
  if (new Date(booking.token_expiry) < new Date()) return false
  if (!['pending', 'confirmed', 'finalized'].includes(booking.status)) return false
  return true
}
