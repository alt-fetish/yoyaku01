import { Hono } from 'hono'
import { Env, getDB } from '../lib/db'
import { generateToken, tokenExpiry } from '../lib/token'
import { Layout } from '../components/layout'

const app = new Hono<{ Bindings: Env }>()

/** Session duration: 2 hours in ms */
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000

/**
 * POST /api/create-reservation
 * Body: slot_id, name, email, note
 * Creates Client (upsert by email) + Booking (status=pending).
 */
app.post('/', async (c) => {
  const body = await c.req.parseBody()
  const slotId = String(body.slot_id ?? '').trim()
  const name   = String(body.name   ?? '').trim()
  const email  = String(body.email  ?? '').trim().toLowerCase()
  const note   = String(body.note   ?? '').trim()

  // ── Validation ────────────────────────────
  const errors: string[] = []
  if (!slotId) errors.push('スロットが選択されていません。')
  if (!name)   errors.push('お名前を入力してください。')
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push('有効なメールアドレスを入力してください。')

  if (errors.length > 0) {
    return c.html(
      <Layout title="エラー｜ラバー試着体験予約">
        <div class="alert alert-error">
          {errors.map((e) => <p>{e}</p>)}
        </div>
        <a href="/reserve" class="btn btn-outline mt-4">戻る</a>
      </Layout>,
      400
    )
  }

  const db = getDB(c.env)

  // ── Blacklist check ───────────────────────
  const { data: blEntry } = await db
    .from('blacklist')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (blEntry) {
    return c.html(
      <Layout title="エラー｜ラバー試着体験予約">
        <div class="alert alert-error">
          このメールアドレスでは予約を受け付けることができません。
        </div>
      </Layout>,
      403
    )
  }

  // ── Fetch slot ────────────────────────────
  const { data: slot, error: slotErr } = await db
    .from('available_slots')
    .select('*')
    .eq('id', slotId)
    .eq('status', 'open')
    .single()

  if (slotErr || !slot) {
    return c.html(
      <Layout title="エラー｜ラバー試着体験予約">
        <div class="alert alert-error">
          選択された時間枠は現在利用できません。別の時間を選択してください。
        </div>
        <a href="/reserve" class="btn btn-outline mt-4">戻る</a>
      </Layout>,
      409
    )
  }

  // ── Check slot not already taken ─────────
  const { data: existing } = await db
    .from('bookings')
    .select('id')
    .eq('slot_id', slotId)
    .in('status', ['pending', 'confirmed', 'finalized'])
    .maybeSingle()

  if (existing) {
    return c.html(
      <Layout title="予約済み｜ラバー試着体験予約">
        <div class="alert alert-error">
          この時間枠はすでに予約されています。別の時間を選択してください。
        </div>
        <a href="/reserve" class="btn btn-outline mt-4">戻る</a>
      </Layout>,
      409
    )
  }

  // ── Upsert client ─────────────────────────
  const { data: client, error: clientErr } = await db
    .from('clients')
    .upsert({ name, email }, { onConflict: 'email', ignoreDuplicates: false })
    .select()
    .single()

  if (clientErr || !client) {
    console.error('client upsert error', clientErr)
    return c.html(
      <Layout title="エラー｜ラバー試着体験予約">
        <div class="alert alert-error">予約の保存に失敗しました。しばらく後でお試しください。</div>
      </Layout>,
      500
    )
  }

  // ── Compute session times ─────────────────
  const sessionStart = new Date(slot.start_at)
  const sessionEnd   = new Date(sessionStart.getTime() + SESSION_DURATION_MS)

  // ── Generate magic link token ─────────────
  const token  = generateToken()
  const expiry = tokenExpiry(parseInt(c.env.TOKEN_EXPIRY_HOURS ?? '72'))

  // ── Insert booking ────────────────────────
  const { error: bookingErr } = await db.from('bookings').insert({
    client_id:     client.id,
    slot_id:       slotId,
    status:        'pending',
    session_start: sessionStart.toISOString(),
    session_end:   sessionEnd.toISOString(),
    note:          note || null,
    access_token:  token,
    token_expiry:  expiry,
  })

  if (bookingErr) {
    console.error('booking insert error', bookingErr)
    return c.html(
      <Layout title="エラー｜ラバー試着体験予約">
        <div class="alert alert-error">予約の保存に失敗しました。しばらく後でお試しください。</div>
      </Layout>,
      500
    )
  }

  // HTMXのフルページ遷移でマイページへ
  c.header('HX-Redirect', `/mypage?token=${token}`)
  return c.body('', 200)
})

export default app
