import { Hono } from 'hono'
import { Env, getDB } from '../lib/db'
import { isTokenValid } from '../lib/token'
import { Layout } from '../components/layout'
import { OptionForm } from '../components/option-form'

const app = new Hono<{ Bindings: Env }>()

// GET /mypage?token=xxx
app.get('/', async (c) => {
  const token = c.req.query('token')

  if (!token) {
    return c.html(
      <Layout title="マイページ｜ラバー試着体験予約">
        <div class="alert alert-error mt-6">
          リンクが無効です。メール内のリンクからアクセスしてください。
        </div>
      </Layout>,
      400
    )
  }

  const db = getDB(c.env)

  // Fetch booking + client by token
  const { data: booking, error } = await db
    .from('bookings')
    .select('*, clients(name, email)')
    .eq('access_token', token)
    .single()

  if (error || !booking) {
    return c.html(
      <Layout title="マイページ｜ラバー試着体験予約">
        <div class="alert alert-error mt-6">
          リンクが無効または存在しません。
        </div>
      </Layout>,
      404
    )
  }

  if (!isTokenValid(booking)) {
    return c.html(
      <Layout title="マイページ｜ラバー試着体験予約">
        <div class="alert alert-error mt-6">
          このリンクは有効期限切れです。管理者にお問い合わせください。
        </div>
      </Layout>,
      410
    )
  }

  // pending — 仮予約受付中
  if (booking.status === 'pending') {
    const { data: messages } = await db
      .from('chat_messages')
      .select('*')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: true })

    return c.html(
      <Layout title="仮予約受付中｜ラバー試着体験予約">
        <h1 class="mb-6">マイページ</h1>
        <PendingView booking={booking} />
        <MagicLinkBox url={`/mypage?token=${token}`} />
        <ChatSection bookingId={booking.id} token={token!} />
      </Layout>
    )
  }

  // confirmed / finalized — オプション選択フォーム（何度でも更新可）
  const { data: savedOptions } = await db
    .from('booking_options')
    .select('option_name')
    .eq('booking_id', booking.id)

  // option_name からキーに逆引き
  const { OPTIONS } = await import('../components/option-form')
  const selectedOptionKeys = (savedOptions ?? [])
    .map((o: any) => OPTIONS.find((opt) => opt.label === o.option_name)?.key)
    .filter(Boolean) as string[]

  const updated = c.req.query('updated') === '1'
  const notice = c.req.query('notice')

  // Fetch pending proposal
  const { data: proposal } = await db
    .from('booking_change_proposals')
    .select('*, available_slots!proposed_slot_id(start_at)')
    .eq('booking_id', booking.id)
    .eq('status', 'pending')
    .maybeSingle()

  const noticeMsg: Record<string, string> = {
    accepted: '日程変更を承諾しました。',
    rejected: '日程変更の提案を拒否しました。',
    proposal_expired: '回答期限が過ぎていたため、提案は期限切れになりました。',
    proposal_not_found: '提案が見つかりませんでした。',
    slot_taken: '提案されたスロットは既に埋まっていました。管理者に再度ご相談ください。',
  }

  return c.html(
    <Layout title="マイページ｜ラバー試着体験予約">
      <h1 class="mb-6">マイページ</h1>

      {notice && noticeMsg[notice] && (
        <div class={`alert ${notice === 'accepted' || notice === 'rejected' ? 'alert-success' : 'alert-warning'} mb-6`}>
          {noticeMsg[notice]}
        </div>
      )}

      {updated && (
        <div class="alert alert-success mb-6">✅ 内容を更新しました。</div>
      )}

      {booking.status === 'finalized' && !updated && !notice && (
        <div class="alert alert-success mb-6">✅ 予約が確定しています。内容はいつでも変更できます。</div>
      )}

      {booking.status === 'confirmed' && !proposal && (
        <div class="alert alert-info mb-6">
          オプションを選択して予約を確定してください。
        </div>
      )}

      {/* 予約者情報 */}
      <div class="card mb-6">
        <h2 class="mb-4">ご予約者情報</h2>
        <table style="width:100%;border-collapse:collapse">
          <tbody>
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 0;color:#6b7280;width:35%">お名前</td>
              <td style="padding:10px 0;font-weight:500">{booking.clients?.name}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#6b7280">メールアドレス</td>
              <td style="padding:10px 0">{booking.clients?.email}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* マイページリンク */}
      <MagicLinkBox url={`/mypage?token=${token}`} />

      {/* 日程変更提案 */}
      {proposal && (
        <ProposalNotice proposal={proposal} token={token!} />
      )}

      <OptionForm
        bookingId={booking.id}
        token={token}
        sessionStart={booking.session_start}
        sessionEnd={booking.session_end}
        currentNote={booking.note ?? ''}
        selectedOptionKeys={selectedOptionKeys}
      />

      <ChatSection bookingId={booking.id} token={token!} />
    </Layout>
  )
})

function ProposalNotice({ proposal, token }: { proposal: any; token: string }) {
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div class="card mb-6" style="border-left:4px solid #7c3aed">
      <h2 class="mb-4" style="color:#7c3aed">日程変更のご提案</h2>
      <p class="text-muted mb-4">カウンセラーより、セッション日程の変更提案があります。</p>

      <div style="background:#f5f3ff;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="font-size:13px;color:#6b7280;margin-bottom:4px">提案された新しい日時</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a">
          {fmtDate(proposal.available_slots.start_at)}
        </div>
      </div>

      {proposal.expires_at && (
        <div class="alert alert-warning mb-4" style="font-size:14px">
          回答期限：{fmtDate(proposal.expires_at)}
        </div>
      )}

      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <form method="post" action="/api/change/accept" style="margin:0">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="proposal_id" value={proposal.id} />
          <button
            type="submit"
            class="btn btn-primary"
            onclick="return confirm('この日程で変更を承諾しますか？')"
          >
            承諾する
          </button>
        </form>
        <form method="post" action="/api/change/reject" style="margin:0">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="proposal_id" value={proposal.id} />
          <button
            type="submit"
            class="btn btn-outline"
            style="color:#dc2626;border-color:#dc2626"
            onclick="return confirm('この日程変更の提案を拒否しますか？')"
          >
            拒否する
          </button>
        </form>
      </div>
    </div>
  )
}

function ChatSection({ bookingId, token }: { bookingId: string; token: string }) {
  return (
    <div class="card mt-6">
      <h2 class="mb-4">カウンセラーへのメッセージ</h2>
      <div
        id="chat-messages"
        style="min-height:160px;max-height:320px;overflow-y:auto;border:1.5px solid #e5e7eb;border-radius:10px;padding:16px;background:#f9fafb;margin-bottom:12px"
        hx-get={`/api/chat?booking_id=${bookingId}&token=${token}`}
        hx-trigger="load, every 5s"
        hx-swap="innerHTML"
      >
        <p style="color:#9ca3af;font-size:14px;text-align:center;padding:20px 0">読み込み中...</p>
      </div>
      <form
        hx-post="/api/chat/send"
        hx-target="#chat-messages"
        hx-swap="innerHTML"
        hx-on--after-request="this.reset()"
        style="display:flex;gap:8px"
      >
        <input type="hidden" name="booking_id" value={bookingId} />
        <input type="hidden" name="token" value={token} />
        <textarea
          name="message"
          placeholder="メッセージを入力..."
          required
          style="flex:1;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;font-family:inherit;resize:none;min-height:42px"
        ></textarea>
        <button
          type="submit"
          class="btn btn-primary btn-sm"
          style="align-self:flex-end;white-space:nowrap"
        >
          送信
        </button>
      </form>
    </div>
  )
}

function PendingView({ booking }: { booking: any }) {
  function fmt(iso: string) {
    return new Date(iso).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div>
      {/* ステータス */}
      <div class="card mb-4" style="border-left:4px solid #f59e0b">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:28px">⏳</span>
          <div>
            <div style="font-weight:700;font-size:18px;color:#92400e">仮予約受付中</div>
            <div class="text-muted">管理者が内容を確認しています。承認後にメールでご連絡します。</div>
          </div>
        </div>
      </div>

      {/* 予約情報 */}
      <div class="card">
        <h2 class="mb-4">ご予約内容</h2>
        <table style="width:100%;border-collapse:collapse">
          <tbody>
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:12px 0;color:#6b7280;width:35%">お名前</td>
              <td style="padding:12px 0;font-weight:500">{booking.clients?.name}</td>
            </tr>
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:12px 0;color:#6b7280">メールアドレス</td>
              <td style="padding:12px 0">{booking.clients?.email}</td>
            </tr>
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:12px 0;color:#6b7280">予約日時</td>
              <td style="padding:12px 0;font-weight:500">{fmt(booking.session_start)}</td>
            </tr>
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:12px 0;color:#6b7280">終了時刻</td>
              <td style="padding:12px 0">
                {new Date(booking.session_end).toLocaleString('ja-JP', {
                  timeZone: 'Asia/Tokyo',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
            </tr>
            {booking.note && (
              <tr>
                <td style="padding:12px 0;color:#6b7280">メッセージ</td>
                <td style="padding:12px 0;white-space:pre-wrap">{booking.note}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div class="alert alert-info mt-4">
        このページのURLをブックマークしておくと、承認状況をいつでも確認できます。
      </div>
    </div>
  )
}


function MagicLinkBox({ url }: { url: string }) {
  return (
    <div class="card mb-6" style="background:#eff6ff;border:1px solid #bfdbfe">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <h2 style="font-size:15px;margin:0">このページのリンク</h2>
        <button
          type="button"
          id="copy-link-btn"
          style="background:#2563eb;color:#fff;border:none;border-radius:5px;padding:2px 10px;font-size:11px;font-weight:700;cursor:pointer"
        >
          コピー
        </button>
      </div>
      <p style="font-size:13px;color:#6b7280;margin-bottom:6px">
        このリンクをブックマークまたはコピーしてお手元に保管してください。
      </p>
      <div id="mypage-link" style="font-size:13px;color:#2563eb;word-break:break-all">{url}</div>
      <script dangerouslySetInnerHTML={{ __html: `
        document.getElementById('copy-link-btn').addEventListener('click', function() {
          var link = location.href;
          navigator.clipboard.writeText(link).then(function() {
            var btn = document.getElementById('copy-link-btn');
            btn.textContent = 'OK!';
            setTimeout(function() { btn.textContent = 'コピー'; }, 1500);
          });
        });
      ` }} />
    </div>
  )
}

export default app
