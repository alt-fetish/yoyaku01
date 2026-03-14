import { Hono } from 'hono'
import { deleteCookie } from 'hono/cookie'
import { Env, getDB } from '../lib/db'
import { tokenExpiry } from '../lib/token'
import { getAdminUser } from './middleware'

const app = new Hono<{ Bindings: Env }>()

// ── Auth guard ────────────────────────────────────────────────────────────────
app.use('/*', async (c, next) => {
  const user = await getAdminUser(c)
  if (!user) return c.redirect('/admin/login?notice=unauthorized')
  return next()
})

// ── GET /admin — ダッシュボード ───────────────────────────────────────────────
app.get('/', async (c) => {
  const db = getDB(c.env)

  const { data: rows } = await db
    .from('bookings')
    .select('*, clients(name, email), booking_options(*)')
    .order('created_at', { ascending: false })
    .limit(200)

  const all = rows ?? []
  const pending   = all.filter((b: any) => b.status === 'pending')
  const confirmed = all.filter((b: any) => b.status === 'confirmed')
  const finalized = all.filter((b: any) => b.status === 'finalized')
  const rejected  = all.filter((b: any) => b.status === 'rejected')
  const cancelled = all.filter((b: any) => b.status === 'cancelled')

  // 未読チャット（最新メッセージがclientの予約）を特定
  const bookingIds = all.map((b: any) => b.id)
  const unreadChatSet = new Set<string>()
  if (bookingIds.length > 0) {
    const { data: chatMsgs } = await db
      .from('chat_messages')
      .select('booking_id, sender_type, created_at')
      .in('booking_id', bookingIds)
      .order('created_at', { ascending: false })
    const seen = new Set<string>()
    for (const msg of chatMsgs ?? []) {
      if (!seen.has(msg.booking_id)) {
        seen.add(msg.booking_id)
        if (msg.sender_type === 'client') unreadChatSet.add(msg.booking_id)
      }
    }
  }

  function fmtJST(iso: string) {
    return new Date(iso).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    })
  }

  const notice = c.req.query('notice')
  const noticeMsg: Record<string, string> = {
    confirmed: '✅ 承認しました。マジックリンクをクライアントに送付してください。',
    rejected:  '❌ 却下しました。',
  }

  return c.html(
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>管理画面 | ラバー試着体験予約</title>
        <style>{adminCSS}</style>
      </head>
      <body>
        <header class="adm-header">
          <span class="adm-title">管理画面 — ラバー試着体験予約</span>
          <div style="display:flex;align-items:center;gap:12px">
            <a href="/admin/list" class="btn-slots">📋 予約一覧</a>
            <a href="/admin/slots" class="btn-slots">📅 スロット管理</a>
            <form method="post" action="/admin/logout" style="margin:0">
              <button class="btn-logout">ログアウト</button>
            </form>
          </div>
        </header>

        <div class="adm-body">
          {notice && noticeMsg[notice] && (
            <div class="notice">{noticeMsg[notice]}</div>
          )}

          {/* ── 仮予約一覧 ──────────────────────── */}
          <Section title="仮予約" count={pending.length} badge="pending">
            {pending.length === 0
              ? <p class="empty">仮予約はありません</p>
              : pending.map((b: any) => (
                <BookingCard b={b} fmtJST={fmtJST} env={c.env} showActions hasUnreadChat={unreadChatSet.has(b.id)} />
              ))
            }
          </Section>

          {/* ── 承認済み（オプション待ち） ──────── */}
          <Section title="承認済み（オプション選択待ち）" count={confirmed.length} badge="confirmed">
            {confirmed.length === 0
              ? <p class="empty">承認済みの予約はありません</p>
              : confirmed.map((b: any) => (
                <BookingCard b={b} fmtJST={fmtJST} env={c.env} hasUnreadChat={unreadChatSet.has(b.id)} />
              ))
            }
          </Section>

          {/* ── 確定済み ────────────────────────── */}
          <Section title="確定済み（オプション選択済み）" count={finalized.length} badge="finalized">
            {finalized.length === 0
              ? <p class="empty">確定済みの予約はありません</p>
              : finalized.map((b: any) => (
                <BookingCard b={b} fmtJST={fmtJST} env={c.env} showOptions hasUnreadChat={unreadChatSet.has(b.id)} />
              ))
            }
          </Section>

          {/* ── 却下済み ────────────────────────── */}
          {rejected.length > 0 && (
            <Section title="却下済み" count={rejected.length} badge="rejected">
              {rejected.map((b: any) => (
                <BookingCard b={b} fmtJST={fmtJST} env={c.env} hasUnreadChat={unreadChatSet.has(b.id)} />
              ))}
            </Section>
          )}

          {/* ── キャンセル済み（提案期限切れ） ── */}
          {cancelled.length > 0 && (
            <Section title="キャンセル済み（提案期限切れ）" count={cancelled.length} badge="cancelled">
              {cancelled.map((b: any) => (
                <BookingCard b={b} fmtJST={fmtJST} env={c.env} hasUnreadChat={unreadChatSet.has(b.id)} />
              ))}
            </Section>
          )}
        </div>
        <script dangerouslySetInnerHTML={{ __html: `
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

// ── GET /admin/list — 確定予約一覧（簡易） ────────────────────────────────────
app.get('/list', async (c) => {
  const db = getDB(c.env)

  const { data: rows } = await db
    .from('bookings')
    .select('*, clients(name, email)')
    .eq('status', 'finalized')
    .order('session_start', { ascending: true })

  const bookings = rows ?? []

  // 未読チャット判定（最新メッセージがclient）
  const bIds = bookings.map((b: any) => b.id)
  const unreadSet = new Set<string>()
  const optUpdatedSet = new Set<string>()
  if (bIds.length > 0) {
    const { data: msgs } = await db
      .from('chat_messages')
      .select('booking_id, sender_type')
      .in('booking_id', bIds)
      .order('created_at', { ascending: false })
    const seen = new Set<string>()
    for (const m of msgs ?? []) {
      if (!seen.has(m.booking_id)) {
        seen.add(m.booking_id)
        if (m.sender_type === 'client') unreadSet.add(m.booking_id)
      }
    }
  }
  // オプション更新済み判定
  for (const b of bookings) {
    if (b.options_updated_at) optUpdatedSet.add(b.id)
  }

  function fmtJST(iso: string) {
    return new Date(iso).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    })
  }

  return c.html(
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>確定予約一覧 | 管理画面</title>
        <style dangerouslySetInnerHTML={{ __html: listCSS }} />
      </head>
      <body>
        <header class="adm-header">
          <div style="display:flex;align-items:center;gap:16px">
            <a href="/admin" class="back-link">← ダッシュボード</a>
            <span class="adm-title">確定予約一覧</span>
          </div>
          <span class="count-badge">{bookings.length}件</span>
        </header>

        <div class="list-body">
          {bookings.length === 0
            ? <p class="empty">確定済みの予約はありません</p>
            : bookings.map((b: any) => {
                const hasChat = unreadSet.has(b.id)
                const hasOpt = optUpdatedSet.has(b.id)
                return (
                  <a href={`/admin/booking/${b.id}`} class="list-row">
                    <div class="row-left">
                      <div class="row-name">{b.clients?.name}</div>
                      <div class="row-time">{fmtJST(b.session_start)}</div>
                    </div>
                    <div class="row-right">
                      {hasChat && <span class="tag tag-chat">Chat</span>}
                      {hasOpt && <span class="tag tag-opt">Option</span>}
                    </div>
                  </a>
                )
              })
          }
        </div>
      </body>
    </html>
  )
})

const listCSS = `
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
.count-badge {
  background: rgba(255,255,255,0.2); color: #fff;
  font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 999px;
}
.list-body { max-width: 700px; margin: 0 auto; padding: 24px 16px 60px; }
.empty { color: #9ca3af; font-size: 14px; text-align: center; padding: 40px 0; }
.list-row {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  padding: 14px 18px; margin-bottom: 8px;
  text-decoration: none; color: inherit;
  transition: box-shadow 0.15s;
}
.list-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.row-left { display: flex; flex-direction: column; gap: 2px; }
.row-name { font-size: 15px; font-weight: 700; }
.row-time { font-size: 13px; color: #1e3a5f; font-weight: 600; }
.row-right { display: flex; gap: 6px; flex-shrink: 0; }
.tag {
  font-size: 11px; font-weight: 700; padding: 3px 8px;
  border-radius: 999px; white-space: nowrap;
}
.tag-chat { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
.tag-opt { background: #fffbeb; color: #854d0e; border: 1px solid #fde047; }
`

// ── POST /admin/confirm ───────────────────────────────────────────────────────
app.post('/confirm', async (c) => {
  const body = await c.req.parseBody()
  const bookingId = String(body.booking_id ?? '').trim()
  if (!bookingId) return c.redirect('/admin')

  const db = getDB(c.env)

  const { data: booking } = await db
    .from('bookings')
    .select('*, clients(name, email)')
    .eq('id', bookingId)
    .eq('status', 'pending')
    .single()

  if (!booking) return c.redirect('/admin')

  // バッファ計算
  const sessionStart = new Date(booking.session_start)
  const sessionEnd   = new Date(booking.session_end)
  const startHourJST = parseInt(
    sessionStart.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false })
  )
  const bufferedStart = startHourJST === 10
    ? sessionStart
    : new Date(sessionStart.getTime() - 60 * 60 * 1000)
  const bufferedEnd   = new Date(sessionEnd.getTime() + 60 * 60 * 1000)

  // 既存トークンをそのまま使い、有効期限だけ承認時点から再計算
  const token  = booking.access_token
  const expiry = tokenExpiry(parseInt(c.env.TOKEN_EXPIRY_HOURS ?? '72'))
  const magicLink = `${c.env.MAGIC_LINK_BASE_URL}/mypage?token=${token}`

  await db.from('bookings').update({
    status:         'confirmed',
    buffered_start: bufferedStart.toISOString(),
    buffered_end:   bufferedEnd.toISOString(),
    token_expiry:   expiry,
    token_used:     false,
  }).eq('id', bookingId)

  return c.redirect('/admin?notice=confirmed')
})

// ── POST /admin/reject ────────────────────────────────────────────────────────
app.post('/reject', async (c) => {
  const body = await c.req.parseBody()
  const bookingId = String(body.booking_id ?? '').trim()
  if (!bookingId) return c.redirect('/admin')

  const db = getDB(c.env)
  await db.from('bookings').update({ status: 'rejected' }).eq('id', bookingId).eq('status', 'pending')
  return c.redirect('/admin?notice=rejected')
})

// ── POST /admin/logout ────────────────────────────────────────────────────────
app.post('/logout', (c) => {
  deleteCookie(c, 'admin_token', { path: '/' })
  return c.redirect('/admin/login')
})

// ── Components ────────────────────────────────────────────────────────────────

function Section({ title, count, badge, children }: any) {
  const colors: Record<string, string> = {
    pending:   '#f59e0b',
    confirmed: '#2563eb',
    finalized: '#16a34a',
    rejected:  '#6b7280',
    cancelled: '#ef4444',
  }
  return (
    <section class="adm-section">
      <div class="section-header">
        <h2>{title}</h2>
        <span class="badge" style={`background:${colors[badge] ?? '#6b7280'}`}>{count}件</span>
      </div>
      {children}
    </section>
  )
}

function BookingCard({ b, fmtJST, env, showActions, showOptions, hasUnreadChat }: any) {
  const magicLink = b.access_token
    ? `${env.MAGIC_LINK_BASE_URL}/mypage?token=${b.access_token}`
    : null

  return (
    <div class="booking-card">
      <div class="booking-main">
        <div class="booking-info">
          <div class="booking-name">{b.clients?.name}</div>
          <div class="booking-email">{b.clients?.email} <button type="button" class="btn-copy" data-copy={b.clients?.email}>コピー</button></div>
          <div class="booking-time">📅 {fmtJST(b.session_start)} 〜 {new Date(b.session_end).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}</div>
          {b.note && <div class="booking-note">💬 {b.note}</div>}
          <div class="booking-meta">申込：{fmtJST(b.created_at)}</div>
          <div style="margin-top:8px">
            <a href={`/admin/booking/${b.id}`} class={hasUnreadChat ? 'btn-detail btn-detail--unread' : 'btn-detail'}>
              {hasUnreadChat ? '● 詳細・チャット（未読）' : '詳細・チャット'}
            </a>
          </div>
        </div>

        {showActions && (
          <div class="booking-actions">
            <form method="post" action="/admin/confirm" style="margin:0">
              <input type="hidden" name="booking_id" value={b.id} />
              <button class="btn-approve" data-confirm="この予約を承認しますか？">承認する</button>
            </form>
            <form method="post" action="/admin/reject" style="margin:0">
              <input type="hidden" name="booking_id" value={b.id} />
              <button class="btn-reject" data-confirm="この予約を却下しますか？">却下する</button>
            </form>
          </div>
        )}
      </div>

      {/* マジックリンク */}
      {magicLink && (
        <div class="magic-link-box">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span class="label">マジックリンク</span>
            <button type="button" class="btn-copy" data-copy={magicLink}>コピー</button>
          </div>
          <a href={magicLink} target="_blank" class="magic-link">{magicLink}</a>
        </div>
      )}

      {/* 確定済み：オプション更新バッジ＋一覧 */}
      {showOptions && (
        <div class="options-box">
          {b.options_updated_at && (
            <div class="options-updated-badge">
              🔔 オプション更新されました（{fmtJST(b.options_updated_at)}）
            </div>
          )}
          {b.booking_options?.length > 0
            ? (
              <>
                <span class="label">選択済みオプション</span>
                <div class="options-list">
                  {b.booking_options.map((o: any) => (
                    <div class="option-row"><span>{o.option_name}</span></div>
                  ))}
                </div>
                {b.note && (
                  <div style="margin-top:10px">
                    <span class="label">メッセージ</span>
                    <div style="font-size:14px;color:#374151;margin-top:4px;white-space:pre-wrap">{b.note}</div>
                  </div>
                )}
              </>
            )
            : <span class="label" style="color:#9ca3af">オプション未選択</span>
          }
        </div>
      )}
    </div>
  )
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const adminCSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: sans-serif; background: #f1f5f9; color: #1a1a1a; min-height: 100vh; }

.adm-header {
  background: #1e3a5f; color: #fff;
  padding: 14px 24px;
  display: flex; align-items: center; justify-content: space-between;
}
.adm-title { font-size: 17px; font-weight: 700; }
.btn-logout {
  background: rgba(255,255,255,0.15); color: #fff;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer;
}
.btn-logout:hover { background: rgba(255,255,255,0.25); }
.btn-slots {
  background: rgba(255,255,255,0.15); color: #fff;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 6px; padding: 6px 14px; font-size: 13px;
  text-decoration: none; white-space: nowrap;
}
.btn-slots:hover { background: rgba(255,255,255,0.25); }

.adm-body { max-width: 860px; margin: 0 auto; padding: 28px 20px 60px; }

.notice {
  background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
  padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 15px;
}

.adm-section { margin-bottom: 40px; }
.section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.section-header h2 { font-size: 18px; font-weight: 700; }
.badge {
  color: #fff; font-size: 12px; font-weight: 700;
  padding: 3px 10px; border-radius: 999px;
}
.empty { color: #9ca3af; font-size: 14px; padding: 16px 0; }

.booking-card {
  background: #fff; border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  margin-bottom: 12px; overflow: hidden;
}
.booking-main { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 20px; gap: 16px; }
.booking-name { font-size: 17px; font-weight: 700; margin-bottom: 3px; }
.booking-email { color: #6b7280; font-size: 14px; margin-bottom: 8px; }
.booking-time { font-size: 14px; color: #1e3a5f; font-weight: 600; margin-bottom: 4px; }
.booking-note { font-size: 13px; color: #6b7280; font-style: italic; margin-bottom: 4px; }
.booking-meta { font-size: 12px; color: #9ca3af; margin-top: 6px; }

.booking-actions { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
.btn-approve {
  background: #16a34a; color: #fff;
  border: none; border-radius: 7px;
  padding: 9px 20px; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.btn-approve:hover { background: #15803d; }
.btn-reject {
  background: #fff; color: #dc2626;
  border: 1.5px solid #dc2626;
  border-radius: 7px; padding: 8px 20px; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.btn-reject:hover { background: #fef2f2; }

.magic-link-box {
  background: #eff6ff; border-top: 1px solid #bfdbfe;
  padding: 12px 20px; display: flex; flex-direction: column; gap: 4px;
}
.label { font-size: 12px; font-weight: 600; color: #6b7280; }
.magic-link { font-size: 13px; color: #2563eb; word-break: break-all; }
.btn-copy {
  background: #2563eb; color: #fff; border: none; border-radius: 5px;
  padding: 2px 10px; font-size: 11px; font-weight: 700; cursor: pointer;
}
.btn-copy:hover { background: #1d4ed8; }

.options-box {
  background: #f0fdf4; border-top: 1px solid #bbf7d0;
  padding: 12px 20px; display: flex; flex-direction: column; gap: 8px;
}
.options-updated-badge {
  background: #fef9c3; border: 1px solid #fde047;
  color: #854d0e; font-size: 13px; font-weight: 600;
  padding: 6px 12px; border-radius: 6px;
}
.options-list { display: flex; flex-direction: column; gap: 4px; }
.option-row { display: flex; gap: 16px; font-size: 14px; color: #374151; }
.option-total { font-size: 15px; color: #166534; margin-top: 6px; }

.btn-detail {
  display: inline-block; font-size: 12px; color: #2563eb; font-weight: 600;
  border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 6px;
  padding: 4px 12px; text-decoration: none;
}
.btn-detail:hover { background: #dbeafe; }
.btn-detail--unread {
  color: #dc2626; border-color: #fca5a5; background: #fef2f2;
}
.btn-detail--unread:hover { background: #fee2e2; }

@media (max-width: 600px) {
  .booking-main { flex-direction: column; }
  .booking-actions { flex-direction: row; }
}
`

export default app
