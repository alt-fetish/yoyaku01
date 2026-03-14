import { Hono } from 'hono'
import { Env, getDB } from '../lib/db'
import { getAdminUser } from './middleware'

const app = new Hono<{ Bindings: Env }>()

app.use('/*', async (c, next) => {
  const user = await getAdminUser(c)
  if (!user) return c.redirect('/admin/login?notice=unauthorized')
  return next()
})

function fmtJST(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDateJST(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── GET /admin/booking/:id ────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDB(c.env)

  const { data: booking } = await db
    .from('bookings')
    .select('*, clients(name, email)')
    .eq('id', id)
    .single()

  if (!booking) return c.redirect('/admin')

  // Fetch messages
  const { data: messages } = await db
    .from('chat_messages')
    .select('*')
    .eq('booking_id', id)
    .order('created_at', { ascending: true })

  // Fetch selected options
  const { data: bookingOptions } = await db
    .from('booking_options')
    .select('*')
    .eq('booking_id', id)

  // Fetch latest pending proposal
  const { data: proposal } = await db
    .from('booking_change_proposals')
    .select('*, available_slots!proposed_slot_id(start_at)')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const notice = c.req.query('notice')
  const noticeMsg: Record<string, string> = {
    chat_sent: 'メッセージを送信しました。',
    proposed: '日程変更の提案を送信しました。マジックリンクからクライアントに通知してください。',
    slot_locked: '選択したスロットはすでにロックされています。',
    already_pending: '既に保留中の提案があります。',
  }

  const statusLabel: Record<string, string> = {
    pending: '仮予約', confirmed: '承認済み', finalized: '確定', rejected: '却下', cancelled: 'キャンセル',
  }
  const statusColor: Record<string, string> = {
    pending: '#f59e0b', confirmed: '#2563eb', finalized: '#16a34a', rejected: '#6b7280', cancelled: '#ef4444',
  }

  const canPropose = ['confirmed', 'finalized'].includes(booking.status)
  const hasPendingProposal = proposal?.status === 'pending'

  return c.html(
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>予約詳細 | 管理画面</title>
        <script src="https://unpkg.com/htmx.org@2.0.4" defer />
        <style>{css}</style>
      </head>
      <body>
        <header class="adm-header">
          <div style="display:flex;align-items:center;gap:16px">
            <a href="/admin" class="back-link">← 予約一覧</a>
            <span class="adm-title">予約詳細</span>
          </div>
          <form method="post" action="/admin/logout" style="margin:0">
            <button class="btn-logout">ログアウト</button>
          </form>
        </header>

        <div class="body">
          {notice && noticeMsg[notice] && (
            <div class={`notice ${notice.includes('failed') ? 'notice-warn' : ''}`}>{noticeMsg[notice]}</div>
          )}

          {/* ── 予約情報 ── */}
          <section class="card">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
              <h2 style="margin:0">{booking.clients?.name}</h2>
              <span class="status-badge" style={`background:${statusColor[booking.status] ?? '#6b7280'}`}>
                {statusLabel[booking.status] ?? booking.status}
              </span>
            </div>
            <div class="info-row"><span class="label">メール</span><span>{booking.clients?.email} <button type="button" class="btn-copy" data-copy={booking.clients?.email}>コピー</button></span></div>
            <div class="info-row"><span class="label">日時</span><span>{fmtJST(booking.session_start)} 〜 {new Date(booking.session_end).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}</span></div>
            {booking.note && (
              <div class="info-row"><span class="label">メモ</span><span style="white-space:pre-wrap">{booking.note}</span></div>
            )}
            <div class="info-row"><span class="label">申込日</span><span>{fmtJST(booking.created_at)}</span></div>
            <div class="info-row" style="align-items:flex-start">
              <span class="label">オプション</span>
              <span>
                {bookingOptions && bookingOptions.length > 0
                  ? bookingOptions.map((o: any) => (
                    <div style="font-size:14px;color:#374151">{o.option_name}</div>
                  ))
                  : <span style="color:#9ca3af;font-size:14px">未選択</span>
                }
              </span>
            </div>
          </section>

          {/* ── マジックリンク ── */}
          {booking.access_token && ['confirmed', 'finalized'].includes(booking.status) && (() => {
            const ml = `${c.env.MAGIC_LINK_BASE_URL}/mypage?token=${booking.access_token}`
            return (
              <section class="card" style="background:#eff6ff;border:1px solid #bfdbfe">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <h3 style="margin:0">マジックリンク</h3>
                  <button type="button" class="btn-copy" data-copy={ml}>コピー</button>
                </div>
                <a href={ml} target="_blank" style="font-size:13px;color:#2563eb;word-break:break-all">{ml}</a>
              </section>
            )
          })()}

          {/* ── チャット ── */}
          <section class="card">
            <h3>チャット</h3>
            <div
              id="chat-messages"
              class="chat-box"
              hx-get={`/admin/booking/${id}/messages`}
              hx-trigger="load, every 5s"
              hx-swap="innerHTML"
            >
              <p style="color:#9ca3af;font-size:14px;text-align:center;padding:20px 0">読み込み中...</p>
            </div>
            <form method="post" action={`/admin/booking/${id}/chat`} class="chat-form">
              <textarea name="message" placeholder="メッセージを入力..." required class="chat-input"></textarea>
              <button type="submit" class="btn-send">送信</button>
            </form>
          </section>

          {/* ── 日程変更提案 ── */}
          {canPropose && (
            <section class="card">
              <h3>日程変更の提案</h3>

              {hasPendingProposal && proposal && (
                <div class="proposal-status pending">
                  <div style="font-weight:700;margin-bottom:6px">保留中の提案</div>
                  <div>提案日時: {fmtDateJST(proposal.available_slots.start_at)}</div>
                  {proposal.expires_at && (
                    <div>回答期限: {fmtJST(proposal.expires_at)}</div>
                  )}
                  <div style="font-size:12px;color:#9ca3af;margin-top:6px">クライアントの応答を待っています</div>
                </div>
              )}

              {!hasPendingProposal && (
                <>
                  <div style="margin-bottom:16px">
                    <label class="label" style="display:block;margin-bottom:6px">日付で空きスロットを検索</label>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                      <input
                        type="date"
                        id="slot-date"
                        name="slot-date"
                        style="padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px"
                      />
                      <button
                        class="btn-search"
                        hx-get={`/admin/booking/${id}/slot-search`}
                        hx-include="#slot-date"
                        hx-target="#slot-results"
                        hx-swap="innerHTML"
                      >
                        検索
                      </button>
                    </div>
                  </div>
                  <div id="slot-results"></div>

                  <div id="propose-form" style="display:none;margin-top:16px">
                    <form method="post" action={`/admin/booking/${id}/propose`}>
                      <input type="hidden" name="slot_id" id="selected-slot-id" value="" />
                      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:12px">
                        <div class="label">選択したスロット</div>
                        <div id="selected-slot-label" style="font-weight:700;font-size:15px;margin-top:4px"></div>
                      </div>
                      <div style="margin-bottom:12px">
                        <label class="label" style="display:block;margin-bottom:6px">回答期限</label>
                        <input type="datetime-local" name="expires_at" required
                          style="padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;width:100%" />
                      </div>
                      <button type="submit" class="btn-propose"
                        data-confirm="この日程でクライアントに提案しますか？">
                        この日程を提案する
                      </button>
                    </form>
                  </div>
                </>
              )}

              {/* 過去の提案履歴 */}
              {proposal && proposal.status !== 'pending' && (
                <div class={`proposal-status ${proposal.status}`} style="margin-top:12px">
                  <div style="font-weight:700;margin-bottom:4px">
                    {proposal.status === 'accepted' ? '承認済み' : proposal.status === 'rejected' ? '拒否済み' : '期限切れ'}
                  </div>
                  <div>提案日時: {fmtDateJST(proposal.available_slots.start_at)}</div>
                  {proposal.responded_at && (
                    <div>応答日時: {fmtJST(proposal.responded_at)}</div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Slot selection JS + confirm handler */}
        <script dangerouslySetInnerHTML={{ __html: `
          function scrollChat() {
            var el = document.getElementById('chat-messages');
            if (el) el.scrollTop = el.scrollHeight;
          }
          document.body.addEventListener('htmx:afterSettle', function(e) {
            if (e.detail.target && e.detail.target.id === 'chat-messages') scrollChat();
          });
          function selectSlot(btn) {
            var slotId = btn.getAttribute('data-slot-id');
            var slotLabel = btn.getAttribute('data-slot-label');
            document.getElementById('selected-slot-id').value = slotId;
            document.getElementById('selected-slot-label').textContent = slotLabel;
            document.getElementById('propose-form').style.display = 'block';
            document.querySelectorAll('[data-slot-id]').forEach(function(b) {
              b.style.background = '#2563eb';
            });
            btn.style.background = '#1d4ed8';
          }
          document.body.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-confirm]');
            if (btn && !confirm(btn.getAttribute('data-confirm'))) {
              e.preventDefault();
            }
            var copyBtn = e.target.closest('[data-copy]');
            if (copyBtn) {
              navigator.clipboard.writeText(copyBtn.getAttribute('data-copy')).then(function() {
                var orig = copyBtn.textContent;
                copyBtn.textContent = 'OK!';
                setTimeout(function() { copyBtn.textContent = orig; }, 1500);
              });
            }
          });
        ` }} />
      </body>
    </html>
  )
})

// ── GET /admin/booking/:id/messages ─────────────────────────────────────────
app.get('/:id/messages', async (c) => {
  const id = c.req.param('id')
  const db = getDB(c.env)

  const { data: messages } = await db
    .from('chat_messages')
    .select('*')
    .eq('booking_id', id)
    .order('created_at', { ascending: true })

  return c.html(renderAdminMessages(messages ?? []))
})

// ── POST /admin/booking/:id/chat ─────────────────────────────────────────────
app.post('/:id/chat', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const message = String(body.message ?? '').trim()

  if (!message) return c.redirect(`/admin/booking/${id}`)

  const db = getDB(c.env)
  await db.from('chat_messages').insert({
    booking_id: id,
    sender_type: 'admin',
    message,
  })

  return c.redirect(`/admin/booking/${id}?notice=chat_sent`)
})

// ── GET /admin/booking/:id/slot-search ───────────────────────────────────────
app.get('/:id/slot-search', async (c) => {
  const id = c.req.param('id')
  const date = c.req.query('slot-date') ?? c.req.query('date') ?? ''

  if (!date) {
    return c.html('<p style="color:#9ca3af;font-size:14px">日付を選択してください</p>')
  }

  const db = getDB(c.env)

  const dayStart = new Date(`${date}T00:00:00+09:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59+09:00`).toISOString()
  const cutoff   = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  // Fetch open slots for the date
  const { data: slots } = await db
    .from('available_slots')
    .select('*')
    .eq('status', 'open')
    .gte('start_at', dayStart)
    .lte('start_at', dayEnd)
    .gt('start_at', cutoff)
    .order('start_at', { ascending: true })

  if (!slots || slots.length === 0) {
    return c.html('<p style="color:#9ca3af;font-size:14px">この日の空きスロットはありません</p>')
  }

  // Exclude slots blocked by active bookings (same buffer logic as search-slot)
  const { data: activeBookings } = await db
    .from('bookings')
    .select('slot_id, session_start')
    .in('status', ['pending', 'confirmed', 'finalized'])
    .neq('id', id) // exclude current booking

  const blockedTimes = new Set<number>()
  const bookedSlotIds = new Set<string>()

  for (const b of activeBookings ?? []) {
    bookedSlotIds.add(b.slot_id)
    const start = new Date(b.session_start).getTime()
    const startHourJST = parseInt(
      new Date(b.session_start).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false,
      })
    )
    const ONE_HOUR = 60 * 60 * 1000
    if (startHourJST !== 10) blockedTimes.add(start - ONE_HOUR)
    blockedTimes.add(start + ONE_HOUR)
    blockedTimes.add(start + ONE_HOUR * 2)
  }

  const available = slots.filter((s) => {
    const t = new Date(s.start_at).getTime()
    return !bookedSlotIds.has(s.id) && !blockedTimes.has(t)
  })

  if (available.length === 0) {
    return c.html('<p style="color:#9ca3af;font-size:14px">この日の空きスロットはありません</p>')
  }

  const rows = available.map((s) => {
    const label = new Date(s.start_at).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      hour: '2-digit', minute: '2-digit',
    })
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:8px;margin-bottom:8px;background:#fff">
  <span style="font-size:14px;font-weight:600">${label}</span>
  <button type="button"
    data-slot-id="${s.id}"
    data-slot-label="${label}"
    onclick="selectSlot(this)"
    style="background:#2563eb;color:#fff;border:none;border-radius:7px;padding:6px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap"
  >選択</button>
</div>`
  }).join('')

  return c.html(rows)
})

// ── POST /admin/booking/:id/propose ──────────────────────────────────────────
app.post('/:id/propose', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const slotId = String(body.slot_id ?? '').trim()
  const expiresAtRaw = String(body.expires_at ?? '').trim()

  if (!slotId || !expiresAtRaw) return c.redirect(`/admin/booking/${id}`)

  const db = getDB(c.env)

  // Check no existing pending proposal
  const { data: existing } = await db
    .from('booking_change_proposals')
    .select('id')
    .eq('booking_id', id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return c.redirect(`/admin/booking/${id}?notice=already_pending`)

  // Check slot exists and is open
  const { data: slot } = await db
    .from('available_slots')
    .select('id, start_at, status')
    .eq('id', slotId)
    .single()

  if (!slot || slot.status !== 'open') {
    return c.redirect(`/admin/booking/${id}?notice=slot_locked`)
  }

  // Get booking + client for email
  const { data: booking } = await db
    .from('bookings')
    .select('*, clients(name, email)')
    .eq('id', id)
    .single()

  if (!booking) return c.redirect('/admin')

  const expiresAt = new Date(expiresAtRaw).toISOString()

  // Insert proposal
  const { data: proposal } = await db
    .from('booking_change_proposals')
    .insert({
      booking_id: id,
      proposed_slot_id: slotId,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (!proposal) return c.redirect(`/admin/booking/${id}`)

  // スロットはロックしない（受諾時に空き確認する）

  // System chat message
  const slotLabel = new Date(slot.start_at).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit',
  })
  await db.from('chat_messages').insert({
    booking_id: id,
    sender_type: 'system',
    message: `日程変更の提案がありました。新しい日時：${slotLabel}`,
  })

  return c.redirect(`/admin/booking/${id}?notice=proposed`)
})

// ── Chat message renderer (admin view) ───────────────────────────────────────
function renderAdminMessages(messages: any[]): string {
  if (messages.length === 0) {
    return '<p style="color:#9ca3af;font-size:14px;text-align:center;padding:20px 0">メッセージはありません</p>'
  }
  function esc(s: string) {
    return s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/\n/g, '<br>')
  }
  return messages.map((m) => {
    const time = new Date(m.created_at).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    if (m.sender_type === 'system') {
      return `<div style="text-align:center;margin:8px 0"><span style="font-size:12px;color:#9ca3af;background:#f3f4f6;padding:4px 12px;border-radius:999px">${esc(m.message)}</span></div>`
    }
    const isAdmin = m.sender_type === 'admin'
    const align = isAdmin ? 'flex-end' : 'flex-start'
    const bubble = isAdmin
      ? 'background:#1e3a5f;color:#fff;border-radius:16px 16px 4px 16px'
      : 'background:#fff;color:#1a1a1a;border-radius:16px 16px 16px 4px;border:1px solid #e5e7eb'
    const label = isAdmin ? 'カウンセラー（管理者）' : 'クライアント'
    return `<div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:12px">
  <div style="font-size:11px;color:#9ca3af;margin-bottom:3px">${label}</div>
  <div style="max-width:80%;padding:10px 14px;font-size:14px;${bubble}">${esc(m.message)}</div>
  <div style="font-size:11px;color:#9ca3af;margin-top:3px">${time}</div>
</div>`
  }).join('')
}

// ── CSS ───────────────────────────────────────────────────────────────────────
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

.body { max-width: 760px; margin: 0 auto; padding: 28px 20px 60px; }

.notice {
  background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
  padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 15px;
}
.notice-warn {
  background: #fffbeb; border-color: #fcd34d; color: #78350f;
}

.card {
  background: #fff; border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  padding: 20px 24px; margin-bottom: 20px;
}
h2 { font-size: 20px; font-weight: 700; }
h3 { font-size: 16px; font-weight: 700; margin-bottom: 14px; }

.status-badge {
  color: #fff; font-size: 12px; font-weight: 700;
  padding: 3px 10px; border-radius: 999px;
}
.info-row {
  display: flex; gap: 16px; padding: 8px 0;
  border-bottom: 1px solid #f3f4f6; font-size: 14px;
}
.info-row:last-child { border-bottom: none; }
.label { color: #6b7280; font-size: 12px; font-weight: 600; min-width: 72px; }

.chat-box {
  min-height: 200px; max-height: 360px; overflow-y: auto;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 16px; background: #f9fafb; margin-bottom: 12px;
}
.chat-form { display: flex; gap: 8px; }
.chat-input {
  flex: 1; padding: 10px 14px; border: 1.5px solid #d1d5db; border-radius: 8px;
  font-size: 14px; font-family: inherit; resize: none; min-height: 42px;
}
.chat-input:focus { outline: none; border-color: #2563eb; }
.btn-send {
  background: #1e3a5f; color: #fff; border: none;
  border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 700;
  cursor: pointer; white-space: nowrap; align-self: flex-end;
}
.btn-send:hover { background: #1e40af; }

.proposal-status {
  border-radius: 8px; padding: 12px 16px; font-size: 14px; margin-bottom: 12px;
}
.proposal-status.pending   { background: #fffbeb; border: 1px solid #fde68a; color: #78350f; }
.proposal-status.accepted  { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.proposal-status.rejected  { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.proposal-status.expired   { background: #f3f4f6; border: 1px solid #d1d5db; color: #6b7280; }

.btn-search {
  background: #1e3a5f; color: #fff; border: none;
  border-radius: 8px; padding: 9px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-search:hover { background: #1e40af; }

.btn-propose {
  background: #7c3aed; color: #fff; border: none;
  border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 700; cursor: pointer;
}
.btn-propose:hover { background: #6d28d9; }

.btn-copy {
  background: #2563eb; color: #fff; border: none; border-radius: 5px;
  padding: 2px 10px; font-size: 11px; font-weight: 700; cursor: pointer;
}
.btn-copy:hover { background: #1d4ed8; }
`

export default app
