import { Hono } from 'hono'
import { Env, getDB } from '../lib/db'
import { isTokenValid } from '../lib/token'
import { Layout } from '../components/layout'
import { OPTIONS } from '../components/option-form'

const app = new Hono<{ Bindings: Env }>()

/**
 * POST /api/finalize
 * Body: booking_id, token, note?, vacuum_bed?, tight_bondage?, hug_touch?, crossdressing?
 * confirmed / finalized どちらのステータスからでも更新可能。
 */
app.post('/', async (c) => {
  const body = await c.req.parseBody()
  const bookingId = String(body.booking_id ?? '').trim()
  const token     = String(body.token      ?? '').trim()

  if (!bookingId || !token) {
    return c.html(
      <Layout title="エラー｜ラバー試着体験予約">
        <div class="alert alert-error">不正なリクエストです。</div>
      </Layout>,
      400
    )
  }

  const db = getDB(c.env)

  const { data: booking, error } = await db
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('access_token', token)
    .single()

  if (error || !booking || !isTokenValid(booking)) {
    return c.html(
      <Layout title="エラー｜ラバー試着体験予約">
        <div class="alert alert-error">
          リンクが無効または期限切れです。管理者にお問い合わせください。
        </div>
      </Layout>,
      403
    )
  }

  // ── オプション収集 ────────────────────────
  const selectedOptions = OPTIONS.filter((opt) => body[opt.key] === '1')
  const note = String(body.note ?? '').trim()

  // ── 既存オプションを削除して再登録（更新対応）──
  await db.from('booking_options').delete().eq('booking_id', bookingId)
  if (selectedOptions.length > 0) {
    await db.from('booking_options').insert(
      selectedOptions.map((opt) => ({
        booking_id:  bookingId,
        option_name: opt.label,
        quantity:    1,
        unit_price:  0,
        total_price: 0,
      }))
    )
  }

  // ── booking 更新 ──────────────────────────
  const { error: updateErr } = await db
    .from('bookings')
    .update({
      status:             'finalized',
      note:               note || null,
      finalized_at:       new Date().toISOString(),
      options_updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)

  if (updateErr) {
    console.error('finalize update error', updateErr)
    return c.html(
      <Layout title="エラー｜ラバー試着体験予約">
        <div class="alert alert-error">保存に失敗しました。管理者にお問い合わせください。</div>
      </Layout>,
      500
    )
  }

  // マイページに戻す（フォームが再表示され更新後の値が見える）
  return c.redirect(`/mypage?token=${token}&updated=1`)
})

export default app
