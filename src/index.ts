import { Hono } from 'hono'
import { Env, getDB } from './lib/db'

import indexApp       from './app/index'
import reserveApp     from './app/reserve'
import mypageApp      from './app/mypage'
import searchSlotApi  from './api/search-slot'
import selectSlotApi  from './api/select-slot'
import createReservationApi from './api/create-reservation'
import finalizeApi    from './api/finalize'
import chatApi        from './api/chat'
import changeApi      from './api/change'
import adminApp       from './admin/index'
import adminLoginApp  from './admin/login'
import adminSlotsApp  from './admin/slots'
import adminBookingApp from './admin/booking'

const app = new Hono<{ Bindings: Env }>()

// ── Frontend pages ────────────────────────
app.route('/',        indexApp)
app.route('/reserve', reserveApp)
app.route('/mypage',  mypageApp)

// ── Public API ────────────────────────────
app.route('/api/search-slot',        searchSlotApi)
app.route('/api/select-slot',        selectSlotApi)
app.route('/api/create-reservation', createReservationApi)
app.route('/api/finalize',           finalizeApi)
app.route('/api/chat',               chatApi)
app.route('/api/change',             changeApi)

// ── Admin ─────────────────────────────────
app.route('/admin/login',   adminLoginApp)
app.route('/admin/slots',   adminSlotsApp)
app.route('/admin/booking', adminBookingApp)
app.route('/admin',         adminApp)

// ── Scheduled: expire pending proposals ──
// 提案の期限切れのみ処理。スロットやbookingには触らない。
async function expireProposals(env: Env): Promise<void> {
  const db = getDB(env)
  const now = new Date().toISOString()

  const { data: expired } = await db
    .from('booking_change_proposals')
    .select('id, booking_id')
    .eq('status', 'pending')
    .lt('expires_at', now)

  if (!expired || expired.length === 0) return

  for (const p of expired) {
    await db
      .from('booking_change_proposals')
      .update({ status: 'expired' })
      .eq('id', p.id)

    await db.from('chat_messages').insert({
      booking_id: p.booking_id,
      sender_type: 'system',
      message: '日程変更の提案が期限切れになりました。',
    })
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await expireProposals(env)
  },
}
