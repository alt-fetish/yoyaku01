import { Hono } from 'hono'
import { Env, getDB } from '../lib/db'
import { isTokenValid } from '../lib/token'

const app = new Hono<{ Bindings: Env }>()

/** Render chat messages as HTML fragment */
function renderMessages(messages: any[]): string {
  if (messages.length === 0) {
    return '<p style="color:#9ca3af;font-size:14px;text-align:center;padding:20px 0">メッセージはありません</p>'
  }
  return messages
    .map((m) => {
      const time = new Date(m.created_at).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      if (m.sender_type === 'system') {
        return `<div style="text-align:center;margin:8px 0"><span style="font-size:12px;color:#9ca3af;background:#f3f4f6;padding:4px 12px;border-radius:999px">${escapeHtml(m.message)}</span></div>`
      }
      const isAdmin = m.sender_type === 'admin'
      const align = isAdmin ? 'flex-end' : 'flex-start'
      const bubbleStyle = isAdmin
        ? 'background:#2563eb;color:#fff;border-radius:16px 16px 4px 16px'
        : 'background:#fff;color:#1a1a1a;border-radius:16px 16px 16px 4px;border:1px solid #e5e7eb'
      const label = isAdmin ? 'カウンセラー' : 'あなた'
      return `<div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:12px">
  <div style="font-size:11px;color:#9ca3af;margin-bottom:3px">${label}</div>
  <div style="max-width:80%;padding:10px 14px;font-size:14px;${bubbleStyle}">${escapeHtml(m.message)}</div>
  <div style="font-size:11px;color:#9ca3af;margin-top:3px">${time}</div>
</div>`
    })
    .join('')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

/**
 * GET /api/chat?booking_id=&token=
 * Returns HTML fragment of chat messages (for HTMX polling).
 */
app.get('/', async (c) => {
  const bookingId = c.req.query('booking_id')
  const token = c.req.query('token')

  if (!bookingId || !token) return c.html('', 400)

  const db = getDB(c.env)
  const { data: booking } = await db
    .from('bookings')
    .select('id, access_token, token_expiry, token_used, status')
    .eq('id', bookingId)
    .eq('access_token', token)
    .single()

  if (!booking || !isTokenValid(booking)) return c.html('', 401)

  const { data: messages } = await db
    .from('chat_messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  return c.html(renderMessages(messages ?? []))
})

/**
 * POST /api/chat/send
 * Body: booking_id, token, message
 * Client sends a message; returns updated messages fragment.
 */
app.post('/send', async (c) => {
  const body = await c.req.parseBody()
  const bookingId = String(body.booking_id ?? '').trim()
  const token = String(body.token ?? '').trim()
  const message = String(body.message ?? '').trim()

  if (!bookingId || !token || !message) return c.html('', 400)

  const db = getDB(c.env)
  const { data: booking } = await db
    .from('bookings')
    .select('id, access_token, token_expiry, token_used, status')
    .eq('id', bookingId)
    .eq('access_token', token)
    .single()

  if (!booking || !isTokenValid(booking)) return c.html('', 401)

  await db.from('chat_messages').insert({
    booking_id: bookingId,
    sender_type: 'client',
    message,
  })

  const { data: messages } = await db
    .from('chat_messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  return c.html(renderMessages(messages ?? []))
})

export { renderMessages }
export default app
