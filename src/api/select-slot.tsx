import { Hono } from 'hono'
import { Env } from '../lib/db'

const app = new Hono<{ Bindings: Env }>()

/**
 * POST /api/select-slot
 * Called by HTMX when user clicks "この時間を選ぶ".
 * Returns the reservation form HTML with the selected slot pre-filled.
 */
app.post('/', async (c) => {
  const body = await c.req.parseBody()
  const slotId   = String(body.slot_id ?? '')
  const slotTime = String(body.slot_time ?? '')

  if (!slotId || !slotTime) {
    return c.html(<div class="alert alert-error">スロット情報が不正です。</div>)
  }

  const start = new Date(slotTime)
  const startLabel = start.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return c.html(
    <div class="card" id="reservation-form-container">
      <h2>お客様情報を入力</h2>

      <div class="alert alert-info mb-6">
        選択中：<strong>{startLabel}</strong>（2時間）
      </div>

      <form
        hx-post="/api/create-reservation"
        hx-target="body"
        hx-push-url="/reserve/complete"
        hx-swap="innerHTML"
      >
        <input type="hidden" name="slot_id" value={slotId} />

        <div class="form-group">
          <label for="name">お名前 *</label>
          <input type="text" id="name" name="name" required placeholder="山田 太郎" />
        </div>

        <div class="form-group">
          <label for="email">メールアドレス *</label>
          <input
            type="email"
            id="email"
            name="email"
            required
            placeholder="example@email.com"
          />
        </div>

        <div class="form-group">
          <label for="note">メッセージ（任意）</label>
          <textarea id="note" name="note" placeholder="ご要望・ご質問があればご記入ください" />
        </div>

        <button type="submit" class="btn btn-primary btn-block">
          仮予約を申し込む
        </button>
        <p class="text-muted text-center mt-4" style="font-size:13px">
          送信後、管理者が内容を確認します。承認されるとメールでご連絡します。
        </p>
      </form>
    </div>
  )
})

export default app
