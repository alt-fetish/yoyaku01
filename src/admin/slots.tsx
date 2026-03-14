import { Hono } from 'hono'
import { Env, getDB } from '../lib/db'
import { getAdminUser } from './middleware'

const app = new Hono<{ Bindings: Env }>()

app.use('/*', async (c, next) => {
  const user = await getAdminUser(c)
  if (!user) return c.redirect('/admin/login?notice=unauthorized')
  return next()
})

// ── GET /admin/slots ──────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const date = c.req.query('date') ?? ''
  const db = getDB(c.env)

  let slots: any[] = []
  let bookedSlotIds = new Set<string>()

  // 登録済み最終スロット日を取得
  const { data: maxRow } = await db
    .from('available_slots')
    .select('start_at')
    .order('start_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const maxDate = maxRow ? new Date(maxRow.start_at) : null
  const oneMonthLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const needsExtension = !maxDate || maxDate < oneMonthLater

  if (date) {
    const dayStart = new Date(`${date}T00:00:00+09:00`).toISOString()
    const dayEnd   = new Date(`${date}T23:59:59+09:00`).toISOString()

    const { data } = await db
      .from('available_slots')
      .select('*')
      .gte('start_at', dayStart)
      .lte('start_at', dayEnd)
      .order('start_at', { ascending: true })

    slots = data ?? []

    // 予約が入っているスロットIDを取得
    if (slots.length > 0) {
      const { data: bookings } = await db
        .from('bookings')
        .select('slot_id')
        .in('slot_id', slots.map((s) => s.id))
        .in('status', ['pending', 'confirmed', 'finalized'])
      bookedSlotIds = new Set((bookings ?? []).map((b: any) => b.slot_id))
    }
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
    })
  }

  const updated  = c.req.query('updated')  === '1'
  const extended = c.req.query('extended') === '1'

  function fmtDate(d: Date) {
    return d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' })
  }

  return c.html(
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>スロット管理 | ラバー試着体験予約</title>
        <style>{css}</style>
      </head>
      <body>
        <header class="adm-header">
          <div style="display:flex;align-items:center;gap:16px">
            <a href="/admin" class="back-link">← 予約管理</a>
            <span class="adm-title">スロット管理</span>
          </div>
          <form method="post" action="/admin/logout" style="margin:0">
            <button class="btn-logout">ログアウト</button>
          </form>
        </header>

        <div class="body">
          {updated && (
            <div class="notice">✅ スロットを更新しました。</div>
          )}
          {extended && (
            <div class="notice">✅ 2ヶ月分のスロットを追加登録しました。</div>
          )}

          {needsExtension && (
            <div class="alert-warn">
              <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
                <div style="flex:1">
                  <div style="font-weight:700;font-size:15px;margin-bottom:4px">
                    ⚠️ スロット残り1ヶ月を切っています
                  </div>
                  <div style="font-size:14px">
                    {maxDate
                      ? `現在の最終登録日：${fmtDate(maxDate)}`
                      : 'スロットが登録されていません'
                    }
                  </div>
                </div>
                <form method="post" action="/admin/slots/extend" style="margin:0">
                  <button
                    type="submit"
                    class="btn-extend"
                    onclick="return confirm('最終登録日の翌日から2ヶ月分のスロットを追加登録しますか？')"
                  >
                    📅 2ヶ月分追加登録
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* 日付選択 */}
          <div class="date-card">
            <form method="get" action="/admin/slots" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <label style="font-weight:600;font-size:15px">日付を選択</label>
              <input type="date" name="date" value={date} style="padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:15px" />
              <button type="submit" class="btn-search">表示</button>
            </form>
          </div>

          {/* スロット一覧 */}
          {date && slots.length === 0 && (
            <div class="empty">この日のスロットはありません。</div>
          )}

          {slots.length > 0 && (
            <>
              {(() => {
                const unbookedSlots = slots.filter((s: any) => !bookedSlotIds.has(s.id))
                const allBlocked = unbookedSlots.length > 0 && unbookedSlots.every((s: any) => s.status === 'blocked')
                return (
                  <div class="day-actions">
                    {allBlocked ? (
                      <form method="post" action="/admin/slots/unblock-day" style="margin:0">
                        <input type="hidden" name="date" value={date} />
                        <button
                          type="submit"
                          class="btn-unblock-all"
                          onclick="return confirm('この日のすべてのブロックを解除しますか？')"
                        >
                          ✅ この日のブロックをすべて解除
                        </button>
                      </form>
                    ) : (
                      <form method="post" action="/admin/slots/block-day" style="margin:0">
                        <input type="hidden" name="date" value={date} />
                        <button
                          type="submit"
                          class="btn-block-all"
                          onclick="return confirm('この日のすべての空きスロットをブロックしますか？')"
                        >
                          🚫 この日をすべてブロック
                        </button>
                      </form>
                    )}
                  </div>
                )
              })()}
            <div class="slot-grid">
              {slots.map((slot) => {
                const booked  = bookedSlotIds.has(slot.id)
                const blocked = slot.status === 'blocked'
                return (
                  <div class={`slot-card ${blocked ? 'is-blocked' : ''} ${booked ? 'is-booked' : ''}`}>
                    <div class="slot-time">{fmtTime(slot.start_at)}</div>
                    <div class="slot-status">
                      {booked
                        ? <span class="badge badge-booked">予約あり</span>
                        : blocked
                          ? <span class="badge badge-blocked">ブロック中</span>
                          : <span class="badge badge-open">空き</span>
                      }
                    </div>
                    {!booked && (
                      <form method="post" action="/admin/slots/toggle" style="margin:0">
                        <input type="hidden" name="slot_id" value={slot.id} />
                        <input type="hidden" name="date" value={date} />
                        <button
                          type="submit"
                          class={blocked ? 'btn-unblock' : 'btn-block'}
                        >
                          {blocked ? '解除する' : 'ブロック'}
                        </button>
                      </form>
                    )}
                  </div>
                )
              })}
            </div>
            </>
          )}
        </div>
      </body>
    </html>
  )
})

// ── POST /admin/slots/toggle ──────────────────────────────────────────────────
app.post('/toggle', async (c) => {
  const body   = await c.req.parseBody()
  const slotId = String(body.slot_id ?? '').trim()
  const date   = String(body.date   ?? '').trim()
  if (!slotId) return c.redirect('/admin/slots')

  const db = getDB(c.env)

  // 予約が入っているスロットは変更不可
  const { data: booking } = await db
    .from('bookings')
    .select('id')
    .eq('slot_id', slotId)
    .in('status', ['pending', 'confirmed', 'finalized'])
    .maybeSingle()

  if (booking) return c.redirect(`/admin/slots?date=${date}`)

  // 現在のステータスを取得して反転
  const { data: slot } = await db
    .from('available_slots')
    .select('status')
    .eq('id', slotId)
    .single()

  if (!slot) return c.redirect(`/admin/slots?date=${date}`)

  const newStatus = slot.status === 'open' ? 'blocked' : 'open'
  await db.from('available_slots').update({ status: newStatus }).eq('id', slotId)

  return c.redirect(`/admin/slots?date=${date}&updated=1`)
})

// ── POST /admin/slots/block-day ───────────────────────────────────────────────
app.post('/block-day', async (c) => {
  const body = await c.req.parseBody()
  const date = String(body.date ?? '').trim()
  if (!date) return c.redirect('/admin/slots')

  const db = getDB(c.env)

  const dayStart = new Date(`${date}T00:00:00+09:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59+09:00`).toISOString()

  // 予約が入っているスロットIDを除外してブロック
  const { data: allSlots } = await db
    .from('available_slots')
    .select('id')
    .gte('start_at', dayStart)
    .lte('start_at', dayEnd)

  if (allSlots && allSlots.length > 0) {
    const allIds = allSlots.map((s: any) => s.id)

    const { data: booked } = await db
      .from('bookings')
      .select('slot_id')
      .in('slot_id', allIds)
      .in('status', ['pending', 'confirmed', 'finalized'])

    const bookedIds = new Set((booked ?? []).map((b: any) => b.slot_id))
    const blockIds  = allIds.filter((id: string) => !bookedIds.has(id))

    if (blockIds.length > 0) {
      await db.from('available_slots').update({ status: 'blocked' }).in('id', blockIds)
    }
  }

  return c.redirect(`/admin/slots?date=${date}&updated=1`)
})

// ── POST /admin/slots/unblock-day ─────────────────────────────────────────────
app.post('/unblock-day', async (c) => {
  const body = await c.req.parseBody()
  const date = String(body.date ?? '').trim()
  if (!date) return c.redirect('/admin/slots')

  const db = getDB(c.env)

  const dayStart = new Date(`${date}T00:00:00+09:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59+09:00`).toISOString()

  await db
    .from('available_slots')
    .update({ status: 'open' })
    .gte('start_at', dayStart)
    .lte('start_at', dayEnd)
    .eq('status', 'blocked')

  return c.redirect(`/admin/slots?date=${date}&updated=1`)
})

// ── POST /admin/slots/extend ──────────────────────────────────────────────────
app.post('/extend', async (c) => {
  const db = getDB(c.env)

  // 最終スロット日を取得
  const { data: maxRow } = await db
    .from('available_slots')
    .select('start_at')
    .order('start_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 開始日 = maxDate の翌日（なければ今日）をJSTで
  let startJST: Date
  if (maxRow) {
    const last = new Date(maxRow.start_at)
    // JST の翌日0時
    const lastJST = new Date(last.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    lastJST.setDate(lastJST.getDate() + 1)
    lastJST.setHours(0, 0, 0, 0)
    startJST = lastJST
  } else {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    now.setHours(0, 0, 0, 0)
    startJST = now
  }

  // 2ヶ月後の終端（JST）
  const endJST = new Date(startJST)
  endJST.setMonth(endJST.getMonth() + 2)

  // スロット生成：月〜土（日曜=0を除く）、10:00〜21:00、1時間刻み
  const rows: { start_at: string; status: string }[] = []
  const cur = new Date(startJST)

  while (cur < endJST) {
    const dow = cur.getDay() // 0=Sun
    if (dow !== 0) {
      for (let h = 10; h <= 20; h++) {
        const slotJST = new Date(cur)
        slotJST.setHours(h, 0, 0, 0)
        // JST → UTC ISO string
        const utcMs = slotJST.getTime() - (9 * 60 * 60 * 1000)
        rows.push({ start_at: new Date(utcMs).toISOString(), status: 'open' })
      }
    }
    cur.setDate(cur.getDate() + 1)
  }

  if (rows.length > 0) {
    await db.from('available_slots').insert(rows)
  }

  return c.redirect('/admin/slots?extended=1')
})

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: sans-serif; background: #f1f5f9; color: #1a1a1a; min-height: 100vh; }

.adm-header {
  background: #1e3a5f; color: #fff;
  padding: 14px 24px;
  display: flex; align-items: center; justify-content: space-between;
}
.adm-title { font-size: 17px; font-weight: 700; }
.back-link { color: #93c5fd; font-size: 14px; text-decoration: none; }
.back-link:hover { color: #fff; }
.btn-logout {
  background: rgba(255,255,255,0.15); color: #fff;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer;
}

.body { max-width: 680px; margin: 0 auto; padding: 28px 20px 60px; }

.notice {
  background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
  padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 15px;
}
.empty { color: #9ca3af; padding: 24px 0; font-size: 15px; }

.alert-warn {
  background: #fffbeb; border: 1.5px solid #fcd34d; color: #78350f;
  padding: 16px 20px; border-radius: 10px; margin-bottom: 24px;
}
.btn-extend {
  background: #d97706; color: #fff; border: none;
  border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.btn-extend:hover { background: #b45309; }

.date-card {
  background: #fff; border-radius: 10px; padding: 20px 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 24px;
}
.btn-search {
  background: #1e3a5f; color: #fff; border: none;
  border-radius: 8px; padding: 9px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-search:hover { background: #1e40af; }

.day-actions { margin-bottom: 14px; }
.btn-block-all {
  background: #7c3aed; color: #fff; border: none;
  border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 700; cursor: pointer;
}
.btn-block-all:hover { background: #6d28d9; }
.btn-unblock-all {
  background: #059669; color: #fff; border: none;
  border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 700; cursor: pointer;
}
.btn-unblock-all:hover { background: #047857; }

.slot-grid { display: flex; flex-direction: column; gap: 10px; }

.slot-card {
  background: #fff; border-radius: 10px; padding: 14px 18px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  display: flex; align-items: center; gap: 16px;
}
.slot-card.is-blocked { background: #fafafa; opacity: 0.8; }
.slot-card.is-booked  { background: #f0fdf4; }

.slot-time { font-size: 20px; font-weight: 700; min-width: 60px; }
.slot-status { flex: 1; }

.badge { font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.badge-open    { background: #dbeafe; color: #1e40af; }
.badge-blocked { background: #fee2e2; color: #991b1b; }
.badge-booked  { background: #d1fae5; color: #065f46; }

.btn-block {
  background: #fff; color: #dc2626;
  border: 1.5px solid #dc2626; border-radius: 7px;
  padding: 7px 16px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.btn-block:hover { background: #fef2f2; }
.btn-unblock {
  background: #2563eb; color: #fff;
  border: none; border-radius: 7px;
  padding: 7px 16px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.btn-unblock:hover { background: #1d4ed8; }
`

export default app
